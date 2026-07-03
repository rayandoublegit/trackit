import { normalizeCreatorHandle, pickBestCreatorAvatar } from "@/lib/creator-avatar";
import { isStablePublicImageUrl } from "@/lib/client-image-url";
import { isUiAvatarsUrl } from "@/lib/tiktok-avatar";

export function isStableAvatarStorageUrl(url: string): boolean {
  return isStablePublicImageUrl(url);
}

/** Always resolve via creator-avatar (refresh from TikTok + permanent store). */
export function creatorAvatarApiUrl(
  username: string,
  rawSrc?: string | null,
  opts?: { refresh?: boolean }
): string {
  const handle = normalizeCreatorHandle(username);
  if (!handle) return "";
  const params = new URLSearchParams({ username: handle });
  const src = pickBestCreatorAvatar(rawSrc);
  if (src && !isUiAvatarsUrl(src) && !isStableAvatarStorageUrl(src)) {
    params.set("src", src);
  }
  if (opts?.refresh) params.set("refresh", "1");
  return `/api/creator-avatar?${params.toString()}`;
}

/**
 * Client-ready avatar URL.
 * - Permanent Supabase URLs → direct (instant)
 * - Everything else (missing, expired CDN, ui-avatars) → /api/creator-avatar
 *   which scrapes the TikTok profile, stores the photo, updates the DB, and serves it.
 */
export function feedAvatarUrlForCreator(username: string, rawAvatar?: string | null): string {
  const handle = normalizeCreatorHandle(username);
  const clean = pickBestCreatorAvatar(rawAvatar);

  if (clean && isStableAvatarStorageUrl(clean)) return clean;

  return handle ? creatorAvatarApiUrl(handle, clean) : "";
}
