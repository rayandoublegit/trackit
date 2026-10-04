import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyHttpFailure, ProviderError } from "./http";
import { creatorKey, handleFromKey, knownKeys, normalizePlatform, platformLabel } from "./identity";
import {
  AllProvidersFailed,
  enabledPlatforms,
  parseRapidProfile,
  parseRapidSearch,
  parseRapidVideos,
  parseScrapeCreatorsTikTokProfile,
  parseScrapeCreatorsTikTokVideos,
  providerOrder,
  resetProviderHealth,
  sourceFor,
} from "./sources";
import { parseInstagramPosts, parseInstagramProfile, parseInstagramSearch } from "./sources-instagram";
import { mergeYouTubeUploads, parseYouTubeChannel, parseYouTubeSearch, parseYouTubeShorts, parseYouTubeVideos } from "./sources-youtube";
import { compactNumber } from "./sc-client";
import { CallMeter } from "./types";
import {
  fakeFetch,
  igPosts,
  igProfile,
  igSearch,
  isApiCall,
  PROVIDER_ENV,
  rapidProfile,
  rapidVideos,
  scProfile,
  scTikTokSearch,
  scVideos,
  ytChannel,
  ytSearch,
  ytShorts,
  ytVideos,
} from "./testing/fixtures";

describe("identity: (platform, lower(handle)), never a provider id", () => {
  it("normalizes every spelling of a platform", () => {
    expect(normalizePlatform("TikTok")).toBe("tiktok");
    expect(normalizePlatform(" tiktok ")).toBe("tiktok");
    expect(normalizePlatform(null)).toBe("tiktok");
    expect(normalizePlatform("Instagram")).toBe("instagram");
    expect(normalizePlatform("YouTube")).toBe("youtube");
    expect(normalizePlatform("Twitter")).toBeNull();
    expect(platformLabel("tiktok")).toBe("TikTok");
  });

  it("gives each platform its own storage key and reads older rows", () => {
    expect(creatorKey("tiktok", "@Luna.Beauty")).toBe("luna.beauty");
    expect(creatorKey("instagram", "Mia.Style")).toBe("ig_mia.style");
    expect(creatorKey("youtube", "@RunClub")).toBe("yt_runclub");
    expect(creatorKey("instagram", "ig_real")).toBe("ig_ig_real");
    expect(handleFromKey("instagram", "ig_mia.style")).toBe("mia.style");
    expect(handleFromKey("instagram", "mia.style")).toBe("mia.style");
    expect(handleFromKey("tiktok", "ig_not_a_prefix")).toBe("ig_not_a_prefix");
    expect(knownKeys("instagram", "mia")).toEqual(["ig_mia", "mia"]);
    expect(knownKeys("tiktok", "Luna")).toEqual(["luna"]);
  });
});

describe("TikTok: both providers parse to the same creator", () => {
  it("same profile from ScrapeCreators and RapidAPI", () => {
    const a = parseScrapeCreatorsTikTokProfile(scProfile(), "luna.beauty");
    const b = parseRapidProfile(rapidProfile(), "luna.beauty");
    expect(a).toEqual(b);
    expect(a).toMatchObject({ username: "luna.beauty", followers: 142_000, following: 310, totalLikes: 5_200_000, videoCount: 420, verified: true, bioLink: "https://luna.shop" });
  });

  it("same videos: ids, canonical links, duration, format, product link", () => {
    const a = parseScrapeCreatorsTikTokVideos(scVideos(), "luna.beauty");
    const b = parseRapidVideos(rapidVideos(), "luna.beauty");
    expect(a).toEqual(b);
    expect(a[0]).toMatchObject({
      id: "111",
      shareUrl: "https://www.tiktok.com/@luna.beauty/video/111",
      durationSeconds: 34,
      mediaType: "video",
      format: "short",
      hashtags: ["skincare", "grwm"],
      hasProductLink: true,
      productUrl: "https://shop.tiktok.com/view/product/1729",
      views: 90_000,
      saves: 400,
      postedAt: new Date(1_790_000_000 * 1000).toISOString(),
    });
    expect(a[1]).toMatchObject({ id: "222", mediaType: "carousel", format: "carousel", shareUrl: "https://www.tiktok.com/@luna.beauty/photo/222", durationSeconds: null, productUrl: null });
  });

  it("returns null when the account does not exist", () => {
    expect(parseRapidProfile({ code: -1, data: {} }, "ghost")).toBeNull();
    expect(parseScrapeCreatorsTikTokProfile({ success: true }, "ghost")).toBeNull();
  });

  it("reads search hits and keeps unknown follower counts unknown", () => {
    expect(parseRapidSearch(scTikTokSearch)[0]).toEqual({ username: "nora.d", displayName: "Nora", followers: 56_000, avatarUrl: "" });
    expect(parseRapidSearch({ data: { user_list: [{ user_info: { unique_id: "x" } }] } })[0].followers).toBeNull();
  });
});

