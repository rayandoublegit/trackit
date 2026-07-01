import { isTikTokCdnUrl } from "@/lib/tiktok-avatar";

export function isAllowedTikTokVideoUrl(url: string): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:") return false;
    if (isTikTokCdnUrl(url)) return true;
    const host = parsed.hostname.toLowerCase();
    return host === "tiktok.com" || host.endsWith(".tiktok.com");
  } catch {
    return false;
  }
}

/** Browser-ready stream URL via same-origin video proxy. */
export function clientVideoUrl(url?: string | null): string {
  const trimmed = url?.trim() || "";
  if (!trimmed) return "";
  if (trimmed.startsWith("/api/video-proxy")) return trimmed;
  if (!isAllowedTikTokVideoUrl(trimmed)) return "";
  return `/api/video-proxy?url=${encodeURIComponent(trimmed)}`;
}
