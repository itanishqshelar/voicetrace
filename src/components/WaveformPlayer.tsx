"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause } from "lucide-react";
import {
  HIGHLIGHT_COLORS,
  HighlightType,
  type TextHighlight,
} from "@/lib/highlight-detection";

// ── Region colour tokens ──────────────────────────────────────────────────────
// Semi-transparent fill + solid border so regions are clearly visible
// while still showing the waveform underneath.

const REGION_FILL: Record<HighlightType, string> = {
  quantity: "rgba(16,  185, 129, 0.25)",
  money: "rgba(245, 158,  11, 0.25)",
  time: "rgba( 14, 165, 233, 0.25)",
  item: "rgba(139,  92, 246, 0.25)",
};

const REGION_BORDER: Record<HighlightType, string> = {
  quantity: "rgba(16,  185, 129, 0.85)",
  money: "rgba(245, 158,  11, 0.85)",
  time: "rgba( 14, 165, 233, 0.85)",
  item: "rgba(139,  92, 246, 0.85)",
};

// ── Public types ──────────────────────────────────────────────────────────────

/** A single coloured segment to overlay on the waveform */
export interface WaveformRegion {
  startTime: number;
  endTime: number;
  type: HighlightType;
  text: string;
}

interface WaveformPlayerProps {
  audioUrl: string;
  /** Precise regions derived from Groq word-level timestamps */
  regions?: WaveformRegion[];
  /**
   * Text-based highlights (startIndex / endIndex in the transcript).
   * Used to estimate region positions when word timestamps are unavailable.
   */
  textHighlights?: TextHighlight[];
  /** Full transcript string — required for the character-offset estimation */
  transcript?: string;
}

// ── Minimal local interfaces for the WaveSurfer objects we interact with.
// Using local types avoids the complex import chain of wavesurfer.js's .d.ts
// files while still giving us useful type safety in this file.

interface WsRegion {
  element: HTMLElement | null;
  start: number;
  end: number;
  play(stopAtEnd?: boolean): void;
  on(
    event: "click" | "over" | "leave" | "remove" | "play",
    cb: (e?: Event) => void,
  ): void;
}

interface WsRegionsPlugin {
  addRegion(params: {
    start: number;
    end: number;
    color: string;
    drag: boolean;
    resize: boolean;
    content?: string | HTMLElement;
  }): WsRegion;
  clearRegions(): void;
}

