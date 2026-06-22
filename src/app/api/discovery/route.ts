import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveCreatorCountryCode } from "@/lib/creator-country";
import { normalizeDiscoveryFilters } from "@/lib/creator-discovery-filters";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.niche) return NextResponse.json({ creators: [] });

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

  let q = supabaseAdmin
    .from("creators_index")
    .select("*")
    .eq("platform", f.platform)
    .eq("enrichment_status", "enriched")
    .gte("followers", f.followers.gte)
    .lte("followers", f.followers.lte)
    .gte("engagement_rate", f.minEngagement)
    .gte("avg_views", f.minViews)
    .gte("authenticity_score", f.minAuthenticity);

  if (f.nicheTokens.length) {
    q = q.or(f.nicheTokens.map((w) => `niches.cs.{${w}}`).join(","));
  }
  if (f.language) q = q.eq("language", f.language);
  // Lenient country: the chosen country OR creators we haven't geolocated yet
  // (country_code is best-effort), so a market filter never zeroes out a filling DB.
  if (f.countryCode) q = q.or(`country_code.eq.${f.countryCode},country_code.is.null`);
  if (f.activeSince) q = q.gte("last_post_at", f.activeSince);
  if (f.hasEmail) q = q.not("email", "is", null);
  for (const s of f.excludeStatuses) q = q.neq("quality_status", s);
  for (const s of f.sort) q = q.order(s.column, { ascending: s.ascending });

  const { data, error } = await q.limit(30);
  if (error) return NextResponse.json({ creators: [], error: error.message });

  const creators = (data || []).map((c) => ({
    username: c.username,
    displayName: c.display_name,
    avatarUrl: c.avatar_url,
    followersCount: c.followers,
    engagementRate: Number(c.engagement_rate),
    engagementByFollower: Number(c.engagement_by_follower ?? 0),
    avgViews: c.avg_views,
    postFrequency: Number(c.post_frequency ?? 0),
    lastPostAt: c.last_post_at,
    authenticityScore: c.authenticity_score,
    qualityStatus: c.quality_status,
    platform: c.platform,
    bio: c.bio,
    email: c.email,
    niche: body.niche,
    primaryNiche: c.primary_niche,
    language: c.language,
    location: c.location,
    countryCode: c.country_code || resolveCreatorCountryCode(c.location, c.language),
    videoThumbnails: c.video_thumbnails || [],
  }));

  return NextResponse.json({ creators, source: "db", count: creators.length });
}
