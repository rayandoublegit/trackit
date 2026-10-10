import { ProviderError, classifyBodyError, providerGet, providerPostForm } from "./http";
import { compactNumber, http, num, str } from "./sc-client";
import { parseInstagramPosts, parseInstagramProfile } from "./sources-instagram";
import type { CallMeter, CreatorSource, ScrapedProfile, ScrapedSearchHit, ScrapedVideo } from "./types";

// Instagram through the RapidAPI "Instagram Scraper Stable API"
// (instagram-scraper-stable-api.p.rapidapi.com), 1 request of the plan per call:
//   profile  POST /ig_get_fb_profile.php   username_or_url=      flat user object
//   posts    POST /get_ig_user_posts.php   username_or_url, amount  posts[].node (latest posts, all types, captions, dates)
//   reels    POST /get_ig_user_reels.php   username_or_url, amount  reels[].node.media (play counts)
//   search   POST /search_ig.php           search_query=         users[].user (~5 accounts, follower count as text)
//   similar  GET  /get_ig_similar_accounts.php?username_or_url=  (optional, often "not found")
//   hashtag  GET  /search_hashtag.php?hashtag=                   (optional, often "try again later")
//
// One refresh = profile + posts + reels = 3 calls. Posts carry no view count
// (view_count null, no play_count), so the reels call fills the views of the
// video posts by shortcode; without it avg views and "viral" would be blank.
// SCRAPE_INSTAGRAM_REELS=0 drops it (2 calls, no views).
//
// Posts and the profile are Instagram's own objects, read by the same parsers
// as ScrapeCreators (sources-instagram.ts): same ids (shortcode), same links
// (instagram.com/p/<code>/), same handle, so both providers write the same rows.
//
// Errors come back as HTTP 200 with { error } or { message }:
// "…does not exist on Instagram" = not found; "Please try again later",
// "Received 429" = busy (rate_limited, the next provider is tried).

export const RAPID_INSTAGRAM_HOST = "instagram-scraper-stable-api.p.rapidapi.com";
const NAME = "rapidapi-instagram";
/** Posts asked per call: the API returns up to ~24 for amount=30 in one request. */
const POSTS_PER_CALL = 30;

export function rapidInstagramKey(): string {
  return String(process.env.RAPIDAPI_INSTAGRAM_KEY || process.env.RAPIDAPI_KEY || "").trim();
}

export function rapidInstagramAvailable(): boolean {
  return Boolean(rapidInstagramKey());
}

/** Reels call on (default) or off (SCRAPE_INSTAGRAM_REELS=0). */
export function rapidInstagramReels(): boolean {
  const v = String(process.env.SCRAPE_INSTAGRAM_REELS ?? "").trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "off");
}

/** Throws the error an answer carries in its body ({ error } / { message } without data). */
function checkBody(body: any, dataKeys: string[]): any {
  const hasData = dataKeys.some((k) => body?.[k] != null);
  const message = str(body?.error ?? (hasData ? "" : body?.message)).trim();
  if (message) throw new ProviderError(NAME, classifyBodyError(message), message.slice(0, 300));
  if (!hasData) throw new ProviderError(NAME, "bad_response", "answer without data");
  return body;
}

function headers(): Record<string, string> {
  return { "x-rapidapi-key": rapidInstagramKey(), "x-rapidapi-host": RAPID_INSTAGRAM_HOST };
}

async function post(path: string, form: Record<string, string>, dataKeys: string[], meter?: CallMeter): Promise<any> {
  const body = await providerPostForm({ provider: NAME, url: `https://${RAPID_INSTAGRAM_HOST}${path}`, headers: headers(), form, meter });
  return checkBody(body, dataKeys);
}

