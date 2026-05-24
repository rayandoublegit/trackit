import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const APIFY_API_KEY = process.env.APIFY_API_KEY;
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  const { niche, platform, minFollowers, maxFollowers, minEngagement, location, gender } = await request.json();
  if (!niche) return NextResponse.json({ creators: [] });

  const minF = minFollowers ? Number(minFollowers) : 0;
  const maxF = maxFollowers ? Number(maxFollowers) : 10000000;
  const minE = minEngagement ? Number(minEngagement) : 0;
  const plat = platform || "TikTok";

  // Query own DB first
  let query = supabaseAdmin
    .from("creators_index")
    .select("*")
    .eq("platform", plat)
    .contains("niches", [niche.toLowerCase()])
    .gte("followers", minF)
    .lte("followers", maxF)
    .gte("engagement_rate", minE)
    .order("followers", { ascending: false })
    .limit(50);

  const { data: dbCreators } = await query;

  if (dbCreators && dbCreators.length >= 3) {
    // We have enough in DB — map and return
    const creators = dbCreators
      .filter(c => {
        if (gender === "female" && !/(she|her|woman|girl|female|femme|elle|mom|mum|sister)/i.test(c.bio || "")) return false;
        if (gender === "male" && !/(he|him|man|guy|male|homme|dad|father|brother)/i.test(c.bio || "")) return false;
        return true;
      })
      .slice(0, 20)
      .map(c => ({
        username: c.username,
        displayName: c.display_name,
        avatarUrl: c.avatar_url,
        followersCount: c.followers,
        engagementRate: Number(c.engagement_rate),
        avgViews: c.avg_views,
        platform: c.platform,
        bio: c.bio,
        niche,
        videoThumbnails: c.video_thumbnails || [],
      }));
    return NextResponse.json({ creators, source: "db" });
  }

  // Fall back to live Apify scrape
  if (!APIFY_API_KEY) return NextResponse.json({ creators: [], error: "No data found" });

  try {
    const queries = [`${niche}`, `${niche} creator`, `${niche} tips`];
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
    if (!runId) return NextResponse.json({ creators: [], error: "Search failed" });

    let status = "RUNNING";
    let attempts = 0;
    while ((status === "RUNNING" || status === "READY") && attempts < 25) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_KEY}`);
      const statusData = await statusRes.json();
      status = statusData.data?.status;
      attempts++;
    }

    const datasetRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_API_KEY}&limit=500`);
    const items = await datasetRes.json();
    if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ creators: [] });

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

    // Store in DB for future searches
    const upserts = Array.from(creatorMap.values()).map(({ author, videos }) => {
      const followers = Number(author.fans || 0);
      const hearts = Number(author.heart || 0);
      const totalVideos = Number(author.video || 1);
      const engRate = followers > 0 ? parseFloat(((hearts / Math.max(totalVideos,1) / followers) * 100).toFixed(2)) : 0;
      return {
        username: String(author.name),
        display_name: String(author.nickName || author.name),
        avatar_url: String(author.avatar || author.originalAvatarUrl || ""),
        platform: plat,
        followers,
        engagement_rate: Math.min(engRate, 99.99),
        avg_views: videos.length > 0 ? Math.floor(videos.reduce((s,v) => s + v.views, 0) / videos.length) : 0,
        bio: String(author.signature || ""),
        niches: [niche.toLowerCase()],
        video_thumbnails: videos,
        last_scraped_at: new Date().toISOString(),
      };
    });
    if (upserts.length > 0) {
      supabaseAdmin.from("creators_index").upsert(upserts, { onConflict: "username" }).then(() => {});
    }

    const creators = Array.from(creatorMap.values())
      .map(({ author, videos }) => {
        const followers = Number(author.fans || 0);
        const hearts = Number(author.heart || 0);
        const totalVideos = Number(author.video || 1);
        const engRate = followers > 0 ? parseFloat(((hearts / Math.max(totalVideos,1) / followers) * 100).toFixed(1)) : 3.0;
        const bio = String(author.signature || "");
        return {
          username: String(author.name || ""),
          displayName: String(author.nickName || author.name || ""),
          avatarUrl: String(author.avatar || author.originalAvatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${author.name}`),
          followersCount: followers,
          engagementRate: Math.min(engRate, 99.9),
          avgViews: videos.length > 0 ? Math.floor(videos.reduce((s,v) => s + v.views, 0) / videos.length) : Math.floor(followers * 0.08),
          platform: plat,
          bio,
          niche,
          videoThumbnails: videos,
        };
      })
      .filter(c => {
        if (!c.username) return false;
        if (c.followersCount < minF) return false;
        if (c.followersCount > maxF) return false;
        if (c.engagementRate < minE) return false;
        if (gender === "female" && !/(she|her|woman|girl|female|femme|elle|mom|mum|sister)/i.test(c.bio)) return false;
        if (gender === "male" && !/(he|him|man|guy|male|homme|dad|father|brother)/i.test(c.bio)) return false;
        return true;
      })
      .sort((a, b) => b.followersCount - a.followersCount)
      .slice(0, 20);

    return NextResponse.json({ creators, source: "live" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ creators: [], error: msg });
  }
}
