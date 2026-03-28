/**
 * highlight-detection.ts
 *
 * Text-based highlight detection ported from audio-highlight/app/main.py.
 * Detects business-critical phrases in a transcript: quantity, money, time, item.
 *
 * Since VoiceTrace uses Groq Whisper (which returns plain text, not word-level
 * timestamps), this implementation works on raw transcript strings instead of
 * timestamped word tokens.
 */

export type HighlightType = "quantity" | "money" | "time" | "item";

export interface TextHighlight {
  type: HighlightType;
  text: string;
  startIndex: number;
  endIndex: number;
  /** Start time in seconds within the audio recording (populated when word timestamps are available) */
  startTime?: number;
  /** End time in seconds within the audio recording (populated when word timestamps are available) */
  endTime?: number;
}

/** A single word token with its character position in the transcript and audio timestamp */
export interface WordTimestamp {
  word: string;
  start: number; // seconds
  end: number; // seconds
  charStart: number;
  charEnd: number;
}

// ── Lexicons (mirrors the Python sets in main.py) ──────────────────────────

const ITEM_WORDS: string[] = [
  // Beverages
  "chai",
  "chais",
  "tea",
  "teas",
  "coffee",
  "coffees",
  "lassi",
  "juice",
  "nimbu pani",
  "lemonade",
  "shikanji",
  "buttermilk",
  "chaas",
  "mattha",
  // Snacks
  "samosa",
  "samosas",
  "vada pav",
  "vadapav",
  "pakoda",
  "pakode",
  "bhajiya",
  "kachori",
  "kachodi",
  "pav bhaji",
  // Meals
  "thali",
  "biryani",
  "dal rice",
  "dal chawal",
  "poha",
  "upma",
  "roti",
  "rotis",
  "dal",
  "sabji",
  "sabzi",
  // Sweets / extras
  "jalebi",
  "jalebis",
  "kulfi",
  "paan",
  "bread omelette",
  "omelette",
  // Raw ingredients (expense items)
  "milk",
  "sugar",
  "flour",
  "maida",
  "oil",
  "rice",
  "bread",
  "vegetables",
  "atta",
  "dal",

  // ── Devanagari (Hindi script) — catalog aliases ──────────────────────────
  // Beverages
  "चाय",
  "कॉफी",
  "कॉफ़ी",
  "लस्सी",
  "जूस",
  "नींबू पानी",
  "छाछ",
  // Snacks
  "समोसा",
  "समोसे",
  "वडा पाव",
  "वड़ा पाव",
  "पकोड़ा",
  "पकोड़े",
  "कचोरी",
  "पाव भाजी",
  // Meals
  "पोहा",
  "उपमा",
  "थाली",
  "बिरयानी",
  "बिरियानी", // alternate common spelling
  "दाल चावल",
  "दाल",
  "रोटी",
  "रोटियां",
  // Sweets / extras
  "जलेबी",
  "कुल्फी",
  "पान",
  // Raw ingredients
  "दूध",
  "चीनी",
  "आटा",
  "तेल",
  "चावल",
  "सब्जी",
  "सब्ज़ी",
];

// Sort by descending length so multi-word items match first
const SORTED_ITEM_WORDS = [...ITEM_WORDS].sort((a, b) => b.length - a.length);

const TIME_WORDS: string[] = [
  "morning",
  "evening",
  "afternoon",
  "night",
  "noon",
  "midnight",
  "today",
  "tomorrow",
  "yesterday",
  // Hinglish / Hindi romanised
  "subah",
  "shaam",
  "dopahar",
  "raat",
  "savere",
  // Devanagari (Hindi script)
  "आज",
  "कल",
  "परसों",
  "सुबह",
  "शाम",
  "दोपहर",
  "रात",
  "अभी",
];

