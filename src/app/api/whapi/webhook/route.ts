import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  detectHighlights,
  enrichHighlightsWithTime,
} from "@/lib/highlight-detection";

const VOICE_LOGS_TABLE = "voice_logs";
const STORAGE_BUCKET = "voice-recordings";
const SALES_TABLE = "sales";

type AnalyzedItem = {
  name: string;
  qty: number;
  price: number;
  total: number;
  type: "sale" | "expense";
  category?: string;
};

type AnalyzedData = {
  items: AnalyzedItem[];
  total_earnings: number;
  total_expenses?: number;
  date: string;
  needs_clarification?: boolean;
  clarification_message?: string;
};

type WordTimestamp = {
  word: string;
  start: number;
  end: number;
};

type WhapiMessage = {
  type?: string;
  from_me?: boolean;
  chat_id?: string;
  voice?: {
    id?: string;
  };
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function sanitizeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function buildWhapiLogId(mediaId: string, chatId?: string): string {
  const safeMedia = sanitizeIdPart(mediaId);
  const safeChat = sanitizeIdPart(chatId ?? "chat");
  return `whapi-${safeChat}-${safeMedia}`;
}

function getBaseUrl(request: NextRequest): string | null {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return null;
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

function mapContentTypeToExtension(contentType: string): string {
  if (contentType.includes("ogg")) return "ogg";
  if (contentType.includes("mpeg")) return "mp3";
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("aac")) return "aac";
  return "webm";
}

async function fetchVoiceMedia(mediaId: string, token: string) {
  const response = await fetch(`https://gate.whapi.cloud/media/${mediaId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Whapi media fetch failed: ${response.status}`);
  }

  const contentType =
    response.headers.get("content-type") ?? "application/octet-stream";
  const arrayBuffer = await response.arrayBuffer();
  return { contentType, arrayBuffer };
}

async function transcribeAudio(
  audioFile: File,
  groqApiKey: string,
): Promise<{ text: string; words: WordTimestamp[] }> {
  const formData = new FormData();
  formData.append("file", audioFile, audioFile.name);
  formData.append("model", "whisper-large-v3");
  formData.append("language", "hi");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "word");

  const response = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${groqApiKey}` },
      body: formData,
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Whisper transcription failed: ${details}`);
  }

  const result = await response.json();
  return {
    text: result.text ?? "",
    words: Array.isArray(result.words) ? result.words : [],
  };
}

async function analyzeTranscript(
  baseUrl: string,
  text: string,
): Promise<AnalyzedData | null> {
  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    return null;
  }

  const parsed = (await response.json()) as AnalyzedData & { error?: string };
  if ((parsed as { error?: string }).error) {
    return null;
  }

  return parsed;
}

