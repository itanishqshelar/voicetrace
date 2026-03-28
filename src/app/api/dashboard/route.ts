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
    // 1. Fetch sales
    let entries;
    const supabase = getSupabaseClient();

    if (!supabase) {
      entries = dummySalesEntries.map((e, i) => ({
        ...e,
        id: `dummy-${i}`,
        created_at: new Date().toISOString(),
      }));
    } else {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error || !data || data.length === 0) {
        // Seed dummy data if empty
        if (!error && (!data || data.length === 0)) {
          const insertPromises = dummySalesEntries.map((entry) =>
            supabase.from('sales').insert(entry).select()
          );
          const results = await Promise.all(insertPromises);
          entries = results.filter((r) => r.data).flatMap((r) => r.data!);
        }

        if (!entries || entries.length === 0) {
          entries = dummySalesEntries.map((e, i) => ({
            ...e,
            id: `dummy-${i}`,
            created_at: new Date().toISOString(),
          }));
        }
      } else {
        entries = data;
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
