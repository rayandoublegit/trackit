// Image hosts the app may fetch server-side (/api/img-proxy, avatar and cover
// routes). No server-only imports: the client uses it to decide whether a URL
// can go through the proxy.

export const IMAGE_PROXY_ALLOWED_SUFFIXES = [
  "tiktokcdn.com",
  "tiktokcdn-us.com",
  "tiktokcdn-eu.com",
  "ibyteimg.com",
  "ttwstatic.com",
  "ui-avatars.com",
  "ibb.co",
  "i.ibb.co",
  "supabase.co",
  "cdninstagram.com",
  "fbcdn.net",
  "instagram.com",
  "ytimg.com",
  "googleusercontent.com",
  "ggpht.com",
  "pbs.twimg.com",
  "twimg.com",
];

export function isAllowedImageHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return IMAGE_PROXY_ALLOWED_SUFFIXES.some((d) => host === d || host.endsWith("." + d));
  } catch {
    return false;
  }
}

/** Instagram / Facebook CDN: refuses cross-origin embedding, so it goes through the proxy. */
export function isInstagramCdnUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ["cdninstagram.com", "fbcdn.net"].some((d) => host === d || host.endsWith("." + d));
  } catch {
    return false;
  }
}
