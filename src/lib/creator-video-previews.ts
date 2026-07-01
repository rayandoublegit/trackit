import { extractVideoId } from "@/lib/creator-video";
import { clientImageUrl } from "@/lib/client-image-url";
import { clientVideoUrl } from "@/lib/client-video-url";

export type VideoPreview = {
  key: string;
  cover: string;
  views: number;
  videoId: string | null;
  streamUrl: string | null;
};

type VideoThumb = { views?: number; thumbnail?: string | null; url?: string | null; playUrl?: string | null };
type TopVideo = { id?: string; cover?: string; shareUrl?: string; playUrl?: string; playCount?: number };

/** Build deduped, proxied video previews for a creator (curated thumbs first, then top_videos). */
export function buildCreatorVideoPreviews(
  username: string,
  opts: { videoThumbnails?: VideoThumb[]; topVideos?: TopVideo[]; limit?: number }
): VideoPreview[] {
  const limit = opts.limit ?? 6;
  const out: VideoPreview[] = [];
  const seen = new Set<string>();

  const push = (item: {
    id?: string;
    cover: string;
    shareUrl?: string;
    playUrl?: string;
    views: number;
  }) => {
    const cover = clientImageUrl(item.cover);
    const videoId = item.id?.trim() || extractVideoId(item.shareUrl) || null;
    const dedupe = videoId || item.shareUrl || cover;
    if (!dedupe || seen.has(dedupe)) return;
    if (!cover && !videoId) return;
    seen.add(dedupe);
    const streamUrl = clientVideoUrl(item.playUrl) || null;
    out.push({
      key: `${username}:${videoId || item.shareUrl || out.length}`,
      cover,
      views: item.views,
      videoId,
      streamUrl,
    });
  };

  for (const t of opts.videoThumbnails ?? []) {
    if (!t.thumbnail && !t.url) continue;
    push({
      cover: t.thumbnail ?? "",
      shareUrl: t.url ?? "",
      playUrl: t.playUrl ?? "",
      views: t.views ?? 0,
    });
  }
  for (const v of opts.topVideos ?? []) {
    push({
      id: v.id,
      cover: v.cover ?? "",
      shareUrl: v.shareUrl,
      playUrl: v.playUrl,
      views: v.playCount ?? 0,
    });
  }

  return out.slice(0, limit);
}
