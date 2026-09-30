// What "viral" means in Trackit. One rule, shared by the catalog, the video
// library, the creator page and the SQL (public.is_viral_video in migration
// 20261002_000047_catalog_video_filters.sql — keep both in sync).
//
// A video is viral when it reached at least VIRAL_MULTIPLIER times the creator's
// median views, with VIRAL_MIN_VIEWS as a floor. The median needs
// VIRAL_MIN_SAMPLE videos with views; without it nothing is called viral.
// A creator "has a viral video" when at least one of their videos is viral.

export const VIRAL_MULTIPLIER = 5;
export const VIRAL_MIN_VIEWS = 100_000;
export const VIRAL_MIN_SAMPLE = 3;

export function isViralVideo(views: number | null | undefined, medianViews: number | null | undefined): boolean {
  if (medianViews == null || !(medianViews > 0)) return false;
  return Number(views ?? 0) >= Math.max(VIRAL_MIN_VIEWS, VIRAL_MULTIPLIER * medianViews);
}

/** Median views used for the viral rule, or null when there are too few videos. */
export function medianViews(views: number[]): number | null {
  const pool = views.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (pool.length < VIRAL_MIN_SAMPLE) return null;
  const mid = Math.floor(pool.length / 2);
  return pool.length % 2 ? pool[mid] : (pool[mid - 1] + pool[mid]) / 2;
}
