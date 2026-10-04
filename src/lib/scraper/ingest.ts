import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEnrichmentRow, type TopVideo } from "@/lib/creator-enrichment";
import type { VideoStat } from "@/lib/creator-metrics";
import type { RichVideo } from "@/lib/scrapecreators";
import { fetchRemoteImage } from "@/lib/fetch-remote-image";
import { isStablePublicImageUrl } from "@/lib/client-image-url";
import { storeVideoCoverBuffer } from "@/lib/tiktok-video-thumbs";
import { storeTikTokAvatar } from "@/lib/tiktok-avatar";
import { classifyNiche } from "@/lib/rapidapi-creators";
import { detectBrand } from "@/lib/brand-detect";
import { creatorCountry, creatorLanguage } from "@/lib/creator-language";
import { classifyCreatorNiche } from "@/lib/creator-niche";
import { buildSeedTargets } from "@/lib/niche-tree";
import { creatorKey, handleFromKey, knownKeys, normalizeHandle, normalizePlatform } from "./identity";
import { nextScrapeAt, retryAfterFailure, scrapePriority } from "./schedule";
import { CallMeter, type CreatorSource, type ScrapedVideo } from "./types";
import { marketTarget, nextMarketPage, parseMarketPage, parseMarketTarget } from "./marketplace";
import { scrapeCreatorsGet } from "./sc-client";

// One refresh of one creator: fetch profile + latest videos (2 API calls for
// TikTok and Instagram, 3 for YouTube), store what expires (covers, avatar),
// write today's snapshots, update the current-state row, then recompute
// growth and the next refresh date.
//
// Everything is keyed by (platform, storage key) — see identity.ts — and
// never by a provider's id, so any provider can serve any refresh and the
// history stays one continuous line.

export type IngestResult = {
  username: string;
  isNew: boolean;
  apiCalls: number;
  videos: number;
  coversStored: number;
};

/** The account does not exist any more (renamed, deleted or banned). */
export class CreatorNotFound extends Error {}

const VIDEOS_PER_REFRESH = 30;
const NEW_COVERS_PER_REFRESH = 9;

type Writer = (row: Record<string, unknown>[]) => PromiseLike<{ error: { message: string } | null }>;

/**
 * Writes rows; if the database does not have one of the optional columns yet
 * (migration 000046 not applied), writes again without them.
 */
async function writeTolerant(write: Writer, rows: Record<string, unknown>[], optional: string[]): Promise<{ error: { message: string } | null }> {
  // The database names one missing column per error: drop it and try again.
  const dropped = new Set<string>();
  for (;;) {
    const current = dropped.size ? rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !dropped.has(k)))) : rows;
    const result = await write(current);
    if (!result.error) return result;
    const missing = optional.filter((c) => !dropped.has(c) && result.error!.message.includes(c));
    if (!missing.length) return result;
    for (const c of missing) dropped.add(c);
  }
}

function toRich(v: ScrapedVideo, cover: string): RichVideo {
  return {
    id: v.id,
    cover,
    shareUrl: v.shareUrl,
    playUrl: "",
    playCount: v.views,
    likeCount: v.likes,
    commentCount: v.comments,
    shareCount: v.shares,
    createTime: v.postedAt ? Math.floor(new Date(v.postedAt).getTime() / 1000) : 0,
    desc: v.caption,
    isAd: v.isAd,
  };
}

async function storedCovers(
  admin: SupabaseClient,
  platform: string,
  key: string,
  videos: ScrapedVideo[],
): Promise<{ covers: Map<string, string>; stored: number }> {
  const covers = new Map<string, string>();
  if (!videos.length) return { covers, stored: 0 };
  const { data } = await admin
    .from("creator_videos")
    .select("video_id, cover_url")
    .eq("platform", platform)
    .in("video_id", videos.map((v) => v.id));
  for (const row of data ?? []) {
    const url = String(row.cover_url ?? "");
    if (isStablePublicImageUrl(url)) covers.set(String(row.video_id), url);
  }
  // Store the covers we don't hold yet, best videos first (CDN links expire).
  let stored = 0;
  const missing = videos.filter((v) => !covers.has(v.id) && v.coverUrl).sort((a, b) => b.views - a.views);
  for (const v of missing.slice(0, NEW_COVERS_PER_REFRESH)) {
    const img = await fetchRemoteImage(v.coverUrl);
    if (!img) continue;
    const buf = Buffer.from(await new Response(img.body).arrayBuffer());
    const url = await storeVideoCoverBuffer(admin, buf, img.contentType, key, v.id);
    if (url) {
      covers.set(v.id, url);
      stored += 1;
    }
  }
  return { covers, stored };
}

