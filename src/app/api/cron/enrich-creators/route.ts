import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchTikTokProfileRaw, fetchTikTokVideosRaw, parseProfile, parseVideos, parseVideosRich, extractCaptions } from "@/lib/scrapecreators";
import { buildEnrichmentRow } from "@/lib/creator-enrichment";
import { classifyCreator } from "@/lib/creator-classify";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DEFAULT_BUDGET = Number(process.env.ENRICH_BUDGET_PER_RUN ?? 270);

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const budget = Math.min(Math.max(Number(searchParams.get("budget") || DEFAULT_BUDGET), 1), 1000);

  // pending first (enriched_at null), then stalest enriched — single ordering.
  const { data: targets } = await supabaseAdmin
    .from("creators_index")
    .select("username")
    .eq("platform", "TikTok")
    .neq("enrichment_status", "failed")
    .order("enriched_at", { ascending: true, nullsFirst: true })
    .limit(budget);

  const list = (targets || []).map((t) => t.username as string);
  const concurrency = Math.min(Math.max(Number(process.env.ENRICH_CONCURRENCY ?? 5), 1), 12);

  async function enrichOne(username: string): Promise<"enriched" | "failed"> {
    try {
      const [profileRaw, videosRaw] = await Promise.all([
        fetchTikTokProfileRaw(username),
        fetchTikTokVideosRaw(username),
      ]);
      const profile = parseProfile(profileRaw);
      const videos = parseVideos(videosRaw);
      const rich = parseVideosRich(videosRaw);
      const row = buildEnrichmentRow(username, profile, videos, Date.now(), rich);

      let classMerge: Record<string, unknown> = {};
      try {
        const c = await classifyCreator({ displayName: profile.displayName, bio: profile.bio, captions: extractCaptions(videosRaw) });
        classMerge = {
          primary_niche: c.primaryNiche,
          niches: Array.from(new Set([...c.niches, c.primaryNiche])),
          language: c.language,
          country_code: c.countryCode,
          email: c.email,
        };
      } catch {
        // classification is best-effort; metrics still get saved
      }

      await supabaseAdmin.from("creators_index").upsert({ ...row, ...classMerge }, { onConflict: "username" });
      return "enriched";
    } catch {
      await supabaseAdmin
        .from("creators_index")
        .update({ enrichment_status: "failed", enriched_at: new Date().toISOString() })
        .eq("username", username);
      return "failed";
    }
  }

  // Bounded concurrency: a fully sequential loop can't fit the budget inside
  // maxDuration (~3s/creator x 270 >> 300s). Process in parallel chunks instead.
  let enriched = 0;
  let failed = 0;
  for (let i = 0; i < list.length; i += concurrency) {
    const chunk = list.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map(enrichOne));
    for (const r of results) {
      if (r === "enriched") enriched++;
      else failed++;
    }
  }

  return NextResponse.json({ ok: true, budget, concurrency, picked: list.length, enriched, failed });
}
