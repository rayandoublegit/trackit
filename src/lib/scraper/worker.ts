import type { SupabaseClient } from "@supabase/supabase-js";
import { remaining, weeklyCaps, weeklyUsage } from "./budget";
import { CreatorNotFound, discoverKeyword, discoverMarketplace, recordCreatorFailure, refreshCreator } from "./ingest";
import { isMarketTarget } from "./marketplace";
import { normalizePlatform } from "./identity";
import { trackedIntervalDays } from "./schedule";
import { AllProvidersFailed, enabledPlatforms, sourceFor } from "./sources";
import { CallMeter, type CreatorSource, type ScrapePlatform } from "./types";

// The queue worker. It runs often (every 10 minutes) and only spends API
// calls when jobs are waiting:
//   1. queue creators a brand works with that are due (database only);
//   2. nothing ready in the queue → stop: no API call, no run row;
//   3. otherwise claim discovery jobs, then refresh jobs, within this week's
//      remaining caps, run them with a time budget, and log the pass in
//      scrape_runs (API calls per provider, jobs, new creators, errors).
// When every provider of a platform is out of credits, the pass stops and
// hands its jobs back untouched.

type Job = { id: number; kind: string; platform: string; target: string; attempts: number };

export type WorkerOptions = {
  budget: number;
  concurrency: number;
  timeBudgetMs?: number;
  trigger?: string;
  minFollowers?: number;
  maxFollowers?: number;
};

export type WorkerSummary = {
  ok: true;
  idle: boolean;
  reason?: string;
  trackedQueued: number;
  claimed: number;
  done: number;
  failed: number;
  deferred: number;
  refreshJobs: number;
  discoverJobs: number;
  apiCalls: number;
  credits: number;
  callsByProvider: Record<string, number>;
  creatorsNew: number;
  discovered: number;
  videos: number;
  coversStored: number;
  seconds: number;
  errors: string[];
};

const MAX_ATTEMPTS = 3;

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return process.env[name] && Number.isFinite(n) ? n : fallback;
}

