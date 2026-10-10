import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreatorNotFound, discoverKeyword, recordCreatorFailure, refreshCreator } from "./ingest";
import { resetProviderHealth, sourceFor } from "./sources";
import { CallMeter } from "./types";
import { FakeSupabase } from "./testing/fake-supabase";
import {
  fakeFetch,
  igPosts,
  igProfile,
  igSearch,
  PROVIDER_ENV,
  rapidProfile,
  rapidVideos,
  scProfile,
  scVideos,
  ytChannel,
  ytShorts,
  ytVideos,
  type Route,
} from "./testing/fixtures";

const DAY = 86_400_000;
const DAY1 = Date.parse("2026-10-05T09:00:00Z");
const DAY2 = DAY1 + DAY;

/** Provider responses; `followers` / `views` change what both TikTok providers report. */
function routes(state: { followers: number; views: number; notFound?: boolean }): Route {
  return (url) => {
    if (state.notFound) return { status: 404, body: { success: false, message: "User not found" } };
    switch (url.pathname) {
      case "/v1/tiktok/profile":
        return { body: scProfile(state.followers) };
      case "/v3/tiktok/profile/videos":
        return { body: scVideos(state.views) };
      case "/user/info":
        return { body: rapidProfile(state.followers) };
      case "/user/posts":
        return { body: rapidVideos(state.views) };
      case "/v1/instagram/profile":
        return { body: igProfile };
      case "/v2/instagram/user/posts":
        return { body: igPosts };
      case "/v1/instagram/search/profiles":
        return { body: igSearch };
      case "/v1/youtube/channel":
        return { body: ytChannel };
      case "/v1/youtube/channel-videos":
        return { body: ytVideos };
      case "/v1/youtube/channel/shorts":
        return { body: ytShorts };
      default:
        return undefined;
    }
  };
}

const withoutTimes = (row: Record<string, unknown>) => {
  const { last_scraped_at: _a, captured_on: _b, captured_at: _c, first_seen_at: _d, ...rest } = row;
  return rest;
};

