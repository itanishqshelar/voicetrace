import { NextRequest } from "next/server";
import Groq from "groq-sdk";
import { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import { createClient } from "@supabase/supabase-js";
import {
  fetchFullDbContext,
  buildChatContextString,
  getISTDateString,
} from "@/lib/db-context";

interface ChatMessageInput {
  role: "user" | "assistant";
  content: string;
}

interface ChatMessageRow {
  role: "user" | "assistant" | "system";
  content: string;
  mode: "chat" | "voice";
  created_at: string;
}

async function fetchSessionMessages(
  sessionId: string,
): Promise<ChatMessageRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || (!serviceRoleKey && !anonKey)) return [];

  const key = serviceRoleKey || anonKey!;
  const supabase = createClient(supabaseUrl, key);

  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content, mode, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(80);

  if (error) {
    console.error(
      "[chat/respond] session messages fetch error:",
      error.message,
    );
    return [];
  }

  return (data ?? []) as ChatMessageRow[];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      message?: string;
      history?: ChatMessageInput[];
      sessionId?: string;
    };

    if (!body.message || !body.message.trim()) {
      return Response.json({ error: "message is required" }, { status: 400 });
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return Response.json(
        { error: "Groq API key not configured" },
        { status: 500 },
      );
    }

    const groq = new Groq({ apiKey: groqApiKey });

    // ── Fetch full DB context (all tables, all-time data) ──────────────────
    const [dbContext, sessionMessages] = await Promise.all([
      fetchFullDbContext(),
      body.sessionId
        ? fetchSessionMessages(body.sessionId)
        : Promise.resolve([]),
    ]);

    const todayDate = getISTDateString();

    // ── Build context string ──────────────────────────────────────────────
    const dbContextText = dbContext
      ? buildChatContextString(dbContext)
      : '{"notice":"Database context unavailable — Supabase not configured."}';

    // ── Build message history ─────────────────────────────────────────────
    // Prefer the full session messages from DB; fall back to client-provided history
    const history: ChatMessageInput[] =
      sessionMessages.length > 0
        ? sessionMessages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .slice(-20)
            .map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            }))
        : Array.isArray(body.history)
          ? body.history.slice(-20)
          : [];

    // ── Compose Groq messages ─────────────────────────────────────────────
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are VoiceTrace Assistant — a smart business intelligence helper built for Indian street food vendors. Today's date is ${todayDate} (IST).

You have FULL access to the vendor's real database, including:
• sales      — every sale entry with item-level detail (name, qty, price, total, type)
• expenses   — standalone expense records (rent, transport, raw materials, etc.)
• item_catalog — the complete price-per-unit reference for every product sold
• voice_logs  — history of voice recording sessions with anomaly flags

HOW TO USE THE DATA:
• "today_summary"    → use for any question about today's sales, expenses or profit
• "daily_breakdown"  → use for questions about specific past dates or week-on-week trends
• "overall_totals"   → use for all-time or cumulative profit questions
• "top_sale_items"   → use for best-seller rankings (by revenue or qty)
• "item_catalog"     → use to quote standard prices and compute quantities
• "recent_expenses_table" → use for standalone expense queries
• "voice_sessions"   → use for questions about previous voice entries or anomalies
• "data_range"       → tells you the earliest date in the dataset

STRICT RULES:
1. ALWAYS use exact numbers from the data. NEVER invent or estimate figures.
2. Use ₹ (Rupee symbol) for all currency values.
3. If the user asks about something not covered by the data, say so clearly.
4. Keep answers concise and practical — this is a street vendor app.
5. When quoting totals or items, cite the specific date/period you are referring to.
6. If there are anomalies in voice_sessions, proactively mention them when relevant.

DATABASE_CONTEXT:
${dbContextText}`,
      },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      {
        role: "user",
        content: body.message,
      },
    ];

    // ── Call Groq LLM ─────────────────────────────────────────────────────
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.3,
      max_completion_tokens: 800,
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) {
      return Response.json({ error: "No response generated" }, { status: 500 });
    }

    // Debug log
    if (dbContext) {
      console.log(
        `[chat/respond] today=${todayDate} sales_records=${dbContext.fetch_meta.sales_records} ` +
          `expense_records=${dbContext.fetch_meta.expense_records} ` +
          `catalog_items=${dbContext.fetch_meta.catalog_items} ` +
          `voice_logs=${dbContext.fetch_meta.voice_log_count} ` +
          `errors=${dbContext.fetch_meta.errors.join(", ") || "none"}`,
      );
    }

    return Response.json({
      reply,
      dbMeta: dbContext?.fetch_meta ?? {
        connected: false,
        keyType: "missing",
        salesCount: 0,
        expensesCount: 0,
        errors: ["DB context unavailable"],
      },
    });
  } catch (error) {
    console.error("[chat/respond] error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
