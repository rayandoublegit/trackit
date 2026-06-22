import { NextResponse, type NextRequest } from "next/server";
import { buildFeedPage, type FeedFilters } from "@/lib/discovery-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const num = (k: string) => {
    const v = Number(p.get(k));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  const filters: FeedFilters = {
    niche: p.get("niche") || undefined,
    platform: p.get("platform") || undefined,
    minFollowers: num("minFollowers"),
    maxFollowers: num("maxFollowers"),
    minEngagement: num("minEngagement"),
    country: p.get("country") || undefined,
    language: p.get("language") || undefined,
    sort: p.get("sort") === "engagement" ? "engagement" : "followers",
  };
  const offset = Math.max(0, Number(p.get("offset")) || 0);
  const limit = Math.min(48, Math.max(1, Number(p.get("limit")) || 24));

  try {
    const { creators, hasMore } = await buildFeedPage(filters, offset, limit);
    return NextResponse.json({ creators, hasMore, count: creators.length });
  } catch (e) {
    return NextResponse.json({ creators: [], hasMore: false, error: e instanceof Error ? e.message : "feed failed" });
  }
}
