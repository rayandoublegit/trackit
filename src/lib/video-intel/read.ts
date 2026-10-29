import type { SupabaseClient } from "@supabase/supabase-js";
import { applyVideoFilters, bitsFromViewRow, trackedVideo, videoQueryFromParams, type VideoQuery } from "@/lib/creator-intel-read";
import { storageKeyCandidates } from "@/lib/creator-storage-key";
import type { VideoLibraryResult } from "@/lib/creator-intel-types";
import { CONTENT_FORMATS, CTA_TYPES, HOOK_TYPES } from "./types";
import type { CreatorInsightsResponse, VideoInsightBrief } from "./client-types";

// Reads for the app (stored data only, never a model call): a creator's
// "why their videos work" block, per-video insight badges, a transcript on
// demand, and the video library filtered / sorted by insights. Lists stay
// lean: no transcripts, no full analysis JSON.

type Row = Record<string, any>;

const num = (v: unknown): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

function brief(r: Row): VideoInsightBrief {
  return {
    hook: r.hook ?? "",
    hookType: r.hook_type ?? "other",
    format: r.content_format ?? "other",
    topic: r.topic ?? "",
    ctaType: r.cta_type ?? "none",
    hasProduct: Boolean(r.has_product ?? r.mentions_product),
    band: r.band ?? null,
    ratio: num(r.performance_ratio),
    paceWps: num(r.pace_wps),
  };
}

/** The stored creator, by storage key or plain handle (TikTok, then Instagram, then YouTube). */
async function resolveCreator(admin: SupabaseClient, raw: string): Promise<{ username: string; platform: string; videosTracked: number } | null> {
  const candidates = storageKeyCandidates(raw);
  if (!candidates.length) return null;
  const { data } = await admin.from("creators_index").select("username, platform, videos_tracked").in("username", candidates).limit(candidates.length);
  const rows = (data ?? []) as Row[];
  const row = candidates.map((k) => rows.find((r) => String(r.username).toLowerCase() === k)).find(Boolean);
  return row ? { username: String(row.username), platform: String(row.platform ?? "tiktok").toLowerCase(), videosTracked: Number(row.videos_tracked ?? 0) } : null;
}

export async function readCreatorInsights(admin: SupabaseClient, raw: string, opts: { full: boolean }): Promise<CreatorInsightsResponse | null> {
  const creator = await resolveCreator(admin, raw);
  if (!creator) return null;
  const [syn, ins] = await Promise.all([
    admin.from("creator_content_insights").select("summary_en, summary_fr, patterns, stats, videos_analysed, updated_at").eq("platform", creator.platform).eq("username", creator.username).maybeSingle(),
    admin
      .from("creator_video_insights")
      .select("video_id, hook, hook_type, content_format, topic, cta_type, has_product, band, performance_ratio, pace_wps")
      .eq("platform", creator.platform)
      .eq("username", creator.username)
      .limit(200),
  ]);
  // Tables not created yet (migration 000053 not applied): an honest "not analysed yet".
  const missing = Boolean(ins.error);
  const rows = missing ? [] : ((ins.data ?? []) as Row[]);
  const s = syn.error ? null : (syn.data as Row | null);
  const videos: Record<string, VideoInsightBrief> = {};
  for (const r of rows) videos[String(r.video_id)] = brief(r);
  const status: CreatorInsightsResponse["status"] = s ? "ready" : rows.length ? "partial" : "pending";
  const base: CreatorInsightsResponse = {
    username: creator.username,
    platform: creator.platform,
    status,
    locked: !opts.full,
    progress: { analysed: rows.length, tracked: creator.videosTracked },
    synthesis: null,
    videos: {},
  };
  if (!opts.full) {
    // Free plan: the shape of the answer (how many videos, how many patterns), not the content.
    return { ...base, teaser: { patterns: Array.isArray(s?.patterns) ? s!.patterns.length : 0, analysed: rows.length } };
  }
  return {
    ...base,
    videos,
    synthesis: s
      ? {
          summaryEn: s.summary_en ?? "",
          summaryFr: s.summary_fr ?? "",
          patterns: Array.isArray(s.patterns) ? s.patterns : [],
          best: Array.isArray(s.stats?.best) ? s.stats.best : [],
          worst: Array.isArray(s.stats?.worst) ? s.stats.worst : [],
          videosAnalysed: Number(s.videos_analysed ?? 0),
          winners: Number(s.stats?.winners ?? 0),
          losers: Number(s.stats?.losers ?? 0),
          updatedAt: s.updated_at ?? null,
        }
      : null,
  };
}

