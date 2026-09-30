import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { weeklyCaps } from "@/lib/scraper/budget";
import { enabledPlatforms } from "@/lib/scraper/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/cron/scrape/weekly-refresh — Mondays. Queues every creator due this
 * week (next_scrape_at within 6.5 days, i.e. everyone not refreshed in the
 * last 12 hours; creators backing off after failures wait), up to
 * SCRAPE_WEEKLY_MAX_CREATORS, on the platforms that have a provider.
 * No API call here: /api/cron/scrape drains the queue.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const platforms = enabledPlatforms();
  if (!platforms.length) return NextResponse.json({ ok: true, enqueued: 0, reason: "no scraping provider configured" });
  const limit = weeklyCaps().refreshes;

  let fn = "enqueue_weekly_refresh";
  let { data, error } = await admin.rpc(fn, { p_limit: limit, p_horizon: "6 days 12 hours", p_platforms: platforms });
  if (error && /enqueue_weekly_refresh|function|schema cache/i.test(error.message)) {
    // Migration 000046 not applied yet: the older function queues what is due now.
    fn = "enqueue_due_creators";
    ({ data, error } = await admin.rpc(fn, { p_limit: limit }));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enqueued = Number(data ?? 0);
  await admin.from("scrape_runs").insert({
    trigger: "weekly-refresh",
    finished_at: new Date().toISOString(),
    notes: { enqueued, limit, platforms, fn },
  });
  return NextResponse.json({ ok: true, enqueued, limit, platforms });
}
