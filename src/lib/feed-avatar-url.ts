import { normalizeCreatorHandle, pickBestCreatorAvatar } from "@/lib/creator-avatar";
import { imgProxyUrl, isStablePublicImageUrl, unwrapImageSource } from "@/lib/client-image-url";
import { isAllowedImageHost } from "@/lib/image-hosts";
import { isUiAvatarsUrl } from "@/lib/tiktok-avatar";

export function isStableAvatarStorageUrl(url: string): boolean {
  return isStablePublicImageUrl(url);
}

/** The remote avatar behind a value that may already be one of our image routes. */
function rawAvatar(rawSrc?: string | null): string {
  return pickBestCreatorAvatar(unwrapImageSource(pickBestCreatorAvatar(rawSrc)));
}

/** The avatar route: stored photo, else re-host the CDN photo, else a live profile scrape. */
export function creatorAvatarApiUrl(
  username: string,
  rawSrc?: string | null,
  opts?: { refresh?: boolean }
): string {
  const handle = normalizeCreatorHandle(username);
  if (!handle) return "";
  const params = new URLSearchParams({ username: handle });
  const src = rawAvatar(rawSrc);
  if (src && !isUiAvatarsUrl(src) && !isStableAvatarStorageUrl(src) && isAllowedImageHost(src)) {
    params.set("src", src);
  }
  if (opts?.refresh) params.set("refresh", "1");
  return `/api/creator-avatar?${params.toString()}`;
}

/**
 * Client-ready avatar URL, never waiting on a scrape for the first paint:
 * - permanent Supabase URL → direct
 * - TikTok / Instagram CDN URL → /api/img-proxy (cached; CreatorAvatar falls
 *   back to /api/creator-avatar if the link has expired)
 * - nothing usable → /api/creator-avatar (stored photo or live scrape)
 */
export function feedAvatarUrlForCreator(username: string, rawAvatarUrl?: string | null): string {
  const handle = normalizeCreatorHandle(username);
  const clean = rawAvatar(rawAvatarUrl);

  if (clean && isStableAvatarStorageUrl(clean)) return clean;
  if (clean && isAllowedImageHost(clean)) return imgProxyUrl(clean);

  return handle ? creatorAvatarApiUrl(handle, clean) : "";
}

/** Next URLs to try when an avatar fails to load (in order, without the one that failed). */
export function avatarFallbacks(username: string, rawSrc: string | null | undefined, failed: string): string[] {
  const handle = normalizeCreatorHandle(username);
  if (!handle) return [];
  const list = [creatorAvatarApiUrl(handle, rawSrc), creatorAvatarApiUrl(handle, null, { refresh: true })];
  return [...new Set(list)].filter((u) => u && u !== failed);
}
