import { NextResponse, type NextRequest } from "next/server";
import { buildFeedPage, type FeedFilters } from "@/lib/discovery-feed";
import { getAuthedUserId } from "@/lib/api-auth";
import { canSeeCreatorEmails } from "@/lib/plan-limits";
import { creatorsForPlan } from "@/lib/plan-paywall";
import { resolveOwnerPlan } from "@/lib/plan-gate-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const num = (k: string) => {
    const raw = p.get(k);
    if (raw == null || raw === "") return undefined;
    const v = Number(raw);
    // Allow 0 so lower bucket edges are never dropped by truthiness checks.
    return Number.isFinite(v) && v >= 0 ? v : undefined;
  };
  const filters: FeedFilters = {
    niche: p.get("niche") || undefined,
    platform: p.get("platform") || undefined,
    minFollowers: num("minFollowers"),
    maxFollowers: num("maxFollowers"),
    minEngagement: num("minEngagement"),
    country: p.get("country") || undefined,
    language: p.get("language") || undefined,
    sort: (["value", "followers", "engagement"].includes(p.get("sort") || "")
      ? (p.get("sort") as "value" | "followers" | "engagement")
      : "value"),
  };
  const offset = Math.max(0, Number(p.get("offset")) || 0);
  const limit = Math.min(48, Math.max(1, Number(p.get("limit")) || 24));

  try {
    const { creators, hasMore } = await buildFeedPage(filters, offset, limit);
    // Emails only for signed-in workspaces on Growth and above.
    const ownerId = await getAuthedUserId(req).catch(() => null);
    const emails = ownerId ? canSeeCreatorEmails(await resolveOwnerPlan(getSupabaseAdmin(), ownerId)) : false;
    const visible = creatorsForPlan(creators, emails);
    return NextResponse.json({ creators: visible, hasMore, count: visible.length });
  } catch (e) {
    return NextResponse.json({ creators: [], hasMore: false, error: e instanceof Error ? e.message : "feed failed" });
  }
}
