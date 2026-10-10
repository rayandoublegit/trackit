import { rapidApiTikTokAvailable } from "@/lib/rapidapi-creators";
import { ProviderError, looksNotFound, providerGet } from "./http";
import { firstUrlIn, http, num, scrapeCreatorsGet, str } from "./sc-client";
import { hashtagsOf, type CallMeter, type CreatorSource, type ScrapePlatform, type ScrapedProfile, type ScrapedSearchHit, type ScrapedVideo } from "./types";
import { scrapeCreatorsInstagram } from "./sources-instagram";
import { rapidApiInstagram } from "./sources-instagram-rapid";
import { scrapeCreatorsYouTube } from "./sources-youtube";

// TikTok sources (ScrapeCreators and the RapidAPI TikTok scraper) and the
// provider choice for every platform. Parsers are pure and exported for tests:
// the same creator parsed from either provider gives the same ScrapedProfile /
// ScrapedVideo (same ids, same canonical links), so switching provider never
// creates a second row or breaks a creator's history.

const iso = (unixSeconds: unknown): string | null => {
  const n = num(unixSeconds);
  return n > 0 ? new Date(n * 1000).toISOString() : null;
};
const tiktokLink = (handle: string, id: string, photo: boolean) =>
  `https://www.tiktok.com/@${handle.replace(/^@/, "").toLowerCase()}/${photo ? "photo" : "video"}/${id}`;

// ── Profile (both providers return the TikTok web shape: user + stats) ─────────
export function parseRapidProfile(raw: any, username: string): ScrapedProfile | null {
  const data = raw?.data ?? raw;
  const u = data?.user;
  if (!u || typeof u !== "object") return null;
  const s = data?.stats ?? {};
  const handle = str(u.uniqueId ?? u.unique_id ?? username).replace(/^@/, "").toLowerCase();
  if (!handle) return null;
  return {
    username: handle,
    displayName: str(u.nickname ?? username),
    avatarUrl: http(u.avatarLarger ?? u.avatarMedium ?? u.avatarThumb ?? u.avatar_larger),
    bio: str(u.signature),
    bioLink: http(u.bioLink?.link ?? u.bio_link?.link) || null,
    followers: num(s.followerCount ?? s.follower_count ?? u.follower_count),
    following: s.followingCount != null ? num(s.followingCount) : null,
    totalLikes: s.heartCount != null || s.heart != null ? num(s.heartCount ?? s.heart) : null,
    videoCount: s.videoCount != null ? num(s.videoCount) : null,
    verified: Boolean(u.verified),
    seller: u.ttSeller == null ? null : Boolean(u.ttSeller),
    category: str(u.commerceUserInfo?.category ?? u.commerce_user_info?.category) || null,
  };
}
export const parseScrapeCreatorsTikTokProfile = (raw: any, username: string) =>
  parseRapidProfile({ data: { user: raw?.user, stats: raw?.stats } }, username);

// ── Videos: RapidAPI (tiktok-scraper7, flat items) ──────────────────────────────
export function parseRapidVideos(raw: any, username: string): ScrapedVideo[] {
  const list: any[] = raw?.data?.videos ?? raw?.data?.aweme_list ?? raw?.videos ?? [];
  const out: ScrapedVideo[] = [];
  for (const v of list) {
    const id = str(v?.video_id ?? v?.aweme_id ?? v?.id);
    if (!id) continue;
    const caption = str(v?.title ?? v?.desc);
    const images = Array.isArray(v?.images) ? v.images : [];
    const mediaType = images.length > 1 ? "carousel" : images.length === 1 ? "photo" : "video";
    out.push({
      id,
      postedAt: iso(v?.create_time ?? v?.createTime),
      caption,
      hashtags: hashtagsOf(caption),
      durationSeconds: v?.duration != null && num(v.duration) > 0 ? num(v.duration) : null,
      mediaType,
      format: mediaType === "video" ? "short" : mediaType,
      coverUrl: http(v?.origin_cover ?? v?.cover ?? v?.ai_dynamic_cover),
      shareUrl: tiktokLink(username, id, images.length > 0),
      musicTitle: str(v?.music_info?.title) || null,
      isAd: Boolean(v?.is_ad),
      hasProductLink: Array.isArray(v?.anchors) ? v.anchors.length > 0 : Boolean(v?.commerce_info?.product_info),
      productUrl: firstUrlIn(v?.anchors) ?? firstUrlIn(v?.commerce_info?.product_info),
      views: num(v?.play_count),
      likes: num(v?.digg_count),
      comments: num(v?.comment_count),
      shares: num(v?.share_count),
      saves: num(v?.collect_count),
      ...langAndRegion(v?.desc_language ?? v?.language, v?.region ?? v?.author?.region),
    });
  }
  return out;
}

