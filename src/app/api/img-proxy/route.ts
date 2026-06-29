import { NextResponse, type NextRequest } from "next/server";
import { fetchRemoteImage, isAllowedImageHost } from "@/lib/fetch-remote-image";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("missing url", { status: 400 });
  if (!isAllowedImageHost(url)) return new NextResponse("forbidden host", { status: 403 });

  const img = await fetchRemoteImage(url);
  if (!img) return new NextResponse("fetch failed", { status: 502 });

  return new NextResponse(img.body, {
    status: 200,
    headers: {
      "content-type": img.contentType,
      "cache-control": "public, max-age=604800, immutable",
    },
  });
}
