import { SaleEntry } from './supabase';

export const dummySalesEntries: Omit<SaleEntry, 'id' | 'created_at'>[] = [
  {
    date: new Date().toISOString().split('T')[0],
    items: [
      { name: 'Chai', qty: 25, price: 10, total: 250, type: 'sale' },
      { name: 'Samosa', qty: 15, price: 15, total: 225, type: 'sale' },
      { name: 'Vada Pav', qty: 10, price: 20, total: 200, type: 'sale' },
    ],
    total: 675,
  },
  {
    date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
    items: [
      { name: 'Chai', qty: 30, price: 10, total: 300, type: 'sale' },
      { name: 'Pakoda', qty: 8, price: 20, total: 160, type: 'sale' },
      { name: 'Samosa', qty: 12, price: 15, total: 180, type: 'sale' },
    ],
    total: 640,
  },
  {
    date: new Date(Date.now() - 172800000).toISOString().split('T')[0],
    items: [
      { name: 'Chai', qty: 20, price: 10, total: 200, type: 'sale' },
      { name: 'Vada Pav', qty: 18, price: 20, total: 360, type: 'sale' },
      { name: 'Lassi', qty: 5, price: 25, total: 125, type: 'sale' },
    ],
    total: 685,
  },
];
