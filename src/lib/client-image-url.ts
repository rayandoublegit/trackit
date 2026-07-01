import { isTikTokCdnUrl, isUiAvatarsUrl, proxiedImageUrl } from "@/lib/tiktok-avatar";

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

/** Browser-ready image URL: Supabase direct, TikTok/HEIC via img-proxy. */
export function clientImageUrl(url?: string | null): string {
  const trimmed = url?.trim() || "";
  if (!trimmed) return "";
  if (trimmed.includes("/api/img-proxy") || trimmed.includes("/api/creator-avatar")) return trimmed;
  if (isStablePublicImageUrl(trimmed)) return trimmed;
  if (isTikTokCdnUrl(trimmed) || isHeicImageUrl(trimmed)) {
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
