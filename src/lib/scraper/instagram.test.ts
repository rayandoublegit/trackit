import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyBodyError, ProviderError } from "./http";
import { instagramAllowance, instagramCalls, weekStart } from "./budget";
import { instagramSearchQueries } from "./discovery-plan";
import { CreatorSkipped, discoverKeyword, queueInstagramLeads, refreshCreator } from "./ingest";
import { refreshIntervalDays } from "./schedule";
import { providerOrder, resetProviderHealth, sourceFor } from "./sources";
import { mentionsIn, parseInstagramPosts, parseInstagramProfile, relatedOfPost } from "./sources-instagram";
import {
  accountsIn,
  followersFromContext,
  parseRapidInstagramPosts,
  parseRapidInstagramProfile,
  parseRapidInstagramReelViews,
  parseRapidInstagramSearch,
  rapidApiInstagram,
} from "./sources-instagram-rapid";
import { CallMeter } from "./types";
import { runScrapeWorker } from "./worker";
import { FakeSupabase } from "./testing/fake-supabase";
import { fakeFetch, igPosts, igProfile, isApiCall, PROVIDER_ENV, rapidProfile, rapidVideos, type Route } from "./testing/fixtures";
import { RAPID_IG_ENV, rapidIgErrors, rapidIgPosts, rapidIgProfile, rapidIgReels, rapidIgSearch } from "./testing/fixtures-instagram-rapid";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-07T09:00:00Z");

/** The RapidAPI Instagram endpoints; `profiles` answers per handle (form field username_or_url). */
function rapidRoutes(opts: { profiles?: Record<string, unknown>; reels?: unknown; posts?: unknown } = {}): Route {
  return (url, body) => {
    if (url.hostname !== "instagram-scraper-stable-api.p.rapidapi.com") return undefined;
    const form = new URLSearchParams(body ?? "");
    const handle = form.get("username_or_url") ?? "";
    switch (url.pathname) {
      case "/ig_get_fb_profile.php":
        return { body: opts.profiles?.[handle] ?? rapidIgProfile({ username: handle }) };
      case "/get_ig_user_posts.php":
        return { body: opts.posts ?? rapidIgPosts };
      case "/get_ig_user_reels.php":
        return { body: opts.reels ?? rapidIgReels };
      case "/search_ig.php":
        return { body: rapidIgSearch };
      case "/get_ig_similar_accounts.php":
        return { body: rapidIgErrors.similarMissing };
      default:
        return undefined;
    }
  };
}

const noSc = () => {
  for (const [k, v] of Object.entries({ ...PROVIDER_ENV, ...RAPID_IG_ENV })) vi.stubEnv(k, v);
  vi.stubEnv("SCRAPECREATORS_API_KEY", "");
};

