import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEnrichmentRow, type TopVideo } from "@/lib/creator-enrichment";
import type { VideoStat } from "@/lib/creator-metrics";
import type { RichVideo } from "@/lib/scrapecreators";
import { fetchRemoteImage } from "@/lib/fetch-remote-image";
import { isStablePublicImageUrl } from "@/lib/client-image-url";
import { storeVideoCoverBuffer } from "@/lib/tiktok-video-thumbs";
import { storeTikTokAvatar } from "@/lib/tiktok-avatar";
import { classifyNiche } from "@/lib/rapidapi-creators";
import { buildSeedTargets } from "@/lib/niche-tree";
import { creatorKey, handleFromKey, knownKeys, normalizeHandle, normalizePlatform } from "./identity";
import { nextScrapeAt, retryAfterFailure, scrapePriority } from "./schedule";
import { CallMeter, type CreatorSource, type ScrapedVideo } from "./types";

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
  const first = await write(rows);
  if (!first.error) return first;
  const missing = optional.filter((c) => first.error!.message.includes(c));
  if (!missing.length) return first;
  return write(rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !missing.includes(k)))));
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
    .select("username, platform, avatar_url, primary_niche, niches, first_seen_at")
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

  // Niche from bio + captions when the creator has none yet (keyword rules, no AI call).
  const nicheMerge: Record<string, unknown> = {};
  if (!existing?.primary_niche) {
    const classified = classifyNiche([profile.bio, ...videos.map((v) => v.caption)].join("\n"), "lifestyle");
    nicheMerge.primary_niche = classified.primaryNiche;
    nicheMerge.niches = Array.from(new Set([...((existing?.niches as string[]) ?? []), ...classified.niches]));
  }

  const upsert = {
    ...row,
    ...nicheMerge,
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
  const { error: upErr } = await writeTolerant((r) => admin.from("creators_index").upsert(r, { onConflict: "username" }), [upsert], ["scrape_status"]);
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
  const rows = fresh.map((h) => ({
    username: creatorKey(platform, h.username),
    platform,
    display_name: h.displayName || h.username,
    followers: h.followers,
    niches,
    enrichment_status: "pending",
    scrape_priority: 3,
    next_scrape_at: nowIso,
    first_seen_at: nowIso,
  }));
  const { error } = await admin.from("creators_index").upsert(rows, { onConflict: "username", ignoreDuplicates: true });
  if (error) throw new Error(`creators_index: ${error.message}`);

  // Their first refresh is queued now (one live job per creator).
  const jobs = rows.map((r) => ({ kind: "creator_refresh", platform, target: r.username, priority: 3 }));
  const { error: jobErr } = await admin.from("scrape_jobs").insert(jobs);
  if (jobErr) for (const job of jobs) await admin.from("scrape_jobs").insert(job);

  return { found: hits.length, added: rows.length, apiCalls: calls(), addedKeys: rows.map((r) => r.username) };
}