async function get(path: string, params: Record<string, string>, dataKeys: string[], meter?: CallMeter): Promise<any> {
  const url = new URL(`https://${RAPID_INSTAGRAM_HOST}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const body = await providerGet({ provider: NAME, url: url.toString(), headers: headers(), meter });
  return checkBody(body, dataKeys);
}

// ── Parsers (pure) ─────────────────────────────────────────────────────────────

/** The flat user object of /ig_get_fb_profile.php, read like ScrapeCreators' data.user. */
export function parseRapidInstagramProfile(raw: any, handle: string): ScrapedProfile | null {
  if (!raw || typeof raw !== "object" || raw.error) return null;
  const user = raw.user && typeof raw.user === "object" ? raw.user : raw;
  return parseInstagramProfile({ user }, handle);
}

/** Play counts of the reels, by shortcode. */
export function parseRapidInstagramReelViews(raw: any): Map<string, number> {
  const views = new Map<string, number>();
  for (const r of Array.isArray(raw?.reels) ? raw.reels : []) {
    const m = r?.node?.media ?? r?.media ?? r?.node ?? r;
    const code = str(m?.code);
    const plays = num(m?.play_count ?? m?.ig_play_count ?? m?.view_count);
    if (code && plays > 0) views.set(code, plays);
  }
  return views;
}

/** Latest posts (all types), with the views of video posts filled from the reels. */
export function parseRapidInstagramPosts(raw: any, reelViews: Map<string, number> = new Map()): ScrapedVideo[] {
  const items = (Array.isArray(raw?.posts) ? raw.posts : []).map((p: any) => p?.node ?? p);
  return parseInstagramPosts({ items }).map((v) => (v.views > 0 || !reelViews.has(v.id) ? v : { ...v, views: reelViews.get(v.id)! }));
}

/** "291K followers" → 291000; other contexts ("Followed by x + 3 more") → null. */
export function followersFromContext(text: unknown): number | null {
  const m = str(text).match(/([\d.,]+\s*[kmb]?)\s+(followers?|abonn[ée]s?)/i);
  return m ? compactNumber(m[1].replace(/,(?=\d{3}\b)/g, "")) : null;
}

export function parseRapidInstagramSearch(raw: any): ScrapedSearchHit[] {
  const list: any[] = Array.isArray(raw?.users) ? raw.users : [];
  return list
    .map((row) => row?.user ?? row)
    .map((u) => ({
      username: str(u?.username).replace(/^@/, "").toLowerCase(),
      displayName: str(u?.full_name || u?.username),
      followers: u?.follower_count != null ? num(u.follower_count) : followersFromContext(u?.search_social_context),
      avatarUrl: http(u?.profile_pic_url),
    }))
    .filter((u) => u.username);
}

/**
 * Accounts in an answer whose shape is not fixed (similar accounts, hashtag
 * posts): every object holding a username, with its follower count when given.
 */
export function accountsIn(raw: any, maxDepth = 6): ScrapedSearchHit[] {
  const out = new Map<string, ScrapedSearchHit>();
  const walk = (v: any, depth: number) => {
    if (!v || typeof v !== "object" || depth > maxDepth) return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    const username = typeof v.username === "string" ? v.username.replace(/^@/, "").toLowerCase() : "";
    if (username && /^[a-z0-9._]{1,30}$/.test(username) && !out.has(username)) {
      const followers = v.follower_count ?? v.edge_followed_by?.count;
      out.set(username, {
        username,
        displayName: str(v.full_name || username),
        followers: followers != null ? num(followers) : followersFromContext(v.search_social_context),
        avatarUrl: http(v.profile_pic_url),
      });
    }
    for (const x of Object.values(v)) if (x && typeof x === "object") walk(x, depth + 1);
  };
  walk(raw, 0);
  return [...out.values()];
}

// ── Source ─────────────────────────────────────────────────────────────────────

export const rapidApiInstagram: CreatorSource = {
  name: NAME,
  platform: "instagram",
  get callsPerRefresh() {
    return rapidInstagramReels() ? 3 : 2;
  },
  available: rapidInstagramAvailable,
  async profile(handle, meter) {
    try {
      return parseRapidInstagramProfile(await post("/ig_get_fb_profile.php", { username_or_url: handle }, ["username", "user", "pk"], meter), handle);
    } catch (e) {
      if (e instanceof ProviderError && e.kind === "not_found") return null;
      throw e;
    }
  },
  async videos(handle, count, meter) {
    const amount = String(Math.max(1, Math.min(POSTS_PER_CALL, count)));
    const posts = await post("/get_ig_user_posts.php", { username_or_url: handle, amount }, ["posts"], meter);
    let views = new Map<string, number>();
    if (rapidInstagramReels() && parseInstagramPosts({ items: (posts.posts ?? []).map((p: any) => p?.node ?? p) }).some((v) => v.mediaType === "video")) {
      // Views only: a busy reels call must not lose the posts already paid for.
      try {
        views = parseRapidInstagramReelViews(await post("/get_ig_user_reels.php", { username_or_url: handle, amount }, ["reels"], meter));
      } catch (e) {
        if (e instanceof ProviderError && e.providerDown) throw e;
      }
    }
    return parseRapidInstagramPosts(posts, views).slice(0, count);
  },
  async search(keyword, _count, meter) {
    return parseRapidInstagramSearch(await post("/search_ig.php", { search_query: keyword }, ["users"], meter));
  },
  async similar(handle, meter) {
    return accountsIn(await get("/get_ig_similar_accounts.php", { username_or_url: handle }, ["users", "data", "similar_accounts", "accounts"], meter));
  },
  async hashtag(tag, meter) {
    return accountsIn(await get("/search_hashtag.php", { hashtag: tag.replace(/^#/, "") }, ["posts", "reels", "data", "items", "top_posts", "recent_posts"], meter));
  },
};
