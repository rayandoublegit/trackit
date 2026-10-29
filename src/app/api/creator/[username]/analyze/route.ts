import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { reportAiFailure } from "@/lib/ai-provider";
import { getAuthedUserId } from "@/lib/api-auth";
import { analyzeCreatorContent } from "@/lib/creator-content-analysis";
import { llmConfigured } from "@/lib/llm";
import { canUseMinoAnalysis, lowestTierFor } from "@/lib/plan-limits";
import { paywallResponse, resolveOwnerPlan } from "@/lib/plan-gate-server";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// Analyze a creator's video frames (cover images) with Claude vision. Cached in
// creators_index.content_analysis when that column exists (migration); works
// without it too (recomputed each call). Runs server-side where
// an LLM provider is configured (src/lib/llm.ts).
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  // Signed-in paid plans only: an uncached call spends AI vision credits.
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ analysis: null, error: "Unauthorized" }, { status: 401 });
  const { username } = await params;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ analysis: null, reason: "no db" }, { status: 503 });
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!canUseMinoAnalysis(await resolveOwnerPlan(admin, userId))) {
    return paywallResponse("mino-analysis", lowestTierFor(canUseMinoAnalysis));
  }

  // Try with the cache column; fall back if the migration hasn't been applied.
  let row: { display_name?: string; primary_niche?: string; followers?: number; top_videos?: unknown; content_analysis?: unknown } | null = null;
  let hasCache = true;
  const withCache = await admin
    .from("creators_index")
    .select("display_name, primary_niche, followers, top_videos, content_analysis")
    .eq("username", username)
    .maybeSingle();
  if (withCache.error) {
    hasCache = false;
    const base = await admin
      .from("creators_index")
      .select("display_name, primary_niche, followers, top_videos")
      .eq("username", username)
      .maybeSingle();
    if (base.error || !base.data) return NextResponse.json({ analysis: null, reason: "not found" }, { status: 404 });
    row = base.data;
  } else {
    if (!withCache.data) return NextResponse.json({ analysis: null, reason: "not found" }, { status: 404 });
    row = withCache.data;
  }

  if (hasCache && row.content_analysis) return NextResponse.json({ analysis: row.content_analysis, cached: true });

  const covers = (Array.isArray(row.top_videos) ? (row.top_videos as { cover?: string }[]) : [])
    .map((v) => v.cover)
    .filter((u): u is string => !!u);
  if (covers.length === 0) return NextResponse.json({ analysis: null, reason: "no covers" });
  if (!llmConfigured()) return NextResponse.json({ analysis: null, reason: "no key" });

  try {
    const analysis = await analyzeCreatorContent(covers, {
      displayName: row.display_name || username,
      niche: row.primary_niche || "",
      followers: Number(row.followers || 0),
    });
    if (analysis && hasCache) {
      try { await admin.from("creators_index").update({ content_analysis: analysis }).eq("username", username); } catch { /* cache best-effort */ }
    }
    return NextResponse.json({ analysis });
  } catch (e) {
    reportAiFailure("creator-analyze", e);
    return NextResponse.json({ analysis: null, error: "analysis_unavailable" });
  }
}
