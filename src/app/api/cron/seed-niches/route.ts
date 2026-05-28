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
  "fitness", "fashion", "beauty", "food", "travel",
  "gaming", "lifestyle", "pets", "finance", "sports",
  "skincare", "makeup", "cooking", "yoga", "streetwear",
  "jewelry", "watches", "hair", "nails", "music"
];

async function scrapeNiche(niche: string, platform: "TikTok" | "Instagram") {
  if (!APIFY_API_KEY) return;
  try {
    const actorId = platform === "TikTok"
      ? "clockworks~free-tiktok-scraper"
      : "apify~instagram-profile-scraper";

    const queries = [niche, `${niche} creator`, `${niche} tips`];
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchQueries: queries,
          searchType: "user",
          maxItems: 200,
        }),
      }
    );
    const runData = await runRes.json();
    const runId = runData.data?.id;
    if (!runId) return;

    let status = "RUNNING";
    let attempts = 0;
    while ((status === "RUNNING" || status === "READY") && attempts < 40) {
      await new Promise(r => setTimeout(r, 3000));
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_KEY}`);
      const statusData = await statusRes.json();
      status = statusData.data?.status;
      attempts++;
    }

    const datasetRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_API_KEY}&limit=200`);
    const items = await datasetRes.json();
    if (!Array.isArray(items) || items.length === 0) return;

    const upserts = items
      .map((item: Record<string, unknown>) => {
        const author = item.authorMeta as Record<string, unknown> | undefined;
        if (!author?.name) return null;
        const followers = Number(author.fans || 0);
        const hearts = Number(author.heart || 0);
        const totalVideos = Number(author.video || 1);
        const engRate = followers > 0
          ? parseFloat(((hearts / Math.max(totalVideos, 1) / followers) * 100).toFixed(2))
          : 0;
        return {
          username: String(author.name),
          display_name: String(author.nickName || author.name),
          avatar_url: String(author.avatar || author.originalAvatarUrl ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(String(author.nickName || author.name))}&background=e5e5e5&color=9a9a9a&size=200&bold=true&rounded=true`),
          platform,
          followers,
          engagement_rate: Math.min(engRate, 99.99),
          avg_views: Math.floor(followers * 0.08),
          bio: String(author.signature || ""),
          niches: [niche.toLowerCase()],
          video_thumbnails: [],
          last_scraped_at: new Date().toISOString(),
        };
      })
      .filter((u): u is NonNullable<typeof u> => u !== null);

    if (upserts.length > 0) {
      await supabaseAdmin
        .from("creators_index")
        .upsert(upserts, { onConflict: "username" });
      console.log(`Seeded ${upserts.length} creators for ${niche} on ${platform}`);
    }
  } catch (e) {
    console.error(`Failed to scrape ${niche} on ${platform}:`, e);
  }
}

export async function GET(request: Request) {
  // Verify cron secret to prevent abuse
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("Starting niche seed cron...");

  // Scrape niches one at a time to avoid rate limits
  for (const niche of NICHES) {
    await scrapeNiche(niche, "TikTok");
    await new Promise(r => setTimeout(r, 2000)); // 2s between requests
  }

  return NextResponse.json({ ok: true, niches: NICHES.length });
}
