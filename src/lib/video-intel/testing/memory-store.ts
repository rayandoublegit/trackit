import { performanceBand, performanceRatio } from "../performance";
import { synthesisDue } from "../synthesis";
import { videoKey, type BatchRow, type DailyUsage, type InsightUpsert, type IntelStore, type JobUpdate, type NewJob } from "../store";
import type { IntelJob, IntelJobKind, IntelVideo, Transcript } from "../types";

// In-memory IntelStore for tests: same semantics as the SQL (claim by
// priority then run_after, one row per (kind, platform, target), release
// refunds the attempt), no database.

type JobRow = IntelJob & { status: string; run_after: string; last_error: string | null; batch_id: string | null };

export class MemoryStore implements IntelStore {
  jobs: JobRow[] = [];
  videoRows = new Map<string, IntelVideo>();
  transcriptRows = new Map<string, Transcript>();
  insights = new Map<string, InsightUpsert>();
  creatorInsights = new Map<string, Record<string, unknown>>();
  batches = new Map<string, BatchRow>();
  runs: Record<string, unknown>[] = [];
  pauses = new Map<string, { until: string | null; reason: string | null }>();
  niches: Record<string, unknown>[] = [];
  private nextId = 1;
  now: () => number = Date.now;

  addVideo(v: Partial<IntelVideo> & { platform: string; video_id: string; username: string }): IntelVideo {
    const full: IntelVideo = {
      caption: "",
      hashtags: [],
      duration_seconds: 30,
      media_type: "video",
      share_url: `https://www.tiktok.com/@${v.username}/video/${v.video_id}`,
      music_title: null,
      is_ad: false,
      has_product_link: false,
      views: 1000,
      likes: 0,
      comments: 0,
      shares: 0,
      posted_at: null,
      median_views: 1000,
      ...v,
    };
    this.videoRows.set(videoKey(full.platform, full.video_id), full);
    return full;
  }

  addJob(kind: IntelJobKind, platform: string, target: string, priority = 5, extra: Partial<JobRow> = {}): JobRow {
    const row: JobRow = { id: this.nextId++, kind, platform, target, priority, attempts: 0, status: "queued", run_after: new Date(0).toISOString(), last_error: null, batch_id: null, ...extra };
    this.jobs.push(row);
    return row;
  }

  job(kind: IntelJobKind, target: string) {
    return this.jobs.find((j) => j.kind === kind && j.target === target);
  }

  async claimJobs(kind: IntelJobKind, limit: number): Promise<IntelJob[]> {
    const nowIso = new Date(this.now()).toISOString();
    const picked = this.jobs
      .filter((j) => j.kind === kind && j.status === "queued" && j.run_after <= nowIso)
      .sort((a, b) => a.priority - b.priority || a.run_after.localeCompare(b.run_after) || a.id - b.id)
      .slice(0, Math.max(0, limit));
    for (const j of picked) {
      j.status = "running";
      j.attempts += 1;
    }
    return picked.map((j) => ({ ...j }));
  }

  async updateJobs(updates: JobUpdate[]): Promise<void> {
    for (const u of updates) {
      const j = this.jobs.find((x) => x.id === u.id);
      if (!j) continue;
      j.status = u.status;
      if (u.runAfter) j.run_after = u.runAfter;
      if (u.error !== undefined) j.last_error = u.error;
      if (u.batchId !== undefined) j.batch_id = u.batchId;
      if (u.refundAttempt) {
        j.attempts = Math.max(0, j.attempts - 1);
        j.batch_id = null;
        if (!u.runAfter) j.run_after = new Date(this.now()).toISOString();
      }
    }
  }

  async enqueueJobs(jobs: NewJob[], opts: { resetDone?: boolean } = {}): Promise<number> {
    let n = 0;
    for (const nj of jobs) {
      const have = this.jobs.find((j) => j.kind === nj.kind && j.platform === nj.platform && j.target === nj.target);
      if (have) {
        if (opts.resetDone) Object.assign(have, { status: "queued", attempts: 0, batch_id: null });
        continue;
      }
      this.addJob(nj.kind, nj.platform, nj.target, nj.priority, { run_after: new Date(this.now()).toISOString() });
      n += 1;
    }
    return n;
  }

  async jobsByIds(ids: number[]): Promise<IntelJob[]> {
    return this.jobs.filter((j) => ids.includes(j.id)).map((j) => ({ ...j }));
  }

  async submittedJobsOf(batchId: string): Promise<IntelJob[]> {
    return this.jobs.filter((j) => j.batch_id === batchId && j.status === "submitted").map((j) => ({ ...j }));
  }

  async videos(keys: { platform: string; videoId: string }[]): Promise<IntelVideo[]> {
    return keys.map((k) => this.videoRows.get(videoKey(k.platform, k.videoId))).filter((v): v is IntelVideo => Boolean(v));
  }

  async transcripts(keys: { platform: string; videoId: string }[]): Promise<Map<string, Transcript>> {
    const out = new Map<string, Transcript>();
    for (const k of keys) {
      const t = this.transcriptRows.get(videoKey(k.platform, k.videoId));
      if (t) out.set(videoKey(k.platform, k.videoId), t);
    }
    return out;
  }

