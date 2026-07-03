// Live discovery: search ScrapeCreators and enrich on-demand so the search
// returns REAL creators with REAL metrics, even when the creators_index DB is
// empty (local preview) or a niche hasn't been seeded yet (cold niche).
//
// Credit cost: ~1 (search) + ~2 per enriched creator (profile + videos). An
// in-memory per-niche cache (TTL ~30 min, dev-process lifetime) avoids
// re-spending on repeat searches.
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  searchTikTokUsersRaw,
  fetchTikTokProfileRaw,
  fetchTikTokVideosRaw,
  parseProfile,
  parseVideos,
} from "@/lib/scrapecreators";
import { buildEnrichmentRow } from "@/lib/creator-enrichment";
import { creatorAvatarApiUrl, feedAvatarUrlForCreator } from "@/lib/feed-avatar-url";
import type { NormalizedFilters } from "@/lib/creator-discovery-filters";
import { pickTikTokAvatarUrl, proxiedImageUrl } from "@/lib/tiktok-avatar";

export interface DiscoveryCreatorResult {
  username: string;
  displayName: string;
  avatarUrl: string;
  followersCount: number;
  engagementRate: number;
  engagementByFollower: number;
  avgViews: number;
  postFrequency: number;
  lastPostAt: string | null;
  authenticityScore: number;
  qualityStatus: string;
  platform: string;
  bio: string;
  email: string | null;
  niche: string;
  primaryNiche: string;
  niches?: string[];
  language: string;
  location: string | null;
  countryCode: string | null;
  videoThumbnails: DiscoveryVideoThumb[];
}

export interface DiscoveryVideoThumb {
  views: number;
  thumbnail: string | null;
  url?: string | null;
}

type SCSearchUser = {
  unique_id?: string;
  nickname?: string;
  follower_count?: number;
  signature?: string;
  avatar_medium?: { url_list?: string[] };
  avatar_168x168?: { url_list?: string[] };
};

function extractEmail(text: string): string | null {
  const m = (text || "").match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

function proxied(url: string | null | undefined): string | null {
  if (!url) return null;
  const out = proxiedImageUrl(url);
  return out || null;
}

function pickAvatar(profileRaw: any, u: SCSearchUser): string | null {
  return pickTikTokAvatarUrl(profileRaw, u);
}

function pickVideoThumbs(videosRaw: any, limit = 3): DiscoveryVideoThumb[] {
  const list: any[] = videosRaw?.aweme_list ?? [];
  const organic = list.filter((a) => !a?.is_ad);
  const use = (organic.length ? organic : list)
    .slice()
    .sort((a, b) => Number(b?.create_time || 0) - Number(a?.create_time || 0))
    .slice(0, limit);
  return use.map((a) => {
    const v = a?.video ?? {};
    // TikTok serves `cover`/`origin_cover` as HEIC (browsers can't render it).
    // `dynamic_cover` / `ai_dynamic_cover` are animated WebP -> renderable.
    const cover =
      v.dynamic_cover?.url_list?.[0] ||
      v.ai_dynamic_cover?.url_list?.[0] ||
      v.origin_cover?.url_list?.[0] ||
      v.cover?.url_list?.[0] ||
      null;
    return {
      views: Number(a?.statistics?.play_count ?? 0),
      thumbnail: proxied(cover),
      url: a?.share_url || null,
    };
  });
}

// In-memory cache (per server process). Keyed by normalized niche.
const cache = new Map<string, { at: number; creators: DiscoveryCreatorResult[] }>();
const TTL_MS = 30 * 60 * 1000;

async function searchUsers(query: string): Promise<SCSearchUser[]> {
  const data = (await searchTikTokUsersRaw(query)) as { user_list?: { user_info?: SCSearchUser }[] };
  const list = data?.user_list ?? [];
  return list.map((u) => u.user_info).filter((u): u is SCSearchUser => !!u && !!u.unique_id);
}

async function enrichOne(u: SCSearchUser, niche: string): Promise<DiscoveryCreatorResult | null> {
  const username = String(u.unique_id);
  try {
    const [pRaw, vRaw] = await Promise.all([
      fetchTikTokProfileRaw(username),
      fetchTikTokVideosRaw(username),
    ]);
    const profile = parseProfile(pRaw);
    const videos = parseVideos(vRaw);
    const followers = profile.followers || Number(u.follower_count || 0);
    const row = buildEnrichmentRow(username, { ...profile, followers }, videos);
    const bio = profile.bio || String(u.signature || "");
    const avatar =
      feedAvatarUrlForCreator(
        username,
        proxied(pickAvatar(pRaw, u)) || pickAvatar(pRaw, u) || "",
      ) || creatorAvatarApiUrl(username);
    return {
      username,
      displayName: row.display_name || username,
      avatarUrl: avatar,
      followersCount: row.followers,
      engagementRate: row.engagement_rate,
      engagementByFollower: row.engagement_by_follower,
      avgViews: row.avg_views,
      postFrequency: row.post_frequency,
      lastPostAt: row.last_post_at,
      authenticityScore: row.authenticity_score,
      qualityStatus: row.quality_status,
      platform: "TikTok",
      bio,
      email: extractEmail(bio),
      niche,
      primaryNiche: niche,
      language: "unknown",
      location: null,
      countryCode: null,
      videoThumbnails: pickVideoThumbs(vRaw),
    };
  } catch {
    return null; // private / no videos / rate-limited -> skip
  }
}

/**
 * Search ScrapeCreators for `niche`, enrich the top creators with real metrics,
 * apply the (DB-equivalent) filters, and return them sorted by engagement.
 * Language/country filters are skipped here (live results aren't classified).
 */
export async function liveSearchAndEnrich(
  niche: string,
  f: NormalizedFilters,
  opts: { limit?: number } = {}
): Promise<DiscoveryCreatorResult[]> {
  const limit = Math.min(Math.max(opts.limit ?? Number(process.env.LIVE_ENRICH_LIMIT ?? 6), 1), 20);
  const key = niche.toLowerCase().trim();

  let pool: DiscoveryCreatorResult[];
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) {
    pool = cached.creators;
  } else {
    const users = await searchUsers(niche);
    const top = users
      .sort((a, b) => Number(b.follower_count || 0) - Number(a.follower_count || 0))
      .slice(0, limit);

    const enriched: DiscoveryCreatorResult[] = [];
    const CONCURRENCY = 3;
    for (let i = 0; i < top.length; i += CONCURRENCY) {
      const chunk = top.slice(i, i + CONCURRENCY);
      const res = await Promise.all(chunk.map((u) => enrichOne(u, niche)));
      for (const r of res) if (r) enriched.push(r);
    }
    pool = enriched;
    cache.set(key, { at: Date.now(), creators: pool });
  }

  return pool
    .filter((c) => c.followersCount >= f.followers.gte && c.followersCount <= f.followers.lte)
    .filter((c) => c.engagementRate >= f.minEngagement)
    .filter((c) => c.avgViews >= f.minViews)
    .filter((c) => c.authenticityScore >= f.minAuthenticity)
    .filter((c) => !f.excludeStatuses.includes(c.qualityStatus))
    .filter((c) => (f.hasEmail ? !!c.email : true))
    .filter((c) => (f.activeSince && c.lastPostAt ? c.lastPostAt >= f.activeSince : true))
    .sort((a, b) => b.engagementRate - a.engagementRate || b.authenticityScore - a.authenticityScore);
}