/** Optional language / region fields, left out when the source doesn't say. */
function langAndRegion(language: unknown, region: unknown): { language?: string; region?: string } {
  const lang = str(language).trim().toLowerCase();
  const reg = str(region).trim().toUpperCase();
  return {
    ...(lang && lang !== "un" && lang !== "und" ? { language: lang } : {}),
    ...(/^[A-Z]{2}$/.test(reg) ? { region: reg } : {}),
  };
}

// ── Videos: ScrapeCreators (TikTok app shape, aweme_list) ───────────────────────
export function parseScrapeCreatorsTikTokVideos(raw: any, username: string): ScrapedVideo[] {
  const list: any[] = raw?.aweme_list ?? raw?.data?.aweme_list ?? [];
  const out: ScrapedVideo[] = [];
  for (const a of list) {
    const id = str(a?.aweme_id ?? a?.id);
    if (!id) continue;
    const caption = str(a?.desc);
    const st = a?.statistics ?? {};
    const v = a?.video ?? {};
    const images = Array.isArray(a?.image_post_info?.images) ? a.image_post_info.images : [];
    const mediaType = images.length > 1 ? "carousel" : images.length === 1 ? "photo" : "video";
    const durationMs = num(v.duration);
    out.push({
      id,
      postedAt: iso(a?.create_time),
      caption,
      hashtags: hashtagsOf(caption),
      durationSeconds: durationMs > 0 ? Math.round(durationMs / 1000) : null,
      mediaType,
      format: mediaType === "video" ? "short" : mediaType,
      coverUrl: http(v.origin_cover ?? v.cover ?? v.dynamic_cover ?? v.ai_dynamic_cover),
      shareUrl: tiktokLink(username, id, images.length > 0),
      musicTitle: str(a?.music?.title) || null,
      isAd: Boolean(a?.is_ad),
      hasProductLink: Array.isArray(a?.anchors) ? a.anchors.length > 0 : Boolean(a?.commerce_info?.product_info),
      productUrl: firstUrlIn(a?.anchors) ?? firstUrlIn(a?.commerce_info?.product_info),
      views: num(st.play_count),
      likes: num(st.digg_count),
      comments: num(st.comment_count),
      shares: num(st.share_count),
      saves: num(st.collect_count),
      ...langAndRegion(a?.desc_language, a?.author?.region ?? a?.region),
    });
  }
  return out;
}

// ── Search ─────────────────────────────────────────────────────────────────────
export function parseRapidSearch(raw: any): ScrapedSearchHit[] {
  const list: any[] = raw?.data?.user_list ?? raw?.data?.users ?? raw?.user_list ?? raw?.users ?? [];
  return list
    .map((row) => row?.user_info ?? row?.user ?? row)
    .map((u) => ({
      username: str(u?.unique_id ?? u?.uniqueId ?? u?.username).replace(/^@/, "").toLowerCase(),
      displayName: str(u?.nickname ?? u?.unique_id),
      followers: u?.follower_count != null || u?.followerCount != null ? num(u?.follower_count ?? u?.followerCount) : null,
      avatarUrl: http(u?.avatar_thumb ?? u?.avatarThumb ?? u?.avatar_larger ?? u?.avatar_medium),
    }))
    .filter((u) => u.username);
}

