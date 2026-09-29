import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { tiktokSource } from "@/lib/scraper/sources";
import { CreatorNotFound, discoverKeyword, recordCreatorFailure, refreshCreator } from "@/lib/scraper/ingest";
import { NICHE_TREE } from "@/lib/niche-tree";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * /api/cron/scrape — drains the scrape queue. Call it on a schedule with
 * `Authorization: Bearer $CRON_SECRET`.
 *
 *   ?budget=25          jobs to run this pass (SCRAPE_BATCH, max 200)
 *   ?discover=a,b       also search these keywords for new creators
 *   ?seedNiches=3       also search N niches from the niche tree (rotates daily)
 *
 * Each creator refresh costs 2 API calls, each keyword search 1. Every pass is
 * logged in scrape_runs (volume, calls, errors) for cost and health.
 */

type Job = { id: number; kind: string; platform: string; target: string; attempts: number };

const TIME_BUDGET_MS = 250_000;
const MAX_ATTEMPTS = 3;

function nichesForToday(n: number): string[] {
  const keys = Object.keys(NICHE_TREE);
  if (!keys.length || n <= 0) return [];
  const day = Math.floor(Date.now() / 86_400_000);
  return Array.from({ length: Math.min(n, keys.length) }, (_, i) => keys[(day * n + i) % keys.length]);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const source = tiktokSource();
  if (!source) return NextResponse.json({ error: "No scraping source configured (RapidAPI or ScrapeCreators)" }, { status: 503 });

  const started = Date.now();
  const params = new URL(request.url).searchParams;
  const budget = Math.min(Math.max(Number(params.get("budget") || process.env.SCRAPE_BATCH || 25), 1), 200);
  const concurrency = Math.min(Math.max(Number(process.env.SCRAPE_CONCURRENCY ?? 3), 1), 8);
  const keywords = [
    ...(params.get("discover") || "").split(",").map((k) => k.trim()).filter(Boolean),
    ...nichesForToday(Number(params.get("seedNiches") || 0)),
  ].slice(0, 20);

  const { data: run } = await admin
    .from("scrape_runs")
    .insert({ trigger: params.get("trigger") || "cron", notes: { source: source.name, budget, keywords } })
    .select("id")
    .single();

  // Discovery jobs go through the queue too, so a keyword is never searched twice at once.
  for (const keyword of keywords) {
    await admin.from("scrape_jobs").insert({ kind: "creator_discover", platform: source.platform, target: keyword.toLowerCase(), priority: 2 });
  }
  const { data: enqueued } = await admin.rpc("enqueue_due_creators", { p_limit: budget * 2 });
  const { data: claimed, error: claimErr } = await admin.rpc("claim_scrape_jobs", {
    p_limit: budget,
    p_kinds: ["creator_discover", "creator_refresh"],
  });
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 });
  const jobs = (claimed ?? []) as Job[];

  let done = 0;
  let failedCount = 0;
  let apiCalls = 0;
  let creatorsNew = 0;
  let videos = 0;
  let covers = 0;
  const errors: string[] = [];
  const unprocessed: number[] = [];

  const runJob = async (job: Job) => {
    if (Date.now() - started > TIME_BUDGET_MS) {
      unprocessed.push(job.id);
      return;
    }
    try {
      if (job.kind === "creator_discover") {
        const r = await discoverKeyword(admin, source, job.target);
        apiCalls += r.apiCalls;
        creatorsNew += r.added;
      } else {
        const r = await refreshCreator(admin, source, job.target);
        apiCalls += r.apiCalls;
        videos += r.videos;
        covers += r.coversStored;
        if (r.isNew) creatorsNew += 1;
      }
      done += 1;
      await admin.from("scrape_jobs").update({ status: "done", finished_at: new Date().toISOString(), last_error: null }).eq("id", job.id);
    } catch (e) {
      apiCalls += job.kind === "creator_discover" ? 1 : 2;
      const message = e instanceof Error ? e.message : String(e);
      if (errors.length < 10) errors.push(`${job.kind} ${job.target}: ${message}`.slice(0, 300));
      const final = e instanceof CreatorNotFound || job.attempts >= MAX_ATTEMPTS;
      await admin
        .from("scrape_jobs")
        .update(
          final
            ? { status: "failed", finished_at: new Date().toISOString(), last_error: message.slice(0, 500) }
            : { status: "queued", locked_at: null, run_after: new Date(Date.now() + job.attempts * 30 * 60_000).toISOString(), last_error: message.slice(0, 500) },
        )
        .eq("id", job.id);
      if (final) {
        failedCount += 1;
        if (job.kind === "creator_refresh") await recordCreatorFailure(admin, job.target);
      }
    }
  };

  for (let i = 0; i < jobs.length; i += concurrency) {
    await Promise.all(jobs.slice(i, i + concurrency).map(runJob));
  }
  if (unprocessed.length) {
    // Out of time: hand these back untouched for the next pass.
    await admin.from("scrape_jobs").update({ status: "queued", locked_at: null }).in("id", unprocessed);
  }

  const summary = {
    ok: true,
    source: source.name,
    enqueued: Number(enqueued ?? 0),
    claimed: jobs.length,
    done,
    failed: failedCount,
    deferred: unprocessed.length,
    apiCalls,
    creatorsNew,
    videos,
    coversStored: covers,
    seconds: Math.round((Date.now() - started) / 1000),
    errors,
  };
  if (run?.id) {
    await admin
      .from("scrape_runs")
      .update({
        finished_at: new Date().toISOString(),
        jobs_claimed: jobs.length,
        jobs_done: done,
        jobs_failed: failedCount,
        api_calls: apiCalls,
        creators_new: creatorsNew,
        videos_upserted: videos,
        notes: { source: source.name, budget, keywords, deferred: unprocessed.length, coversStored: covers, errors },
      })
      .eq("id", run.id);
  }
  return NextResponse.json(summary);
}
