import { compactNumber, emailIn, firstUrlIn, http, isoDate, num, scrapeCreatorsGet, str } from "./sc-client";
import { hashtagsOf, type CreatorSource, type RelatedAccount, type ScrapedProfile, type ScrapedSearchHit, type ScrapedVideo } from "./types";

// Instagram through ScrapeCreators (1 credit per call):
//   profile  GET /v1/instagram/profile?handle=         data.user (followers, bio, links…)
//   posts    GET /v2/instagram/user/posts?handle=      items[] (12 latest: reels, photos, carousels)
//   search   GET /v1/instagram/search/profiles?query=  profiles[] (follower counts for the first 10)
// One refresh = profile + posts = 2 calls. Instagram does not expose saves;
// shares only when the post carries them. Video ids are the public shortcode.
// The parsers below are shared with the RapidAPI Instagram source
// (sources-instagram-rapid.ts): both read Instagram's own objects, so both
// providers write the same rows.

const HANDLE = /^[a-z0-9._]{1,30}$/;
const cleanHandle = (v: unknown) => str(v).trim().replace(/^@+/, "").replace(/\.+$/, "").toLowerCase();

/** Public e-mail of an Instagram account: the one Instagram shows, else one written in the bio. */
export function instagramEmail(u: any): string | null {
  const listed = Array.isArray(u?.email_from_biography) ? u.email_from_biography.find((e: unknown) => typeof e === "string" && e.includes("@")) : null;
  return emailIn(u?.public_email) ?? emailIn(u?.business_email) ?? emailIn(listed) ?? emailIn(u?.biography);
}

/** @mentions in a caption or bio ("collab with @mia.style." → ["mia.style"]). */
export function mentionsIn(text: unknown): string[] {
  const out = new Set<string>();
  for (const m of str(text).matchAll(/(?:^|[^\w.@])@([A-Za-z0-9._]{2,30})/g)) {
    const h = cleanHandle(m[1]);
    if (HANDLE.test(h)) out.add(h);
  }
  return [...out];
}

/** Accounts next to a post: co-authors, the owner of a collab post, tagged people, caption mentions. */
export function relatedOfPost(item: any): RelatedAccount[] {
  const out = new Map<string, RelatedAccount>();
  const add = (username: unknown, displayName: unknown, via: RelatedAccount["via"]) => {
    const h = cleanHandle(username);
    if (!HANDLE.test(h) || out.has(h)) return;
    out.set(h, { username: h, displayName: str(displayName), via });
  };
  for (const c of Array.isArray(item?.coauthor_producers) ? item.coauthor_producers : []) add(c?.username, c?.full_name, "coauthor");
  if (item?.user?.username) add(item.user.username, item.user.full_name, "coauthor");
  for (const t of Array.isArray(item?.usertags?.in) ? item.usertags.in : []) add(t?.user?.username, t?.user?.full_name, "tag");
  for (const h of mentionsIn(item?.caption?.text ?? item?.caption)) add(h, "", "mention");
  return [...out.values()];
}

export function parseInstagramProfile(raw: any, handle: string): ScrapedProfile | null {
  const u = raw?.data?.user ?? raw?.user;
  if (!u || typeof u !== "object" || !(u.username || u.id)) return null;
  const links: any[] = Array.isArray(u.bio_links) ? u.bio_links : [];
  return {
    username: str(u.username || handle).replace(/^@/, "").toLowerCase(),
    displayName: str(u.full_name || u.username || handle),
    avatarUrl: http(u.profile_pic_url_hd ?? u.hd_profile_pic_url_info?.url ?? u.profile_pic_url),
    bio: str(u.biography),
    bioLink: http(links[0]?.url) || http(u.external_url) || null,
    followers: num(u.edge_followed_by?.count ?? u.follower_count),
    following: u.edge_follow?.count != null || u.following_count != null ? num(u.edge_follow?.count ?? u.following_count) : null,
    totalLikes: null,
    videoCount: u.edge_owner_to_timeline_media?.count != null || u.media_count != null ? num(u.edge_owner_to_timeline_media?.count ?? u.media_count) : null,
    verified: Boolean(u.is_verified),
    category: str(u.category_name ?? u.business_category_name ?? u.category) || null,
    email: instagramEmail(u),
    isPrivate: Boolean(u.is_private),
  };
}

