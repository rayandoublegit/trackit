import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SC_API_KEY = process.env.SCRAPECREATORS_API_KEY;
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function extractEmail(text: string): string | null {
  if (!text) return null;
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

// Estimate engagement: TikTok search users doesn't give likes, so we approximate
// from follower tier. Real ER refined later if needed.
function estimateEngagement(followers: number): number {
  if (followers < 10000) return 8.0;
  if (followers < 50000) return 6.5;
  if (followers < 200000) return 5.0;
  if (followers < 1000000) return 3.5;
  return 2.0;
}

type SCUser = {
  unique_id?: string;
  nickname?: string;
  follower_count?: number;
  signature?: string;
  custom_verify?: string;
  avatar_168x168?: { url_list?: string[] };
  avatar_medium?: { url_list?: string[] };
};

async function searchScrapeCreators(niche: string) {
  if (!SC_API_KEY) return [];
  const res = await fetch(
    `https://api.scrapecreators.com/v1/tiktok/search/users?query=${encodeURIComponent(niche)}`,
    { headers: { "x-api-key": SC_API_KEY } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const userList = (data?.user_list ?? []) as { user_info?: SCUser }[];
  return userList.map(u => u.user_info).filter((u): u is SCUser => !!u && !!u.unique_id);
}

export async function POST(request: Request) {
  const { niche, platform, minFollowers, maxFollowers, minEngagement, gender, language, location } = await request.json();
  if (!niche) return NextResponse.json({ creators: [] });

  const nicheNorm = niche.toLowerCase().trim();
  const nicheWords = nicheNorm.split(" ").filter(Boolean);

  const minF = minFollowers ? Number(minFollowers) : 0;
  const maxF = maxFollowers ? Number(maxFollowers) : 100000000;
  const minE = minEngagement ? Number(minEngagement) : 0;
  const platRaw = (platform || "TikTok").toLowerCase();
  const plat = platRaw === "instagram" ? "Instagram" : platRaw === "youtube" ? "YouTube" : "TikTok";

  const langNorm = String(language || "").toLowerCase().trim();
  const locNorm = String(location || "").toLowerCase().trim();
  // French market (frontend sends "french"/"fr", location "FR") = curated-only mode.
  const isFrench = langNorm === "fr" || langNorm === "french" || locNorm === "fr" || locNorm === "france";
  const isGerman = langNorm === "de" || langNorm === "german" || locNorm === "de" || locNorm === "germany";
  const curatedOnly = isFrench || isGerman;

  // 1. Query own DB first (instant, free)
  const orFilter = nicheWords.map((w: string) => `niches.cs.{${w}}`).join(",");
  let dbQuery = supabaseAdmin
    .from("creators_index")
    .select("*")
    .eq("platform", plat)
    .or(orFilter || `niches.cs.{${nicheNorm}}`)
    .gte("followers", minF)
    .lte("followers", maxF)
    .gte("engagement_rate", minE);

  // Curated-only mode (e.g. French): only show creators we hand-picked.
  if (curatedOnly) {
    dbQuery = dbQuery.contains("niches", ["curated"]);
  }
  // NOTE: no strict language .eq filter — curated creators are already the right
  // market, and exact-matching the language column wiped out valid results.

  const { data: dbCreators } = await dbQuery
    .order("followers", { ascending: false })
    .limit(100);

  // In curated mode, even 1 result should show (no falling back to scraping).
  const dbThreshold = curatedOnly ? 1 : 5;
  if (dbCreators && dbCreators.length >= dbThreshold) {
    const creators = dbCreators
      // Curated creators always rank first, then by followers.
      .sort((a, b) => {
        const ac = (a.niches || []).includes("curated") ? 1 : 0;
        const bc = (b.niches || []).includes("curated") ? 1 : 0;
        if (ac !== bc) return bc - ac;
        return (b.followers || 0) - (a.followers || 0);
      })
      .filter(c => {
        if (gender === "female" && !/(she|her|woman|girl|female|femme|elle|mom|mum|sister)/i.test(c.bio || "")) return false;
        if (gender === "male" && !/(he|him|man|guy|male|homme|dad|father|brother)/i.test(c.bio || "")) return false;
        return true;
      })
      .slice(0, 30)
      .map(c => ({
        username: c.username,
        displayName: c.display_name,
        avatarUrl: c.avatar_url,
        followersCount: c.followers,
        engagementRate: Number(c.engagement_rate),
        avgViews: c.avg_views,
        platform: c.platform,
        bio: c.bio,
        email: extractEmail(c.bio || ""),
        niche,
        videoThumbnails: c.video_thumbnails || [],
      }));
    return NextResponse.json({ creators, source: "db" });
  }

  // Curated mode never scrapes — return whatever curated creators exist (even if empty).
  if (curatedOnly) {
    return NextResponse.json({ creators: [], source: "db", curated: true });
  }

  // 2. Live ScrapeCreators search (TikTok only for now)
  if (!SC_API_KEY || plat !== "TikTok") {
    return NextResponse.json({ creators: [], error: "No data found" });
  }

  try {
    const users = await searchScrapeCreators(niche);
    if (users.length === 0) return NextResponse.json({ creators: [] });

    const upserts = users.map(u => {
      const followers = Number(u.follower_count || 0);
      const bio = String(u.signature || "");
      const avatar = u.avatar_medium?.url_list?.[0] || u.avatar_168x168?.url_list?.[0] || "";
      return {
        username: String(u.unique_id),
        display_name: String(u.nickname || u.unique_id),
        avatar_url: avatar,
        platform: "TikTok",
        followers,
        engagement_rate: estimateEngagement(followers),
        avg_views: Math.floor(followers * 0.1),
        bio,
        niches: [nicheNorm, ...nicheWords].filter((v, i, a) => a.indexOf(v) === i),
        video_thumbnails: [],
        last_scraped_at: new Date().toISOString(),
      };
    });

    if (upserts.length > 0) {
      await supabaseAdmin.from("creators_index").upsert(upserts, { onConflict: "username" });
    }

    const creators = upserts
      .map(u => ({
        username: u.username,
        displayName: u.display_name,
        avatarUrl: u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.display_name)}&background=e5e5e5&color=9a9a9a&size=200&bold=true&rounded=true`,
        followersCount: u.followers,
        engagementRate: u.engagement_rate,
        avgViews: u.avg_views,
        platform: "TikTok",
        bio: u.bio,
        email: extractEmail(u.bio),
        niche,
        videoThumbnails: [],
      }))
      .filter(c => {
        if (!c.username) return false;
        if (c.followersCount < minF) return false;
        if (c.followersCount > maxF) return false;
        if (gender === "female" && !/(she|her|woman|girl|female|femme|elle|mom|mum|sister)/i.test(c.bio)) return false;
        if (gender === "male" && !/(he|him|man|guy|male|homme|dad|father|brother)/i.test(c.bio)) return false;
        return true;
      })
      .sort((a, b) => b.followersCount - a.followersCount)
      .slice(0, 30);

    return NextResponse.json({ creators, source: "live" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ creators: [], error: msg });
  }
}
