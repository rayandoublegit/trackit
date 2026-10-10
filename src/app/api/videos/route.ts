import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { readVideoLibrary, videoQueryFromParams } from "@/lib/creator-intel-read";
import { clampTeaserPage, getVideoResultsPerSearchLimit } from "@/lib/plan-limits";
import { resolveOwnerPlan } from "@/lib/plan-gate-server";

export const dynamic = "force-dynamic";

/**
 * /api/videos — the video library (Creators > Videos). Stored data only.
 * q, platform, niche, country, language, minViews, maxViews,
 * postedWithin (days), postedFrom / postedTo (YYYY-MM-DD, inclusive),
 * mediaType (video|photo|carousel), duration (short|medium|long),
 * hasProduct=1, viral=1, sort (views|gained|recent|engagement), offset, limit.
 * Free plan (hard wall): only the first FREE_VIDEO_RESULTS_PER_SEARCH videos of
 * each filter set; `teaserLocked: true` when more exist behind the paywall.
 */
export async function GET(req: NextRequest) {
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const query = videoQueryFromParams(req.nextUrl.searchParams);
  const cap = getVideoResultsPerSearchLimit(await resolveOwnerPlan(admin, userId));
  if (cap == null) {
    const result = await readVideoLibrary(admin, query);
    return NextResponse.json(result, { headers: { "cache-control": "private, max-age=60, stale-while-revalidate=600" } });
  }
  const page = clampTeaserPage(cap, query.offset ?? 0, query.limit ?? 24);
  if (page.walled || page.limit === 0) {
    return NextResponse.json({ videos: [], hasMore: false, source: query.source === "snapshot" ? "snapshot" : "tracked", teaserLocked: true }, { headers: { "cache-control": "no-store" } });
  }
  const result = await readVideoLibrary(admin, { ...query, offset: page.offset, limit: page.limit });
  const reachedCap = page.offset + page.limit >= cap;
  return NextResponse.json(
    { ...result, hasMore: reachedCap ? false : result.hasMore, ...(reachedCap && result.hasMore ? { teaserLocked: true } : {}) },
    { headers: { "cache-control": "no-store" } },
  );
}
