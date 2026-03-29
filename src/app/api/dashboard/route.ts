import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET() {
  try {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return Response.json({ entries: [] });
    }

    const [salesRes, expensesRes] = await Promise.all([
      supabase.from('sales').select('*').order('created_at', { ascending: false }),
      supabase.from('expenses').select('*').order('created_at', { ascending: false })
    ]);

    if (salesRes.error || expensesRes.error) {
      console.error('Dashboard query error:', salesRes.error?.message || expensesRes.error?.message);
      return Response.json({ entries: [] }, { status: 500 });
    }

    const salesData = salesRes.data || [];
    const expensesData = expensesRes.data || [];

    const mappedExpenses = expensesData.map((e) => ({
      id: e.id,
      date: e.date,
      total: e.amount,
      created_at: e.created_at,
      items: [{
        name: e.description || e.category || 'Expense',
        qty: 1,
        price: e.amount,
        total: e.amount,
        type: 'expense',
        category: e.category
      }]
    }));

    const entries = [...salesData, ...mappedExpenses].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return Response.json({ entries });
  } catch (error) {
    console.error('Dashboard fetch error:', error);
    return Response.json({ entries: [] }, { status: 500 });
  }
}
