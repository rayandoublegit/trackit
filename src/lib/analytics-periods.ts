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

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function getPeriodBounds(
  range: Exclude<AnalyticsDateRange, "all" | "custom">,
  now = new Date(),
): PeriodBounds {
  if (range === "today") {
    const start = startOfDay(now);
    const end = endOfDay(now);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      start,
      end,
      prevStart: startOfDay(yesterday),
      prevEnd: endOfDay(yesterday),
    };
  }

  const days =
    range === "3d" ? 3 : range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const end = endOfDay(now);
  const start = startOfDay(new Date(now));
  start.setDate(start.getDate() - (days - 1));

  const prevEnd = endOfDay(new Date(start));
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = startOfDay(new Date(prevEnd));
  prevStart.setDate(prevStart.getDate() - (days - 1));

  return { start, end, prevStart, prevEnd };
}

export function isWithinPeriod(isoDate: string | null | undefined, start: Date, end: Date) {
  if (!isoDate) return false;
  const t = new Date(isoDate).getTime();
  return t >= start.getTime() && t <= end.getTime();
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
