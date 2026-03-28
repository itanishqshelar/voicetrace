import {
  fetchFullDbContext,
  buildVoiceContextString,
  buildChatContextString,
} from "@/lib/db-context";

/**
 * GET /api/chat/db-context
 *
 * Returns the full database context for both chat and voice modes.
 *
 * Query params:
 *   ?format=voice  → returns a human-readable text string optimised for the
 *                    Gemini Live voice agent's system instruction
 *   ?format=chat   → returns compact JSON string (default)
 *   ?format=raw    → returns the raw FullDbContext object as JSON
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") ?? "raw";

    const ctx = await fetchFullDbContext();

    if (!ctx) {
      return Response.json(
        {
          error:
            "Database context unavailable. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.",
          context: null,
          contextString: "Database not configured.",
        },
        { status: 503 },
      );
    }

    if (format === "voice") {
      // Concise human-readable text for Gemini Live system instruction
      const contextString = buildVoiceContextString(ctx);
      return Response.json({
        format: "voice",
        contextString,
        meta: ctx.fetch_meta,
      });
    }

    if (format === "chat") {
      // Compact JSON string for chat system prompt injection
      const contextString = buildChatContextString(ctx);
      return Response.json({
        format: "chat",
        contextString,
        meta: ctx.fetch_meta,
      });
    }

    // Default: return the raw structured object so callers can format it themselves
    return Response.json({
      format: "raw",
      context: ctx,
      meta: ctx.fetch_meta,
    });
  } catch (error) {
    console.error("[chat/db-context] error:", error);
    return Response.json(
      { error: "Internal server error", context: null },
      { status: 500 },
    );
  }
}
