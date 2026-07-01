import { NextResponse, type NextRequest } from "next/server";
import { fetchRemoteImage, isAllowedImageHost } from "@/lib/fetch-remote-image";
import { getCachedImage, setCachedImage } from "@/lib/image-proxy-cache";

export const dynamic = "force-dynamic";

function isStablePublicUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("supabase.co") || url.includes("/storage/v1/object/public/");
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("missing url", { status: 400 });
  if (!isAllowedImageHost(url)) return new NextResponse("forbidden host", { status: 403 });

  if (isStablePublicUrl(url)) {
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "cache-control": "public, max-age=86400" },
    });
  }

  const cacheKey = url;
  const hit = getCachedImage(cacheKey);
  if (hit) {
    return new NextResponse(hit.body, {
      status: 200,
      headers: {
        "content-type": hit.contentType,
        "cache-control": "public, max-age=604800, immutable",
      },
    });
  }

  const img = await fetchRemoteImage(url);
  if (!img) return new NextResponse("fetch failed", { status: 502 });

  const buf = await new Response(img.body).arrayBuffer();
  setCachedImage(cacheKey, buf, img.contentType);

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "content-type": img.contentType,
      "cache-control": "public, max-age=604800, immutable",
    },
  });
}
