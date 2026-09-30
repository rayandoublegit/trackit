import type { SupabaseClient } from "@supabase/supabase-js";
import {
  catalogRowToFeedCreator,
  CREATOR_GROWTH_COLUMNS,
  CREATOR_LIST_COLUMNS,
  CREATOR_VIDEO_STATS_COLUMNS,
  nicheTagsFor,
  type FeedCreator,
} from "@/lib/discovery-feed";
import { cleanSearch, countryOrClause, isMissingColumn, nicheClause } from "@/lib/catalog-query";
import { clientImageUrl, isStablePublicImageUrl } from "@/lib/client-image-url";
import { feedAvatarUrlForCreator } from "@/lib/feed-avatar-url";
import { isViralVideo } from "@/lib/viral";
import type { CreatorProfileData, HistoryPoint, LibraryVideo, VideoLibraryResult } from "@/lib/creator-intel-types";

// Reads for the creator profile page and the video library. Tracked data
// (creator_videos, creator_snapshots) when the scraper has run; otherwise the
// top videos stored on creators_index, so both pages work from day one.
//
// Video library filters (tracked videos, view creator_video_library):
//   views          creator_videos.views (min / max)
//   niche          the creator's niche tags, or the video's hashtags
//   published      posted_at: last N days and/or a from–to date range (UTC days)
//   format         video (any) | short | long (format, YouTube over 3 min) |
//                  photo (any image post) | carousel
//   length         duration_seconds (videos only): <15s, 15–60s, >60s
//   product        has_product_link or a stored product_url
//   viral          views >= max(100K, 5x the creator's median) — lib/viral.ts
//   country/lang   the creator's, same rule as the catalog
// Platform is compared without case ("TikTok" = "tiktok").

type Row = Record<string, unknown>;
type Level = 0 | 1 | 2;
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v: unknown) => (v == null ? "" : String(v));
const DAY = 86_400_000;
type Query = any;

const isMissingRelation = (message: string) => /relation .* does not exist|could not find the table|schema cache/i.test(message);

function coverFor(username: string, raw: string, index: number): string {
  if (!raw) return index < 3 ? `/api/creator-video-thumbs?username=${encodeURIComponent(username)}&i=${index}` : "";
  if (isStablePublicImageUrl(raw)) return raw;
  if (index < 3) return `/api/creator-video-thumbs?username=${encodeURIComponent(username)}&i=${index}`;
  return clientImageUrl(raw);
}

