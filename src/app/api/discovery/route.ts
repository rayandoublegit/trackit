import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveCreatorCountryCode } from "@/lib/creator-country";
import { normalizeDiscoveryFilters } from "@/lib/creator-discovery-filters";
import { liveSearchAndEnrich } from "@/lib/discovery-live";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Lazy so the route doesn't crash at import when Supabase env is absent (e.g.
// local dev preview). Real deployments always have these set.
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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

  const hasDb = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL
  );

  // 1) DB-first: enriched creators already in creators_index (fast + free).
  if (hasDb) {
    const supabaseAdmin = getSupabaseAdmin();

    // Shared mapper so curated + scraped rows render identically.
    const mapRow = (c: any) => ({
      username: c.username,
      displayName: c.display_name,
      avatarUrl: c.avatar_url,
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
      niche: body.niche,
      primaryNiche: c.primary_niche,
      language: c.language,
      location: c.location,
      countryCode: c.country_code || resolveCreatorCountryCode(c.location, c.language),
      videoThumbnails: c.video_thumbnails || [],
      curated: Array.isArray(c.niches) && c.niches.includes("curated"),
    });

    // 1a) Curated picks first (hand-added). They may still be "pending" and
    // platform casing can differ ("TikTok" vs "tiktok"), so we don't apply the
    // enriched/platform/metric gates to them. Language is still respected.
    let cq = supabaseAdmin
      .from("creators_index")
      .select("*")
      .contains("niches", ["curated"])
      .gte("followers", f.followers.gte)
      .lte("followers", f.followers.lte);
    if (f.language) cq = cq.eq("language", f.language);
    const { data: curatedData } = await cq
      .order("followers", { ascending: false })
      .limit(100);

    // 1b) Scraped + enriched creators (existing behavior).
    let q = supabaseAdmin
      .from("creators_index")
      .select("*")
      .eq("platform", (f.platform || "").toLowerCase())
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
    if (f.countryCode) q = q.or(`country_code.eq.${f.countryCode},country_code.is.null`);
    if (f.activeSince) q = q.gte("last_post_at", f.activeSince);
    if (f.hasEmail) q = q.not("email", "is", null);
    for (const s of f.excludeStatuses) q = q.neq("quality_status", s);
    for (const s of f.sort) q = q.order(s.column, { ascending: s.ascending });

    const { data, error } = await q.limit(100);

    // Merge: curated first, then scraped, dedup by username, cap at 30.
    const curatedRows = (curatedData ?? []).map(mapRow);
    const scrapedRows = (!error && data ? data : []).map(mapRow);
    // 50/50 mix: aim for 15 curated + 15 scraped. If one side is short, fill
    // the remaining slots from the other so we always return up to 30.
    const CAP = 30, HALF = 15;
    const seen = new Set<string>();
    const dedup = (rows: any[]) => rows.filter((r) => {
      const k = (r.username || "").toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    // Fisher-Yates shuffle so each refresh surfaces a fresh random sample
    // from the quality pool (good creators, different order every time).
    const shuffle = (arr: any[]) => {
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
    // Top up if still under cap (e.g. curated had > 15 and scraped ran out).
    if (merged.length < CAP) {
      for (const r of [...curatedU, ...scrapedU]) {
        if (merged.length >= CAP) break;
        if (!merged.includes(r)) merged.push(r);
      }
    }

    if (merged.length > 0) {
      return NextResponse.json({ creators: merged, source: "db", count: merged.length });
    }
    // DB empty for this niche -> fall through to live on-demand (cold niche).
  }

  // 2) Live on-demand: real ScrapeCreators search + enrichment. Used locally
  //    (no DB) or for cold niches. In-memory cached to limit credit spend.
  if (process.env.SCRAPECREATORS_API_KEY) {
    try {
      const creators = await liveSearchAndEnrich(body.niche, f);
      return NextResponse.json({ creators, source: "live", count: creators.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "live search failed";
      return NextResponse.json({ creators: [], error: msg });
    }
  }

  // No DB match and no live source configured -> empty result.
  return NextResponse.json({ creators: [], count: 0 });
}