describe("Instagram on RapidAPI: same creator as ScrapeCreators", () => {
  it("reads the flat profile into the same ScrapedProfile", () => {
    const rapid = parseRapidInstagramProfile(rapidIgProfile(), "mia.style");
    expect(rapid).toEqual(parseInstagramProfile(igProfile, "mia.style"));
    expect(rapid).toMatchObject({ username: "mia.style", followers: 24_555, following: 110, videoCount: 90, bioLink: "https://mia.store", avatarUrl: "https://scontent.cdninstagram.com/v/pic_hd.jpg", isPrivate: false, email: null });
    expect(parseRapidInstagramProfile(rapidIgErrors.notFound, "ghost")).toBeNull();
  });

  it("surfaces the public e-mail and private accounts", () => {
    expect(parseRapidInstagramProfile(rapidIgProfile({ email_from_biography: ["Contact@Mia.Store"] }), "mia.style")?.email).toBe("contact@mia.store");
    expect(parseRapidInstagramProfile(rapidIgProfile({ biography: "collabs: hello@mia.fr ✨" }), "mia.style")?.email).toBe("hello@mia.fr");
    expect(parseRapidInstagramProfile(rapidIgProfile({ is_private: true }), "mia.style")?.isPrivate).toBe(true);
  });

  it("reads posts like ScrapeCreators, with views from the reels by shortcode", () => {
    const rapid = parseRapidInstagramPosts(rapidIgPosts, parseRapidInstagramReelViews(rapidIgReels));
    const sc = parseInstagramPosts(igPosts);
    // Same ids, links, types, covers, counts and product link. The posts endpoint has no video length.
    const strip = ({ durationSeconds: _d, related: _r, caption: _c, hashtags: _h, ...v }: (typeof rapid)[number]) => v;
    expect(rapid.map(strip)).toEqual(sc.map(strip));
    expect(rapid[0]).toMatchObject({ id: "DKSMEpKRd6h", shareUrl: "https://www.instagram.com/p/DKSMEpKRd6h/", views: 2647, format: "short", durationSeconds: null, productUrl: "https://mia.store/p/coat" });
    expect(rapid[1]).toMatchObject({ id: "CAROUSEL1", format: "carousel", views: 0, isAd: true, coverUrl: "https://scontent.cdninstagram.com/v/car.jpg" });
    // The pinned old reel is not one of the latest posts: not stored.
    expect(rapid.map((v) => v.id)).not.toContain("PINNEDOLD");
  });

  it("lists the accounts next to a post: co-authors, tagged people, mentions", () => {
    expect(relatedOfPost(rapidIgPosts.posts[0].node).map((a) => [a.username, a.via])).toEqual([
      ["lea.looks", "coauthor"],
      ["mia.style", "coauthor"],
      ["zara", "tag"],
      ["sam.fits", "tag"],
      ["nora.d", "mention"],
    ]);
    expect(mentionsIn("hi @Nora.D. and mail me at me@x.com, @a")).toEqual(["nora.d"]);
  });

  it("reads search hits, follower counts from the 'followers' text only", () => {
    expect(parseRapidInstagramSearch(rapidIgSearch).map((h) => [h.username, h.followers])).toEqual([
      ["mia.style", 24_500],
      ["new.ig", 80_000],
      ["no.count", null],
      ["friend.ctx", null],
    ]);
    expect(followersFromContext("1,234 followers")).toBe(1234);
    expect(followersFromContext("2.1M followers")).toBe(2_100_000);
  });

  it("finds accounts in answers of any shape (similar accounts, hashtag posts)", () => {
    const hits = accountsIn({ data: { items: [{ user: { username: "A.b", follower_count: 12 } }, { owner: { username: "c_d", full_name: "C" } }] } });
    expect(hits).toEqual([
      { username: "a.b", displayName: "a.b", followers: 12, avatarUrl: "" },
      { username: "c_d", displayName: "C", followers: null, avatarUrl: "" },
    ]);
  });

  it("classifies the errors it sends in 200 answers", () => {
    expect(classifyBodyError(rapidIgErrors.notFound.error)).toBe("not_found");
    expect(classifyBodyError(rapidIgErrors.busy.error)).toBe("rate_limited");
    expect(classifyBodyError(rapidIgErrors.dataNotFound.error)).toBe("rate_limited");
    expect(classifyBodyError(rapidIgErrors.upstream429.error)).toBe("rate_limited");
    expect(classifyBodyError(rapidIgErrors.endpoint.message)).toBe("bad_response");
    expect(classifyBodyError(rapidIgErrors.quota.message)).toBe("no_credits");
  });
});