async function uploadAudioToStorage(
  arrayBuffer: ArrayBuffer,
  contentType: string,
  logId: string,
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const ext = mapContentTypeToExtension(contentType);
  const storagePath = `${logId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    console.warn("[WhapiWebhook] Storage upload failed:", uploadError.message);
    return null;
  }

  const { data } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath);
  return data?.publicUrl ?? null;
}

async function insertVoiceLog(params: {
  id: string;
  transcript: string;
  highlights: ReturnType<typeof detectHighlights>;
  analyzedData: AnalyzedData | null;
  audioUrl: string | null;
}) {
  const supabase = getSupabase();
  if (!supabase) return;

  const { id, transcript, highlights, analyzedData, audioUrl } = params;

  const { error } = await supabase.from(VOICE_LOGS_TABLE).upsert({
    id,
    timestamp: new Date().toISOString(),
    transcript,
    highlights,
    analyzed_data: analyzedData,
    audio_url: audioUrl,
    saved: false,
    has_anomaly: analyzedData?.needs_clarification ?? false,
    anomaly_message: analyzedData?.clarification_message ?? "",
  });

  if (error) {
    throw new Error(`Failed to save voice log: ${error.message}`);
  }
}

async function voiceLogExists(id: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from(VOICE_LOGS_TABLE)
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.warn(
      "[WhapiWebhook] voice log existence check failed:",
      error.message,
    );
    return false;
  }

  return Boolean(data?.id);
}

async function insertDashboardSale(
  analyzedData: AnalyzedData | null,
): Promise<void> {
  if (
    !analyzedData ||
    !Array.isArray(analyzedData.items) ||
    analyzedData.items.length === 0
  ) {
    return;
  }

  const supabase = getSupabase();
  if (!supabase) return;

  const date = analyzedData.date || new Date().toISOString().split("T")[0];
  const total = Number(analyzedData.total_earnings ?? 0);

  const { error } = await supabase.from(SALES_TABLE).insert({
    date,
    items: analyzedData.items,
    total,
  });

  if (error) {
    throw new Error(
      `Failed to sync WhatsApp log to dashboard: ${error.message}`,
    );
  }
}

async function processVoiceMessage(
  msg: WhapiMessage,
  request: NextRequest,
): Promise<void> {
  const mediaId = msg.voice?.id;
  const chatId = msg.chat_id ?? "unknown-chat";

  if (!mediaId) {
    throw new Error("Voice message is missing media ID");
  }

  const whapiToken = process.env.WHAPI_TOKEN;
  if (!whapiToken) {
    throw new Error("WHAPI_TOKEN is not configured");
  }

  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const baseUrl = getBaseUrl(request);
  if (!baseUrl) {
    throw new Error("Cannot determine server base URL for analysis call");
  }

  const logId = buildWhapiLogId(mediaId, chatId);
  const alreadyProcessed = await voiceLogExists(logId);
  if (alreadyProcessed) {
    console.log(
      `[WhapiWebhook] Skipping duplicate media ${mediaId} (${logId})`,
    );
    return;
  }

  const { contentType, arrayBuffer } = await fetchVoiceMedia(
    mediaId,
    whapiToken,
  );

  const fileName = `${logId}.${mapContentTypeToExtension(contentType)}`;
  const audioFile = new File([arrayBuffer], fileName, { type: contentType });

  const { text, words } = await transcribeAudio(audioFile, groqApiKey);

  const rawHighlights = detectHighlights(text);
  const highlights =
    words.length > 0
      ? enrichHighlightsWithTime(rawHighlights, text, words)
      : rawHighlights;

  const analyzedData = await analyzeTranscript(baseUrl, text);
  const audioUrl = await uploadAudioToStorage(arrayBuffer, contentType, logId);

  await insertVoiceLog({
    id: logId,
    transcript: text,
    highlights,
    analyzedData,
    audioUrl,
  });

  await insertDashboardSale(analyzedData);

  console.log(
    `[WhapiWebhook] Logged voice message from ${chatId} as ${logId} and synced dashboard`,
  );
}

export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.WHAPI_WEBHOOK_SECRET;
    if (expectedSecret) {
      const authHeader = request.headers.get("authorization") ?? "";
      const providedSecret = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (providedSecret !== expectedSecret) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const payload = await request.json();
    const messages = Array.isArray(payload?.messages)
      ? (payload.messages as WhapiMessage[])
      : [];

    const voiceMessages = messages.filter(
      (msg) => msg.type === "voice" && !msg.from_me,
    );

    if (voiceMessages.length === 0) {
      return Response.json({ ok: true, processed: 0, skipped: true });
    }

    let processed = 0;

    for (const msg of voiceMessages) {
      try {
        await processVoiceMessage(msg, request);
        processed += 1;
      } catch (err) {
        console.error("[WhapiWebhook] Message processing failed:", err);
      }
    }

    return Response.json({
      ok: true,
      processed,
      received: voiceMessages.length,
    });
  } catch (err) {
    console.error("[WhapiWebhook] Invalid webhook payload:", err);
    return Response.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
}
