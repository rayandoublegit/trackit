import { describe, it, expect } from "vitest";
import { parseVideosRich } from "@/lib/scrapecreators";
import { topVideos } from "@/lib/creator-enrichment";

const SAMPLE = {
  aweme_list: [
    {
      aweme_id: "111",
      desc: "leg day",
      create_time: 1700000000,
      is_ad: false,
      share_url: "https://www.tiktok.com/@x/video/111",
      statistics: { play_count: 50000, digg_count: 4000, comment_count: 200, share_count: 100 },
      video: {
        dynamic_cover: { url_list: ["https://cdn.tiktok.com/dyn111.webp"] },
        play_addr: { url_list: ["https://v16-webapp.tiktok.com/video/111.mp4"] },
      },
    },
    {
      aweme_id: "222",
      desc: "sponsored",
      create_time: 1700100000,
      is_ad: true,
      share_url: "https://www.tiktok.com/@x/video/222",
      statistics: { play_count: 999999, digg_count: 10, comment_count: 1, share_count: 0 },
      video: { cover: { url_list: ["https://cdn.tiktok.com/c222.jpg"] } },
    },
    {
      aweme_id: "333",
      desc: "diet tips",
      create_time: 1700200000,
      is_ad: false,
      statistics: { play_count: 80000, digg_count: 6000, comment_count: 300, share_count: 250 },
      video: { ai_dynamic_cover: { url_list: ["https://cdn.tiktok.com/ai333.webp"] } },
    },
  ],
};

describe("parseVideosRich", () => {
  it("maps id, cover, share url, stats, ad flag and preserves order", () => {
    const r = parseVideosRich(SAMPLE);
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({
      id: "111",
      cover: "https://cdn.tiktok.com/dyn111.webp",
      shareUrl: "https://www.tiktok.com/@x/video/111",
      playUrl: "https://v16-webapp.tiktok.com/video/111.mp4",
      playCount: 50000,
      likeCount: 4000,
      isAd: false,
    });
    expect(r[1].isAd).toBe(true);
    expect(r[2].cover).toBe("https://cdn.tiktok.com/ai333.webp");
  });
  it("is safe on empty/garbage input", () => {
    expect(parseVideosRich(null)).toEqual([]);
    expect(parseVideosRich({})).toEqual([]);
  });
});

describe("topVideos", () => {
  it("drops ads, sorts by views desc, strips isAd", () => {
    const top = topVideos(parseVideosRich(SAMPLE));
    expect(top.map((v) => v.id)).toEqual(["333", "111"]); // 222 is an ad, dropped
    expect(top[0]).not.toHaveProperty("isAd");
  });
  it("caps at the requested max", () => {
    const many = parseVideosRich({
      aweme_list: Array.from({ length: 20 }, (_, i) => ({
        aweme_id: String(i),
        create_time: 1700000000 + i,
        statistics: { play_count: i * 1000 },
        video: { dynamic_cover: { url_list: ["u"] } },
      })),
    });
    expect(topVideos(many, 9)).toHaveLength(9);
  });
});
