import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { dummySalesEntries } from '@/lib/dummy-data';

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
      return Response.json({ entries: dummySalesEntries.map((e, i) => ({ ...e, id: `dummy-${i}`, created_at: new Date().toISOString() })) });
    }

    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Supabase fetch error:', error);
      return Response.json({ entries: dummySalesEntries.map((e, i) => ({ ...e, id: `dummy-${i}`, created_at: new Date().toISOString() })) });
    }

    // If no data, seed with dummy entries
    if (!data || data.length === 0) {
      const insertPromises = dummySalesEntries.map((entry) =>
        supabase.from('sales').insert(entry).select()
      );
      const results = await Promise.all(insertPromises);
      const seededData = results
        .filter((r) => r.data)
        .flatMap((r) => r.data!);

      return Response.json({ entries: seededData.length > 0 ? seededData : dummySalesEntries.map((e, i) => ({ ...e, id: `dummy-${i}`, created_at: new Date().toISOString() })) });
    }

    return Response.json({ entries: data });
  } catch (error) {
    console.error('Sales fetch error:', error);
    return Response.json({ entries: dummySalesEntries.map((e, i) => ({ ...e, id: `dummy-${i}`, created_at: new Date().toISOString() })) });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, items, total } = body;

    if (!items || !Array.isArray(items)) {
      return Response.json(
        { error: 'Invalid sales data' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      // Return success with dummy ID when no Supabase
      return Response.json({
        entry: {
          id: `local-${Date.now()}`,
          date: date || new Date().toISOString().split('T')[0],
          items,
          total: total || items.reduce((sum: number, item: { total: number }) => sum + item.total, 0),
          created_at: new Date().toISOString(),
        },
      });
    }

    const { data, error } = await supabase
      .from('sales')
      .insert({
        date: date || new Date().toISOString().split('T')[0],
        items,
        total: total || items.reduce((sum: number, item: { total: number }) => sum + item.total, 0),
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return Response.json(
        { error: 'Failed to save sales data' },
        { status: 500 }
      );
    }

    return Response.json({ entry: data });
  } catch (error) {
    console.error('Sales save error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return Response.json({ error: 'ID is required' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return Response.json({ success: true, dummy: true });
    }

    const [salesDelete, expDelete] = await Promise.all([
      supabase.from('sales').delete().eq('id', id),
      supabase.from('expenses').delete().eq('id', id)
    ]);

    if (salesDelete.error || expDelete.error) {
      console.error('Supabase delete error:', salesDelete.error, expDelete.error);
      return Response.json({ error: 'Failed to delete record' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Sales delete error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
