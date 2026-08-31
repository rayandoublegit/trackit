import { describe, expect, it } from "vitest";
import {
  detectPostPlatform,
  isSupportedPostUrl,
  parseInstagramPostStats,
} from "@/lib/scrapecreators";

describe("detectPostPlatform", () => {
  it("detects TikTok video URLs", () => {
    expect(detectPostPlatform("https://www.tiktok.com/@x/video/123")).toBe("tiktok");
    expect(isSupportedPostUrl("https://vm.tiktok.com/ZMabc/")).toBe(true);
  });

  it("detects Instagram reel/post URLs", () => {
    expect(detectPostPlatform("https://www.instagram.com/reel/DF5s0duxDts/")).toBe("instagram");
    expect(detectPostPlatform("https://www.instagram.com/p/ABC123/")).toBe("instagram");
    expect(detectPostPlatform("https://www.instagram.com/reels/ABC123/")).toBe("instagram");
  });

  it("rejects profile-only Instagram URLs", () => {
    expect(detectPostPlatform("https://www.instagram.com/someuser/")).toBeNull();
    expect(isSupportedPostUrl("https://www.instagram.com/someuser/")).toBe(false);
  });
});

describe("parseInstagramPostStats", () => {
  it("maps ScrapeCreators xdt_shortcode_media fields", () => {
    const stats = parseInstagramPostStats({
      success: true,
      data: {
        xdt_shortcode_media: {
          video_play_count: 4651,
          video_view_count: 1639,
          edge_media_preview_like: { count: 88 },
          edge_media_to_parent_comment: { count: 12 },
          taken_at_timestamp: 1700000000,
        },
      },
    });
    expect(stats.views).toBe(4651);
    expect(stats.likes).toBe(88);
    expect(stats.comments).toBe(12);
    expect(stats.shares).toBeNull();
    expect(stats.postedAt).toBe(new Date(1700000000 * 1000).toISOString());
  });
});
