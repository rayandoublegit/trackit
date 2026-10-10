import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { PlanTier } from "@/lib/plan-limits";

// Paywalls on the API routes, with fakes: the workspace owner's plan is set per
// test (resolveOwnerPlan), the data layer returns creators with emails.

let plan: PlanTier = "free";
const OWNER = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/api-auth", () => ({ getAuthedUserId: vi.fn(async () => OWNER), getAuthedActorId: vi.fn(async () => OWNER) }));
vi.mock("@/lib/plan-gate-server", async (orig) => ({
  ...(await orig<typeof import("@/lib/plan-gate-server")>()),
  resolveOwnerPlan: vi.fn(async () => plan),
}));

const missing = { code: "PGRST205", message: "Could not find the table 'public.feature_usage' in the schema cache" };
function fakeTable() {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "order", "in", "ilike", "update"]) chain[m] = () => chain;
  chain.limit = async () => ({ data: null, error: missing });
  chain.maybeSingle = async () => ({ data: null, error: null });
  chain.insert = async () => ({ error: missing });
  return chain;
}
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: () => fakeTable() }) }));

const withEmail = (username: string) => ({ username, email: `${username}@mail.com`, bio: `Pro: ${username}.pro@gmail.com`, platform: "tiktok" });
const queryCatalog = vi.fn(async (q: { offset?: number; limit?: number }) => ({
  creators: Array.from({ length: q.limit ?? 24 }, (_, i) => withEmail(`c${(q.offset ?? 0) + i}`)),
  hasMore: true,
  total: 500,
}));
const liveCreatorSearch = vi.fn(async () => [withEmail("live1")]);
vi.mock("@/lib/catalog-query", async (orig) => ({
  ...(await orig<typeof import("@/lib/catalog-query")>()),
  queryCatalog: (q: { offset?: number; limit?: number }) => queryCatalog(q),
  liveCreatorSearch: () => liveCreatorSearch(),
  liveSearchAvailable: () => true,
}));

const readVideoLibrary = vi.fn(async (_admin: unknown, q: { offset?: number; limit?: number }) => ({
  videos: Array.from({ length: q.limit ?? 24 }, (_, i) => ({ id: String((q.offset ?? 0) + i) })),
  hasMore: true,
  source: "tracked" as const,
}));
vi.mock("@/lib/creator-intel-read", async (orig) => ({
  ...(await orig<typeof import("@/lib/creator-intel-read")>()),
  readVideoLibrary: (admin: unknown, q: { offset?: number; limit?: number }) => readVideoLibrary(admin, q),
  readCreatorProfile: async () => ({ creator: withEmail("luna"), history: [], videos: [], similar: [withEmail("sim")], hashtags: [], mix: {}, depth: "snapshot" }),
}));

const runCreatorLookup = vi.fn(async (_deps: unknown, input: { allowLive?: boolean }) =>
  input.allowLive === false
    ? { status: 402, body: { ok: false as const, code: "plan_required" as const, message: "Live lookup comes with Growth.", handle: "luna" } }
    : { status: 200, body: { ok: true as const, creator: withEmail("luna"), storageKey: "luna", platform: "tiktok" as const, source: "live" as const, isNew: true, isBrand: false, apiCalls: 2 } },
);
vi.mock("@/lib/creator-live-lookup-server", () => ({ runCreatorLookup: (d: unknown, i: { allowLive?: boolean }) => runCreatorLookup(d, i) }));
vi.mock("@/lib/scraper/sources", () => ({ sourceFor: () => null }));

const anthropicCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    messages = { create: anthropicCreate };
    static APIError = class extends Error {};
  }
  return { default: Anthropic };
});

// /api/generate-outreach reads the session through @supabase/ssr.
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: OWNER, email: "brand@test.local" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { plan }, error: null }) }) }) }),
  }),
}));
vi.mock("@/lib/workspace-access", () => ({ resolveWorkspaceContextForUser: async () => ({ ownerId: OWNER }) }));

const PAYWALL_KEYS = ["ok", "error", "feature", "used", "limit", "requiredTier", "resetsAt"];
function expectPaywall(body: Record<string, unknown>, feature: string, requiredTier: PlanTier) {
  for (const key of PAYWALL_KEYS) expect(body, key).toHaveProperty(key);
  expect(body).toMatchObject({ ok: false, error: "plan_required", feature, requiredTier, used: null, limit: null, resetsAt: null });
}

const get = (url: string) => new NextRequest(new URL(url, "http://localhost"));
const postJson = (url: string, body: unknown) =>
  new NextRequest(new URL(url, "http://localhost"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// 16 bytes that sniff as a PNG.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("0000IHDR")]).toString("base64");

beforeEach(() => {
  plan = "free";
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.MINO_ANALYSIS_MAX_PER_HOUR;
});

describe("/api/creators/lookup", () => {
  it("Free: live lookup is refused with the 402 payload (live-lookup, Growth)", async () => {
    const { POST } = await import("./creators/lookup/route");
    const res = await POST(get("/api/creators/lookup?q=@luna&platform=tiktok"));
    expect(res.status).toBe(402);
    const body = await res.json();
    expectPaywall(body, "live-lookup", "basic");
    expect(body.code).toBe("plan_required");
    expect(runCreatorLookup.mock.calls[0][1]).toMatchObject({ allowLive: false });
  });
  it("Growth: live allowed, email kept", async () => {
    plan = "basic";
    const { POST } = await import("./creators/lookup/route");
    const res = await POST(get("/api/creators/lookup?q=@luna&platform=tiktok"));
    expect(res.status).toBe(200);
    expect((await res.json()).creator.email).toBe("luna@mail.com");
    expect(runCreatorLookup.mock.calls[0][1]).toMatchObject({ allowLive: true });
  });
});

describe("/api/mino/analyze", () => {
  it("Free: 402 before any AI call", async () => {
    const { POST } = await import("./mino/analyze/route");
    const res = await POST(postJson("/api/mino/analyze", { message: "go", image: { data: PNG, mediaType: "image/png" } }) as unknown as Request);
    expect(res.status).toBe(402);
    expectPaywall(await res.json(), "mino-analysis", "basic");
    expect(anthropicCreate).not.toHaveBeenCalled();
  });
  it("Growth over the hourly limit: 429 rate_limited, still no AI call", async () => {
    plan = "basic";
    process.env.MINO_ANALYSIS_MAX_PER_HOUR = "0";
    const { POST } = await import("./mino/analyze/route");
    const res = await POST(postJson("/api/mino/analyze", { message: "go", image: { data: PNG, mediaType: "image/png" } }) as unknown as Request);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ ok: false, error: "rate_limited", feature: "mino-analysis" });
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(anthropicCreate).not.toHaveBeenCalled();
  });
});

