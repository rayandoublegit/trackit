import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { clientImageUrl } from "@/lib/client-image-url";
import { feedAvatarUrlForCreator } from "@/lib/feed-avatar-url";
import { estimatedCostPerPost, estimatedCpm, valueScore, valueTier } from "@/lib/creator-value";

export const dynamic = "force-dynamic";

function mapTopVideos(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const v = row as { id?: string; cover?: string; shareUrl?: string; playCount?: number };
    return {
      id: v.id ?? "",
      cover: clientImageUrl(v.cover ?? ""),
      shareUrl: v.shareUrl ?? "",
      playCount: Number(v.playCount ?? 0),
    };
  });
}

function mapVideoThumbnails(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const t = row as { views?: number; thumbnail?: string | null; url?: string | null };
    return {
      views: Number(t.views ?? 0),
      thumbnail: clientImageUrl(t.thumbnail) || null,
      url: t.url ?? null,
    };
  });
}

// Deep detail for the in-app creator drawer. Reads the shared discovery index
// (not user-private), so no per-user auth — the dashboard already gates access,
// and advanced sections are gated client-side by plan.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: "no db" }, { status: 503 });
  }
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data: c, error } = await admin
    .from("creators_index")
    .select("*")
    .eq("username", username)
    .maybeSingle();
  if (error || !c) return NextResponse.json({ error: "not found" }, { status: 404 });

  const followers = Number(c.followers ?? 0);
  const avgViews = Number(c.avg_views ?? 0);
  const er = Number(c.engagement_rate ?? 0);
  const estCostPerPost = estimatedCostPerPost(followers);

  return NextResponse.json({
    creator: {
      username: c.username,
      displayName: c.display_name ?? c.username,
      avatarUrl: feedAvatarUrlForCreator(String(c.username), String(c.avatar_url ?? "")),
      bio: c.bio ?? "",
      followersCount: followers,
      engagementRate: er,
      engagementByFollower: Number(c.engagement_by_follower ?? 0),
      avgViews,
      avgLikes: Number(c.avg_likes ?? 0),
      avgComments: Number(c.avg_comments ?? 0),
      avgShares: Number(c.avg_shares ?? 0),
      viewsPerFollower: Number(c.views_per_follower ?? 0),
      postsAnalyzed: Number(c.posts_analyzed ?? 0),
      postFrequency: Number(c.post_frequency ?? 0),
      lastPostAt: c.last_post_at ?? null,
      authenticityScore: Number(c.authenticity_score ?? 0),
      qualityStatus: c.quality_status ?? "ok",
      platform: c.platform ?? "TikTok",
      email: c.email ?? null,
      niche: c.primary_niche ?? "",
      primaryNiche: c.primary_niche ?? "",
      niches: Array.isArray(c.niches) ? c.niches : [],
      language: c.language ?? "unknown",
      countryCode: c.country_code ?? null,
      estCostPerPost,
      estCpm: estimatedCpm(estCostPerPost, avgViews),
      valueScore: valueScore(followers, er, avgViews),
      valueTier: valueTier(followers),
      topVideos: mapTopVideos(c.top_videos),
      videoThumbnails: mapVideoThumbnails(c.video_thumbnails),
    },
  });
}
