import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isStablePublicImageUrl } from "@/lib/client-image-url";
import { refreshAndPersistCreatorVideoThumbs } from "@/lib/tiktok-video-thumbs";
import {
  releaseAvatarScrapeSlot,
  tryAcquireAvatarScrapeSlot,
} from "@/lib/avatar-scrape-limiter";
import { fetchRemoteImage } from "@/lib/fetch-remote-image";
import type { TopVideo } from "@/lib/creator-enrichment";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SCRAPE_TIMEOUT_MS = 12_000;

function getAdmin() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function fallback(): NextResponse {
  return new NextResponse("no thumb", { status: 404, headers: { "cache-control": "public, max-age=60" } });
}

function redirectTo(url: string): NextResponse {
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "cache-control": "public, max-age=86400" },
  });
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Resolve a creator video preview cover:
 * permanent Supabase URL → redirect
 * otherwise scrape TikTok videos, store covers, update top_videos, redirect.
 */
export async function GET(req: NextRequest) {
  try {
    const username = req.nextUrl.searchParams.get("username")?.replace(/^@/, "").trim().toLowerCase();
    if (!username) return new NextResponse("missing username", { status: 400 });

    const index = Math.max(0, Math.min(2, Number(req.nextUrl.searchParams.get("i")) || 0));
    const admin = getAdmin();
    if (!admin) return fallback();

    const { data: row } = await admin
      .from("creators_index")
      .select("top_videos")
      .eq("username", username)
      .maybeSingle();

    const existing = (Array.isArray(row?.top_videos) ? row.top_videos : []) as TopVideo[];
    const existingCover = existing[index]?.cover?.trim() || "";
    if (existingCover && isStablePublicImageUrl(existingCover)) {
      return redirectTo(existingCover);
    }

    // Try serving a still-valid CDN cover quickly (no scrape slot).
    if (existingCover) {
      const img = await fetchRemoteImage(existingCover);
      if (img) {
        const buf = new Uint8Array(await new Response(img.body).arrayBuffer());
        return new NextResponse(buf, {
          status: 200,
          headers: {
            "content-type": img.contentType,
            "cache-control": "public, max-age=3600",
          },
        });
      }
    }

    if (!tryAcquireAvatarScrapeSlot()) return fallback();

    try {
      const refreshed = await withTimeout(
        refreshAndPersistCreatorVideoThumbs(admin, username, existing),
        SCRAPE_TIMEOUT_MS
      );
      if (refreshed === "timeout" || !refreshed) return fallback();

      const cover = refreshed.thumbs[index]?.thumbnail || refreshed.thumbs[0]?.thumbnail;
      if (!cover) return fallback();

      if (isStablePublicImageUrl(cover)) return redirectTo(cover);

      const img = await fetchRemoteImage(cover);
      if (!img) return fallback();
      const buf = new Uint8Array(await new Response(img.body).arrayBuffer());
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "content-type": img.contentType,
          "cache-control": "public, max-age=86400",
        },
      });
    } finally {
      releaseAvatarScrapeSlot();
    }
  } catch {
    return fallback();
  }
}
