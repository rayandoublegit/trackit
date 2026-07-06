export type AnalyticsDateRange = "today" | "3d" | "7d" | "30d" | "90d" | "all" | "custom";

export const ANALYTICS_PERIOD_OPTIONS: AnalyticsDateRange[] = [
  "today",
  "3d",
  "7d",
  "30d",
  "90d",
  "all",
  "custom",
];

export type PeriodBounds = {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
};

export type PeriodTrend = {
  current: number;
  previous: number;
  changePct: number | null;
  direction: "up" | "down" | "flat";
};

/** JS `Date#getTimezoneOffset()` — minutes to add to local time to reach UTC. */
export function parseTzOffsetMinutes(value: string | null | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

type CalendarParts = { y: number; m: number; d: number };

function localCalendarParts(date: Date, tzOffsetMinutes?: number): CalendarParts {
  if (tzOffsetMinutes == null) {
    return { y: date.getFullYear(), m: date.getMonth(), d: date.getDate() };
  }
  const shifted = new Date(date.getTime() - tzOffsetMinutes * 60_000);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
  };
}

function partsToDayKey(parts: CalendarParts): string {
  return `${parts.y}-${String(parts.m + 1).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;
}

function addDays(parts: CalendarParts, delta: number): CalendarParts {
  const dt = new Date(Date.UTC(parts.y, parts.m, parts.d + delta, 12, 0, 0));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}

function dateFromLocalParts(parts: CalendarParts, tzOffsetMinutes?: number): Date {
  if (tzOffsetMinutes == null) {
    return new Date(parts.y, parts.m, parts.d, 12, 0, 0, 0);
  }
  return new Date(Date.UTC(parts.y, parts.m, parts.d, 12, 0, 0));
}

function startOfDay(date: Date, tzOffsetMinutes?: number) {
  if (tzOffsetMinutes == null) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return dateFromLocalParts(localCalendarParts(date, tzOffsetMinutes), tzOffsetMinutes);
}

function endOfDay(date: Date, tzOffsetMinutes?: number) {
  if (tzOffsetMinutes == null) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  return dateFromLocalParts(localCalendarParts(date, tzOffsetMinutes), tzOffsetMinutes);
}

export function getPeriodBounds(
  range: Exclude<AnalyticsDateRange, "all" | "custom">,
  now = new Date(),
  tzOffsetMinutes?: number,
): PeriodBounds {
  if (range === "today") {
    const today = localCalendarParts(now, tzOffsetMinutes);
    const yesterday = addDays(today, -1);
    return {
      start: dateFromLocalParts(today, tzOffsetMinutes),
      end: dateFromLocalParts(today, tzOffsetMinutes),
      prevStart: dateFromLocalParts(yesterday, tzOffsetMinutes),
      prevEnd: dateFromLocalParts(yesterday, tzOffsetMinutes),
    };
  }

  const days =
    range === "3d" ? 3 : range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const endParts = localCalendarParts(now, tzOffsetMinutes);
  const startParts = addDays(endParts, -(days - 1));
  const prevEndParts = addDays(startParts, -1);
  const prevStartParts = addDays(prevEndParts, -(days - 1));

  return {
    start: dateFromLocalParts(startParts, tzOffsetMinutes),
    end: dateFromLocalParts(endParts, tzOffsetMinutes),
    prevStart: dateFromLocalParts(prevStartParts, tzOffsetMinutes),
    prevEnd: dateFromLocalParts(prevEndParts, tzOffsetMinutes),
  };
}

export function isWithinPeriod(
  isoDate: string | null | undefined,
  start: Date,
  end: Date,
  tzOffsetMinutes?: number,
) {
  const key = dayKeyFromIso(isoDate, tzOffsetMinutes);
  if (!key) return false;
  const startKey = toDayKey(start, tzOffsetMinutes);
  const endKey = toDayKey(end, tzOffsetMinutes);
  return key >= startKey && key <= endKey;
}

export function computeTrend(current: number, previous: number): PeriodTrend {
  if (current === previous) {
    return { current, previous, changePct: previous === 0 ? null : 0, direction: "flat" };
  }
  if (previous === 0) {
    return { current, previous, changePct: current > 0 ? 100 : null, direction: current > 0 ? "up" : "flat" };
  }
  const changePct = ((current - previous) / previous) * 100;
  return {
    current,
    previous,
    changePct,
    direction: changePct > 0 ? "up" : changePct < 0 ? "down" : "flat",
  };
}

export function analyticsPeriodLabel(range: AnalyticsDateRange, lang: "en" | "fr"): string {
  if (range === "today") return lang === "fr" ? "Aujourd'hui" : "Today";
  if (range === "3d") return lang === "fr" ? "3 derniers jours" : "Last 3 days";
  if (range === "7d") return lang === "fr" ? "7 derniers jours" : "Last 7 days";
  if (range === "30d") return lang === "fr" ? "30 derniers jours" : "Last 30 days";
  if (range === "90d") return lang === "fr" ? "90 derniers jours" : "Last 90 days";
  if (range === "all") return lang === "fr" ? "Toute la période" : "All time";
  return lang === "fr" ? "Personnalisé" : "Custom";
}

export function formatTrendLabel(changePct: number | null, lang: "en" | "fr"): string {
  if (changePct === null) return lang === "fr" ? "Nouveau" : "New";
  const abs = Math.abs(changePct);
  const formatted = abs >= 100 ? Math.round(abs).toString() : abs.toFixed(1);
  return `${formatted}%`;
}

/** Local calendar day key `YYYY-MM-DD` (avoids UTC off-by-one). */
export function toDayKey(date: Date, tzOffsetMinutes?: number): string {
  return partsToDayKey(localCalendarParts(date, tzOffsetMinutes));
}

/** Day key from an ISO timestamp, using local calendar day. */
export function dayKeyFromIso(iso: string | null | undefined, tzOffsetMinutes?: number): string | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return toDayKey(d, tzOffsetMinutes);
}

/** End of a calendar day in the user's timezone, stored as UTC ISO. */
export function endOfLocalDayIso(dayKey: string, tzOffsetMinutes = 0): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return new Date().toISOString();
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) + tzOffsetMinutes * 60_000).toISOString();
}

/** Every calendar day from start→end inclusive. */
export function eachDayKeys(start: Date, end: Date, tzOffsetMinutes?: number): string[] {
  let cur = localCalendarParts(start, tzOffsetMinutes);
  const last = localCalendarParts(end, tzOffsetMinutes);
  const lastKey = partsToDayKey(last);
  const keys: string[] = [];

  while (true) {
    const key = partsToDayKey(cur);
    keys.push(key);
    if (key >= lastKey) break;
    cur = addDays(cur, 1);
  }

  return keys;
}

export type TimelineDayValue = {
  date: string;
  revenue: number;
  commission: number;
  salesCount: number;
  net: number;
};

/** Fill missing days in a period with zeros so charts cover the full range. */
export function fillTimelineDays(
  points: Array<Partial<TimelineDayValue> & { date: string }>,
  start: Date,
  end: Date,
  tzOffsetMinutes?: number,
): TimelineDayValue[] {
  const map = new Map<string, TimelineDayValue>();
  for (const p of points) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) continue;
    map.set(p.date, {
      date: p.date,
      revenue: Number(p.revenue) || 0,
      commission: Number(p.commission) || 0,
      salesCount: Number(p.salesCount) || 0,
      net: Number(p.net ?? Math.max(0, (Number(p.revenue) || 0) - (Number(p.commission) || 0))),
    });
  }
  return eachDayKeys(start, end, tzOffsetMinutes).map((date) => {
    const existing = map.get(date);
    if (existing) return existing;
    return { date, revenue: 0, commission: 0, salesCount: 0, net: 0 };
  });
}

/** Chart series points for a filled period. */
export function fillChartSeries(
  points: Array<{ date: string; value: number }>,
  start: Date,
  end: Date,
  tzOffsetMinutes?: number,
): Array<{ date: string; value: number }> {
  const map = new Map<string, number>();
  for (const p of points) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) continue;
    map.set(p.date, Number(p.value) || 0);
  }
  return eachDayKeys(start, end, tzOffsetMinutes).map((date) => ({ date, value: map.get(date) ?? 0 }));
}

export function resolveAnalyticsDateBounds(
  range: AnalyticsDateRange,
  options?: {
    allStart?: string;
    customRange?: { start: string; end: string };
    now?: Date;
  },
): { start: Date; end: Date } | undefined {
  const now = options?.now ?? new Date();

  if (range === "all") {
    if (!options?.allStart) return undefined;
    return {
      start: startOfDay(new Date(`${options.allStart}T00:00:00`)),
      end: endOfDay(now),
    };
  }

  if (range === "custom") {
    if (!options?.customRange?.start || !options?.customRange?.end) return undefined;
    const start = startOfDay(new Date(`${options.customRange.start}T00:00:00`));
    const end = endOfDay(new Date(`${options.customRange.end}T23:59:59.999`));
    if (start.getTime() > end.getTime()) return { start: end, end: start };
    return { start, end };
  }

  const bounds = getPeriodBounds(range, now);
  return { start: bounds.start, end: bounds.end };
}
