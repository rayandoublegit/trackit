// How often each creator is refreshed: weekly for creators who matter now,
// less often for small or inactive accounts, so a base of 100,000 fits the
// weekly caps.
//
// - Every refresh sets next_scrape_at = now + 7 days (SCRAPE_REFRESH_INTERVAL_DAYS).
//   The weekly enqueue (Monday) queues every creator due within the coming
//   6.5 days (everyone not refreshed in the last 12 hours), so each one comes
//   back once a week, whatever day it was scraped.
// - Creators a brand works with (saved, in a list, in its creators, in a
//   gifting wishlist or mission) are also re-queued by the worker once their
//   last refresh is SCRAPE_TRACKED_INTERVAL_DAYS old (default 3.5): two
//   refreshes a week instead of one for the creators a brand is actually
//   watching, so their numbers are fresh when they matter (+1 refresh per
//   tracked creator per week). 0 turns it off.
// - Priority orders the queue (growers first) and sets the rhythm: priorities
//   1-4 (growing, active, 100K+ followers) every interval (7 days), 6 (smaller
//   active accounts) every 2 intervals, 8 (no post in 60 days) every 4.
// - Failures back off: 1, 2, 4, 8 weeks; after 5 failures in a row the
//   creator is no longer queued (history is kept, nothing is deleted).

const DAY = 86_400_000;
export const MAX_SCRAPE_FAILURES = 5;

function envDays(name: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && process.env[name] !== "" && process.env[name] != null ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Days between two refreshes of a creator (default 7). */
export function refreshIntervalDays(): number {
  return envDays("SCRAPE_REFRESH_INTERVAL_DAYS", 7, 1, 28);
}

/** Days after which a creator a brand works with is refreshed again (default 3.5, 0 = off). */
export function trackedIntervalDays(): number {
  return envDays("SCRAPE_TRACKED_INTERVAL_DAYS", 3.5, 0, 28);
}

export type ScheduleInput = {
  followers: number;
  followersGrowthPct7d: number | null;
  growthScore: number | null;
  lastPostAt: string | null;
};

/** Queue order inside a week: 1 = first. */
export function scrapePriority(c: ScheduleInput, nowMs = Date.now()): number {
  const lastPost = c.lastPostAt ? new Date(c.lastPostAt).getTime() : 0;
  if (!lastPost || nowMs - lastPost > 60 * DAY) return 8;
  if ((c.followersGrowthPct7d ?? 0) >= 5 || (c.growthScore ?? 0) >= 40) return 1;
  if ((c.followersGrowthPct7d ?? 0) >= 1 || (c.growthScore ?? 0) >= 15) return 2;
  if (c.followers >= 1_000_000) return 3;
  if (c.followers >= 100_000) return 4;
  return 6;
}

/** Next refresh: one interval for priorities 1-4, two for 6, four for 8 (inactive). */
export function nextScrapeAt(priority: number, nowMs = Date.now()): string {
  const factor = priority >= 8 ? 4 : priority >= 5 ? 2 : 1;
  return new Date(nowMs + refreshIntervalDays() * factor * DAY).toISOString();
}

/** After a failure (or "account not found"): 1, 2, 4 then 8 weeks. */
export function retryAfterFailure(failures: number, nowMs = Date.now()): string {
  const weeks = Math.min(8, 2 ** Math.max(0, failures - 1));
  return new Date(nowMs + weeks * 7 * DAY).toISOString();
}
