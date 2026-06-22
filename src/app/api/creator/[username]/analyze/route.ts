import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeCreatorContent } from "@/lib/creator-content-analysis";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// Analyze a creator's video frames (cover images) with Claude vision. Cached in
// creators_index.content_analysis so each creator is analyzed once. Runs
// server-side where ANTHROPIC_API_KEY is available (prod/Vercel).
export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ analysis: null, reason: "no db" }, { status: 503 });
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: c, error } = await admin
    .from("creators_index")
    .select("display_name, primary_niche, followers, top_videos, content_analysis")
    .eq("username", username)
    .maybeSingle();
  if (error || !c) return NextResponse.json({ analysis: null, reason: "not found" }, { status: 404 });

  if (c.content_analysis) return NextResponse.json({ analysis: c.content_analysis, cached: true });

  const covers = (Array.isArray(c.top_videos) ? (c.top_videos as { cover?: string }[]) : [])
    .map((v) => v.cover)
    .filter((u): u is string => !!u);
  if (covers.length === 0) return NextResponse.json({ analysis: null, reason: "no covers" });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ analysis: null, reason: "no key" });

  try {
    const analysis = await analyzeCreatorContent(covers, {
      displayName: c.display_name || username,
      niche: c.primary_niche || "",
      followers: Number(c.followers || 0),
    });
    if (analysis) await admin.from("creators_index").update({ content_analysis: analysis }).eq("username", username);
    return NextResponse.json({ analysis });
  } catch (e) {
    return NextResponse.json({ analysis: null, error: e instanceof Error ? e.message : "analyze failed" });
  }
}
