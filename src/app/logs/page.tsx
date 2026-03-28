"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Mic,
  Trash2,
  TrendingUp,
  TrendingDown,
  Flag,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Sparkles,
} from "lucide-react";
import {
  VoiceLog,
  getVoiceLogs,
  clearVoiceLogs,
  deleteVoiceLog,
  getFlaggedLogs,
  getSavedLogs,
  mergeVoiceLogs,
} from "@/lib/voice-logs";
import {
  TextHighlight,
  HIGHLIGHT_COLORS,
  HighlightType,
} from "@/lib/highlight-detection";
import WaveformPlayer, {
  type WaveformRegion,
} from "@/components/WaveformPlayer";

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterTab = "all" | "flagged" | "saved";

// ── Highlighted Transcript ────────────────────────────────────────────────────

/**
 * Renders the transcript with coloured inline spans for each detected highlight.
 * Hovering a span fires onHoverIdx so the corresponding chip glows too.
 */
function HighlightedTranscript({
  transcript,
  highlights,
  hoveredIdx,
  onHoverIdx,
}: {
  transcript: string;
  highlights: TextHighlight[];
  hoveredIdx: number | null;
  onHoverIdx: (idx: number | null) => void;
}) {
  if (!highlights.length) {
    return (
      <p className="text-sm text-text-secondary leading-relaxed">
        &ldquo;{transcript}&rdquo;
      </p>
    );
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const h of highlights) {
    // Plain text segment before this highlight
    if (h.startIndex > lastIndex) {
      parts.push(
        <span key={`plain-${lastIndex}`} className="text-text-secondary">
          {transcript.slice(lastIndex, h.startIndex)}
        </span>,
      );
    }

    const colors = HIGHLIGHT_COLORS[h.type as HighlightType];
    const isHovered = hoveredIdx === h.startIndex;

    parts.push(
      <span
        key={`hl-${h.startIndex}`}
        onMouseEnter={() => onHoverIdx(h.startIndex)}
        onMouseLeave={() => onHoverIdx(null)}
        title={`${colors.label}: "${h.text}"`}
        className={[
          "inline-block rounded px-0.5 mx-px font-medium border cursor-default",
          "transition-all duration-150",
          isHovered ? colors.bgHover : colors.bg,
          colors.text,
          isHovered ? colors.borderHover : colors.border,
          isHovered ? `ring-2 ring-offset-1 ${colors.ring} shadow-sm` : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {transcript.slice(h.startIndex, h.endIndex)}
      </span>,
    );

    lastIndex = h.endIndex;
  }

  // Remaining plain text
  if (lastIndex < transcript.length) {
    parts.push(
      <span key={`plain-${lastIndex}`} className="text-text-secondary">
        {transcript.slice(lastIndex)}
      </span>,
    );
  }

  return (
    <p className="text-sm leading-relaxed select-text">&ldquo;{parts}&rdquo;</p>
  );
}

// ── Highlight Chip ────────────────────────────────────────────────────────────

/**
 * Pill badge for a single detected highlight.
 * Hovering fires onMouseEnter so the corresponding transcript span glows.
 */
function HighlightChip({
  highlight,
  isHovered,
  onMouseEnter,
  onMouseLeave,
}: {
  highlight: TextHighlight;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const colors = HIGHLIGHT_COLORS[highlight.type as HighlightType];
  return (
    <span
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={[
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full",
        "text-[11px] font-semibold border cursor-default",
        "transition-all duration-150",
        isHovered ? colors.bgHover : colors.bg,
        colors.text,
        isHovered ? colors.borderHover : colors.border,
        isHovered
          ? `ring-2 ring-offset-1 ${colors.ring} scale-105 shadow-sm`
          : "hover:opacity-80",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors.dot}`} />
      {colors.label}: {highlight.text}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diff / 86_400_000);
  return `${days}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── Log Card ──────────────────────────────────────────────────────────────────

function LogCard({
  log,
  onDelete,
}: {
  log: VoiceLog;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  /**
   * hoveredIdx stores the startIndex of whichever highlight is currently
   * being hovered — either via a chip or its corresponding transcript span.
   * Both components read this value; either one can set it.
   */
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const isFlagged = log.hasAnomaly && !log.saved;

  const borderColor = isFlagged
    ? "border-l-amber-400"
    : log.saved
      ? "border-l-emerald-400"
      : "border-l-slate-200";

  const saleItems =
    log.analyzedData?.items.filter((i) => i.type === "sale") ?? [];
  const expenseItems =
    log.analyzedData?.items.filter((i) => i.type === "expense") ?? [];

  // Waveform regions — only highlights enriched with audio timestamps.
  // startTime / endTime are populated by enrichHighlightsWithTime() in page.tsx
  // using the word-level timestamps returned by Groq Whisper verbose_json.
  const waveformRegions: WaveformRegion[] = log.highlights
    .filter((h) => h.startTime != null && h.endTime != null)
    .map((h) => ({
      startTime: h.startTime!,
      endTime: h.endTime!,
      type: h.type,
      text: h.text,
    }));

  return (
    <div
      className={`card border-l-4 ${borderColor} transition-shadow duration-200`}
    >
      <div className="p-4">
        {/* ── Header row ── */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isFlagged ? "bg-amber-100" : "bg-indigo-100"
              }`}
            >
              {isFlagged ? (
                <Flag className="w-4 h-4 text-amber-600" />
              ) : (
                <Mic className="w-4 h-4 text-indigo-600" />
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-text-muted flex-wrap">
              <Clock className="w-3 h-3" />
              <span>{timeAgo(log.timestamp)}</span>
              <span>·</span>
              <span>{formatDate(log.timestamp)}</span>
            </div>
          </div>

          {/* Status badges + controls */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {log.saved && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" />
                Saved
              </span>
            )}
            {isFlagged && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                <AlertTriangle className="w-3 h-3" />
                Needs Review
              </span>
            )}
            {!log.saved && !log.hasAnomaly && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                Unsaved
              </span>
            )}
            <button
              onClick={() => onDelete(log.id)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Delete this log"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setExpanded((e) => !e)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-light transition-colors"
              title={expanded ? "Collapse" : "Expand details"}
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* ── Transcript with cross-linked hover highlights ── */}
        <div className="mb-3">
          <HighlightedTranscript
            transcript={log.transcript}
            highlights={log.highlights}
            hoveredIdx={hoveredIdx}
            onHoverIdx={setHoveredIdx}
          />
        </div>

        {/* ── Highlight chips — hovering one glows the transcript span ── */}
        {log.highlights.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {log.highlights.map((h) => (
              <HighlightChip
                key={h.startIndex}
                highlight={h}
                isHovered={hoveredIdx === h.startIndex}
                onMouseEnter={() => setHoveredIdx(h.startIndex)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            ))}
          </div>
        )}

        {/* ── Waveform player with coloured highlight regions ──────────── */}
        {/* Shown whenever a Supabase Storage URL is available.            */}
        {/* Regions appear for highlights that carry audio timestamps;     */}
        {/* older logs without timestamps play as plain audio.             */}
        {log.audioUrl && (
          <WaveformPlayer
            audioUrl={log.audioUrl}
            regions={waveformRegions}
            textHighlights={log.highlights}
            transcript={log.transcript}
          />
        )}

        {/* ── Anomaly flag banner (unflagged version: always visible) ── */}
        {isFlagged && log.anomalyMessage && (
          <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 animate-fade-in-up">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800 mb-1">
                  ⚠ Price Mismatch — Interpretation Incomplete
                </p>
                {log.anomalyMessage.split("\n").map((line, i) => (
                  <p key={i} className="text-xs text-amber-700 leading-relaxed">
                    {line}
                  </p>
                ))}
                <p className="text-xs text-amber-500 mt-2">
                  Go to Home to re-record with the correct amount, or save the
                  best-guess values.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Expand hint when analysis data exists but card is collapsed ── */}
        {!expanded && log.analyzedData && (
          <button
            onClick={() => setExpanded(true)}
            className="mt-2 text-xs text-text-muted hover:text-primary transition-colors flex items-center gap-1"
          >
            <BarChart3 className="w-3 h-3" />
            View breakdown
          </button>
        )}

        {/* ── Expanded: items breakdown ── */}
        {expanded && log.analyzedData && (
          <div className="mt-4 pt-4 border-t border-border animate-fade-in-up">
            {/* Sales */}
            {saleItems.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">
                    Sales
                  </span>
                </div>
                <div className="space-y-1">
                  {saleItems.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm bg-emerald-50/60 rounded-lg px-3 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-primary">
                          {item.name}
                        </span>
                        <span className="text-text-muted text-xs">
                          × {item.qty} @ ₹{item.price}
                        </span>
                      </div>
                      <span className="font-semibold text-emerald-600">
                        +₹{item.total}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Expenses */}
            {expenseItems.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-[11px] font-semibold text-red-600 uppercase tracking-wider">
                    Expenses
                  </span>
                </div>
                <div className="space-y-1">
                  {expenseItems.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm bg-red-50/60 rounded-lg px-3 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-primary">
                          {item.name}
                        </span>
                        {item.category && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">
                            {item.category}
                          </span>
                        )}
                      </div>
                      <span className="font-semibold text-red-600">
                        -₹{item.total}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Totals */}
            <div className="pt-3 border-t border-border space-y-1">
              {log.analyzedData.total_earnings > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">Total Earnings</span>
                  <span className="font-semibold text-emerald-600">
                    +₹{log.analyzedData.total_earnings}
                  </span>
                </div>
              )}
              {(log.analyzedData.total_expenses ?? 0) > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">Total Expenses</span>
                  <span className="font-semibold text-red-600">
                    -₹{log.analyzedData.total_expenses}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1.5 border-t border-border">
                <span className="font-semibold text-text-primary">Net</span>
                <span
                  className={`text-lg font-bold ${
                    log.analyzedData.total_earnings -
                      (log.analyzedData.total_expenses ?? 0) >=
                    0
                      ? "text-primary"
                      : "text-red-600"
                  }`}
                >
                  ₹
                  {log.analyzedData.total_earnings -
                    (log.analyzedData.total_expenses ?? 0)}
                </span>
              </div>
            </div>

            {/* Saved-with-anomaly note (softer, since it's already resolved) */}
            {log.hasAnomaly && log.saved && log.anomalyMessage && (
              <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1">
                      Mismatch was detected — saved with best-guess values
                    </p>
                    {log.anomalyMessage.split("\n").map((line, i) => (
                      <p
                        key={i}
                        className="text-xs text-slate-400 leading-relaxed"
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  value,
  label,
  color = "text-text-primary",
}: {
  value: number | string;
  label: string;
  color?: string;
}) {
  return (
    <div className="card p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-text-muted mt-1">{label}</p>
    </div>
  );
}

// ── Filter Button ─────────────────────────────────────────────────────────────

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
        active
          ? "bg-primary text-white shadow-sm"
          : "text-text-secondary hover:text-text-primary hover:bg-white/60"
      }`}
    >
      {children}
    </button>
  );
}

// ── Highlight Legend ──────────────────────────────────────────────────────────

function HighlightLegend() {
  const types: HighlightType[] = ["quantity", "money", "time", "item"];
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs text-text-muted font-medium">Highlights:</span>
      {types.map((type) => {
        const c = HIGHLIGHT_COLORS[type];
        return (
          <span
            key={type}
            className={`inline-flex items-center gap-1 text-xs font-medium ${c.text}`}
          >
            <span className={`w-2 h-2 rounded-full ${c.dot}`} />
            {c.label}
          </span>
        );
      })}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: FilterTab }) {
  const messages: Record<FilterTab, { title: string; body: string }> = {
    all: {
      title: "No voice logs yet",
      body: "Record your first voice session on the Home page. Every session — including those with anomalies — will appear here automatically.",
    },
    flagged: {
      title: "No flagged sessions",
      body: "All clear! Sessions with unresolved price mismatches will appear here. Any anomaly that hasn't been saved to the Dashboard will be flagged.",
    },
    saved: {
      title: "No saved sessions",
      body: "Sessions saved to the Dashboard will show here. Tap 'Save to Dashboard' on the Home page after recording.",
    },
  };
  const { title, body } = messages[filter];
  return (
    <div className="card p-12 text-center animate-fade-in-up">
      <div className="w-16 h-16 rounded-2xl bg-surface-light flex items-center justify-center mx-auto mb-4">
        <Mic className="w-8 h-8 text-text-muted" />
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
      <p className="text-text-muted text-sm max-w-sm mx-auto leading-relaxed">
        {body}
      </p>
    </div>
  );
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="card p-4 animate-pulse">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-surface-light" />
            <div className="h-3 bg-surface-light rounded w-36" />
          </div>
          <div className="h-4 bg-surface-light rounded w-full mb-2" />
          <div className="h-4 bg-surface-light rounded w-3/4 mb-3" />
          <div className="flex gap-2">
            <div className="h-5 bg-surface-light rounded-full w-24" />
            <div className="h-5 bg-surface-light rounded-full w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const [logs, setLogs] = useState<VoiceLog[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // 1. Load localStorage immediately for instant render
    const local = getVoiceLogs();
    setLogs(local);
    setIsLoaded(true);

    // 2. Fetch from Supabase and merge (gives cross-device persistence
    //    and fills in audioUrl for entries uploaded after initial log creation)
    fetch("/api/voice-logs")
      .then((r) => r.json())
      .then((data: { logs?: VoiceLog[] }) => {
        if (data.logs && data.logs.length > 0) {
          setLogs((prev) => {
            const merged = mergeVoiceLogs(prev, data.logs!);
            return merged;
          });
        }
      })
      .catch(() => {
        // Supabase not configured or offline — localStorage remains the store
      });
  }, []);

  const flaggedCount = getFlaggedLogs(logs).length;
  const savedCount = getSavedLogs(logs).length;

  const filtered = logs.filter((log) => {
    if (filter === "flagged") return log.hasAnomaly && !log.saved;
    if (filter === "saved") return log.saved;
    return true;
  });

  const handleDelete = useCallback((id: string) => {
    deleteVoiceLog(id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const handleClearAll = useCallback(() => {
    if (!confirm("Clear all voice logs? This cannot be undone.")) return;
    clearVoiceLogs();
    setLogs([]);
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-background">
      <main className="flex-1 px-4 sm:px-8 py-6">
        <div className="max-w-4xl mx-auto">
          {/* ── Page header ── */}
          <div className="flex items-start justify-between mb-6 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <h1 className="text-2xl font-bold text-text-primary">
                  Voice Logs
                </h1>
              </div>
              <p className="text-text-muted text-sm">
                Full history of every recorded session — transcripts, detected
                highlights, audio playback, and anomaly flags.
              </p>
            </div>
            {logs.length > 0 && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Clear All</span>
              </button>
            )}
          </div>

          {/* ── Stat cards ── */}
          {isLoaded && logs.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-6">
              <StatCard value={logs.length} label="Total Sessions" />
              <StatCard
                value={flaggedCount}
                label="Needs Review"
                color={
                  flaggedCount > 0 ? "text-amber-600" : "text-text-primary"
                }
              />
              <StatCard
                value={savedCount}
                label="Saved"
                color={
                  savedCount > 0 ? "text-emerald-600" : "text-text-primary"
                }
              />
            </div>
          )}

          {/* ── Filter tabs + legend row ── */}
          {isLoaded && logs.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                <FilterButton
                  active={filter === "all"}
                  onClick={() => setFilter("all")}
                >
                  All ({logs.length})
                </FilterButton>
                <FilterButton
                  active={filter === "flagged"}
                  onClick={() => setFilter("flagged")}
                >
                  ⚑ Flagged ({flaggedCount})
                </FilterButton>
                <FilterButton
                  active={filter === "saved"}
                  onClick={() => setFilter("saved")}
                >
                  ✓ Saved ({savedCount})
                </FilterButton>
              </div>
              <HighlightLegend />
            </div>
          )}

          {/* ── Content ── */}
          {!isLoaded && <Skeleton />}

          {isLoaded && filtered.length === 0 && <EmptyState filter={filter} />}

          {isLoaded && filtered.length > 0 && (
            <div className="space-y-3">
              {filtered.map((log) => (
                <LogCard key={log.id} log={log} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="w-full px-4 py-4 text-center border-t border-border">
        <p className="text-text-muted text-xs">
          Built for street vendors · Powered by AI
        </p>
      </footer>
    </div>
  );
}
