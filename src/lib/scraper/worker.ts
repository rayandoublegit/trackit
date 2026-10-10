import type { SupabaseClient } from "@supabase/supabase-js";
import { instagramAllowance, instagramCalls, remaining, weekStart, weeklyCaps, weeklyUsage, type InstagramAllowance } from "./budget";
import {
  CreatorDeferred,
  CreatorNotFound,
  CreatorSkipped,
  discoverInstagramHashtag,
  discoverKeyword,
  discoverMarketplace,
  isHashtagTarget,
  recordCreatorFailure,
  refreshCreator,
} from "./ingest";
import { isMarketTarget } from "./marketplace";
import { normalizePlatform } from "./identity";
import { trackedIntervalDays } from "./schedule";
import { AllProvidersFailed, enabledPlatforms, providerOrder, sourceFor } from "./sources";
import { CallMeter, type CreatorSource, type ScrapePlatform } from "./types";

// The queue worker. It runs often (every 10 minutes) and only spends API
// calls when jobs are waiting:
//   1. queue creators a brand works with that are due (database only);
//   2. nothing ready in the queue → stop: no API call, no run row;
//   3. otherwise claim discovery jobs, then refresh jobs, within this week's
//      remaining caps, run them with a time budget, and log the pass in
//      scrape_runs (API calls per provider, jobs, new creators, errors).
// When every provider of a platform is out of credits, the pass stops that
// platform and hands its jobs back untouched (the other platforms go on).
//
// Instagram (RapidAPI plan counted in requests) has its own call caps
// (budget.ts: SCRAPE_INSTAGRAM_MAX_CALLS_PER_WEEK / _PER_30D): each Instagram
// job reserves the calls it may spend before it runs, and waits for the next
// window when they are not left. Instagram searches do not use the shared
// SCRAPE_WEEKLY_MAX_DISCOVERY_KEYWORDS (they are bounded by the call caps).
// A refresh of a creator not in the catalog yet (an Instagram lead) goes
// through the discovery gate (ingest.ts): 1 call when it is left out, a full
// refresh when it is kept, which then counts as a new creator.

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
  /** Every discovery job run (Instagram ones included). */
  discoverJobs: number;
  /** Instagram discovery jobs (searches, hashtags): bounded by the Instagram call caps, not the shared search cap. */
  discoverJobsInstagram: number;
  apiCalls: number;
  credits: number;
  callsByProvider: Record<string, number>;
  creatorsNew: number;
  discovered: number;
  /** Instagram accounts queued to be looked at (snowball and search hits without a follower count). */
  leadsQueued: number;
  /** Accounts looked at and left out by the discovery gate (too small, private, brand…). */
  skipped: number;
  /** Instagram calls still allowed this week / 30 days, before this pass (null when Instagram is off). */
  instagramCallsLeft: number | null;
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
    discoverJobsInstagram: 0,
    apiCalls: 0,
    credits: 0,
    callsByProvider: {},
    creatorsNew: 0,
    discovered: 0,
    leadsQueued: 0,
    skipped: 0,
    instagramCallsLeft: null,
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

  // 3. This week's remaining caps (and the Instagram call caps).
  const caps = weeklyCaps();
  const usage = await weeklyUsage(admin);
  const left = remaining(caps, usage);
  const ig: InstagramAllowance | null = platforms.includes("instagram") ? await instagramAllowance(admin, Date.now(), usage) : null;
  summary.instagramCallsLeft = ig?.left ?? null;
  // Instagram searches are bounded by the Instagram call caps, not the shared search cap.
  let igDiscovery = Boolean(ig && ig.left > 0);
  if (igDiscovery && left.discoveryKeywords <= 0 && left.refreshes <= 0) {
    const { data } = await admin.from("scrape_jobs").select("id").eq("kind", "creator_discover").eq("platform", "instagram").eq("status", "queued").lte("run_after", nowIso).limit(1);
    igDiscovery = Boolean(data?.length);
  }
  const discoverLimit = Math.min(opts.budget, left.discoveryKeywords + (igDiscovery ? opts.budget : 0));
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
  const marketMaxPage = envInt("SCRAPE_MARKET_MAX_PAGE", 500);
  const leadsPerRefresh = Math.max(0, envInt("SCRAPE_INSTAGRAM_LEADS_PER_REFRESH", 15));
  const similarCalls = process.env.SCRAPE_INSTAGRAM_SIMILAR === "1";
  const handBack: Job[] = [];
  const handBackLater: Job[] = [];
  const handBackAt: { job: Job; at: string }[] = [];
  const nextWeek = new Date(weekStart().getTime() + 7 * 86_400_000).toISOString();
  let sharedSearchesLeft = left.discoveryKeywords;
  let igReserved = 0;
  const igCapped = providerOrder("instagram")[0]?.name === "rapidapi-instagram";
  // Platforms whose every provider is out of credits (or refuses the key): their jobs go back untouched.
  const stopped = new Set<ScrapePlatform>();

  const countJob = (job: Job, platform: ScrapePlatform, delta: number) => {
    if (job.kind !== "creator_discover") summary.refreshJobs += delta;
    else {
      summary.discoverJobs += delta;
      if (platform === "instagram") summary.discoverJobsInstagram += delta;
    }
  };

  const runJob = async (job: Job) => {
    const platform = normalizePlatform(job.platform);
    const source = platform ? sourceOf(platform) : null;
    if ((platform && stopped.has(platform)) || Date.now() - started > timeBudget) {
      handBack.push(job);
      return;
    }
    if (!platform || !source || (isMarketTarget(job.target) && !process.env.SCRAPECREATORS_API_KEY)) {
      // No provider for this platform right now: try again tomorrow, no call spent.
      handBackLater.push(job);
      return;
    }
    const discover = job.kind === "creator_discover";
    if (discover && platform !== "instagram") {
      // The shared search cap (TikTok, YouTube, Creator Marketplace pages).
      if (sharedSearchesLeft <= 0) {
        handBackAt.push({ job, at: nextWeek });
        return;
      }
      sharedSearchesLeft -= 1;
    }
    // Instagram: reserve the calls this job may spend, or wait for the next window.
    // Only when RapidAPI serves Instagram first: ScrapeCreators is outside the RapidAPI plan.
    const igNeed = platform !== "instagram" || !igCapped ? 0 : discover ? 1 : source.callsPerRefresh + (similarCalls ? 1 : 0);
    if (igNeed && ig) {
      if (igReserved + igNeed > ig.left) {
        handBackAt.push({ job, at: ig.retryAt });
        return;
      }
      igReserved += igNeed;
    }
    const jobMeter = new CallMeter();
    countJob(job, platform, 1);
    try {
      if (discover && isMarketTarget(job.target)) {
        const r = await discoverMarketplace(admin, job.target, { meter: jobMeter, minFollowers, maxFollowers, maxNew: newCreatorsLeft, maxPage: marketMaxPage });
        newCreatorsLeft = Math.max(0, newCreatorsLeft - r.added);
        summary.discovered += r.added;
        summary.creatorsNew += r.added;
      } else if (discover && platform === "instagram" && isHashtagTarget(job.target)) {
        const r = await discoverInstagramHashtag(admin, source, job.target, { meter: jobMeter, maxLeads: 30 });
        summary.leadsQueued += r.leads;
      } else if (discover) {
        const r = await discoverKeyword(admin, source, job.target, { meter: jobMeter, minFollowers, maxFollowers, maxNew: newCreatorsLeft });
        newCreatorsLeft = Math.max(0, newCreatorsLeft - r.added);
        summary.discovered += r.added;
        summary.creatorsNew += r.added;
        summary.leadsQueued += r.leads;
      } else {
        const r = await refreshCreator(admin, source, job.target, {
          meter: jobMeter,
          // A creator not in the catalog yet (an Instagram lead) is looked at first.
          gate: { minFollowers, maxFollowers, allowNew: newCreatorsLeft > 0 },
          snowball: platform === "instagram" ? { maxLeads: newCreatorsLeft > 0 ? leadsPerRefresh : 0, similar: similarCalls } : undefined,
        });
        summary.videos += r.videos;
        summary.coversStored += r.coversStored;
        summary.leadsQueued += r.leadsQueued;
        if (r.isNew) {
          newCreatorsLeft = Math.max(0, newCreatorsLeft - 1);
          summary.discovered += 1;
          summary.creatorsNew += 1;
        }
      }
      summary.done += 1;
      await admin.from("scrape_jobs").update({ status: "done", finished_at: new Date().toISOString(), last_error: null }).eq("id", job.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof CreatorDeferred) {
        // No call spent: back to the queue for tomorrow, as it was.
        countJob(job, platform, -1);
        handBackLater.push(job);
        return;
      }
      if (e instanceof CreatorSkipped) {
        // Looked at and left out: done, nothing written, no failure counted.
        summary.done += 1;
        summary.skipped += 1;
        await admin.from("scrape_jobs").update({ status: "done", finished_at: new Date().toISOString(), last_error: message.slice(0, 500) }).eq("id", job.id);
        return;
      }
      if (e instanceof AllProvidersFailed && e.allDown) {
        // Out of credits everywhere for this platform: stop it for this pass (the
        // others go on, e.g. TikTok when the Instagram plan is used up), give the job back as it was.
        stopped.add(platform);
        countJob(job, platform, -1);
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
      // Keep the reservation to what the job really spent.
      if (igNeed) igReserved += instagramCalls(jobMeter.byProvider) - igNeed;
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
  for (const { job, at } of handBackAt) await giveBack([job], at);
  summary.deferred = handBack.length + handBackLater.length + handBackAt.length;
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
          // What the shared search cap reads: Instagram searches are bounded by the Instagram call caps.
          discoverJobs: summary.discoverJobs - summary.discoverJobsInstagram,
          discoverJobsInstagram: summary.discoverJobsInstagram,
          discovered: summary.discovered,
          leadsQueued: summary.leadsQueued,
          skipped: summary.skipped,
          instagramCallsLeft: summary.instagramCallsLeft,
          credits: meter.credits,
          callsByProvider: meter.byProvider,
          trackedQueued: summary.trackedQueued,
          deferred: summary.deferred,
          coversStored: summary.coversStored,
          stoppedNoCredits: stopped.size > 0,
          stoppedPlatforms: [...stopped],
          errors: summary.errors,
        },
      })
      .eq("id", run.id);
  }
  return result;
}
