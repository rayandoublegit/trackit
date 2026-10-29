import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { clientImageUrl } from "@/lib/client-image-url";
import { feedAvatarUrlForCreator } from "@/lib/feed-avatar-url";
import { estimatedCostPerPost, estimatedCpm, valueScore, valueTier } from "@/lib/creator-value";
import { displayVideoThumbnails } from "@/lib/tiktok-video-thumbs";
import { getAuthedUserId } from "@/lib/api-auth";
import { canSeeCreatorEmails } from "@/lib/plan-limits";
import { redactCreatorEmail } from "@/lib/plan-paywall";
import { resolveOwnerPlan } from "@/lib/plan-gate-server";

export const dynamic = "force-dynamic";

function mapTopVideos(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 3).map((row) => {
    const v = row as { id?: string; cover?: string; shareUrl?: string; playUrl?: string; playCount?: number };
    return {
      id: v.id ?? "",
      cover: clientImageUrl(v.cover ?? ""),
      shareUrl: v.shareUrl ?? "",
      playUrl: v.playUrl ?? "",
      playCount: Number(v.playCount ?? 0),
    };
  });
}

function mapVideoThumbnails(videoThumbnails: unknown, topVideos: unknown) {
  return displayVideoThumbnails(
    Array.isArray(videoThumbnails) ? videoThumbnails : [],
    Array.isArray(topVideos) ? topVideos : [],
    3
  ).map((t) => ({
    views: t.views,
    thumbnail: clientImageUrl(t.thumbnail) || null,
    url: t.url,
  }));
}

// Deep detail for the in-app creator drawer. Reads the shared discovery index;
// signed-in users only, and the contact email only for plans that include it
// (same rule as /api/catalog).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { username } = await params;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: "no db" }, { status: 503 });
  }
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data, error } = await admin
    .from("creators_index")
    .select("*")
    .eq("username", username)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const c = data as Record<string, unknown>;
  const emailsVisible = canSeeCreatorEmails(await resolveOwnerPlan(admin, userId));

  const followers = Number(c.followers ?? 0);
  const avgViews = Number(c.avg_views ?? 0);
  const er = Number(c.engagement_rate ?? 0);
  const postsAnalyzed = Number(c.posts_analyzed ?? 0);
  const estCostPerPost = estimatedCostPerPost(followers);
  const postFrequency = postsAnalyzed >= 2 ? Number(c.post_frequency ?? 0) : 0;

  const creator = {
        username: c.username,
        displayName: (c.display_name as string | null) ?? c.username,
        avatarUrl: feedAvatarUrlForCreator(String(c.username), String(c.avatar_url ?? "")),
        bio: (c.bio as string | null) ?? "",
        followersCount: followers,
        engagementRate: er,
        engagementByFollower: Number(c.engagement_by_follower ?? 0),
        avgViews,
        avgLikes: Number(c.avg_likes ?? 0),
        avgComments: Number(c.avg_comments ?? 0),
        avgShares: Number(c.avg_shares ?? 0),
        viewsPerFollower: Number(c.views_per_follower ?? 0),
        postsAnalyzed,
        postFrequency,
        lastPostAt: (c.last_post_at as string | null) ?? null,
        authenticityScore: Number(c.authenticity_score ?? 0),
        qualityStatus: (c.quality_status as string | null) ?? "ok",
        platform: (c.platform as string | null) ?? "TikTok",
        email: (c.email as string | null) ?? null,
        niche: (c.primary_niche as string | null) ?? "",
        primaryNiche: (c.primary_niche as string | null) ?? "",
        niches: Array.isArray(c.niches) ? c.niches : [],
        language: (c.language as string | null) ?? "unknown",
        countryCode: (c.country_code as string | null) ?? null,
        estCostPerPost,
        estCpm: estimatedCpm(estCostPerPost, avgViews),
        valueScore: valueScore(followers, er, avgViews),
        valueTier: valueTier(followers),
        topVideos: mapTopVideos(c.top_videos),
        videoThumbnails: mapVideoThumbnails(c.video_thumbnails, c.top_videos),
  };
  return NextResponse.json(
    { creator: emailsVisible ? creator : redactCreatorEmail(creator) },
    {
      headers: {
        // Short browser/CDN cache — drawer reopen & hover prefetch hit faster.
        "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      },
    }
  );
}
