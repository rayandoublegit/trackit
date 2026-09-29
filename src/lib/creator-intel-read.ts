import type { SupabaseClient } from "@supabase/supabase-js";
import { catalogRowToFeedCreator, CREATOR_GROWTH_COLUMNS, CREATOR_LIST_COLUMNS, type FeedCreator } from "@/lib/discovery-feed";
import { clientImageUrl, isStablePublicImageUrl } from "@/lib/client-image-url";
import type { CreatorProfileData, HistoryPoint, LibraryVideo, VideoLibraryResult } from "@/lib/creator-intel-types";

// Reads for the creator profile page and the video library. Tracked data
// (creator_videos, creator_snapshots) when the scraper has run; otherwise the
// top videos stored on creators_index, so both pages work from day one.

type Row = Record<string, unknown>;
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function coverFor(username: string, raw: string, index: number): string {
  if (!raw) return index < 3 ? `/api/creator-video-thumbs?username=${encodeURIComponent(username)}&i=${index}` : "";
  if (isStablePublicImageUrl(raw)) return raw;
  if (index < 3) return `/api/creator-video-thumbs?username=${encodeURIComponent(username)}&i=${index}`;
  return clientImageUrl(raw);
}

function trackedVideo(v: Row, c: FeedCreator | undefined, index: number): LibraryVideo {
  const username = String(v.username);
  return {
    platform: String(v.platform),
    id: String(v.video_id),
    username,
    displayName: c?.displayName ?? username,
    avatarUrl: c?.avatarUrl ?? "",
    followers: c?.followersCount ?? 0,
    niche: c?.primaryNiche ?? "",
    countryCode: c?.countryCode ?? null,
    cover: isStablePublicImageUrl(String(v.cover_url ?? "")) ? String(v.cover_url) : coverFor(username, String(v.cover_url ?? ""), index),
    shareUrl: String(v.share_url ?? ""),
    caption: String(v.caption ?? ""),
    hashtags: Array.isArray(v.hashtags) ? (v.hashtags as string[]) : [],
    mediaType: (["video", "photo", "carousel"].includes(String(v.media_type)) ? v.media_type : "video") as LibraryVideo["mediaType"],
    durationSeconds: v.duration_seconds == null ? null : n(v.duration_seconds),
    postedAt: (v.posted_at as string) ?? null,
    views: n(v.views),
    likes: n(v.likes),
    comments: n(v.comments),
    shares: n(v.shares),
    saves: n(v.saves),
    viewsGained7d: v.views_gained_7d == null ? null : n(v.views_gained_7d),
    hasProductLink: Boolean(v.has_product_link),
  };
}

/** The stored top videos of a creator, shaped like tracked videos. */
function snapshotVideos(c: FeedCreator): LibraryVideo[] {
  return (c.topVideos ?? []).map((t, i) => ({
    platform: c.platform.toLowerCase(),
    id: t.id || `${c.username}-${i}`,
    username: c.username,
    displayName: c.displayName,
    avatarUrl: c.avatarUrl,
    followers: c.followersCount,
    niche: c.primaryNiche,
    countryCode: c.countryCode,
    cover: coverFor(c.username, t.cover, i),
    shareUrl: t.shareUrl,
    caption: "",
    hashtags: [],
    mediaType: "video",
    durationSeconds: null,
    postedAt: null,
    views: t.playCount,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    viewsGained7d: null,
    hasProductLink: false,
  }));
}

