import { describe, it, expect } from "vitest";
import { parseProfile, parseVideos, extractCaptions } from "@/lib/scrapecreators";

describe("parseProfile", () => {
  it("maps stats and user fields", () => {
    const raw = { user: { nickname: "Eres", signature: "fit bio", verified: true }, stats: { followerCount: 6726894, videoCount: 120 } };
    const p = parseProfile(raw);
    expect(p).toEqual({ followers: 6726894, verified: true, bio: "fit bio", displayName: "Eres", videoCount: 120 });
  });
  it("defaults missing fields", () => {
    expect(parseProfile({})).toEqual({ followers: 0, verified: false, bio: "", displayName: "", videoCount: 0 });
  });
});

describe("parseVideos", () => {
  it("maps statistics and is_ad", () => {
    const raw = { aweme_list: [
      { create_time: 100, is_ad: false, desc: "leg day", statistics: { play_count: 20000, digg_count: 900, comment_count: 80, share_count: 20 } },
      { create_time: 90, is_ad: true, desc: "ad", statistics: { play_count: 5, digg_count: 1, comment_count: 0, share_count: 0 } },
    ]};
    const v = parseVideos(raw);
    expect(v).toHaveLength(2);
    expect(v[0]).toEqual({ playCount: 20000, likeCount: 900, commentCount: 80, shareCount: 20, createTime: 100, isAd: false });
    expect(v[1].isAd).toBe(true);
  });
  it("handles empty", () => expect(parseVideos({})).toEqual([]));
});

describe("extractCaptions", () => {
  it("collects non-empty descs", () => {
    const raw = { aweme_list: [{ desc: "leg day" }, { desc: "" }, { desc: "recipe" }] };
    expect(extractCaptions(raw)).toEqual(["leg day", "recipe"]);
  });
});