describe("Instagram (ScrapeCreators)", () => {
  it("reads the profile", () => {
    expect(parseInstagramProfile(igProfile, "mia.style")).toEqual({
      username: "mia.style",
      displayName: "Mia",
      avatarUrl: "https://scontent.cdninstagram.com/v/pic_hd.jpg",
      bio: "fashion & fits",
      bioLink: "https://mia.store",
      followers: 24_555,
      following: 110,
      totalLikes: null,
      videoCount: 90,
      verified: false,
      category: null,
    });
    expect(parseInstagramProfile({ success: true, data: {} }, "ghost")).toBeNull();
  });

  it("reads the business category", () => {
    const profile = { ...igProfile, data: { ...igProfile.data, user: { ...igProfile.data.user, category_name: "Clothing (Brand)" } } };
    expect(parseInstagramProfile(profile, "mia.style")?.category).toBe("Clothing (Brand)");
  });

  it("reads reels and carousels into the shared video shape", () => {
    const [reel, carousel] = parseInstagramPosts(igPosts);
    expect(reel).toMatchObject({
      id: "DKSMEpKRd6h",
      mediaType: "video",
      format: "short",
      views: 2647,
      likes: 29,
      comments: 7,
      durationSeconds: 72,
      shareUrl: "https://www.instagram.com/p/DKSMEpKRd6h/",
      coverUrl: "https://scontent.cdninstagram.com/v/reel.jpg",
      hashtags: ["ootd"],
      hasProductLink: true,
      productUrl: "https://mia.store/p/coat",
      postedAt: new Date(1_748_622_051 * 1000).toISOString(),
    });
    expect(carousel).toMatchObject({ id: "CAROUSEL1", mediaType: "carousel", format: "carousel", views: 0, isAd: true, coverUrl: "https://scontent.cdninstagram.com/v/car.jpg" });
  });

  it("reads profile search results", () => {
    expect(parseInstagramSearch(igSearch).map((h) => [h.username, h.followers])).toEqual([
      ["mia.style", 24_555],
      ["new.ig", 80_000],
      ["no.count", null],
    ]);
  });
});

describe("YouTube (ScrapeCreators)", () => {
  it("reads the channel, keyed by its handle", () => {
    expect(parseYouTubeChannel(ytChannel, "thepatmcafeeshow")).toMatchObject({
      username: "thepatmcafeeshow",
      displayName: "The Pat McAfee Show",
      avatarUrl: "https://yt3.googleusercontent.com/big",
      followers: 2_750_000,
      videoCount: 9221,
      bioLink: "https://store.patmcafeeshow.com",
    });
    expect(parseYouTubeChannel({ success: true }, "ghost")).toBeNull();
  });

  it("keeps shorts and long videos apart", () => {
    const merged = mergeYouTubeUploads(parseYouTubeVideos(ytVideos), parseYouTubeShorts(ytShorts), 30);
    expect(merged.map((v) => [v.id, v.format])).toEqual([
      ["VREVC0wXPfs", "short"],
      ["5EWaxmWgQMI", "long"],
    ]);
    expect(merged[0]).toMatchObject({ shareUrl: "https://www.youtube.com/shorts/VREVC0wXPfs", durationSeconds: 37, likes: 495, comments: 2, views: 17_066 });
    expect(merged[1]).toMatchObject({ shareUrl: "https://www.youtube.com/watch?v=5EWaxmWgQMI", durationSeconds: 2245, views: 110_447, hashtags: ["nfl"] });
  });

  it("finds channels by handle and skips id-only results", () => {
    expect(parseYouTubeSearch(ytSearch)).toEqual([{ username: "runclub", displayName: "Run Club", followers: 1_200_000, avatarUrl: "https://yt3.ggpht.com/a" }]);
    expect(compactNumber("9,221 videos")).toBe(9221);
    expect(compactNumber("12.5K")).toBe(12_500);
  });
});

describe("provider errors", () => {
  it("classifies failures", () => {
    expect(classifyHttpFailure(404, "")).toBe("not_found");
    expect(classifyHttpFailure(402, "Gotta purchase more credits")).toBe("no_credits");
    expect(classifyHttpFailure(429, "You have exceeded the MONTHLY quota")).toBe("no_credits");
    expect(classifyHttpFailure(429, "Too many requests")).toBe("rate_limited");
    expect(classifyHttpFailure(403, "You are not subscribed to this API.")).toBe("unauthorized");
    expect(classifyHttpFailure(500, "")).toBe("server");
    expect(classifyHttpFailure(400, "User not found")).toBe("not_found");
  });
});

