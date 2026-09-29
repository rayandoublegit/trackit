import { describe, expect, it } from "vitest";
import { parseRapidProfile, parseRapidSearch, parseRapidVideos } from "./sources";
import { hashtagsOf } from "./types";
import { nextScrapeAt, retryAfterFailure, scrapePriority } from "./schedule";

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

describe("refresh schedule", () => {
  const base = { followers: 50_000, followersGrowthPct7d: null, growthScore: null, lastPostAt: new Date(NOW - 2 * DAY).toISOString() };

  it("refreshes fast-growing creators daily", () => {
    expect(scrapePriority({ ...base, followersGrowthPct7d: 6 }, NOW)).toBe(1);
    expect(scrapePriority({ ...base, growthScore: 20 }, NOW)).toBe(2);
    expect(nextScrapeAt(1, NOW)).toBe(new Date(NOW + DAY).toISOString());
  });

  it("spaces out big stable accounts and inactive ones", () => {
    expect(scrapePriority({ ...base, followers: 2_000_000 }, NOW)).toBe(3);
    expect(scrapePriority({ ...base, followers: 300_000 }, NOW)).toBe(4);
    expect(scrapePriority(base, NOW)).toBe(6);
    expect(scrapePriority({ ...base, lastPostAt: new Date(NOW - 90 * DAY).toISOString() }, NOW)).toBe(8);
    expect(nextScrapeAt(8, NOW)).toBe(new Date(NOW + 7 * DAY).toISOString());
  });

  it("backs off after failures, capped at two weeks", () => {
    expect(retryAfterFailure(1, NOW)).toBe(new Date(NOW + DAY).toISOString());
    expect(retryAfterFailure(3, NOW)).toBe(new Date(NOW + 4 * DAY).toISOString());
    expect(retryAfterFailure(9, NOW)).toBe(new Date(NOW + 14 * DAY).toISOString());
  });
});