/**
 * Language, country and niche from the creator's own posts, on every refresh:
 * the languages and account region the platform reports first, then the words
 * and hashtags of the captions. A niche only sticks when the content backs it;
 * one found through a search keyword with nothing in the videos is dropped.
 */
export function profileAnalysis(
  bio: string,
  videos: ScrapedVideo[],
  existing: { primary_niche?: unknown; niches?: unknown } | null,
): Record<string, unknown> {
  const captions = videos.map((v) => v.caption).filter(Boolean);
  const out: Record<string, unknown> = {};
  const language = creatorLanguage({ videoLanguages: videos.map((v) => v.language), captions, bio });
  if (language) out.language = language;
  const country = creatorCountry({ regions: videos.map((v) => v.region) });
  if (country) out.country_code = country;

  const niche = classifyCreatorNiche({ bio, captions, hashtags: videos.flatMap((v) => v.hashtags) });
  if (niche.confident && niche.primaryNiche) {
    out.primary_niche = niche.primaryNiche;
    out.niches = niche.niches;
    return out;
  }
  const current = typeof existing?.primary_niche === "string" ? existing.primary_niche : "";
  if (current && (niche.scores[current] ?? 0) >= 2) return out; // some evidence: keep it
  if (captions.length >= 3) {
    // Enough posts and nothing points to the stored niche: clear it rather than mislabel.
    out.primary_niche = null;
    out.niches = [];
  } else if (!current) {
    const classified = classifyNiche([bio, ...captions].join("\n"), "lifestyle");
    out.primary_niche = classified.primaryNiche;
    out.niches = classified.niches;
  }
  return out;
}

