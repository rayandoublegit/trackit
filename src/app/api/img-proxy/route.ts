import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Server-side image proxy so TikTok CDN images (avatars, video covers) render
// in the browser — they block hotlinking via Referer/CORS, but a server fetch
// has no such restriction. Allowlisted hosts only (no open proxy / SSRF).
const ALLOWED_SUFFIXES = [
  "tiktokcdn.com",
  "tiktokcdn-us.com",
  "tiktokcdn-eu.com",
  "ibyteimg.com",
  "ttwstatic.com",
  "ui-avatars.com",
  "ibb.co",
];

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("missing url", { status: 400 });

  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return new NextResponse("https only", { status: 400 });
    host = parsed.hostname.toLowerCase();
  } catch {
    return new NextResponse("bad url", { status: 400 });
  }
  const allowed = ALLOWED_SUFFIXES.some((d) => host === d || host.endsWith("." + d));
  if (!allowed) return new NextResponse("forbidden host", { status: 403 });

  try {
    const upstream = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Referer: "https://www.tiktok.com/",
        Accept: "image/avif,image/webp,image/*,*/*",
      },
    });
    if (!upstream.ok) return new NextResponse("upstream error", { status: 502 });
    const buf = await upstream.arrayBuffer();
    let contentType = upstream.headers.get("content-type") || "image/jpeg";
    let body: BodyInit = buf;

    // TikTok serves many avatars as HEIC, which browsers can't render. Decode to
    // JPEG on the fly (pure-JS, cached downstream) so real profile photos show.
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

    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=604800, immutable",
      },
    });
  } catch {
    return new NextResponse("fetch failed", { status: 502 });
  }
}
