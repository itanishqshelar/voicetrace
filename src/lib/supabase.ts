import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface SaleItem {
  name: string;
  qty: number;
  price: number;
  total: number;
  type: 'sale' | 'expense';
  category?: string; // e.g. 'transport', 'raw_material', 'rent', 'utilities', 'other'
}

export interface SaleEntry {
  id: string;
  date: string;
  items: SaleItem[];
  total: number;
  created_at: string;
}