// ── Providers ──────────────────────────────────────────────────────────────────
const RAPID_TIKTOK_HOST = "tiktok-scraper7.p.rapidapi.com";

async function rapidTikTokGet(path: string, params: Record<string, string>, meter?: CallMeter): Promise<any> {
  const url = new URL(`https://${RAPID_TIKTOK_HOST}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const body = await providerGet({
    provider: "rapidapi-tiktok",
    url: url.toString(),
    headers: { "x-rapidapi-key": process.env.RAPIDAPI_KEY ?? "", "x-rapidapi-host": RAPID_TIKTOK_HOST },
    meter,
  });
  // tiktok-scraper7 answers HTTP 200 with { code: -1, msg } on errors.
  if (body?.code != null && Number(body.code) !== 0) {
    const msg = str(body.msg ?? body.message);
    throw new ProviderError("rapidapi-tiktok", looksNotFound(msg) ? "not_found" : "bad_response", `code ${body.code} ${msg}`.slice(0, 300));
  }
  return body;
}

export const rapidApiTikTok: CreatorSource = {
  name: "rapidapi-tiktok",
  platform: "tiktok",
  callsPerRefresh: 2,
  available: rapidApiTikTokAvailable,
  async profile(handle, meter) {
    return parseRapidProfile(await rapidTikTokGet("/user/info", { unique_id: handle }, meter), handle);
  },
  async videos(handle, count, meter) {
    return parseRapidVideos(await rapidTikTokGet("/user/posts", { unique_id: handle, count: String(count), cursor: "0" }, meter), handle);
  },
  async search(keyword, count, meter) {
    return parseRapidSearch(await rapidTikTokGet("/user/search", { keywords: keyword, count: String(count), cursor: "0" }, meter));
  },
};

export const scrapeCreatorsTikTok: CreatorSource = {
  name: "scrapecreators-tiktok",
  platform: "tiktok",
  callsPerRefresh: 2,
  available: () => Boolean(process.env.SCRAPECREATORS_API_KEY),
  async profile(handle, meter) {
    return parseScrapeCreatorsTikTokProfile(await scrapeCreatorsGet("/v1/tiktok/profile", { handle }, "scrapecreators-tiktok", meter), handle);
  },
  async videos(handle, count, meter) {
    const raw = await scrapeCreatorsGet("/v3/tiktok/profile/videos", { handle, sort_by: "latest", amount: String(count) }, "scrapecreators-tiktok", meter);
    return parseScrapeCreatorsTikTokVideos(raw, handle).slice(0, count);
  },
  async search(keyword, _count, meter) {
    return parseRapidSearch(await scrapeCreatorsGet("/v1/tiktok/search/users", { query: keyword }, "scrapecreators-tiktok", meter));
  },
};

// ── Choice and fallback ────────────────────────────────────────────────────────
const PROVIDERS: Record<ScrapePlatform, Record<string, CreatorSource>> = {
  tiktok: { scrapecreators: scrapeCreatorsTikTok, rapidapi: rapidApiTikTok },
  // RapidAPI "Instagram Scraper Stable API" (RAPIDAPI_INSTAGRAM_KEY, else RAPIDAPI_KEY):
  // the only Instagram provider when ScrapeCreators has no key; SCRAPER_PROVIDER_INSTAGRAM=rapidapi puts it first.
  instagram: { scrapecreators: scrapeCreatorsInstagram, rapidapi: rapidApiInstagram },
  youtube: { scrapecreators: scrapeCreatorsYouTube },
};

/** Providers that answered "no credits" / "bad key" recently are skipped for a while. */
const DOWN_FOR_MS = 15 * 60_000;
const downUntil = new Map<string, number>();
export function resetProviderHealth(): void {
  downUntil.clear();
}
function isDown(name: string): boolean {
  return (downUntil.get(name) ?? 0) > Date.now();
}

/** Every provider of a platform failed. allDown: none of them can serve (credits, keys). */
export class AllProvidersFailed extends Error {
  constructor(
    readonly platform: ScrapePlatform,
    readonly errors: string[],
    readonly allDown: boolean,
  ) {
    super(`${platform}: every provider failed (${errors.join(" | ")})`.slice(0, 600));
    this.name = "AllProvidersFailed";
  }
}

/** Provider order for a platform: SCRAPER_PROVIDER_<PLATFORM> first, then the others. */
export function providerOrder(platform: ScrapePlatform): CreatorSource[] {
  const all = PROVIDERS[platform];
  const preferred = String(process.env[`SCRAPER_PROVIDER_${platform.toUpperCase()}`] ?? "scrapecreators").trim().toLowerCase();
  const names = Object.keys(all).sort((a, b) => Number(b === preferred) - Number(a === preferred));
  return names.map((n) => all[n]).filter((s) => s.available());
}

/**
 * One source per platform that tries its providers in order. "Not found" is an
 * answer (no fallback: the account is gone or renamed); anything else falls
 * through to the next provider, and a provider out of credits is skipped for
 * the rest of the run.
 */
export function fallbackSource(platform: ScrapePlatform, providers: CreatorSource[]): CreatorSource {
  async function attempt<T>(call: (s: CreatorSource) => Promise<T>, onNotFound: () => T, among: CreatorSource[] = providers): Promise<T> {
    const errors: string[] = [];
    let downCount = 0;
    for (const p of among) {
      if (isDown(p.name)) {
        downCount += 1;
        errors.push(`${p.name}: skipped (out of credits or bad key)`);
        continue;
      }
      try {
        return await call(p);
      } catch (e) {
        if (e instanceof ProviderError && e.kind === "not_found") return onNotFound();
        if (e instanceof ProviderError && e.providerDown) {
          downUntil.set(p.name, Date.now() + DOWN_FOR_MS);
          downCount += 1;
        }
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    throw new AllProvidersFailed(platform, errors, among.length > 0 && downCount === among.length);
  }
  // Optional calls (similar accounts, hashtag posts) go to the providers that have them.
  const withSimilar = providers.filter((p) => p.similar);
  const withHashtag = providers.filter((p) => p.hashtag);
  return {
    name: providers.map((p) => p.name).join(">"),
    platform,
    get callsPerRefresh() {
      return providers[0]?.callsPerRefresh ?? 2;
    },
    available: () => providers.some((p) => p.available()),
    profile: (handle, meter) => attempt((p) => p.profile(handle, meter), () => null),
    videos: (handle, count, meter) => attempt((p) => p.videos(handle, count, meter), () => []),
    search: (keyword, count, meter) => attempt((p) => p.search(keyword, count, meter), () => []),
    ...(withSimilar.length ? { similar: (handle: string, meter?: CallMeter) => attempt((p) => p.similar!(handle, meter), () => [], withSimilar) } : {}),
    ...(withHashtag.length ? { hashtag: (tag: string, meter?: CallMeter) => attempt((p) => p.hashtag!(tag, meter), () => [], withHashtag) } : {}),
  };
}

/** The source for a platform (with fallback), or null when no provider is configured. */
export function sourceFor(platform: ScrapePlatform): CreatorSource | null {
  const providers = providerOrder(platform);
  return providers.length ? fallbackSource(platform, providers) : null;
}

/** Platforms that can be scraped right now (SCRAPE_PLATFORMS limits them, default all three). */
export function enabledPlatforms(): ScrapePlatform[] {
  const wanted = String(process.env.SCRAPE_PLATFORMS ?? "tiktok,instagram,youtube")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  return (Object.keys(PROVIDERS) as ScrapePlatform[]).filter((p) => wanted.includes(p) && providerOrder(p).length > 0);
}

/** Kept for older callers: the TikTok source. */
export function tiktokSource(): CreatorSource | null {
  return sourceFor("tiktok");
}

