/**
 * Exclusive discovery follower buckets ("square" ranges — no overlap).
 * Used by DiscoveryFeed UI, client re-filters, and server feed queries.
 */
export const DISCOVERY_FOLLOWER_RANGES: Record<
  string,
  { min: number; max?: number }
> = {
  "1-10k": { min: 1_000, max: 10_000 },
  "10-100k": { min: 10_001, max: 100_000 },
  "100-500k": { min: 100_001, max: 500_000 },
  "500k+": { min: 500_001 },
};

export type FollowerRangeBounds = { min?: number; max?: number };

export function followerRangeBounds(range: string): FollowerRangeBounds {
  const b = DISCOVERY_FOLLOWER_RANGES[range];
  if (!b) return {};
  return { min: b.min, max: b.max };
}

/** True when follower count sits inside the selected bucket (inclusive edges). */
export function creatorMatchesFollowerRange(
  followers: number,
  bounds: FollowerRangeBounds
): boolean {
  const count = Number(followers) || 0;
  if (bounds.min != null && count < bounds.min) return false;
  if (bounds.max != null && count > bounds.max) return false;
  return true;
}
