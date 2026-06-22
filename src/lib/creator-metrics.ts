export interface VideoStat {
  playCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  createTime: number; // unix seconds
  isAd: boolean;
}

export interface CreatorMetrics {
  avgViews: number;
  avgLikes: number;
  avgComments: number;
  avgShares: number;
  engagementRate: number; // by view, %
  engagementByFollower: number; // %
  viewsPerFollower: number;
  postsAnalyzed: number;
  lastPostAt: string | null; // ISO
  postFrequency: number; // posts/week
}

export const MAX_POSTS_ANALYZED = 12;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeMetrics(
  followers: number,
  videos: VideoStat[],
  opts: { maxPosts?: number; nowMs?: number } = {}
): CreatorMetrics {
  const maxPosts = opts.maxPosts ?? MAX_POSTS_ANALYZED;
  const organic = videos.filter((v) => !v.isAd);
  const used = (organic.length > 0 ? organic : videos)
    .slice()
    .sort((a, b) => b.createTime - a.createTime)
    .slice(0, maxPosts);

  if (used.length === 0) {
    return {
      avgViews: 0, avgLikes: 0, avgComments: 0, avgShares: 0,
      engagementRate: 0, engagementByFollower: 0, viewsPerFollower: 0,
      postsAnalyzed: 0, lastPostAt: null, postFrequency: 0,
    };
  }

  const views = used.map((v) => v.playCount);
  const avgViews = Math.round(median(views));
  const avgLikes = Math.round(median(used.map((v) => v.likeCount)));
  const avgComments = Math.round(median(used.map((v) => v.commentCount)));
  const avgShares = Math.round(median(used.map((v) => v.shareCount)));

  const perViewEr = used
    .filter((v) => v.playCount > 0)
    .map((v) => ((v.likeCount + v.commentCount + v.shareCount) / v.playCount) * 100);
  const engagementRate = perViewEr.length ? round2(median(perViewEr)) : 0;

  const meanEngagement =
    used.reduce((s, v) => s + v.likeCount + v.commentCount + v.shareCount, 0) / used.length;
  const engagementByFollower = followers > 0 ? round2((meanEngagement / followers) * 100) : 0;
  const viewsPerFollower = followers > 0 ? round4(avgViews / followers) : 0;

  const times = used.map((v) => v.createTime);
  const lastTime = Math.max(...times);
  const firstTime = Math.min(...times);
  const lastPostAt = new Date(lastTime * 1000).toISOString();
  const spanDays = Math.max((lastTime - firstTime) / 86400, 1);
  const postFrequency = round2((used.length / spanDays) * 7);

  return {
    avgViews, avgLikes, avgComments, avgShares, engagementRate,
    engagementByFollower, viewsPerFollower, postsAnalyzed: used.length,
    lastPostAt, postFrequency,
  };
}
