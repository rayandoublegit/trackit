import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { runScrapeWorker } from "@/lib/scraper/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * /api/cron/scrape — the queue worker (every 10 minutes on Vercel). Call it
 * with `Authorization: Bearer $CRON_SECRET`.
 *
 *   ?budget=60   jobs to run this pass at most (SCRAPE_BATCH, max 300)
 *
 * It spends API calls only when jobs are queued: the weekly refresh
 * (/api/cron/scrape/weekly-refresh) and the weekly discovery
 * (/api/cron/scrape/weekly-discovery) fill the queue, this route drains it
 * within the weekly caps (SCRAPE_WEEKLY_MAX_*). An empty queue costs nothing
 * and writes no run row. Busy passes are logged in scrape_runs.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const params = new URL(request.url).searchParams;
  const budget = Math.min(Math.max(Number(params.get("budget") || process.env.SCRAPE_BATCH || 60) || 60, 1), 300);
  const concurrency = Math.min(Math.max(Number(process.env.SCRAPE_CONCURRENCY ?? 8) || 8, 1), 10);
  try {
    const summary = await runScrapeWorker(admin, { budget, concurrency, trigger: params.get("trigger") || "worker" });
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
