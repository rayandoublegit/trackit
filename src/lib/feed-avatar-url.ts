import { normalizeCreatorHandle, pickBestCreatorAvatar } from "@/lib/creator-avatar";
import { clientImageUrl, isStablePublicImageUrl } from "@/lib/client-image-url";
import { isTikTokCdnUrl, isUiAvatarsUrl } from "@/lib/tiktok-avatar";

export function isStableAvatarStorageUrl(url: string): boolean {
  return isStablePublicImageUrl(url);
}

export function creatorAvatarApiUrl(username: string): string {
  const handle = normalizeCreatorHandle(username);
  if (!handle) return "";
  return `/api/creator-avatar?username=${encodeURIComponent(handle)}`;
}

/**
 * Client-ready avatar URL for feed/lists.
 * Stable Supabase first; TikTok CDN → API (persists); else proxy; else API by username.
 */
export function feedAvatarUrlForCreator(username: string, rawAvatar?: string | null): string {
  const handle = normalizeCreatorHandle(username);
  const api = handle ? creatorAvatarApiUrl(handle) : "";
  const clean = pickBestCreatorAvatar(rawAvatar);

  if (clean) {
    if (isStableAvatarStorageUrl(clean)) return clean;
    if (isTikTokCdnUrl(clean) && api) return api;
    const proxied = clientImageUrl(clean);
    if (proxied && !proxied.includes("/api/creator-avatar")) return proxied;
    if (!isUiAvatarsUrl(clean) && !isTikTokCdnUrl(clean)) return clean;
  }

  return api;
}
