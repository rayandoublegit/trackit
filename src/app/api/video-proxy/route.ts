import { NextResponse, type NextRequest } from "next/server";
import { isAllowedTikTokVideoUrl } from "@/lib/client-video-url";

export const dynamic = "force-dynamic";

const PASSTHROUGH_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
] as const;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("missing url", { status: 400 });
  if (!isAllowedTikTokVideoUrl(url)) return new NextResponse("forbidden host", { status: 403 });

  const range = req.headers.get("range");
  try {
    const upstream = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Referer: "https://www.tiktok.com/",
        Accept: "video/mp4,video/*,*/*",
        ...(range ? { Range: range } : {}),
      },
    });

    if (!upstream.ok && upstream.status !== 206) {
      return new NextResponse("fetch failed", { status: 502 });
    }

    const headers = new Headers();
    for (const name of PASSTHROUGH_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "video/mp4");
    }
    headers.set("cache-control", "public, max-age=3600");

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch {
    return new NextResponse("fetch failed", { status: 502 });
  }
}
