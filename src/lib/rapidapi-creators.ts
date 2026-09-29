import type { DiscoveryCreatorResult } from "@/lib/discovery-live";
import { computeMetrics, type VideoStat } from "@/lib/creator-metrics";
import type { RichVideo } from "@/lib/scrapecreators";
import { resolveCreatorCountryCode } from "@/lib/creator-country";
import { EN_NICHE_QUERIES, FR_NICHE_QUERIES, NICHE_TREE } from "@/lib/niche-tree";

const TIKTOK_HOST = "tiktok-scraper7.p.rapidapi.com";
const INSTAGRAM_HOST = "instagram-scraper-stable-api.p.rapidapi.com";

function allowed(host: string) {
  return (process.env.RAPIDAPI_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .includes(host);
}

async function rapidGet(url: URL, host: string) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key || !allowed(host) || url.hostname !== host) return null;
  const response = await fetch(url, {
    headers: { "x-rapidapi-key": key, "x-rapidapi-host": host },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json() as Promise<unknown>;
}

async function rapidPost(url: URL, host: string, form: URLSearchParams) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key || !allowed(host) || url.hostname !== host) return null;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-rapidapi-key": key,
      "x-rapidapi-host": host,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json() as Promise<unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function creator(
  niche: string,
  platform: "TikTok" | "Instagram",
  username: string,
  displayName: string,
  followers: number,
  bio: string,
  avatar: string,
): DiscoveryCreatorResult {
  return {
    username,
    displayName: displayName || username,
    avatarUrl: avatar,
    followersCount: followers,
    engagementRate: 0,
    engagementByFollower: 0,
    avgViews: 0,
    postFrequency: 0,
    lastPostAt: null,
    authenticityScore: 0,
    qualityStatus: "ok",
    platform,
    bio,
    email: null,
    niche,
    primaryNiche: niche,
    language: "unknown",
    location: null,
    countryCode: null,
    videoThumbnails: [],
  };
}

