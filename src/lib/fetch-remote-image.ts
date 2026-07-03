// Shared server-side image fetch (TikTok CDN, ui-avatars, etc.) with HEIC→JPEG
// conversion so avatars render in browsers.

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

export type FetchedImage = { body: BodyInit; contentType: string };

export async function fetchRemoteImage(url: string): Promise<FetchedImage | null> {
  if (!isAllowedImageHost(url)) return null;
  try {
    const upstream = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Referer: "https://www.tiktok.com/",
        Accept: "image/avif,image/webp,image/*,*/*",
      },
    });
    if (!upstream.ok) return null;
    const buf = await upstream.arrayBuffer();
    let contentType = upstream.headers.get("content-type") || "image/jpeg";
    let body: BodyInit = buf;

    if (/image\/hei[cf]/i.test(contentType) || /\.heic(\?|$)/i.test(url)) {
      try {
        const convert = (await import("heic-convert")).default;
        const jpeg = await convert({ buffer: Buffer.from(buf), format: "JPEG", quality: 0.82 });
        body = new Uint8Array(jpeg);
        contentType = "image/jpeg";
      } catch {
        /* keep original bytes if decode fails */
      }
    }

    return { body, contentType };
  } catch {
    return null;
  }
}
