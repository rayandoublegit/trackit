import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runScrapeWorker } from "./worker";
import { resetProviderHealth } from "./sources";
import { FakeSupabase } from "./testing/fake-supabase";
import { fakeFetch, igSearch, isApiCall, PROVIDER_ENV, rapidProfile, rapidVideos, scProfile, scVideos, type Route } from "./testing/fixtures";

const ok: Route = (url) =>
  ({
    "/v1/tiktok/profile": { body: scProfile() },
    "/v3/tiktok/profile/videos": { body: scVideos() },
    "/user/info": { body: rapidProfile() },
    "/user/posts": { body: rapidVideos() },
    "/v1/instagram/search/profiles": { body: igSearch },
  })[url.pathname];

const past = new Date(Date.now() - 60_000).toISOString();
const job = (kind: string, platform: string, target: string) => ({ kind, platform, target, status: "queued", run_after: past, priority: kind === "creator_discover" ? 2 : 5 });

describe("queue worker", () => {
  let db: FakeSupabase;
  let fetch: ReturnType<typeof fakeFetch>;

  beforeEach(() => {
    db = new FakeSupabase();
    resetProviderHealth();
    for (const [k, v] of Object.entries(PROVIDER_ENV)) vi.stubEnv(k, v);
    fetch = fakeFetch(ok);
    vi.stubGlobal("fetch", fetch.fn);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("an empty queue costs nothing: no API call, no run row", async () => {
    db.put("creators_index", { username: "luna.beauty", platform: "tiktok" });
    const s = await runScrapeWorker(db.asClient(), { budget: 60, concurrency: 4 });
    expect(s).toMatchObject({ idle: true, reason: "queue empty", apiCalls: 0 });
    expect(fetch.calls).toHaveLength(0);
    expect(db.table("scrape_runs")).toHaveLength(0);
    // It still asks the database to queue creators brands work with (no API call).
    expect(db.rpcCalls.map((c) => c.name)).toEqual(["enqueue_tracked_creators"]);
  });

  it("drains refresh and discovery jobs and logs calls per provider", async () => {
    db.put("creators_index", { username: "luna.beauty", platform: "tiktok" });
    db.put("scrape_jobs", job("creator_refresh", "tiktok", "luna.beauty"));
    db.put("scrape_jobs", job("creator_discover", "instagram", "fashion"));
    const s = await runScrapeWorker(db.asClient(), { budget: 60, concurrency: 2 });
    expect(s).toMatchObject({ idle: false, claimed: 2, done: 2, failed: 0, refreshJobs: 1, discoverJobs: 1, discovered: 2, apiCalls: 3 });
    expect(s.callsByProvider).toEqual({ "scrapecreators-instagram": 1, "scrapecreators-tiktok": 2 });
    const run = db.table("scrape_runs")[0];
    expect(run).toMatchObject({ api_calls: 3, jobs_done: 2, creators_new: 2 });
    // Instagram searches are counted apart from the shared search cap.
    expect(run.notes).toMatchObject({ refreshJobs: 1, discoverJobs: 0, discoverJobsInstagram: 1, discovered: 2, credits: 3, leadsQueued: 1 });
    // The discovered creators' first refreshes are waiting for the next pass, and the
    // hit without a follower count is queued as a lead (looked at before it is added).
    expect(db.table("scrape_jobs").filter((j) => j.status === "queued").map((j) => j.target).sort()).toEqual(["ig_mia.style", "ig_new.ig", "ig_no.count"]);
  });

  it("stops at the weekly cap without spending a call", async () => {
    vi.stubEnv("SCRAPE_WEEKLY_MAX_CREATORS", "10");
    vi.stubEnv("SCRAPE_WEEKLY_MAX_DISCOVERY_KEYWORDS", "0");
    db.put("scrape_runs", { started_at: new Date().toISOString(), api_calls: 20, notes: { refreshJobs: 10 } });
    db.put("scrape_jobs", job("creator_refresh", "tiktok", "luna.beauty"));
    const s = await runScrapeWorker(db.asClient(), { budget: 60, concurrency: 4 });
    expect(s).toMatchObject({ idle: true, reason: "weekly caps reached" });
    expect(fetch.calls).toHaveLength(0);
    expect(db.table("scrape_jobs")[0].status).toBe("queued");
  });

  it("claims only what is left of the weekly cap", async () => {
    vi.stubEnv("SCRAPE_WEEKLY_MAX_CREATORS", "11");
    db.put("scrape_runs", { started_at: new Date().toISOString(), notes: { refreshJobs: 10 } });
    db.put("scrape_jobs", job("creator_refresh", "tiktok", "luna.beauty"));
    db.put("scrape_jobs", job("creator_refresh", "tiktok", "other.one"));
    const s = await runScrapeWorker(db.asClient(), { budget: 60, concurrency: 4 });
    expect(s.claimed).toBe(1);
    expect(db.table("scrape_jobs").filter((j) => j.status === "queued")).toHaveLength(1);
  });

  it("out of credits everywhere: stops and hands the jobs back untouched", async () => {
    vi.stubGlobal(
      "fetch",
      fakeFetch((url) => (url.hostname === "api.scrapecreators.com" ? { status: 402, body: { message: "credits" } } : { status: 429, body: { message: "You have exceeded the MONTHLY quota" } })).fn,
    );
    db.put("creators_index", { username: "luna.beauty", platform: "tiktok", scrape_failures: 0 });
    db.put("scrape_jobs", job("creator_refresh", "tiktok", "luna.beauty"));
    const s = await runScrapeWorker(db.asClient(), { budget: 60, concurrency: 1 });
    expect(s).toMatchObject({ done: 0, failed: 0, deferred: 1, refreshJobs: 0, apiCalls: 2 });
    expect(db.table("scrape_jobs")[0]).toMatchObject({ status: "queued", attempts: 0 });
    expect(db.table("creators_index")[0].scrape_failures).toBe(0);
    expect(db.table("scrape_runs")[0].notes).toMatchObject({ stoppedNoCredits: true });
  });

  it("an account not found fails its job once and backs off", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => ({ status: 404, body: { success: false, message: "User not found" } })).fn);
    db.put("creators_index", { username: "gone.user", platform: "tiktok", scrape_failures: 0 });
    db.put("scrape_jobs", job("creator_refresh", "tiktok", "gone.user"));
    const s = await runScrapeWorker(db.asClient(), { budget: 60, concurrency: 1 });
    expect(s).toMatchObject({ failed: 1, apiCalls: 1 });
    expect(db.table("scrape_jobs")[0].status).toBe("failed");
    expect(db.table("creators_index")[0]).toMatchObject({ scrape_failures: 1, scrape_status: "not_found" });
  });

  it("leaves jobs of a platform without provider in the queue at no cost", async () => {
    // YouTube only has ScrapeCreators (TikTok and Instagram still run on RapidAPI).
    vi.stubEnv("SCRAPECREATORS_API_KEY", "");
    db.put("scrape_jobs", job("creator_refresh", "youtube", "yt_runclub"));
    const s = await runScrapeWorker(db.asClient(), { budget: 60, concurrency: 1 });
    expect(s).toMatchObject({ idle: true, reason: "queue empty" });
    expect(fetch.calls.filter(isApiCall)).toHaveLength(0);
  });
});
