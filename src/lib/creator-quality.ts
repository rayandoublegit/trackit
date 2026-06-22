import type { CreatorMetrics } from "@/lib/creator-metrics";

export type QualityStatus = "ok" | "low_quality" | "dead" | "inflated";

export interface QualityResult {
  authenticityScore: number; // 0-100
  qualityStatus: QualityStatus;
}

export interface QualityThresholds {
  inflatedViewsPerFollower: number;
  inflatedMinFollowers: number;
  lowEngagementByView: number;
  dormantDays: number;
  deadDays: number;
  lowQualityScore: number;
}

export const QUALITY_DEFAULTS: QualityThresholds = {
  inflatedViewsPerFollower: 0.005,
  inflatedMinFollowers: 100_000,
  lowEngagementByView: 1,
  dormantDays: 30,
  deadDays: 90,
  lowQualityScore: 40,
};

export function scoreQuality(
  followers: number,
  m: CreatorMetrics,
  opts: { nowMs?: number; thresholds?: QualityThresholds } = {}
): QualityResult {
  const t = opts.thresholds ?? QUALITY_DEFAULTS;
  const nowMs = opts.nowMs ?? Date.now();

  let score = 100;
  let inflated = false;

  if (m.viewsPerFollower < t.inflatedViewsPerFollower && followers > t.inflatedMinFollowers) {
    score -= 40;
    inflated = true;
  }
  if (m.engagementRate < t.lowEngagementByView) score -= 25;

  let daysSince = Infinity;
  if (m.lastPostAt) daysSince = (nowMs - new Date(m.lastPostAt).getTime()) / 86_400_000;
  const dead = daysSince > t.deadDays;
  if (dead) score -= 40;
  else if (daysSince > t.dormantDays) score -= 15;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let qualityStatus: QualityStatus;
  if (inflated) qualityStatus = "inflated";
  else if (dead) qualityStatus = "dead";
  else if (score < t.lowQualityScore) qualityStatus = "low_quality";
  else qualityStatus = "ok";

  return { authenticityScore: score, qualityStatus };
}