export async function searchRapidApiCreators(niche: string, platform: string, limit: number) {
  const wantTikTok = platform !== "Instagram";
  const wantInstagram = platform === "Instagram" || platform === "all";
  const found: DiscoveryCreatorResult[] = [];

  if (wantTikTok && process.env.RAPIDAPI_HOST === TIKTOK_HOST && process.env.RAPIDAPI_SEARCH_URL) {
    const url = new URL(process.env.RAPIDAPI_SEARCH_URL);
    url.searchParams.set("keywords", niche);
    url.searchParams.set("cursor", "0");
    url.searchParams.set("count", String(limit));
    const payload = asRecord(await rapidGet(url, TIKTOK_HOST));
    const data = asRecord(payload.data);
    const users = Array.isArray(data.user_list) ? data.user_list : Array.isArray(data.users) ? data.users : [];
    for (const entry of users) {
      const row = asRecord(entry);
      const user = asRecord(row.user_info ?? row.user ?? row);
      const username = String(user.unique_id ?? user.uniqueId ?? user.username ?? "");
      if (!username) continue;
      const avatar = String(user.avatar_thumb ?? user.avatar ?? asRecord(user.avatar_medium).url_list ?? "");
      found.push(
        creator(
          niche,
          "TikTok",
          username,
          String(user.nickname ?? user.nick_name ?? username),
          Number(user.follower_count ?? user.fans ?? 0),
          String(user.signature ?? ""),
          avatar.startsWith("http") ? avatar : "",
        ),
      );
      if (found.length >= limit) break;
    }
  }

  if (wantInstagram && found.length < limit && process.env.RAPIDAPI_INSTAGRAM_HOST === INSTAGRAM_HOST) {
    const endpoint = process.env.RAPIDAPI_INSTAGRAM_SEARCH_URL;
    if (endpoint === `https://${INSTAGRAM_HOST}/search_ig.php`) {
      const payload = asRecord(
        await rapidPost(new URL(endpoint), INSTAGRAM_HOST, new URLSearchParams({ search_query: niche })),
      );
      const users = Array.isArray(payload.users) ? payload.users : [];
      for (const entry of users) {
        const user = asRecord(asRecord(entry).user);
        const username = String(user.username ?? "");
        if (!username) continue;
        found.push(
          creator(
            niche,
            "Instagram",
            username,
            String(user.full_name ?? username),
            Number(user.follower_count ?? 0),
            String(user.biography ?? ""),
            String(user.profile_pic_url ?? ""),
          ),
        );
        if (found.length >= limit) break;
      }
    }
  }

  return found;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function httpUrl(value: unknown): string {
  if (typeof value === "string" && value.startsWith("http")) return value;
  if (Array.isArray(value)) {
    const hit = value.find((item) => typeof item === "string" && item.startsWith("http"));
    return typeof hit === "string" ? hit : "";
  }
  return "";
}

function collectVideos(payload: unknown): Record<string, unknown>[] {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const lists = [root.videos, root.item_list, root.aweme_list, root.items, root.posts, data.videos, data.item_list, data.aweme_list, data.items];
  for (const list of lists) {
    if (Array.isArray(list) && list.length) return list.map((item) => asRecord(asRecord(item).node ?? item));
  }
  return [];
}

export function classifyNiche(text: string, fallback: string) {
  const hay = text.toLowerCase();
  let best = fallback;
  let score = 0;
  for (const parent of Object.keys(NICHE_TREE)) {
    const words = [
      parent,
      ...(NICHE_TREE[parent] ?? []),
      ...(EN_NICHE_QUERIES[parent] ?? []),
      ...(FR_NICHE_QUERIES[parent] ?? []),
    ];
    let next = 0;
    for (const word of words) {
      const needle = word.toLowerCase();
      if (needle.length < 4) continue;
      if (hay.includes(needle)) next += needle.includes(" ") ? 3 : 2;
    }
    if (next > score) {
      score = next;
      best = parent;
    }
  }
  const niches = best === fallback ? [fallback] : [best, fallback];
  return { primaryNiche: best, niches };
}

export async function enrichRapidApiCreator(row: DiscoveryCreatorResult): Promise<DiscoveryCreatorResult> {
  const videos: VideoStat[] = [];
  const captions: string[] = [];
  const thumbs: DiscoveryCreatorResult["videoThumbnails"] = [];
  let followers = row.followersCount;
  let bio = row.bio;
  let countryCode = row.countryCode;

  if (row.platform === "TikTok") {
    const infoUrl = new URL(`https://${TIKTOK_HOST}/user/info`);
    infoUrl.searchParams.set("unique_id", row.username);
    const info = asRecord(asRecord(await rapidGet(infoUrl, TIKTOK_HOST)).data);
    const user = asRecord(info.user ?? info);
    const stats = asRecord(info.stats);
    followers = num(user.follower_count ?? user.followerCount ?? user.fans ?? stats.followerCount ?? stats.follower_count ?? followers) || followers;
    bio = String(user.signature ?? bio);
    const postsUrl = new URL(`https://${TIKTOK_HOST}/user/posts`);
    postsUrl.searchParams.set("unique_id", row.username);
    postsUrl.searchParams.set("count", "12");
    for (const video of collectVideos(await rapidGet(postsUrl, TIKTOK_HOST)).slice(0, 8)) {
      const stats = asRecord(video.statistics ?? video.stats ?? video);
      const author = asRecord(video.author);
      followers = num(author.follower_count ?? author.followerCount ?? followers) || followers;
      const cover = httpUrl(video.cover ?? video.origin_cover ?? video.dynamic_cover ?? video.thumbnail);
      const caption = String(video.title ?? video.desc ?? video.caption ?? "");
      if (caption) captions.push(caption);
      videos.push({
        playCount: num(stats.play_count ?? video.play_count ?? video.views),
        likeCount: num(stats.digg_count ?? video.digg_count ?? video.likes),
        commentCount: num(stats.comment_count ?? video.comment_count ?? video.comments),
        shareCount: num(stats.share_count ?? video.share_count ?? video.shares),
        createTime: num(video.create_time ?? video.createTime) || Math.floor(Date.now() / 1000),
        isAd: false,
      });
      if (cover) thumbs.push({ views: num(stats.play_count ?? video.play_count), thumbnail: cover, url: httpUrl(video.share_url ?? video.url) || null });
    }
  } else {
    const aboutUrl = new URL(`https://${INSTAGRAM_HOST}/get_ig_user_about.php`);
    aboutUrl.searchParams.set("username_or_url", row.username);
    const about = asRecord(await rapidGet(aboutUrl, INSTAGRAM_HOST));
    countryCode = resolveCreatorCountryCode(String(about.creation_country ?? ""), null);
  }

  const metrics = computeMetrics(followers, videos);
  const classified = classifyNiche([bio, ...captions].join("\n"), row.primaryNiche || row.niche);
  return {
    ...row,
    followersCount: followers,
    bio,
    engagementRate: metrics.engagementRate,
    engagementByFollower: metrics.engagementByFollower,
    avgViews: metrics.avgViews,
    postFrequency: metrics.postFrequency,
    lastPostAt: metrics.lastPostAt,
    primaryNiche: classified.primaryNiche,
    niche: classified.primaryNiche,
    niches: classified.niches,
    countryCode,
    videoThumbnails: thumbs.slice(0, 6),
  };
}

/** True when the RapidAPI TikTok scraper is configured. */
export function rapidApiTikTokAvailable(): boolean {
  return Boolean(process.env.RAPIDAPI_KEY) && process.env.RAPIDAPI_HOST === TIKTOK_HOST && allowed(TIKTOK_HOST);
}

/** Raw call to the RapidAPI TikTok scraper (tiktok-scraper7). Null when not configured or on error. */
export async function rapidApiTikTokRaw(
  path: "/user/info" | "/user/posts" | "/user/search",
  params: Record<string, string>,
): Promise<unknown> {
  if (!rapidApiTikTokAvailable()) return null;
  const url = new URL(`https://${TIKTOK_HOST}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return rapidGet(url, TIKTOK_HOST);
}

/** A creator's latest TikTok videos (cover, views, link, date) through RapidAPI. */
export async function fetchRapidApiTikTokVideos(username: string, count = 12): Promise<RichVideo[]> {
  if (!rapidApiTikTokAvailable()) return [];
  const handle = username.replace(/^@/, "").trim();
  if (!handle) return [];
  const url = new URL(`https://${TIKTOK_HOST}/user/posts`);
  url.searchParams.set("unique_id", handle);
  url.searchParams.set("count", String(count));
  const out: RichVideo[] = [];
  for (const video of collectVideos(await rapidGet(url, TIKTOK_HOST))) {
    const stats = asRecord(video.statistics ?? video.stats ?? video);
    const id = String(video.video_id ?? video.aweme_id ?? video.id ?? "");
    const cover = httpUrl(video.origin_cover ?? video.cover ?? video.dynamic_cover ?? video.thumbnail);
    if (!id || !cover) continue;
    out.push({
      id,
      cover,
      shareUrl: httpUrl(video.share_url ?? video.url) || `https://www.tiktok.com/@${handle}/video/${id}`,
      playUrl: httpUrl(video.play ?? video.wmplay) || "",
      playCount: num(stats.play_count ?? video.play_count ?? video.views),
      likeCount: num(stats.digg_count ?? video.digg_count ?? video.likes),
      commentCount: num(stats.comment_count ?? video.comment_count ?? video.comments),
      shareCount: num(stats.share_count ?? video.share_count ?? video.shares),
      createTime: num(video.create_time ?? video.createTime),
      desc: String(video.title ?? video.desc ?? ""),
      isAd: Boolean(video.is_ad),
    });
  }
  return out;
}

/** Catalog reads stay on the database. Live search is only for the one-shot seed. */
export async function loadCreatorCatalog(): Promise<DiscoveryCreatorResult[]> {
  return [];
}
