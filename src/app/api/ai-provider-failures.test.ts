import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { PlanTier } from "@/lib/plan-limits";
import { resetAiFailureReports } from "@/lib/ai-provider";

// When the AI provider fails (Cheaper Inference 402 "no credit", Anthropic 400
// "Your credit balance is too low"…), every LLM caller answers honestly
// instead of crashing. Calls go through src/lib/llm.ts (gateway via fetch).

let plan: PlanTier = "pro";
let authed = true;
const OWNER = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/api-auth", () => ({
  getAuthedUserId: vi.fn(async () => (authed ? OWNER : null)),
  getAuthedActorId: vi.fn(async () => (authed ? OWNER : null)),
}));
vi.mock("@/lib/plan-gate-server", async (orig) => ({
  ...(await orig<typeof import("@/lib/plan-gate-server")>()),
  resolveOwnerPlan: vi.fn(async () => plan),
}));
function fakeTable() {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "order", "in", "ilike", "update"]) chain[m] = () => chain;
  chain.limit = async () => ({ data: [], error: null });
  chain.maybeSingle = async () => ({ data: { business_name: "Maison Lune", plan }, error: null });
  chain.insert = async () => ({ error: null });
  return chain;
}
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: () => fakeTable() }) }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: OWNER, email: "brand@test.local" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { plan }, error: null }) }) }) }),
  }),
}));
vi.mock("@/lib/workspace-access", () => ({ resolveWorkspaceContextForUser: async () => ({ ownerId: OWNER }) }));

const runCreatorSearch = vi.fn();
vi.mock("@/lib/mino-creator-search", async (orig) => ({
  ...(await orig<typeof import("@/lib/mino-creator-search")>()),
  runCreatorSearch: (...args: unknown[]) => runCreatorSearch(...args),
}));

class FakeApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const creditError = () =>
  new FakeApiError(400, '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}');

const anthropicCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    messages = { create: anthropicCreate };
    static APIError = FakeApiError;
  }
  return { default: Anthropic };
});
const gatewayFetch = vi.fn();
const creditResponse = () => new Response(JSON.stringify({ error: { message: "Insufficient credit: top up your wallet" } }), { status: 402 });
const okResponse = (text: string) =>
  Response.json({ model: "claude-sonnet-5.5", choices: [{ message: { content: text }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0001 } });
const sendEmail = vi.fn(async () => ({}));
vi.mock("resend", () => ({ Resend: class { emails = { send: sendEmail }; } }));

const postJson = (url: string, body: unknown) =>
  new NextRequest(new URL(url, "http://localhost"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  plan = "pro";
  authed = true;
  vi.clearAllMocks();
  resetAiFailureReports();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.CHEAPER_INFERENCE_API_KEY = "ci-test";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.RESEND_API_KEY;
  anthropicCreate.mockRejectedValue(creditError());
  gatewayFetch.mockReset();
  gatewayFetch.mockImplementation(async () => creditResponse());
  vi.stubGlobal("fetch", gatewayFetch);
});

describe("lib/ai-provider", () => {
  it("classifies the Anthropic credit error as billing and logs it once", async () => {
    const { classifyAiError, reportAiFailure } = await import("@/lib/ai-provider");
    expect(classifyAiError(creditError()).kind).toBe("billing");
    expect(classifyAiError(new FakeApiError(529, "Overloaded")).kind).toBe("overloaded");
    expect(classifyAiError(new FakeApiError(401, "invalid x-api-key")).kind).toBe("auth");
    expect(classifyAiError(new FakeApiError(400, "messages: field required")).kind).toBe("request");
    reportAiFailure("t", creditError(), 1_000);
    reportAiFailure("t", creditError(), 2_000);
    expect(console.error).toHaveBeenCalledTimes(1);
  });
  it("emails the team once when the owner has to act", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const { reportAiFailure } = await import("@/lib/ai-provider");
    reportAiFailure("t", creditError(), 1_000);
    reportAiFailure("t", creditError(), 5_000);
    await new Promise((r) => setTimeout(r, 20));
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("lib/llm through ai-provider", () => {
  it("a gateway 402 is a billing failure (owner must top up)", async () => {
    const { chat } = await import("@/lib/llm");
    const { classifyAiError } = await import("@/lib/ai-provider");
    const err = await chat([{ role: "user", content: "hi" }]).catch((e) => e);
    expect(classifyAiError(err).kind).toBe("billing");
  });
  it("falls back to Anthropic direct when the gateway is down and a key is set", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    gatewayFetch.mockImplementation(async () => new Response("bad gateway", { status: 502 }));
    anthropicCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "hello" }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" });
    const { chat } = await import("@/lib/llm");
    const r = await chat([{ role: "user", content: "hi" }]);
    expect(r).toMatchObject({ text: "hello", provider: "anthropic" });
  });
});

describe("/api/ai-chat", () => {
  it("plain chat: 503 ai_unavailable with the French sentence, not a 500", async () => {
    const { POST } = await import("./ai-chat/route");
    const res = await POST(postJson("/api/ai-chat", { messages: [{ role: "user", content: "salut" }], lang: "fr" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "ai_unavailable" });
    expect(body.message).toMatch(/Mino est momentanément indisponible/);
  });
  it("creator search: the cards still come back with a plain sentence", async () => {
    plan = "basic";
    runCreatorSearch.mockResolvedValue({
      search: { niche: "beauty", keywords: ["beauty"] },
      sources: ["catalog"],
      creators: [{ username: "luna", platform: "tiktok", followersCount: 12000, engagementRate: 4.2, primaryNiche: "beauty" }],
    });
    const { POST } = await import("./ai-chat/route");
    const res = await POST(postJson("/api/ai-chat", { messages: [{ role: "user", content: "beauty creators in France" }], lang: "en" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.aiUnavailable).toBe(true);
    expect(body.creators?.length).toBe(1);
    expect(body.reply).toMatch(/creators/i);
  });
});

describe("/api/generate-outreach", () => {
  it("Pro: provider down gives 503 ai_unavailable (the composer falls back to the template)", async () => {
    const { POST } = await import("./generate-outreach/route");
    const res = await POST(postJson("/api/generate-outreach", { creator: { username: "luna" }, brand: "Maison", lang: "fr" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "ai_unavailable" });
  });
});

describe("/api/generate-follow-up", () => {
  it("signed out: 401, no AI call", async () => {
    authed = false;
    const { POST } = await import("./generate-follow-up/route");
    const res = await POST(postJson("/api/generate-follow-up", { creator: { username: "luna" }, originalMessage: "Hi" }));
    expect(res.status).toBe(401);
    expect(gatewayFetch).not.toHaveBeenCalled();
  });
  it("Growth: 402, no AI call", async () => {
    plan = "basic";
    const { POST } = await import("./generate-follow-up/route");
    const res = await POST(postJson("/api/generate-follow-up", { creator: { username: "luna" }, originalMessage: "Hi" }));
    expect(res.status).toBe(402);
    expect(gatewayFetch).not.toHaveBeenCalled();
  });
  it("Pro: signs with the brand's business name, not Trackit", async () => {
    gatewayFetch.mockImplementationOnce(async () => okResponse("Hey Luna, just following up."));
    const { POST } = await import("./generate-follow-up/route");
    const res = await POST(postJson("/api/generate-follow-up", { creator: { username: "luna" }, originalMessage: "Hi", brand: "Trackit" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ message: "Hey Luna, just following up." });
    const sent = JSON.parse(String((gatewayFetch.mock.calls[0] as [string, RequestInit])[1].body));
    expect(sent.model).toBe("claude-sonnet-5.5");
    const prompt = sent.messages[0].content as string;
    expect(prompt).toContain("Brand: Maison Lune");
  });
  it("Pro: provider down gives 503 ai_unavailable", async () => {
    const { POST } = await import("./generate-follow-up/route");
    const res = await POST(postJson("/api/generate-follow-up", { creator: { username: "luna" }, originalMessage: "Hi", lang: "fr" }));
    expect(res.status).toBe(503);
    expect((await res.json()).message).toMatch(/Mino est momentanément indisponible/);
  });
});

describe("/api/ai-command", () => {
  it("provider down: falls back to the local parser (ok, source fallback)", async () => {
    const { POST } = await import("./ai-command/route");
    const res = await POST(postJson("/api/ai-command", { text: "open payouts", lang: "en" }));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, source: "fallback" });
    expect(body.command.action).toBe("navigate");
  });
  it("provider down + small talk: says Mino is unavailable instead of a canned line", async () => {
    const { POST } = await import("./ai-command/route");
    const body = await (await POST(postJson("/api/ai-command", { text: "salut ça va", lang: "fr" }))).json();
    expect(body.command).toMatchObject({ action: "chat" });
    expect(body.command.reply).toMatch(/Mino est momentanément indisponible/);
  });
});
