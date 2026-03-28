'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardCards from '@/components/DashboardCards';
import { SaleEntry } from '@/lib/supabase';
import { exportPDF, exportExcel } from '@/lib/export-utils';
import { Download, FileText, FileSpreadsheet } from 'lucide-react';

interface InsightsData {
  insights: string[];
  suggestion: string;
  top_item: string;
}

const SALES_CACHE_KEY = 'voicetrace_dashboard';
const INSIGHTS_CACHE_KEY = 'voicetrace_insights';
const SALES_CACHE_TTL = 60_000; // 1 minute for sales data

// Sales data cache (short TTL — refreshes on each visit)
function getCachedSales() {
  try {
    const raw = sessionStorage.getItem(SALES_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.timestamp > SALES_CACHE_TTL) {
      sessionStorage.removeItem(SALES_CACHE_KEY);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

// Insights cache (persists in localStorage — stays until user clicks Refresh)
function getPersistedInsights(): InsightsData | null {
  try {
    const raw = localStorage.getItem(INSIGHTS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persistInsights(data: InsightsData) {
  try {
    localStorage.setItem(INSIGHTS_CACHE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

export default function DashboardPage() {
  const [entries, setEntries] = useState<SaleEntry[]>([]);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Fetch sales data (real-time on page load)
  useEffect(() => {
    const cached = getCachedSales();
    if (cached) {
      setEntries(cached.entries || []);
      setIsLoading(false);
    } else {
      fetch('/api/dashboard')
        .then((res) => res.json())
        .then((data) => {
          setEntries(data.entries || []);
          try {
            sessionStorage.setItem(
              SALES_CACHE_KEY,
              JSON.stringify({ entries: data.entries, timestamp: Date.now() })
            );
          } catch { /* ignore storage errors */ }
        })
        .catch((err) => {
          console.error('Dashboard fetch error:', err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }

    // Load persisted insights (these stay forever until Refresh is clicked)
    const saved = getPersistedInsights();
    if (saved) {
      setInsights(saved);
    }
  }, []);

  // Refresh AI insights ONLY on button click
  const refreshInsights = useCallback(async () => {
    if (entries.length === 0) return;

    setIsLoadingInsights(true);
    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: entries.slice(0, 5) }),
      });
      const data = await res.json();
      setInsights(data);
      persistInsights(data); // Save to localStorage — persists across sessions
    } catch (err) {
      console.error('Insights fetch error:', err);
    } finally {
      setIsLoadingInsights(false);
    }
  }, [entries]);

  // Delete an entry
  const deleteEntry = useCallback(async (id: string) => {
    // Optimistically update UI
    setEntries((prev) => {
      const newEntries = prev.filter((e) => e.id !== id);
      try {
        sessionStorage.setItem(
          SALES_CACHE_KEY,
          JSON.stringify({ entries: newEntries, timestamp: Date.now() })
        );
      } catch { /* ignore */ }
      return newEntries;
    });

    try {
      const res = await fetch(`/api/sales?id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        console.error('Failed to delete entry from database');
      }
    } catch (err) {
      console.error('Delete entry error:', err);
    }
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Main Content */}
      <main className="flex-1 px-4 sm:px-8 py-6">
        <div className="max-w-7xl mx-auto">

          {/* Export Bar */}
          {!isLoading && entries.length > 0 && (
            <div className="flex justify-end mb-5 relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                  bg-white border border-slate-200 text-slate-700
                  hover:bg-slate-50 hover:border-slate-300
                  shadow-sm transition-all duration-200 active:scale-95"
              >
                <Download className="w-4 h-4" />
                Export
              </button>

              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 z-50 w-56 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden animate-fade-in-up">
                    <button
                      onClick={() => { exportPDF(entries); setShowExportMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-red-500" />
                      </div>
                      <div>
                        <p className="font-semibold">Export as PDF</p>
                        <p className="text-xs text-slate-400">Formatted summary report</p>
                      </div>
                    </button>
                    <div className="border-t border-slate-100" />
                    <button
                      onClick={() => { exportExcel(entries); setShowExportMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div>
                        <p className="font-semibold">Export as Excel</p>
                        <p className="text-xs text-slate-400">Multi-sheet workbook</p>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Loading State */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="card p-6 animate-pulse">
                  <div className="h-4 bg-surface-light rounded w-1/2 mb-4" />
                  <div className="h-8 bg-surface-light rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : (
            <DashboardCards
              entries={entries}
              insights={insights}
              isLoadingInsights={isLoadingInsights}
              onRefreshInsights={refreshInsights}
              onDeleteEntry={deleteEntry}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full px-4 py-4 text-center border-t border-border">
        <p className="text-text-muted text-xs">
          Built for street vendors · Powered by AI
        </p>
      </footer>
    </div>
  );
}