const CURRENCY_WORDS: string[] = [
  "rupees",
  "rupee",
  "inr",
  // 'rs' matched separately to handle "rs." and "Rs"
];

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  // Devanagari (Hindi) number words
  एक: 1,
  दो: 2,
  तीन: 3,
  चार: 4,
  पांच: 5,
  पाँच: 5,
  छह: 6,
  छः: 6,
  सात: 7,
  आठ: 8,
  नौ: 9,
  दस: 10,
  ग्यारह: 11,
  बारह: 12,
  तेरह: 13,
  चौदह: 14,
  पंद्रह: 15,
  बीस: 20,
  तीस: 30,
  चालीस: 40,
  पचास: 50,
  साठ: 60,
  सत्तर: 70,
  अस्सी: 80,
  नब्बे: 90,
  सौ: 100,
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Returns true when the string contains at least one Devanagari character
 * (Unicode block U+0900–U+097F). Used to switch regex strategy because
 * JavaScript's \b word-boundary anchor only considers ASCII \w chars —
 * it does NOT fire between two Devanagari characters or between a space
 * and a Devanagari character, so we need a different boundary approach.
 */
function hasDevanagari(s: string): boolean {
  return /[\u0900-\u097F]/.test(s);
}

/**
 * Build an item-detection RegExp that respects the script of the search term.
 *  • ASCII items  → \b word-boundaries (existing behaviour)
 *  • Devanagari   → Unicode negative lookbehind/lookahead so the match sits
 *                   between non-Devanagari characters (spaces, punctuation,
 *                   digits, ASCII letters, start/end of string).
 */
function buildItemRegex(item: string, plural = true): RegExp {
  const escaped = escapeRegex(item);
  if (hasDevanagari(item)) {
    // (?<![\u0900-\u097F]) = not preceded by a Devanagari char
    // (?![\u0900-\u097F])  = not followed by a Devanagari char
    return new RegExp(
      `(?<![\\u0900-\\u097F])${escaped}(?![\\u0900-\\u097F])`,
      "gu",
    );
  }
  return new RegExp(`\\b${escaped}${plural ? "s?" : ""}\\b`, "gi");
}

/** Collect all regex matches in a string and map them to TextHighlight objects */
function collectMatches(
  re: RegExp,
  text: string,
  type: HighlightType,
): TextHighlight[] {
  const results: TextHighlight[] = [];
  let m: RegExpExecArray | null;
  const clone = new RegExp(
    re.source,
    re.flags.includes("g") ? re.flags : re.flags + "g",
  );
  while ((m = clone.exec(text)) !== null) {
    const matched = m[0].trim();
    if (!matched) continue;
    // Adjust startIndex if the match started with whitespace
    const offset = m[0].indexOf(matched);
    results.push({
      type,
      text: matched,
      startIndex: m.index + offset,
      endIndex: m.index + offset + matched.length,
    });
  }
  return results;
}

// ── Core detection ───────────────────────────────────────────────────────────

/**
 * Detect money / currency phrases.
 * Examples: ₹100, 100 rupees, Rs 50, Rs. 50, 50 rs, 100 inr
 */
function detectMoney(transcript: string): TextHighlight[] {
  const patterns: RegExp[] = [
    // ₹ symbol followed by number
    /₹\s*\d+(?:[.,]\d+)?/gi,
    // number followed by currency word
    new RegExp(
      `\\d+(?:[.,]\\d+)?\\s*(?:${CURRENCY_WORDS.map(escapeRegex).join("|")})`,
      "gi",
    ),
    // "rs" or "rs." prefix or suffix (word-boundary aware)
    /\brs\.?\s*\d+(?:[.,]\d+)?\b/gi,
    /\b\d+(?:[.,]\d+)?\s*rs\.?\b/gi,
  ];

  const results: TextHighlight[] = [];
  for (const p of patterns) {
    results.push(...collectMatches(p, transcript, "money"));
  }
  return results;
}

/**
 * Detect time references.
 * Examples: 5 pm, 10:30 am, morning, shaam
 */
