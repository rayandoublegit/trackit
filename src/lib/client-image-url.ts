import { isTikTokCdnUrl, isUiAvatarsUrl, proxiedImageUrl } from "@/lib/tiktok-avatar";
import { isInstagramCdnUrl } from "@/lib/image-hosts";

export function isHeicImageUrl(url: string): boolean {
  return /\.heic(\?|$)/i.test(url) || /image\/hei[cf]/i.test(url);
}

export function isStablePublicImageUrl(url: string): boolean {
  if (!url || isUiAvatarsUrl(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("supabase.co") || url.includes("/storage/v1/object/public/");
  } catch {
    return false;
  }
}

/** Browser-ready image URL: Supabase direct, TikTok / Instagram CDN and HEIC via img-proxy. */
export function clientImageUrl(url?: string | null): string {
  const trimmed = url?.trim() || "";
  if (!trimmed) return "";
  if (trimmed.includes("/api/img-proxy") || trimmed.includes("/api/creator-avatar")) return trimmed;
  if (isStablePublicImageUrl(trimmed)) return trimmed;
  if (isTikTokCdnUrl(trimmed) || isInstagramCdnUrl(trimmed) || isHeicImageUrl(trimmed)) {
    return `/api/img-proxy?url=${encodeURIComponent(trimmed)}`;
  }
  return proxiedImageUrl(trimmed) || trimmed;
}

export function imgProxyUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.includes("/api/img-proxy")) return trimmed;
  return `/api/img-proxy?url=${encodeURIComponent(trimmed)}`;
}

/**
 * The remote image behind one of our image routes: the `url` of /api/img-proxy,
 * the `src` hint of /api/creator-avatar (empty when it has none). Other URLs
 * are returned as is.
 */
export function unwrapImageSource(url?: string | null): string {
  const trimmed = url?.trim() || "";
  if (!trimmed.startsWith("/api/img-proxy") && !trimmed.startsWith("/api/creator-avatar")) return trimmed;
  try {
    const params = new URL(trimmed, "http://local").searchParams;
    return (trimmed.startsWith("/api/img-proxy") ? params.get("url") : params.get("src"))?.trim() || "";
  } catch {
    return "";
  }
}
