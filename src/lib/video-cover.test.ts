import { describe, expect, it } from "vitest";
import { videoCover, videoThumbRoute } from "@/lib/video-cover";

const stored = "https://xyz.supabase.co/storage/v1/object/public/covers/tiktok/a.jpg";
const tiktokCdn = "https://p16-sign-va.tiktokcdn.com/obj/cover.jpeg?x-expires=1";
const igCdn = "https://scontent-cdg4-1.cdninstagram.com/v/t51/cover.jpg";

describe("videoCover", () => {
  it("serves a stored cover directly, with no fallback", () => {
    expect(videoCover({ platform: "tiktok", username: "a", raw: stored, topIndex: 0 })).toEqual({ cover: stored });
  });

  it("serves a TikTok CDN cover through the image proxy, the thumbs route only as a fallback", () => {
    const out = videoCover({ platform: "tiktok", username: "a", raw: tiktokCdn, topIndex: 1 });
    expect(out.cover).toBe(`/api/img-proxy?url=${encodeURIComponent(tiktokCdn)}`);
    expect(out.fallback).toBe(videoThumbRoute("a", 1));
  });

  it("never sends the first paint to the scrape route when a cover exists", () => {
    for (const i of [0, 1, 2]) {
      const out = videoCover({ platform: "TikTok", username: "a", raw: tiktokCdn, topIndex: i });
      expect(out.cover).not.toContain("creator-video-thumbs");
    }
  });

  it("proxies Instagram CDN covers and offers no TikTok refetch", () => {
    expect(videoCover({ platform: "instagram", username: "ig_a", raw: igCdn, topIndex: 0 })).toEqual({
      cover: `/api/img-proxy?url=${encodeURIComponent(igCdn)}`,
    });
  });

  it("offers the thumbs route only for the first 3 stored TikTok top videos", () => {
    expect(videoCover({ platform: "tiktok", username: "a", raw: tiktokCdn, topIndex: 3 }).fallback).toBeUndefined();
    // Tracked videos have no position in top_videos.
    expect(videoCover({ platform: "tiktok", username: "a", raw: tiktokCdn }).fallback).toBeUndefined();
  });

  it("uses the thumbs route as the cover only when nothing is stored", () => {
    expect(videoCover({ platform: "tiktok", username: "a b", raw: "", topIndex: 2 })).toEqual({ cover: videoThumbRoute("a b", 2) });
    expect(videoCover({ platform: "tiktok", username: "a", raw: "" })).toEqual({ cover: "" });
    expect(videoCover({ platform: "youtube", username: "yt_a", raw: null, topIndex: 0 })).toEqual({ cover: "" });
  });
});
