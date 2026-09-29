import { rapidApiTikTokAvailable, rapidApiTikTokRaw } from "@/lib/rapidapi-creators";
import {
  fetchTikTokProfileRaw,
  fetchTikTokVideosRaw,
  parseVideosRich,
  searchTikTokUsersRaw,
} from "@/lib/scrapecreators";
import { hashtagsOf, type CreatorSource, type ScrapedProfile, type ScrapedSearchHit, type ScrapedVideo } from "./types";

// TikTok sources. ScrapeCreators when its key is set, otherwise the RapidAPI
// TikTok scraper. Parsers are pure and exported for tests.

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const http = (v: unknown): string => {
  if (typeof v === "string" && v.startsWith("http")) return v;
  if (Array.isArray(v)) return http(v.find((x) => typeof x === "string" && x.startsWith("http")));
  if (v && typeof v === "object") return http((v as any).url_list ?? (v as any).url);
  return "";
};
const iso = (unixSeconds: unknown): string | null => {
  const n = num(unixSeconds);
  return n > 0 ? new Date(n * 1000).toISOString() : null;
};

// ── RapidAPI (tiktok-scraper7) ────────────────────────────────────────────────
export function parseRapidProfile(raw: any, username: string): ScrapedProfile | null {
  const data = raw?.data ?? raw;
  const u = data?.user;
  if (!u) return null;
  const s = data?.stats ?? {};
  return {
    username: str(u.uniqueId ?? u.unique_id ?? username).toLowerCase(),
    displayName: str(u.nickname ?? username),
    avatarUrl: http(u.avatarLarger ?? u.avatarMedium ?? u.avatarThumb ?? u.avatar_larger),
    bio: str(u.signature),
    bioLink: http(u.bioLink?.link ?? u.bio_link?.link) || null,
    followers: num(s.followerCount ?? s.follower_count ?? u.follower_count),
    following: s.followingCount != null ? num(s.followingCount) : null,
    totalLikes: s.heartCount != null || s.heart != null ? num(s.heartCount ?? s.heart) : null,
    videoCount: s.videoCount != null ? num(s.videoCount) : null,
    verified: Boolean(u.verified),
  };
}

export function parseRapidVideos(raw: any, username: string): ScrapedVideo[] {
  const list: any[] = raw?.data?.videos ?? raw?.data?.aweme_list ?? raw?.videos ?? [];
  const handle = username.replace(/^@/, "").toLowerCase();
  const out: ScrapedVideo[] = [];
  for (const v of list) {
    const id = str(v?.video_id ?? v?.aweme_id ?? v?.id);
    if (!id) continue;
    const caption = str(v?.title ?? v?.desc);
    const images = Array.isArray(v?.images) ? v.images : [];
    out.push({
      id,
      postedAt: iso(v?.create_time ?? v?.createTime),
      caption,
      hashtags: hashtagsOf(caption),
      durationSeconds: v?.duration != null ? num(v.duration) : null,
      mediaType: images.length > 1 ? "carousel" : images.length === 1 ? "photo" : "video",
      coverUrl: http(v?.origin_cover ?? v?.cover ?? v?.ai_dynamic_cover),
      shareUrl: `https://www.tiktok.com/@${handle}/${images.length ? "photo" : "video"}/${id}`,
      musicTitle: str(v?.music_info?.title) || null,
      isAd: Boolean(v?.is_ad),
      hasProductLink: Array.isArray(v?.anchors) ? v.anchors.length > 0 : Boolean(v?.commerce_info?.product_info),
      views: num(v?.play_count),
      likes: num(v?.digg_count),
      comments: num(v?.comment_count),
      shares: num(v?.share_count),
      saves: num(v?.collect_count),
    });
  }
  return out;
}

export function parseRapidSearch(raw: any): ScrapedSearchHit[] {
  const list: any[] = raw?.data?.user_list ?? raw?.data?.users ?? [];
  return list
    .map((row) => row?.user_info ?? row?.user ?? row)
    .map((u) => ({
      username: str(u?.unique_id ?? u?.uniqueId ?? u?.username).toLowerCase(),
      displayName: str(u?.nickname ?? u?.unique_id),
      followers: num(u?.follower_count ?? u?.followerCount),
      avatarUrl: http(u?.avatar_thumb ?? u?.avatarThumb ?? u?.avatar_larger),
    }))
    .filter((u) => u.username);
}

export const rapidApiTikTok: CreatorSource = {
  name: "rapidapi-tiktok",
  platform: "tiktok",
  available: rapidApiTikTokAvailable,
  async profile(username) {
    return parseRapidProfile(await rapidApiTikTokRaw("/user/info", { unique_id: username }), username);
  },
  async videos(username, count) {
    return parseRapidVideos(await rapidApiTikTokRaw("/user/posts", { unique_id: username, count: String(count), cursor: "0" }), username);
  },
  async search(keyword, count) {
    return parseRapidSearch(await rapidApiTikTokRaw("/user/search", { keywords: keyword, count: String(count), cursor: "0" }));
  },
};

// ── ScrapeCreators ─────────────────────────────────────────────────────────────
export const scrapeCreatorsTikTok: CreatorSource = {
  name: "scrapecreators-tiktok",
  platform: "tiktok",
  available: () => Boolean(process.env.SCRAPECREATORS_API_KEY),
  async profile(username) {
    const raw: any = await fetchTikTokProfileRaw(username);
    return parseRapidProfile({ data: { user: raw?.user, stats: raw?.stats } }, username);
  },
  async videos(username) {
    const raw: any = await fetchTikTokVideosRaw(username);
    const list: any[] = raw?.aweme_list ?? [];
    const byId = new Map(list.map((a) => [str(a?.aweme_id), a]));
    return parseVideosRich(raw).map((v) => {
      const a = byId.get(v.id);
      const images = Array.isArray(a?.image_post_info?.images) ? a.image_post_info.images : [];
      return {
        id: v.id,
        postedAt: iso(v.createTime),
        caption: v.desc,
        hashtags: hashtagsOf(v.desc),
        durationSeconds: a?.video?.duration ? Math.round(num(a.video.duration) / 1000) : null,
        mediaType: images.length > 1 ? "carousel" : images.length === 1 ? "photo" : "video",
        coverUrl: v.cover,
        shareUrl: v.shareUrl,
        musicTitle: str(a?.music?.title) || null,
        isAd: v.isAd,
        hasProductLink: Array.isArray(a?.anchors) ? a.anchors.length > 0 : false,
        views: v.playCount,
        likes: v.likeCount,
        comments: v.commentCount,
        shares: v.shareCount,
        saves: num(a?.statistics?.collect_count),
      } satisfies ScrapedVideo;
    });
  },
  async search(keyword) {
    const raw: any = await searchTikTokUsersRaw(keyword);
    return parseRapidSearch({ data: { user_list: raw?.user_list ?? raw?.users ?? [] } });
  },
};

/** The source the scraper uses for TikTok right now, or null when none is configured. */
export function tiktokSource(): CreatorSource | null {
  if (scrapeCreatorsTikTok.available()) return scrapeCreatorsTikTok;
  if (rapidApiTikTok.available()) return rapidApiTikTok;
  return null;
}