describe("Instagram RapidAPI source", () => {
  beforeEach(() => {
    resetProviderHealth();
    noSc();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("posts forms with the key from env, 3 calls per refresh (profile, posts, reels)", async () => {
    const fetch = fakeFetch(rapidRoutes());
    vi.stubGlobal("fetch", fetch.fn);
    const meter = new CallMeter();
    const source = sourceFor("instagram")!;
    expect(source.name).toBe("rapidapi-instagram");
    expect(source.callsPerRefresh).toBe(3);
    expect((await source.profile("mia.style", meter))?.followers).toBe(24_555);
    const videos = await source.videos("mia.style", 30, meter);
    expect(videos[0].views).toBe(2647);
    expect(meter.byProvider).toEqual({ "rapidapi-instagram": 3 });
    expect(fetch.bodies.filter(Boolean)).toEqual(["username_or_url=mia.style", "username_or_url=mia.style&amount=30", "username_or_url=mia.style&amount=30"]);
  });

  it("skips the reels call for an account without video posts, and keeps the posts when reels are busy", async () => {
    const photosOnly = { posts: [rapidIgPosts.posts[1]] };
    let fetch = fakeFetch(rapidRoutes({ posts: photosOnly }));
    vi.stubGlobal("fetch", fetch.fn);
    await rapidApiInstagram.videos("mia.style", 30);
    expect(fetch.calls.filter(isApiCall)).toHaveLength(1);

    fetch = fakeFetch(rapidRoutes({ reels: rapidIgErrors.busy }));
    vi.stubGlobal("fetch", fetch.fn);
    const videos = await rapidApiInstagram.videos("mia.style", 30);
    expect(videos.map((v) => [v.id, v.views])).toEqual([
      ["DKSMEpKRd6h", 0],
      ["CAROUSEL1", 0],
    ]);
  });

  it("SCRAPE_INSTAGRAM_REELS=0: 2 calls a refresh", async () => {
    vi.stubEnv("SCRAPE_INSTAGRAM_REELS", "0");
    const fetch = fakeFetch(rapidRoutes());
    vi.stubGlobal("fetch", fetch.fn);
    expect(rapidApiInstagram.callsPerRefresh).toBe(2);
    await rapidApiInstagram.videos("mia.style", 30);
    expect(fetch.calls.filter(isApiCall)).toHaveLength(1);
  });

  it("'does not exist' is a missing account, 'try again later' a busy provider", async () => {
    vi.stubGlobal("fetch", fakeFetch(rapidRoutes({ profiles: { ghost: rapidIgErrors.notFound } })).fn);
    expect(await sourceFor("instagram")!.profile("ghost")).toBeNull();
    vi.stubGlobal("fetch", fakeFetch(rapidRoutes({ profiles: { busy: rapidIgErrors.busy } })).fn);
    const err = await rapidApiInstagram.profile("busy").catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe("rate_limited");
    // Similar accounts "not found" is an empty answer.
    expect(await sourceFor("instagram")!.similar!("mia.style")).toEqual([]);
  });

  it("ScrapeCreators first when it has a key, RapidAPI as fallback (or first with SCRAPER_PROVIDER_INSTAGRAM)", async () => {
    vi.stubEnv("SCRAPECREATORS_API_KEY", "test-sc-key");
    expect(providerOrder("instagram").map((s) => s.name)).toEqual(["scrapecreators-instagram", "rapidapi-instagram"]);
    vi.stubEnv("SCRAPER_PROVIDER_INSTAGRAM", "rapidapi");
    expect(providerOrder("instagram").map((s) => s.name)).toEqual(["rapidapi-instagram", "scrapecreators-instagram"]);
    vi.stubEnv("SCRAPER_PROVIDER_INSTAGRAM", "");

    const sc402: Route = (url, body) => (url.hostname === "api.scrapecreators.com" ? { status: 402, body: { success: false, message: "credits" } } : rapidRoutes()(url, body));
    vi.stubGlobal("fetch", fakeFetch(sc402).fn);
    const meter = new CallMeter();
    const profile = await sourceFor("instagram")!.profile("mia.style", meter);
    expect(profile).toEqual(parseInstagramProfile(igProfile, "mia.style"));
    expect(meter.byProvider).toEqual({ "scrapecreators-instagram": 1, "rapidapi-instagram": 1 });
  });
});

describe("Instagram discovery: leads through the gate", () => {
  let db: FakeSupabase;
  const gate = { minFollowers: 5_000, maxFollowers: 2_000_000, allowNew: true };

  beforeEach(() => {
    db = new FakeSupabase();
    resetProviderHealth();
    noSc();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("a lead that is creator-sized is fully refreshed, stored under ig_, and snowballs", async () => {
    vi.stubGlobal("fetch", fakeFetch(rapidRoutes({ profiles: { "mia.style": rapidIgProfile({ email_from_biography: ["mia@mia.store"] }) } })).fn);
    const meter = new CallMeter();
    const r = await refreshCreator(db.asClient(), sourceFor("instagram")!, "ig_mia.style", { nowMs: NOW, meter, gate, snowball: { maxLeads: 10 } });
    expect(r).toMatchObject({ username: "ig_mia.style", isNew: true, apiCalls: 3, videos: 2, leadsQueued: 4 });
    const row = db.table("creators_index")[0];
    expect(row).toMatchObject({ username: "ig_mia.style", platform: "instagram", followers: 24_555, email: "mia@mia.store", bio_link: "https://mia.store" });
    // RapidAPI plan: Instagram comes back every 28 days by default (x4 here: the fixture's last post is over 60 days old).
    expect(Date.parse(String(row.next_scrape_at)) - NOW).toBe(28 * 4 * DAY);
    // Co-author first, then tagged and mentioned people; never itself, never an obvious brand name.
    expect(db.table("scrape_jobs").map((j) => [j.target, j.priority])).toEqual([
      ["ig_lea.looks", 5],
      ["ig_zara", 5],
      ["ig_sam.fits", 5],
      ["ig_nora.d", 5],
    ]);
  });

  it("a lead too small, private or a brand costs 1 call and writes nothing", async () => {
    const profiles = {
      tiny: rapidIgProfile({ username: "tiny", follower_count: 300 }),
      locked: rapidIgProfile({ username: "locked", is_private: true }),
      shop: rapidIgProfile({ username: "glowskin.shop", full_name: "Glow Skin", category: "Cosmetics store" }),
    };
    vi.stubGlobal("fetch", fakeFetch(rapidRoutes({ profiles })).fn);
    for (const handle of ["tiny", "locked", "shop"]) {
      const meter = new CallMeter();
      const err = await refreshCreator(db.asClient(), sourceFor("instagram")!, `ig_${handle}`, { nowMs: NOW, meter, gate }).catch((e) => e);
      expect(err).toBeInstanceOf(CreatorSkipped);
      expect(meter.calls).toBe(1);
    }
    expect(db.table("creators_index")).toHaveLength(0);
  });

  it("a creator already in the catalog is refreshed without the gate", async () => {
    db.put("creators_index", { username: "ig_tiny", platform: "instagram", followers: 300 });
    vi.stubGlobal("fetch", fakeFetch(rapidRoutes({ profiles: { tiny: rapidIgProfile({ username: "tiny", follower_count: 300 }) } })).fn);
    const r = await refreshCreator(db.asClient(), sourceFor("instagram")!, "ig_tiny", { nowMs: NOW, gate });
    expect(r).toMatchObject({ isNew: false, apiCalls: 3 });
  });

  it("search hits without a follower count are queued as leads, French queries first", async () => {
    vi.stubGlobal("fetch", fakeFetch(rapidRoutes()).fn);
    const r = await discoverKeyword(db.asClient(), sourceFor("instagram")!, "mode femme", { minFollowers: 5_000, maxFollowers: 2_000_000 });
    expect(r).toMatchObject({ found: 2, added: 2, apiCalls: 1, leads: 2 });
    expect(db.table("scrape_jobs").map((j) => [j.target, j.priority])).toEqual([
      ["ig_no.count", 4],
      ["ig_friend.ctx", 4],
      ["ig_mia.style", 3],
      ["ig_new.ig", 3],
    ]);
  });

  it("does not queue a lead already in the catalog, queued, or looked at recently", async () => {
    db.put("creators_index", { username: "ig_a", platform: "instagram" });
    db.put("creators_index", { username: "b", platform: "instagram" }); // pre-prefix row
    db.put("scrape_jobs", { kind: "creator_refresh", platform: "instagram", target: "ig_c", status: "done" });
    const n = await queueInstagramLeads(
      db.asClient(),
      ["a", "b", "c", "d", "Maison Glow SARL"].map((u) => ({ username: u.includes(" ") ? "maisonglow" : u, displayName: u, via: "tag" as const })),
      { max: 10 },
    );
    expect(n).toBe(1);
    expect(db.table("scrape_jobs").filter((j) => j.status === "queued").map((j) => j.target)).toEqual(["ig_d"]);
  });
});

describe("Instagram call caps", () => {
  let db: FakeSupabase;
  const past = new Date(Date.now() - 60_000).toISOString();
  const job = (kind: string, target: string) => ({ kind, platform: "instagram", target, status: "queued", run_after: past, priority: 5 });

  beforeEach(() => {
    db = new FakeSupabase();
    resetProviderHealth();
    noSc();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("counts every Instagram provider's calls this week and over 30 days", async () => {
    const now = Date.now();
    db.put("scrape_runs", { started_at: new Date(now - 60_000).toISOString(), notes: { callsByProvider: { "rapidapi-instagram": 100, "scrapecreators-tiktok": 50 } } });
    db.put("scrape_runs", { started_at: new Date(weekStart(now).getTime() - 2 * DAY).toISOString(), notes: { callsByProvider: { "rapidapi-instagram": 40 } } });
    vi.stubEnv("SCRAPE_INSTAGRAM_MAX_CALLS_PER_WEEK", "1000");
    vi.stubEnv("SCRAPE_INSTAGRAM_MAX_CALLS_PER_30D", "1100");
    const a = await instagramAllowance(db.asClient(), now);
    expect(a).toMatchObject({ usedWeek: 100, used30d: 140, left: 900 });
    expect(instagramCalls({ "rapidapi-instagram": 2, "scrapecreators-instagram": 3, "rapidapi-tiktok": 9 })).toBe(5);
  });

  it("holds Instagram jobs back when the plan's calls are used up, without a call", async () => {
    vi.stubEnv("SCRAPE_INSTAGRAM_MAX_CALLS_PER_WEEK", "10");
    db.put("scrape_runs", { started_at: new Date().toISOString(), notes: { callsByProvider: { "rapidapi-instagram": 9 } } });
    db.put("creators_index", { username: "ig_mia.style", platform: "instagram" });
    db.put("scrape_jobs", job("creator_refresh", "ig_mia.style"));
    db.put("scrape_jobs", job("creator_discover", "mode femme"));
    const fetch = fakeFetch(rapidRoutes());
    vi.stubGlobal("fetch", fetch.fn);
    const s = await runScrapeWorker(db.asClient(), { budget: 10, concurrency: 1 });
    // 1 call left: the search (1 call) runs, the refresh (3 calls) waits for next Monday.
    expect(s).toMatchObject({ instagramCallsLeft: 1, discoverJobsInstagram: 1, refreshJobs: 0, deferred: 1 });
    expect(fetch.calls.filter(isApiCall)).toHaveLength(1);
    const waiting = db.table("scrape_jobs").find((j) => j.target === "ig_mia.style")!;
    expect(waiting).toMatchObject({ status: "queued", attempts: 0 });
    expect(waiting.run_after).toBe(new Date(weekStart().getTime() + 7 * DAY).toISOString());
  });

  it("runs leads through the gate: kept ones count as new creators, others are done and skipped", async () => {
    vi.stubEnv("SCRAPE_INSTAGRAM_LEADS_PER_REFRESH", "0");
    db.put("scrape_jobs", job("creator_refresh", "ig_mia.style"));
    db.put("scrape_jobs", job("creator_refresh", "ig_tiny"));
    vi.stubGlobal("fetch", fakeFetch(rapidRoutes({ profiles: { tiny: rapidIgProfile({ username: "tiny", follower_count: 10 }) } })).fn);
    const s = await runScrapeWorker(db.asClient(), { budget: 10, concurrency: 1 });
    expect(s).toMatchObject({ done: 2, failed: 0, skipped: 1, discovered: 1, creatorsNew: 1, apiCalls: 4 });
    expect(db.table("scrape_jobs").map((j) => [j.target, j.status])).toEqual([
      ["ig_mia.style", "done"],
      ["ig_tiny", "done"],
    ]);
    expect(db.table("creators_index").map((c) => c.username)).toEqual(["ig_mia.style"]);
    expect(db.table("scrape_runs")[0].notes).toMatchObject({ skipped: 1, discovered: 1 });
  });

  it("an Instagram key without the plan stops Instagram only: TikTok goes on", async () => {
    vi.stubEnv("SCRAPE_INSTAGRAM_LEADS_PER_REFRESH", "0");
    db.put("creators_index", { username: "ig_mia.style", platform: "instagram" });
    db.put("creators_index", { username: "luna.beauty", platform: "tiktok" });
    db.put("scrape_jobs", { ...job("creator_refresh", "ig_mia.style"), priority: 1 });
    db.put("scrape_jobs", { kind: "creator_refresh", platform: "tiktok", target: "luna.beauty", status: "queued", run_after: past, priority: 2 });
    const notSubscribed: Route = (url) =>
      url.hostname === "instagram-scraper-stable-api.p.rapidapi.com"
        ? { status: 403, body: { message: "You are not subscribed to this API." } }
        : url.pathname === "/user/info"
          ? { body: rapidProfile() }
          : url.pathname === "/user/posts"
            ? { body: rapidVideos() }
            : undefined;
    vi.stubGlobal("fetch", fakeFetch(notSubscribed).fn);
    const s = await runScrapeWorker(db.asClient(), { budget: 10, concurrency: 1 });
    expect(s).toMatchObject({ done: 1, failed: 0, deferred: 1 });
    expect(db.table("scrape_jobs").map((j) => [j.target, j.status])).toEqual([
      ["ig_mia.style", "queued"],
      ["luna.beauty", "done"],
    ]);
    expect(db.table("scrape_runs")[0].notes).toMatchObject({ stoppedNoCredits: true, stoppedPlatforms: ["instagram"] });
  });

  it("no new creators left this week: leads wait, at no cost", async () => {
    vi.stubEnv("SCRAPE_WEEKLY_MAX_NEW_CREATORS", "0");
    db.put("scrape_jobs", job("creator_refresh", "ig_mia.style"));
    const fetch = fakeFetch(rapidRoutes());
    vi.stubGlobal("fetch", fetch.fn);
    const s = await runScrapeWorker(db.asClient(), { budget: 10, concurrency: 1 });
    expect(s).toMatchObject({ done: 0, deferred: 1, refreshJobs: 0 });
    expect(fetch.calls.filter(isApiCall)).toHaveLength(0);
  });
});

describe("Instagram plan and rhythm", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("has thousands of search queries, French ones first, no duplicates", () => {
    const q = instagramSearchQueries();
    expect(q.length).toBeGreaterThan(3_000);
    expect(new Set(q.map((x) => x.keyword)).size).toBe(q.length);
    const firstOther = q.findIndex((x) => x.country !== "FR");
    expect(q.slice(0, firstOther).length).toBeGreaterThan(1_500);
    expect(q.slice(firstOther).some((x) => x.country === "FR")).toBe(false);
    expect(q.map((x) => x.keyword)).toEqual(expect.arrayContaining(["skincare paris", "influenceuse makeup", "skincare uk"]));
  });

  it("Instagram on RapidAPI is refreshed every 28 days unless told otherwise", () => {
    expect(refreshIntervalDays("tiktok")).toBe(7);
    expect(refreshIntervalDays("instagram", "scrapecreators-instagram")).toBe(7);
    expect(refreshIntervalDays("instagram", "rapidapi-instagram>scrapecreators-instagram")).toBe(28);
    vi.stubEnv("SCRAPE_INSTAGRAM_REFRESH_INTERVAL_DAYS", "7");
    expect(refreshIntervalDays("instagram", "rapidapi-instagram")).toBe(7);
  });
});

describe("Instagram backlog (instagram-seed)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("queues the next searches not run yet, French first, plus hand-picked leads and stored creators", async () => {
    const { seedInstagramDiscovery } = await import("./instagram-seed");
    const db = new FakeSupabase();
    const first = instagramSearchQueries()[0].keyword;
    db.put("scrape_jobs", { kind: "creator_discover", platform: "instagram", target: first, status: "done" });
    db.put("creators_index", { username: "ig_never", platform: "instagram", last_scraped_at: null });
    db.put("creators_index", { username: "ig_done", platform: "instagram", last_scraped_at: new Date().toISOString() });
    const r = await seedInstagramDiscovery(db.asClient(), { searches: 3, handles: ["@Mia.Style"], refreshStored: 10 });
    expect(r).toMatchObject({ searchesQueued: 3, leadsQueued: 1, storedQueued: 1, maxCallsQueued: 3 + 6 });
    const queued = db.table("scrape_jobs").filter((j) => j.status === "queued");
    expect(queued.filter((j) => j.kind === "creator_discover").map((j) => j.target)).toEqual(instagramSearchQueries().slice(1, 4).map((q) => q.keyword));
    expect(queued.filter((j) => j.kind === "creator_discover").every((j) => j.priority === 2)).toBe(true);
    expect(queued.filter((j) => j.kind === "creator_refresh").map((j) => j.target).sort()).toEqual(["ig_mia.style", "ig_never"]);
    // Run again: nothing queued twice.
    const again = await seedInstagramDiscovery(db.asClient(), { searches: 3 });
    expect(again.searchesQueued).toBe(3);
    expect(new Set(db.table("scrape_jobs").map((j) => j.target)).size).toBe(db.table("scrape_jobs").length);
  });
});
