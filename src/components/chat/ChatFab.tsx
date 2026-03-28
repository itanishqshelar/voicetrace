"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  MessageCircle,
  Mic,
  MicOff,
  Plus,
  Send,
  Sparkles,
  X,
  ChevronDown,
} from "lucide-react";
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

interface ChatDbMeta {
  connected: boolean;
  keyType: "service_role" | "anon" | "missing";
  salesCount: number;
  expensesCount: number;
  sessionMessagesCount: number;
  errors: string[];
}

/** Response shape from GET /api/chat/db-context?format=voice */
interface VoiceDbResponse {
  format: "voice";
  contextString: string;
  meta: {
    sales_records: number;
    expense_records: number;
    catalog_items: number;
    voice_log_count: number;
    errors: string[];
    key_type: "service_role" | "anon" | "missing";
  };
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

  /**
   * Generate a truncated title from the first user message.
   * Max 50 chars, cut at word boundary.
   */
  function generateSessionTitle(message: string, mode: ChatMode): string {
    const cleaned = message.trim();
    if (!cleaned) return mode === "voice" ? "Voice Session" : "New Chat";

    const maxLen = 50;
    if (cleaned.length <= maxLen) return cleaned;

    const truncated = cleaned.slice(0, maxLen);
    const lastSpace = truncated.lastIndexOf(" ");
    return lastSpace > 20
      ? truncated.slice(0, lastSpace) + "..."
      : truncated + "...";
  }

