export type AnalyticsDateRange = "today" | "7d" | "30d" | "90d" | "custom";

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

export function getPeriodBounds(range: AnalyticsDateRange, now = new Date()): PeriodBounds {
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

  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
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

export function formatTrendLabel(changePct: number | null, lang: "en" | "fr"): string {
  if (changePct === null) return lang === "fr" ? "Nouveau" : "New";
  const abs = Math.abs(changePct);
  const formatted = abs >= 100 ? Math.round(abs).toString() : abs.toFixed(1);
  return `${formatted}%`;
}