describe("provider choice and automatic fallback", () => {
  beforeEach(() => {
    resetProviderHealth();
    for (const [k, v] of Object.entries(PROVIDER_ENV)) vi.stubEnv(k, v);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses SCRAPER_PROVIDER_TIKTOK first, the other one after", () => {
    expect(providerOrder("tiktok").map((s) => s.name)).toEqual(["scrapecreators-tiktok", "rapidapi-tiktok"]);
    vi.stubEnv("SCRAPER_PROVIDER_TIKTOK", "rapidapi");
    expect(providerOrder("tiktok").map((s) => s.name)).toEqual(["rapidapi-tiktok", "scrapecreators-tiktok"]);
    vi.stubEnv("RAPIDAPI_KEY", "");
    expect(providerOrder("tiktok").map((s) => s.name)).toEqual(["scrapecreators-tiktok"]);
  });

  it("enables Instagram and YouTube with the ScrapeCreators key only", () => {
    expect(enabledPlatforms()).toEqual(["tiktok", "instagram", "youtube"]);
    vi.stubEnv("SCRAPE_PLATFORMS", "tiktok");
    expect(enabledPlatforms()).toEqual(["tiktok"]);
    vi.stubEnv("SCRAPE_PLATFORMS", "");
    vi.stubEnv("SCRAPECREATORS_API_KEY", "");
    expect(sourceFor("instagram")).toBeNull();
  });

  it("falls back to RapidAPI when ScrapeCreators is out of credits, then skips it", async () => {
    const fetch = fakeFetch((url) => {
      if (url.hostname === "api.scrapecreators.com") return { status: 402, body: { success: false, message: "Gotta purchase more credits" } };
      if (url.pathname === "/user/info") return { body: rapidProfile() };
      if (url.pathname === "/user/posts") return { body: rapidVideos() };
      return undefined;
    });
    vi.stubGlobal("fetch", fetch.fn);
    const source = sourceFor("tiktok")!;
    const meter = new CallMeter();
    const profile = await source.profile("luna.beauty", meter);
    const videos = await source.videos("luna.beauty", 30, meter);
    expect(profile?.followers).toBe(142_000);
    expect(videos).toHaveLength(2);
    // 1 failed ScrapeCreators call (still counted) + 2 RapidAPI calls; ScrapeCreators is then skipped.
    expect(meter.byProvider).toEqual({ "scrapecreators-tiktok": 1, "rapidapi-tiktok": 2 });
    expect(fetch.calls.filter(isApiCall)).toHaveLength(3);
  });

  it("does not fall back on 'not found': the account is gone", async () => {
    const fetch = fakeFetch((url) => (url.hostname === "api.scrapecreators.com" ? { status: 404, body: { success: false, message: "User not found" } } : { body: rapidProfile() }));
    vi.stubGlobal("fetch", fetch.fn);
    expect(await sourceFor("tiktok")!.profile("ghost")).toBeNull();
    expect(fetch.calls.filter((c) => c.includes("rapidapi"))).toHaveLength(0);
  });

  it("reports when every provider is out of credits", async () => {
    vi.stubGlobal(
      "fetch",
      fakeFetch((url) => (url.hostname === "api.scrapecreators.com" ? { status: 402, body: { message: "credits" } } : { status: 429, body: { message: "You have exceeded the MONTHLY quota" } })).fn,
    );
    const err = await sourceFor("tiktok")!.profile("luna.beauty").catch((e) => e);
    expect(err).toBeInstanceOf(AllProvidersFailed);
    expect(err.allDown).toBe(true);
  });

  it("tries the next provider on a server error without marking the first one down", async () => {
    let scCalls = 0;
    vi.stubGlobal(
      "fetch",
      fakeFetch((url) => {
        if (url.hostname === "api.scrapecreators.com") {
          scCalls += 1;
          return scCalls === 1 ? { status: 500, body: { error: "boom" } } : { body: scProfile() };
        }
        return { body: rapidProfile(1) };
      }).fn,
    );
    const source = sourceFor("tiktok")!;
    expect((await source.profile("luna.beauty"))?.followers).toBe(1);
    expect((await source.profile("luna.beauty"))?.followers).toBe(142_000);
  });

  it("wraps HTTP failures in ProviderError", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => ({ status: 402, body: { message: "credits" } })).fn);
    vi.stubEnv("RAPIDAPI_KEY", "");
    const err = await sourceFor("instagram")!.profile("mia").catch((e) => e);
    expect(err).toBeInstanceOf(AllProvidersFailed);
    expect(new ProviderError("x", "no_credits", "m").providerDown).toBe(true);
  });
});
