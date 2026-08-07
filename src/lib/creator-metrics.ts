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
/** Brand-signal / CPM estimates need at least this many organic posts. */
export const MIN_POSTS_FOR_RELIABLE_METRICS = 3;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** True when sample size is large enough for CPM / value / frequency to be trustworthy. */
export function hasReliableCreatorMetrics(postsAnalyzed: number): boolean {
  return postsAnalyzed >= MIN_POSTS_FOR_RELIABLE_METRICS;
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

  // Drop zero-play stubs from view/like medians (keep them out of ER already).
  const withPlays = used.filter((v) => v.playCount > 0);
  const statPool = withPlays.length > 0 ? withPlays : used;

  const avgViews = Math.round(median(statPool.map((v) => v.playCount)));
  const avgLikes = Math.round(median(statPool.map((v) => v.likeCount)));
  const avgComments = Math.round(median(statPool.map((v) => v.commentCount)));
  const avgShares = Math.round(median(statPool.map((v) => v.shareCount)));

  const perViewEr = withPlays.map(
    (v) => ((v.likeCount + v.commentCount + v.shareCount) / v.playCount) * 100
  );
  const engagementRate = perViewEr.length ? round2(median(perViewEr)) : 0;

  const meanEngagement =
    used.reduce((s, v) => s + v.likeCount + v.commentCount + v.shareCount, 0) / used.length;
  const engagementByFollower = followers > 0 ? round2((meanEngagement / followers) * 100) : 0;
  const viewsPerFollower = followers > 0 ? round4(avgViews / followers) : 0;

  const times = used.map((v) => v.createTime);
  const lastTime = Math.max(...times);
  const firstTime = Math.min(...times);
  const lastPostAt = new Date(lastTime * 1000).toISOString();
  // Need ≥2 posts across a real time span — a single post must not become "7/week".
  const spanDays = (lastTime - firstTime) / 86400;
  const postFrequency =
    used.length >= 2 && spanDays >= 1
      ? round2((used.length / spanDays) * 7)
      : 0;

  return {
    avgViews, avgLikes, avgComments, avgShares, engagementRate,
    engagementByFollower, viewsPerFollower, postsAnalyzed: used.length,
    lastPostAt, postFrequency,
  };
}
