import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { readVideoLibrary, type VideoQuery } from "@/lib/creator-intel-read";

export const dynamic = "force-dynamic";

/**
 * /api/videos — the video library (Creators > Videos). Stored data only.
 * q, platform, niche, country, language, minViews, postedWithin (days),
 * mediaType (video|photo), hasProduct=1, duration (short|medium|long),
 * sort (views|gained|recent|engagement), offset, limit.
 */
export async function GET(req: NextRequest) {
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const p = req.nextUrl.searchParams;
  const pick = <T extends string>(v: string | null, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : undefined);
  const q: VideoQuery = {
    q: p.get("q") || undefined,
    platform: p.get("platform") || undefined,
    niche: p.get("niche") || undefined,
    country: (p.get("country") || "").toUpperCase() || undefined,
    language: p.get("language") || undefined,
    minViews: Number(p.get("minViews")) || undefined,
    postedWithinDays: Number(p.get("postedWithin")) || undefined,
    mediaType: pick(p.get("mediaType"), ["video", "photo"] as const),
    hasProduct: p.get("hasProduct") === "1",
    duration: pick(p.get("duration"), ["short", "medium", "long"] as const),
    sort: pick(p.get("sort"), ["views", "gained", "recent", "engagement"] as const) ?? "views",
    offset: Number(p.get("offset")) || 0,
    limit: Number(p.get("limit")) || 48,
  };
  const result = await readVideoLibrary(admin, q);
  return NextResponse.json(result, { headers: { "cache-control": "private, max-age=60" } });
}
