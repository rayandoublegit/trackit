import { ProviderError } from "./http";
import { compactNumber, http, isoDate, num, scrapeCreatorsGet, str } from "./sc-client";
import { hashtagsOf, type CallMeter, type CreatorSource, type ScrapedProfile, type ScrapedSearchHit, type ScrapedVideo } from "./types";

// YouTube through ScrapeCreators (1 credit per call), keyed by the channel
// handle (@name), never the channel id:
//   channel  GET /v1/youtube/channel?handle=                    subscribers, description, store link
//   videos   GET /v1/youtube/channel-videos?handle=&sort=latest  long videos (views, date, length)
//   shorts   GET /v1/youtube/channel/shorts?handle=&sort=newest  Shorts (views, likes, comments)
//   search   GET /v1/youtube/search?query=&type=channels
// One refresh = channel + videos + shorts = 3 calls. Shorts are stored with
// format "short", regular videos "long". Likes and comments of long videos
// are not in the list response (the per-video endpoint would cost 1 call each).

export function parseYouTubeChannel(raw: any, handle: string): ScrapedProfile | null {
  if (!raw || typeof raw !== "object" || !(raw.channelId || raw.name)) return null;
  const sources: any[] = raw?.avatar?.image?.sources ?? [];
  const avatar = http(sources[sources.length - 1]?.url) || http(raw?.avatar);
  const fromUrl = str(raw.channel).match(/@([^/?#]+)/)?.[1];
  const links: unknown[] = Array.isArray(raw.links) ? raw.links : [];
  return {
    username: str(fromUrl || raw.handle || handle).replace(/^@/, "").toLowerCase(),
    displayName: str(raw.name || handle),
    avatarUrl: avatar,
    bio: str(raw.description),
    bioLink: http(raw.store) || http(links[0]) || null,
    followers: compactNumber(raw.subscriberCount ?? raw.subscriberCountText) ?? 0,
    following: null,
    totalLikes: null,
    videoCount: compactNumber(raw.videoCount ?? raw.videoCountText),
    verified: Boolean(raw.verified ?? raw.isVerified),
  };
}

function ytVideo(v: any, short: boolean): ScrapedVideo | null {
  const id = str(v?.id);
  if (!id) return null;
  const caption = [str(v?.title), str(v?.description)].filter(Boolean).join("\n");
  const seconds = num(v?.lengthSeconds) || Math.round(num(v?.durationMs) / 1000);
  return {
    id,
    postedAt: isoDate(v?.publishedTime ?? v?.publishDate ?? v?.publishedAt),
    caption,
    hashtags: hashtagsOf(caption),
    durationSeconds: seconds > 0 ? seconds : null,
    mediaType: "video",
    format: short ? "short" : "long",
    coverUrl: http(v?.thumbnail) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    shareUrl: short ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
    musicTitle: null,
    isAd: Array.isArray(v?.badges) && v.badges.some((b: unknown) => /paid|sponsor/i.test(str(b))),
    hasProductLink: Array.isArray(v?.badges) && v.badges.some((b: unknown) => /product|shopping/i.test(str(b))),
    productUrl: null,
    views: num(v?.viewCountInt ?? compactNumber(v?.viewCountText)),
    likes: num(v?.likeCountInt ?? compactNumber(v?.likeCountText)),
    comments: num(v?.commentCountInt ?? compactNumber(v?.commentCountText)),
    shares: 0,
    saves: 0,
  };
}

export function parseYouTubeVideos(raw: any): ScrapedVideo[] {
  return ((raw?.videos ?? []) as any[]).map((v) => ytVideo(v, v?.type === "short")).filter((v): v is ScrapedVideo => v !== null);
}

export function parseYouTubeShorts(raw: any): ScrapedVideo[] {
  return ((raw?.shorts ?? []) as any[]).map((v) => ytVideo(v, true)).filter((v): v is ScrapedVideo => v !== null);
}

/** Shorts and long videos together, newest first. */
export function mergeYouTubeUploads(longVideos: ScrapedVideo[], shorts: ScrapedVideo[], count: number): ScrapedVideo[] {
  const byId = new Map<string, ScrapedVideo>();
  for (const v of [...shorts, ...longVideos]) if (!byId.has(v.id)) byId.set(v.id, v);
  return [...byId.values()]
    .sort((a, b) => (b.postedAt ? Date.parse(b.postedAt) : 0) - (a.postedAt ? Date.parse(a.postedAt) : 0))
    .slice(0, count);
}

function channelHandle(c: any): string {
  const candidates = [c?.handle, c?.channelHandle, c?.canonicalBaseUrl, c?.url, c?.channel];
  for (const v of candidates) {
    const s = str(v);
    const at = s.match(/@([A-Za-z0-9._-]+)/)?.[1];
    if (at) return at.toLowerCase();
    if (s && /^[A-Za-z0-9._-]+$/.test(s) && !/^UC[\w-]{20,}$/.test(s)) return s.toLowerCase();
  }
  return ""; // only a channel id: skipped (identity is the public handle)
}

export function parseYouTubeSearch(raw: any): ScrapedSearchHit[] {
  const channels: any[] = raw?.channels ?? [];
  const out: ScrapedSearchHit[] = [];
  const seen = new Set<string>();
  for (const c of channels) {
    const username = channelHandle(c);
    if (!username || seen.has(username)) continue;
    seen.add(username);
    const subs = c?.subscriberCount ?? c?.subscriberCountInt ?? c?.subscriberCountText ?? c?.subscribers;
    out.push({
      username,
      displayName: str(c?.title ?? c?.name ?? username),
      followers: subs == null ? null : compactNumber(subs),
      avatarUrl: http(c?.thumbnail) || http(c?.avatar),
    });
  }
  return out;
}

const NAME = "scrapecreators-youtube";

/** A channel without Shorts (or without long videos) answers "not found" for that tab: that is an empty list. */
async function tab(path: string, params: Record<string, string>, meter?: CallMeter): Promise<any> {
  try {
    return await scrapeCreatorsGet(path, params, NAME, meter);
  } catch (e) {
    if (e instanceof ProviderError && e.kind === "not_found") return {};
    throw e;
  }
}

async function uploads(handle: string, count: number, meter?: CallMeter): Promise<ScrapedVideo[]> {
  const longRaw = await tab("/v1/youtube/channel-videos", { handle, sort: "latest" }, meter);
  const shortsRaw = await tab("/v1/youtube/channel/shorts", { handle, sort: "newest" }, meter);
  return mergeYouTubeUploads(parseYouTubeVideos(longRaw), parseYouTubeShorts(shortsRaw), count);
}

export const scrapeCreatorsYouTube: CreatorSource = {
  name: NAME,
  platform: "youtube",
  callsPerRefresh: 3,
  available: () => Boolean(process.env.SCRAPECREATORS_API_KEY),
  async profile(handle, meter) {
    return parseYouTubeChannel(await scrapeCreatorsGet("/v1/youtube/channel", { handle }, NAME, meter), handle);
  },
  videos: uploads,
  async search(keyword, _count, meter) {
    return parseYouTubeSearch(await scrapeCreatorsGet("/v1/youtube/search", { query: keyword, type: "channels" }, NAME, meter));
  },
};
