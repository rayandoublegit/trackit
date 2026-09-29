import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEnrichmentRow, type TopVideo } from "@/lib/creator-enrichment";
import type { VideoStat } from "@/lib/creator-metrics";
import type { RichVideo } from "@/lib/scrapecreators";
import { fetchRemoteImage } from "@/lib/fetch-remote-image";
import { isStablePublicImageUrl } from "@/lib/client-image-url";
import { storeVideoCoverBuffer } from "@/lib/tiktok-video-thumbs";
import { storeTikTokAvatar } from "@/lib/tiktok-avatar";
import { classifyNiche } from "@/lib/rapidapi-creators";
import { nextScrapeAt, retryAfterFailure, scrapePriority } from "./schedule";
import type { CreatorSource, ScrapedVideo } from "./types";

// One refresh of one creator: fetch profile + latest videos (2 API calls),
// store what expires (covers, avatar), write today's snapshots, update the
// current-state row, then recompute growth and the next refresh date.

export type IngestResult = {
  username: string;
  isNew: boolean;
  apiCalls: number;
  videos: number;
  coversStored: number;
};

export class CreatorNotFound extends Error {}

const VIDEOS_PER_REFRESH = 30;
const NEW_COVERS_PER_REFRESH = 9;

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
  username: string,
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
    const url = await storeVideoCoverBuffer(admin, buf, img.contentType, username, v.id);
    if (url) {
      covers.set(v.id, url);
      stored += 1;
    }
  }
  return { covers, stored };
}

export async function refreshCreator(admin: SupabaseClient, source: CreatorSource, rawUsername: string): Promise<IngestResult> {
  const platform = source.platform;
  const username = rawUsername.replace(/^@/, "").trim().toLowerCase();
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);

  const profile = await source.profile(username);
  if (!profile || !profile.username) throw new CreatorNotFound(`${platform}:${username} not found`);
  const videos = await source.videos(username, VIDEOS_PER_REFRESH);

  const { data: existing } = await admin
    .from("creators_index")
    .select("username, avatar_url, primary_niche, niches, first_seen_at")
    .eq("username", username)
    .maybeSingle();

  const { covers, stored } = await storedCovers(admin, platform, username, videos);
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
    username,
    { followers: profile.followers, verified: profile.verified, bio: profile.bio, displayName: profile.displayName, videoCount: profile.videoCount ?? 0 },
    stats,
    now,
    videos.map((v) => toRich(v, coverOf(v))),
  );
  const topWithStableCovers: TopVideo[] = row.top_videos;

  let avatarUrl = String(existing?.avatar_url ?? "");
  if (profile.avatarUrl && !isStablePublicImageUrl(avatarUrl)) {
    avatarUrl = (await storeTikTokAvatar(admin, profile.avatarUrl, username)) || profile.avatarUrl;
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
    platform,
    top_videos: topWithStableCovers,
    avatar_url: avatarUrl || null,
    following: profile.following,
    total_likes: profile.totalLikes,
    video_count: profile.videoCount,
    is_verified: profile.verified,
    bio_link: profile.bioLink,
    last_scraped_at: new Date(now).toISOString(),
    scrape_failures: 0,
    ...(existing ? {} : { first_seen_at: new Date(now).toISOString() }),
  };
  const { error: upErr } = await admin.from("creators_index").upsert(upsert, { onConflict: "username" });
  if (upErr) throw new Error(`creators_index: ${upErr.message}`);

  // History.
  await admin.from("creator_snapshots").upsert(
    {
      platform,
      username,
      captured_on: today,
      captured_at: new Date(now).toISOString(),
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
    const nowIso = new Date(now).toISOString();
    await admin.from("creator_videos").upsert(
      videos.map((v) => ({
        platform,
        video_id: v.id,
        username,
        posted_at: v.postedAt,
        caption: v.caption.slice(0, 2200),
        hashtags: v.hashtags,
        duration_seconds: v.durationSeconds,
        media_type: v.mediaType,
        cover_url: coverOf(v) || null,
        share_url: v.shareUrl,
        music_title: v.musicTitle,
        is_ad: v.isAd,
        has_product_link: v.hasProductLink,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        shares: v.shares,
        saves: v.saves,
        engagement_rate: v.views > 0 ? Math.round(((v.likes + v.comments + v.shares) / v.views) * 10_000) / 100 : null,
        last_scraped_at: nowIso,
      })),
      { onConflict: "platform,video_id" },
    );
    await admin.from("creator_video_snapshots").upsert(
      videos.map((v) => ({ platform, video_id: v.id, captured_on: today, views: v.views, likes: v.likes, comments: v.comments, shares: v.shares })),
      { onConflict: "platform,video_id,captured_on" },
    );
  }

  // Growth, 30-day views and rank, then when to come back.
  await admin.rpc("refresh_creator_rollup", { p_platform: platform, p_username: username });
  const { data: rolled } = await admin
    .from("creators_index")
    .select("followers, followers_growth_pct_7d, growth_score, last_post_at")
    .eq("username", username)
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
  await admin
    .from("creators_index")
    .update({ scrape_priority: priority, next_scrape_at: nextScrapeAt(priority, now) })
    .eq("username", username);

  return { username, isNew: !existing, apiCalls: 2, videos: videos.length, coversStored: stored };
}

/** Marks a failed refresh: count it and push the next try back. */
export async function recordCreatorFailure(admin: SupabaseClient, username: string): Promise<void> {
  const { data } = await admin.from("creators_index").select("scrape_failures").eq("username", username).maybeSingle();
  const failures = Number(data?.scrape_failures ?? 0) + 1;
  await admin
    .from("creators_index")
    .update({ scrape_failures: failures, next_scrape_at: retryAfterFailure(failures) })
    .eq("username", username);
}

/**
 * Discovery: search a keyword and add the creators we don't know yet as light
 * rows due for a refresh right away; the next refresh pass fills them in.
 */
export async function discoverKeyword(
  admin: SupabaseClient,
  source: CreatorSource,
  keyword: string,
  opts: { count?: number; minFollowers?: number } = {},
): Promise<{ found: number; added: number; apiCalls: number }> {
  const hits = (await source.search(keyword, opts.count ?? 30)).filter((h) => h.followers >= (opts.minFollowers ?? 5_000));
  if (!hits.length) return { found: 0, added: 0, apiCalls: 1 };
  const { data: known } = await admin.from("creators_index").select("username").in("username", hits.map((h) => h.username));
  const knownSet = new Set((known ?? []).map((k) => String(k.username).toLowerCase()));
  const fresh = hits.filter((h) => !knownSet.has(h.username));
  if (fresh.length) {
    await admin.from("creators_index").upsert(
      fresh.map((h) => ({
        username: h.username,
        platform: source.platform,
        display_name: h.displayName,
        followers: h.followers,
        niches: [keyword.toLowerCase()],
        enrichment_status: "pending",
        scrape_priority: 3,
        next_scrape_at: new Date().toISOString(),
        first_seen_at: new Date().toISOString(),
      })),
      { onConflict: "username", ignoreDuplicates: true },
    );
    // Their refresh is due now: enqueue_due_creators picks them up on the next pass.
  }
  return { found: hits.length, added: fresh.length, apiCalls: 1 };
}
