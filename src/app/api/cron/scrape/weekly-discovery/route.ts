import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { remaining, weekIndex, weeklyCaps, weeklyUsage } from "@/lib/scraper/budget";
import { weeklyDiscoveryPlan } from "@/lib/scraper/discovery-plan";
import { normalizePlatform } from "@/lib/scraper/identity";
import { enabledPlatforms } from "@/lib/scraper/sources";
import { marketSeeds, marketTarget } from "@/lib/scraper/marketplace";
import type { ScrapePlatform } from "@/lib/scraper/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/cron/scrape/weekly-discovery — Mondays. Queues this week's keyword
 * searches (the next slice of the niche tree on TikTok and YouTube), up to
 * what is left of SCRAPE_WEEKLY_MAX_DISCOVERY_KEYWORDS. Instagram discovery
 * is queued by /api/cron/scrape/instagram-seed (its own queries and call caps).
 * No API call here: /api/cron/scrape runs the searches (1 call each) and
 * queues a first refresh for every new creator (within
 * SCRAPE_WEEKLY_MAX_NEW_CREATORS).
 *
 *   ?discover=a,b          extra keywords, searched first on every platform
 *   ?platforms=tiktok,…    limit to these platforms (instagram only when named here)
 *   ?max=100               fewer searches than the weekly cap
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const params = new URL(request.url).searchParams;
  const asked = (params.get("platforms") || "")
    .split(",")
    .map((p) => normalizePlatform(p))
    .filter((p): p is ScrapePlatform => p !== null);
  // Instagram has its own backlog and call caps (/api/cron/scrape/instagram-seed):
  // it is left out of the shared search plan unless asked for with ?platforms=.
  const platforms = enabledPlatforms().filter((p) => (params.get("platforms") ? asked.includes(p) : p !== "instagram"));
  if (!platforms.length) return NextResponse.json({ ok: true, queued: 0, reason: "no scraping provider configured" });

  // Searches already queued but not run count against this week's cap too
  // (Instagram ones do not: they are bounded by the Instagram call caps).
  const { count: waiting } = await admin
    .from("scrape_jobs")
    .select("id", { count: "exact", head: true })
    .eq("kind", "creator_discover")
    .neq("platform", "instagram")
    .in("status", ["queued", "running"]);
  const left = remaining(weeklyCaps(), await weeklyUsage(admin)).discoveryKeywords - Number(waiting ?? 0);
  let max = Math.max(0, Math.min(left, Number(params.get("max") || left)));

  // Creator Marketplace walks first (TikTok via ScrapeCreators): pages of 20
  // real creators per country / follower range, French creators first. Each
  // walk queues its own next pages while they bring new creators.
  let marketQueued = 0;
  if (platforms.includes("tiktok") && process.env.SCRAPECREATORS_API_KEY && params.get("market") !== "0") {
    for (const seed of marketSeeds()) {
      if (marketQueued >= max) break;
      const { error } = await admin
        .from("scrape_jobs")
        .insert({ kind: "creator_discover", platform: "tiktok", target: marketTarget(seed), priority: seed.country === "FR" ? 1 : 2 });
      if (!error) marketQueued += 1;
    }
    max -= marketQueued;
  }
  const extra = (params.get("discover") || "").split(",").map((k) => k.trim()).filter(Boolean).slice(0, 50);
  const plan = weeklyDiscoveryPlan({ platforms, maxKeywords: max, weekIndex: weekIndex(), extra });

  let queued = 0;
  for (const item of plan) {
    // One live job per keyword and platform: a duplicate insert is refused, which is fine.
    const { error } = await admin.from("scrape_jobs").insert({ kind: "creator_discover", platform: item.platform, target: item.keyword, priority: 2 });
    if (!error) queued += 1;
  }
  await admin.from("scrape_runs").insert({
    trigger: "weekly-discovery",
    finished_at: new Date().toISOString(),
    notes: { queued, marketQueued, planned: plan.length, platforms, weeklyLeft: left },
  });
  return NextResponse.json({ ok: true, queued, marketQueued, planned: plan.length, platforms, perPlatform: Object.fromEntries(platforms.map((p) => [p, plan.filter((i) => i.platform === p).length])) });
}