function coverOf(item: any): string {
  return (
    http(item?.display_uri) ||
    http(item?.image_versions2?.candidates?.[0]?.url) ||
    http(item?.thumbnail_url) ||
    http(item?.display_url) ||
    http(item?.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url)
  );
}

export function parseInstagramPosts(raw: any): ScrapedVideo[] {
  const list: any[] = raw?.items ?? raw?.data?.items ?? [];
  const out: ScrapedVideo[] = [];
  for (const it of list) {
    const item = it?.media ?? it;
    const code = str(item?.code ?? item?.shortcode);
    const id = code || str(item?.pk ?? item?.id);
    if (!id) continue;
    const caption = str(item?.caption?.text ?? item?.caption);
    const type = num(item?.media_type);
    const mediaType = type === 8 ? "carousel" : type === 1 ? "photo" : "video";
    const tags = item?.product_tags;
    out.push({
      id,
      postedAt: isoDate(item?.taken_at ?? item?.created_at ?? item?.taken_at_timestamp),
      caption,
      hashtags: hashtagsOf(caption),
      durationSeconds: num(item?.video_duration) > 0 ? Math.round(num(item.video_duration)) : null,
      mediaType,
      format: mediaType === "video" ? "short" : mediaType,
      coverUrl: coverOf(item),
      shareUrl: code ? `https://www.instagram.com/p/${code}/` : http(item?.url),
      musicTitle: str(item?.music_metadata?.music_info?.music_asset_info?.title ?? item?.clips_metadata?.music_info?.music_asset_info?.title) || null,
      isAd: Boolean(item?.is_paid_partnership ?? item?.sponsor_tags?.length),
      hasProductLink: Array.isArray(tags) ? tags.length > 0 : Boolean(tags?.in?.length),
      productUrl: firstUrlIn(tags),
      views: num(item?.play_count ?? item?.ig_play_count ?? item?.video_view_count ?? item?.view_count),
      likes: num(item?.like_count ?? item?.edge_liked_by?.count),
      comments: num(item?.comment_count ?? item?.edge_media_to_comment?.count),
      shares: num(item?.share_count ?? item?.reshare_count),
      saves: 0,
      related: relatedOfPost(item),
    });
  }
  return out;
}

export function parseInstagramSearch(raw: any): ScrapedSearchHit[] {
  const list: any[] = raw?.profiles ?? raw?.users ?? raw?.data?.profiles ?? [];
  return list
    .map((p) => p?.user ?? p)
    .map((p) => ({
      username: str(p?.username).replace(/^@/, "").toLowerCase(),
      displayName: str(p?.full_name || p?.username),
      followers: p?.follower_count != null ? compactNumber(p.follower_count) : p?.edge_followed_by?.count != null ? num(p.edge_followed_by.count) : null,
      avatarUrl: http(p?.profile_pic_url),
    }))
    .filter((p) => p.username);
}

const NAME = "scrapecreators-instagram";

export const scrapeCreatorsInstagram: CreatorSource = {
  name: NAME,
  platform: "instagram",
  callsPerRefresh: 2,
  available: () => Boolean(process.env.SCRAPECREATORS_API_KEY),
  async profile(handle, meter) {
    return parseInstagramProfile(await scrapeCreatorsGet("/v1/instagram/profile", { handle }, NAME, meter), handle);
  },
  async videos(handle, count, meter) {
    return parseInstagramPosts(await scrapeCreatorsGet("/v2/instagram/user/posts", { handle }, NAME, meter)).slice(0, count);
  },
  async search(keyword, _count, meter) {
    return parseInstagramSearch(await scrapeCreatorsGet("/v1/instagram/search/profiles", { query: keyword }, NAME, meter));
  },
};
