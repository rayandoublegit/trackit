import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { seedInstagramDiscovery } from "@/lib/scraper/instagram-seed";
import { enabledPlatforms } from "@/lib/scraper/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const int = (raw: string | null, fallback: number, max: number) => {
  const n = Math.floor(Number(raw));
  return raw != null && raw !== "" && Number.isFinite(n) && n >= 0 ? Math.min(n, max) : fallback;
};

/**
 * /api/cron/scrape/instagram-seed — Instagram discovery backlog (Mondays, and
 * by hand for a backfill). Call it with `Authorization: Bearer $CRON_SECRET`.
 * No API call here: it queues jobs that /api/cron/scrape runs within the
 * Instagram call caps (SCRAPE_INSTAGRAM_MAX_CALLS_PER_WEEK / _PER_30D).
 *
 *   ?searches=700      Instagram search queries to queue (French first, the
 *                      ones not searched in the last 30 days), 1 call each
 *   ?hashtags=0        niche hashtags to queue (#skincare…), 1 call each (endpoint often busy)
 *   ?handles=a,b       accounts to look at (leads: profile call first, added when creator-sized)
 *   ?refreshStored=0   first refresh of stored Instagram creators never scraped (3 calls each)
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  if (!enabledPlatforms().includes("instagram")) {
    return NextResponse.json({ ok: true, searchesQueued: 0, reason: "no Instagram provider configured (RAPIDAPI_INSTAGRAM_KEY)" });
  }

  const params = new URL(request.url).searchParams;
  try {
    const result = await seedInstagramDiscovery(admin, {
      searches: int(params.get("searches"), Number(process.env.SCRAPE_INSTAGRAM_SEARCHES_PER_WEEK) || 700, 5_000),
      hashtags: int(params.get("hashtags"), 0, 500),
      handles: (params.get("handles") || "").split(",").map((h) => h.trim()).filter(Boolean).slice(0, 500),
      refreshStored: int(params.get("refreshStored"), 0, 10_000),
    });
    await admin.from("scrape_runs").insert({ trigger: "instagram-seed", finished_at: new Date().toISOString(), notes: result });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