function detectTime(transcript: string): TextHighlight[] {
  // Split the word list so each script gets the right boundary treatment.
  const asciiWords = TIME_WORDS.filter((w) => !hasDevanagari(w));
  const devanagariWords = TIME_WORDS.filter(hasDevanagari);

  const patterns: RegExp[] = [
    // "5 pm", "5:30 am", "10pm"
    /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi,
  ];

  if (asciiWords.length) {
    patterns.push(
      new RegExp(`\\b(?:${asciiWords.map(escapeRegex).join("|")})\\b`, "gi"),
    );
  }

  if (devanagariWords.length) {
    // No \b — use Devanagari-boundary lookahead/lookbehind instead.
    patterns.push(
      new RegExp(
        `(?<![\\u0900-\\u097F])(?:${devanagariWords.map(escapeRegex).join("|")})(?![\\u0900-\\u097F])`,
        "gu",
      ),
    );
  }

  const results: TextHighlight[] = [];
  for (const p of patterns) {
    results.push(...collectMatches(p, transcript, "time"));
  }
  return results;
}

/**
 * Detect quantity + item phrases.
 * Examples: "2 chai", "10 samosa", "five vada pav"
 * Also detects pure numeric quantities near items.
 */
function detectQuantity(transcript: string): TextHighlight[] {
  const results: TextHighlight[] = [];

  // Build number alternatives — both ASCII and Devanagari number words.
  const numberPattern = `(?:\\d+(?:[.,]\\d+)?|${Object.keys(NUMBER_WORDS).map(escapeRegex).join("|")})`;

  for (const item of SORTED_ITEM_WORDS) {
    const escaped = escapeRegex(item);
    let fwd: RegExp;

    if (hasDevanagari(item)) {
      // For Devanagari items: drop \b anchors entirely.
      // A leading Devanagari number word ("दो") is already separated by
      // spaces in natural Hindi text, so plain adjacency matching is safe.
      fwd = new RegExp(`${numberPattern}\\s+${escaped}`, "gu");
    } else {
      fwd = new RegExp(`\\b${numberPattern}\\s+${escaped}s?\\b`, "gi");
    }

    results.push(...collectMatches(fwd, transcript, "quantity"));
  }

  return results;
}

/**
 * Detect standalone item words not already covered by a quantity phrase.
 */
function detectItems(
  transcript: string,
  existing: TextHighlight[],
): TextHighlight[] {
  const results: TextHighlight[] = [];

  for (const item of SORTED_ITEM_WORDS) {
    // Use the script-aware regex builder so Devanagari items are found
    // without relying on \b word boundaries.
    const re = buildItemRegex(item);
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(transcript)) !== null) {
      const matched = m[0].trim();
      if (!matched) continue;
      const offset = m[0].indexOf(matched);
      const start = m.index + offset;
      const end = start + matched.length;
      // Skip if already covered by an existing highlight
      const overlaps = existing.some(
        (h) => start < h.endIndex && end > h.startIndex,
      );
      if (!overlaps) {
        results.push({
          type: "item",
          text: matched,
          startIndex: start,
          endIndex: end,
        });
      }
    }
  }

  return results;
}

// ── Deduplication / overlap removal ─────────────────────────────────────────

/**
 * Remove duplicate and overlapping spans.
 * Priority: money > quantity > time > item
 * Within same type: keep the longer span.
 */
const TYPE_PRIORITY: Record<HighlightType, number> = {
  money: 0,
  quantity: 1,
  time: 2,
  item: 3,
};

function deduplicateHighlights(highlights: TextHighlight[]): TextHighlight[] {
  // Sort: highest-priority type first, then by startIndex, then by length desc
  const sorted = [...highlights].sort((a, b) => {
    const pd = TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type];
    if (pd !== 0) return pd;
    const sd = a.startIndex - b.startIndex;
    if (sd !== 0) return sd;
    return b.endIndex - b.startIndex - (a.endIndex - a.startIndex);
  });

  const kept: TextHighlight[] = [];
  for (const span of sorted) {
    const overlaps = kept.some(
      (k) => span.startIndex < k.endIndex && span.endIndex > k.startIndex,
    );
    if (!overlaps) {
      kept.push(span);
    }
  }

  // Return in document order
  return kept.sort((a, b) => a.startIndex - b.startIndex);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect all business-critical highlights in a transcript string.
 *
 * Returns an array of non-overlapping TextHighlight spans sorted by
 * their position in the original text.
 */
