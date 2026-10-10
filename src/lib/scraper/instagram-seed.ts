import type { SupabaseClient } from "@supabase/supabase-js";
import { NICHE_TREE } from "@/lib/niche-tree";
import { instagramAllowance } from "./budget";
import { instagramSearchQueries } from "./discovery-plan";
import { normalizeHandle } from "./identity";
import { queueInstagramLeads } from "./ingest";

// Instagram discovery backlog (no API call here: the worker runs the jobs
// within the Instagram call caps). Queues, French first:
//   - the next `searches` Instagram search queries (discovery-plan.ts) not
//     searched in the last 30 days (finished jobs are pruned after 30 days),
//     as creator_discover jobs (1 call each; the ~5 accounts each returns are
//     added or queued as leads);
//   - optionally hashtags of the niche tree ("#skincare", 1 call each, the
//     endpoint is often busy so off by default);
//   - optionally handles given by hand, as leads (looked at, then added);
//   - optionally a first refresh of stored Instagram creators never scraped.

export type InstagramSeedOptions = {
  searches: number;
  hashtags?: number;
  handles?: string[];
  refreshStored?: number;
};

export type InstagramSeedResult = {
  searchesQueued: number;
  hashtagsQueued: number;
  leadsQueued: number;
  storedQueued: number;
  /** Queries not searched yet in the last 30 days, before this run. */
  searchesLeft: number;
  instagramCallsLeft: number;
  /** Upper bound of the calls the queued jobs may spend (leads they find cost more, within the caps). */
  maxCallsQueued: number;
};

const CHUNK = 200;

/** Targets of Instagram discovery jobs queued or run in the last 30 days, among these. */
async function seenTargets(admin: SupabaseClient, targets: string[]): Promise<Set<string>> {
  const seen = new Set<string>();
  for (let i = 0; i < targets.length; i += CHUNK) {
    const { data, error } = await admin
      .from("scrape_jobs")
      .select("target")
      .eq("kind", "creator_discover")
      .eq("platform", "instagram")
      .in("target", targets.slice(i, i + CHUNK));
    if (error) throw new Error(`scrape_jobs: ${error.message}`);
    for (const r of data ?? []) seen.add(String(r.target));
  }
  return seen;
}

async function insertJobs(admin: SupabaseClient, jobs: Record<string, unknown>[]): Promise<number> {
  let queued = 0;
  for (let i = 0; i < jobs.length; i += CHUNK) {
    const batch = jobs.slice(i, i + CHUNK);
    const { error } = await admin.from("scrape_jobs").insert(batch);
    if (!error) {
      queued += batch.length;
      continue;
    }
    // One live job per target: one by one, a duplicate is refused, which is fine.
    for (const job of batch) if (!(await admin.from("scrape_jobs").insert(job)).error) queued += 1;
  }
  return queued;
}

export async function seedInstagramDiscovery(admin: SupabaseClient, opts: InstagramSeedOptions): Promise<InstagramSeedResult> {
  const queries = instagramSearchQueries();
  const seen = await seenTargets(admin, queries.map((q) => q.keyword));
  const fresh = queries.filter((q) => !seen.has(q.keyword));
  const searchJobs = fresh
    .slice(0, Math.max(0, opts.searches))
    .map((q) => ({ kind: "creator_discover", platform: "instagram", target: q.keyword, priority: q.country === "FR" ? 2 : 3 }));
  const searchesQueued = await insertJobs(admin, searchJobs);

  let hashtagsQueued = 0;
  if (opts.hashtags && opts.hashtags > 0) {
    const tags = [...new Set(Object.values(NICHE_TREE).flat())].map((t) => `#${t.replace(/[^\p{L}\p{N}_]/gu, "")}`).filter((t) => t.length > 2);
    const seenTags = await seenTargets(admin, tags);
    const tagJobs = tags
      .filter((t) => !seenTags.has(t))
      .slice(0, opts.hashtags)
      .map((t) => ({ kind: "creator_discover", platform: "instagram", target: t, priority: 4 }));
    hashtagsQueued = await insertJobs(admin, tagJobs);
  }

  const handles = (opts.handles ?? []).map(normalizeHandle).filter(Boolean);
  const leadsQueued = handles.length
    ? await queueInstagramLeads(admin, handles.map((h) => ({ username: h, displayName: "", via: "search" as const })), { max: handles.length, priority: 3 })
    : 0;

  let storedQueued = 0;
  if (opts.refreshStored && opts.refreshStored > 0) {
    const { data, error } = await admin
      .from("creators_index")
      .select("username")
      .eq("platform", "instagram")
      .is("last_scraped_at", null)
      .limit(Math.min(opts.refreshStored, 10_000));
    if (error) throw new Error(`creators_index: ${error.message}`);
    const jobs = (data ?? []).map((r) => ({ kind: "creator_refresh", platform: "instagram", target: normalizeHandle(String(r.username)), priority: 3 }));
    storedQueued = await insertJobs(admin, jobs);
  }

  const allowance = await instagramAllowance(admin);
  return {
    searchesQueued,
    hashtagsQueued,
    leadsQueued,
    storedQueued,
    searchesLeft: fresh.length,
    instagramCallsLeft: allowance.left,
    maxCallsQueued: searchesQueued + hashtagsQueued + 3 * (leadsQueued + storedQueued),
  };
}
