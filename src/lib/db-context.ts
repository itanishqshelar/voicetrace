/**
 * db-context.ts
 *
 * Shared server-side module that fetches ALL relevant tables from Supabase
 * and builds structured context objects for the AI widget (chat + voice).
 *
 * Tables covered:
 *  - sales          → daily sale entries with item-level JSONB detail
 *  - expenses       → standalone expense records
 *  - item_catalog   → price-per-unit reference for every product
 *  - voice_logs     → recent voice session history + anomaly flags
 */

import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────
// Raw DB row types
// ─────────────────────────────────────────────────────────────

export interface SalesRow {
  id: string;
  date: string;
  total: number;
  items: Array<{
    name?: string;
    qty?: number;
    price?: number;
    total?: number;
    type?: string;
    category?: string;
  }>;
  created_at: string;
}

export interface ExpenseRow {
  id: string;
  date: string;
  amount: number;
  category: string;
  description: string | null;
  created_at: string;
}

export interface CatalogRow {
  name: string;
  price_per_unit: number;
  unit: string;
  category: string;
  aliases: string[];
}

export interface VoiceLogRow {
  id: string;
  timestamp: string;
  transcript: string;
  has_anomaly: boolean;
  anomaly_message: string;
  saved: boolean;
  analyzed_data: {
    items?: Array<{ name: string; qty: number; price: number; total: number; type: string }>;
    total_earnings?: number;
    total_expenses?: number;
    date?: string;
  } | null;
}

// ─────────────────────────────────────────────────────────────
// Output context types
// ─────────────────────────────────────────────────────────────

export interface DailyEntry {
  date: string;
  sale_items: Array<{ name: string; qty: number; price: number; total: number }>;
  expense_items: Array<{ name: string; qty: number; price: number; total: number; category?: string }>;
  sales_total: number;
  expenses_total: number;
  net: number;
}

export interface FullDbContext {
  today_date: string;
  data_range: string; // e.g. "2024-05-01 to 2024-06-01"
  overall_totals: {
    sales_revenue: number;
    expenses: number;
    net: number;
  };
  today_summary: {
    sales_total: number;
    expenses_total: number;
    net: number;
    sale_items: Array<{ name: string; qty: number; price: number; total: number }>;
    expense_items: Array<{ name: string; qty: number; price: number; total: number; category?: string }>;
  };
  daily_breakdown: DailyEntry[]; // most recent 30 days, newest first
  top_sale_items: Array<{ name: string; revenue: number; qty: number }>;
  item_catalog: Array<{
    name: string;
    price_per_unit: number;
    unit: string;
    category: string;
    aliases: string[];
  }>;
  recent_expenses_table: Array<{
    date: string;
    amount: number;
    category: string;
    description: string | null;
  }>;
  voice_sessions: Array<{
    date: string;
    transcript_snippet: string;
    has_anomaly: boolean;
    anomaly_message: string;
    saved: boolean;
    sales_total: number;
    expenses_total: number;
  }>;
  fetch_meta: {
    sales_records: number;
    expense_records: number;
    catalog_items: number;
    voice_log_count: number;
    errors: string[];
    key_type: "service_role" | "anon" | "missing";
  };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Returns today's date as YYYY-MM-DD in IST (UTC+5:30). */
export function getISTDateString(): string {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + istOffset).toISOString().slice(0, 10);
}