  /**
   * Update the session title in Supabase and local state.
   */
  async function updateSessionTitle(sessionId: string, title: string) {
    const { error } = await supabase
      .from("chat_sessions")
      .update({ title })
      .eq("id", sessionId);

    if (!error) {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, title } : s)),
      );
    }
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

    // Check if this is the first user message in the session
    const isFirstMessage =
      messages.filter((m) => m.role === "user").length === 0;

    await persistMessage({
      session_id: activeSessionId,
      role: "user",
      mode: "chat",
      content,
    });

    // Update session title with truncated first message
    if (isFirstMessage) {
      const title = generateSessionTitle(content, "chat");
      void updateSessionTitle(activeSessionId, title);
    }

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
        let summary =
          "Database context unavailable — please check your connection.";
        try {
          summary = await Promise.race([
            buildVoiceDbSummary(),
            new Promise<string>((resolve) => {
              window.setTimeout(
                () =>
                  resolve("Database context unavailable — request timed out."),
                5000,
              );
            }),
          ]);
        } catch {
          summary = "Database context unavailable — an error occurred.";
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
                    text: `You are VoiceTrace Voice Agent — a smart business intelligence assistant for Indian street food vendors. Reply concisely and conversationally (1–3 sentences unless the user asks for detail).

You have FULL access to the vendor's real database including:
• Every sale entry with item-level detail (name, qty, price, total)
• All expense records (rent, transport, raw materials, etc.)
• The complete item catalog with standard prices per unit
• Voice session history including any anomaly flags

RULES:
1. Always use exact numbers from the data — never guess or invent figures.
2. Use ₹ (Rupee symbol) for all currency.
3. For "today" questions, refer to today_summary in the data.
4. For past dates, refer to daily_breakdown.
5. For best-sellers, refer to top_sale_items.
6. For pricing questions, refer to the Item Catalog section.
7. If something isn't in the data, say so clearly.
8. Keep answers short and friendly — this is a voice interface.

${summary}`,
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

      // Check if this is the first user message in the session
      const isFirstMessage =
        messages.filter((m) => m.role === "user").length === 0;

      await persistMessage({
        session_id: activeSessionId,
        role: "user",
        mode: "voice",
        content: userText,
      });

      // Update session title with truncated first message
      if (isFirstMessage) {
        const title = generateSessionTitle(userText, "voice");
        void updateSessionTitle(activeSessionId, title);
      }
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

  /**
   * Fetches the full database context from the server-side API endpoint.
   * Returns a human-readable text block covering ALL tables:
   *   sales, expenses, item_catalog, voice_logs
   * This replaces the old client-side limited summary.
   */
  async function buildVoiceDbSummary(): Promise<string> {
    try {
      const res = await fetch("/api/chat/db-context?format=voice");
      if (!res.ok) {
        console.warn("[buildVoiceDbSummary] API returned", res.status);
        return "Database context unavailable — API error.";
      }
      const json = (await res.json()) as VoiceDbResponse & { error?: string };
      if (json.error || !json.contextString) {
        return json.error ?? "Database context unavailable.";
      }
      console.log(
        `[buildVoiceDbSummary] fetched context — ` +
          `sales=${json.meta?.sales_records ?? "?"}, ` +
          `expenses=${json.meta?.expense_records ?? "?"}, ` +
          `catalog=${json.meta?.catalog_items ?? "?"}, ` +
          `voice_logs=${json.meta?.voice_log_count ?? "?"}`,
      );
      return json.contextString;
    } catch (err) {
      console.error("[buildVoiceDbSummary] fetch failed:", err);
      return "Database context unavailable — network error.";
    }
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
      {/* ── FAB Button ─────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`
          fixed bottom-6 right-6 z-50 h-14 w-14 rounded-2xl
          bg-linear-to-br from-primary to-accent
          shadow-lg shadow-indigo-500/30
          text-white flex items-center justify-center
          hover:scale-105 hover:shadow-xl hover:shadow-indigo-500/35
          active:scale-95
          transition-all duration-200
        `}
        aria-label="Open AI chat"
      >
        {open ? (
          <X className="w-5 h-5" />
        ) : (
          <MessageCircle className="w-5 h-5" />
        )}
      </button>

      {/* ── Chat Panel ─────────────────────────────────────────── */}
      {open && (
        <div
          className="
            fixed z-50 bottom-24 right-4 sm:right-6
            w-[92vw] max-w-100 h-[72vh] max-h-160
            rounded-2xl flex flex-col overflow-hidden
            border border-slate-200/80
            bg-white/85 backdrop-blur-2xl
            shadow-2xl shadow-slate-900/12
            animate-slide-up-fade
          "
        >
          {/* Rainbow top border accent */}
          <div className="absolute inset-x-0 top-0 h-0.5 bg-linear-to-r from-primary via-accent to-primary rounded-t-2xl z-10" />

          {/* ── Header ─────────────────────────────────────────── */}
          <div className="relative px-4 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between gap-3 bg-white/70">
            <div className="flex items-center gap-2.5">
              {/* Bot avatar */}
              <div className="relative h-9 w-9 rounded-xl bg-linear-to-br from-primary to-accent flex items-center justify-center shadow-sm shadow-indigo-500/20 shrink-0">
                <Bot className="w-4 h-4 text-white" />
                {/* Live indicator */}
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 leading-tight">
                  VoiceTrace Assistant
                </p>
                <div className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-indigo-400" />
                  <p className="text-[11px] text-slate-400">
                    AI · Live business data
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={handleNewSession}
              className="
                inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg
                border border-slate-200 bg-slate-50 text-slate-600
                text-xs font-medium
                hover:bg-slate-100 hover:border-slate-300 hover:text-slate-800
                transition-all duration-150
              "
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          </div>

          {/* ── Mode Switcher + Session Picker ─────────────────── */}
          <div className="px-4 pt-3 pb-3 border-b border-slate-100 space-y-2.5 bg-slate-50/60">
            {/* Mode pills */}
            <div className="flex bg-slate-100/80 rounded-xl p-1 gap-1">
              <button
                onClick={() => setMode("chat")}
                className={`
                  flex-1 flex items-center justify-center gap-1.5
                  py-1.5 rounded-lg text-xs font-semibold
                  transition-all duration-200
                  ${
                    mode === "chat"
                      ? "bg-white text-indigo-600 shadow-sm shadow-slate-200 border border-slate-200/60"
                      : "text-slate-500 hover:text-slate-700"
                  }
                `}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Chat
              </button>
              <button
                onClick={() => setMode("voice")}
                className={`
                  flex-1 flex items-center justify-center gap-1.5
                  py-1.5 rounded-lg text-xs font-semibold
                  transition-all duration-200
                  ${
                    mode === "voice"
                      ? "bg-white text-amber-600 shadow-sm shadow-slate-200 border border-amber-100"
                      : "text-slate-500 hover:text-slate-700"
                  }
                `}
              >
                <Mic className="w-3.5 h-3.5" />
                Voice
              </button>
            </div>

            {/* Session select */}
            <div className="relative">
              <select
                value={activeSessionId ?? ""}
                onChange={(e) => setActiveSessionId(e.target.value || null)}
                className="
                  w-full appearance-none
                  bg-white border border-slate-200 rounded-xl
                  pl-3 pr-8 py-2
                  text-xs text-slate-600 font-medium
                  focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400
                  transition-all duration-150
                  cursor-pointer
                "
              >
                {sortedSessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title} · {session.mode}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* ── Messages ───────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center select-none">
                <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-indigo-50 to-sky-50 border border-indigo-100/60 flex items-center justify-center shadow-sm">
                  <Bot className="w-7 h-7 text-indigo-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-700">
                    Ask me anything
                  </p>
                  <p className="text-xs text-slate-400 max-w-55 leading-relaxed">
                    I have live access to all your sales, expenses, catalog, and
                    voice session data.
                  </p>
                </div>
                {/* Suggestion chips */}
                <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                  {[
                    "What did I sell today?",
                    "Show top items",
                    "Today's profit?",
                  ].map((chip) => (
                    <button
                      key={chip}
                      onClick={() => {
                        setTextInput(chip);
                        setMode("chat");
                      }}
                      className="px-2.5 py-1 rounded-full border border-indigo-100 bg-indigo-50/60 text-indigo-600 text-[11px] font-medium hover:bg-indigo-100 hover:border-indigo-200 transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex flex-col gap-1 ${
                    message.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`
                      max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed
                      ${
                        message.role === "user"
                          ? "bg-linear-to-br from-primary to-primary-light text-white rounded-2xl rounded-br-sm shadow-sm shadow-indigo-500/20"
                          : "bg-white border border-slate-200/80 text-slate-700 rounded-2xl rounded-bl-sm shadow-sm shadow-slate-100"
                      }
                    `}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 px-1 uppercase tracking-wider font-medium">
                    {message.mode}
                  </span>
                </div>
              ))
            )}

            {/* Typing indicator */}
            {loading && (
              <div className="flex items-start gap-2">
                <div className="bg-white border border-slate-200/80 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce animation-delay-150" />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce animation-delay-300" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Status Bar ─────────────────────────────────────── */}
          {status && (
            <div className="px-4 py-2 bg-amber-50 border-t border-amber-100 flex items-start gap-2">
              <span className="text-amber-500 text-xs mt-px shrink-0">⚠</span>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                {status}
              </p>
            </div>
          )}

          {/* ── Chat Input ─────────────────────────────────────── */}
          {mode === "chat" ? (
            <div className="p-3 border-t border-slate-100 flex items-end gap-2 bg-white/70">
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendText();
                  }
                }}
                placeholder="Ask anything… (Enter to send)"
                rows={1}
                className="
                  flex-1 resize-none min-h-10.5 max-h-28
                  rounded-xl border border-slate-200
                  bg-slate-50/80 px-3.5 py-2.5
                  text-sm text-slate-800 placeholder:text-slate-400
                  focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400
                  transition-all duration-150
                "
              />
              <button
                onClick={handleSendText}
                disabled={loading || !textInput.trim()}
                className="
                  h-10.5 w-10.5 rounded-xl shrink-0
                  bg-linear-to-br from-primary to-accent
                  text-white flex items-center justify-center
                  shadow-sm shadow-indigo-500/20
                  hover:shadow-md hover:shadow-indigo-500/30 hover:scale-105
                  disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none
                  transition-all duration-150
                "
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* ── Voice Controls ──────────────────────────────── */
            <div className="p-3 border-t border-slate-100 bg-white/70 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {/* Start / Listening */}
                <button
                  onClick={startListening}
                  disabled={isListening}
                  className={`
                    h-11 rounded-xl text-sm font-semibold
                    flex items-center justify-center gap-2
                    transition-all duration-200
                    ${
                      isListening
                        ? "bg-amber-50 border border-amber-200 text-amber-700 cursor-default"
                        : "bg-linear-to-br from-amber-400 to-orange-500 text-white shadow-sm shadow-amber-500/25 hover:shadow-md hover:shadow-amber-500/30 hover:scale-[1.02]"
                    }
                    disabled:opacity-80
                  `}
                >
                  {isListening ? (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                      </span>
                      Listening…
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" />
                      {voiceConnected ? "Start Voice" : "Connect Voice"}
                    </>
                  )}
                </button>

                {/* Stop */}
                <button
                  onClick={stopListening}
                  className="
                    h-11 rounded-xl text-sm font-semibold
                    flex items-center justify-center gap-2
                    border border-slate-200 bg-slate-50 text-slate-600
                    hover:bg-slate-100 hover:border-slate-300 hover:text-slate-800
                    transition-all duration-150
                  "
                >
                  <MicOff className="w-4 h-4" />
                  Stop
                </button>
              </div>

              {!voiceConnected && !status && (
                <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                  Connects to Gemini Live with full business context
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
