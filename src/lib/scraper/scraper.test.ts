import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRapidProfile, parseRapidSearch, parseRapidVideos } from "./sources";
import { hashtagsOf } from "./types";
import { nextScrapeAt, retryAfterFailure, scrapePriority, trackedIntervalDays } from "./schedule";
import { remaining, weekIndex, weekStart, weeklyCaps } from "./budget";
import { weeklyDiscoveryPlan } from "./discovery-plan";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-30T12:00:00Z");

describe("RapidAPI TikTok parsers", () => {
  it("reads a profile with its stats", () => {
    const p = parseRapidProfile(
      {
        code: 0,
        data: {
          user: { uniqueId: "Luna.Beauty", nickname: "Luna", avatarLarger: "https://p16.tiktokcdn.com/a.jpg", signature: "skincare", verified: true, bioLink: { link: "https://luna.shop" } },
          stats: { followerCount: 142000, followingCount: 310, heartCount: 5200000, videoCount: 420 },
        },
      },
      "luna.beauty",
    );
    expect(p).toMatchObject({
      username: "luna.beauty",
      followers: 142000,
      following: 310,
      totalLikes: 5200000,
      videoCount: 420,
      verified: true,
      bioLink: "https://luna.shop",
      avatarUrl: "https://p16.tiktokcdn.com/a.jpg",
    });
  });

  it("returns null when the account does not exist", () => {
    expect(parseRapidProfile({ code: -1, data: {} }, "ghost")).toBeNull();
  });

  it("reads videos, photos and product links", () => {
    const videos = parseRapidVideos(
      {
        data: {
          videos: [
            { video_id: "111", title: "Morning routine #skincare #GRWM", origin_cover: "https://p16.tiktokcdn.com/c1.jpg", duration: 34, play_count: 90000, digg_count: 9000, comment_count: 120, share_count: 80, collect_count: 400, create_time: 1790000000, anchors: [{ type: 35 }] },
            { video_id: "222", title: "Haul", cover: "https://p16.tiktokcdn.com/c2.jpg", images: [{}, {}], play_count: 5000, create_time: 1789000000 },
            { title: "no id" },
          ],
        },
      },
      "@Luna.Beauty",
    );
    expect(videos).toHaveLength(2);
    expect(videos[0]).toMatchObject({
      id: "111",
      hashtags: ["skincare", "grwm"],
      durationSeconds: 34,
      mediaType: "video",
      hasProductLink: true,
      views: 90000,
      saves: 400,
      shareUrl: "https://www.tiktok.com/@luna.beauty/video/111",
      postedAt: new Date(1790000000 * 1000).toISOString(),
    });
    expect(videos[1]).toMatchObject({ mediaType: "carousel", shareUrl: "https://www.tiktok.com/@luna.beauty/photo/222", hasProductLink: false });
  });

  it("reads search hits", () => {
    expect(parseRapidSearch({ data: { user_list: [{ user_info: { unique_id: "Nora.D", nickname: "Nora", follower_count: 56000 } }, { user_info: {} }] } })).toEqual([
      { username: "nora.d", displayName: "Nora", followers: 56000, avatarUrl: "" },
    ]);
  });

  it("extracts unique lower-case hashtags", () => {
    expect(hashtagsOf("#Skincare tips #skincare #été #a")).toEqual(["skincare", "été"]);
  });
});