function num(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

// ─────────────────────────────────────────────────────────────
// Main fetcher
// ─────────────────────────────────────────────────────────────

/**
 * Fetches ALL relevant tables from Supabase and assembles a FullDbContext.
 * Falls back gracefully when tables are missing or keys are absent.
 *
 * @param sessionId  Optional chat session UUID — filters chat_messages for that session.
 */
export async function fetchFullDbContext(
  sessionId?: string,
): Promise<FullDbContext | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || (!serviceRoleKey && !anonKey)) {
    return null;
  }

  const key = serviceRoleKey || anonKey!;
  const keyType: FullDbContext["fetch_meta"]["key_type"] = serviceRoleKey
    ? "service_role"
    : "anon";
  const supabase = createClient(supabaseUrl, key);

  const todayStr = getISTDateString();
  const errors: string[] = [];

  // ── Parallel fetch all four tables ───────────────────────────
  const [salesRes, expensesRes, catalogRes, voiceLogsRes] = await Promise.all([
    // Sales — no hard date cutoff; grab up to 300 most recent records
    supabase
      .from("sales")
      .select("id, date, total, items, created_at")
      .order("date", { ascending: false })
      .limit(300),

    // Expenses table — up to 200 records
    supabase
      .from("expenses")
      .select("id, date, amount, category, description, created_at")
      .order("date", { ascending: false })
      .limit(200),

    // Item catalog — complete list (should be small)
    supabase
      .from("item_catalog")
      .select("name, price_per_unit, unit, category, aliases")
      .order("name", { ascending: true }),

    // Voice logs — recent 30 sessions with analysis data
    supabase
      .from("voice_logs")
      .select(
        "id, timestamp, transcript, has_anomaly, anomaly_message, saved, analyzed_data",
      )
      .order("timestamp", { ascending: false })
      .limit(30),
  ]);

  if (salesRes.error) errors.push(`sales: ${salesRes.error.message}`);
  if (expensesRes.error) errors.push(`expenses: ${expensesRes.error.message}`);
  if (catalogRes.error) errors.push(`item_catalog: ${catalogRes.error.message}`);
  if (voiceLogsRes.error) errors.push(`voice_logs: ${voiceLogsRes.error.message}`);

  const sales = (salesRes.data ?? []) as SalesRow[];
  const expenses = (expensesRes.data ?? []) as ExpenseRow[];
  const catalog = (catalogRes.data ?? []) as CatalogRow[];
  const voiceLogs = (voiceLogsRes.data ?? []) as VoiceLogRow[];

  // ── Build daily breakdown from sales rows ─────────────────────
  const dailyMap: Record<
    string,
    {
      sale_items: Array<{ name: string; qty: number; price: number; total: number }>;
      expense_items: Array<{ name: string; qty: number; price: number; total: number; category?: string }>;
    }
  > = {};

  for (const row of sales) {
    const date = String(row.date).slice(0, 10);
    if (!dailyMap[date]) {
      dailyMap[date] = { sale_items: [], expense_items: [] };
    }
    for (const item of row.items ?? []) {
      const entry = {
        name: (item.name || "Unknown").trim(),
        qty: num(item.qty),
        price: num(item.price),
        total: num(item.total),
      };
      if (item.type === "expense") {
        dailyMap[date].expense_items.push({ ...entry, category: item.category });
      } else {
        dailyMap[date].sale_items.push(entry);
      }
    }
  }

  // Fold standalone expenses table into the daily map
  for (const exp of expenses) {
    const date = String(exp.date).slice(0, 10);
    if (!dailyMap[date]) {
      dailyMap[date] = { sale_items: [], expense_items: [] };
    }
    dailyMap[date].expense_items.push({
      name: exp.description || exp.category || "Expense",
      qty: 1,
      price: num(exp.amount),
      total: num(exp.amount),
      category: exp.category,
    });
  }

  // Sort dates newest-first and build DailyEntry[]
  const allDates = Object.keys(dailyMap).sort((a, b) => b.localeCompare(a));
  const daily_breakdown: DailyEntry[] = allDates.slice(0, 30).map((date) => {
    const d = dailyMap[date];
    const sales_total = d.sale_items.reduce((s, i) => s + i.total, 0);
    const expenses_total = d.expense_items.reduce((s, i) => s + i.total, 0);
    return {
      date,
      sale_items: d.sale_items,
      expense_items: d.expense_items,
      sales_total,
      expenses_total,
      net: sales_total - expenses_total,
    };
  });

  // ── Overall totals ────────────────────────────────────────────
  let totalSalesRevenue = 0;
  let totalExpenses = 0;
  for (const entry of daily_breakdown) {
    totalSalesRevenue += entry.sales_total;
    totalExpenses += entry.expenses_total;
  }
  // Also include records outside the top-30 window
  for (const date of allDates.slice(30)) {
    const d = dailyMap[date];
    totalSalesRevenue += d.sale_items.reduce((s, i) => s + i.total, 0);
    totalExpenses += d.expense_items.reduce((s, i) => s + i.total, 0);
  }

  // ── Today summary ─────────────────────────────────────────────
  const todayData = dailyMap[todayStr] ?? { sale_items: [], expense_items: [] };
  const todaySalesTotal = todayData.sale_items.reduce((s, i) => s + i.total, 0);
  const todayExpensesTotal = todayData.expense_items.reduce((s, i) => s + i.total, 0);

  const today_summary = {
    sales_total: todaySalesTotal,
    expenses_total: todayExpensesTotal,
    net: todaySalesTotal - todayExpensesTotal,
    sale_items: todayData.sale_items,
    expense_items: todayData.expense_items,
  };

  // ── Top sale items (by revenue, all time) ─────────────────────
  const itemRevenue: Record<string, { revenue: number; qty: number }> = {};
  for (const row of sales) {
    for (const item of row.items ?? []) {
      if (item.type === "expense") continue;
      const name = (item.name || "Unknown").trim();
      if (!itemRevenue[name]) itemRevenue[name] = { revenue: 0, qty: 0 };
      itemRevenue[name].revenue += num(item.total);
      itemRevenue[name].qty += num(item.qty);
    }
  }
  const top_sale_items = Object.entries(itemRevenue)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 10)
    .map(([name, data]) => ({ name, revenue: data.revenue, qty: data.qty }));

  // ── Voice session summary ─────────────────────────────────────
  const voice_sessions = voiceLogs.map((log) => {
    const snippet =
      log.transcript.length > 120
        ? log.transcript.slice(0, 120) + "…"
        : log.transcript;
    const ad = log.analyzed_data;
    return {
      date: log.timestamp.slice(0, 10),
      transcript_snippet: snippet,
      has_anomaly: log.has_anomaly ?? false,
      anomaly_message: log.anomaly_message ?? "",
      saved: log.saved ?? false,
      sales_total: num(ad?.total_earnings),
      expenses_total: num(ad?.total_expenses),
    };
  });

  // ── Data range string ─────────────────────────────────────────
  const oldestDate = allDates[allDates.length - 1] ?? todayStr;
  const data_range = `${oldestDate} to ${todayStr}`;

  return {
    today_date: todayStr,
    data_range,
    overall_totals: {
      sales_revenue: totalSalesRevenue,
      expenses: totalExpenses,
      net: totalSalesRevenue - totalExpenses,
    },
    today_summary,
    daily_breakdown,
    top_sale_items,
    item_catalog: catalog.map((c) => ({
      name: c.name,
      price_per_unit: c.price_per_unit,
      unit: c.unit,
      category: c.category,
      aliases: c.aliases ?? [],
    })),
    recent_expenses_table: expenses.slice(0, 20).map((e) => ({
      date: e.date,
      amount: num(e.amount),
      category: e.category,
      description: e.description,
    })),
    voice_sessions,
    fetch_meta: {
      sales_records: sales.length,
      expense_records: expenses.length,
      catalog_items: catalog.length,
      voice_log_count: voiceLogs.length,
      errors,
      key_type: keyType,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Context formatters
// ─────────────────────────────────────────────────────────────

/**
 * Serialises the full context to a compact JSON string suitable for
 * injecting into the chat system prompt.
 */
export function buildChatContextString(ctx: FullDbContext): string {
  return JSON.stringify(ctx);
}

/**
 * Builds a concise, human-readable text block for the Gemini Live voice
 * agent's system instruction. Keeps it lean enough to avoid token overruns
 * while still covering all key facts the agent might need.
 */
export function buildVoiceContextString(ctx: FullDbContext): string {
  const lines: string[] = [];

  lines.push(`=== VoiceTrace Business Data ===`);
  lines.push(`Today: ${ctx.today_date}  |  Data range: ${ctx.data_range}`);
  lines.push(``);

  // Overall totals
  lines.push(`── All-time Totals ──`);
  lines.push(`  Sales revenue : ₹${ctx.overall_totals.sales_revenue}`);
  lines.push(`  Total expenses: ₹${ctx.overall_totals.expenses}`);
  lines.push(`  Net profit    : ₹${ctx.overall_totals.net}`);
  lines.push(``);

  // Today
  lines.push(`── Today (${ctx.today_date}) ──`);
  if (ctx.today_summary.sale_items.length === 0) {
    lines.push(`  No sales recorded yet today.`);
  } else {
    lines.push(`  Sales total: ₹${ctx.today_summary.sales_total}`);
    for (const it of ctx.today_summary.sale_items) {
      lines.push(`    • ${it.name}: ${it.qty} × ₹${it.price} = ₹${it.total}`);
    }
  }
  if (ctx.today_summary.expense_items.length > 0) {
    lines.push(`  Expenses total: ₹${ctx.today_summary.expenses_total}`);
    for (const it of ctx.today_summary.expense_items) {
      lines.push(`    • ${it.name}${it.category ? ` [${it.category}]` : ""}: ₹${it.total}`);
    }
  }
  lines.push(`  Net today: ₹${ctx.today_summary.net}`);
  lines.push(``);

  // Recent daily breakdown (last 7 days)
  const recentDays = ctx.daily_breakdown.slice(0, 7);
  if (recentDays.length > 1) {
    lines.push(`── Last 7 Days ──`);
    for (const day of recentDays) {
      if (day.date === ctx.today_date) continue; // already shown above
      const saleNames = day.sale_items
        .sort((a, b) => b.total - a.total)
        .slice(0, 3)
        .map((i) => `${i.name}(${i.qty})`)
        .join(", ");
      lines.push(
        `  ${day.date}: sales ₹${day.sales_total}, expenses ₹${day.expenses_total}, net ₹${day.net}${saleNames ? ` | top: ${saleNames}` : ""}`,
      );
    }
    lines.push(``);
  }

  // Top sale items (all time)
  if (ctx.top_sale_items.length > 0) {
    lines.push(`── Top Selling Items (all time) ──`);
    for (const it of ctx.top_sale_items.slice(0, 8)) {
      lines.push(`  • ${it.name}: ₹${it.revenue} revenue, ${it.qty} units sold`);
    }
    lines.push(``);
  }

  // Item catalog
  const saleItems = ctx.item_catalog.filter((c) => c.category === "sale");
  const expenseItems = ctx.item_catalog.filter((c) => c.category === "expense");
  if (saleItems.length > 0) {
    lines.push(`── Item Catalog (sale prices) ──`);
    for (const c of saleItems) {
      lines.push(`  • ${c.name}: ₹${c.price_per_unit}/${c.unit}`);
    }
    lines.push(``);
  }
  if (expenseItems.length > 0) {
    lines.push(`── Item Catalog (expense prices) ──`);
    for (const c of expenseItems) {
      lines.push(`  • ${c.name}: ₹${c.price_per_unit}/${c.unit}`);
    }
    lines.push(``);
  }

  // Recent expense records
  if (ctx.recent_expenses_table.length > 0) {
    lines.push(`── Recent Standalone Expenses ──`);
    for (const e of ctx.recent_expenses_table.slice(0, 10)) {
      lines.push(
        `  • ${e.date} [${e.category}] ${e.description ?? ""}: ₹${e.amount}`,
      );
    }
    lines.push(``);
  }

  // Voice session history
  const anomalous = ctx.voice_sessions.filter((v) => v.has_anomaly);
  if (ctx.voice_sessions.length > 0) {
    lines.push(`── Voice Session History (${ctx.voice_sessions.length} sessions) ──`);
    for (const v of ctx.voice_sessions.slice(0, 5)) {
      lines.push(
        `  • ${v.date}: sales ₹${v.sales_total}, exp ₹${v.expenses_total}${v.has_anomaly ? " ⚠ ANOMALY" : ""}${v.saved ? " ✓saved" : " (unsaved)"}`,
      );
    }
    if (anomalous.length > 0) {
      lines.push(`  Anomalies: ${anomalous.map((a) => a.anomaly_message).filter(Boolean).slice(0, 3).join(" | ")}`);
    }
    lines.push(``);
  }

  lines.push(`=== End of Data ===`);
  return lines.join("\n");
}
