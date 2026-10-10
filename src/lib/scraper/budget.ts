import type { SupabaseClient } from "@supabase/supabase-js";

// Hard weekly caps, so the scraping bill can never run away. A "week" starts
// Monday 00:00 UTC. Usage is read back from scrape_runs (each worker pass
// records how many refresh / discovery jobs it ran and how many creators it
// added), so the caps hold across every invocation of the week.
//
// Defaults are sized to grow the base to 100,000+ creators (docs/SCRAPING.md):
//   SCRAPE_WEEKLY_MAX_CREATORS            creator refreshes per week (default 100,000)
//   SCRAPE_WEEKLY_MAX_DISCOVERY_KEYWORDS  searches + Creator Marketplace pages per week (default 3,000)
//   SCRAPE_WEEKLY_MAX_NEW_CREATORS        new creators discovery may add per week (default 30,000)

const DAY = 86_400_000;
const WEEK = 7 * DAY;
// 1970-01-05 was a Monday.
const FIRST_MONDAY = Date.UTC(1970, 0, 5);

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = Number(raw);
  return raw != null && raw !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export type WeeklyCaps = { refreshes: number; discoveryKeywords: number; newCreators: number };

export function weeklyCaps(): WeeklyCaps {
  return {
    refreshes: envInt("SCRAPE_WEEKLY_MAX_CREATORS", 100_000),
    discoveryKeywords: envInt("SCRAPE_WEEKLY_MAX_DISCOVERY_KEYWORDS", 3_000),
    newCreators: envInt("SCRAPE_WEEKLY_MAX_NEW_CREATORS", 30_000),
  };
}

/** Monday 00:00 UTC of the week containing nowMs. */
export function weekStart(nowMs = Date.now()): Date {
  const weeks = Math.floor((nowMs - FIRST_MONDAY) / WEEK);
  return new Date(FIRST_MONDAY + weeks * WEEK);
}

/** Weeks since 1970-01-05; used to rotate discovery keywords. */
export function weekIndex(nowMs = Date.now()): number {
  return Math.floor((nowMs - FIRST_MONDAY) / WEEK);
}

export type WeeklyUsage = {
  refreshJobs: number;
  discoverJobs: number;
  newCreators: number;
  apiCalls: number;
  /** Calls per provider ("rapidapi-instagram": 1200…), from notes.callsByProvider. */
  callsByProvider: Record<string, number>;
};

type RunRow = { api_calls?: number; notes?: Record<string, unknown> | null };

/** Every scrape_runs row since a date (paged by 1,000, the API's row cap: about one row per busy pass). */
async function runsSince(admin: SupabaseClient, sinceIso: string, each: (r: RunRow) => void): Promise<void> {
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await admin
      .from("scrape_runs")
      .select("api_calls, notes")
      .gte("started_at", sinceIso)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`scrape_runs: ${error.message}`);
    const rows = (data ?? []) as RunRow[];
    for (const r of rows) each(r);
    if (rows.length < 1000) break;
  }
}

function addCalls(into: Record<string, number>, notes: Record<string, unknown> | null | undefined): void {
  const by = notes?.callsByProvider;
  if (!by || typeof by !== "object") return;
  for (const [k, v] of Object.entries(by as Record<string, unknown>)) into[k] = (into[k] ?? 0) + (Number(v) || 0);
}

export async function weeklyUsage(admin: SupabaseClient, nowMs = Date.now()): Promise<WeeklyUsage> {
  const usage: WeeklyUsage = { refreshJobs: 0, discoverJobs: 0, newCreators: 0, apiCalls: 0, callsByProvider: {} };
  await runsSince(admin, weekStart(nowMs).toISOString(), (r) => {
    usage.refreshJobs += Number(r.notes?.refreshJobs ?? 0) || 0;
    usage.discoverJobs += Number(r.notes?.discoverJobs ?? 0) || 0;
    usage.newCreators += Number(r.notes?.discovered ?? 0) || 0;
    usage.apiCalls += Number(r.api_calls ?? 0) || 0;
    addCalls(usage.callsByProvider, r.notes);
  });
  return usage;
}

// ── Instagram call caps ────────────────────────────────────────────────────────
// The RapidAPI Instagram plan is counted in requests (50,000 a month on the
// current plan), so Instagram has its own hard caps on API calls, on top of the
// job caps above:
//   SCRAPE_INSTAGRAM_MAX_CALLS_PER_WEEK   calls per week (Monday 00:00 UTC), default 11,000
//   SCRAPE_INSTAGRAM_MAX_CALLS_PER_30D    calls over the last 30 days (rolling, so no
//                                         billing period can go over), default 45,000
// They count every Instagram provider's calls (notes.callsByProvider keys
// ending in "-instagram"). Raise both after upgrading the plan.

export type InstagramCaps = { perWeek: number; per30d: number };

export function instagramCaps(): InstagramCaps {
  return {
    perWeek: envInt("SCRAPE_INSTAGRAM_MAX_CALLS_PER_WEEK", 11_000),
    per30d: envInt("SCRAPE_INSTAGRAM_MAX_CALLS_PER_30D", 45_000),
  };
}

export const isInstagramProvider = (name: string) => /(^|[-_])instagram$/.test(name);

export function instagramCalls(callsByProvider: Record<string, number>): number {
  return Object.entries(callsByProvider).reduce((sum, [k, v]) => sum + (isInstagramProvider(k) ? v : 0), 0);
}

export type InstagramAllowance = {
  /** Calls Instagram jobs may still spend now (min of the week and the 30-day window). */
  left: number;
  usedWeek: number;
  used30d: number;
  /** When Instagram jobs held back by the caps should come back. */
  retryAt: string;
};

/** What is left of the Instagram caps. weekUsage: this week's usage when already read. */
export async function instagramAllowance(admin: SupabaseClient, nowMs = Date.now(), weekUsage?: WeeklyUsage): Promise<InstagramAllowance> {
  const caps = instagramCaps();
  const usedWeek = instagramCalls((weekUsage ?? (await weeklyUsage(admin, nowMs))).callsByProvider);
  const by30d: Record<string, number> = {};
  await runsSince(admin, new Date(nowMs - 30 * DAY).toISOString(), (r) => addCalls(by30d, r.notes));
  const used30d = instagramCalls(by30d);
  const weekLeft = Math.max(0, caps.perWeek - usedWeek);
  const monthLeft = Math.max(0, caps.per30d - used30d);
  // Week cap hit: next Monday. 30-day cap hit: calls leave the window day by day, try tomorrow.
  const retryAt = weekLeft <= monthLeft ? new Date(weekStart(nowMs).getTime() + WEEK).toISOString() : new Date(nowMs + DAY).toISOString();
  return { left: Math.min(weekLeft, monthLeft), usedWeek, used30d, retryAt };
}

export function remaining(caps: WeeklyCaps, used: WeeklyUsage): WeeklyCaps {
  return {
    refreshes: Math.max(0, caps.refreshes - used.refreshJobs),
    discoveryKeywords: Math.max(0, caps.discoveryKeywords - used.discoverJobs),
    newCreators: Math.max(0, caps.newCreators - used.newCreators),
  };
}