async function creatorRows(admin: SupabaseClient, build: (cols: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
  const full = await build(`${CREATOR_LIST_COLUMNS},${CREATOR_GROWTH_COLUMNS}`);
  if (!full.error) return (full.data ?? []) as Row[];
  const base = await build(CREATOR_LIST_COLUMNS);
  return (base.data ?? []) as Row[];
}

export async function readCreatorProfile(admin: SupabaseClient, rawUsername: string): Promise<CreatorProfileData | null> {
  const username = rawUsername.replace(/^@/, "").trim().toLowerCase();
  const rows = await creatorRows(admin, (cols) =>
    admin.from("creators_index").select(cols).in("username", [username, `ig_${username}`]).limit(1),
  );
  const row = rows[0];
  if (!row) return null;
  const creator = catalogRowToFeedCreator(row);
  const platform = String(row.platform ?? "tiktok").toLowerCase();
  const stored = String(row.username);

  const [snap, vids] = await Promise.all([
    admin
      .from("creator_snapshots")
      .select("captured_on, followers, avg_views, engagement_rate")
      .eq("platform", platform)
      .eq("username", stored)
      .order("captured_on", { ascending: true })
      .limit(400),
    admin
      .from("creator_videos")
      .select("*")
      .eq("platform", platform)
      .eq("username", stored)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(60),
  ]);
  const history: HistoryPoint[] = (snap.error ? [] : (snap.data ?? [])).map((s: Row) => ({
    day: String(s.captured_on),
    followers: s.followers == null ? null : n(s.followers),
    avgViews: s.avg_views == null ? null : n(s.avg_views),
    engagement: s.engagement_rate == null ? null : n(s.engagement_rate),
  }));
  const tracked = vids.error ? [] : ((vids.data ?? []) as Row[]);
  const videos = tracked.length ? tracked.map((v, i) => trackedVideo(v, creator, i)) : snapshotVideos(creator);

  const tagCounts = new Map<string, number>();
  for (const v of videos) for (const t of v.hashtags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const hashtags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([tag, count]) => ({ tag, count }));
  const durations = videos.map((v) => v.durationSeconds).filter((d): d is number => d != null && d > 0);
  const mix = {
    videos: videos.filter((v) => v.mediaType === "video").length,
    photos: videos.filter((v) => v.mediaType !== "video").length,
    avgDurationSeconds: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    productLinkShare: tracked.length ? Math.round((videos.filter((v) => v.hasProductLink).length / videos.length) * 100) : null,
  };

  // Similar: same niche, comparable size.
  let similar: FeedCreator[] = [];
  if (creator.primaryNiche) {
    const f = Math.max(creator.followersCount, 1);
    const sim = await creatorRows(admin, (cols) =>
      admin
        .from("creators_index")
        .select(cols)
        .eq("primary_niche", creator.primaryNiche)
        .neq("username", stored)
        .gte("followers", Math.floor(f / 4))
        .lte("followers", Math.ceil(f * 4))
        .order("engagement_rate", { ascending: false, nullsFirst: false })
        .limit(8),
    );
    similar = sim.map(catalogRowToFeedCreator);
  }

  return { creator, history, videos, similar, hashtags, mix, depth: tracked.length ? "tracked" : "snapshot" };
}

export type VideoQuery = {
  q?: string;
  platform?: string;
  niche?: string;
  country?: string;
  language?: string;
  minViews?: number;
  postedWithinDays?: number;
  mediaType?: "video" | "photo";
  hasProduct?: boolean;
  duration?: "short" | "medium" | "long";
  sort?: "views" | "gained" | "recent" | "engagement";
  offset?: number;
  limit?: number;
};

export async function readVideoLibrary(admin: SupabaseClient, q: VideoQuery): Promise<VideoLibraryResult> {
  const limit = Math.min(Math.max(q.limit ?? 48, 1), 96);
  const offset = Math.max(q.offset ?? 0, 0);

  // Creator-level filters first (niche, country, language) → usernames.
  let usernames: string[] | null = null;
  if (q.niche || q.country || q.language) {
    let cq = admin.from("creators_index").select("username").limit(3000);
    if (q.niche) cq = cq.or(`primary_niche.ilike.${q.niche},niches.cs.{${q.niche}}`);
    if (q.country) cq = cq.eq("country_code", q.country);
    if (q.language) cq = cq.eq("language", q.language);
    const { data } = await cq;
    usernames = (data ?? []).map((r: Row) => String(r.username));
    if (!usernames.length) return { videos: [], hasMore: false, source: "tracked" };
  }

  let vq = admin.from("creator_videos").select("*");
  if (q.platform) vq = vq.eq("platform", q.platform.toLowerCase());
  if (usernames) vq = vq.in("username", usernames.slice(0, 1000));
  if (q.minViews) vq = vq.gte("views", q.minViews);
  if (q.postedWithinDays) vq = vq.gte("posted_at", new Date(Date.now() - q.postedWithinDays * 86_400_000).toISOString());
  if (q.mediaType === "video") vq = vq.eq("media_type", "video");
  if (q.mediaType === "photo") vq = vq.neq("media_type", "video");
  if (q.hasProduct) vq = vq.eq("has_product_link", true);
  if (q.duration === "short") vq = vq.lt("duration_seconds", 15);
  if (q.duration === "medium") vq = vq.gte("duration_seconds", 15).lte("duration_seconds", 60);
  if (q.duration === "long") vq = vq.gt("duration_seconds", 60);
  if (q.q && q.q.trim().length >= 2) vq = vq.textSearch("caption", q.q.trim(), { type: "websearch", config: "simple" });
  const order = q.sort === "gained" ? "views_gained_7d" : q.sort === "recent" ? "posted_at" : q.sort === "engagement" ? "engagement_rate" : "views";
  vq = vq.order(order, { ascending: false, nullsFirst: false }).range(offset, offset + limit);

  const { data, error } = await vq;
  const rows = error ? [] : ((data ?? []) as Row[]);

  if (rows.length || (!error && offset > 0)) {
    const names = [...new Set(rows.map((r) => String(r.username)))];
    const creators = names.length
      ? (await creatorRows(admin, (cols) => admin.from("creators_index").select(cols).in("username", names))).map(catalogRowToFeedCreator)
      : [];
    const byName = new Map(creators.map((c) => [c.username.toLowerCase(), c]));
    return {
      videos: rows.slice(0, limit).map((r, i) => trackedVideo(r, byName.get(String(r.username).toLowerCase()), i + offset)),
      hasMore: rows.length > limit,
      source: "tracked",
    };
  }

  // Nothing tracked yet: flatten the stored top videos of matching creators.
  if (offset > 0) return { videos: [], hasMore: false, source: "snapshot" };
  let cq = admin
    .from("creators_index")
    .select(CREATOR_LIST_COLUMNS)
    .not("top_videos", "is", null)
    .order("avg_views", { ascending: false, nullsFirst: false })
    .limit(80);
  if (usernames) cq = cq.in("username", usernames.slice(0, 1000));
  if (q.platform) cq = cq.ilike("platform", q.platform);
  const { data: creatorsData } = await cq;
  let videos = ((creatorsData ?? []) as unknown as Row[]).map(catalogRowToFeedCreator).flatMap(snapshotVideos);
  if (q.minViews) videos = videos.filter((v) => v.views >= q.minViews!);
  videos.sort((a, b) => b.views - a.views);
  return { videos: videos.slice(0, limit), hasMore: false, source: "snapshot" };
}
