import { NextResponse, type NextRequest } from "next/server";
import { enrichRapidApiCreator, searchRapidApiCreators } from "@/lib/rapidapi-creators";
import { EN_NICHE_QUERIES, NICHE_TREE } from "@/lib/niche-tree";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function targets() {
  return Object.keys(NICHE_TREE).flatMap((niche) => {
    const query = (EN_NICHE_QUERIES[niche] ?? [niche])[0] ?? niche;
    return [
      { niche, query, platform: "TikTok" as const },
      { niche, query, platform: "Instagram" as const },
    ];
  });
}

export async function POST(request: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  if (!process.env.RAPIDAPI_KEY) return NextResponse.json({ error: "Search API missing" }, { status: 500 });

  const probe = await admin.from("creators_index").select("username").limit(1);
  if (probe.error) return NextResponse.json({ error: probe.error.message, saved: 0 }, { status: 500 });

  const all = targets();
  const batch = Math.max(0, Number(request.nextUrl.searchParams.get("batch")) || 0);
  const target = all[batch];
  if (!target) return NextResponse.json({ ok: true, saved: 0, done: true, batches: all.length });

  const found = await searchRapidApiCreators(target.query, target.platform, 6);
  const rows = [];
  for (const creator of found) {
    try {
      const enriched = await enrichRapidApiCreator(creator);
    rows.push({
      username: enriched.platform === "Instagram" ? `ig_${enriched.username}` : enriched.username,
      display_name: enriched.displayName,
      avatar_url: enriched.avatarUrl,
      platform: enriched.platform,
      followers: enriched.followersCount,
      engagement_rate: enriched.engagementRate,
      avg_views: enriched.avgViews,
      bio: enriched.bio,
      niches: [target.niche, ...(enriched.niches ?? [])].filter((tag, index, list) => list.indexOf(tag) === index).slice(0, 4),
      primary_niche: Object.prototype.hasOwnProperty.call(NICHE_TREE, enriched.primaryNiche) ? enriched.primaryNiche : target.niche,
      is_curated: false,
      enrichment_status: "enriched",
      authenticity_score: 40,
      quality_status: "ok",
      video_thumbnails: enriched.videoThumbnails,
      country_code: enriched.countryCode,
      last_scraped_at: new Date().toISOString(),
    });
    } catch {
      continue;
    }
  }

  if (rows.length) {
    const { error } = await admin.from("creators_index").upsert(rows, { onConflict: "username" });
    if (error) return NextResponse.json({ error: error.message, saved: 0, batch }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    saved: rows.length,
    batch,
    niche: target.niche,
    platform: target.platform,
    withStats: rows.filter((row) => row.followers > 0).length,
    withVideos: rows.filter((row) => Array.isArray(row.video_thumbnails) && row.video_thumbnails.length > 0).length,
    next: batch + 1,
    batches: all.length,
  });
}
