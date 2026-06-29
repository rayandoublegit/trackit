import { videoEmbedUrl } from "@/lib/creator-video";
import { proxiedImageUrl } from "@/lib/tiktok-avatar";

export type VideoPreview = {
  key: string;
  cover: string;
  views: number;
  embed: string | null;
};

type VideoThumb = { views?: number; thumbnail?: string | null; url?: string | null };
type TopVideo = { id?: string; cover?: string; shareUrl?: string; playCount?: number };

function proxiedCover(url?: string | null): string {
  if (!url?.trim()) return "";
  return proxiedImageUrl(url.trim()) || "";
}

/** Build deduped, proxied video previews for a creator (curated thumbs first, then top_videos). */
export function buildCreatorVideoPreviews(
  username: string,
  opts: { videoThumbnails?: VideoThumb[]; topVideos?: TopVideo[]; limit?: number }
): VideoPreview[] {
  const limit = opts.limit ?? 6;
  const out: VideoPreview[] = [];
  const seen = new Set<string>();

  const push = (item: { id?: string; cover: string; shareUrl?: string; views: number }) => {
    const dedupe = item.id || item.shareUrl || item.cover;
    if (!dedupe || seen.has(dedupe)) return;
    if (!item.cover && !item.shareUrl) return;
    seen.add(dedupe);
    out.push({
      key: `${username}:${item.id || item.shareUrl || out.length}`,
      cover: proxiedCover(item.cover),
      views: item.views,
      embed: videoEmbedUrl({ id: item.id, shareUrl: item.shareUrl }),
    });
  };

  for (const t of opts.videoThumbnails ?? []) {
    if (!t.thumbnail && !t.url) continue;
    push({ cover: t.thumbnail ?? "", shareUrl: t.url ?? "", views: t.views ?? 0 });
  }
  for (const v of opts.topVideos ?? []) {
    push({ id: v.id, cover: v.cover ?? "", shareUrl: v.shareUrl, views: v.playCount ?? 0 });
  }

  return out.slice(0, limit);
}