describe("refreshing a creator whatever the provider", () => {
  let db: FakeSupabase;
  const state = { followers: 142_000, views: 90_000, notFound: false };

  beforeEach(() => {
    db = new FakeSupabase();
    resetProviderHealth();
    Object.assign(state, { followers: 142_000, views: 90_000, notFound: false });
    for (const [k, v] of Object.entries(PROVIDER_ENV)) vi.stubEnv(k, v);
    vi.stubGlobal("fetch", fakeFetch(routes(state)).fn);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("the same data from ScrapeCreators and from RapidAPI writes the same rows", async () => {
    vi.stubEnv("SCRAPER_PROVIDER_TIKTOK", "scrapecreators");
    await refreshCreator(db.asClient(), sourceFor("tiktok")!, "luna.beauty", { nowMs: DAY1 });
    const videosA = db.table("creator_videos").map((r) => withoutTimes({ ...r }));
    const snapA = withoutTimes({ ...db.table("creator_snapshots")[0] });

    vi.stubEnv("SCRAPER_PROVIDER_TIKTOK", "rapidapi");
    await refreshCreator(db.asClient(), sourceFor("tiktok")!, "luna.beauty", { nowMs: DAY2 });

    expect(db.table("creators_index")).toHaveLength(1);
    expect(db.table("creator_videos")).toHaveLength(2);
    expect(db.table("creator_videos").map((r) => withoutTimes({ ...r }))).toEqual(videosA);
    expect(withoutTimes({ ...db.table("creator_snapshots")[1] })).toEqual(snapA);
  });

  it("switching provider mid-history keeps one creator and a continuous history", async () => {
    vi.stubEnv("SCRAPER_PROVIDER_TIKTOK", "scrapecreators");
    const first = await refreshCreator(db.asClient(), sourceFor("tiktok")!, "Luna.Beauty", { nowMs: DAY1 });
    expect(first).toMatchObject({ username: "luna.beauty", isNew: true, apiCalls: 2, videos: 2 });

    Object.assign(state, { followers: 150_000, views: 120_000 });
    vi.stubEnv("SCRAPER_PROVIDER_TIKTOK", "rapidapi");
    const second = await refreshCreator(db.asClient(), sourceFor("tiktok")!, "luna.beauty", { nowMs: DAY2 });
    expect(second).toMatchObject({ username: "luna.beauty", isNew: false, apiCalls: 2 });

    const creators = db.table("creators_index");
    expect(creators).toHaveLength(1);
    expect(creators[0]).toMatchObject({ username: "luna.beauty", platform: "tiktok", followers: 150_000, scrape_failures: 0, scrape_status: "ok" });
    expect(creators[0].next_scrape_at).toBe(new Date(DAY2 + 7 * DAY).toISOString());

    const snaps = db.table("creator_snapshots");
    expect(snaps.map((s) => [s.platform, s.username, s.captured_on, s.followers])).toEqual([
      ["tiktok", "luna.beauty", "2026-10-05", 142_000],
      ["tiktok", "luna.beauty", "2026-10-06", 150_000],
    ]);
    const videos = db.table("creator_videos");
    expect(videos.map((v) => [v.platform, v.video_id, v.username, v.views, v.format])).toEqual([
      ["tiktok", "111", "luna.beauty", 120_000, "short"],
      ["tiktok", "222", "luna.beauty", 5000, "carousel"],
    ]);
    expect(db.table("creator_video_snapshots").filter((s) => s.video_id === "111").map((s) => s.views)).toEqual([90_000, 120_000]);
    // Covers and avatar are stored once, then reused (no re-download on the next refresh).
    expect(db.uploads.filter((u) => u.includes("videos/luna.beauty/"))).toHaveLength(2);
    expect(videos.every((v) => String(v.cover_url).includes("supabase.co"))).toBe(true);
    expect(String(creators[0].avatar_url)).toContain("supabase.co");
    expect(db.rpcCalls.filter((c) => c.name === "refresh_creator_rollup").map((c) => c.args)).toEqual([
      { p_platform: "tiktok", p_username: "luna.beauty" },
      { p_platform: "tiktok", p_username: "luna.beauty" },
    ]);
  });

  it("a renamed or deleted account backs off and keeps its history", async () => {
    await refreshCreator(db.asClient(), sourceFor("tiktok")!, "luna.beauty", { nowMs: DAY1 });
    state.notFound = true;
    await expect(refreshCreator(db.asClient(), sourceFor("tiktok")!, "luna.beauty", { nowMs: DAY2 })).rejects.toBeInstanceOf(CreatorNotFound);
    await recordCreatorFailure(db.asClient(), "luna.beauty", { notFound: true, nowMs: DAY2 });
    const c = db.table("creators_index")[0];
    expect(c).toMatchObject({ scrape_failures: 1, scrape_status: "not_found", followers: 142_000 });
    expect(c.next_scrape_at).toBe(new Date(DAY2 + 7 * DAY).toISOString());
    expect(db.table("creator_snapshots")).toHaveLength(1);
    expect(db.table("creator_videos")).toHaveLength(2);
  });

  it("Instagram creators are stored under ig_ with the same columns", async () => {
    const meter = new CallMeter();
    const r = await refreshCreator(db.asClient(), sourceFor("instagram")!, "ig_mia.style", { nowMs: DAY1, meter });
    expect(r).toMatchObject({ username: "ig_mia.style", apiCalls: 2, videos: 2 });
    expect(meter.byProvider).toEqual({ "scrapecreators-instagram": 2 });
    expect(db.table("creators_index")[0]).toMatchObject({ username: "ig_mia.style", platform: "instagram", followers: 24_555, bio_link: "https://mia.store" });
    expect(db.table("creator_snapshots")[0]).toMatchObject({ platform: "instagram", username: "ig_mia.style" });
    expect(db.table("creator_videos").map((v) => [v.video_id, v.format, v.product_url])).toEqual([
      ["DKSMEpKRd6h", "short", "https://mia.store/p/coat"],
      ["CAROUSEL1", "carousel", null],
    ]);
  });

  it("an Instagram row from before the ig_ prefix is refreshed in place", async () => {
    db.put("creators_index", { username: "mia.style", platform: "instagram", followers: 1 });
    await refreshCreator(db.asClient(), sourceFor("instagram")!, "mia.style", { nowMs: DAY1 });
    expect(db.table("creators_index").map((c) => [c.username, c.followers])).toEqual([["mia.style", 24_555]]);
  });

  it("YouTube: 3 calls, shorts and long videos kept apart", async () => {
    const r = await refreshCreator(db.asClient(), sourceFor("youtube")!, "yt_thepatmcafeeshow", { nowMs: DAY1 });
    expect(r).toMatchObject({ username: "yt_thepatmcafeeshow", apiCalls: 3, videos: 2 });
    expect(db.table("creator_videos").map((v) => [v.video_id, v.format, v.duration_seconds])).toEqual([
      ["VREVC0wXPfs", "short", 37],
      ["5EWaxmWgQMI", "long", 2245],
    ]);
    expect(db.table("creators_index")[0]).toMatchObject({ platform: "youtube", followers: 2_750_000 });
  });

  it("never overwrites another platform's creator holding the same key", async () => {
    db.put("creators_index", { username: "luna.beauty", platform: "instagram", followers: 5 });
    await expect(refreshCreator(db.asClient(), sourceFor("tiktok")!, "luna.beauty", { nowMs: DAY1 })).rejects.toThrow(/stored as a instagram creator/);
    expect(db.table("creators_index")[0]).toMatchObject({ platform: "instagram", followers: 5 });
  });
});

describe("discovery", () => {
  beforeEach(() => {
    resetProviderHealth();
    for (const [k, v] of Object.entries(PROVIDER_ENV)) vi.stubEnv(k, v);
    vi.stubGlobal("fetch", fakeFetch(routes({ followers: 1, views: 1 })).fn);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("adds unknown creators with their first refresh queued, skips known and unsized ones", async () => {
    const db = new FakeSupabase();
    db.put("creators_index", { username: "mia.style", platform: "instagram" }); // stored before the ig_ prefix
    db.put("creators_index", { username: "new.ig", platform: "tiktok" }); // a TikTok creator: not the same person
    const r = await discoverKeyword(db.asClient(), sourceFor("instagram")!, "Gym Workout", { minFollowers: 5_000 });
    expect(r).toMatchObject({ found: 2, added: 1, apiCalls: 1, addedKeys: ["ig_new.ig"], leads: 1 });
    expect(db.table("creators_index").find((c) => c.username === "ig_new.ig")).toMatchObject({ platform: "instagram", followers: 80_000, niches: ["fitness"] });
    // The hit without a follower count is not added: it is queued as a lead (no row yet).
    expect(db.table("scrape_jobs").map((j) => [j.kind, j.platform, j.target, j.status])).toEqual([
      ["creator_refresh", "instagram", "ig_no.count", "queued"],
      ["creator_refresh", "instagram", "ig_new.ig", "queued"],
    ]);
    expect(db.table("creators_index").some((c) => c.username === "ig_no.count")).toBe(false);
  });

  it("respects the number of new creators left this week", async () => {
    const db = new FakeSupabase();
    const r = await discoverKeyword(db.asClient(), sourceFor("instagram")!, "fashion", { minFollowers: 5_000, maxNew: 1 });
    expect(r.added).toBe(1);
    expect(db.table("creators_index")).toHaveLength(1);
  });
});
