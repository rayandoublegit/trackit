import { llmModel } from "@/lib/llm";
import { extractJson } from "./analysis";
import { isLosing, isWinning, median } from "./performance";
import type { Band, IntelLlmRequest } from "./types";

// Per-creator synthesis: "why this creator's videos work / don't".
// 1. computeCreatorStats (code): for every feature of the analysed videos
//    (hook type, format, CTA, product, tone, pace, length) the median
//    performance ratio of the videos that have it, its lift against the
//    creator's own median, and how often it shows up in winners vs losers.
// 2. One LLM call (lib/llm.ts, smart model) turns the strongest patterns into a short, plain
//    explanation (EN + FR) and recommendations for brands. The model gets the
//    stats with ids and must cite them by id; every number shown in the UI comes
//    from the stats, and sentences carrying a number not in the stats are dropped.

export const SYNTHESIS_PROMPT_VERSION = 1;
/** Analysed videos with a performance band needed before a synthesis is written. */
export const SYNTHESIS_MIN_VIDEOS = 6;

export function synthesisModel(): string {
  return (process.env.VIDEO_INTEL_SYNTHESIS_MODEL || llmModel("smart")).trim();
}

export type InsightRow = {
  video_id: string;
  views: number | null;
  performance_ratio: number | null;
  band: Band | null;
  hook: string | null;
  hook_type: string | null;
  content_format: string | null;
  cta_type: string | null;
  has_cta: boolean | null;
  has_product: boolean | null;
  promotion_type?: string | null;
  tone: string | null;
  topic: string | null;
  pace_wps: number | null;
  duration_seconds?: number | null;
  posted_at?: string | null;
  share_url?: string | null;
  cover_url?: string | null;
};

export type FeatureStat = {
  /** Stable id the model cites ("hook_type:question"). */
  id: string;
  dimension: string;
  value: string;
  videos: number;
  medianRatio: number;
  /** medianRatio / the creator's overall median ratio. */
  lift: number;
  /** Share of these videos in the over / viral bands, and in under / flop. */
  winShare: number;
  loseShare: number;
};

export type VideoRef = { videoId: string; ratio: number; band: Band | null; hook: string; hookType: string; format: string; views: number; shareUrl: string | null; coverUrl: string | null };

export type CreatorStats = {
  videos: number;
  winners: number;
  losers: number;
  overallMedianRatio: number;
  features: FeatureStat[];
  /** The strongest patterns (biggest lift either way, enough videos), best first. */
  top: FeatureStat[];
  best: VideoRef[];
  worst: VideoRef[];
};

export const paceBucket = (wps: number | null | undefined) => (wps == null ? null : wps < 2 ? "slow" : wps <= 3.2 ? "medium" : "fast");
export const lengthBucket = (s: number | null | undefined) => (s == null || !(s > 0) ? null : s < 15 ? "under_15s" : s <= 30 ? "15_30s" : s <= 60 ? "30_60s" : s <= 180 ? "1_3min" : "over_3min");

