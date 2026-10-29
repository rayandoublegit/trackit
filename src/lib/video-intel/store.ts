import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntelJob, IntelJobKind, IntelVideo, Transcript } from "./types";

// Everything the pipeline reads and writes, behind one interface, so the
// workers are tested against an in-memory store (testing/memory-store.ts)
// and run against Supabase (below) in production.

export type JobUpdate = {
  id: number;
  status: "queued" | "done" | "failed" | "submitted";
  runAfter?: string;
  error?: string | null;
  batchId?: string | null;
  /** queued only: give the attempt back (the job never ran: pause, cap, failed submit). */
  refundAttempt?: boolean;
};

export type NewJob = { kind: IntelJobKind; platform: string; target: string; priority: number };

export type BatchRow = {
  id: string;
  kind: "analyze" | "synthesize";
  model: string;
  status: "in_progress" | "canceling" | "ended" | "processed" | "failed";
  request_count: number;
  succeeded?: number;
  errored?: number;
  expired?: number;
  canceled?: number;
  results_processed: number;
  est_cost_usd: number;
  actual_cost_usd?: number | null;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  submitted_at: string;
  ended_at?: string | null;
  results_processed_at?: string | null;
  last_polled_at?: string | null;
  last_error?: string | null;
};

export type InsightUpsert = Record<string, unknown> & { platform: string; video_id: string; username: string };

/** usd: LLM spend today (batches + speech to text); sttCalls: speech-to-text calls today. */
export type DailyUsage = { analysesSubmitted: number; synthesesSubmitted: number; usd: number; transcriptCredits: number; openBatches: number; sttCalls?: number };

export type CreatorInsightInput = {
  platform: string;
  username: string;
  niche: string | null;
  rows: import("./synthesis").InsightRow[];
};

export interface IntelStore {
  claimJobs(kind: IntelJobKind, limit: number): Promise<IntelJob[]>;
  updateJobs(updates: JobUpdate[]): Promise<void>;
  enqueueJobs(jobs: NewJob[], opts?: { resetDone?: boolean }): Promise<number>;
  jobsByIds(ids: number[]): Promise<IntelJob[]>;
  /** Jobs tied to a batch that are still "submitted" (to requeue what a batch never answered). */
  submittedJobsOf(batchId: string): Promise<IntelJob[]>;

  videos(keys: { platform: string; videoId: string }[]): Promise<IntelVideo[]>;
  transcripts(keys: { platform: string; videoId: string }[]): Promise<Map<string, Transcript>>;
  upsertTranscripts(rows: { platform: string; videoId: string; transcript: Transcript }[]): Promise<void>;
  upsertInsights(rows: InsightUpsert[]): Promise<void>;
  creatorInsightInput(platform: string, username: string): Promise<CreatorInsightInput | null>;
  upsertCreatorInsight(row: Record<string, unknown>): Promise<void>;
  enqueueSynthesis(platform: string, usernames: string[], minVideos: number, promptVersion: number): Promise<number>;

  insertBatch(row: BatchRow): Promise<void>;
  updateBatch(id: string, patch: Partial<BatchRow>): Promise<void>;
  openBatches(): Promise<BatchRow[]>;

  dailyUsage(sinceIso: string): Promise<DailyUsage>;
  recordRun(row: { stage: string; started_at: string; items: number; calls: number; credits: number; est_usd: number; notes: Record<string, unknown> }): Promise<void>;

  pausedUntil(key: string): Promise<{ until: string | null; reason: string | null }>;
  setPause(key: string, untilIso: string | null, reason: string | null): Promise<void>;

  /** Database-only enqueue of new videos (watermark walk); returns counts. */
  enqueueNewVideos(limit: number, promptVersion: number): Promise<Record<string, number>>;
  refreshNichePatterns(platform: string): Promise<number>;
}

export const videoKey = (platform: string, videoId: string) => `${platform.toLowerCase()}:${videoId}`;

// ── Supabase implementation ──────────────────────────────────────────────────

