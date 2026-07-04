import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveCreatorCountryCode } from "@/lib/creator-country";
import { normalizeDiscoveryFilters } from "@/lib/creator-discovery-filters";
import { CREATOR_LIST_COLUMNS, creatorMatchesNicheFilter, nicheOrClause } from "@/lib/discovery-feed";
import { feedAvatarUrlForCreator } from "@/lib/feed-avatar-url";
import { displayVideoThumbnails } from "@/lib/tiktok-video-thumbs";
import { clientImageUrl } from "@/lib/client-image-url";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.niche) return NextResponse.json({ creators: [], count: 0 });

  const f = normalizeDiscoveryFilters({
    niche: body.niche,
    platform: body.platform,
    minFollowers: body.minFollowers,
    maxFollowers: body.maxFollowers,
    minEngagement: body.minEngagement,
    minViews: body.minViews,
    language: body.language,
    countryCode: body.location,
    activeWithinDays: body.activeWithinDays,
    includeLowQuality: body.includeLowQuality,
    hasEmail: body.hasEmail,
  });

  const hasDb = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL
  );

  if (!hasDb) {
    return NextResponse.json({ creators: [], count: 0, source: "db" });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const nicheOr = body.niche ? nicheOrClause(String(body.niche)) : null;

  const mapRow = (c: Record<string, unknown>) => ({
    username: c.username,
    displayName: c.display_name,
    avatarUrl: feedAvatarUrlForCreator(String(c.username), String(c.avatar_url ?? "")),
    followersCount: c.followers,
    engagementRate: Number(c.engagement_rate ?? 0),
    engagementByFollower: Number(c.engagement_by_follower ?? 0),
    avgViews: c.avg_views ?? 0,
    postFrequency: Number(c.post_frequency ?? 0),
    lastPostAt: c.last_post_at,
    authenticityScore: c.authenticity_score ?? null,
    qualityStatus: c.quality_status,
    platform: c.platform,
    bio: c.bio,
    email: c.email,
    niche: String(c.primary_niche ?? ""),
    primaryNiche: String(c.primary_niche ?? ""),
    niches: Array.isArray(c.niches) ? c.niches.map(String) : [],
    language: c.language,
    location: c.location,
    countryCode: c.country_code || resolveCreatorCountryCode(
      typeof c.location === "string" ? c.location : null,
      typeof c.language === "string" ? c.language : null
    ),
    videoThumbnails: displayVideoThumbnails(
      Array.isArray(c.video_thumbnails) ? c.video_thumbnails : [],
      Array.isArray(c.top_videos) ? c.top_videos : [],
      3
    ).map((t) => ({
      views: t.views,
      thumbnail: clientImageUrl(t.thumbnail) || null,
      url: t.url,
    })),
    curated:
      (Array.isArray(c.niches) && c.niches.includes("curated")) ||
      (Array.isArray(c.video_thumbnails) && c.video_thumbnails.length > 0),
  });

  // Curated + enriched in parallel (DB only — no live ScrapeCreators).
  let curatedQ = supabaseAdmin
    .from("creators_index")
    .select(CREATOR_LIST_COLUMNS)
    .eq("is_curated", true)
    .order("followers", { ascending: false })
    .limit(40);
  if (f.language) curatedQ = curatedQ.eq("language", f.language);
  if (nicheOr) curatedQ = curatedQ.or(nicheOr);

  let scrapedQ = supabaseAdmin
    .from("creators_index")
    .select(CREATOR_LIST_COLUMNS)
    .ilike("platform", f.platform || "TikTok")
    .eq("enrichment_status", "enriched")
    .gte("followers", f.followers.gte)
    .lte("followers", f.followers.lte)
    .gte("engagement_rate", f.minEngagement)
    .gte("avg_views", f.minViews)
    .gte("authenticity_score", f.minAuthenticity)
    .limit(40);
  if (nicheOr) scrapedQ = scrapedQ.or(nicheOr);
  if (f.language) scrapedQ = scrapedQ.eq("language", f.language);
  if (f.countryCode) scrapedQ = scrapedQ.or(`country_code.eq.${f.countryCode},country_code.is.null`);
  if (f.activeSince) scrapedQ = scrapedQ.gte("last_post_at", f.activeSince);
  if (f.hasEmail) scrapedQ = scrapedQ.not("email", "is", null);
  for (const s of f.excludeStatuses) scrapedQ = scrapedQ.neq("quality_status", s);
  for (const s of f.sort) scrapedQ = scrapedQ.order(s.column, { ascending: s.ascending });

  const [curatedRes, scrapedRes] = await Promise.all([curatedQ, scrapedQ]);

  const nicheLabel = String(body.niche);
  const curatedRows = ((curatedRes.data ?? []) as unknown as Record<string, unknown>[])
    .map(mapRow)
    .filter((r) => creatorMatchesNicheFilter(r, nicheLabel));
  const scrapedRows = ((scrapedRes.data ?? []) as unknown as Record<string, unknown>[])
    .map(mapRow)
    .filter((r) => creatorMatchesNicheFilter(r, nicheLabel));

  const CAP = 30;
  const HALF = 15;
  const seen = new Set<string>();
  const dedup = (rows: ReturnType<typeof mapRow>[]) =>
    rows.filter((r) => {
      const k = String(r.username || "").toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const curatedU = shuffle(dedup(curatedRows));
  const scrapedU = shuffle(dedup(scrapedRows));
  const merged = [
    ...curatedU.slice(0, HALF),
    ...scrapedU.slice(0, CAP - Math.min(curatedU.length, HALF)),
  ].slice(0, CAP);

  if (merged.length < CAP) {
    for (const r of [...curatedU, ...scrapedU]) {
      if (merged.length >= CAP) break;
      if (!merged.includes(r)) merged.push(r);
    }
  }

  return NextResponse.json({ creators: merged, source: "db", count: merged.length });
}
