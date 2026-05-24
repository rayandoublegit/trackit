import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const APIFY_API_KEY = process.env.APIFY_API_KEY;
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const NICHES = [
  "fitness", "beauty", "fashion", "food", "travel", "pets", "gaming",
  "tech", "lifestyle", "makeup", "skincare", "workout", "cooking",
  "dance", "comedy", "music", "art", "photography", "yoga", "nutrition",
  "hair", "nails", "streetwear", "sneakers", "watches", "jewelry",
  "supplements", "protein", "weightloss", "bodybuilding"
];

async function scrapeNiche(niche: string): Promise<number> {
  const runRes = await fetch(
    `https://api.apify.com/v2/acts/clockworks~free-tiktok-scraper/runs?token=${APIFY_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchQueries: [niche, `${niche} creator`, `${niche} tips`],
        searchType: "user",
        maxItems: 500,
      }),
    }
  );
  const runData = await runRes.json();
  const runId = runData.data?.id;
  if (!runId) return 0;

  let status = "RUNNING";
  let attempts = 0;
  while ((status === "RUNNING" || status === "READY") && attempts < 30) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_KEY}`);
    const statusData = await statusRes.json();
    status = statusData.data?.status;
    attempts++;
  }

  const datasetRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_API_KEY}&limit=500`
  );
  const items = await datasetRes.json();
  if (!Array.isArray(items)) return 0;

  const creatorMap = new Map<string, any>();
  for (const item of items) {
    const author = item.authorMeta;
    if (!author?.name) continue;
    const vm = item.videoMeta;
    const coverUrl = vm?.coverUrl || vm?.originalCoverUrl || "";
    const views = Number(item.playCount || 0);

    if (creatorMap.has(author.name)) {
      const ex = creatorMap.get(author.name);
      if (ex.videos.length < 3) ex.videos.push({ views, thumbnail: coverUrl || null });
      if (!ex.niches.includes(niche)) ex.niches.push(niche);
    } else {
      creatorMap.set(author.name, { author, videos: [{ views, thumbnail: coverUrl || null }], niches: [niche] });
    }
  }

  const upserts = Array.from(creatorMap.values()).map(({ author, videos, niches }) => {
    const followers = Number(author.fans || 0);
    const hearts = Number(author.heart || 0);
    const totalVideos = Number(author.video || 1);
    const engRate = followers > 0 ? parseFloat(((hearts / Math.max(totalVideos, 1) / followers) * 100).toFixed(2)) : 0;
    const avgViews = videos.length > 0 ? Math.floor(videos.reduce((s: number, v: any) => s + v.views, 0) / videos.length) : 0;

    return {
      username: author.name,
      display_name: author.nickName || author.name,
      avatar_url: author.avatar || author.originalAvatarUrl || "",
      platform: "TikTok",
      followers,
      engagement_rate: Math.min(engRate, 99.99),
      avg_views: avgViews,
      bio: author.signature || "",
      niches,
      video_thumbnails: videos,
      last_scraped_at: new Date().toISOString(),
    };
  });

  if (upserts.length > 0) {
    await supabaseAdmin.from("creators_index").upsert(upserts, { onConflict: "username" });
  }
  return upserts.length;
}

export async function POST(request: Request) {
  const { secret, niche } = await request.json();
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (niche) {
    const count = await scrapeNiche(niche);
    return NextResponse.json({ niche, count });
  }

  // Seed all niches one by one
  const results: Record<string, number> = {};
  for (const n of NICHES) {
    try {
      results[n] = await scrapeNiche(n);
    } catch (e) {
      results[n] = -1;
    }
  }
  return NextResponse.json({ results });
}
