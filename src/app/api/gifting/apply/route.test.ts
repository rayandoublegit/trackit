import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getAuthedActorId } from "@/lib/api-auth";
import { insertBrandNotification } from "@/lib/brand-notifications";
import { joinCreatorToBrand } from "@/lib/creator-brand-join";

const brandId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const creatorId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const token = "T0k3n_abcdefghijklmnopqrstuvwxyz";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
const inserts: { table: string; value: Row }[] = [];

function campaign(patch: Row = {}): Row {
  return {
    id: "camp-1",
    user_id: brandId,
    workspace_id: brandId,
    share_token: token,
    share_enabled: true,
    status: "active",
    name: "Routine",
    product: "Sérum",
    brief: "Montre la texture.",
    deadline: "2999-01-01",
    video_count: 1,
    fixed_fee_cents: 0,
    allow_ads: false,
    rights_days: 0,
    territories: "",
    spots: 3,
    auto_approve: false,
    platforms: ["tiktok", "instagram"],
    countries: [],
    min_followers: 0,
    ...patch,
  };
}

function query(table: string) {
  let rows = [...(tables[table] ?? [])];
  const api = {
    select() { return api; },
    eq(column: string, value: unknown) {
      rows = rows.filter((row) => row[column] === value);
      return api;
    },
    update() { return api; },
    insert(value: Row) {
      inserts.push({ table, value });
      return Promise.resolve({ data: null, error: null });
    },
    async maybeSingle() { return { data: rows[0] ?? null, error: null }; },
    then(resolve: (value: { data: Row[]; error: null }) => unknown) {
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };
  return api;
}

const rpc = vi.fn(async (_fn: string, _args: Row) => ({ data: { ok: true, code: "ok", status: "applied", mission_id: "m-1" } as Row, error: null }));

vi.mock("@/lib/api-auth", () => ({ getAuthedActorId: vi.fn(async () => creatorId) }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: query, rpc }) }));
vi.mock("@/lib/brand-notifications", () => ({ insertBrandNotification: vi.fn(async () => undefined) }));
vi.mock("@/lib/creator-brand-join", () => ({
  joinCreatorToBrand: vi.fn(async () => ({ ok: true, creatorRowId: "row-1", workspaceId: brandId, handle: "lea" })),
  publicBrandName: vi.fn(async () => "Maison Test"),
}));

import { GET, POST } from "./route";

