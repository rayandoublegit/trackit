import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canSeeVideoInsights } from "@/lib/plan-limits";
import { resolveOwnerPlan } from "@/lib/plan-gate-server";
import { readCreatorInsights, readTranscript } from "@/lib/video-intel/read";

export const dynamic = "force-dynamic";

/**
 * /api/creator-insights?username=   why a creator's videos work: the synthesis,
 *                                   measured patterns, best / worst videos and a
 *                                   lean insight per video (no transcripts).
 * /api/creator-insights?transcript=<platform>:<video_id>   one transcript, on demand.
 * Stored data only. Free plan: `locked: true` with teaser counts, no content (402 for transcripts).
 */
export async function GET(req: NextRequest) {
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const full = canSeeVideoInsights(await resolveOwnerPlan(admin, userId));
  const p = req.nextUrl.searchParams;

  const transcriptKey = (p.get("transcript") || "").trim();
  if (transcriptKey) {
    if (!full) return NextResponse.json({ error: "upgrade_required", feature: "video-insights" }, { status: 402 });
    const at = transcriptKey.indexOf(":");
    const platform = transcriptKey.slice(0, at).toLowerCase();
    const videoId = transcriptKey.slice(at + 1);
    if (at < 1 || !videoId || !["tiktok", "instagram", "youtube"].includes(platform)) return NextResponse.json({ error: "transcript must be <platform>:<video_id>" }, { status: 400 });
    const t = await readTranscript(admin, platform, videoId);
    if (!t) return NextResponse.json({ error: "No transcript yet" }, { status: 404 });
    return NextResponse.json(t, { headers: { "cache-control": "private, max-age=600" } });
  }

  const username = (p.get("username") || "").trim();
  if (!username) return NextResponse.json({ error: "Missing username" }, { status: 400 });
  const data = await readCreatorInsights(admin, username, { full });
  if (!data) return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  return NextResponse.json(data, { headers: { "cache-control": "private, max-age=120, stale-while-revalidate=600" } });
}
