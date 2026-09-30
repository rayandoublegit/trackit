import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { readVideoLibrary, videoQueryFromParams } from "@/lib/creator-intel-read";

export const dynamic = "force-dynamic";

/**
 * /api/videos — the video library (Creators > Videos). Stored data only.
 * q, platform, niche, country, language, minViews, maxViews,
 * postedWithin (days), postedFrom / postedTo (YYYY-MM-DD, inclusive),
 * mediaType (video|photo|carousel), duration (short|medium|long),
 * hasProduct=1, viral=1, sort (views|gained|recent|engagement), offset, limit.
 */
export async function GET(req: NextRequest) {
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const result = await readVideoLibrary(admin, videoQueryFromParams(req.nextUrl.searchParams));
  return NextResponse.json(result, { headers: { "cache-control": "private, max-age=60" } });
}
