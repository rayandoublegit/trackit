import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SC_API_KEY = process.env.SCRAPECREATORS_API_KEY;
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
  avatar_168x168?: { url_list?: string[] };
  avatar_medium?: { url_list?: string[] };
};

async function seedNiche(niche: string) {
  if (!SC_API_KEY) return 0;
  try {
    const res = await fetch(
      `https://api.scrapecreators.com/v1/tiktok/search/users?query=${encodeURIComponent(niche)}`,
      { headers: { "x-api-key": SC_API_KEY } }
    );
    if (!res.ok) return 0;
    const data = await res.json();
    const userList = (data?.user_list ?? []) as { user_info?: SCUser }[];
    const users = userList
      .map(u => u.user_info)
      .filter((u): u is SCUser => !!u && !!u.unique_id);

    const upserts = users.map(u => {
      const followers = Number(u.follower_count || 0);
      const avatar = u.avatar_medium?.url_list?.[0] || u.avatar_168x168?.url_list?.[0] || "";
      return {
        username: String(u.unique_id),
        display_name: String(u.nickname || u.unique_id),
        avatar_url: avatar ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(String(u.nickname || u.unique_id))}&background=e5e5e5&color=9a9a9a&size=200&bold=true&rounded=true`,
        platform: "TikTok",
        followers,
        engagement_rate: estimateEngagement(followers),
        avg_views: Math.floor(followers * 0.1),
        bio: String(u.signature || ""),
        niches: [niche.toLowerCase()],
        video_thumbnails: [],
        last_scraped_at: new Date().toISOString(),
      };
    });

    if (upserts.length > 0) {
      await supabaseAdmin.from("creators_index").upsert(upserts, { onConflict: "username" });
    }
    return upserts.length;
  } catch (e) {
    console.error(`Failed to seed ${niche}:`, e);
    return 0;
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let total = 0;
  for (const niche of NICHES) {
    total += await seedNiche(niche);
    await new Promise(r => setTimeout(r, 500));
  }

  return NextResponse.json({ ok: true, niches: NICHES.length, creators: total });
}
