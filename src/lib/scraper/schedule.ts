// How often each creator is refreshed. Growing accounts come back daily, big
// stable ones every few days, inactive ones weekly, broken ones back off.
// Priority 1 = most often; the queue drains in priority order.

const INTERVAL_DAYS: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 3, 6: 4, 7: 5, 8: 7, 9: 14 };
const DAY = 86_400_000;

export type ScheduleInput = {
  followers: number;
  followersGrowthPct7d: number | null;
  growthScore: number | null;
  lastPostAt: string | null;
};

export function scrapePriority(c: ScheduleInput, nowMs = Date.now()): number {
  const lastPost = c.lastPostAt ? new Date(c.lastPostAt).getTime() : 0;
  if (!lastPost || nowMs - lastPost > 60 * DAY) return 8;
  if ((c.followersGrowthPct7d ?? 0) >= 5 || (c.growthScore ?? 0) >= 40) return 1;
  if ((c.followersGrowthPct7d ?? 0) >= 1 || (c.growthScore ?? 0) >= 15) return 2;
  if (c.followers >= 1_000_000) return 3;
  if (c.followers >= 100_000) return 4;
  return 6;
}

export function nextScrapeAt(priority: number, nowMs = Date.now()): string {
  const days = INTERVAL_DAYS[Math.min(9, Math.max(1, Math.round(priority)))] ?? 4;
  return new Date(nowMs + days * DAY).toISOString();
}

/** After a failure: 1, 2, 4, 8… days, capped at two weeks. */
export function retryAfterFailure(failures: number, nowMs = Date.now()): string {
  const days = Math.min(14, 2 ** Math.max(0, failures - 1));
  return new Date(nowMs + days * DAY).toISOString();
}