describe("refresh schedule: every creator once a week", () => {
  const base = { followers: 50_000, followersGrowthPct7d: null, growthScore: null, lastPostAt: new Date(NOW - 2 * DAY).toISOString() };
  afterEach(() => vi.unstubAllEnvs());

  it("orders the queue: fast growers first, inactive last", () => {
    expect(scrapePriority({ ...base, followersGrowthPct7d: 6 }, NOW)).toBe(1);
    expect(scrapePriority({ ...base, growthScore: 20 }, NOW)).toBe(2);
    expect(scrapePriority({ ...base, followers: 2_000_000 }, NOW)).toBe(3);
    expect(scrapePriority({ ...base, followers: 300_000 }, NOW)).toBe(4);
    expect(scrapePriority(base, NOW)).toBe(6);
    expect(scrapePriority({ ...base, lastPostAt: new Date(NOW - 90 * DAY).toISOString() }, NOW)).toBe(8);
  });

  it("comes back weekly when it matters, less often for small or inactive accounts", () => {
    for (const p of [1, 2, 3, 4]) expect(nextScrapeAt(p, NOW)).toBe(new Date(NOW + 7 * DAY).toISOString());
    expect(nextScrapeAt(6, NOW)).toBe(new Date(NOW + 14 * DAY).toISOString());
    expect(nextScrapeAt(8, NOW)).toBe(new Date(NOW + 28 * DAY).toISOString());
    vi.stubEnv("SCRAPE_REFRESH_INTERVAL_DAYS", "14");
    expect(nextScrapeAt(1, NOW)).toBe(new Date(NOW + 14 * DAY).toISOString());
  });

  it("refreshes creators brands work with twice a week (configurable, 0 = off)", () => {
    expect(trackedIntervalDays()).toBe(3.5);
    vi.stubEnv("SCRAPE_TRACKED_INTERVAL_DAYS", "0");
    expect(trackedIntervalDays()).toBe(0);
  });

  it("backs off after failures: 1, 2, 4 then 8 weeks", () => {
    expect(retryAfterFailure(1, NOW)).toBe(new Date(NOW + 7 * DAY).toISOString());
    expect(retryAfterFailure(2, NOW)).toBe(new Date(NOW + 14 * DAY).toISOString());
    expect(retryAfterFailure(3, NOW)).toBe(new Date(NOW + 28 * DAY).toISOString());
    expect(retryAfterFailure(9, NOW)).toBe(new Date(NOW + 56 * DAY).toISOString());
  });
});

describe("weekly budget", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("weeks start on Monday 00:00 UTC", () => {
    expect(weekStart(Date.parse("2026-09-30T12:00:00Z")).toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(weekStart(Date.parse("2026-10-05T00:00:00Z")).toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(weekIndex(Date.parse("2026-10-05T00:00:00Z")) - weekIndex(Date.parse("2026-10-04T23:59:59Z"))).toBe(1);
  });

  it("reads the caps from the environment", () => {
    expect(weeklyCaps()).toEqual({ refreshes: 65_000, discoveryKeywords: 1_200, newCreators: 12_000 });
    vi.stubEnv("SCRAPE_WEEKLY_MAX_CREATORS", "50000");
    vi.stubEnv("SCRAPE_WEEKLY_MAX_DISCOVERY_KEYWORDS", "0");
    expect(weeklyCaps()).toMatchObject({ refreshes: 50_000, discoveryKeywords: 0 });
    expect(remaining(weeklyCaps(), { refreshJobs: 50_010, discoverJobs: 3, newCreators: 0, apiCalls: 0 })).toMatchObject({ refreshes: 0, discoveryKeywords: 0 });
  });
});

describe("weekly discovery plan", () => {
  const queries = ["a", "b", "c", "d", "e"];

  it("splits the searches across platforms and rotates every week", () => {
    const w0 = weeklyDiscoveryPlan({ platforms: ["tiktok", "instagram", "youtube"], maxKeywords: 7, weekIndex: 0, queries });
    expect(w0.map((i) => `${i.platform}:${i.keyword}`)).toEqual(["tiktok:a", "tiktok:b", "tiktok:c", "instagram:a", "instagram:b", "youtube:a", "youtube:b"]);
    const w1 = weeklyDiscoveryPlan({ platforms: ["tiktok"], maxKeywords: 2, weekIndex: 1, queries });
    expect(w1.map((i) => i.keyword)).toEqual(["c", "d"]);
    const w2 = weeklyDiscoveryPlan({ platforms: ["tiktok"], maxKeywords: 2, weekIndex: 2, queries });
    expect(w2.map((i) => i.keyword)).toEqual(["e", "a"]);
  });

  it("puts hand-typed keywords first and never exceeds the cap", () => {
    const plan = weeklyDiscoveryPlan({ platforms: ["tiktok", "youtube"], maxKeywords: 3, weekIndex: 0, extra: ["Protein Bars"], queries });
    expect(plan.map((i) => `${i.platform}:${i.keyword}`)).toEqual(["tiktok:protein bars", "youtube:protein bars", "tiktok:a"]);
    expect(weeklyDiscoveryPlan({ platforms: ["tiktok"], maxKeywords: 0, weekIndex: 0, queries })).toEqual([]);
  });

  it("uses the niche tree by default", () => {
    const plan = weeklyDiscoveryPlan({ platforms: ["tiktok"], maxKeywords: 10, weekIndex: 3 });
    expect(plan).toHaveLength(10);
    expect(new Set(plan.map((i) => i.keyword)).size).toBe(10);
  });
});
