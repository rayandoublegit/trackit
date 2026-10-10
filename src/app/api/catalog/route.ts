import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import { catalogQueryFromParams, liveCreatorSearch, liveSearchAvailable, queryCatalog } from "@/lib/catalog-query";
import { canSeeCreatorEmails, canUseLiveSearch, clampTeaserPage, getResultsPerSearchLimit } from "@/lib/plan-limits";
import { creatorsForPlan } from "@/lib/plan-paywall";
import { resolveOwnerPlan } from "@/lib/plan-gate-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/catalog — the creator catalog (Creators > Search).
 * Signed-in users only. Filters are applied in SQL (see lib/catalog-query).
 * Platforms the catalog does not hold yet (Instagram) are searched live by
 * keyword when a provider is set (Growth and above).
 *
 * Free plan (hard wall, server-side): only the first FREE_RESULTS_PER_SEARCH
 * rows of each filter set / search, never a live platform search, and no
 * creator emails (`hasEmail` instead). `teaserLocked: true` tells the UI there
 * is more behind the paywall.
 */
export async function GET(req: NextRequest) {
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ creators: [], hasMore: false, count: 0, error: "Unauthorized" }, { status: 401 });

  const plan = await resolveOwnerPlan(getSupabaseAdmin(), userId);
  const emails = canSeeCreatorEmails(plan);
  const q = catalogQueryFromParams(req.nextUrl.searchParams);

  const cap = getResultsPerSearchLimit(plan);
  const page = clampTeaserPage(cap, q.offset ?? 0, q.limit || 24);
  // Free: no paging past the cap, and no search by email address (the search also matches emails).
  if (page.walled || page.limit === 0 || (!emails && /\S@\S/.test(q.search ?? ""))) {
    return NextResponse.json({ creators: [], hasMore: false, count: 0, total: null, source: "catalog", teaserLocked: true });
  }
  const result = await queryCatalog({ ...q, offset: page.offset, limit: page.limit });
  // Free: past the cap there is nothing more to load, whatever the database holds.
  const reachedCap = cap != null && page.offset + page.limit >= cap;
  const teaserLocked = reachedCap && (result.hasMore || (typeof result.total === "number" && result.total > page.offset + result.creators.length));

  const keyword = (q.search || q.niche || "").trim();
  const wantsLive =
    q.platform &&
    q.platform !== "YouTube" &&
    (q.offset ?? 0) === 0 &&
    result.creators.length === 0 &&
    keyword.length >= 2 &&
    liveSearchAvailable(q.platform);

  if (wantsLive && q.platform) {
    if (!canUseLiveSearch(plan)) {
      // Free: no live platform search (it spends API calls).
      return NextResponse.json({ creators: [], hasMore: false, count: 0, source: "catalog", liveLocked: true, teaserLocked: true });
    }
    const live = await liveCreatorSearch(keyword, q.platform, Math.min(q.limit || 24, 30), {
      minFollowers: q.minFollowers,
      maxFollowers: q.maxFollowers,
      excludeBrands: q.excludeBrands,
    });
    return NextResponse.json({ creators: creatorsForPlan(live, emails), hasMore: false, count: live.length, source: "live" });
  }

  return NextResponse.json({
    creators: creatorsForPlan(result.creators, emails),
    hasMore: reachedCap ? false : result.hasMore,
    count: result.creators.length,
    total: result.total ?? null,
    source: "catalog",
    ...(teaserLocked ? { teaserLocked: true } : {}),
    ...(q.search ? { search: q.search } : {}),
    ...(result.error ? { error: result.error } : {}),
  });
}