export async function refreshCreator(
  admin: SupabaseClient,
  source: CreatorSource,
  rawKey: string,
  opts: { meter?: CallMeter; nowMs?: number } = {},
): Promise<IngestResult> {
  const platform = source.platform;
  const key = normalizeHandle(rawKey);
  const handle = handleFromKey(platform, key);
  const meter = opts.meter ?? new CallMeter();
  const callsBefore = meter.calls;
  const now = opts.nowMs ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const today = nowIso.slice(0, 10);

  const profile = await source.profile(handle, meter);
  if (!profile || !profile.username) throw new CreatorNotFound(`${platform}:${handle} not found`);
  const videos = await source.videos(handle, VIDEOS_PER_REFRESH, meter);

  const { data: existing } = await admin
    .from("creators_index")
    .select("username, platform, avatar_url, primary_niche, niches, first_seen_at, language, country_code")
    .eq("username", key)
    .maybeSingle();
  if (existing && normalizePlatform(existing.platform) !== platform) {
    // Never let one platform's refresh overwrite another platform's creator.
    throw new Error(`${platform}:${key} is stored as a ${existing.platform} creator`);
  }

  const { covers, stored } = await storedCovers(admin, platform, key, videos);
  const coverOf = (v: ScrapedVideo) => covers.get(v.id) ?? v.coverUrl;

  // Current-state row, with the same metric and quality rules as before.
  const stats: VideoStat[] = videos.map((v) => ({
    playCount: v.views,
    likeCount: v.likes,
    commentCount: v.comments,
    shareCount: v.shares,
    createTime: v.postedAt ? Math.floor(new Date(v.postedAt).getTime() / 1000) : 0,
    isAd: v.isAd,
  }));
  const row = buildEnrichmentRow(
    key,
    { followers: profile.followers, verified: profile.verified, bio: profile.bio, displayName: profile.displayName, videoCount: profile.videoCount ?? 0 },
    stats,
    now,
    videos.map((v) => toRich(v, coverOf(v))),
  );
  const topWithStableCovers: TopVideo[] = row.top_videos;

  let avatarUrl = String(existing?.avatar_url ?? "");
  if (profile.avatarUrl && !isStablePublicImageUrl(avatarUrl)) {
    avatarUrl = (await storeTikTokAvatar(admin, profile.avatarUrl, key)) || profile.avatarUrl;
  }

  const nicheMerge = profileAnalysis(profile.bio, videos, existing);

  // Brand / company accounts stay in the catalog, hidden from Discovery by default.
  const brand = detectBrand({
    username: key,
    displayName: profile.displayName,
    bio: profile.bio,
    bioLink: profile.bioLink,
    seller: profile.seller,
    category: profile.category,
  });

  const upsert = {
    ...row,
    ...nicheMerge,
    is_brand: brand.isBrand,
    brand_reason: brand.reason,
    username: key,
    platform,
    top_videos: topWithStableCovers,
    avatar_url: avatarUrl || null,
    following: profile.following,
    total_likes: profile.totalLikes,
    video_count: profile.videoCount,
    is_verified: profile.verified,
    bio_link: profile.bioLink,
    last_scraped_at: nowIso,
    scrape_failures: 0,
    scrape_status: "ok",
    ...(existing ? {} : { first_seen_at: nowIso }),
  };
  const { error: upErr } = await writeTolerant((r) => admin.from("creators_index").upsert(r, { onConflict: "username" }), [upsert], ["scrape_status", "is_brand", "brand_reason"]);
  if (upErr) throw new Error(`creators_index: ${upErr.message}`);

  // History: one snapshot per creator per day, same key whatever the provider.
  await admin.from("creator_snapshots").upsert(
    {
      platform,
      username: key,
      captured_on: today,
      captured_at: nowIso,
      followers: profile.followers,
      following: profile.following,
      total_likes: profile.totalLikes,
      video_count: profile.videoCount,
      avg_views: row.avg_views,
      engagement_rate: row.engagement_rate,
    },
    { onConflict: "platform,username,captured_on" },
  );

  if (videos.length) {
    await writeTolerant(
      (r) => admin.from("creator_videos").upsert(r, { onConflict: "platform,video_id" }),
      videos.map((v) => ({
        platform,
        video_id: v.id,
        username: key,
        posted_at: v.postedAt,
        caption: v.caption.slice(0, 2200),
        hashtags: v.hashtags,
        duration_seconds: v.durationSeconds,
        media_type: v.mediaType,
        format: v.format,
        cover_url: coverOf(v) || null,
        share_url: v.shareUrl,
        music_title: v.musicTitle,
        is_ad: v.isAd,
        has_product_link: v.hasProductLink || Boolean(v.productUrl),
        product_url: v.productUrl,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        shares: v.shares,
        saves: v.saves,
        engagement_rate: v.views > 0 ? Math.round(((v.likes + v.comments + v.shares) / v.views) * 10_000) / 100 : null,
        last_scraped_at: nowIso,
      })),
      ["format", "product_url"],
    );
    await admin.from("creator_video_snapshots").upsert(
      videos.map((v) => ({ platform, video_id: v.id, captured_on: today, views: v.views, likes: v.likes, comments: v.comments, shares: v.shares })),
      { onConflict: "platform,video_id,captured_on" },
    );
  }

  // Growth, 30-day views and rank, then when to come back.
  await admin.rpc("refresh_creator_rollup", { p_platform: platform, p_username: key });
  const { data: rolled } = await admin
    .from("creators_index")
    .select("followers, followers_growth_pct_7d, growth_score, last_post_at")
    .eq("username", key)
    .maybeSingle();
  const priority = scrapePriority(
    {
      followers: Number(rolled?.followers ?? profile.followers),
      followersGrowthPct7d: rolled?.followers_growth_pct_7d == null ? null : Number(rolled.followers_growth_pct_7d),
      growthScore: rolled?.growth_score == null ? null : Number(rolled.growth_score),
      lastPostAt: (rolled?.last_post_at as string | null) ?? row.last_post_at,
    },
    now,
  );
  await admin.from("creators_index").update({ scrape_priority: priority, next_scrape_at: nextScrapeAt(priority, now) }).eq("username", key);

  return { username: key, isNew: !existing, apiCalls: meter.calls - callsBefore, videos: videos.length, coversStored: stored };
}

/**
 * Marks a failed refresh: count it and push the next try back (1, 2, 4, 8
 * weeks). "Not found" (renamed or deleted account) is recorded as such; the
 * creator's history is never deleted.
 */
