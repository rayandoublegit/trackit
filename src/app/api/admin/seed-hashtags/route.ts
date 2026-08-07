import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { hashtags, niche } = await req.json();
  if (!Array.isArray(hashtags) || !hashtags.length) {
    return NextResponse.json({ error: "hashtags[] required" }, { status: 400 });
  }

  const seen = new Set<string>();
  const candidates: {
    username: string; display_name: string | null; avatar_url: string | null;
    country: string | null; platform: string; niche: string | null;
    enrichment_status: string;
  }[] = [];
  const report: Record<string, { videos: number; kept: number }> = {};

  for (const tag of hashtags) {
    let videos: any[] = [];
    try {
      const res = await fetch(
        `https://api.scrapecreators.com/v1/tiktok/hashtag?hashtag=${encodeURIComponent(tag)}`,
        { headers: { "x-api-key": process.env.SCRAPECREATORS_API_KEY! } }
      );
      if (!res.ok) { report[tag] = { videos: -res.status, kept: 0 }; continue; }
      const data = await res.json();
      videos = data.videos || data.items || data.data || [];
    } catch (e) {
      console.error("[seed] hashtag fetch failed:", tag, e instanceof Error ? e.message : e);
      report[tag] = { videos: -1, kept: 0 };
      continue;
    }

    let kept = 0;
    for (const v of videos) {
      const a = v.author || {};
      const username = (a.uniqueId || a.unique_id || "").toLowerCase();
      if (!username || seen.has(username)) continue;
      // garde-fou: un vrai author a un id numerique et un nickname
      if (!a.id || !a.nickname) continue;
      seen.add(username);

      // pre-filtres qualite, gratuits (payload only)
      const createTime = (v.createTime || v.create_time || 0) * 1000;
      const recentPost = createTime > Date.now() - THIRTY_DAYS;
      const region = (a.region || "").toUpperCase() || null;
      const sig = a.signature || "";
      const FRANCOPHONE = ["FR", "BE", "CH", "MA", "DZ", "TN", "CI", "SN", "CM", "CA"];
      const frSignal = region === "FR" || /[àâçéèêëîïôùûœ]|france|paris|lyon|marseille/i.test(sig);
      const keep = region === "FR" || (!region && frSignal) || FRANCOPHONE.includes(region || "");
      if (!recentPost) continue;
      if (!keep) continue;

      candidates.push({
        username,
        display_name: a.nickname || null,
        avatar_url: a.avatarThumb || a.avatar_thumb || null,
        country: region,
        platform: "tiktok",
        niche: niche || null,
        enrichment_status: "pending",
      });
      kept += 1;
    }
    report[tag] = { videos: videos.length, kept };
    await new Promise(r => setTimeout(r, 300));
  }

  let inserted = 0;
  if (candidates.length) {
    const { error, count } = await admin
      .from("creators_index")
      .upsert(candidates, { onConflict: "username", ignoreDuplicates: true, count: "exact" });
    if (error) return NextResponse.json({ error: error.message, report }, { status: 500 });
    inserted = count ?? candidates.length;
  }

  return NextResponse.json({ scannedHashtags: hashtags.length, uniqueCandidates: candidates.length, inserted, report });
}
