import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const APIFY_API_KEY = process.env.APIFY_API_KEY;

export async function POST(request: Request) {
  const { niche, platform, minFollowers, maxFollowers, minEngagement, location, language } = await request.json();

  if (!niche) return NextResponse.json({ creators: [] });

  try {
    const query = [niche, location].filter(Boolean).join(" ");

    let actorId = "clockworks/tiktok-scraper";
    let input: any = {};

    if (platform === "Instagram") {
      actorId = "apify/instagram-hashtag-scraper";
      input = {
        hashtags: [niche.replace(/\s+/g, "")],
        resultsLimit: 20,
      };
    } else {
      // TikTok default
      actorId = "clockworks/free-tiktok-scraper";
      input = {
        keywords: [query],
        maxItems: 20,
      };
    }

    const runRes = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!runRes.ok) throw new Error("Apify run failed");

    const runData = await runRes.json();
    const runId = runData.data?.id;
    if (!runId) throw new Error("No run ID");

    // Poll for completion (max 30 seconds)
    let status = "RUNNING";
    let attempts = 0;
    while (status === "RUNNING" && attempts < 15) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_KEY}`);
      const statusData = await statusRes.json();
      status = statusData.data?.status;
      attempts++;
    }

    // Get results
    const datasetRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_API_KEY}&limit=20`);
    const items = await datasetRes.json();

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ creators: [], error: "No results found" });
    }

    // Map Apify results to Trackit creator format
    const creators = items.map((item: any) => {
      const followers = item.followersCount || item.fans || item.followers || 0;
      const engagement = item.engagementRate || (item.heartCount ? ((item.heartCount / Math.max(item.videoCount || 1, 1)) / Math.max(followers, 1)) * 100 : 3.0);
      
      return {
        username: item.uniqueId || item.username || item.handle || "",
        displayName: item.nickname || item.fullName || item.name || item.uniqueId || "",
        avatarUrl: item.avatarThumb || item.avatarMedium || item.profilePicUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.uniqueId}`,
        followersCount: followers,
        engagementRate: parseFloat(engagement.toFixed(1)),
        avgViews: item.playCount || item.avgViews || Math.floor(followers * 0.1),
        platform: platform || "TikTok",
        bio: item.signature || item.biography || item.bio || "",
        niche: niche,
        videoThumbnails: (item.latestVideos || item.videos || []).slice(0, 3).map((v: any) => ({
          views: v.playCount || v.plays || 0,
          thumbnail: v.covers?.[0] || v.thumbnail || null,
        })),
      };
    }).filter((c: any) => {
      if (minFollowers && c.followersCount < minFollowers) return false;
      if (maxFollowers && c.followersCount > maxFollowers) return false;
      if (minEngagement && c.engagementRate < minEngagement) return false;
      return c.username;
    });

    return NextResponse.json({ creators });

  } catch (error) {
    console.error("Apify discovery error:", error);
    // Fallback to mock data if Apify fails
    return NextResponse.json({
      creators: [],
      error: "Discovery service temporarily unavailable"
    });
  }
}
