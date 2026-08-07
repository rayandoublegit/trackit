/** Cached payload from GET /api/creator/[username] — matches drawer CreatorDetail. */
export type CachedCreatorDetail = {
  username: string;
  avatarUrl?: string;
  topVideos?: unknown[];
  videoThumbnails?: unknown[];
  [key: string]: unknown;
};

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; creator: CachedCreatorDetail }>();
const inflight = new Map<string, Promise<CachedCreatorDetail | null>>();

function keyOf(username: string): string {
  return username.trim().toLowerCase();
}

export function getCachedCreatorDetail(username: string): CachedCreatorDetail | null {
  const hit = cache.get(keyOf(username));
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(keyOf(username));
    return null;
  }
  return hit.creator;
}

export function setCachedCreatorDetail(creator: CachedCreatorDetail): void {
  if (!creator?.username) return;
  cache.set(keyOf(creator.username), { at: Date.now(), creator });
}

/** Prefetch drawer detail so Performance paints without waiting on open. */
export function prefetchCreatorDetail(username: string): void {
  const key = keyOf(username);
  if (!key) return;
  if (getCachedCreatorDetail(key)) return;
  if (inflight.has(key)) return;
  const p = fetch(`/api/creator/${encodeURIComponent(username)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const creator = (d?.creator ?? null) as CachedCreatorDetail | null;
      if (creator?.username) setCachedCreatorDetail(creator);
      return creator;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
}

export async function fetchCreatorDetail(username: string): Promise<CachedCreatorDetail | null> {
  const key = keyOf(username);
  const cached = getCachedCreatorDetail(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;
  prefetchCreatorDetail(username);
  return inflight.get(key) ?? null;
}
