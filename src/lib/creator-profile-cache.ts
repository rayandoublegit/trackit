import type { CreatorProfileData } from "@/lib/creator-intel-types";
import { createFetchCache } from "@/lib/client-fetch-cache";

// Client cache for /api/creator-profile: hovering a catalog row prefetches the
// creator page, reopening a creator paints at once.

export class CreatorProfileError extends Error {
  constructor(public readonly kind: "missing" | "failed") {
    super(kind);
  }
}

const cache = createFetchCache<CreatorProfileData>({ ttlMs: 5 * 60_000, max: 60 });

export const creatorProfileKey = (username: string) => username.replace(/^@/, "").trim().toLowerCase();

async function fetchProfile(username: string, fresh = false): Promise<CreatorProfileData> {
  // fresh: skip the browser's HTTP cache too (the route allows 60 s of private caching).
  const r = await fetch(`/api/creator-profile?username=${encodeURIComponent(creatorProfileKey(username))}`, fresh ? { cache: "reload" } : undefined);
  if (!r.ok) throw new CreatorProfileError(r.status === 404 ? "missing" : "failed");
  return (await r.json()) as CreatorProfileData;
}

export function getCachedCreatorProfile(username: string): CreatorProfileData | null {
  return cache.get(creatorProfileKey(username));
}

export function loadCreatorProfile(username: string): Promise<CreatorProfileData> {
  return cache.load(creatorProfileKey(username), () => fetchProfile(username));
}

export function prefetchCreatorProfile(username: string): void {
  const key = creatorProfileKey(username);
  if (key) cache.prefetch(key, () => fetchProfile(username));
}

/**
 * A creator was just added or refreshed (live lookup): drop what this tab
 * holds and start loading the new data, so the creator page opens on it.
 */
export function refreshCreatorProfile(username: string): void {
  const key = creatorProfileKey(username);
  if (!key) return;
  cache.delete(key);
  cache.prefetch(key, () => fetchProfile(username, true));
}
