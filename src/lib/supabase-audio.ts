/**
 * supabase-audio.ts
 *
 * Uploads voice recording blobs to Supabase Storage bucket "voice-recordings".
 * Returns the public URL so it can be stored in the voice log entry.
 *
 * Falls back gracefully (returns null) when:
 *  - Supabase env vars are not configured
 *  - The bucket does not exist yet
 *  - Any network / permission error occurs
 *
 * Supabase setup required (see README / Logs page instructions):
 *  1. Create a Storage bucket named  "voice-recordings"  with Public access ON
 *  2. Create the "voice_logs" table  (SQL in the Logs page setup card)
 */

import { createClient } from "@supabase/supabase-js";

const BUCKET = "voice-recordings";

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Upload a voice recording blob to Supabase Storage.
 *
 * @param blob   - The raw audio Blob from MediaRecorder
 * @param logId  - The voice log ID used as the filename
 * @returns      Public URL string on success, null on failure / no Supabase
 */
export async function uploadVoiceRecording(
  blob: Blob,
  logId: string,
): Promise<string | null> {
  const supabase = getClient();
  if (!supabase) return null;

  try {
    // Derive extension from MIME type reported by the browser
    const ext = blob.type.includes("ogg") ? "ogg" : "webm";
    const storagePath = `${logId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, blob, {
        contentType: blob.type || "audio/webm",
        // upsert: true so retries don't fail with "already exists"
        upsert: true,
      });

    if (uploadError) {
      console.warn("[VoiceUpload] Upload failed:", uploadError.message);
      return null;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    return data?.publicUrl ?? null;
  } catch (err) {
    console.warn("[VoiceUpload] Unexpected error:", err);
    return null;
  }
}

/**
 * Delete a voice recording from Supabase Storage.
 * Called when the user deletes a log entry.
 * Fails silently — local deletion is not blocked by storage errors.
 */
export async function deleteVoiceRecording(logId: string): Promise<void> {
  const supabase = getClient();
  if (!supabase) return;

  try {
    // Try both extensions since we don't know which was used at upload time
    await supabase.storage
      .from(BUCKET)
      .remove([`${logId}.webm`, `${logId}.ogg`]);
  } catch {
    // Intentionally silent
  }
}
