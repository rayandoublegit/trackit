import { normalizeCreatorHandle, pickBestCreatorAvatar } from "@/lib/creator-avatar";
import { clientImageUrl, isStablePublicImageUrl } from "@/lib/client-image-url";
import { isUiAvatarsUrl } from "@/lib/tiktok-avatar";

export function isStableAvatarStorageUrl(url: string): boolean {
  return isStablePublicImageUrl(url);
}

export function creatorAvatarApiUrl(username: string, rawSrc?: string | null): string {
  const handle = normalizeCreatorHandle(username);
  if (!handle) return "";
  const base = `/api/creator-avatar?username=${encodeURIComponent(handle)}`;
  const src = pickBestCreatorAvatar(rawSrc);
  if (src && !isUiAvatarsUrl(src) && !isStableAvatarStorageUrl(src)) {
    return `${base}&src=${encodeURIComponent(src)}`;
  }
  return base;
}

/**
 * Client-ready avatar URL for feed/lists.
 * Prefer stored Supabase URLs, then proxied DB URLs, then creator-avatar API.
 */
export function feedAvatarUrlForCreator(username: string, rawAvatar?: string | null): string {
  const handle = normalizeCreatorHandle(username);
  const clean = pickBestCreatorAvatar(rawAvatar);

  if (clean && isStableAvatarStorageUrl(clean)) return clean;

  if (clean && !isUiAvatarsUrl(clean)) {
    const proxied = clientImageUrl(clean);
    if (proxied) return proxied;
  }

  return handle ? creatorAvatarApiUrl(handle, clean) : "";
}
