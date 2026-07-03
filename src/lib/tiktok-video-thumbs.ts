/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTikTokVideosRaw, parseVideosRich, type RichVideo } from "@/lib/scrapecreators";
import { fetchRemoteImage, isAllowedImageHost } from "@/lib/fetch-remote-image";
import { isStablePublicImageUrl } from "@/lib/client-image-url";
import { isUiAvatarsUrl } from "@/lib/tiktok-avatar";
import type { TopVideo } from "@/lib/creator-enrichment";

const VIDEO_BUCKETS = ["creator-avatars", "avatars"] as const;
const MAX_THUMBS = 3;

export type StoredVideoThumb = {
  views: number;
  thumbnail: string;
  url: string | null;
  id?: string;
};

function extensionForContentType(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}

async function storeVideoCoverBuffer(
  admin: SupabaseClient,
  buf: Buffer,
  contentType: string,
  username: string,
  videoId: string
): Promise<string | null> {
  if (!buf.length) return null;
  const safeUser = username.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
  const safeId = videoId.replace(/[^a-zA-Z0-9._-]/g, "_") || `v${Date.now()}`;
  const ext = extensionForContentType(contentType);
  const objectPath = `videos/${safeUser}/${safeId}.${ext}`;

  for (const bucket of VIDEO_BUCKETS) {
    try {
      const { error } = await admin.storage.from(bucket).upload(objectPath, buf, {
        contentType,
        upsert: true,
        cacheControl: "31536000",
      });
      if (error) continue;
      const { data } = admin.storage.from(bucket).getPublicUrl(objectPath);
      if (data?.publicUrl) return data.publicUrl;
    } catch {
      /* try next bucket */
    }
  }
  return null;
}

/** Fetch live TikTok videos (covers + stats) for a creator. */
export async function fetchFreshVideoCovers(username: string, limit = MAX_THUMBS): Promise<RichVideo[]> {
  const handle = username.replace(/^@/, "").trim();
  if (!handle) return [];
  if (!process.env.SCRAPECREATORS_API_KEY) return [];
  try {
    const raw = await fetchTikTokVideosRaw(handle);
    const rich = parseVideosRich(raw).filter((v) => v.id && v.cover && !v.isAd);
    return rich
      .slice()
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, limit);
  } catch {
    return [];
  }
}

function needsCoverRepair(cover?: string | null): boolean {
  const url = cover?.trim() || "";
  if (!url || isUiAvatarsUrl(url)) return true;
  return !isStablePublicImageUrl(url);
}

/**
 * Download video covers, store permanently in Supabase, update top_videos.
 * Does NOT write video_thumbnails (reserved as curated marker).
 */
export async function refreshAndPersistCreatorVideoThumbs(
  admin: SupabaseClient,
  username: string,
  existingTopVideos?: TopVideo[] | null
): Promise<{ topVideos: TopVideo[]; thumbs: StoredVideoThumb[] } | null> {
  const handle = username.replace(/^@/, "").trim().toLowerCase();
  if (!handle) return null;

  const existing = Array.isArray(existingTopVideos) ? existingTopVideos : [];
  const allStable =
    existing.length >= MAX_THUMBS && existing.slice(0, MAX_THUMBS).every((v) => !needsCoverRepair(v.cover));
  if (allStable) {
    return {
      topVideos: existing,
      thumbs: existing.slice(0, MAX_THUMBS).map((v) => ({
        views: v.playCount,
        thumbnail: v.cover,
        url: v.shareUrl || null,
        id: v.id,
      })),
    };
  }

  const fresh = await fetchFreshVideoCovers(handle, MAX_THUMBS);
  const source: Array<{
    id: string;
    cover: string;
    shareUrl: string;
    playUrl: string;
    playCount: number;
    likeCount: number;
    commentCount: number;
    shareCount: number;
    createTime: number;
    desc: string;
  }> = fresh.length
    ? fresh
    : existing
        .filter((v) => v.id && v.cover)
        .slice(0, MAX_THUMBS)
        .map((v) => ({
          id: v.id,
          cover: v.cover,
          shareUrl: v.shareUrl || "",
          playUrl: v.playUrl || "",
          playCount: v.playCount || 0,
          likeCount: v.likeCount || 0,
          commentCount: v.commentCount || 0,
          shareCount: v.shareCount || 0,
          createTime: v.createTime || 0,
          desc: v.desc || "",
        }));

  if (!source.length) return null;

  const topVideos: TopVideo[] = [];
  const thumbs: StoredVideoThumb[] = [];

  for (const video of source) {
    let permanent = isStablePublicImageUrl(video.cover) ? video.cover : null;

    if (!permanent && video.cover && !isUiAvatarsUrl(video.cover) && isAllowedImageHost(video.cover)) {
      const img = await fetchRemoteImage(video.cover);
      if (img) {
        try {
          const buf = Buffer.from(await new Response(img.body).arrayBuffer());
          permanent = await storeVideoCoverBuffer(admin, buf, img.contentType, handle, video.id);
        } catch {
          permanent = null;
        }
      }
    }

    const cover = permanent || video.cover;
    topVideos.push({
      id: video.id,
      cover,
      shareUrl: video.shareUrl,
      playUrl: video.playUrl,
      playCount: video.playCount,
      likeCount: video.likeCount,
      commentCount: video.commentCount,
      shareCount: video.shareCount,
      createTime: video.createTime,
      desc: video.desc,
    });

    if (cover) {
      thumbs.push({
        views: video.playCount,
        thumbnail: cover,
        url: video.shareUrl || null,
        id: video.id,
      });
    }
  }

  if (!topVideos.length) return null;

  // Merge with any extra existing top_videos beyond the first 3.
  const seen = new Set(topVideos.map((v) => v.id));
  const merged = [
    ...topVideos,
    ...existing.filter((v) => v.id && !seen.has(v.id)),
  ].slice(0, 9);

  const { error } = await admin
    .from("creators_index")
    .update({ top_videos: merged })
    .eq("username", handle);

  if (error) {
    console.warn(`video thumbs update @${handle}:`, error.message);
  }

  return { topVideos: merged, thumbs };
}

/** Map top_videos / video_thumbnails into display thumbs, preferring permanent covers. */
export function displayVideoThumbnails(
  videoThumbnails?: Array<{ views?: number; thumbnail?: string | null; url?: string | null }> | null,
  topVideos?: Array<{ playCount?: number; cover?: string; shareUrl?: string; id?: string }> | null,
  limit = MAX_THUMBS
): Array<{ views: number; thumbnail: string | null; url: string | null }> {
  const out: Array<{ views: number; thumbnail: string | null; url: string | null }> = [];
  const seen = new Set<string>();

  const push = (thumbnail: string | null | undefined, views: number, url: string | null) => {
    const thumb = thumbnail?.trim() || "";
    const key = thumb || url || "";
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ views, thumbnail: thumb || null, url });
  };

  // Prefer top_videos (auto-backfilled permanent covers).
  for (const v of topVideos ?? []) {
    if (out.length >= limit) break;
    push(v.cover, Number(v.playCount ?? 0), v.shareUrl ?? null);
  }
  for (const t of videoThumbnails ?? []) {
    if (out.length >= limit) break;
    push(t.thumbnail, Number(t.views ?? 0), t.url ?? null);
  }

  return out;
}
