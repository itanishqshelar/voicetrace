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
} from 'lucide-react';
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

const CHART_COLORS = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

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
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-indigo-600" />
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

      {/* ── ROW 2: Content Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* AI Insights */}
        <div className="lg:col-span-1">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                  <Lightbulb className="w-4 h-4 text-violet-600" />
                </div>
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                  AI Insights
                </h3>
              </div>
              <button
                id="refresh-insights-btn"
                onClick={onRefreshInsights}
                disabled={isLoadingInsights || entries.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                  bg-indigo-50 hover:bg-indigo-100
                  text-indigo-600 hover:text-indigo-700
                  border border-indigo-100 hover:border-indigo-200
                  disabled:opacity-40 disabled:cursor-not-allowed
                  transition-all duration-200
                  active:scale-95 cursor-pointer"
                title="Refresh AI Insights"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingInsights ? 'animate-spin' : ''}`} />
                {isLoadingInsights ? 'Analyzing...' : 'Refresh'}
              </button>
            </div>

            {isLoadingInsights ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-4 bg-surface-light rounded animate-pulse" style={{ width: `${80 - i * 15}%` }} />
                ))}
              </div>
            ) : insights ? (
              <div className="space-y-3">
                {insights.insights.map((insight, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 animate-fade-in-up"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  >
                    <Lightbulb className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                    <p className="text-text-secondary text-sm leading-relaxed">{insight}</p>
                  </div>
                ))}
                {(insights.suggestion || insights.top_item) && (
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    {insights.suggestion && (
                      <div className="flex flex-col items-center pt-5 pb-3 px-3 rounded-2xl bg-gradient-to-br from-sky-50 to-sky-100/50 border border-sky-100 animate-fade-in-up aspect-square text-center shadow-sm hover:shadow-md transition-all duration-300 group" style={{ animationDelay: '0.3s' }}>
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-2 shrink-0 group-hover:scale-110 transition-transform duration-300">
                          <Target className="w-4 h-4 md:w-5 md:h-5 text-sky-500" />
                        </div>
                        <p className="text-[9px] md:text-[10px] font-bold text-sky-600 uppercase tracking-widest mb-2 shrink-0">Tomorrow&apos;s Tip</p>
                        <div className="flex-1 w-full overflow-y-auto scrollbar-thin scrollbar-thumb-sky-200 hover:scrollbar-thumb-sky-300 px-1">
                          <p className="text-[11px] md:text-xs text-sky-950 font-medium leading-relaxed pb-1">{insights.suggestion}</p>
                        </div>
                      </div>
                    )}
                    {insights.top_item && (
                      <div className="flex flex-col items-center pt-5 pb-3 px-3 rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-100 animate-fade-in-up aspect-square text-center shadow-sm hover:shadow-md transition-all duration-300 group" style={{ animationDelay: '0.4s' }}>
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-2 shrink-0 group-hover:scale-110 transition-transform duration-300">
                          <Star className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
                        </div>
                        <p className="text-[9px] md:text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2 shrink-0">Top Seller</p>
                        <div className="flex-1 w-full overflow-y-auto scrollbar-thin scrollbar-thumb-amber-200 hover:scrollbar-thumb-amber-300 px-1 flex flex-col justify-center">
                          <p className="text-xs md:text-sm text-amber-950 font-bold leading-tight pb-1">{insights.top_item}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-text-muted text-sm">
                Click <span className="font-semibold text-indigo-500">Refresh</span> to generate AI-powered insights from your sales data.
              </p>
            )}
          </div>
        </div>

        {/* Charts and Recent Sales */}
        <div className="lg:col-span-2 space-y-5">
          {/* Revenue Bar Chart */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">
              Daily Revenue
            </h3>
            {revenueChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenueChartData} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, fontSize: 13 }}
                    formatter={(value: any) => [`₹${value}`, 'Revenue']}
                  />
                  <Bar dataKey="revenue" fill="#4F46E5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-text-muted text-sm text-center py-8">No revenue data yet</p>
            )}
          </div>

          {/* Item Distribution and Recent Sales/Expenses */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Item Distribution Pie */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">
                Item Distribution
              </h3>
              {pieData.length > 0 ? (
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={85}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, fontSize: 13 }}
                        formatter={(value: any) => [value, 'Quantity']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {pieData.map((item, index) => {
                      const total = pieData.reduce((sum, d) => sum + d.value, 0);
                      const percentage = ((item.value / total) * 100).toFixed(1);
                      return (
                        <div key={item.name} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                            />
                            <span className="text-text-secondary">{item.name}</span>
                          </div>
                          <span className="font-semibold text-text-primary">{percentage}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-text-muted text-sm text-center py-8">No item data yet</p>
              )}
            </div>

            {/* Recent Sales & Expenses Container */}
            <div className="flex flex-col gap-5">
              {/* Recent Sales */}
              <div className="card p-5 flex flex-col">
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">
                  Recent Sales
                </h3>
                {recentSaleEntries.length === 0 ? (
                  <p className="text-text-muted text-sm text-center py-4">
                    No sales recorded yet.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1 pb-1 scrollbar-thin scrollbar-thumb-slate-200 hover:scrollbar-thumb-slate-300">
                    {recentSaleEntries.map((entry, i) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors animate-fade-in-up"
                        style={{ animationDelay: `${i * 0.05}s` }}
                      >
                        <div>
                          <p className="text-sm font-medium text-text-primary">
                            {entry.items?.map((item) => item.name).join(', ')}
                          </p>
                          <p className="text-xs text-text-muted mt-0.5">{entry.date}</p>
                        </div>
                        <div className="flex items-center">
                          <div className="text-right">
                            <p className="text-base font-bold text-emerald-600">
                              +₹{entry.items.reduce((s, i) => s + i.total, 0)}
                            </p>
                            <p className="text-xs text-text-muted">
                              {entry.items?.length || 0} items
                            </p>
                          </div>
                          <button
                            onClick={() => onDeleteEntry(entry.id)}
                            className="p-1.5 ml-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-200 transition-colors"
                            title="Delete entry"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Expenses */}
              <div className="card p-5 flex flex-col">
                <h3 className="text-sm font-semibold text-red-500 uppercase tracking-wider mb-4">
                  Recent Expenses
                </h3>
                {recentExpenseEntries.length === 0 ? (
                  <p className="text-text-muted text-sm text-center py-4">
                    No expenses recorded yet.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1 pb-1 scrollbar-thin scrollbar-thumb-slate-200 hover:scrollbar-thumb-slate-300">
                    {recentExpenseEntries.map((entry, i) => (
                      <div
                        key={`exp-${entry.id}`}
                        className="flex items-center justify-between p-3 rounded-xl bg-red-50/50 hover:bg-red-50 transition-colors animate-fade-in-up"
                        style={{ animationDelay: `${i * 0.05}s` }}
                      >
                        <div>
                          <p className="text-sm font-medium text-text-primary">
                            {entry.items?.map((item) => item.name).join(', ')}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-text-muted">{entry.date}</p>
                            {entry.items?.[0]?.category && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-600">
                                {CATEGORY_LABELS[entry.items[0].category] || entry.items[0].category}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center">
                          <div className="text-right">
                            <p className="text-base font-bold text-red-600">
                              -₹{entry.items.reduce((s, i) => s + i.total, 0)}
                            </p>
                          </div>
                          <button
                            onClick={() => onDeleteEntry(entry.id)}
                            className="p-1.5 ml-2 rounded-lg text-red-300 hover:text-red-600 hover:bg-red-100 transition-colors"
                            title="Delete entry"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