export async function recordCreatorFailure(admin: SupabaseClient, key: string, opts: { notFound?: boolean; nowMs?: number } = {}): Promise<void> {
  const username = normalizeHandle(key);
  const { data } = await admin.from("creators_index").select("scrape_failures").eq("username", username).maybeSingle();
  if (!data) return;
  const failures = Number(data.scrape_failures ?? 0) + 1;
  await writeTolerant(
    ([patch]) => admin.from("creators_index").update(patch).eq("username", username),
    [{ scrape_failures: failures, next_scrape_at: retryAfterFailure(failures, opts.nowMs), scrape_status: opts.notFound ? "not_found" : "failing" }],
    ["scrape_status"],
  );
}

/** Niche tags of a niche-tree query ("gym workout" → ["fitness"]), else the keyword itself. */
export function nicheTagsForKeyword(keyword: string): string[] {
  const k = keyword.trim().toLowerCase();
  const hit = buildSeedTargets().find((t) => t.query.toLowerCase() === k);
  const tags = hit ? hit.tags.map((t) => t.toLowerCase()) : [k];
  return tags.filter((t) => t && t !== "curated");
}

export type DiscoverOptions = {
  meter?: CallMeter;
  count?: number;
  minFollowers?: number;
  maxFollowers?: number;
  /** New creators this search may still add (weekly cap). */
  maxNew?: number;
};

/**
 * Discovery: search a keyword on the source's platform and add the creators
 * we don't know yet as light rows, each with a refresh job queued right away
 * (the worker fills them in on its next passes). Hits without a follower
 * count, or outside the follower range, are skipped: every creator added
 * costs a refresh every week.
 */
export async function discoverKeyword(
  admin: SupabaseClient,
  source: CreatorSource,
  keyword: string,
  opts: DiscoverOptions = {},
): Promise<{ found: number; added: number; apiCalls: number; addedKeys: string[] }> {
  const platform = source.platform;
  const meter = opts.meter ?? new CallMeter();
  const callsBefore = meter.calls;
  const min = opts.minFollowers ?? 5_000;
  const max = opts.maxFollowers ?? Number.POSITIVE_INFINITY;
  const hits = (await source.search(keyword, opts.count ?? 30, meter)).filter(
    (h) => h.username && h.followers != null && h.followers >= min && h.followers <= max,
  );
  const calls = () => meter.calls - callsBefore;
  if (!hits.length) return { found: 0, added: 0, apiCalls: calls(), addedKeys: [] };

  // Known under the current key or a pre-prefix key of the same platform.
  const candidates = hits.flatMap((h) => knownKeys(platform, h.username));
  const { data: known } = await admin.from("creators_index").select("username, platform").in("username", candidates);
  const knownSet = new Set(
    (known ?? [])
      .filter((k) => normalizePlatform(k.platform) === platform)
      .map((k) => handleFromKey(platform, String(k.username))),
  );
  // A key already held by any row (even of another platform) is never reused.
  const taken = new Set((known ?? []).map((k) => normalizeHandle(String(k.username))));

  const seen = new Set<string>();
  const fresh = hits
    .filter((h) => {
      const handle = normalizeHandle(h.username);
      if (knownSet.has(handle) || taken.has(creatorKey(platform, handle)) || seen.has(handle)) return false;
      seen.add(handle);
      return true;
    })
    .slice(0, Math.max(0, opts.maxNew ?? Number.POSITIVE_INFINITY));
  if (!fresh.length) return { found: hits.length, added: 0, apiCalls: calls(), addedKeys: [] };

  const nowIso = new Date().toISOString();
  const niches = nicheTagsForKeyword(keyword);
  const rows = fresh.map((h) => {
    // Name-only check for now; the first refresh classifies with the bio too.
    const brand = detectBrand({ username: h.username, displayName: h.displayName });
    return {
      username: creatorKey(platform, h.username),
      platform,
      display_name: h.displayName || h.username,
      followers: h.followers,
      niches,
      enrichment_status: "pending",
      scrape_priority: 3,
      next_scrape_at: nowIso,
      first_seen_at: nowIso,
      is_brand: brand.isBrand ? true : null,
      brand_reason: brand.reason,
    };
  });
  const { error } = await writeTolerant(
    (r) => admin.from("creators_index").upsert(r, { onConflict: "username", ignoreDuplicates: true }),
    rows,
    ["is_brand", "brand_reason"],
  );
  if (error) throw new Error(`creators_index: ${error.message}`);

  // Their first refresh is queued now (one live job per creator).
  const jobs = rows.map((r) => ({ kind: "creator_refresh", platform, target: r.username, priority: 3 }));
  const { error: jobErr } = await admin.from("scrape_jobs").insert(jobs);
  if (jobErr) for (const job of jobs) await admin.from("scrape_jobs").insert(job);

  return { found: hits.length, added: rows.length, apiCalls: calls(), addedKeys: rows.map((r) => r.username) };
}

