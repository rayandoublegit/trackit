import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isExplicitLookup, isLookupFresh, lookupErrorMessage, lookupPlatformOrder, parseCreatorLookup } from "./creator-live-lookup";
import { resetLookupState, runCreatorLookup, type LookupDeps } from "./creator-live-lookup-server";
import { resetCatalogSchemaCache } from "./catalog-query";
import { creatorLookupHit, withCreatorLookup, type DashboardSearchHit } from "./dashboard-search";
import { FakeSupabase } from "./scraper/testing/fake-supabase";
import { ProviderError } from "./scraper/http";
import { AllProvidersFailed } from "./scraper/sources";
import type { CreatorSource, ScrapePlatform, ScrapedProfile, ScrapedVideo } from "./scraper/types";

describe("reading a handle or a profile link", () => {
  it.each([
    ["@Luna.Beauty", { handle: "luna.beauty", platform: null, kind: "at" }],
    ["luna_beauty", { handle: "luna_beauty", platform: null, kind: "plain" }],
    ["  @@luna  ", { handle: "luna", platform: null, kind: "at" }],
    ["https://www.tiktok.com/@luna.beauty", { handle: "luna.beauty", platform: "tiktok", kind: "url" }],
    ["tiktok.com/@luna.beauty/video/7412345?lang=fr", { handle: "luna.beauty", platform: "tiktok", kind: "url" }],
    ["https://m.tiktok.com/@Luna", { handle: "luna", platform: "tiktok", kind: "url" }],
    ["https://www.instagram.com/mia.style/", { handle: "mia.style", platform: "instagram", kind: "url" }],
    ["instagram.com/mia.style?igsh=abc", { handle: "mia.style", platform: "instagram", kind: "url" }],
    ["https://instagram.com/stories/mia.style/3456/", { handle: "mia.style", platform: "instagram", kind: "url" }],
    ["https://www.youtube.com/@MrBeast", { handle: "mrbeast", platform: "youtube", kind: "url" }],
    ["youtube.com/@mr-beast/shorts", { handle: "mr-beast", platform: "youtube", kind: "url" }],
    ["https://www.youtube.com/c/somechannel", { handle: "somechannel", platform: "youtube", kind: "url" }],
  ])("%s", (input, expected) => {
    expect(parseCreatorLookup(input)).toEqual(expected);
  });

  it.each([
    "",
    "protein bars", // several words: a keyword search
    "https://www.instagram.com/p/C1abcDEF/", // a post, not a profile
    "https://www.instagram.com/reel/C1abc/",
    "https://vm.tiktok.com/ZMabc123/", // short link
    "https://www.youtube.com/channel/UC123456", // channel id, not a handle
    "https://www.youtube.com/watch?v=abc",
    "https://example.com/@luna",
    "luna!",
    "a", // too short
    ".luna",
  ])("%s is not a creator lookup", (input) => {
    expect(parseCreatorLookup(input)).toBeNull();
  });

  it("an @handle and a link are explicit, a bare word is not", () => {
    expect(isExplicitLookup(parseCreatorLookup("@luna"))).toBe(true);
    expect(isExplicitLookup(parseCreatorLookup("instagram.com/luna"))).toBe(true);
    expect(isExplicitLookup(parseCreatorLookup("luna"))).toBe(false);
  });
});