/** Only http(s) links are shown as product links. */
function safeUrl(raw: unknown): string | null {
  const s = str(raw).trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const hashtagsIn = (caption: string) => [...new Set([...caption.matchAll(/#([\p{L}\p{N}_]{2,60})/gu)].map((m) => m[1].toLowerCase()))].slice(0, 30);

type CreatorBits = { displayName: string; avatarUrl: string; followers: number; niche: string; countryCode: string | null; medianViews: number | null };

/** Median views for the viral rule: stored stats, else avg views measured on 3+ posts. */
function creatorMedian(c: FeedCreator): number | null {
  if (c.videoStats?.medianViews) return c.videoStats.medianViews;
  return (c.postsAnalyzed ?? 0) >= 3 && c.avgViews > 0 ? c.avgViews : null;
}

function bitsFromFeed(c: FeedCreator | undefined): CreatorBits | undefined {
  if (!c) return undefined;
  return {
    displayName: c.displayName,
    avatarUrl: c.avatarUrl,
    followers: c.followersCount,
    niche: c.primaryNiche,
    countryCode: c.countryCode,
    medianViews: c.videoStats ? c.videoStats.medianViews : null,
  };
}

function bitsFromViewRow(v: Row): CreatorBits {
  const username = str(v.username);
  return {
    displayName: str(v.display_name) || username,
    avatarUrl: feedAvatarUrlForCreator(username, str(v.avatar_url)),
    followers: n(v.followers),
    niche: str(v.primary_niche),
    countryCode: (v.country_code as string) ?? null,
    medianViews: v.creator_median_views == null ? null : n(v.creator_median_views),
  };
}

/** Stored format, else the same rule as migration 000046: YouTube over 3 min is long, other videos short. */
function videoFormat(v: Row, mediaType: LibraryVideo["mediaType"]): LibraryVideo["format"] {
  const stored = str(v.format);
  if (stored === "short" || stored === "long" || stored === "photo" || stored === "carousel") return stored;
  if (mediaType !== "video") return mediaType;
  return str(v.platform).toLowerCase() === "youtube" && n(v.duration_seconds) > 180 ? "long" : "short";
}

function trackedVideo(v: Row, c: CreatorBits | undefined, index: number): LibraryVideo {
  const username = str(v.username);
  const mediaType = (["video", "photo", "carousel"].includes(str(v.media_type)) ? v.media_type : "video") as LibraryVideo["mediaType"];
  const views = n(v.views);
  const productUrl = safeUrl(v.product_url);
  return {
    platform: str(v.platform).toLowerCase(),
    id: str(v.video_id),
    username,
    displayName: c?.displayName ?? username,
    avatarUrl: c?.avatarUrl ?? "",
    followers: c?.followers ?? 0,
    niche: c?.niche ?? "",
    countryCode: c?.countryCode ?? null,
    cover: isStablePublicImageUrl(str(v.cover_url)) ? str(v.cover_url) : coverFor(username, str(v.cover_url), index),
    shareUrl: str(v.share_url),
    caption: str(v.caption),
    hashtags: Array.isArray(v.hashtags) ? (v.hashtags as string[]) : [],
    mediaType,
    format: videoFormat(v, mediaType),
    durationSeconds: v.duration_seconds == null ? null : n(v.duration_seconds),
    postedAt: (v.posted_at as string) ?? null,
    views,
    likes: n(v.likes),
    comments: n(v.comments),
    shares: n(v.shares),
    saves: n(v.saves),
    viewsGained7d: v.views_gained_7d == null ? null : n(v.views_gained_7d),
    hasProductLink: Boolean(v.has_product_link) || Boolean(productUrl),
    productUrl,
    isViral: typeof v.is_viral === "boolean" ? v.is_viral : c?.medianViews ? isViralVideo(views, c.medianViews) : null,
  };
}

/** The top videos stored on a creators_index row (up to 9, with stats and dates), shaped like tracked videos. */
function snapshotVideos(row: Row, c: FeedCreator): LibraryVideo[] {
  const list = Array.isArray(row.top_videos) ? (row.top_videos as Row[]) : [];
  const median = creatorMedian(c);
  return list.map((t, i) => {
    const views = n(t.playCount);
    const created = n(t.createTime);
    const caption = str(t.desc);
    return {
      platform: c.platform.toLowerCase(),
      id: str(t.id) || `${c.username}-${i}`,
      username: c.username,
      displayName: c.displayName,
      avatarUrl: c.avatarUrl,
      followers: c.followersCount,
      niche: c.primaryNiche,
      countryCode: c.countryCode,
      cover: coverFor(c.username, str(t.cover), i),
      shareUrl: str(t.shareUrl),
      caption,
      hashtags: hashtagsIn(caption),
      mediaType: "video",
      format: "short",
      durationSeconds: null,
      postedAt: created > 0 ? new Date(created * 1000).toISOString() : null,
      views,
      likes: n(t.likeCount),
      comments: n(t.commentCount),
      shares: n(t.shareCount),
      saves: 0,
      viewsGained7d: null,
      hasProductLink: false,
      productUrl: null,
      isViral: median ? isViralVideo(views, median) : null,
    };
  });
}

function columnsFor(level: Level) {
  return [CREATOR_LIST_COLUMNS, level >= 1 ? CREATOR_GROWTH_COLUMNS : "", level >= 2 ? CREATOR_VIDEO_STATS_COLUMNS : ""].filter(Boolean).join(",");
}

/** creators_index rows with every column this database has (newest migrations first). */
async function creatorRows(
  build: (cols: string, level: Level) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<{ rows: Row[]; level: Level }> {
  for (const level of [2, 1, 0] as Level[]) {
    const res = await build(columnsFor(level), level);
    if (!res.error) return { rows: (res.data ?? []) as Row[], level };
    if (!isMissingColumn(res.error.message)) return { rows: [], level };
  }
  return { rows: [], level: 0 };
}

export async function readCreatorProfile(admin: SupabaseClient, rawUsername: string): Promise<CreatorProfileData | null> {
  const username = rawUsername.replace(/^@/, "").trim().toLowerCase();
  const { rows } = await creatorRows((cols) => admin.from("creators_index").select(cols).in("username", [username, `ig_${username}`, `yt_${username}`]).limit(1));
  const row = rows[0];
  if (!row) return null;
  const creator = catalogRowToFeedCreator(row);
  const platform = String(row.platform ?? "tiktok").toLowerCase();
  const stored = String(row.username);

  const [snap, vids] = await Promise.all([
    admin
      .from("creator_snapshots")
      .select("captured_on, followers, avg_views, engagement_rate")
      .ilike("platform", platform)
      .eq("username", stored)
      .order("captured_on", { ascending: true })
      .limit(400),
    admin
      .from("creator_videos")
      .select("*")
      .ilike("platform", platform)
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
  const bits = bitsFromFeed(creator);
  const videos = tracked.length ? tracked.map((v, i) => trackedVideo(v, bits, i)) : snapshotVideos(row, creator);

  const tagCounts = new Map<string, number>();
  for (const v of videos) for (const t of v.hashtags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const hashtags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([tag, count]) => ({ tag, count }));
  const durations = videos.map((v) => v.durationSeconds).filter((d): d is number => d != null && d > 0);
  const judged = videos.filter((v) => v.isViral != null);
  const mix = {
    videos: videos.filter((v) => v.mediaType === "video").length,
    photos: videos.filter((v) => v.mediaType !== "video").length,
    avgDurationSeconds: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    productLinkShare: tracked.length ? Math.round((videos.filter((v) => v.hasProductLink).length / videos.length) * 100) : null,
    viralVideos: creator.videoStats?.viralVideos ?? (judged.length ? judged.filter((v) => v.isViral).length : null),
  };

  // Similar: same niche and platform, comparable size.
  let similar: FeedCreator[] = [];
  if (creator.primaryNiche) {
    const f = Math.max(creator.followersCount, 1);
    const sim = await creatorRows((cols) =>
      admin
        .from("creators_index")
        .select(cols)
        .ilike("platform", platform)
        .ilike("primary_niche", creator.primaryNiche)
        .neq("username", stored)
        .gte("followers", Math.floor(f / 4))
        .lte("followers", Math.ceil(f * 4))
        .order("engagement_rate", { ascending: false, nullsFirst: false })
        .limit(8),
    );
    similar = sim.rows.map(catalogRowToFeedCreator);
  }

  return { creator, history, videos, similar, hashtags, mix, depth: tracked.length ? "tracked" : "snapshot" };
}

export type VideoMediaFilter = "video" | "short" | "long" | "photo" | "carousel";
export type VideoSort = "views" | "gained" | "recent" | "engagement";

export type VideoQuery = {
  q?: string;
  platform?: string;
  niche?: string;
  country?: string;
  language?: string;
  minViews?: number;
  maxViews?: number;
  postedWithinDays?: number;
  /** YYYY-MM-DD, inclusive (UTC). */
  postedFrom?: string;
  /** YYYY-MM-DD, inclusive (UTC). */
  postedTo?: string;
  /** "video" = short and long; "photo" = any image post (single photo or carousel). */
  mediaType?: VideoMediaFilter;
  hasProduct?: boolean;
  viral?: boolean;
  duration?: "short" | "medium" | "long";
  sort?: VideoSort;
  offset?: number;
  limit?: number;
};

function isoDay(raw: string | null): string | undefined {
  const v = (raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  return Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()) ? undefined : v;
}

/** Reads a VideoQuery from URL search params (the /api/videos contract). */
export function videoQueryFromParams(p: URLSearchParams): VideoQuery {
  const pick = <T extends string>(v: string | null, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : undefined);
  const pos = (v: string | null) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? x : undefined;
  };
  const text = cleanSearch(p.get("q") || "");
  return {
    q: text.length >= 2 ? text : undefined,
    platform: (p.get("platform") || "").trim().toLowerCase() || undefined,
    niche: p.get("niche") || undefined,
    country: (p.get("country") || "").trim().toUpperCase() || undefined,
    language: (p.get("language") || "").trim().toLowerCase() || undefined,
    minViews: pos(p.get("minViews")),
    maxViews: pos(p.get("maxViews")),
    postedWithinDays: pos(p.get("postedWithin")),
    postedFrom: isoDay(p.get("postedFrom")),
    postedTo: isoDay(p.get("postedTo")),
    mediaType: pick(p.get("mediaType"), ["video", "short", "long", "photo", "carousel"] as const),
    hasProduct: p.get("hasProduct") === "1" || p.get("hasProduct") === "true",
    viral: p.get("viral") === "1" || p.get("viral") === "true",
    duration: pick(p.get("duration"), ["short", "medium", "long"] as const),
    sort: pick(p.get("sort"), ["views", "gained", "recent", "engagement"] as const) ?? "views",
    offset: Math.max(0, Math.floor(Number(p.get("offset")) || 0)),
    limit: pos(p.get("limit")) ?? 48,
  };
}

/** Published-date window as ISO bounds: from (inclusive) and to (exclusive). */
export function postedBounds(q: Pick<VideoQuery, "postedWithinDays" | "postedFrom" | "postedTo">, now = Date.now()): { from?: string; to?: string } {
  const froms: number[] = [];
  if (q.postedWithinDays) froms.push(now - q.postedWithinDays * DAY);
  if (q.postedFrom) froms.push(new Date(`${q.postedFrom}T00:00:00Z`).getTime());
  const from = froms.length ? new Date(Math.max(...froms)).toISOString() : undefined;
  const to = q.postedTo ? new Date(new Date(`${q.postedTo}T00:00:00Z`).getTime() + DAY).toISOString() : undefined;
  return { from, to };
}

/** Niche clause on the video library view: the creator's tags or the video's hashtags. */
export function videoNicheClause(niche: string): string | null {
  let tags = nicheTagsFor(niche);
  if (!tags.length) {
    tags = [...new Set(niche.toLowerCase().split(/\s+/).filter((w) => w.length > 2).flatMap((w) => nicheTagsFor(w)))];
  }
  if (!tags.length) return null;
  const list = tags.join(",");
  return `niches.ov.{${list}},niche_key.in.(${list}),hashtags.ov.{${list}}`;
}

function combineOr(query: Query, groups: string[]): Query {
  if (groups.length === 1) return query.or(groups[0]);
  if (groups.length > 1) return query.or(`and(${groups.map((g) => `or(${g})`).join(",")})`);
  return query;
}

/** Filters that only tracked videos can answer (stored top videos carry no format, length or product). */
const needsTrackedData = (q: VideoQuery) => Boolean(q.mediaType || q.duration || q.hasProduct);

function orderVideos(query: Query, sort: VideoSort | undefined): Query {
  let out = query;
  // Videos without the sort value (no 7-day history yet, no date) go last, by views.
  if (sort === "gained") out = out.order("views_gained_7d", { ascending: false, nullsFirst: false });
  if (sort === "recent") out = out.order("posted_at", { ascending: false, nullsFirst: false });
  if (sort === "engagement") out = out.order("engagement_rate", { ascending: false, nullsFirst: false });
  // A unique last key keeps pages stable.
  return out.order("views", { ascending: false }).order("video_id", { ascending: true });
}

function applyVideoFilters(query: Query, q: VideoQuery, source: "view" | "table"): Query {
  let vq = query;
  if (q.platform) vq = vq.ilike("platform", q.platform);
  if (q.minViews) vq = vq.gte("views", q.minViews);
  if (q.maxViews) vq = vq.lte("views", q.maxViews);
  const { from, to } = postedBounds(q);
  if (from) vq = vq.gte("posted_at", from);
  if (to) vq = vq.lt("posted_at", to);
  if (q.mediaType === "video") vq = vq.eq("media_type", "video");
  if (q.mediaType === "photo") vq = vq.in("media_type", ["photo", "carousel"]);
  if (q.mediaType === "carousel") vq = vq.eq("media_type", "carousel");
  if (q.mediaType === "short" || q.mediaType === "long") {
    vq = vq.eq("media_type", "video");
    if (source === "view") vq = vq.eq("format", q.mediaType);
    else if (q.mediaType === "long") vq = vq.ilike("platform", "youtube").gt("duration_seconds", 180);
    else vq = vq.or("platform.not.ilike.youtube,duration_seconds.is.null,duration_seconds.lte.180");
  }
  if (q.duration) vq = vq.eq("media_type", "video");
  if (q.duration === "short") vq = vq.lt("duration_seconds", 15);
  if (q.duration === "medium") vq = vq.gte("duration_seconds", 15).lte("duration_seconds", 60);
  if (q.duration === "long") vq = vq.gt("duration_seconds", 60);
  if (q.hasProduct) vq = source === "view" ? vq.eq("has_product", true) : vq.eq("has_product_link", true);
  if (q.viral && source === "view") vq = vq.eq("is_viral", true);
  if (q.q) vq = vq.textSearch("caption", q.q, { type: "websearch", config: "simple" });
  if (source === "view") {
    if (q.language) vq = vq.ilike("language", q.language);
    const groups: string[] = [];
    if (q.country) {
      const or = countryOrClause(q.country);
      if (or) groups.push(or);
    }
    if (q.niche) {
      const or = videoNicheClause(q.niche);
      if (or) groups.push(or);
    }
    vq = combineOr(vq, groups);
  }
  return vq;
}

type Tracked = { videos: LibraryVideo[]; hasMore: boolean } | "missing" | "none";

/** Tracked videos through the library view (creator fields and viral flag included). */
async function trackedFromView(admin: SupabaseClient, q: VideoQuery, limit: number, offset: number): Promise<Tracked> {
  if (q.niche && !videoNicheClause(q.niche)) return "none";
  let vq = applyVideoFilters(admin.from("creator_video_library").select("*"), q, "view");
  vq = orderVideos(vq, q.sort).range(offset, offset + limit);
  const { data, error } = await vq;
  if (error) return isMissingRelation(error.message) || isMissingColumn(error.message) ? "missing" : "none";
  const rows = (data ?? []) as Row[];
  return {
    videos: rows.slice(0, limit).map((r, i) => trackedVideo(r, bitsFromViewRow(r), i + offset)),
    hasMore: rows.length > limit,
  };
}

/** Before migration 000047: creator_videos directly, creator filters through a list of usernames. */
async function trackedFromTable(admin: SupabaseClient, q: VideoQuery, limit: number, offset: number): Promise<Tracked> {
  // The viral flag needs the creator medians the migration adds.
  if (q.viral) return "none";
  let usernames: string[] | null = null;
  if (q.niche || q.country || q.language) {
    let cq: Query = admin.from("creators_index").select("username").limit(300);
    if (q.platform) cq = cq.ilike("platform", q.platform);
    if (q.language) cq = cq.ilike("language", q.language);
    const groups: string[] = [];
    if (q.country) {
      const or = countryOrClause(q.country);
      if (or) groups.push(or);
    }
    if (q.niche) {
      const or = nicheClause(q.niche);
      if (!or) return "none";
      groups.push(or);
    }
    cq = combineOr(cq, groups);
    const { data } = await cq;
    usernames = ((data ?? []) as Row[]).map((r) => String(r.username).toLowerCase());
    if (!usernames.length) return "none";
  }
  let vq: Query = admin.from("creator_videos").select("*");
  if (usernames) vq = vq.in("username", usernames);
  vq = orderVideos(applyVideoFilters(vq, q, "table"), q.sort).range(offset, offset + limit);
  const { data, error } = await vq;
  if (error) return "none";
  const rows = (data ?? []) as Row[];
  const names = [...new Set(rows.map((r) => String(r.username)))];
  const creators = names.length
    ? (await creatorRows((cols) => admin.from("creators_index").select(cols).in("username", names))).rows.map(catalogRowToFeedCreator)
    : [];
  const byName = new Map(creators.map((c) => [c.username.toLowerCase(), c]));
  return {
    videos: rows.slice(0, limit).map((r, i) => trackedVideo(r, bitsFromFeed(byName.get(String(r.username).toLowerCase())), i + offset)),
    hasMore: rows.length > limit,
  };
}

/** Stored top videos of creators that have no tracked videos yet, filtered like tracked ones. */
async function snapshotLibrary(admin: SupabaseClient, q: VideoQuery, limit: number): Promise<VideoLibraryResult> {
  const nicheOr = q.niche ? nicheClause(q.niche) : null;
  if (q.niche && !nicheOr) return { videos: [], hasMore: false, source: "snapshot" };
  const { rows } = await creatorRows((cols, level) => {
    let cq: Query = admin
      .from("creators_index")
      .select(cols)
      .not("top_videos", "is", null)
      .order("avg_views", { ascending: false, nullsFirst: false })
      .limit(120);
    // Creators with tracked videos were already searched above.
    if (level >= 2) cq = cq.eq("videos_tracked", 0);
    if (q.platform) cq = cq.ilike("platform", q.platform);
    if (q.language) cq = cq.ilike("language", q.language);
    const groups: string[] = [];
    if (q.country) {
      const or = countryOrClause(q.country);
      if (or) groups.push(or);
    }
    if (nicheOr) groups.push(nicheOr);
    return combineOr(cq, groups);
  });
  const { from, to } = postedBounds(q);
  const words = (q.q || "").toLowerCase().split(/\s+/).filter(Boolean);
  let videos = rows.flatMap((row) => snapshotVideos(row, catalogRowToFeedCreator(row)));
  videos = videos.filter((v) => {
    if (q.minViews && v.views < q.minViews) return false;
    if (q.maxViews && v.views > q.maxViews) return false;
    if ((from || to) && !v.postedAt) return false;
    if (from && v.postedAt! < from) return false;
    if (to && v.postedAt! >= to) return false;
    if (q.viral && v.isViral !== true) return false;
    if (words.length) {
      const text = v.caption.toLowerCase();
      if (!words.every((w) => text.includes(w))) return false;
    }
    return true;
  });
  const er = (v: LibraryVideo) => (v.views > 0 ? (v.likes + v.comments + v.shares) / v.views : 0);
  if (q.sort === "recent") videos.sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
  else if (q.sort === "engagement") videos.sort((a, b) => er(b) - er(a) || b.views - a.views);
  else videos.sort((a, b) => b.views - a.views);
  return { videos: videos.slice(0, limit), hasMore: false, source: "snapshot" };
}

export async function readVideoLibrary(admin: SupabaseClient, q: VideoQuery): Promise<VideoLibraryResult> {
  const limit = Math.min(Math.max(q.limit ?? 48, 1), 96);
  const offset = Math.max(q.offset ?? 0, 0);

  let tracked = await trackedFromView(admin, q, limit, offset);
  if (tracked === "missing") tracked = await trackedFromTable(admin, q, limit, offset);
  if (tracked !== "none" && tracked !== "missing" && (tracked.videos.length || offset > 0)) {
    return { videos: tracked.videos, hasMore: tracked.hasMore, source: "tracked" };
  }
  if (offset > 0) return { videos: [], hasMore: false, source: "tracked" };

  // No tracked video matches. Fall back to the stored top videos, unless a
  // filter needs data those don't carry (format, length, product link).
  if (needsTrackedData(q)) return { videos: [], hasMore: false, source: "tracked", needsTracking: true };
  return snapshotLibrary(admin, q, limit);
}