const CHUNK = 500;
const chunks = <T,>(list: T[], size = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/** Groups (platform, id) keys by platform for `.in()` reads. */
function byPlatform(keys: { platform: string; videoId: string }[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const k of keys) {
    const p = k.platform.toLowerCase();
    m.set(p, [...(m.get(p) ?? []), k.videoId]);
  }
  return m;
}

export function supabaseIntelStore(admin: SupabaseClient): IntelStore {
  return {
    async claimJobs(kind, limit) {
      if (limit <= 0) return [];
      const { data, error } = await admin.rpc("claim_video_intel_jobs", { p_kind: kind, p_limit: limit });
      fail("claim_video_intel_jobs", error);
      return ((data ?? []) as IntelJob[]).map((j) => ({ ...j, id: Number(j.id) }));
    },

    async updateJobs(updates) {
      // Group identical patches: one UPDATE … WHERE id IN (…) per group.
      const groups = new Map<string, { patch: Record<string, unknown>; ids: number[]; refund: boolean }>();
      const now = new Date().toISOString();
      for (const u of updates) {
        const patch: Record<string, unknown> = { status: u.status, updated_at: now, locked_at: null };
        if (u.runAfter) patch.run_after = u.runAfter;
        if (u.error !== undefined) patch.last_error = u.error ? u.error.slice(0, 500) : null;
        if (u.batchId !== undefined) patch.batch_id = u.batchId;
        const key = JSON.stringify({ ...patch, updated_at: undefined, refund: Boolean(u.refundAttempt) });
        const g = groups.get(key) ?? { patch, ids: [], refund: Boolean(u.refundAttempt) };
        g.ids.push(u.id);
        groups.set(key, g);
      }
      for (const g of groups.values()) {
        for (const ids of chunks(g.ids)) {
          if (g.refund) {
            const { error } = await admin.rpc("release_video_intel_jobs", { p_ids: ids, p_run_after: (g.patch.run_after as string | undefined) ?? new Date().toISOString() });
            fail("release_video_intel_jobs", error);
          } else {
            const { error } = await admin.from("video_intel_jobs").update(g.patch).in("id", ids);
            fail("video_intel_jobs update", error);
          }
        }
      }
    },

    async enqueueJobs(jobs, opts = {}) {
      let n = 0;
      for (const part of chunks(jobs)) {
        const rows = part.map((j) => ({ ...j, platform: j.platform.toLowerCase(), status: "queued", attempts: 0, run_after: new Date().toISOString(), batch_id: null }));
        const { data, error } = opts.resetDone
          ? await admin.from("video_intel_jobs").upsert(rows, { onConflict: "kind,platform,target" }).select("id")
          : await admin.from("video_intel_jobs").upsert(rows, { onConflict: "kind,platform,target", ignoreDuplicates: true }).select("id");
        fail("video_intel_jobs enqueue", error);
        n += (data ?? []).length;
      }
      return n;
    },

    async jobsByIds(ids) {
      const out: IntelJob[] = [];
      for (const part of chunks(ids)) {
        const { data, error } = await admin.from("video_intel_jobs").select("id, kind, platform, target, priority, attempts, status, batch_id").in("id", part);
        fail("video_intel_jobs read", error);
        out.push(...((data ?? []) as IntelJob[]).map((j) => ({ ...j, id: Number(j.id) })));
      }
      return out;
    },

    async submittedJobsOf(batchId) {
      const { data, error } = await admin.from("video_intel_jobs").select("id, kind, platform, target, priority, attempts, status, batch_id").eq("batch_id", batchId).eq("status", "submitted").limit(100_000);
      fail("video_intel_jobs by batch", error);
      return ((data ?? []) as IntelJob[]).map((j) => ({ ...j, id: Number(j.id) }));
    },

    async videos(keys) {
      const out: IntelVideo[] = [];
      for (const [platform, ids] of byPlatform(keys)) {
        for (const part of chunks(ids)) {
          const { data, error } = await admin
            .from("creator_videos")
            .select("platform, video_id, username, caption, hashtags, duration_seconds, media_type, share_url, cover_url, music_title, is_ad, has_product_link, views, likes, comments, shares, posted_at, subtitle_url, subtitle_lang, audio_kind, media_url")
            .eq("platform", platform)
            .in("video_id", part);
          fail("creator_videos read", error);
          out.push(...((data ?? []) as IntelVideo[]));
        }
      }
      const names = [...new Set(out.map((v) => v.username))];
      const medians = new Map<string, number | null>();
      for (const part of chunks(names)) {
        const { data } = await admin.from("creators_index").select("username, median_video_views").in("username", part);
        for (const r of (data ?? []) as { username: string; median_video_views: number | null }[]) medians.set(r.username, r.median_video_views == null ? null : Number(r.median_video_views));
      }
      return out.map((v) => ({ ...v, platform: v.platform.toLowerCase(), median_views: medians.get(v.username) ?? null }));
    },

    async transcripts(keys) {
      const out = new Map<string, Transcript>();
      for (const [platform, ids] of byPlatform(keys)) {
        for (const part of chunks(ids)) {
          const { data, error } = await admin.from("creator_video_transcripts").select("platform, video_id, status, source, language, text, segments, word_count, credits").eq("platform", platform).in("video_id", part);
          fail("creator_video_transcripts read", error);
          for (const r of (data ?? []) as any[]) {
            out.set(videoKey(r.platform, r.video_id), {
              status: r.status,
              source: r.source,
              language: r.language,
              text: r.text ?? "",
              segments: Array.isArray(r.segments) ? r.segments : [],
              wordCount: Number(r.word_count ?? 0),
              credits: Number(r.credits ?? 0),
            });
          }
        }
      }
      return out;
    },

    async upsertTranscripts(rows) {
      const { createHash } = await import("node:crypto");
      for (const part of chunks(rows)) {
        const payload = part.map(({ platform, videoId, transcript: t }) => ({
          platform: platform.toLowerCase(),
          video_id: videoId,
          status: t.status,
          source: t.source,
          language: t.language,
          text: t.text || null,
          segments: t.segments,
          word_count: t.wordCount,
          has_speech: t.status === "ok",
          credits: t.credits,
          hash: t.text ? createHash("sha1").update(t.text).digest("hex") : null,
          fetched_at: new Date().toISOString(),
        }));
        const { error } = await admin.from("creator_video_transcripts").upsert(payload, { onConflict: "platform,video_id" });
        fail("creator_video_transcripts upsert", error);
      }
    },

    async upsertInsights(rows) {
      for (const part of chunks(rows)) {
        const { error } = await admin.from("creator_video_insights").upsert(part, { onConflict: "platform,video_id" });
        fail("creator_video_insights upsert", error);
      }
    },

    async creatorInsightInput(platform, username) {
      const p = platform.toLowerCase();
      const [{ data: rows, error }, { data: creator }] = await Promise.all([
        admin
          .from("creator_video_insights")
          .select("video_id, views, performance_ratio, band, hook, hook_type, content_format, cta_type, has_cta, has_product, promotion_type, tone, topic, pace_wps")
          .eq("platform", p)
          .eq("username", username)
          .limit(500),
        admin.from("creators_index").select("primary_niche").eq("username", username).maybeSingle(),
      ]);
      fail("creator_video_insights read", error);
      const list = (rows ?? []) as any[];
      if (!list.length) return null;
      const ids = list.map((r) => String(r.video_id));
      const meta = new Map<string, any>();
      for (const part of chunks(ids)) {
        const { data } = await admin.from("creator_videos").select("video_id, duration_seconds, posted_at, share_url, cover_url").eq("platform", p).in("video_id", part);
        for (const v of (data ?? []) as any[]) meta.set(String(v.video_id), v);
      }
      return {
        platform: p,
        username,
        niche: (creator as { primary_niche?: string | null } | null)?.primary_niche ?? null,
        rows: list.map((r) => {
          const m = meta.get(String(r.video_id)) ?? {};
          return {
            ...r,
            views: r.views == null ? null : Number(r.views),
            performance_ratio: r.performance_ratio == null ? null : Number(r.performance_ratio),
            pace_wps: r.pace_wps == null ? null : Number(r.pace_wps),
            duration_seconds: m.duration_seconds ?? null,
            posted_at: m.posted_at ?? null,
            share_url: m.share_url ?? null,
            cover_url: m.cover_url ?? null,
          };
        }),
      };
    },

    async upsertCreatorInsight(row) {
      const { error } = await admin.from("creator_content_insights").upsert(row, { onConflict: "platform,username" });
      fail("creator_content_insights upsert", error);
    },

    async enqueueSynthesis(platform, usernames, minVideos, promptVersion) {
      if (!usernames.length) return 0;
      const { data, error } = await admin.rpc("enqueue_creator_synthesis", { p_platform: platform, p_usernames: usernames, p_min_videos: minVideos, p_prompt_version: promptVersion });
      fail("enqueue_creator_synthesis", error);
      return Number(data ?? 0);
    },

    async insertBatch(row) {
      const { error } = await admin.from("anthropic_batches").insert(row);
      fail("anthropic_batches insert", error);
    },

    async updateBatch(id, patch) {
      const { error } = await admin.from("anthropic_batches").update(patch).eq("id", id);
      fail("anthropic_batches update", error);
    },

    async openBatches() {
      const { data, error } = await admin.from("anthropic_batches").select("*").in("status", ["in_progress", "canceling", "ended"]).order("submitted_at", { ascending: true }).limit(200);
      fail("anthropic_batches read", error);
      return (data ?? []) as BatchRow[];
    },

    async dailyUsage(sinceIso) {
      const usage: DailyUsage = { analysesSubmitted: 0, synthesesSubmitted: 0, usd: 0, transcriptCredits: 0, openBatches: 0, sttCalls: 0 };
      const { data: batches, error } = await admin.from("anthropic_batches").select("kind, status, request_count, est_cost_usd, actual_cost_usd").gte("submitted_at", sinceIso).limit(10_000);
      fail("anthropic_batches usage", error);
      for (const b of (batches ?? []) as any[]) {
        if (b.kind === "analyze") usage.analysesSubmitted += Number(b.request_count ?? 0);
        if (b.kind === "synthesize") usage.synthesesSubmitted += Number(b.request_count ?? 0);
        usage.usd += Number(b.actual_cost_usd ?? b.est_cost_usd ?? 0);
      }
      const { count } = await admin.from("anthropic_batches").select("id", { count: "exact", head: true }).in("status", ["in_progress", "canceling"]);
      usage.openBatches = Number(count ?? 0);
      for (let from = 0; from < 100_000; from += 1000) {
        const { data, error: runErr } = await admin.from("video_intel_runs").select("credits, est_usd, notes").eq("stage", "transcripts").gte("started_at", sinceIso).range(from, from + 999);
        fail("video_intel_runs usage", runErr);
        for (const r of (data ?? []) as { credits: number; est_usd: number; notes: Record<string, unknown> | null }[]) {
          usage.transcriptCredits += Number(r.credits ?? 0);
          usage.usd += Number(r.est_usd ?? 0);
          usage.sttCalls = (usage.sttCalls ?? 0) + (Number(r.notes?.sttCalls ?? 0) || 0);
        }
        if ((data ?? []).length < 1000) break;
      }
      return usage;
    },

    async recordRun(row) {
      await admin.from("video_intel_runs").insert({ ...row, finished_at: new Date().toISOString() });
    },

    async pausedUntil(key) {
      const { data } = await admin.from("video_intel_state").select("paused_until, reason").eq("key", `pause:${key}`).maybeSingle();
      const row = data as { paused_until: string | null; reason: string | null } | null;
      return { until: row?.paused_until ?? null, reason: row?.reason ?? null };
    },

    async setPause(key, untilIso, reason) {
      await admin.from("video_intel_state").upsert({ key: `pause:${key}`, paused_until: untilIso, reason, updated_at: new Date().toISOString() }, { onConflict: "key" });
    },

    async enqueueNewVideos(limit, promptVersion) {
      const { data, error } = await admin.rpc("enqueue_video_intel", { p_limit: limit, p_prompt_version: promptVersion });
      fail("enqueue_video_intel", error);
      return (data ?? {}) as Record<string, number>;
    },

    async refreshNichePatterns(platform) {
      const { data, error } = await admin.rpc("refresh_video_intel_niche_patterns", { p_platform: platform });
      fail("refresh_video_intel_niche_patterns", error);
      return Number(data ?? 0);
    },
  };
}