/**
 * One page of a Creator Marketplace walk (scraper/marketplace.ts): adds the
 * creators we don't know yet as light rows (with the country TikTok has on
 * file), queues their first refresh, then queues the next page of the walk.
 */
export async function discoverMarketplace(
  admin: SupabaseClient,
  target: string,
  opts: DiscoverOptions & { maxPage?: number } = {},
): Promise<{ found: number; added: number; apiCalls: number; addedKeys: string[]; next: string | null }> {
  const t = parseMarketTarget(target);
  if (!t) throw new Error(`bad marketplace target ${target}`);
  const meter = opts.meter ?? new CallMeter();
  const callsBefore = meter.calls;
  const raw = await scrapeCreatorsGet(
    "/v1/tiktok/creators/popular",
    { page: String(t.page), sortBy: t.sort, followerCount: t.range, creatorCountry: t.country },
    "scrapecreators-tiktok",
    meter,
  );
  const page = parseMarketPage(raw);
  const min = opts.minFollowers ?? 5_000;
  const max = opts.maxFollowers ?? Number.POSITIVE_INFINITY;
  const hits = page.creators.filter((c) => c.followers >= min && c.followers <= max);

  let addedKeys: string[] = [];
  if (hits.length) {
    const candidates = hits.flatMap((h) => knownKeys("tiktok", h.username));
    const { data: known } = await admin.from("creators_index").select("username").in("username", candidates);
    const taken = new Set((known ?? []).map((k) => normalizeHandle(String(k.username))));
    const fresh = hits
      .filter((h) => !knownKeys("tiktok", h.username).some((k) => taken.has(normalizeHandle(k))))
      .slice(0, Math.max(0, opts.maxNew ?? Number.POSITIVE_INFINITY));
    if (fresh.length) {
      const nowIso = new Date().toISOString();
      const rows = fresh.map((h) => {
        const brand = detectBrand({ username: h.username, displayName: h.displayName });
        return {
          username: creatorKey("tiktok", h.username),
          platform: "tiktok",
          display_name: h.displayName || h.username,
          followers: h.followers,
          country_code: h.countryCode,
          niches: [] as string[],
          enrichment_status: "pending",
          scrape_priority: 3,
          next_scrape_at: nowIso,
          first_seen_at: nowIso,
          is_brand: brand.isBrand ? true : null,
          brand_reason: brand.reason,
        };
      });
      const { error } = await writeTolerant(
        (r) => admin.from("creators_index").upsert(r, { onConflict: "username", ignoreDuplicates: true }),
        rows,
        ["is_brand", "brand_reason"],
      );
      if (error) throw new Error(`creators_index: ${error.message}`);
      const jobs = rows.map((r) => ({ kind: "creator_refresh", platform: "tiktok", target: r.username, priority: 3 }));
      const { error: jobErr } = await admin.from("scrape_jobs").insert(jobs);
      if (jobErr) for (const job of jobs) await admin.from("scrape_jobs").insert(job);
      addedKeys = rows.map((r) => r.username);
    }
  }

  const following = nextMarketPage(t, page.hasMore, addedKeys.length, opts.maxPage ?? 100);
  const next = following ? marketTarget(following) : null;
  // One live job per target: a duplicate insert is refused, which is fine.
  if (next) await admin.from("scrape_jobs").insert({ kind: "creator_discover", platform: "tiktok", target: next, priority: t.country === "FR" ? 1 : 2 });

  return { found: page.creators.length, added: addedKeys.length, apiCalls: meter.calls - callsBefore, addedKeys, next };
}