const DIMENSIONS: { dimension: string; of: (r: InsightRow) => string | null }[] = [
  { dimension: "hook_type", of: (r) => r.hook_type },
  { dimension: "format", of: (r) => r.content_format },
  { dimension: "cta", of: (r) => (r.has_cta ? r.cta_type || "other" : "none") },
  { dimension: "product", of: (r) => (r.has_product == null ? null : r.has_product ? "with_product" : "no_product") },
  { dimension: "tone", of: (r) => r.tone },
  { dimension: "pace", of: (r) => paceBucket(r.pace_wps) },
  { dimension: "length", of: (r) => lengthBucket(r.duration_seconds) },
];

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeCreatorStats(rows: InsightRow[], opts: { minVideos?: number; topN?: number } = {}): CreatorStats {
  const min = opts.minVideos ?? 2;
  const scored = rows.filter((r) => r.performance_ratio != null && Number.isFinite(r.performance_ratio));
  const overall = median(scored.map((r) => r.performance_ratio!)) ?? 0;
  const features: FeatureStat[] = [];
  for (const d of DIMENSIONS) {
    const groups = new Map<string, InsightRow[]>();
    for (const r of scored) {
      const v = d.of(r);
      if (!v) continue;
      groups.set(v, [...(groups.get(v) ?? []), r]);
    }
    // A dimension where every video has the same value says nothing.
    if (groups.size < 2) continue;
    for (const [value, list] of groups) {
      if (list.length < min) continue;
      const m = median(list.map((r) => r.performance_ratio!)) ?? 0;
      features.push({
        id: `${d.dimension}:${value}`,
        dimension: d.dimension,
        value,
        videos: list.length,
        medianRatio: r2(m),
        lift: overall > 0 ? r2(m / overall) : 0,
        winShare: r2(list.filter((r) => isWinning(r.band)).length / list.length),
        loseShare: r2(list.filter((r) => isLosing(r.band)).length / list.length),
      });
    }
  }
  const strength = (f: FeatureStat) => Math.abs(Math.log(Math.max(f.lift, 0.01))) * Math.sqrt(f.videos);
  const top = features
    .filter((f) => f.lift > 0 && Math.abs(f.lift - 1) >= 0.2)
    .sort((a, b) => strength(b) - strength(a))
    .slice(0, opts.topN ?? 5);
  const ref = (r: InsightRow): VideoRef => ({
    videoId: r.video_id,
    ratio: r2(r.performance_ratio!),
    band: r.band,
    hook: r.hook ?? "",
    hookType: r.hook_type ?? "other",
    format: r.content_format ?? "other",
    views: Number(r.views ?? 0),
    shareUrl: r.share_url ?? null,
    coverUrl: r.cover_url ?? null,
  });
  const byRatio = [...scored].sort((a, b) => b.performance_ratio! - a.performance_ratio!);
  return {
    videos: scored.length,
    winners: scored.filter((r) => isWinning(r.band)).length,
    losers: scored.filter((r) => isLosing(r.band)).length,
    overallMedianRatio: r2(overall),
    features,
    top,
    best: byRatio.slice(0, 3).map(ref),
    worst: byRatio.length > 3 ? byRatio.slice(-3).reverse().map(ref) : [],
  };
}

// ── Prompt ───────────────────────────────────────────────────────────────────

export const SYNTHESIS_SYSTEM = `You write short, evidence-based notes for brands about one social media creator: why their videos over-perform or under-perform compared with their own usual views.
You receive computed statistics only. Each feature line has an id, how many of the creator's analysed videos have it, the median performance ratio of those videos (1.0 = the creator's usual views), its lift against the creator's overall median, and the share of those videos that were winners (well above usual) or losers (well below usual). You also get the hooks and formats of the best and worst videos.
Rules:
- Use only these statistics. Do not invent numbers, audiences, demographics, sales or reasons the data does not support. Any number you write must appear in the statistics exactly as given (for example "2.1x" for a lift of 2.1, or "4 videos").
- Small samples are weak evidence: say "in 3 videos" rather than claiming a rule when a feature has fewer than 5 videos.
- Patterns: 3 to 5, strongest first. Each cites exactly one statistic id from the list (stat_id) and says plainly what works or does not.
- Recommendations are for a brand planning a collaboration with this creator (which format, hook or angle to ask for, what to avoid).
- English fields in English, French fields in natural French (vous form). Keep summaries to 2-3 sentences.
- Answer with one JSON object only: { "summary_en", "summary_fr", "patterns": [{ "stat_id", "title_en", "title_fr", "recommendation_en", "recommendation_fr" }] }. No prose, no code fence.`;

export const SYNTHESIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary_en", "summary_fr", "patterns"],
  properties: {
    summary_en: { type: "string" },
    summary_fr: { type: "string" },
    patterns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["stat_id", "title_en", "title_fr", "recommendation_en", "recommendation_fr"],
        properties: {
          stat_id: { type: "string" },
          title_en: { type: "string" },
          title_fr: { type: "string" },
          recommendation_en: { type: "string" },
          recommendation_fr: { type: "string" },
        },
      },
    },
  },
} as const;

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function synthesisUserText(creator: { username: string; platform: string; niche?: string | null }, stats: CreatorStats): string {
  const lines = [
    `creator: @${creator.username.replace(/^(ig_|yt_)/, "")} on ${creator.platform}${creator.niche ? `, niche ${creator.niche}` : ""}`,
    `analysed videos: ${stats.videos} (winners ${stats.winners}, losers ${stats.losers})`,
    "features (id | videos | median ratio | lift | winners | losers):",
    ...stats.features
      .sort((a, b) => b.lift - a.lift)
      .map((f) => `${f.id} | ${f.videos} videos | ${f.medianRatio}x | lift ${f.lift}x | ${pct(f.winShare)} | ${pct(f.loseShare)}`),
    "strongest patterns: " + (stats.top.map((f) => f.id).join(", ") || "none"),
    "best videos:",
    ...stats.best.map((v) => `- ${v.ratio}x usual, ${v.hookType}, ${v.format}, hook: "${v.hook.slice(0, 120)}"`),
    "worst videos:",
    ...stats.worst.map((v) => `- ${v.ratio}x usual, ${v.hookType}, ${v.format}, hook: "${v.hook.slice(0, 120)}"`),
  ];
  return lines.join("\n");
}

