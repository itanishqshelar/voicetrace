import { NextRequest } from "next/server";
import { fetchFullDbContext, getISTDateString } from "@/lib/db-context";

function rupees(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function buildTodayTipMessage(ctx: NonNullable<Awaited<ReturnType<typeof fetchFullDbContext>>>): string {
  const today = ctx.today_summary;
  const topToday = [...today.sale_items].sort((a, b) => b.total - a.total)[0];
  const highestExpense = [...today.expense_items].sort((a, b) => b.total - a.total)[0];

  if (today.sales_total <= 0 && today.expenses_total <= 0) {
    return `Today's tip (${ctx.today_date}): Start early and log every sale immediately. Even 10-15 extra transactions can meaningfully improve your day-end profit.`;
  }

  if (today.sales_total <= 0 && today.expenses_total > 0) {
    return `Today's tip (${ctx.today_date}): Expenses are ${rupees(today.expenses_total)} but no sales are logged yet. Focus on quick, high-turnover items first to recover costs.`;
  }

  const margin = today.sales_total > 0 ? Math.round((today.net / today.sales_total) * 100) : 0;

  if (today.net < 0) {
    return `Today's tip (${ctx.today_date}): Net is ${rupees(today.net)}. Push best seller ${topToday?.name ?? "your top item"} and reduce ${highestExpense?.name ?? "high expenses"} to improve profitability today.`;
  }

  return `Today's tip (${ctx.today_date}): Net profit is ${rupees(today.net)} (${margin}% margin). Keep promoting ${topToday?.name ?? "your top seller"} and control ${highestExpense?.name ?? "expense leaks"} to protect earnings.`;
}

export async function POST(request: NextRequest) {
  try {
    const whapiToken = process.env.WHAPI_TOKEN;
    if (!whapiToken) {
      return Response.json({ error: "WHAPI_TOKEN is not configured" }, { status: 500 });
    }

    const body = (await request.json().catch(() => ({}))) as { to?: string };
    const to =
      body.to?.trim() ||
      process.env.WHAPI_TIP_TO?.trim() ||
      process.env.WHAPI_DEFAULT_TO?.trim();

    if (!to) {
      return Response.json(
        {
          error:
            "Missing destination chat ID. Provide 'to' in request body or configure WHAPI_TIP_TO.",
        },
        { status: 400 },
      );
    }

    const ctx = await fetchFullDbContext();
    if (!ctx) {
      return Response.json(
        {
          error:
            "Database context unavailable. Ensure Supabase env vars are configured.",
        },
        { status: 503 },
      );
    }

    const tip = buildTodayTipMessage(ctx);
    const payload = {
      to,
      body: tip,
    };

    const whapiRes = await fetch("https://gate.whapi.cloud/messages/text", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${whapiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await whapiRes.text();
    if (!whapiRes.ok) {
      return Response.json(
        {
          error: `Whapi send failed (${whapiRes.status}). ${responseText.slice(0, 300)}`,
        },
        { status: 502 },
      );
    }

    return Response.json({
      ok: true,
      sentAt: new Date().toISOString(),
      date: getISTDateString(),
      tip,
      to,
      provider: "whapi",
    });
  } catch (error) {
    console.error("[whapi/send-tip] error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