describe("which platforms are tried", () => {
  const p = (q: string) => parseCreatorLookup(q)!;
  it("a link names its platform, whatever the tab", () => {
    expect(lookupPlatformOrder(p("instagram.com/mia"), "tiktok", "tiktok")).toEqual(["instagram"]);
  });
  it("an explicit platform is the only one", () => {
    expect(lookupPlatformOrder(p("@mia"), "instagram", "tiktok")).toEqual(["instagram"]);
  });
  it("auto: the catalog tab first, then TikTok, then Instagram", () => {
    expect(lookupPlatformOrder(p("@mia"), "auto", "instagram")).toEqual(["instagram", "tiktok"]);
    expect(lookupPlatformOrder(p("@mia"), "auto", null)).toEqual(["tiktok", "instagram"]);
    expect(lookupPlatformOrder(p("@mia"), "auto", "youtube")).toEqual(["youtube", "tiktok", "instagram"]);
  });
  it("skips a platform where the handle can't exist", () => {
    // 28 characters: too long for TikTok (24), fine on Instagram (30).
    expect(lookupPlatformOrder(p("@abcdefghijklmnopqrstuvwxyz12"), "auto", null)).toEqual(["instagram"]);
  });
});

describe("freshness", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  it("refreshed less than 3 days ago is fresh", () => {
    expect(isLookupFresh({ last_scraped_at: "2026-10-07T12:00:00Z" }, now)).toBe(true);
  });
  it("older, never refreshed or gone is not", () => {
    expect(isLookupFresh({ last_scraped_at: "2026-10-06T11:59:00Z" }, now)).toBe(false);
    expect(isLookupFresh({ last_scraped_at: null }, now)).toBe(false);
    expect(isLookupFresh({}, now)).toBe(false);
    expect(isLookupFresh(null, now)).toBe(false);
    expect(isLookupFresh({ last_scraped_at: "2026-10-09T10:00:00Z", scrape_status: "not_found" }, now)).toBe(false);
  });
});

describe("messages", () => {
  it("speaks French and English", () => {
    expect(lookupErrorMessage("not_found", "fr", { handle: "luna", platform: "tiktok" })).toBe("Aucun compte @luna sur TikTok. Vérifiez l'orthographe du pseudo.");
    expect(lookupErrorMessage("not_found", "en", { handle: "luna" })).toBe("No account @luna. Check the spelling of the handle.");
    expect(lookupErrorMessage("rate_limited", "fr", { retryAfterMin: 12 })).toContain("12 min");
  });
});

// ── The route logic, with a fake database and fake providers ─────────────────

const NOW = Date.parse("2026-10-09T12:00:00Z");
const DAY = 86_400_000;

type Account = { profile: Partial<ScrapedProfile>; videos?: ScrapedVideo[] };

function video(id: string, views: number): ScrapedVideo {
  return {
    id,
    postedAt: new Date(NOW - 2 * DAY).toISOString(),
    caption: "morning skincare routine #skincare",
    hashtags: ["skincare"],
    durationSeconds: 30,
    mediaType: "video",
    format: "short",
    coverUrl: `https://cdn.example.com/${id}.jpg`,
    shareUrl: `https://www.tiktok.com/@x/video/${id}`,
    musicTitle: null,
    isAd: false,
    hasProductLink: false,
    productUrl: null,
    views,
    likes: Math.round(views / 10),
    comments: 10,
    shares: 5,
    saves: 1,
  };
}

/** A provider holding some accounts; counts its calls. */
function fakeSource(platform: ScrapePlatform, accounts: Record<string, Account>, fail?: () => Error): CreatorSource & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    name: `fake-${platform}`,
    platform,
    callsPerRefresh: 2,
    available: () => true,
    async profile(handle, meter) {
      calls.push(`profile:${handle}`);
      meter?.record(`fake-${platform}`);
      if (fail) throw fail();
      const a = accounts[handle];
      if (!a) return null;
      return {
        username: handle,
        displayName: handle,
        avatarUrl: "",
        bio: "",
        bioLink: null,
        followers: 1000,
        following: 10,
        totalLikes: null,
        videoCount: 3,
        verified: false,
        ...a.profile,
      };
    },
    async videos(handle, _count, meter) {
      calls.push(`videos:${handle}`);
      meter?.record(`fake-${platform}`);
      return accounts[handle]?.videos ?? [];
    },
    async search() {
      return [];
    },
  };
}

