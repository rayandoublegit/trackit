import { clientImageUrl, isStablePublicImageUrl } from "@/lib/client-image-url";

// Video cover URLs for the video library, the creator page and the catalog rows.
//
// The first paint never waits on a scrape:
//   stored (Supabase) cover   → direct
//   CDN cover (TikTok, IG…)   → /api/img-proxy (cached server-side)
//   expired CDN cover         → `fallback`, tried only when the image fails:
//                               /api/creator-video-thumbs refetches the
//                               creator's top videos once and stores the covers.
// The thumbs route rebuilds creators_index.top_videos[i] (i < 3) from TikTok,
// so it is only offered for TikTok stored top videos, never for tracked videos
// (their position has nothing to do with top_videos).

export type VideoCover = { cover: string; fallback?: string };

export const THUMB_ROUTE_SLOTS = 3;

export function videoThumbRoute(username: string, index: number): string {
  return `/api/creator-video-thumbs?username=${encodeURIComponent(username)}&i=${index}`;
}

export function videoCover(opts: {
  platform: string;
  username: string;
  raw: string | null | undefined;
  /** Position in creators_index.top_videos (stored top videos only). */
  topIndex?: number | null;
}): VideoCover {
  const raw = (opts.raw ?? "").trim();
  const refetchable =
    (opts.platform || "tiktok").toLowerCase() === "tiktok" &&
    Boolean(opts.username) &&
    opts.topIndex != null &&
    opts.topIndex >= 0 &&
    opts.topIndex < THUMB_ROUTE_SLOTS;
  const fallback = refetchable ? videoThumbRoute(opts.username, opts.topIndex!) : undefined;

  if (!raw) return fallback ? { cover: fallback } : { cover: "" };
  if (isStablePublicImageUrl(raw)) return { cover: raw };
  const cover = clientImageUrl(raw);
  return fallback && fallback !== cover ? { cover, fallback } : { cover };
}