export function detectHighlights(transcript: string): TextHighlight[] {
  if (!transcript || !transcript.trim()) return [];

  const money = detectMoney(transcript);
  const time = detectTime(transcript);
  const quantity = detectQuantity(transcript);
  const combined = [...money, ...time, ...quantity];
  const items = detectItems(transcript, combined);

  return deduplicateHighlights([...combined, ...items]);
}

// ── Word-position mapping & time enrichment ──────────────────────────────────

/**
 * Given the full transcript string and the words array returned by Groq Whisper
 * (verbose_json format), build a map that associates each word's character
 * position in the transcript with its audio timestamp.
 *
 * Uses sequential forward-search so multi-word phrases and punctuation are
 * handled robustly even when Groq strips or reorders diacritics.
 */
export function buildWordPositionMap(
  transcript: string,
  words: Array<{ word: string; start: number; end: number }>,
): WordTimestamp[] {
  const result: WordTimestamp[] = [];
  const lower = transcript.toLowerCase();
  let searchOffset = 0;

  for (const w of words) {
    if (!w.word.trim()) continue;

    // Strip leading/trailing non-alphanumeric characters for matching
    const stripped = w.word
      .trim()
      .replace(/^[^a-zA-Z0-9\u0900-\u097F₹]+/, "")
      .replace(/[^a-zA-Z0-9\u0900-\u097F₹]+$/, "");

    if (!stripped) continue;

    const idx = lower.indexOf(stripped.toLowerCase(), searchOffset);
    if (idx === -1) continue;

    result.push({
      word: w.word,
      start: w.start,
      end: w.end,
      charStart: idx,
      charEnd: idx + stripped.length,
    });

    searchOffset = idx + 1;
  }

  return result;
}

/**
 * Enrich an array of TextHighlights with audio timestamps derived from
 * Groq Whisper word-level timestamps.
 *
 * For each highlight span, finds all word tokens whose character range
 * overlaps the highlight, then takes min(start) and max(end) as the
 * audio timestamp for that highlight region.
 *
 * Highlights that don't overlap any known word token are returned unchanged
 * (startTime / endTime remain undefined).
 */
export function enrichHighlightsWithTime(
  highlights: TextHighlight[],
  transcript: string,
  words: Array<{ word: string; start: number; end: number }>,
): TextHighlight[] {
  if (!words.length) return highlights;

  const wordMap = buildWordPositionMap(transcript, words);
  if (!wordMap.length) return highlights;

  return highlights.map((h) => {
    const overlapping = wordMap.filter(
      (w) => w.charStart < h.endIndex && w.charEnd > h.startIndex,
    );

    if (!overlapping.length) return h;

    return {
      ...h,
      startTime: Math.min(...overlapping.map((w) => w.start)),
      endTime: Math.max(...overlapping.map((w) => w.end)),
    };
  });
}

// ── Colour map (shared with UI components) ──────────────────────────────────

export const HIGHLIGHT_COLORS: Record<
  HighlightType,
  {
    bg: string;
    bgHover: string;
    text: string;
    border: string;
    borderHover: string;
    dot: string;
    ring: string;
    label: string;
  }
> = {
  quantity: {
    bg: "bg-emerald-100",
    bgHover: "bg-emerald-200",
    text: "text-emerald-800",
    border: "border-emerald-200",
    borderHover: "border-emerald-400",
    dot: "bg-emerald-500",
    ring: "ring-emerald-400",
    label: "Quantity",
  },
  money: {
    bg: "bg-amber-100",
    bgHover: "bg-amber-200",
    text: "text-amber-800",
    border: "border-amber-200",
    borderHover: "border-amber-400",
    dot: "bg-amber-500",
    ring: "ring-amber-400",
    label: "Money",
  },
  time: {
    bg: "bg-sky-100",
    bgHover: "bg-sky-200",
    text: "text-sky-800",
    border: "border-sky-200",
    borderHover: "border-sky-400",
    dot: "bg-sky-500",
    ring: "ring-sky-400",
    label: "Time",
  },
  item: {
    bg: "bg-violet-100",
    bgHover: "bg-violet-200",
    text: "text-violet-800",
    border: "border-violet-200",
    borderHover: "border-violet-400",
    dot: "bg-violet-500",
    ring: "ring-violet-400",
    label: "Item",
  },
};
