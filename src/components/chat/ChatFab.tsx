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
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export default function ChatFab() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>("chat");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [textInput, setTextInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const playbackTimeRef = useRef<number>(0);
  const pendingStartRef = useRef(false);
  const setupTimeoutRef = useRef<number | null>(null);
  const lastUserTranscriptRef = useRef<string>("");
  const lastAssistantTranscriptRef = useRef<string>("");
  const liveUserBufferRef = useRef<string>("");
  const liveAssistantBufferRef = useRef<string>("");
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

    const wsUrl = `${GEMINI_WS_ENDPOINT}?key=${encodeURIComponent(geminiApiKey)}`;
    setVoiceConnected(false);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      void (async () => {
        let summary = "Could not fetch DB summary from Supabase.";
        try {
          summary = await Promise.race([
            buildVoiceDbSummary(),
            new Promise<string>((resolve) => {
              window.setTimeout(
                () => resolve("Could not fetch DB summary from Supabase."),
                1200,
              );
            }),
          ]);
        } catch {
          summary = "Could not fetch DB summary from Supabase.";
        }

        ws.send(
          JSON.stringify({
            setup: {
              model: "models/gemini-3.1-flash-live-preview",
              generationConfig: {
                responseModalities: ["AUDIO"],
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: {
                parts: [
                  {
                    text: `You are VoiceTrace voice agent. Reply briefly and conversationally. Use the business context below when user asks about sales, expenses, trends, or recommendations.\n\nVOICE_DB_CONTEXT:\n${summary}`,
                  },
                ],
              },
            },
          }),
        );

        if (setupTimeoutRef.current) {
          window.clearTimeout(setupTimeoutRef.current);
        }
        setupTimeoutRef.current = window.setTimeout(() => {
          if (!voiceConnected) {
            setStatus("Voice setup timed out. Please retry.");
            try {
              ws.close();
            } catch {
              // no-op
            }
          }
        }, 10000);
      })();
    };

    ws.onmessage = async (event) => {
      let rawPayload: string;

      if (typeof event.data === "string") {
        rawPayload = event.data;
      } else if (event.data instanceof Blob) {
        rawPayload = await event.data.text();
      } else if (event.data instanceof ArrayBuffer) {
        rawPayload = new TextDecoder().decode(event.data);
      } else {
        return;
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(rawPayload) as Record<string, unknown>;
      } catch {
        return;
      }

      if (data.setupComplete !== undefined) {
        setVoiceConnected(true);
        setStatus(null);
        if (setupTimeoutRef.current) {
          window.clearTimeout(setupTimeoutRef.current);
          setupTimeoutRef.current = null;
        }
        if (pendingStartRef.current) {
          pendingStartRef.current = false;
          void startAudioStream();
        }
        return;
      }

      const serverError =
        (data.error as { message?: string } | undefined)?.message ||
        (data.error as string | undefined);
      if (serverError) {
        setStatus(`Gemini Live error: ${serverError}`);
        return;
      }

      const maybeText = extractLiveText(data);
      const maybeAudio = extractLiveAudio(data);
      const turnComplete =
        (data.serverContent as { turnComplete?: boolean } | undefined)
          ?.turnComplete === true;

      if (maybeAudio) {
        playPcmChunk(maybeAudio.data, maybeAudio.sampleRate);
      }

      if (maybeText) {
        const isUserText = maybeText.kind === "input";
        const textValue = maybeText.text;

        if (isUserText) {
          liveUserBufferRef.current = mergeTranscript(
            liveUserBufferRef.current,
            textValue,
          );
        } else {
          liveAssistantBufferRef.current = mergeTranscript(
            liveAssistantBufferRef.current,
            textValue,
          );
        }
      }

      if (turnComplete) {
        await flushVoiceTurn();
      }
    };

    ws.onerror = () => {
      setStatus("Gemini Live connection error.");
      setVoiceConnected(false);
    };

    ws.onclose = (event) => {
      if (setupTimeoutRef.current) {
        window.clearTimeout(setupTimeoutRef.current);
        setupTimeoutRef.current = null;
      }
      if (!event.wasClean) {
        setStatus("Voice connection closed unexpectedly.");
      }
      setVoiceConnected(false);
    };
  }

  function closeVoiceSocket() {
    if (setupTimeoutRef.current) {
      window.clearTimeout(setupTimeoutRef.current);
      setupTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    stopAudioStream();
    liveUserBufferRef.current = "";
    liveAssistantBufferRef.current = "";
    setVoiceConnected(false);
  }

  function mergeTranscript(previous: string, incoming: string) {
    const next = incoming.trim();
    if (!next) return previous;
    if (!previous) return next;
    if (next.startsWith(previous)) return next;
    if (previous.endsWith(next)) return previous;
    return `${previous} ${next}`.replace(/\s+/g, " ").trim();
  }

  async function flushVoiceTurn() {
    if (!activeSessionId) return;

    const userText = liveUserBufferRef.current.trim();
    const assistantText = liveAssistantBufferRef.current.trim();

    if (userText && userText !== lastUserTranscriptRef.current) {
      lastUserTranscriptRef.current = userText;
      await persistMessage({
        session_id: activeSessionId,
        role: "user",
        mode: "voice",
        content: userText,
      });
    }

    if (assistantText && assistantText !== lastAssistantTranscriptRef.current) {
      lastAssistantTranscriptRef.current = assistantText;
      await persistMessage({
        session_id: activeSessionId,
        role: "assistant",
        mode: "voice",
        content: assistantText,
      });
    }

    liveUserBufferRef.current = "";
    liveAssistantBufferRef.current = "";
  }

  function extractLiveText(payload: Record<string, unknown>) {
    const outputTranscription =
      (payload.serverContent as { outputTranscription?: { text?: string } })
        ?.outputTranscription?.text ?? "";
    if (outputTranscription)
      return { kind: "output" as const, text: outputTranscription };

    const inputTranscription =
      (payload.serverContent as { inputTranscription?: { text?: string } })
        ?.inputTranscription?.text ?? "";
    if (inputTranscription)
      return { kind: "input" as const, text: inputTranscription };

    const directText =
      (
        payload.serverContent as {
          modelTurn?: { parts?: Array<{ text?: string }> };
        }
      )?.modelTurn?.parts
        ?.map((p) => p.text)
        .filter(Boolean)
        .join("\n") ?? "";
    if (directText) return { kind: "output" as const, text: directText };

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

    return candidateText
      ? { kind: "output" as const, text: candidateText }
      : null;
  }

  function extractLiveAudio(payload: Record<string, unknown>) {
    const parts =
      (
        payload.serverContent as {
          modelTurn?: {
            parts?: Array<{
              inlineData?: { data?: string; mimeType?: string };
            }>;
          };
        }
      )?.modelTurn?.parts ?? [];

    for (const part of parts) {
      const inlineData = part.inlineData;
      if (!inlineData?.data) continue;
      const mimeType = inlineData.mimeType || "audio/pcm;rate=24000";
      const match = mimeType.match(/rate=(\d+)/);
      const sampleRate = match ? Number(match[1]) : 24000;
      return { data: inlineData.data, sampleRate };
    }

    return null;
  }

  function decodeBase64ToInt16(base64: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
  }

  function playPcmChunk(base64Pcm: string, sampleRate: number) {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    const int16 = decodeBase64ToInt16(base64Pcm);
    if (!int16.length) return;

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i += 1) {
      float32[i] = Math.max(-1, Math.min(1, int16[i] / 32768));
    }

    const buffer = audioContext.createBuffer(1, float32.length, sampleRate);
    buffer.copyToChannel(float32, 0);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    const startAt = Math.max(
      audioContext.currentTime,
      playbackTimeRef.current || 0,
    );
    source.start(startAt);
    playbackTimeRef.current = startAt + buffer.duration;
  }

  function downsampleTo16k(input: Float32Array, inputRate: number) {
    const outputRate = 16000;
    if (inputRate === outputRate) return input;

    const ratio = inputRate / outputRate;
    const outputLength = Math.max(1, Math.round(input.length / ratio));
    const output = new Float32Array(outputLength);

    let outputIndex = 0;
    let inputIndex = 0;
    while (outputIndex < outputLength) {
      const nextInputIndex = Math.round((outputIndex + 1) * ratio);
      let sum = 0;
      let count = 0;
      for (let i = inputIndex; i < nextInputIndex && i < input.length; i += 1) {
        sum += input[i];
        count += 1;
      }
      output[outputIndex] = count > 0 ? sum / count : 0;
      outputIndex += 1;
      inputIndex = nextInputIndex;
    }
    return output;
  }

  function floatTo16BitPcmBytes(float32: Float32Array) {
    const bytes = new Uint8Array(float32.length * 2);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < float32.length; i += 1) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return bytes;
  }

  function bytesToBase64(bytes: Uint8Array) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
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

  async function startAudioStream() {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setStatus("Voice is not connected yet.");
      return;
    }

    if (isListening) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });

      mediaStreamRef.current = stream;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      const audioContext = audioContextRef.current;
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      playbackTimeRef.current = audioContext.currentTime;

      const source = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = source;
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        const input = event.inputBuffer.getChannelData(0);
        const monoChunk = new Float32Array(input.length);
        monoChunk.set(input);
        const downsampled = downsampleTo16k(monoChunk, audioContext.sampleRate);
        const pcmBytes = floatTo16BitPcmBytes(downsampled);
        const b64 = bytesToBase64(pcmBytes);

        ws.send(
          JSON.stringify({
            realtimeInput: {
              audio: {
                data: b64,
                mimeType: "audio/pcm;rate=16000",
              },
            },
          }),
        );
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsListening(true);
      setStatus(null);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Unknown audio error";
      setStatus(`Mic stream failed: ${msg}`);
      stopAudioStream();
    }
  }

  function stopAudioStream() {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }

    setIsListening(false);
  }

  function startListening() {
    if (!voiceConnected) {
      pendingStartRef.current = true;
      void connectVoiceMode();
      return;
    }

    void startAudioStream();
  }

  function stopListening() {
    stopAudioStream();
    setStatus(null);
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
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full border border-cyan-200/30 bg-linear-to-r from-cyan-500 to-teal-500 shadow-[0_12px_28px_rgba(6,182,212,0.35)] text-white flex items-center justify-center hover:scale-105 transition-transform"
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
                <option
                  key={session.id}
                  value={session.id}
                  className="bg-slate-900 text-cyan-50"
                >
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
                className="h-11 w-11 rounded-lg bg-linear-to-r from-cyan-500 to-teal-500 text-white flex items-center justify-center disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="p-3 border-t border-cyan-100/10 grid grid-cols-2 gap-2">
              <button
                onClick={startListening}
                disabled={isListening}
                className="h-11 rounded-lg bg-linear-to-r from-amber-400 to-orange-400 text-slate-900 font-semibold text-sm disabled:opacity-50"
              >
                {isListening
                  ? "Listening..."
                  : voiceConnected
                    ? "Start Voice"
                    : "Connect Voice"}
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