describe("looking up a creator", () => {
  let db: FakeSupabase;
  let sources: Partial<Record<ScrapePlatform, ReturnType<typeof fakeSource>>>;
  const deps = (over: Partial<LookupDeps> = {}): LookupDeps => ({
    admin: db.asClient(),
    sourceFor: (p) => sources[p] ?? null,
    nowMs: () => NOW,
    timeoutMs: 2_000,
    maxPerHour: 20,
    ...over,
  });

  beforeEach(() => {
    db = new FakeSupabase();
    resetLookupState();
    resetCatalogSchemaCache();
    sources = {
      tiktok: fakeSource("tiktok", { "luna.beauty": { profile: { followers: 142_000, displayName: "Luna", bio: "skincare tips hello@luna.shop" }, videos: [video("1", 90_000), video("2", 50_000), video("3", 70_000)] } }),
      instagram: fakeSource("instagram", {
        "mia.style": { profile: { followers: 2_500, displayName: "Mia" }, videos: [video("a", 4_000)] },
        "secret.mia": { profile: { followers: 9_000, isPrivate: true } },
        "acme.shop": { profile: { followers: 50_000, displayName: "ACME Official Store", category: "Clothing (Brand)", bio: "Official store. Shop now" }, videos: [video("b", 1000)] },
      }),
    };
    // Covers and avatars are fetched to be stored: answer "not found", no network.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("serves a creator refreshed recently from the database, without any API call", async () => {
    db.put("creators_index", { username: "luna.beauty", platform: "tiktok", display_name: "Luna", followers: 140_000, avg_views: 80_000, last_scraped_at: new Date(NOW - DAY).toISOString() });
    const { status, body } = await runCreatorLookup(deps(), { userId: "u1", query: "@luna.beauty", platform: "tiktok" });
    expect(status).toBe(200);
    expect(body.ok && body.source).toBe("db");
    expect(body.ok && body.creator.followersCount).toBe(140_000);
    expect(sources.tiktok!.calls).toEqual([]);
    expect(db.table("scrape_runs")).toHaveLength(0);
  });

  it("fetches a creator not in the catalog, stores it and answers the full row", async () => {
    const { status, body } = await runCreatorLookup(deps(), { userId: "u1", query: "https://www.tiktok.com/@luna.beauty", platform: "auto", lang: "fr" });
    expect(status).toBe(200);
    if (!body.ok) throw new Error(body.message);
    expect(body).toMatchObject({ source: "live", isNew: true, storageKey: "luna.beauty", platform: "tiktok", apiCalls: 2 });
    expect(body.creator).toMatchObject({ username: "luna.beauty", displayName: "Luna", followersCount: 142_000, platform: "TikTok", email: "hello@luna.shop" });
    expect(body.creator.avgViews).toBeGreaterThan(0);
    expect(db.table("creators_index").find((r) => r.username === "luna.beauty")?.last_scraped_at).toBeTruthy();
    expect(db.table("creator_videos")).toHaveLength(3);
    // Counted like a worker pass, for the caps and the hourly limit.
    const run = db.table("scrape_runs")[0];
    expect(run).toMatchObject({ trigger: "lookup:u1", api_calls: 2, jobs_done: 1, creators_new: 1 });
    expect(run.notes.callsByProvider).toEqual({ "fake-tiktok": 2 });
  });

  it("refreshes a stored creator whose data is old", async () => {
    db.put("creators_index", { username: "luna.beauty", platform: "tiktok", followers: 100_000, last_scraped_at: new Date(NOW - 10 * DAY).toISOString() });
    const { body } = await runCreatorLookup(deps(), { userId: "u1", query: "luna.beauty", platform: "tiktok" });
    expect(body.ok && body.source).toBe("live");
    expect(body.ok && body.isNew).toBe(false);
    expect(body.ok && body.creator.followersCount).toBe(142_000);
  });

  it("auto: tries the tab first, then the next platform, and stops at the first found", async () => {
    const { body } = await runCreatorLookup(deps(), { userId: "u1", query: "@mia.style", platform: "auto", tab: "tiktok" });
    expect(body.ok && body.storageKey).toBe("ig_mia.style");
    expect(sources.tiktok!.calls).toEqual(["profile:mia.style"]);
    expect(sources.instagram!.calls).toEqual(["profile:mia.style", "videos:mia.style"]);
  });

  it("auto: a creator already in the catalog is the one meant (no call on the other platform)", async () => {
    db.put("creators_index", { username: "ig_mia.style", platform: "instagram", followers: 2_400, last_scraped_at: new Date(NOW - 30 * DAY).toISOString() });
    const { body } = await runCreatorLookup(deps(), { userId: "u1", query: "@mia.style", platform: "auto", tab: "tiktok" });
    expect(body.ok && body.storageKey).toBe("ig_mia.style");
    expect(sources.tiktok!.calls).toEqual([]);
  });

  it("an explicit lookup skips the discovery gate: small accounts and brands are stored, brands flagged", async () => {
    const small = await runCreatorLookup(deps(), { userId: "u1", query: "instagram.com/mia.style" });
    expect(small.body.ok && small.body.creator.followersCount).toBe(2_500); // under the 5,000 discovery minimum
    const brand = await runCreatorLookup(deps(), { userId: "u1", query: "@acme.shop", platform: "instagram" });
    expect(brand.status).toBe(200);
    expect(brand.body.ok && brand.body.isBrand).toBe(true);
    expect(db.table("creators_index").find((r) => r.username === "ig_acme.shop")?.is_brand).toBe(true);
  });

  it("not found: 404 with a clear message, nothing stored", async () => {
    const { status, body } = await runCreatorLookup(deps(), { userId: "u1", query: "@nobody.here", platform: "auto", lang: "fr" });
    expect(status).toBe(404);
    expect(!body.ok && body.message).toBe("Aucun compte @nobody.here. Vérifiez l'orthographe du pseudo.");
    expect(db.table("creators_index")).toHaveLength(0);
  });

  it("private account: reported as such, not stored, the other platform not tried", async () => {
    const { status, body } = await runCreatorLookup(deps(), { userId: "u1", query: "@secret.mia", platform: "auto", tab: "instagram" });
    expect(status).toBe(422);
    expect(!body.ok && body.code).toBe("private");
    expect(sources.tiktok!.calls).toEqual([]);
    expect(db.table("creators_index")).toHaveLength(0);
  });

  it("provider out of credits: 503 no_credits", async () => {
    sources.tiktok = fakeSource("tiktok", {}, () => new AllProvidersFailed("tiktok", ["out of credits"], true));
    const { status, body } = await runCreatorLookup(deps(), { userId: "u1", query: "@luna", platform: "tiktok" });
    expect(status).toBe(503);
    expect(!body.ok && body.code).toBe("no_credits");
  });

  it("a single provider error (not the fallback chain) is classified too", async () => {
    sources.tiktok = fakeSource("tiktok", {}, () => new ProviderError("x", "no_credits", "HTTP 402"));
    const { body } = await runCreatorLookup(deps(), { userId: "u1", query: "@luna", platform: "tiktok" });
    expect(!body.ok && body.code).toBe("no_credits");
  });

  it("no provider configured: 503 unavailable", async () => {
    delete sources.tiktok;
    const { status, body } = await runCreatorLookup(deps(), { userId: "u1", query: "@luna", platform: "tiktok" });
    expect(status).toBe(503);
    expect(!body.ok && body.code).toBe("unavailable");
  });

  it("free plan: catalog answers only, never a live call", async () => {
    const { status, body } = await runCreatorLookup(deps(), { userId: "u1", query: "@luna.beauty", platform: "tiktok", allowLive: false, lang: "fr" });
    expect(status).toBe(402);
    expect(!body.ok && body.code).toBe("plan_required");
    expect(sources.tiktok!.calls).toEqual([]);
    db.put("creators_index", { username: "luna.beauty", platform: "tiktok", followers: 1, last_scraped_at: new Date(NOW - DAY).toISOString() });
    expect((await runCreatorLookup(deps(), { userId: "u1", query: "@luna.beauty", platform: "tiktok", allowLive: false })).status).toBe(200);
  });

  it("not a handle: 400", async () => {
    const { status } = await runCreatorLookup(deps(), { userId: "u1", query: "protein bars" });
    expect(status).toBe(400);
  });

  it("rate limit: live lookups per user per hour, database answers are free", async () => {
    for (let i = 0; i < 3; i++) await runCreatorLookup(deps({ maxPerHour: 3 }), { userId: "u1", query: `@ghost${i}`, platform: "tiktok" });
    const limited = await runCreatorLookup(deps({ maxPerHour: 3 }), { userId: "u1", query: "@luna.beauty", platform: "tiktok" });
    expect(limited.status).toBe(429);
    expect(!limited.body.ok && limited.body.retryAfterSec).toBeGreaterThan(0);
    // Another user is not limited.
    expect((await runCreatorLookup(deps({ maxPerHour: 3 }), { userId: "u2", query: "@luna.beauty", platform: "tiktok" })).status).toBe(200);
    // Now stored and fresh: u1 gets it from the database.
    expect((await runCreatorLookup(deps({ maxPerHour: 3 }), { userId: "u1", query: "@luna.beauty", platform: "tiktok" })).status).toBe(200);
  });

  it("concurrent lookups of the same creator share one refresh", async () => {
    const [a, b] = await Promise.all([
      runCreatorLookup(deps(), { userId: "u1", query: "@luna.beauty", platform: "tiktok" }),
      runCreatorLookup(deps(), { userId: "u2", query: "tiktok.com/@luna.beauty", platform: "auto" }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(sources.tiktok!.calls).toEqual(["profile:luna.beauty", "videos:luna.beauty"]);
    expect(db.table("scrape_runs")).toHaveLength(1);
  });

  it("times out with 504 when the provider is too slow", async () => {
    const slow = fakeSource("tiktok", {});
    slow.profile = () => new Promise(() => undefined);
    sources.tiktok = slow;
    const { status, body } = await runCreatorLookup(deps({ timeoutMs: 20 }), { userId: "u1", query: "@luna", platform: "tiktok", lang: "en" });
    expect(status).toBe(504);
    expect(!body.ok && body.code).toBe("timeout");
  });
});

describe("top search bar: Find @x", () => {
  const page: DashboardSearchHit = { id: "home", label: "Home", view: "dashboard", group: "Home", keywords: [] };
  it("offers a lookup for a handle or a link", () => {
    expect(creatorLookupHit("@luna", "fr")).toMatchObject({ label: "Trouver @luna", view: "discovery", creatorLookup: { handle: "luna", platform: null } });
    expect(creatorLookupHit("https://www.instagram.com/mia.style/", "en")).toMatchObject({ label: "Find @mia.style on Instagram", creatorLookup: { handle: "mia.style", platform: "instagram" } });
  });
  it("not for keywords, posts or 1-2 letters", () => {
    expect(creatorLookupHit("protein bars", "en")).toBeNull();
    expect(creatorLookupHit("instagram.com/p/abc", "en")).toBeNull();
    expect(creatorLookupHit("ho", "en")).toBeNull();
  });
  it("first for @handles and links, last for a bare word", () => {
    expect(withCreatorLookup([page], "@home", "en").map((h) => h.id)).toEqual(["creator-lookup-any-home", "home"]);
    expect(withCreatorLookup([page], "home", "en").map((h) => h.id)).toEqual(["home", "creator-lookup-any-home"]);
  });
});