export async function runScrapeWorker(admin: SupabaseClient, opts: WorkerOptions): Promise<WorkerSummary> {
  const started = Date.now();
  const timeBudget = opts.timeBudgetMs ?? 250_000;
  const summary: WorkerSummary = {
    ok: true,
    idle: false,
    trackedQueued: 0,
    claimed: 0,
    done: 0,
    failed: 0,
    deferred: 0,
    refreshJobs: 0,
    discoverJobs: 0,
    apiCalls: 0,
    credits: 0,
    callsByProvider: {},
    creatorsNew: 0,
    discovered: 0,
    videos: 0,
    coversStored: 0,
    seconds: 0,
    errors: [],
  };
  const finish = (patch: Partial<WorkerSummary> = {}) => ({ ...summary, ...patch, seconds: Math.round((Date.now() - started) / 1000) });

  const platforms = enabledPlatforms();
  if (!platforms.length) return finish({ idle: true, reason: "no scraping provider configured" });

  // 1. Creators brands work with come back sooner (database only).
  const trackedDays = trackedIntervalDays();
  if (trackedDays > 0) {
    const { data, error } = await admin.rpc("enqueue_tracked_creators", {
      p_limit: opts.budget,
      p_min_age: `${trackedDays} days`,
      p_platforms: platforms,
    });
    if (!error) summary.trackedQueued = Number(data ?? 0);
  }

  // 2. Anything to do? (Jobs stuck "running" for 15+ minutes count: claim takes them back.)
  const nowIso = new Date().toISOString();
  const ready = await admin
    .from("scrape_jobs")
    .select("id")
    .eq("status", "queued")
    .lte("run_after", nowIso)
    .in("platform", platforms)
    .limit(1);
  const stale = ready.data?.length
    ? { data: [] }
    : await admin.from("scrape_jobs").select("id").eq("status", "running").lt("locked_at", new Date(Date.now() - 15 * 60_000).toISOString()).limit(1);
  if (!ready.data?.length && !stale.data?.length) return finish({ idle: true, reason: "queue empty" });

  // 3. This week's remaining caps.
  const caps = weeklyCaps();
  const left = remaining(caps, await weeklyUsage(admin));
  const discoverLimit = Math.min(left.discoveryKeywords, opts.budget);
  if (discoverLimit <= 0 && left.refreshes <= 0) return finish({ idle: true, reason: "weekly caps reached" });

  const claim = async (limit: number, kind: string): Promise<Job[]> => {
    if (limit <= 0) return [];
    const { data, error } = await admin.rpc("claim_scrape_jobs", { p_limit: limit, p_kinds: [kind] });
    if (error) throw new Error(`claim_scrape_jobs: ${error.message}`);
    return (data ?? []) as Job[];
  };
  const discoverClaimed = await claim(discoverLimit, "creator_discover");
  const refreshClaimed = await claim(Math.min(left.refreshes, opts.budget - discoverClaimed.length), "creator_refresh");
  const claimed = [...discoverClaimed, ...refreshClaimed];
  summary.claimed = claimed.length;
  if (!claimed.length) return finish({ idle: true, reason: "nothing claimable" });

  const { data: run } = await admin
    .from("scrape_runs")
    .insert({ trigger: opts.trigger || "worker", notes: { budget: opts.budget, platforms } })
    .select("id")
    .single();

  const meter = new CallMeter();
  const sources = new Map<ScrapePlatform, CreatorSource | null>();
  const sourceOf = (p: ScrapePlatform) => {
    if (!sources.has(p)) sources.set(p, platforms.includes(p) ? sourceFor(p) : null);
    return sources.get(p) ?? null;
  };
  let newCreatorsLeft = left.newCreators;
  const minFollowers = opts.minFollowers ?? envInt("SCRAPE_DISCOVERY_MIN_FOLLOWERS", 5_000);
  const maxFollowers = opts.maxFollowers ?? envInt("SCRAPE_DISCOVERY_MAX_FOLLOWERS", 2_000_000);
  const marketMaxPage = envInt("SCRAPE_MARKET_MAX_PAGE", 100);
  const handBack: Job[] = [];
  const handBackLater: Job[] = [];
  let stopped = false;

  const runJob = async (job: Job) => {
    const platform = normalizePlatform(job.platform);
    const source = platform ? sourceOf(platform) : null;
    if (stopped || Date.now() - started > timeBudget) {
      handBack.push(job);
      return;
    }
    if (!platform || !source || (isMarketTarget(job.target) && !process.env.SCRAPECREATORS_API_KEY)) {
      // No provider for this platform right now: try again tomorrow, no call spent.
      handBackLater.push(job);
      return;
    }
    const jobMeter = new CallMeter();
    if (job.kind === "creator_discover") summary.discoverJobs += 1;
    else summary.refreshJobs += 1;
    try {
      if (job.kind === "creator_discover" && isMarketTarget(job.target)) {
        const r = await discoverMarketplace(admin, job.target, { meter: jobMeter, minFollowers, maxFollowers, maxNew: newCreatorsLeft, maxPage: marketMaxPage });
        newCreatorsLeft = Math.max(0, newCreatorsLeft - r.added);
        summary.discovered += r.added;
        summary.creatorsNew += r.added;
      } else if (job.kind === "creator_discover") {
        const r = await discoverKeyword(admin, source, job.target, { meter: jobMeter, minFollowers, maxFollowers, maxNew: newCreatorsLeft });
        newCreatorsLeft = Math.max(0, newCreatorsLeft - r.added);
        summary.discovered += r.added;
        summary.creatorsNew += r.added;
      } else {
        const r = await refreshCreator(admin, source, job.target, { meter: jobMeter });
        summary.videos += r.videos;
        summary.coversStored += r.coversStored;
      }
      summary.done += 1;
      await admin.from("scrape_jobs").update({ status: "done", finished_at: new Date().toISOString(), last_error: null }).eq("id", job.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof AllProvidersFailed && e.allDown) {
        // Out of credits everywhere: stop the pass, give the job back as it was.
        stopped = true;
        if (job.kind === "creator_discover") summary.discoverJobs -= 1;
        else summary.refreshJobs -= 1;
        handBack.push(job);
        if (summary.errors.length < 10) summary.errors.push(`stopped: ${message}`.slice(0, 300));
        return;
      }
      if (summary.errors.length < 10) summary.errors.push(`${job.kind} ${job.platform}:${job.target}: ${message}`.slice(0, 300));
      const notFound = e instanceof CreatorNotFound;
      const final = notFound || job.attempts >= MAX_ATTEMPTS;
      await admin
        .from("scrape_jobs")
        .update(
          final
            ? { status: "failed", finished_at: new Date().toISOString(), last_error: message.slice(0, 500) }
            : { status: "queued", locked_at: null, run_after: new Date(Date.now() + job.attempts * 30 * 60_000).toISOString(), last_error: message.slice(0, 500) },
        )
        .eq("id", job.id);
      if (final) {
        summary.failed += 1;
        if (job.kind === "creator_refresh") await recordCreatorFailure(admin, job.target, { notFound });
      }
    } finally {
      meter.merge(jobMeter);
    }
  };

  for (let i = 0; i < claimed.length; i += opts.concurrency) {
    await Promise.all(claimed.slice(i, i + opts.concurrency).map(runJob));
  }

  // Unused claims go back as they were (the attempt is not counted).
  const giveBack = async (jobs: Job[], runAfter?: string) => {
    for (const job of jobs) {
      await admin
        .from("scrape_jobs")
        .update({ status: "queued", locked_at: null, attempts: Math.max(0, job.attempts - 1), ...(runAfter ? { run_after: runAfter } : {}) })
        .eq("id", job.id);
    }
  };
  await giveBack(handBack);
  await giveBack(handBackLater, new Date(Date.now() + 24 * 3_600_000).toISOString());
  summary.deferred = handBack.length + handBackLater.length;
  summary.apiCalls = meter.calls;
  summary.credits = meter.credits;
  summary.callsByProvider = meter.byProvider;

  const result = finish();
  if (run?.id) {
    await admin
      .from("scrape_runs")
      .update({
        finished_at: new Date().toISOString(),
        jobs_claimed: claimed.length,
        jobs_done: summary.done,
        jobs_failed: summary.failed,
        api_calls: meter.calls,
        creators_new: summary.creatorsNew,
        videos_upserted: summary.videos,
        notes: {
          budget: opts.budget,
          platforms,
          refreshJobs: summary.refreshJobs,
          discoverJobs: summary.discoverJobs,
          discovered: summary.discovered,
          credits: meter.credits,
          callsByProvider: meter.byProvider,
          trackedQueued: summary.trackedQueued,
          deferred: summary.deferred,
          coversStored: summary.coversStored,
          stoppedNoCredits: stopped,
          errors: summary.errors,
        },
      })
      .eq("id", run.id);
  }
  return result;
}
