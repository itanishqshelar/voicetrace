const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function atStartOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function shiftDays(date: Date, days: number): Date {
  const copy = atStartOfDay(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function getRelativeDateFromText(
  text: string,
  referenceDate: Date,
): Date | null {
  const normalized = text.toLowerCase();

  if (
    /\bday\s+before\s+yesterday\b/.test(normalized) ||
    /\bparso\b/.test(normalized) ||
    /\bपरसों\b/.test(text)
  ) {
    return shiftDays(referenceDate, -2);
  }

  if (
    /\byesterday\b/.test(normalized) ||
    /\bkal\b/.test(normalized) ||
    /\bकल\b/.test(text)
  ) {
    return shiftDays(referenceDate, -1);
  }

  if (
    /\btoday\b/.test(normalized) ||
    /\baaj\b/.test(normalized) ||
    /\bआज\b/.test(text)
  ) {
    return shiftDays(referenceDate, 0);
  }

  return null;
}

function parseNumericDate(text: string): Date | null {
  const yyyyMmDd = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (yyyyMmDd) {
    const year = Number(yyyyMmDd[1]);
    const month = Number(yyyyMmDd[2]) - 1;
    const day = Number(yyyyMmDd[3]);
    const parsed = new Date(year, month, day);
    if (
      !Number.isNaN(parsed.getTime()) &&
      parsed.getMonth() === month &&
      parsed.getDate() === day
    ) {
      return atStartOfDay(parsed);
    }
  }

  const ddMmYyyy = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
  if (ddMmYyyy) {
    const day = Number(ddMmYyyy[1]);
    const month = Number(ddMmYyyy[2]) - 1;
    const year = Number(ddMmYyyy[3]);
    const parsed = new Date(year, month, day);
    if (
      !Number.isNaN(parsed.getTime()) &&
      parsed.getMonth() === month &&
      parsed.getDate() === day
    ) {
      return atStartOfDay(parsed);
    }
  }

  return null;
}

function parseMonthNameDate(text: string, referenceDate: Date): Date | null {
  const normalized = text.toLowerCase();

  const dayFirst = normalized.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(20\d{2}))?\b/,
  );
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = MONTH_INDEX[dayFirst[2]];
    const year = dayFirst[3]
      ? Number(dayFirst[3])
      : referenceDate.getFullYear();
    if (month !== undefined) {
      const parsed = new Date(year, month, day);
      if (
        !Number.isNaN(parsed.getTime()) &&
        parsed.getMonth() === month &&
        parsed.getDate() === day
      ) {
        return atStartOfDay(parsed);
      }
    }
  }

  const monthFirst = normalized.match(
    /\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/,
  );
  if (monthFirst) {
    const month = MONTH_INDEX[monthFirst[1]];
    const day = Number(monthFirst[2]);
    const year = monthFirst[3]
      ? Number(monthFirst[3])
      : referenceDate.getFullYear();
    if (month !== undefined) {
      const parsed = new Date(year, month, day);
      if (
        !Number.isNaN(parsed.getTime()) &&
        parsed.getMonth() === month &&
        parsed.getDate() === day
      ) {
        return atStartOfDay(parsed);
      }
    }
  }

  return null;
}

export function inferBusinessDateFromText(
  text: string,
  referenceDate: Date = new Date(),
): string {
  const relativeDate = getRelativeDateFromText(text, referenceDate);
  if (relativeDate) return toIsoDate(relativeDate);

  const numericDate = parseNumericDate(text);
  if (numericDate) return toIsoDate(numericDate);

  const monthNameDate = parseMonthNameDate(text, referenceDate);
  if (monthNameDate) return toIsoDate(monthNameDate);

  return toIsoDate(atStartOfDay(referenceDate));
}

export function toLogTimestampForDate(
  dateIso: string,
  referenceTime: Date = new Date(),
): string {
  const parsed = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return referenceTime.toISOString();
  }

  const merged = new Date(parsed);
  merged.setHours(
    referenceTime.getHours(),
    referenceTime.getMinutes(),
    referenceTime.getSeconds(),
    referenceTime.getMilliseconds(),
  );

  return merged.toISOString();
}