export function synthesisRequest(jobId: number, creator: { username: string; platform: string; niche?: string | null }, stats: CreatorStats, model = synthesisModel()): IntelLlmRequest {
  return { id: `j${jobId}`, model, system: SYNTHESIS_SYSTEM, user: synthesisUserText(creator, stats), maxTokens: 3_000, schema: SYNTHESIS_SCHEMA as unknown as Record<string, unknown> };
}

// ── Validation ───────────────────────────────────────────────────────────────

export type CreatorPattern = FeatureStat & { title_en: string; title_fr: string; recommendation_en: string; recommendation_fr: string };
export type CreatorSynthesis = { summary_en: string; summary_fr: string; patterns: CreatorPattern[] };

/** Numbers a text may quote: the stats as formatted in the prompt. */
export function allowedNumbers(stats: CreatorStats): Set<string> {
  const out = new Set<string>(["1", String(stats.videos), String(stats.winners), String(stats.losers), String(stats.overallMedianRatio)]);
  for (const f of stats.features) {
    for (const n of [f.videos, f.medianRatio, f.lift, Math.round(f.winShare * 100), Math.round(f.loseShare * 100)]) out.add(String(n));
  }
  for (const v of [...stats.best, ...stats.worst]) out.add(String(v.ratio));
  return out;
}

/** Drops sentences that quote a number not in the stats (FR decimal commas read as dots). */
export function keepCitedNumbers(text: string, allowed: Set<string>): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences
    .filter((s) => {
      const nums = s.match(/\d+(?:[.,]\d+)?/g) ?? [];
      return nums.every((n) => allowed.has(String(Number(n.replace(",", ".")))) || allowed.has(n.replace(",", ".")));
    })
    .join(" ")
    .trim();
}

const clamp = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function validateSynthesis(raw: unknown, stats: CreatorStats): CreatorSynthesis | null {
  const o = (typeof raw === "string" ? extractJson(raw) : raw) as Record<string, any> | null;
  if (!o || typeof o !== "object") return null;
  const allowed = allowedNumbers(stats);
  const byId = new Map(stats.features.map((f) => [f.id, f]));
  const seen = new Set<string>();
  const patterns: CreatorPattern[] = [];
  for (const p of Array.isArray(o.patterns) ? o.patterns : []) {
    const stat = byId.get(String(p?.stat_id ?? "").trim());
    if (!stat || seen.has(stat.id)) continue;
    seen.add(stat.id);
    const title_en = keepCitedNumbers(clamp(p.title_en, 140), allowed);
    const title_fr = keepCitedNumbers(clamp(p.title_fr, 160), allowed);
    if (!title_en && !title_fr) continue;
    patterns.push({
      ...stat,
      title_en,
      title_fr,
      recommendation_en: keepCitedNumbers(clamp(p.recommendation_en, 240), allowed),
      recommendation_fr: keepCitedNumbers(clamp(p.recommendation_fr, 260), allowed),
    });
    if (patterns.length >= 5) break;
  }
  const summary_en = keepCitedNumbers(clamp(o.summary_en, 600), allowed);
  const summary_fr = keepCitedNumbers(clamp(o.summary_fr, 700), allowed);
  if (!summary_en && !summary_fr && !patterns.length) return null;
  return { summary_en, summary_fr, patterns };
}

/** A synthesis is due when there is none, the prompt changed, or enough new analysed videos arrived. */
export function synthesisDue(current: { videos_analysed: number | null; prompt_version: number | null; updated_at: string | null } | null, analysedNow: number, nowMs = Date.now()): boolean {
  if (analysedNow < SYNTHESIS_MIN_VIDEOS) return false;
  if (!current) return true;
  if ((current.prompt_version ?? 0) < SYNTHESIS_PROMPT_VERSION) return true;
  const before = current.videos_analysed ?? 0;
  if (analysedNow >= before + 3 && analysedNow >= before * 1.25) return true;
  const age = current.updated_at ? nowMs - Date.parse(current.updated_at) : Infinity;
  return analysedNow > before && age > 30 * 86_400_000;
}
