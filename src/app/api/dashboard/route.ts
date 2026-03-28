import { createClient } from '@supabase/supabase-js';
import { dummySalesEntries } from '@/lib/dummy-data';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET() {
  try {
    let entries;
    const supabase = getSupabaseClient();

    if (!supabase) {
      entries = dummySalesEntries.map((e, i) => ({
        ...e,
        id: `dummy-${i}`,
        created_at: new Date().toISOString(),
      }));
    } else {
      const [salesRes, expensesRes] = await Promise.all([
        supabase.from('sales').select('*').order('created_at', { ascending: false }),
        supabase.from('expenses').select('*').order('created_at', { ascending: false })
      ]);

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

      const combinedData = [...salesData, ...mappedExpenses].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      if ((!salesData || salesData.length === 0) && (!expensesData || expensesData.length === 0) && !salesRes.error) {
        // Seed dummy data if empty
        const insertPromises = dummySalesEntries.map((entry) =>
          supabase.from('sales').insert(entry).select()
        );
        const results = await Promise.all(insertPromises);
        entries = results.filter((r) => r.data).flatMap((r) => r.data!);

        if (!entries || entries.length === 0) {
          entries = dummySalesEntries.map((e, i) => ({
            ...e,
            id: `dummy-${i}`,
            created_at: new Date().toISOString(),
          }));
        }
      } else {
        entries = combinedData;
      }
    }

    return Response.json({ entries });
  } catch (error) {
    console.error('Dashboard fetch error:', error);
    return Response.json({
      entries: dummySalesEntries.map((e, i) => ({
        ...e,
        id: `dummy-${i}`,
        created_at: new Date().toISOString(),
      })),
    });
  }
}
