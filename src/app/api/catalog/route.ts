import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { itemCatalog as dummyCatalog } from '@/lib/item-catalog';

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
      return Response.json({ items: dummyCatalog.map((e, i) => ({ ...e, id: `dummy-${i}` })) });
    }

    const { data, error } = await supabase
      .from('item_catalog')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Supabase fetch error:', error);
      return Response.json({ items: dummyCatalog.map((e, i) => ({ ...e, id: `dummy-${i}` })) });
    }

    if (!data || data.length === 0) {
      const insertPromises = dummyCatalog.map(item => supabase.from('item_catalog').insert(item).select());
      const results = await Promise.all(insertPromises);
      const seededData = results.filter(r => r.data).flatMap(r => r.data!);
      return Response.json({ items: seededData.length > 0 ? seededData : dummyCatalog.map((e, i) => ({ ...e, id: `dummy-${i}` })) });
    }

    return Response.json({ items: data });
  } catch (err) {
    console.error('Catalog fetch error:', err);
    return Response.json({ items: dummyCatalog.map((e, i) => ({ ...e, id: `dummy-${i}` })) });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = getSupabaseClient();
    if (!supabase) {
      return Response.json({ item: { ...body, id: `local-${Date.now()}` } });
    }

    const { data, error } = await supabase
      .from('item_catalog')
      .insert(body)
      .select()
      .single();

    if (error) {
      console.error('Insert error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ item: data });
  } catch (err) {
    console.error('POST error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return Response.json({ error: 'ID is required' }, { status: 400 });

    const supabase = getSupabaseClient();
    if (!supabase) {
      return Response.json({ item: { id, ...updates } });
    }

    const { data, error } = await supabase
      .from('item_catalog')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Update error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ item: data });
  } catch (err) {
    console.error('PUT error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'ID is required' }, { status: 400 });

    const supabase = getSupabaseClient();
    if (!supabase) {
      return Response.json({ success: true, dummy: true });
    }

    const { error } = await supabase.from('item_catalog').delete().eq('id', id);

    if (error) {
      console.error('Delete error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('DELETE error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
