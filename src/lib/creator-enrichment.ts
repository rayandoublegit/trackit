import { computeMetrics } from "@/lib/creator-metrics";
import type { VideoStat } from "@/lib/creator-metrics";
import { scoreQuality } from "@/lib/creator-quality";
import type { CreatorProfile } from "@/lib/scrapecreators";

export interface EnrichmentRow {
  username: string;
  display_name: string;
  followers: number;
  bio: string;
  avg_views: number;
  avg_likes: number;
  avg_comments: number;
  avg_shares: number;
  engagement_rate: number;
  engagement_by_follower: number;
  views_per_follower: number;
  posts_analyzed: number;
  last_post_at: string | null;
  post_frequency: number;
  authenticity_score: number;
  quality_status: string;
  enrichment_status: "enriched";
  enriched_at: string;
}

export function buildEnrichmentRow(
  username: string,
  profile: CreatorProfile,
  videos: VideoStat[],
  nowMs: number = Date.now()
): EnrichmentRow {
  const metrics = computeMetrics(profile.followers, videos, { nowMs });
  const quality = scoreQuality(profile.followers, metrics, { nowMs });
  return {
    username,
    display_name: profile.displayName,
    followers: profile.followers,
    bio: profile.bio,
    avg_views: metrics.avgViews,
    avg_likes: metrics.avgLikes,
    avg_comments: metrics.avgComments,
    avg_shares: metrics.avgShares,
    engagement_rate: metrics.engagementRate,
    engagement_by_follower: metrics.engagementByFollower,
    views_per_follower: metrics.viewsPerFollower,
    posts_analyzed: metrics.postsAnalyzed,
    last_post_at: metrics.lastPostAt,
    post_frequency: metrics.postFrequency,
    authenticity_score: quality.authenticityScore,
    quality_status: quality.qualityStatus,
    enrichment_status: "enriched",
    enriched_at: new Date(nowMs).toISOString(),
  };
}
