import { computeMetrics } from "@/lib/creator-metrics";
import type { VideoStat } from "@/lib/creator-metrics";
import { scoreQuality } from "@/lib/creator-quality";
import type { CreatorProfile, RichVideo } from "@/lib/scrapecreators";

export interface TopVideo {
  id: string;
  cover: string;
  shareUrl: string;
  playUrl: string;
  playCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  createTime: number;
  desc: string;
}

export const MAX_TOP_VIDEOS = 9;

// Pick the best organic videos for the in-app gallery: drop ads, require an id
// (needed for the embed), sort by views, cap at MAX_TOP_VIDEOS, strip isAd.
export function topVideos(rich: RichVideo[], max: number = MAX_TOP_VIDEOS): TopVideo[] {
  const withId = rich.filter((v) => v.id);
  const organic = withId.filter((v) => !v.isAd);
  const pool = organic.length > 0 ? organic : withId;
  return pool
    .slice()
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, max)
    .map((v) => ({
      id: v.id,
      cover: v.cover,
      shareUrl: v.shareUrl,
      playUrl: v.playUrl,
      playCount: v.playCount,
      likeCount: v.likeCount,
      commentCount: v.commentCount,
      shareCount: v.shareCount,
      createTime: v.createTime,
      desc: v.desc,
    }));
}

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
  top_videos: TopVideo[];
}

export function buildEnrichmentRow(
  username: string,
  profile: CreatorProfile,
  videos: VideoStat[],
  nowMs: number = Date.now(),
  richVideos: RichVideo[] = []
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
    top_videos: topVideos(richVideos),
  };
}