interface WsInstance {
  on(event: string, cb: (...args: unknown[]) => void): () => void;
  play(start?: number, end?: number): Promise<void>;
  playPause(): Promise<void>;
  pause(): void;
  getDuration(): number;
  isPlaying(): boolean;
  destroy(): void;
  registerPlugin<T>(plugin: T): T;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(secs: number): string {
  if (!isFinite(secs) || isNaN(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Estimate waveform regions from character positions when Groq word-level
 * timestamps are not available.
 *
 * Speech is roughly linear, so character-offset / total-length × duration
 * gives a good enough approximation for short recordings (< 30 s).
 * A small padding (±80 ms) is added so narrow phrases are still visible.
 */
function estimateRegions(
  highlights: TextHighlight[],
  transcript: string,
  duration: number,
): WaveformRegion[] {
  if (!highlights.length || !transcript || duration <= 0) return [];
  const len = transcript.length;
  return highlights
    .map((h) => ({
      startTime: Math.max(0, (h.startIndex / len) * duration - 0.08),
      endTime: Math.min(duration, (h.endIndex / len) * duration + 0.08),
      type: h.type,
      text: h.text,
    }))
    .filter((r) => r.endTime > r.startTime + 0.01);
}

export default function WaveformPlayer({
  audioUrl,
  regions = [],
  textHighlights = [],
  transcript = "",
}: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WsInstance | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);

  /** Region currently under the cursor (drives the tooltip bar) */
  const [hovered, setHovered] = useState<WaveformRegion | null>(null);

  // Stable refs so the 'ready' handler always sees the latest prop values
  // without causing WaveSurfer to re-initialise on every render.
  const regionsRef = useRef(regions);
  const textHlsRef = useRef(textHighlights);
  const transcriptRef = useRef(transcript);

  useEffect(() => {
    regionsRef.current = regions;
  }, [regions]);
  useEffect(() => {
    textHlsRef.current = textHighlights;
  }, [textHighlights]);
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // ── WaveSurfer initialisation ───────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    let alive = true; // guard against state updates after unmount

    (async () => {
      try {
        // Dynamic imports keep wavesurfer.js out of the SSR bundle entirely.
        const { default: WaveSurfer } = await import("wavesurfer.js");
        const { default: RegionsPlugin } = await import(
          // The CJS wrapper at this path re-exports the ESM class as default.
          "wavesurfer.js/plugins/regions"
        );

        if (!alive || !containerRef.current) return;

        // Create and register the Regions plugin
        const regionsPlugin = (
          RegionsPlugin as unknown as {
            create(): WsRegionsPlugin;
          }
        ).create();

        const ws = WaveSurfer.create({
          container: containerRef.current,
          waveColor: "#CBD5E1", // slate-300 — neutral resting state
          progressColor: "#6366F1", // indigo-500 — matches app primary
          cursorColor: "#4F46E5", // indigo-600
          cursorWidth: 2,
          barWidth: 2,
          barGap: 1,
          barRadius: 3,
          height: 80,
          normalize: true,
          plugins: [regionsPlugin as unknown as never],
        }) as unknown as WsInstance;

        wsRef.current = ws;

        // ── WaveSurfer event listeners ────────────────────────────────────

        ws.on("ready", () => {
          if (!alive) return;
          const dur = ws.getDuration();
          setDuration(dur);
          setIsReady(true);

          // Decide which regions to paint:
          //  1. Precise regions from Groq word timestamps  (best)
          //  2. Estimated regions from character positions (fallback)
          //  3. Nothing — waveform still plays as plain audio
          const timedRegions = regionsRef.current;
          const activeRegions =
            timedRegions.length > 0
              ? timedRegions
              : estimateRegions(textHlsRef.current, transcriptRef.current, dur);

          activeRegions.forEach((r) => {
            const region = regionsPlugin.addRegion({
              start: r.startTime,
              // Ensure a minimum visible width even for very short words
              end: Math.max(r.endTime, r.startTime + 0.08),
              color: REGION_FILL[r.type],
              drag: false,
              resize: false,
            });

            const el = region.element;
            if (el) {
              el.style.cursor = "pointer";
              el.style.borderLeft = `2px solid ${REGION_BORDER[r.type]}`;
              el.style.borderRight = `2px solid ${REGION_BORDER[r.type]}`;
              // Smooth colour change on hover (done via JS since we can't
              // add Tailwind classes to dynamically created DOM elements)
              el.style.transition = "background-color 0.15s ease";

              el.addEventListener("mouseenter", () => {
                if (!alive) return;
                el.style.backgroundColor = REGION_FILL[r.type].replace(
                  /[\d.]+\)$/,
                  "0.45)",
                );
                setHovered(r);
              });

              el.addEventListener("mouseleave", () => {
                if (!alive) return;
                el.style.backgroundColor = REGION_FILL[r.type];
                setHovered(null);
              });

              // Click plays ONLY this segment (stop propagation prevents
              // WaveSurfer's seek-on-click from also firing).
              el.addEventListener("click", (e) => {
                e.stopPropagation();
                try {
                  region.play();
                } catch {
                  ws.play(r.startTime, r.endTime).catch(() => {});
                }
              });
            }
          });
        });

        ws.on("timeupdate", (t) => {
          if (alive) setCurrentTime(t as number);
        });

        ws.on("play", () => {
          if (alive) setIsPlaying(true);
        });
        ws.on("pause", () => {
          if (alive) setIsPlaying(false);
        });
        ws.on("finish", () => {
          if (!alive) return;
          setIsPlaying(false);
          setCurrentTime(0);
        });

        ws.on("error", () => {
          if (alive) setHasError(true);
        });

        ws.play = ws.play.bind(ws);
        ws.on("loading", () => {
          /* suppress */
        });

        // Load the audio — WaveSurfer will decode and render the waveform.
        (ws as unknown as { load(url: string): void }).load(audioUrl);
      } catch (err) {
        console.error("[WaveformPlayer] init error:", err);
        if (alive) setHasError(true);
      }
    })();

    return () => {
      alive = false;
      setHovered(null);
      setIsPlaying(false);
      setIsReady(false);
      setCurrentTime(0);
      setDuration(0);
      setHasError(false);
      try {
        wsRef.current?.destroy();
      } catch {
        // destroy() can throw if called during teardown
      }
      wsRef.current = null;
    };
    // audioUrl is the only dep that should trigger a full re-init.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  // ── Controls ────────────────────────────────────────────────────────────────

  const togglePlay = useCallback(() => {
    if (!wsRef.current || !isReady) return;
    try {
      wsRef.current.playPause();
    } catch {
      // ignore
    }
  }, [isReady]);

  // ── Derived values ───────────────────────────────────────────────────────────

  /** Unique highlight types present in the region list (for the legend) */
  const legendTypes = [
    ...new Set(regions.map((r) => r.type)),
  ] as HighlightType[];

  // ── Error state ──────────────────────────────────────────────────────────────

  if (hasError) {
    return (
      <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-xs text-red-500">
        <svg
          className="w-3.5 h-3.5 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        Audio unavailable — recording may have expired or Supabase Storage is
        not configured.
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="mt-3 rounded-xl border border-border bg-white shadow-sm overflow-hidden">
      {/* ── Hover tooltip bar ─────────────────────────────────────────────── */}
      {/* Always rendered so there's no layout shift when hovering */}
      <div
        className={`
          px-3 py-1.5 border-b border-border flex items-center min-h-[30px]
          transition-colors duration-150
          ${hovered ? "bg-slate-50" : "bg-white"}
        `}
      >
        {hovered ? (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Type chip */}
            <span
              className={`
                inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                text-[11px] font-semibold border
                ${HIGHLIGHT_COLORS[hovered.type].bg}
                ${HIGHLIGHT_COLORS[hovered.type].text}
                ${HIGHLIGHT_COLORS[hovered.type].border}
              `}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${HIGHLIGHT_COLORS[hovered.type].dot}`}
              />
              {HIGHLIGHT_COLORS[hovered.type].label}
            </span>

            {/* Detected text */}
            <span className="text-xs text-text-secondary font-medium">
              &ldquo;{hovered.text}&rdquo;
            </span>

            {/* Hint */}
            <span className="text-[10px] text-text-muted hidden sm:inline">
              · click to play this segment
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-text-muted">
            {regions.length > 0
              ? "Hover a coloured region to see what was detected · click to play that segment"
              : "Audio recording"}
          </span>
        )}
      </div>

      {/* ── Waveform canvas ────────────────────────────────────────────────── */}
      <div className="relative px-3 pt-2 pb-1">
        {/* WaveSurfer mounts its canvas here */}
        <div
          ref={containerRef}
          className={`transition-opacity duration-300 ${isReady ? "opacity-100" : "opacity-0"}`}
        />

        {/* Loading spinner — shown while WaveSurfer is decoding */}
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center min-h-[80px]">
            <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        )}
      </div>

      {/* ── Controls bar ──────────────────────────────────────────────────── */}
      <div className="px-3 pt-1 pb-2.5 border-t border-border flex items-center justify-between gap-3 flex-wrap">
        {/* Play / Pause + time */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={togglePlay}
            disabled={!isReady}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="
              w-7 h-7 rounded-full bg-primary text-white shrink-0
              flex items-center justify-center
              hover:bg-primary-dark transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            {isPlaying ? (
              <Pause className="w-3 h-3" />
            ) : (
              <Play className="w-3 h-3 ml-px" />
            )}
          </button>

          {/* Animated bars while playing */}
          {isPlaying && (
            <div className="flex items-center gap-px h-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="w-0.5 bg-primary rounded-full waveform-bar"
                  style={{ animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>
          )}

          <span className="text-[11px] text-text-muted tabular-nums font-mono">
            {isReady ? `${fmt(currentTime)} / ${fmt(duration)}` : "Loading…"}
          </span>
        </div>

        {/* Region legend — only shown when there are regions */}
        {legendTypes.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            {legendTypes.map((type) => {
              const c = HIGHLIGHT_COLORS[type];
              return (
                <span
                  key={type}
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold ${c.text}`}
                >
                  {/* Small square matches the waveform region colour */}
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ background: REGION_FILL[type] }}
                  />
                  {c.label}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
