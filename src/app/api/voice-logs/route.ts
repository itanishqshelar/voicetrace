import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

const TABLE = "voice_logs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ── GET /api/voice-logs ───────────────────────────────────────────────────────
// Fetch all voice logs for the Logs page, newest first.
// Returns { logs: VoiceLog[] } — empty array when Supabase is not configured.

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ logs: [] });
  }

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[VoiceLogs GET]", error.message);
      return Response.json({ logs: [] });
    }

    // Map snake_case DB columns → camelCase VoiceLog shape
    const logs = (data ?? []).map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      transcript: row.transcript ?? "",
      highlights: row.highlights ?? [],
      analyzedData: row.analyzed_data ?? null,
      audioUrl: row.audio_url ?? undefined,
      saved: row.saved ?? false,
      hasAnomaly: row.has_anomaly ?? false,
      anomalyMessage: row.anomaly_message ?? "",
    }));

    return Response.json({ logs });
  } catch (err) {
    console.error("[VoiceLogs GET] unexpected:", err);
    return Response.json({ logs: [] });
  }
}

// ── POST /api/voice-logs ──────────────────────────────────────────────────────
// Upsert a complete VoiceLog entry (called on addVoiceLog / after audio upload).
// Body: { log: VoiceLog }

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ ok: true, skipped: true });
  }

  let body: { log?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const log = body?.log;
  if (!log?.id) {
    return Response.json({ error: "Missing log.id" }, { status: 400 });
  }

  try {
    const { error } = await supabase.from(TABLE).upsert({
      id: log.id,
      timestamp: log.timestamp,
      transcript: log.transcript ?? "",
      highlights: log.highlights ?? [],
      analyzed_data: log.analyzedData ?? null,
      audio_url: log.audioUrl ?? null,
      saved: log.saved ?? false,
      has_anomaly: log.hasAnomaly ?? false,
      anomaly_message: log.anomalyMessage ?? "",
    });

    if (error) {
      console.error("[VoiceLogs POST]", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[VoiceLogs POST] unexpected:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PATCH /api/voice-logs ─────────────────────────────────────────────────────
// Partially update a log entry (called on updateVoiceLog).
// Body: { id: string, patch: Partial<VoiceLog> }

export async function PATCH(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ ok: true, skipped: true });
  }

  let body: { id?: string; patch?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, patch } = body ?? {};
  if (!id) {
    return Response.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    // Map camelCase patch fields → snake_case DB columns
    const dbPatch: Record<string, unknown> = {};
    if (patch?.transcript !== undefined) dbPatch.transcript = patch.transcript;
    if (patch?.highlights !== undefined) dbPatch.highlights = patch.highlights;
    if (patch?.analyzedData !== undefined)
      dbPatch.analyzed_data = patch.analyzedData;
    if (patch?.audioUrl !== undefined) dbPatch.audio_url = patch.audioUrl;
    if (patch?.saved !== undefined) dbPatch.saved = patch.saved;
    if (patch?.hasAnomaly !== undefined) dbPatch.has_anomaly = patch.hasAnomaly;
    if (patch?.anomalyMessage !== undefined)
      dbPatch.anomaly_message = patch.anomalyMessage;

    if (Object.keys(dbPatch).length === 0) {
      return Response.json({ ok: true, noop: true });
    }

    const { error } = await supabase
      .from(TABLE)
      .update(dbPatch)
      .eq("id", id);

    if (error) {
      console.error("[VoiceLogs PATCH]", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[VoiceLogs PATCH] unexpected:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE /api/voice-logs?id=xxx ─────────────────────────────────────────────
// Delete a single log entry (called on deleteVoiceLog).

export async function DELETE(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ ok: true, skipped: true });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return Response.json({ error: "Missing id query param" }, { status: 400 });
  }

  try {
    const { error } = await supabase.from(TABLE).delete().eq("id", id);

    if (error) {
      console.error("[VoiceLogs DELETE]", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[VoiceLogs DELETE] unexpected:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
