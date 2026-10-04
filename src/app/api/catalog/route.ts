import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import { catalogQueryFromParams, liveCreatorSearch, liveSearchAvailable, queryCatalog } from "@/lib/catalog-query";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/catalog — the creator catalog (Creators > Search).
 * Signed-in users only: rows include contact emails.
 * Filters are applied in SQL (see lib/catalog-query). Platforms the catalog does
 * not hold yet (Instagram) are searched live by keyword when a provider is set.
 */
export async function GET(req: NextRequest) {
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ creators: [], hasMore: false, count: 0, error: "Unauthorized" }, { status: 401 });

  const q = catalogQueryFromParams(req.nextUrl.searchParams);
  const result = await queryCatalog(q);

  const keyword = (q.search || q.niche || "").trim();
  const wantsLive =
    q.platform &&
    q.platform !== "YouTube" &&
    (q.offset ?? 0) === 0 &&
    result.creators.length === 0 &&
    keyword.length >= 2 &&
    liveSearchAvailable(q.platform);

  if (wantsLive && q.platform) {
    const live = await liveCreatorSearch(keyword, q.platform, Math.min(q.limit || 24, 30), {
      minFollowers: q.minFollowers,
      maxFollowers: q.maxFollowers,
      excludeBrands: q.excludeBrands,
    });
    return NextResponse.json({ creators: live, hasMore: false, count: live.length, source: "live" });
  }

  return NextResponse.json({
    creators: result.creators,
    hasMore: result.hasMore,
    count: result.creators.length,
    source: "catalog",
    ...(q.search ? { search: q.search } : {}),
    ...(result.error ? { error: result.error } : {}),
  });
}
