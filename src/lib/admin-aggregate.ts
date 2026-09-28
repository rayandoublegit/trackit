// Pure aggregation helpers for the staff console. No I/O: easy to test.

export type DayPoint = { day: string; value: number };

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** One point per UTC day for the last `days` days, oldest first. */
export function emptyDays(days: number, now = new Date()): DayPoint[] {
  const out: DayPoint[] = [];
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = days - 1; i >= 0; i -= 1) out.push({ day: dayKey(new Date(end - i * 86_400_000)), value: 0 });
  return out;
}

/** Counts (or sums `valueOf`) rows per UTC day over the last `days` days. Rows outside the window are ignored. */
export function dailySeries<T>(
  rows: T[],
  dateOf: (row: T) => string | null | undefined,
  days: number,
  now = new Date(),
  valueOf: (row: T) => number = () => 1,
): DayPoint[] {
  const series = emptyDays(days, now);
  const index = new Map(series.map((p, i) => [p.day, i]));
  for (const row of rows) {
    const raw = dateOf(row);
    if (!raw) continue;
    const t = Date.parse(raw);
    if (Number.isNaN(t)) continue;
    const i = index.get(dayKey(new Date(t)));
    if (i === undefined) continue;
    const v = valueOf(row);
    series[i].value += Number.isFinite(v) ? v : 0;
  }
  return series;
}

export function sumSeries(series: DayPoint[], lastDays?: number): number {
  const slice = lastDays ? series.slice(-lastDays) : series;
  return slice.reduce((sum, p) => sum + p.value, 0);
}

/** Percent change, null when there is no previous value to compare with. */
export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export type Bucket = { key: string; count: number };

/** Groups rows by a key, most frequent first; empty keys become `emptyLabel`. */
export function countBy<T>(rows: T[], keyOf: (row: T) => string | null | undefined, emptyLabel = "—"): Bucket[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = keyOf(row);
    const key = raw && String(raw).trim() ? String(raw).trim() : emptyLabel;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts, ([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export type FollowerTier = "nano" | "micro" | "influencer" | "unknown";

/** Nano < 10 000, micro 10 000–99 999, influencer from 100 000. A missing metric is not zero. */
export function followerTier(followers: number | null | undefined): FollowerTier {
  if (followers === null || followers === undefined || !Number.isFinite(followers) || followers < 0) return "unknown";
  if (followers < 10_000) return "nano";
  if (followers < 100_000) return "micro";
  return "influencer";
}

/** Distinct users seen within the last `days` days. */
export function activeUsers(
  sessions: { user_id: string; last_active_at: string | null }[],
  days: number,
  now = new Date(),
): number {
  const since = now.getTime() - days * 86_400_000;
  const ids = new Set<string>();
  for (const s of sessions) {
    if (!s.last_active_at) continue;
    const t = Date.parse(s.last_active_at);
    if (!Number.isNaN(t) && t >= since) ids.add(s.user_id);
  }
  return ids.size;
}

/** Groups free-text requests (niches, lookups) by their normalized form. */
export function groupRequests<T>(
  rows: T[],
  keyOf: (row: T) => string | null | undefined,
  labelOf: (row: T) => string | null | undefined,
  dateOf: (row: T) => string | null | undefined,
): { key: string; label: string; count: number; last: string | null }[] {
  const map = new Map<string, { key: string; label: string; count: number; last: string | null }>();
  for (const row of rows) {
    const key = (keyOf(row) || labelOf(row) || "").trim().toLowerCase();
    if (!key) continue;
    const entry = map.get(key) ?? { key, label: (labelOf(row) || key).trim(), count: 0, last: null };
    entry.count += 1;
    const d = dateOf(row) ?? null;
    if (d && (!entry.last || d > entry.last)) entry.last = d;
    map.set(key, entry);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || (b.last ?? "").localeCompare(a.last ?? ""));
}
