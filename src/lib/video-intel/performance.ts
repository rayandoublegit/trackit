import type { Band } from "./types";

// How a video did against its own creator's usual views. Computed here and in
// SQL (video_performance_ratio / video_performance_band, migration 000053), the
// same rules in both places; the model never produces these numbers.
//
//   ratio = views / creator median views (creators_index.median_video_views)
//   viral   views >= max(100K, 5x median)  (same rule as is_viral_video, 000047)
//   over    ratio >= 1.5
//   normal  0.67 <= ratio < 1.5
//   under   0.33 <= ratio < 0.67
//   flop    ratio < 0.33
// Unknown median (fewer than 3 videos with views) = no ratio, no band.

export const BAND_EDGES = { over: 1.5, normal: 0.67, under: 0.33 } as const;

export function performanceRatio(views: number | null | undefined, median: number | null | undefined): number | null {
  if (median == null || !(median > 0) || views == null || !Number.isFinite(views)) return null;
  return Math.round((Math.max(0, views) / median) * 1000) / 1000;
}

export function isViral(views: number | null | undefined, median: number | null | undefined): boolean {
  return median != null && median > 0 && (views ?? 0) >= Math.max(100_000, 5 * median);
}

export function performanceBand(views: number | null | undefined, median: number | null | undefined): Band | null {
  const ratio = performanceRatio(views, median);
  if (ratio == null) return null;
  if (isViral(views, median)) return "viral";
  if (ratio >= BAND_EDGES.over) return "over";
  if (ratio >= BAND_EDGES.normal) return "normal";
  if (ratio >= BAND_EDGES.under) return "under";
  return "flop";
}

export const isWinning = (band: Band | null | undefined) => band === "over" || band === "viral";
export const isLosing = (band: Band | null | undefined) => band === "under" || band === "flop";

/** Median of a list (null when empty). */
export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
