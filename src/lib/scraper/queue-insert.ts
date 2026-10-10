import type { SupabaseClient } from "@supabase/supabase-js";

// Queue many scrape jobs fast: one round trip per 500 jobs instead of one per
// job. A live job (queued or running) is unique per (kind, platform, target)
// (index scrape_jobs_live_uq), so targets already live are skipped first; if a
// batch still hits the unique index (a race with another pass), that batch
// falls back to one insert per job and duplicates are simply refused.

export type QueueJob = { kind: string; platform: string; target: string; priority?: number };

const CHUNK = 500;
const PAGE = 1000;

export const jobKey = (j: Pick<QueueJob, "kind" | "platform" | "target">) => `${j.kind}\u0000${j.platform}\u0000${j.target}`;

/** Jobs not already live and not repeated, in order. */
export function newJobs(jobs: QueueJob[], live: Set<string>): QueueJob[] {
  const seen = new Set(live);
  const out: QueueJob[] = [];
  for (const j of jobs) {
    const k = jobKey(j);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(j);
  }
  return out;
}

async function liveKeys(admin: SupabaseClient, kinds: string[]): Promise<Set<string>> {
  const keys = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("scrape_jobs")
      .select("kind, platform, target")
      .in("kind", kinds)
      .in("status", ["queued", "running"])
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const r of data as QueueJob[]) keys.add(jobKey(r));
    if (data.length < PAGE) break;
  }
  return keys;
}

/** Inserts the jobs that are not live yet; returns how many were queued. */
export async function queueJobs(admin: SupabaseClient, jobs: QueueJob[]): Promise<number> {
  if (!jobs.length) return 0;
  const todo = newJobs(jobs, await liveKeys(admin, [...new Set(jobs.map((j) => j.kind))]));
  let queued = 0;
  for (let i = 0; i < todo.length; i += CHUNK) {
    const chunk = todo.slice(i, i + CHUNK);
    const { error } = await admin.from("scrape_jobs").insert(chunk);
    if (!error) {
      queued += chunk.length;
      continue;
    }
    for (const job of chunk) {
      const { error: one } = await admin.from("scrape_jobs").insert(job);
      if (!one) queued += 1;
    }
  }
  return queued;
}
