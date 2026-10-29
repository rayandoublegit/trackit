import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Paywall of /api/creator-insights and of the insight filters on /api/videos:
// Growth and above get the content, Free gets `locked` / 402 / insightsLocked.

let plan = "free";
const readCreatorInsights = vi.fn(async (_a: unknown, _u: string, opts: { full: boolean }) => ({ username: "luna", platform: "tiktok", status: "ready", locked: !opts.full, progress: { analysed: 8, tracked: 30 }, synthesis: opts.full ? { summaryEn: "x" } : null, videos: {} }));
const readTranscript = vi.fn(async () => ({ status: "ok", text: "hi", segments: [] }));
const readInsightLibrary = vi.fn(async () => ({ videos: [], hasMore: false, source: "tracked", insights: {} }));

vi.mock("@/lib/api-auth", () => ({ getAuthedUserId: vi.fn(async () => "owner") }));
vi.mock("@/lib/plan-gate-server", () => ({ resolveOwnerPlan: vi.fn(async () => plan) }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/video-intel/read", async (orig) => ({
  ...(await orig<typeof import("@/lib/video-intel/read")>()),
  readCreatorInsights: (a: unknown, u: string, o: { full: boolean }) => readCreatorInsights(a, u, o),
  readTranscript: () => readTranscript(),
  readInsightLibrary: () => readInsightLibrary(),
}));
vi.mock("@/lib/creator-intel-read", async (orig) => ({
  ...(await orig<typeof import("@/lib/creator-intel-read")>()),
  readVideoLibrary: vi.fn(async () => ({ videos: [], hasMore: false, source: "tracked" })),
}));

const get = (path: string) => new NextRequest(new URL(path, "http://localhost"));

beforeEach(() => {
  plan = "free";
  vi.clearAllMocks();
});

describe("/api/creator-insights", () => {
  it("Free: locked teaser, no transcript (402)", async () => {
    const { GET } = await import("./route");
    const body = await (await GET(get("/api/creator-insights?username=luna"))).json();
    expect(body).toMatchObject({ locked: true, synthesis: null });
    expect((await GET(get("/api/creator-insights?transcript=tiktok:111"))).status).toBe(402);
    expect(readTranscript).not.toHaveBeenCalled();
  });

  it("Growth: full insights and transcripts on demand", async () => {
    plan = "basic";
    const { GET } = await import("./route");
    const body = await (await GET(get("/api/creator-insights?username=luna"))).json();
    expect(body).toMatchObject({ locked: false, synthesis: { summaryEn: "x" } });
    const t = await GET(get("/api/creator-insights?transcript=tiktok:111"));
    expect(t.status).toBe(200);
    expect((await GET(get("/api/creator-insights?transcript=nope"))).status).toBe(400);
  });
});

describe("/api/videos insight filters", () => {
  it("Free: walled with insightsLocked, nothing read", async () => {
    const { GET } = await import("../videos/route");
    const body = await (await GET(get("/api/videos?hookType=question"))).json();
    expect(body).toMatchObject({ videos: [], insightsLocked: true });
    expect(readInsightLibrary).not.toHaveBeenCalled();
  });

  it("Growth: filtered through the insights view", async () => {
    plan = "basic";
    const { GET } = await import("../videos/route");
    await GET(get("/api/videos?contentFormat=review&sort=performance"));
    expect(readInsightLibrary).toHaveBeenCalledOnce();
  });
});