describe("/api/catalog", () => {
  it("Free: first 10 rows only, no emails, teaserLocked; the next page is walled", async () => {
    const { GET } = await import("./catalog/route");
    const res = await GET(get("/api/catalog?niche=beauty&offset=0&limit=24"));
    const body = await res.json();
    expect(body.creators).toHaveLength(10);
    expect(queryCatalog.mock.calls[0][0]).toMatchObject({ offset: 0, limit: 10 });
    expect(body.hasMore).toBe(false);
    expect(body.teaserLocked).toBe(true);
    expect(body.creators.every((c: Record<string, unknown>) => c.email === null && c.hasEmail === true && c.emailLocked === true)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/@mail\.com|@gmail\.com/);

    queryCatalog.mockClear();
    const next = await (await GET(get("/api/catalog?niche=beauty&offset=10&limit=24"))).json();
    expect(next).toMatchObject({ creators: [], hasMore: false, teaserLocked: true });
    expect(queryCatalog).not.toHaveBeenCalled();
  });
  it("Free: never a live platform search (Instagram keyword with an empty catalog)", async () => {
    queryCatalog.mockResolvedValueOnce({ creators: [], hasMore: false, total: 0 });
    const { GET } = await import("./catalog/route");
    const body = await (await GET(get("/api/catalog?platform=Instagram&search=skincare"))).json();
    expect(body).toMatchObject({ creators: [], liveLocked: true });
    expect(liveCreatorSearch).not.toHaveBeenCalled();
  });
  it("Free: searching by email address finds nothing", async () => {
    const { GET } = await import("./catalog/route");
    const body = await (await GET(get("/api/catalog?search=luna@mail.com"))).json();
    expect(body.creators).toEqual([]);
    expect(queryCatalog).not.toHaveBeenCalled();
  });
  it("Growth: pages freely, emails visible, live search allowed", async () => {
    plan = "basic";
    const { GET } = await import("./catalog/route");
    const body = await (await GET(get("/api/catalog?niche=beauty&offset=48&limit=24"))).json();
    expect(body.creators).toHaveLength(24);
    expect(body.hasMore).toBe(true);
    expect(body.teaserLocked).toBeUndefined();
    expect(body.creators[0].email).toBe("c48@mail.com");
    queryCatalog.mockResolvedValueOnce({ creators: [], hasMore: false, total: 0 });
    const live = await (await GET(get("/api/catalog?platform=Instagram&search=skincare"))).json();
    expect(live.source).toBe("live");
    expect(live.creators[0].email).toBe("live1@mail.com");
  });
});

describe("/api/creator-profile", () => {
  it("Free: no email on the creator nor on similar creators", async () => {
    const { GET } = await import("./creator-profile/route");
    const body = await (await GET(get("/api/creator-profile?username=luna"))).json();
    expect(body.creator).toMatchObject({ email: null, hasEmail: true, emailLocked: true });
    expect(body.similar[0].email).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/@mail\.com|@gmail\.com/);
  });
  it("Pro: emails kept", async () => {
    plan = "pro";
    const { GET } = await import("./creator-profile/route");
    const body = await (await GET(get("/api/creator-profile?username=luna"))).json();
    expect(body.creator.email).toBe("luna@mail.com");
  });
});

describe("/api/videos", () => {
  it("Free: first 12 videos, then walled", async () => {
    const { GET } = await import("./videos/route");
    const first = await (await GET(get("/api/videos?offset=0&limit=24"))).json();
    expect(first.videos).toHaveLength(12);
    expect(first).toMatchObject({ hasMore: false, teaserLocked: true });
    const next = await (await GET(get("/api/videos?offset=12&limit=24"))).json();
    expect(next).toMatchObject({ videos: [], teaserLocked: true });
  });
  it("Growth: no wall", async () => {
    plan = "basic";
    const { GET } = await import("./videos/route");
    const body = await (await GET(get("/api/videos?offset=96&limit=24"))).json();
    expect(body.videos).toHaveLength(24);
    expect(body.teaserLocked).toBeUndefined();
  });
});

describe("/api/generate-outreach", () => {
  it("Growth: AI drafts are Pro — 402 ai-outreach, no AI call", async () => {
    plan = "basic";
    const { POST } = await import("./generate-outreach/route");
    const res = await POST(postJson("/api/generate-outreach", { creator: { username: "luna" }, brand: "Maison" }));
    expect(res.status).toBe(402);
    expectPaywall(await res.json(), "ai-outreach", "pro");
    expect(anthropicCreate).not.toHaveBeenCalled();
  });
});
