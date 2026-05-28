import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const APIFY_API_KEY = process.env.APIFY_API_KEY;
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function extractEmail(text: string): string | null {
  if (!text) return null;
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

// Runs in background — fires Apify scrape and stores results in DB
async function backgroundScrape(niche: string, plat: string) {
  if (!APIFY_API_KEY) return;
  try {
    const queries = [niche, `${niche} creator`, `${niche} tips`];
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/clockworks~free-tiktok-scraper/runs?token=${APIFY_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchQueries: queries, searchType: "user", maxItems: 500 }),
      }
    );
    const runData = await runRes.json();
    const runId = runData.data?.id;
    if (!runId) return;

    let status = "RUNNING";
    let attempts = 0;
    while ((status === "RUNNING" || status === "READY") && attempts < 60) {
      await new Promise(r => setTimeout(r, 3000));
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_KEY}`);
      const statusData = await statusRes.json();
      status = statusData.data?.status;
      attempts++;
    }

    const datasetRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_API_KEY}&limit=500`);
    const items = await datasetRes.json();
    if (!Array.isArray(items) || items.length === 0) return;

    const creatorMap = new Map<string, { author: Record<string, unknown>; videos: { views: number; thumbnail: string | null }[] }>();
    for (const item of items as Record<string, unknown>[]) {
      const author = item.authorMeta as Record<string, unknown> | undefined;
      if (!author?.name) continue;
      const vm = item.videoMeta as Record<string, unknown> | undefined;
      const coverUrl = String(vm?.coverUrl || vm?.originalCoverUrl || "");
      const views = Number(item.playCount || 0);
      const id = String(author.name);
      if (creatorMap.has(id)) {
        const ex = creatorMap.get(id)!;
        if (ex.videos.length < 3) ex.videos.push({ views, thumbnail: coverUrl || null });
      } else {
        creatorMap.set(id, { author, videos: [{ views, thumbnail: coverUrl || null }] });
      }
    }

    const upserts = Array.from(creatorMap.values()).map(({ author, videos }) => {
      const followers = Number(author.fans || 0);
      const hearts = Number(author.heart || 0);
      const totalVideos = Number(author.video || 1);
      const engRate = followers > 0 ? parseFloat(((hearts / Math.max(totalVideos, 1) / followers) * 100).toFixed(2)) : 0;
      return {
        username: String(author.name),
        display_name: String(author.nickName || author.name),
        avatar_url: String(author.avatar || author.originalAvatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(String(author.nickName || author.name))}&background=e5e5e5&color=9a9a9a&size=200&bold=true&rounded=true`),
        platform: plat,
        followers,
        engagement_rate: Math.min(engRate, 99.99),
        avg_views: videos.length > 0 ? Math.floor(videos.reduce((s, v) => s + v.views, 0) / videos.length) : 0,
        bio: String(author.signature || ""),
        niches: [niche.toLowerCase()],
        video_thumbnails: videos,
        last_scraped_at: new Date().toISOString(),
      };
    });

    if (upserts.length > 0) {
      await supabaseAdmin.from("creators_index").upsert(upserts, { onConflict: "username" });
    }
  } catch (e) {
    console.error("Background scrape failed:", e);
  }
}

export async function POST(request: Request) {
  const { niche, platform, minFollowers, maxFollowers, minEngagement, gender } = await request.json();
  if (!niche) return NextResponse.json({ creators: [] });

  const nicheNorm = niche.toLowerCase().split(" ")[0];
  const minF = minFollowers ? Number(minFollowers) : 0;
  const maxF = maxFollowers ? Number(maxFollowers) : 10000000;
  const minE = minEngagement ? Number(minEngagement) : 0;
  const platRaw = (platform || "TikTok").toLowerCase();
  const plat = platRaw === "tiktok" ? "TikTok" : platRaw === "instagram" ? "Instagram" : platRaw === "youtube" ? "YouTube" : (platform || "TikTok");

  // Always query DB first
  const { data: dbCreators } = await supabaseAdmin
    .from("creators_index")
    .select("*")
    .eq("platform", plat)
    .contains("niches", [nicheNorm])
    .gte("followers", minF)
    .lte("followers", maxF)
    .gte("engagement_rate", minE)
    .order("followers", { ascending: false })
    .limit(50);

  const filtered = (dbCreators || []).filter(c => {
    if (gender === "female" && !/(she|her|woman|girl|female|femme|elle|mom|mum|sister)/i.test(c.bio || "")) return false;
    if (gender === "male" && !/(he|him|man|guy|male|homme|dad|father|brother)/i.test(c.bio || "")) return false;
    return true;
  });

  // If DB has enough — return immediately
  if (filtered.length >= 3) {
    const creators = filtered.slice(0, 20).map(c => ({
      username: c.username,
      displayName: c.display_name,
      avatarUrl: c.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.display_name)}&background=e5e5e5&color=9a9a9a&size=200&bold=true&rounded=true`,
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

  // Not enough in DB — trigger background scrape and return what we have
  if (APIFY_API_KEY) {
    // Fire and forget — don't await
    backgroundScrape(nicheNorm, plat).catch(() => {});
  }

  // Return whatever we have from DB right now + message to retry
  if (filtered.length > 0) {
    const creators = filtered.map(c => ({
      username: c.username,
      displayName: c.display_name,
      avatarUrl: c.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.display_name)}&background=e5e5e5&color=9a9a9a&size=200&bold=true&rounded=true`,
      followersCount: c.followers,
      engagementRate: Number(c.engagement_rate),
      avgViews: c.avg_views,
      platform: c.platform,
      bio: c.bio,
      email: extractEmail(c.bio || ""),
      niche,
      videoThumbnails: c.video_thumbnails || [],
    }));
    return NextResponse.json({ creators, source: "db", scraping: true });
  }

  return NextResponse.json({ creators: [], scraping: true, error: "Fetching creators for this niche — search again in 30 seconds" });
}
