'use client';

import { SaleEntry } from '@/lib/supabase';
import {
  IndianRupee,
  TrendingUp,
  ShoppingBag,
  Package,
  Truck,
  Home,
  Lightbulb,
  Target,
  Star,
  RefreshCw,
  Calendar,
  Zap,
  MoreHorizontal,
  Trash2,
  Users,
  Plus,
  X,
} from 'lucide-react';
import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface DashboardCardsProps {
  entries: SaleEntry[];
  insights: {
    insights: string[];
    suggestion: string;
    top_item: string;
  } | null;
  isLoadingInsights: boolean;
  onRefreshInsights: () => void;
  onDeleteEntry: (id: string) => void;
}

const CHART_COLORS = ['#387B8A', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const CATEGORY_ICONS: Record<string, typeof Truck> = {
  transport: Truck,
  raw_material: Package,
  rent: Home,
  utilities: Zap,
  other: MoreHorizontal,
};

const CATEGORY_LABELS: Record<string, string> = {
  transport: 'Transport',
  raw_material: 'Raw Material',
  rent: 'Rent',
  utilities: 'Utilities',
  other: 'Other',
};

export default function DashboardCards({
  entries,
  insights,
  isLoadingInsights,
  onRefreshInsights,
  onDeleteEntry,
}: DashboardCardsProps) {
  const [udhaarList, setUdhaarList] = useState([
    { id: '1', name: 'Ramesh K.', amount: 450, date: '2 days ago' },
    { id: '2', name: 'Suresh Tea', amount: 120, date: 'Today' },
    { id: '3', name: 'Amit (Taxi)', amount: 65, date: 'Yesterday' },
  ]);
  const [isAddingUdhaar, setIsAddingUdhaar] = useState(false);
  const [newUdhaar, setNewUdhaar] = useState({ name: '', amount: '' });

  const handleAddUdhaar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUdhaar.name || !newUdhaar.amount) return;
    
    setUdhaarList([
      { 
        id: Math.random().toString(36).substr(2, 9),
        name: newUdhaar.name, 
        amount: parseFloat(newUdhaar.amount), 
        date: 'Just now' 
      },
      ...udhaarList
    ]);
    setNewUdhaar({ name: '', amount: '' });
    setIsAddingUdhaar(false);
  };

  const removeUdhaar = (id: string) => {
    setUdhaarList(udhaarList.filter(item => item.id !== id));
  };
  const today = new Date().toISOString().split('T')[0];
  const todayEntries = entries.filter((e) => e.date === today);

  // Separate sale items from expense items across all entries
  const allItems = entries.flatMap((e) => e.items || []);
  const saleItems = allItems.filter((i) => i.type !== 'expense');
  const expenseItems = allItems.filter((i) => i.type === 'expense');

  const totalRevenue = saleItems.reduce((sum, i) => sum + i.total, 0);
  const totalExpenses = expenseItems.reduce((sum, i) => sum + i.total, 0);
  const netEarnings = totalRevenue - totalExpenses;

  // Today's earnings (sales only)
  const todaySaleItems = todayEntries.flatMap((e) => (e.items || []).filter((i) => i.type !== 'expense'));
  const todayEarnings = todaySaleItems.reduce((sum, i) => sum + i.total, 0);

  // Items sold (sales only)
  const itemMap = new Map<string, number>();
  saleItems.forEach((item) => {
    itemMap.set(item.name, (itemMap.get(item.name) || 0) + item.qty);
  });
  const totalItemsSold = saleItems.reduce((sum, item) => sum + item.qty, 0);

  // Expense breakdown by category
  const expenseCategoryMap = new Map<string, number>();
  expenseItems.forEach((item) => {
    const cat = item.category || 'other';
    expenseCategoryMap.set(cat, (expenseCategoryMap.get(cat) || 0) + item.total);
  });

  // Chart data: daily revenue (sales only)
  const dailyMap = new Map<string, number>();
  entries.forEach((e) => {
    const daySales = (e.items || []).filter((i) => i.type !== 'expense').reduce((s, i) => s + i.total, 0);
    if (daySales > 0) {
      dailyMap.set(e.date, (dailyMap.get(e.date) || 0) + daySales);
    }
  });
  const revenueChartData = Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, total]) => ({
      date: new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      revenue: total,
    }));

  // Pie chart data: item distribution (sales only)
  const sortedItems = Array.from(itemMap.entries()).sort((a, b) => b[1] - a[1]);
  const pieData = sortedItems.slice(0, 6).map(([name, qty]) => ({
    name,
    value: qty,
  }));

  // Recent entries split into sales-only and expense-only
  const recentSaleEntries = entries
    .map((e) => ({
      ...e,
      items: (e.items || []).filter((i) => i.type !== 'expense'),
    }))
    .filter((e) => e.items.length > 0);

  const recentExpenseEntries = entries
    .map((e) => ({
      ...e,
      items: (e.items || []).filter((i) => i.type === 'expense'),
    }))
    .filter((e) => e.items.length > 0);

  return (
    <div className="space-y-5">
      {/* ── ROW 1: Four Stat Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="card card-hover p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Total Sales
            </span>
          </div>
          <p className="text-4xl font-extrabold text-text-primary">₹{totalRevenue.toLocaleString('en-IN')}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${netEarnings >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              Net: ₹{netEarnings.toLocaleString('en-IN')}
            </span>
            <span className="text-xs text-text-muted">after expenses</span>
          </div>
        </div>

        <div className="card card-hover p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <IndianRupee className="w-5 h-5 text-red-500" />
            </div>
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Expenses
            </span>
          </div>
          <p className="text-4xl font-extrabold text-text-primary">₹{totalExpenses.toLocaleString('en-IN')}</p>
          <div className="flex flex-wrap gap-3 mt-3">
            {Array.from(expenseCategoryMap.entries()).map(([cat, amount]) => {
              const Icon = CATEGORY_ICONS[cat] || MoreHorizontal;
              return (
                <div key={cat} className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <Icon className="w-3.5 h-3.5 text-red-400" />
                  <span>{CATEGORY_LABELS[cat] || cat}: ₹{amount}</span>
                </div>
              );
            })}
            {expenseCategoryMap.size === 0 && (
              <span className="text-xs text-text-muted">No expenses recorded</span>
            )}
          </div>
        </div>

        <div className="card card-hover p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-teal-600" />
            </div>
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Today
            </span>
          </div>
          <p className="text-4xl font-extrabold text-text-primary">₹{todayEarnings.toLocaleString('en-IN')}</p>
          <p className="text-xs text-text-muted mt-2">
            {todayEntries.length} entr{todayEntries.length !== 1 ? 'ies' : 'y'}
          </p>
        </div>

        <div className="card card-hover p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Items Sold
            </span>
          </div>
          <p className="text-4xl font-extrabold text-text-primary">{totalItemsSold}</p>
          <p className="text-xs text-text-muted mt-2">{itemMap.size} unique items</p>
        </div>
      </div>

      {/* ── ROW 2: AI Insights (Full Width Hero) ── */}
      <div className="card p-0 overflow-hidden border border-teal-100/60 bg-gradient-to-br from-teal-50/80 via-teal-50/50 to-teal-100/50">
        {/* Header bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-teal-100/40 bg-white/40 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-md shadow-teal-200/50">
              <Lightbulb className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-teal-900 tracking-tight">
                AI Insights
              </h3>
              <p className="text-[10px] text-teal-600 font-medium">Powered by smart analytics</p>
            </div>
          </div>
          <button
            id="refresh-insights-btn"
            onClick={onRefreshInsights}
            disabled={isLoadingInsights}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-teal-700 hover:text-teal-800 bg-white/70 hover:bg-white border border-teal-200/50 shadow-sm transition-all active:scale-95"
            title="Refresh AI Insights"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingInsights ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="p-6">
          {isLoadingInsights ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-28 bg-white/50 rounded-2xl animate-pulse" />
              ))}
              <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 bg-white/40 rounded-xl animate-pulse" />
                ))}
              </div>
            </div>
          ) : insights ? (
            <div className="space-y-5">
              {/* ── Hero Row: Top Seller + Tomorrow's Tip ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Top Seller Card */}
                {insights.top_item && (
                  <div className="relative group p-5 rounded-2xl bg-white/60 backdrop-blur-sm border border-white/80 shadow-sm hover:bg-white/80 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 overflow-hidden">
                    <div className="relative flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 shadow-inner">
                        <Star className="w-6 h-6 text-amber-500 drop-shadow-sm" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-amber-600 uppercase tracking-[0.15em] mb-1">
                          🏆 Top Seller
                        </p>
                        <p className="text-xl font-extrabold text-slate-800 leading-tight truncate drop-shadow-sm">
                          {insights.top_item}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1.5 font-medium">Best-performing product</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tomorrow's Tip Card */}
                {insights.suggestion && (
                  <div className="relative group p-5 rounded-2xl bg-white/60 backdrop-blur-sm border border-white/80 shadow-sm hover:bg-white/80 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 overflow-hidden">
                    <div className="relative flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center shrink-0 shadow-inner">
                        <Target className="w-6 h-6 text-teal-600 drop-shadow-sm" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-teal-600 uppercase tracking-[0.15em] mb-1">
                          💡 Tomorrow&apos;s Tip
                        </p>
                        <p className="text-sm font-bold text-slate-800 leading-snug drop-shadow-sm">
                          {insights.suggestion}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Insight Bullets ── */}
              {insights.insights.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {insights.insights.map((insight, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-4 rounded-xl bg-white/60 backdrop-blur-sm border border-white/80 shadow-sm hover:bg-white/80 hover:shadow-md transition-all duration-200"
                    >
                      <div className="w-6 h-6 rounded-lg bg-teal-100 flex items-center justify-center shrink-0 mt-0.5">
                        <Zap className="w-3 h-3 text-teal-600" />
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed font-medium">{insight}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-white/50 flex items-center justify-center">
                <Lightbulb className="w-7 h-7 text-teal-300" />
              </div>
              <p className="text-teal-500 text-sm font-medium">Hit refresh to generate AI insights</p>
            </div>
          )}
        </div>
      </div>

      {/* ── ROW 3: Revenue Chart + Udhaar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Revenue Chart */}
        <div className="lg:col-span-2">
          <div className="card p-5 h-full flex flex-col">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-4 shrink-0">
              Revenue Trend
            </h3>
            {revenueChartData.length > 0 ? (
              <div className="flex-1 w-full min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueChartData} barSize={34}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                    <Tooltip
                      contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 11 }}
                      formatter={(value: any) => [`₹${value}`, 'Revenue']}
                    />
                    <Bar dataKey="revenue" fill="#387B8A" radius={[4, 4, 0, 0]} opacity={0.8} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-text-muted text-[11px] text-center py-8">Gathering data...</p>
            )}
          </div>
        </div>

        {/* Udhaar Management Card */}
        <div className="lg:col-span-1">
          <div className="card p-5 h-full flex flex-col bg-rose-50/30 border-rose-100/50">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center">
                <Users className="w-4 h-4 text-rose-600" />
              </div>
              <h3 className="text-xs font-bold text-rose-700 uppercase tracking-wider">
                Udhaar (Credit)
              </h3>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0">
              {isAddingUdhaar ? (
                <form onSubmit={handleAddUdhaar} className="space-y-3 p-3 rounded-2xl bg-white border border-rose-100 shadow-sm animate-fade-in-up">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-bold text-rose-600 uppercase">New Entry</p>
                    <button type="button" onClick={() => setIsAddingUdhaar(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Customer Name"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-300"
                    value={newUdhaar.name}
                    onChange={(e) => setNewUdhaar({ ...newUdhaar, name: e.target.value })}
                  />
                  <input
                    type="number"
                    placeholder="Amount (₹)"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-300"
                    value={newUdhaar.amount}
                    onChange={(e) => setNewUdhaar({ ...newUdhaar, amount: e.target.value })}
                  />
                  <button type="submit" className="w-full py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition-all shadow-sm shadow-rose-200">
                    Save Record
                  </button>
                </form>
              ) : (
                <div className="flex-1 space-y-3 overflow-y-auto max-h-[350px] scrollbar-hide pr-1">
                  {udhaarList.map((person) => (
                    <div key={person.id} className="flex items-center justify-between p-2.5 rounded-xl bg-white/60 border border-rose-100/50 hover:bg-white transition-all shadow-sm">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{person.name}</p>
                        <p className="text-[10px] text-slate-400">{person.date}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-black text-rose-600 shrink-0">₹{person.amount}</p>
                        <button 
                          onClick={() => removeUdhaar(person.id)}
                          className="p-1 rounded-md text-rose-300 hover:text-rose-600 hover:bg-rose-50 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button 
                    onClick={() => setIsAddingUdhaar(true)}
                    className="w-full py-3 border-2 border-dashed border-rose-200 rounded-xl text-rose-400 hover:text-rose-500 hover:bg-rose-50 hover:border-rose-300 transition-all text-[11px] font-bold flex items-center justify-center gap-2"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Udhaar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 3: Details Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Item Distribution Pie */}
        <div className="card p-5 h-full flex flex-col">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">
            Item Distribution
          </h3>
          {pieData.length > 0 ? (
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={2} dataKey="value">
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, fontSize: 13 }} formatter={(value: any) => [value, 'Quantity']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {pieData.map((item, index) => {
                  const total = pieData.reduce((sum, d) => sum + d.value, 0);
                  const percentage = ((item.value / total) * 100).toFixed(1);
                  return (
                    <div key={item.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                        <span className="text-text-secondary">{item.name}</span>
                      </div>
                      <span className="font-semibold text-text-primary">{percentage}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center py-8">
              <p className="text-text-muted text-sm italic">No items sold yet</p>
            </div>
          )}
        </div>

        {/* Recent Sales */}
        <div className="card p-5 h-full flex flex-col">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">
            Recent Sales
          </h3>
          <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[400px] pr-1">
            {recentSaleEntries.length === 0 ? (
              <p className="text-text-muted text-sm text-center py-4 italic">No recordings yet</p>
            ) : (
              recentSaleEntries.map((entry, i) => (
                <div key={entry.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors animate-fade-in-up" style={{ animationDelay: `${i * 0.05}s` }}>
                  <div>
                    <p className="text-sm font-medium text-text-primary line-clamp-1">
                      {entry.items?.map((item) => item.name).join(', ')}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">{entry.date}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-600">+₹{entry.items.reduce((s, i) => s + i.total, 0)}</p>
                      <p className="text-[10px] text-text-muted">
                        {entry.items.reduce((sum, item) => {
                          const qty = typeof item.qty === 'number' && item.qty > 0 ? item.qty : 1;
                          return sum + qty;
                        }, 0)} units
                      </p>
                    </div>
                    <button onClick={() => onDeleteEntry(entry.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Expenses */}
        <div className="card p-5 h-full flex flex-col">
          <h3 className="text-sm font-semibold text-red-500 uppercase tracking-wider mb-4">
            Recent Expenses
          </h3>
          <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[400px] pr-1">
            {recentExpenseEntries.length === 0 ? (
              <p className="text-text-muted text-sm text-center py-4 italic">No expenses yet</p>
            ) : (
              recentExpenseEntries.map((entry, i) => (
                <div key={`exp-${entry.id}`} className="flex items-center justify-between p-3 rounded-xl bg-red-50/40 hover:bg-red-50 transition-colors animate-fade-in-up" style={{ animationDelay: `${i * 0.05}s` }}>
                  <div>
                    <p className="text-sm font-medium text-text-primary line-clamp-1">
                      {entry.items?.map((item) => item.name).join(', ')}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-text-muted">{entry.date}</p>
                      {entry.items?.[0]?.category && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-white text-red-500 border border-red-100 uppercase tracking-tighter">
                          {entry.items[0].category}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-bold text-red-600">-₹{entry.items.reduce((s, i) => s + i.total, 0)}</p>
                    <button onClick={() => onDeleteEntry(entry.id)} className="p-1.5 rounded-lg text-red-200 hover:text-red-600 hover:bg-red-100 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
