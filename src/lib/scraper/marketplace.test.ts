import { describe, expect, it } from "vitest";
import { marketSeeds, marketTarget, nextMarketPage, parseMarketPage, parseMarketTarget } from "./marketplace";

describe("Creator Marketplace walk", () => {
  it("round-trips a target", () => {
    const t = { country: "FR", range: "10K-100K", sort: "follower", page: 4 };
    expect(parseMarketTarget(marketTarget(t))).toEqual(t);
    expect(parseMarketTarget("market:XX:10K-100K:follower:1")).toBeNull();
    expect(parseMarketTarget("gym workout")).toBeNull();
  });

  it("parses a page (shape from the ScrapeCreators docs)", () => {
    const page = parseMarketPage({
      creators: [
        { nick_name: "SANIEV", country_code: "US", follower_cnt: 431339, tt_link: "https://www.tiktok.com/@sanievv_", avatar_url: "https://x/a.png" },
        { nick_name: "no link", follower_cnt: 10 },
      ],
      pagination: { page: 1, size: 20, total: 10, has_more: true },
    });
    expect(page.hasMore).toBe(true);
    expect(page.creators).toEqual([{ username: "sanievv_", displayName: "SANIEV", followers: 431339, countryCode: "US", avatarUrl: "https://x/a.png" }]);
  });

  it("walks while pages bring new creators", () => {
    const t = { country: "FR", range: "10K-100K", sort: "follower", page: 1 };
    expect(nextMarketPage(t, true, 0, 100)?.page).toBe(2);
    expect(nextMarketPage({ ...t, page: 5 }, true, 12, 100)?.page).toBe(6);
    expect(nextMarketPage({ ...t, page: 5 }, true, 0, 100)).toBeNull();
    expect(nextMarketPage(t, false, 20, 100)).toBeNull();
    expect(nextMarketPage({ ...t, page: 100 }, true, 20, 100)).toBeNull();
  });

  it("starts with French creators", () => {
    const seeds = marketSeeds();
    expect(seeds[0].country).toBe("FR");
    expect(seeds.length).toBe(24 * 3 * 3);
  });
});
