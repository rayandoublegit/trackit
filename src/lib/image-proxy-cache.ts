/** Shared in-process cache for proxied avatar bytes (img-proxy + creator-avatar). */

export type CachedImage = { at: number; body: ArrayBuffer; contentType: string };

const store = new Map<string, CachedImage>();
export const IMAGE_PROXY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function getCachedImage(key: string): CachedImage | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > IMAGE_PROXY_CACHE_TTL_MS) {
    store.delete(key);
    return null;
  }
  return hit;
}

export function setCachedImage(key: string, body: ArrayBuffer, contentType: string): void {
  store.set(key, { at: Date.now(), body, contentType });
  if (store.size > 2000) {
    const oldest = [...store.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 400);
    for (const [k] of oldest) store.delete(k);
  }
}