  async upsertTranscripts(rows: { platform: string; videoId: string; transcript: Transcript }[]): Promise<void> {
    for (const r of rows) this.transcriptRows.set(videoKey(r.platform, r.videoId), r.transcript);
  }

  async upsertInsights(rows: InsightUpsert[]): Promise<void> {
    for (const r of rows) this.insights.set(videoKey(r.platform, r.video_id), r);
  }

  async creatorInsightInput(platform: string, username: string) {
    const rows = [...this.insights.values()].filter((r) => r.platform === platform && r.username === username);
    if (!rows.length) return null;
    return {
      platform,
      username,
      niche: null,
      rows: rows.map((r) => {
        const v = this.videoRows.get(videoKey(platform, r.video_id));
        return {
          video_id: r.video_id,
          views: Number(r.views ?? 0),
          performance_ratio: (r.performance_ratio as number | null) ?? performanceRatio(v?.views, v?.median_views),
          band: (r.band as any) ?? performanceBand(v?.views, v?.median_views),
          hook: (r.hook as string) ?? null,
          hook_type: (r.hook_type as string) ?? null,
          content_format: (r.content_format as string) ?? null,
          cta_type: (r.cta_type as string) ?? null,
          has_cta: (r.has_cta as boolean) ?? null,
          has_product: (r.has_product as boolean) ?? null,
          tone: (r.tone as string) ?? null,
          topic: (r.topic as string) ?? null,
          pace_wps: (r.pace_wps as number) ?? null,
          duration_seconds: v?.duration_seconds ?? null,
          share_url: v?.share_url ?? null,
        };
      }),
    };
  }

  async upsertCreatorInsight(row: Record<string, unknown>): Promise<void> {
    this.creatorInsights.set(`${row.platform}:${row.username}`, row);
  }

  async enqueueSynthesis(platform: string, usernames: string[], minVideos: number): Promise<number> {
    let n = 0;
    for (const u of usernames) {
      const analysed = [...this.insights.values()].filter((r) => r.platform === platform && r.username === u && r.band != null).length;
      if (analysed < minVideos) continue;
      const cur = this.creatorInsights.get(`${platform}:${u}`) as any;
      if (!synthesisDue(cur ? { videos_analysed: cur.videos_analysed, prompt_version: cur.prompt_version, updated_at: cur.updated_at } : null, analysed, this.now())) continue;
      const have = this.jobs.find((j) => j.kind === "synthesize" && j.platform === platform && j.target === u);
      if (have && !["done", "failed"].includes(have.status)) continue;
      if (have) Object.assign(have, { status: "queued", attempts: 0, batch_id: null });
      else this.addJob("synthesize", platform, u, 3);
      n += 1;
    }
    return n;
  }

  async insertBatch(row: BatchRow): Promise<void> {
    this.batches.set(row.id, { ...row });
  }

  async updateBatch(id: string, patch: Partial<BatchRow>): Promise<void> {
    const b = this.batches.get(id);
    if (b) Object.assign(b, patch);
  }

  async openBatches(): Promise<BatchRow[]> {
    return [...this.batches.values()].filter((b) => ["in_progress", "canceling", "ended"].includes(b.status)).map((b) => ({ ...b }));
  }

  async dailyUsage(sinceIso: string): Promise<DailyUsage> {
    const u: DailyUsage = { analysesSubmitted: 0, synthesesSubmitted: 0, usd: 0, transcriptCredits: 0, openBatches: 0 };
    for (const b of this.batches.values()) {
      if (["in_progress", "canceling"].includes(b.status)) u.openBatches += 1;
      if (b.submitted_at < sinceIso) continue;
      if (b.kind === "analyze") u.analysesSubmitted += b.request_count;
      else u.synthesesSubmitted += b.request_count;
      u.usd += Number(b.actual_cost_usd ?? b.est_cost_usd ?? 0);
    }
    for (const r of this.runs) {
      if (r.stage !== "transcripts" || String(r.started_at) < sinceIso) continue;
      u.transcriptCredits += Number(r.credits ?? 0);
      u.usd += Number(r.est_usd ?? 0);
      u.sttCalls = (u.sttCalls ?? 0) + (Number((r.notes as any)?.sttCalls ?? 0) || 0);
    }
    return u;
  }

  async recordRun(row: Record<string, unknown> & { stage: string }): Promise<void> {
    this.runs.push(row);
  }

  async pausedUntil(key: string) {
    return this.pauses.get(key) ?? { until: null, reason: null };
  }

  async setPause(key: string, untilIso: string | null, reason: string | null): Promise<void> {
    this.pauses.set(key, { until: untilIso, reason });
  }

  async enqueueNewVideos(): Promise<Record<string, number>> {
    return { scanned: 0, queued: 0, requeued: 0 };
  }

  async refreshNichePatterns(): Promise<number> {
    return 0;
  }
}
