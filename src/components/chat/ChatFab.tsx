"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, MessageCircle, Mic, Plus, Send, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type ChatMode = "chat" | "voice";
type ChatRole = "user" | "assistant" | "system";

interface SessionRow {
  id: string;
  title: string;
  mode: ChatMode;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: ChatRole;
  mode: ChatMode;
  content: string;
  created_at: string;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SalesSummaryRow {
  date: string;
  total: number;
  items: Array<{ name?: string; total?: number; type?: string }>;
}

interface ExpenseSummaryRow {
  date: string;
  amount: number;
  category: string;
}

interface ChatDbMeta {
  connected: boolean;
  keyType: "service_role" | "anon" | "missing";
  salesCount: number;
  expensesCount: number;
  sessionMessagesCount: number;
  errors: string[];
}

const GEMINI_WS_ENDPOINT =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";

export default function ChatFab() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>("chat");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [textInput, setTextInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<string | null>(null);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceDbSummary, setVoiceDbSummary] = useState<string>(
    "DB summary unavailable.",
  );

  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const geminiApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [sessions],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    void loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    void loadMessages(activeSessionId);
  }, [activeSessionId]);

  useEffect(() => {
    if (!open || mode !== "voice") {
      closeVoiceSocket();
      return;
    }

    void connectVoiceMode();

    return () => {
      closeVoiceSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  async function loadSessions() {
    const { data, error } = await supabase
      .from("chat_sessions")
      .select("id, title, mode, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(20);

    if (error) {
      setStatus(
        "Could not load chat history. Run supabase/chat_migration.sql in Supabase SQL editor.",
      );
      return;
    }

    const sessionRows = (data ?? []) as SessionRow[];
    setSessions(sessionRows);

    if (sessionRows.length === 0) {
      const created = await createSession("chat");
      if (created) setActiveSessionId(created.id);
      return;
    }

    setActiveSessionId((prev) => prev ?? sessionRows[0].id);
  }

  async function createSession(nextMode: ChatMode) {
    const { data, error } = await supabase
      .from("chat_sessions")
      .insert({
        mode: nextMode,
        title: nextMode === "voice" ? "Voice Session" : "New Chat",
      })
      .select("id, title, mode, created_at, updated_at")
      .single();

    if (error) {
      setStatus("Unable to create chat session.");
      return null;
    }

    const newSession = data as SessionRow;
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setMessages([]);
    return newSession;
  }

  async function loadMessages(sessionId: string) {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, session_id, role, mode, content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      setStatus("Unable to load messages for the selected session.");
      return;
    }

    setMessages((data ?? []) as MessageRow[]);
  }

  async function persistMessage(payload: {
    session_id: string;
    role: ChatRole;
    mode: ChatMode;
    content: string;
  }) {
    const { data, error } = await supabase
      .from("chat_messages")
      .insert(payload)
      .select("id, session_id, role, mode, content, created_at")
      .single();

    if (error) {
      setStatus("Could not save message to history.");
      return null;
    }

    const row = data as MessageRow;
    setMessages((prev) => [...prev, row]);
    return row;
  }

  async function handleSendText() {
    if (!textInput.trim() || !activeSessionId || loading) return;

    const content = textInput.trim();
    setTextInput("");
    setLoading(true);
    setStatus(null);

    await persistMessage({
      session_id: activeSessionId,
      role: "user",
      mode: "chat",
      content,
    });

    try {
      const chatHistory = messages
        .filter((m) => m.mode === "chat")
        .slice(-10)
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }));

      const response = await fetch("/api/chat/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          history: chatHistory,
          sessionId: activeSessionId,
        }),
      });

      const data = (await response.json()) as {
        reply?: string;
        error?: string;
        dbMeta?: ChatDbMeta;
      };
      if (!response.ok || !data.reply) {
        throw new Error(data.error || "Failed to get chat response");
      }

      if (data.dbMeta) {
        const meta = data.dbMeta;
        const head = meta.connected ? "DB connected" : "DB degraded";
        const detail = `(${meta.keyType}) sales:${meta.salesCount} expenses:${meta.expensesCount} session:${meta.sessionMessagesCount}`;
        const errorSuffix = meta.errors.length ? ` | ${meta.errors[0]}` : "";
        setDbStatus(`${head} ${detail}${errorSuffix}`);
      }

      await persistMessage({
        session_id: activeSessionId,
        role: "assistant",
        mode: "chat",
        content: data.reply,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      setStatus(`Chat error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function connectVoiceMode() {
    if (!geminiApiKey) {
      setStatus(
        "Set NEXT_PUBLIC_GEMINI_API_KEY to enable Gemini Live voice mode.",
      );
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setVoiceConnected(true);
      return;
    }

    setStatus("Connecting to Gemini Live...");

    const ws = new WebSocket(`${GEMINI_WS_ENDPOINT}?key=${geminiApiKey}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setVoiceConnected(true);
      setStatus("Voice mode connected.");

      void (async () => {
        const summary = await buildVoiceDbSummary();
        setVoiceDbSummary(summary);

        ws.send(
          JSON.stringify({
            setup: {
              model: "models/gemini-2.0-flash-exp",
              generation_config: {
                response_modalities: ["TEXT"],
              },
              system_instruction: {
                parts: [
                  {
                    text: `You are VoiceTrace voice agent. Reply briefly and conversationally. Use the business context below when user asks about sales, expenses, trends, or recommendations.\n\nVOICE_DB_CONTEXT:\n${summary}`,
                  },
                ],
              },
            },
          }),
        );
      })();
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data as string) as Record<string, unknown>;
      const maybeText = extractLiveText(data);
      if (!maybeText) return;

      if (activeSessionId) {
        await persistMessage({
          session_id: activeSessionId,
          role: "assistant",
          mode: "voice",
          content: maybeText,
        });
      }

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(maybeText);
        utterance.lang = "en-IN";
        window.speechSynthesis.speak(utterance);
      }
    };

    ws.onerror = () => {
      setStatus("Gemini Live connection error.");
      setVoiceConnected(false);
    };

    ws.onclose = () => {
      setVoiceConnected(false);
    };
  }

  function closeVoiceSocket() {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setVoiceConnected(false);
    stopListening();
  }

  function extractLiveText(payload: Record<string, unknown>) {
    const directText =
      (
        payload.serverContent as {
          modelTurn?: { parts?: Array<{ text?: string }> };
        }
      )?.modelTurn?.parts
        ?.map((p) => p.text)
        .filter(Boolean)
        .join("\n") ?? "";
    if (directText) return directText;

    const candidateText =
      (
        payload.candidates as
        | Array<{ content?: { parts?: Array<{ text?: string }> } }>
        | undefined
      )
        ?.flatMap((c) => c.content?.parts ?? [])
        .map((p) => p.text)
        .filter(Boolean)
        .join("\n") ?? "";

    return candidateText || null;
  }

  async function buildVoiceDbSummary() {
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - 30);
    const fromDate = from.toISOString().slice(0, 10);

    const salesPromise = supabase
      .from("sales")
      .select("date, total, items")
      .gte("date", fromDate)
      .order("date", { ascending: false })
      .limit(40);

    const expensesPromise = supabase
      .from("expenses")
      .select("date, amount, category")
      .gte("date", fromDate)
      .order("date", { ascending: false })
      .limit(40);

    const [salesRes, expensesRes] = await Promise.all([
      salesPromise,
      expensesPromise,
    ]);
    const sales = (salesRes.data ?? []) as SalesSummaryRow[];
    const expenses = (expensesRes.data ?? []) as ExpenseSummaryRow[];

    if (salesRes.error || expensesRes.error) {
      return "Could not fetch DB summary from Supabase.";
    }

    const totalSales = sales.reduce(
      (sum, s) => sum + (Number(s.total) || 0),
      0,
    );
    const totalExpenses = expenses.reduce(
      (sum, e) => sum + (Number(e.amount) || 0),
      0,
    );

    const topItemsMap: Record<string, number> = {};
    for (const sale of sales) {
      for (const item of sale.items ?? []) {
        if (item.type !== "sale") continue;
        const name = (item.name || "Unknown").trim();
        topItemsMap[name] =
          (topItemsMap[name] || 0) + (Number(item.total) || 0);
      }
    }

    const topItems = Object.entries(topItemsMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, amount]) => `${name}: ₹${amount}`)
      .join(", ");

    const latestSaleDate = sales[0]?.date ?? "n/a";
    const latestExpenseDate = expenses[0]?.date ?? "n/a";

    return [
      `Window: last 30 days`,
      `Total sales: ₹${totalSales}`,
      `Total expenses: ₹${totalExpenses}`,
      `Net: ₹${totalSales - totalExpenses}`,
      `Top sale items: ${topItems || "n/a"}`,
      `Latest sale date: ${latestSaleDate}`,
      `Latest expense date: ${latestExpenseDate}`,
    ].join("\n");
  }

  function startListening() {
    const win = window as Window & {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const SpeechRecognitionImpl =
      win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognitionImpl) {
      setStatus("Speech recognition is not available in this browser.");
      return;
    }

    const recognition = new SpeechRecognitionImpl();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setStatus("Listening...");
    };

    recognition.onerror = () => {
      setStatus("Voice capture failed. Please try again.");
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onresult = async (event: SpeechRecognitionEventLike) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript || !activeSessionId) return;

      let liveDbSummary = voiceDbSummary;
      if (!liveDbSummary || liveDbSummary.includes("unavailable")) {
        liveDbSummary = await buildVoiceDbSummary();
        setVoiceDbSummary(liveDbSummary);
      }

      await persistMessage({
        session_id: activeSessionId,
        role: "user",
        mode: "voice",
        content: transcript,
      });

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        setStatus("Voice socket is not connected.");
        return;
      }

      wsRef.current.send(
        JSON.stringify({
          client_content: {
            turns: [
              {
                role: "user",
                parts: [
                  {
                    text: `DB summary:\n${liveDbSummary}\n\nUser voice query: ${transcript}`,
                  },
                ],
              },
            ],
            turn_complete: true,
          },
        }),
      );

      setStatus("Generating voice reply...");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  function stopListening() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }

  async function handleNewSession() {
    const created = await createSession(mode);
    if (!created) return;
    setStatus(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full border border-cyan-200/30 bg-linear-to-r from-cyan-500 to-indigo-500 shadow-[0_12px_28px_rgba(6,182,212,0.35)] text-white flex items-center justify-center hover:scale-105 transition-transform"
        aria-label="Open AI chat"
      >
        {open ? (
          <X className="w-6 h-6" />
        ) : (
          <MessageCircle className="w-6 h-6" />
        )}
      </button>

      {open ? (
        <div className="fixed z-50 bottom-24 right-4 sm:right-6 w-[92vw] max-w-md h-[70vh] rounded-2xl border border-cyan-200/20 bg-[#050d1f]/95 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-cyan-100/15 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="h-8 w-8 rounded-lg bg-cyan-400/20 border border-cyan-200/30 flex items-center justify-center">
                <Bot className="w-4 h-4 text-cyan-100" />
              </span>
              <div>
                <p className="text-sm font-semibold text-cyan-50">
                  VoiceTrace Assistant
                </p>
                <p className="text-[11px] text-cyan-100/60">
                  Chat + Gemini Live Voice
                </p>
              </div>
            </div>

            <button
              onClick={handleNewSession}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-cyan-200/25 bg-cyan-300/10 text-cyan-50 text-xs hover:bg-cyan-300/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          </div>

          <div className="px-4 pt-3 pb-2 border-b border-cyan-100/10 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode("chat")}
                className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${mode === "chat"
                    ? "bg-cyan-300/20 border-cyan-200/35 text-cyan-50"
                    : "bg-white/5 border-white/10 text-cyan-100/70"
                  }`}
              >
                Normal Chat
              </button>
              <button
                onClick={() => setMode("voice")}
                className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${mode === "voice"
                    ? "bg-amber-300/20 border-amber-200/35 text-amber-50"
                    : "bg-white/5 border-white/10 text-cyan-100/70"
                  }`}
              >
                Voice Mode
              </button>
            </div>

            <select
              value={activeSessionId ?? ""}
              onChange={(e) => setActiveSessionId(e.target.value || null)}
              className="w-full bg-slate-900/80 border border-cyan-100/20 rounded-lg px-2.5 py-2 text-xs text-cyan-50 focus:outline-none focus:border-cyan-400"
            >
              {sortedSessions.map((session) => (
                <option key={session.id} value={session.id} className="bg-slate-900 text-cyan-50">
                  {session.title} · {session.mode}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 ? (
              <p className="text-xs text-cyan-100/55">
                Start a conversation. All messages are saved in Supabase
                history.
              </p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-xl px-3 py-2 text-sm ${message.role === "user"
                      ? "bg-cyan-400/18 border border-cyan-200/20 text-cyan-50 ml-8"
                      : "bg-white/8 border border-white/10 text-cyan-100 mr-8"
                    }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {message.content}
                  </p>
                  <p className="mt-1 text-[10px] text-cyan-100/40 uppercase tracking-wide">
                    {message.mode}
                  </p>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {status ? (
            <p className="px-4 pb-2 text-[11px] text-amber-100/80">{status}</p>
          ) : null}

          {dbStatus ? (
            <p className="px-4 pb-2 text-[11px] text-cyan-100/70">{dbStatus}</p>
          ) : null}

          {mode === "chat" ? (
            <div className="p-3 border-t border-cyan-100/10 flex items-end gap-2">
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Ask anything..."
                className="flex-1 resize-none h-11 rounded-lg border border-cyan-100/20 bg-white/5 px-3 py-2 text-sm text-cyan-50 placeholder:text-cyan-100/40"
              />
              <button
                onClick={handleSendText}
                disabled={loading || !textInput.trim()}
                className="h-11 w-11 rounded-lg bg-linear-to-r from-cyan-500 to-indigo-500 text-white flex items-center justify-center disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="p-3 border-t border-cyan-100/10 grid grid-cols-2 gap-2">
              <button
                onClick={startListening}
                disabled={!voiceConnected || isListening}
                className="h-11 rounded-lg bg-linear-to-r from-amber-400 to-orange-400 text-slate-900 font-semibold text-sm disabled:opacity-50"
              >
                {isListening ? "Listening..." : "Start Voice"}
              </button>
              <button
                onClick={stopListening}
                className="h-11 rounded-lg border border-cyan-100/25 bg-white/6 text-cyan-50 font-semibold text-sm"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Mic className="w-4 h-4" />
                  Stop
                </span>
              </button>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
