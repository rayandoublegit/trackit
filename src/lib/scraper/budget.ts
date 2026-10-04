import type { SupabaseClient } from "@supabase/supabase-js";

// Hard weekly caps, so the scraping bill can never run away. A "week" starts
// Monday 00:00 UTC. Usage is read back from scrape_runs (each worker pass
// records how many refresh / discovery jobs it ran and how many creators it
// added), so the caps hold across every invocation of the week.
//
// Defaults are sized to grow the base to 100,000+ creators (docs/SCRAPING.md):
//   SCRAPE_WEEKLY_MAX_CREATORS            creator refreshes per week (default 65,000)
//   SCRAPE_WEEKLY_MAX_DISCOVERY_KEYWORDS  searches + Creator Marketplace pages per week (default 1,200)
//   SCRAPE_WEEKLY_MAX_NEW_CREATORS        new creators discovery may add per week (default 12,000)

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
    refreshes: envInt("SCRAPE_WEEKLY_MAX_CREATORS", 65_000),
    discoveryKeywords: envInt("SCRAPE_WEEKLY_MAX_DISCOVERY_KEYWORDS", 1_200),
    newCreators: envInt("SCRAPE_WEEKLY_MAX_NEW_CREATORS", 12_000),
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

export type WeeklyUsage = { refreshJobs: number; discoverJobs: number; newCreators: number; apiCalls: number };

export async function weeklyUsage(admin: SupabaseClient, nowMs = Date.now()): Promise<WeeklyUsage> {
  const usage: WeeklyUsage = { refreshJobs: 0, discoverJobs: 0, newCreators: 0, apiCalls: 0 };
  // Paged by 1,000 (the API's row cap): about one row per busy worker pass.
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await admin
      .from("scrape_runs")
      .select("api_calls, notes")
      .gte("started_at", weekStart(nowMs).toISOString())
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`scrape_runs: ${error.message}`);
    const rows = (data ?? []) as { api_calls?: number; notes?: Record<string, unknown> | null }[];
    for (const r of rows) {
      usage.refreshJobs += Number(r.notes?.refreshJobs ?? 0) || 0;
      usage.discoverJobs += Number(r.notes?.discoverJobs ?? 0) || 0;
      usage.newCreators += Number(r.notes?.discovered ?? 0) || 0;
      usage.apiCalls += Number(r.api_calls ?? 0) || 0;
    }
    if (rows.length < 1000) break;
  }
  return usage;
}

export function remaining(caps: WeeklyCaps, used: WeeklyUsage): WeeklyCaps {
  return {
    refreshes: Math.max(0, caps.refreshes - used.refreshJobs),
    discoveryKeywords: Math.max(0, caps.discoveryKeywords - used.discoverJobs),
    newCreators: Math.max(0, caps.newCreators - used.newCreators),
  };
}