function post(body: Row) {
  return POST(new NextRequest("http://localhost/api/gifting/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}
const application = { token, platform: "tiktok", handle: "@Lea", message: "Coucou", acceptTerms: true, lang: "fr" };

describe("gift share link: apply", () => {
  beforeEach(() => {
    tables = {
      gift_campaigns: [campaign()],
      gift_missions: [],
      profiles: [
        { id: brandId, plan: "pro", account_type: "brand", onboarding_completed: true },
        { id: creatorId, account_type: "brand", onboarding_completed: false, username: null, full_name: "Léa" },
      ],
      creator_links: [],
      creators_index: [{ username: "lea", followers: 12000, avg_views: 3000, engagement_rate: 5, country_code: "FR", avatar_url: "https://cdn/lea.jpg", display_name: "Léa" }],
      workspaces: [{ id: brandId, name: "Maison Test", avatar_url: null }],
    };
    inserts.length = 0;
    rpc.mockClear();
    vi.mocked(insertBrandNotification).mockClear();
    vi.mocked(joinCreatorToBrand).mockClear();
    vi.mocked(getAuthedActorId).mockResolvedValue(creatorId);
  });

  it("requires a signed-in account", async () => {
    vi.mocked(getAuthedActorId).mockResolvedValueOnce(null);
    const res = await post(application);
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers 404 for a malformed or unknown token, without touching the database function", async () => {
    expect((await post({ ...application, token: "nope" })).status).toBe(404);
    expect((await post({ ...application, token: "Z".repeat(32) })).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("applies: new account becomes a creator of the brand, mission created through the atomic function, brand notified", async () => {
    const res = await post(application);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, missionStatus: "applied" });
    expect(joinCreatorToBrand).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ brandId, creatorId, socialHandle: "lea" }));
    expect(rpc).toHaveBeenCalledWith(
      "gift_apply_to_campaign",
      expect.objectContaining({
        p_campaign_id: "camp-1",
        p_creator_user_id: creatorId,
        p_handle: "lea",
        p_platform: "tiktok",
        p_message: "Coucou",
        p_auto_approve: false,
        p_max_per_hour: 8,
        p_stats: expect.objectContaining({ followers: 12000, country: "FR" }),
      }),
    );
    const args = rpc.mock.calls[0][1] as Row;
    expect(String(args.p_contract)).toContain("Maison Test invite @lea");
    expect(insertBrandNotification).toHaveBeenCalledWith(expect.anything(), brandId, "gift_application", expect.objectContaining({ handle: "lea", autoApproved: false }));
  });

  it("auto-approves when the campaign says so and the stats meet every requirement, and activates the link", async () => {
    tables.gift_campaigns = [campaign({ auto_approve: true, min_followers: 10000, countries: ["FR"] })];
    rpc.mockResolvedValueOnce({ data: { ok: true, code: "ok", status: "invited" }, error: null });
    const res = await post(application);
    expect(await res.json()).toMatchObject({ ok: true, missionStatus: "invited" });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_auto_approve: true });
    expect(inserts).toContainEqual({ table: "creator_links", value: { creator_id: creatorId, brand_id: brandId, status: "active" } });
  });

  it("sends unknown stats to manual review even on auto-approve", async () => {
    tables.gift_campaigns = [campaign({ auto_approve: true, min_followers: 10000 })];
    tables.creators_index = [];
    await post(application);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_auto_approve: false, p_stats: null });
  });

  it("refuses creators who miss a requirement", async () => {
    tables.gift_campaigns = [campaign({ min_followers: 50000 })];
    const res = await post(application);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, error: "requirements", failures: ["followers"] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses closed, paused, expired and full campaigns, and brands without a paid plan", async () => {
    const cases: [Row, string][] = [
      [{ status: "completed" }, "closed"],
      [{ share_enabled: false }, "disabled"],
      [{ deadline: "2020-01-01" }, "expired"],
    ];
    for (const [patch, code] of cases) {
      tables.gift_campaigns = [campaign(patch)];
      const res = await post(application);
      expect(res.status).toBe(410);
      expect((await res.json()).error).toBe(code);
    }
    tables.gift_campaigns = [campaign({ spots: 1 })];
    tables.gift_missions = [{ campaign_id: "camp-1", status: "signed" }, { campaign_id: "camp-1", status: "applied" }];
    expect((await (await post(application)).json()).error).toBe("full");
    tables.gift_missions = [];
    tables.profiles[0] = { id: brandId, plan: "free" };
    expect((await (await post(application)).json()).error).toBe("disabled");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never turns an onboarded brand into a creator, nor lets the owner apply", async () => {
    tables.profiles[1] = { id: creatorId, account_type: "brand", onboarding_completed: true };
    expect((await post(application)).status).toBe(403);
    vi.mocked(getAuthedActorId).mockResolvedValueOnce(brandId);
    expect((await (await post(application)).json()).error).toBe("own_campaign");
    expect(joinCreatorToBrand).not.toHaveBeenCalled();
  });

  it("validates the form: terms, platform allowed by the campaign, handle", async () => {
    expect((await (await post({ ...application, acceptTerms: false })).json()).error).toBe("terms");
    tables.gift_campaigns = [campaign({ platforms: ["instagram"] })];
    expect((await (await post(application)).json()).error).toBe("platform");
    tables.gift_campaigns = [campaign()];
    expect((await (await post({ ...application, handle: "not a handle" })).json()).error).toBe("handle");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a creator the brand revoked", async () => {
    tables.creator_links = [{ id: "l1", creator_id: creatorId, brand_id: brandId, status: "revoked" }];
    expect((await post(application)).status).toBe(403);
  });

  it("keeps an existing link as it is and does not re-run the join", async () => {
    tables.creator_links = [{ id: "l1", creator_id: creatorId, brand_id: brandId, status: "active" }];
    await post(application);
    expect(joinCreatorToBrand).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalled();
  });

  it("maps the database answers: already applied, rate limit, race on the last spot", async () => {
    rpc.mockResolvedValueOnce({ data: { ok: false, code: "already", status: "applied" }, error: null });
    let res = await post(application);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, alreadyApplied: true, missionStatus: "applied" });
    rpc.mockResolvedValueOnce({ data: { ok: false, code: "rate_limited" }, error: null });
    res = await post(application);
    expect(res.status).toBe(429);
    rpc.mockResolvedValueOnce({ data: { ok: false, code: "full" }, error: null });
    res = await post(application);
    expect(res.status).toBe(410);
    expect(insertBrandNotification).not.toHaveBeenCalled();
  });
});

describe("gift share link: viewer state", () => {
  it("tells the page who is looking and the existing application, nothing else", async () => {
    tables.gift_missions = [{ id: "m-1", campaign_id: "camp-1", creator_user_id: creatorId, status: "applied", address: { line: "secret" } }];
    const res = await GET(new NextRequest(`http://localhost/api/gifting/apply?token=${token}`));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, viewer: "creator", mission: { status: "applied" } });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain(brandId);
  });

  it("is anonymous without a session and 404 for a bad token", async () => {
    vi.mocked(getAuthedActorId).mockResolvedValueOnce(null);
    expect(await (await GET(new NextRequest(`http://localhost/api/gifting/apply?token=${token}`))).json()).toEqual({ ok: true, viewer: "anonymous", mission: null });
    expect((await GET(new NextRequest("http://localhost/api/gifting/apply?token=x"))).status).toBe(404);
  });
});