export async function readTranscript(admin: SupabaseClient, platform: string, videoId: string) {
  const { data, error } = await admin.from("creator_video_transcripts").select("status, source, language, text, segments, word_count, fetched_at").eq("platform", platform.toLowerCase()).eq("video_id", videoId).maybeSingle();
  if (error || !data) return null;
  const r = data as Row;
  return { status: r.status as string, source: r.source as string, language: (r.language as string) ?? null, text: (r.text as string) ?? "", segments: Array.isArray(r.segments) ? r.segments.slice(0, 600) : [], wordCount: Number(r.word_count ?? 0), fetchedAt: r.fetched_at as string };
}

// ── Library with insight filters ─────────────────────────────────────────────
export type InsightFilters = { hookType?: string; contentFormat?: string; ctaType?: string; topic?: string; mentionsProduct?: boolean; sortPerformance?: boolean; band?: string };

const oneOf = (v: string | null, allowed: readonly string[]) => (v && allowed.includes(v) ? v : undefined);

export function insightFiltersFromParams(p: URLSearchParams): InsightFilters {
  const topic = (p.get("topic") || "").trim().toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").slice(0, 60);
  return {
    hookType: oneOf(p.get("hookType"), HOOK_TYPES),
    contentFormat: oneOf(p.get("contentFormat"), CONTENT_FORMATS),
    ctaType: oneOf(p.get("ctaType"), CTA_TYPES),
    topic: topic.length >= 2 ? topic : undefined,
    mentionsProduct: p.get("mentionsProduct") === "1" || undefined,
    band: oneOf(p.get("band"), ["flop", "under", "normal", "over", "viral", "winning"]),
    sortPerformance: p.get("sort") === "performance" || undefined,
  };
}

export const hasInsightFilters = (f: InsightFilters) => Boolean(f.hookType || f.contentFormat || f.ctaType || f.topic || f.mentionsProduct || f.band || f.sortPerformance);

export async function readInsightLibrary(admin: SupabaseClient, q: VideoQuery, f: InsightFilters): Promise<VideoLibraryResult & { insights: Record<string, VideoInsightBrief> }> {
  const limit = Math.min(Math.max(q.limit ?? 48, 1), 96);
  const offset = Math.max(q.offset ?? 0, 0);
  let vq: any = applyVideoFilters(admin.from("creator_video_library_insights").select("*"), { ...q, sort: undefined }, "view");
  if (f.hookType) vq = vq.eq("hook_type", f.hookType);
  if (f.contentFormat) vq = vq.eq("content_format", f.contentFormat);
  if (f.ctaType) vq = vq.eq("cta_type", f.ctaType);
  if (f.mentionsProduct) vq = vq.eq("mentions_product", true);
  if (f.band === "winning") vq = vq.in("band", ["over", "viral"]);
  else if (f.band) vq = vq.eq("band", f.band);
  if (f.topic) vq = vq.textSearch("topic", f.topic, { type: "plain", config: "simple" });
  if (f.sortPerformance) vq = vq.order("performance_ratio", { ascending: false, nullsFirst: false });
  else if (q.sort === "recent") vq = vq.order("posted_at", { ascending: false, nullsFirst: false });
  else if (q.sort === "engagement") vq = vq.order("engagement_rate", { ascending: false, nullsFirst: false });
  else if (q.sort === "gained") vq = vq.order("views_gained_7d", { ascending: false, nullsFirst: false });
  vq = vq.order("views", { ascending: false }).order("video_id", { ascending: true }).range(offset, offset + limit);
  const { data, error } = await vq;
  if (error) return { videos: [], hasMore: false, source: "tracked", insights: {} };
  const rows = (data ?? []) as Row[];
  const page = rows.slice(0, limit);
  const insights: Record<string, VideoInsightBrief> = {};
  for (const r of page) insights[`${String(r.platform).toLowerCase()}:${r.video_id}`] = brief(r);
  return { videos: page.map((r) => trackedVideo(r, bitsFromViewRow(r))), hasMore: rows.length > limit, source: "tracked", insights };
}

/** Insight badges for a page of library videos (platform:video_id keys). */
export async function insightsForVideos(admin: SupabaseClient, keys: { platform: string; id: string }[]): Promise<Record<string, VideoInsightBrief>> {
  const out: Record<string, VideoInsightBrief> = {};
  const byPlatform = new Map<string, string[]>();
  for (const k of keys) {
    const p = String(k.platform ?? "").toLowerCase();
    if (!p || !k.id) continue;
    byPlatform.set(p, [...(byPlatform.get(p) ?? []), k.id]);
  }
  for (const [platform, ids] of byPlatform) {
    const { data, error } = await admin.from("creator_video_insights").select("video_id, hook, hook_type, content_format, topic, cta_type, has_product, band, performance_ratio, pace_wps").eq("platform", platform).in("video_id", ids.slice(0, 200));
    if (error) continue;
    for (const r of (data ?? []) as Row[]) out[`${platform}:${r.video_id}`] = brief(r);
  }
  return out;
}

export { videoQueryFromParams };
