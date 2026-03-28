/**
 * voice-logs.ts
 *
 * Client-side localStorage utility for persisting voice session history.
 * Each time a user records audio, a VoiceLog entry is created and updated
 * as the session progresses (transcription → analysis → save).
 *
 * Anomaly flag logic:
 *   hasAnomaly = true  → AI detected a price mismatch / clarification needed
 *   saved = false      → user never tapped "Save to Dashboard"
 *   ⟹ isFlagged = hasAnomaly && !saved  (shown in Logs page)
 *
 * Supabase sync:
 *   Every write to localStorage is mirrored to Supabase via the
 *   /api/voice-logs route (fire-and-forget). If Supabase is not configured
 *   the API route returns early and localStorage remains the sole store.
 */

import { TextHighlight } from "./highlight-detection";

// ── Types ────────────────────────────────────────────────────────────────────

export interface LoggedSaleItem {
  name: string;
  qty: number;
  price: number;
  total: number;
  type: "sale" | "expense";
  category?: string;
}

export interface LoggedAnalysis {
  items: LoggedSaleItem[];
  total_earnings: number;
  total_expenses?: number;
  date: string;
  needs_clarification?: boolean;
  clarification_message?: string;
}

export interface VoiceLog {
  /** Unique ID generated at the start of each session */
  id: string;
  /** ISO-8601 timestamp of when recording was completed */
  timestamp: string;
  /** Raw transcript text from Groq Whisper */
  transcript: string;
  /** Business-critical phrases detected in the transcript */
  highlights: TextHighlight[];
  /** Structured data returned by the AI analysis step (null until analysis completes) */
  analyzedData: LoggedAnalysis | null;
  /** Supabase Storage public URL for the original audio recording (set after upload) */
  audioUrl?: string;
  /** Whether the entry was saved to the Dashboard / Supabase sales table */
  saved: boolean;
  /** True when AI flagged a price mismatch / clarification required */
  hasAnomaly: boolean;
  /** Human-readable anomaly message from AI (may be multi-line) */
  anomalyMessage: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const LOGS_KEY = "voicetrace_voice_logs";
/** Maximum number of logs to keep in localStorage */
const MAX_LOGS = 100;

// ── localStorage helpers ─────────────────────────────────────────────────────

function isClient(): boolean {
  return typeof window !== "undefined";
}

function readFromStorage(): VoiceLog[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(LOGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeToStorage(logs: VoiceLog[]): void {
  if (!isClient()) return;
  try {
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
  } catch {
    // Storage quota exceeded or unavailable — fail silently
  }
}

// ── Supabase sync helpers (fire-and-forget) ──────────────────────────────────
//
// These functions call the /api/voice-logs Next.js route which handles
// Supabase writes server-side. They never throw — errors are swallowed
// so localStorage remains the reliable source of truth.

function syncLogToSupabase(log: VoiceLog): void {
  if (!isClient()) return;
  fetch("/api/voice-logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ log }),
  }).catch(() => {
    /* intentionally silent */
  });
}

function patchLogInSupabase(id: string, patch: Partial<VoiceLog>): void {
  if (!isClient()) return;
  fetch("/api/voice-logs", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, patch }),
  }).catch(() => {
    /* intentionally silent */
  });
}

function deleteLogInSupabase(id: string): void {
  if (!isClient()) return;
  fetch(`/api/voice-logs?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  }).catch(() => {
    /* intentionally silent */
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Return all stored voice logs from localStorage, newest first.
 */
export function getVoiceLogs(): VoiceLog[] {
  return readFromStorage();
}

/**
 * Add a new voice log entry.
 * Writes to localStorage immediately, then mirrors to Supabase async.
 */
export function addVoiceLog(entry: VoiceLog): void {
  const logs = readFromStorage();
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }
  writeToStorage(logs);
  syncLogToSupabase(entry);
}

/**
 * Merge a partial patch into an existing log entry by ID.
 * Writes to localStorage immediately, then mirrors to Supabase async.
 * No-ops silently if the ID is not found.
 */
export function updateVoiceLog(id: string, patch: Partial<VoiceLog>): void {
  const logs = readFromStorage();
  const idx = logs.findIndex((l) => l.id === id);
  if (idx === -1) return;
  logs[idx] = { ...logs[idx], ...patch };
  writeToStorage(logs);
  patchLogInSupabase(id, patch);
}

/**
 * Remove a single log entry by ID.
 * Writes to localStorage immediately, then mirrors deletion to Supabase async.
 */
export function deleteVoiceLog(id: string): void {
  const logs = readFromStorage().filter((l) => l.id !== id);
  writeToStorage(logs);
  deleteLogInSupabase(id);
}

/**
 * Wipe all stored voice logs from localStorage.
 * Note: does NOT bulk-delete from Supabase (individual deletes are used in the UI).
 */
export function clearVoiceLogs(): void {
  if (!isClient()) return;
  try {
    localStorage.removeItem(LOGS_KEY);
  } catch {
    // ignore
  }
}

/**
 * Generate a unique log ID (timestamp-based with random suffix).
 */
export function generateLogId(): string {
  return `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Merge two lists of VoiceLogs by ID, newest-first.
 * Remote entries (Supabase) take precedence, but local audioUrl is preserved
 * if the remote entry doesn't have one yet (upload may still be in progress).
 */
export function mergeVoiceLogs(
  local: VoiceLog[],
  remote: VoiceLog[],
): VoiceLog[] {
  const map = new Map<string, VoiceLog>();

  // Seed with local entries
  for (const l of local) {
    map.set(l.id, l);
  }

  // Remote entries overwrite local (Supabase is the persistent source of truth),
  // but carry over the local audioUrl when remote doesn't have it yet.
  for (const r of remote) {
    const existing = map.get(r.id);
    map.set(r.id, {
      ...r,
      audioUrl: r.audioUrl ?? existing?.audioUrl,
    });
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

// ── Derived selectors ────────────────────────────────────────────────────────

/** Logs that need user attention: anomaly detected but not yet saved. */
export function getFlaggedLogs(logs: VoiceLog[]): VoiceLog[] {
  return logs.filter((l) => l.hasAnomaly && !l.saved);
}

/** Logs that were saved to the Dashboard. */
export function getSavedLogs(logs: VoiceLog[]): VoiceLog[] {
  return logs.filter((l) => l.saved);
}
