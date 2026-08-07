// How many creators a free user sees before the "Discover more" paywall.
// Tunable via env to fill the screen; defaults high so the free feed feels full.
export const FREE_FEED_VISIBLE = Number(process.env.NEXT_PUBLIC_FREE_FEED_VISIBLE) || 15;

export type ValueTier = "nano" | "micro" | "mid" | "macro" | "mega";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Indicative market rate for one sponsored post, by follower tier (USD).
export function estimatedCostPerPost(followers: number): number {
  if (followers < 10_000) return 50;
  if (followers < 50_000) return 150;
  if (followers < 250_000) return 500;
  if (followers < 1_000_000) return 1800;
  if (followers < 5_000_000) return 5000;
  return 12000;
}

export function valueTier(followers: number): ValueTier {
  if (followers < 10_000) return "nano";
  if (followers < 100_000) return "micro";
  if (followers < 500_000) return "mid";
  if (followers < 1_000_000) return "macro";
  return "mega";
}

/** Minimum avg views before CPM / value score are considered meaningful. */
export const MIN_VIEWS_FOR_VALUE_METRICS = 500;

// USD per 1000 real views. Lower = better value. Rounded to 0.1.
// Tiny samples (e.g. 308 views) used to explode CPM via the 0.1k floor — guard that.
export function estimatedCpm(estCostPerPost: number, avgViews: number): number {
  if (!Number.isFinite(avgViews) || avgViews < MIN_VIEWS_FOR_VALUE_METRICS) return 0;
  const cpm = estCostPerPost / (avgViews / 1000);
  return Math.round(cpm * 10) / 10;
}

// 0-100. Rewards low CPM (cost efficiency) and high engagement.
export function valueScore(followers: number, engagementRate: number, avgViews: number): number {
  if (!Number.isFinite(avgViews) || avgViews < MIN_VIEWS_FOR_VALUE_METRICS) {
    // Engagement-only fallback when reach sample is too thin for CPM.
    return Math.round(clamp(engagementRate * 8, 0, 100));
  }
  const cost = estimatedCostPerPost(followers);
  const cpm = cost / (avgViews / 1000);
  const cpmComponent = clamp(100 - cpm * 2, 0, 100);
  const engagementComponent = clamp(engagementRate * 8, 0, 100);
  return Math.round(0.6 * cpmComponent + 0.4 * engagementComponent);
}
