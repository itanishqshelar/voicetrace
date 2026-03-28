'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Mic, LayoutDashboard } from 'lucide-react';
import DashboardCards from '@/components/DashboardCards';
import { SaleEntry } from '@/lib/supabase';

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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="w-full px-4 sm:px-8 py-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-4.5 h-4.5">
                <path d="M12 1a4 4 0 00-4 4v7a4 4 0 008 0V5a4 4 0 00-4-4z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2H3v2a9 9 0 004 7.47V22h2v-2.06A8.96 8.96 0 0012 21a8.96 8.96 0 003-.06V22h2v-2.53A9 9 0 0021 12v-2h-2z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-text-primary">VoiceTrace</h1>
          </Link>
        </div>
        <Link
          href="/"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary-dark transition-colors"
        >
          <Mic className="w-4 h-4" />
          Record Sales
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 sm:px-8 py-6">
        <div className="max-w-7xl mx-auto">
          {/* Page Title */}
          <div className="mb-6 animate-fade-in-up">
            <h2 className="text-2xl font-bold text-text-primary mb-1">
              Dashboard
            </h2>
            <p className="text-text-muted text-sm">
              Your sales performance at a glance
            </p>
          </div>

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
