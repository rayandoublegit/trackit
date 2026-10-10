import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { requireBrandSpace } from "@/lib/brand-workspace-server";

const actorId = "11111111-1111-4111-8111-111111111111";
const unclaimedMission = {
  id: "22222222-2222-4222-8222-222222222222",
  campaign_id: "33333333-3333-4333-8333-333333333333",
  creator_handle: "shared",
  creator_user_id: null,
  status: "invited",
  contract_text: "Private contract",
  address: { line: "Private address" },
  signed_name: null,
  signed_at: null,
  carrier: null,
  tracking_number: null,
  shipped_at: null,
  delivered_at: null,
};

const tables: Record<string, Record<string, unknown>[]> = {
  profiles: [{ id: actorId, account_type: "creator", username: "shared" }],
  gift_missions: [unclaimedMission],
  gift_campaigns: [{ id: unclaimedMission.campaign_id, name: "Private campaign" }],
  gift_videos: [],
  creators: [],
  creator_links: [],
};

let fileInfo = { size: 1024, contentType: "video/mp4" };
const signedUrlFor = vi.fn(async (path: string) => ({ data: { signedUrl: `https://storage.example/${path}` }, error: null }));
const storage = {
  from: vi.fn(() => ({
    createSignedUploadUrl: vi.fn(async () => ({ data: { token: "short-lived-token" }, error: null })),
    createSignedUrl: signedUrlFor,
    info: vi.fn(async () => ({ data: fileInfo, error: null })),
  })),
};
const commit = vi.fn(async () => ({ data: true, error: null }));

function query(table: string) {
  let rows = [...(tables[table] ?? [])];
  const api = {
    select() { return api; },
    update() { return api; },
    eq(column: string, value: unknown) {
      rows = rows.filter((row) => row[column] === value);
      return api;
    },
    is(column: string, value: unknown) {
      rows = rows.filter((row) => row[column] === value);
      return api;
    },
    in(column: string, values: unknown[]) {
      rows = rows.filter((row) => values.includes(row[column]));
      return api;
    },
    limit() { return api; },
    insert(value: Record<string, unknown>) {
      rows = [{ id: "44444444-4444-4444-8444-444444444444", ...value }];
      return api;
    },
    async single() { return { data: rows[0] ?? null, error: null }; },
    async maybeSingle() { return { data: rows[0] ?? null, error: null }; },
    then(resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) {
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };
  return api;
}

vi.mock("@/lib/api-auth", () => ({ getAuthedActorId: vi.fn(async () => actorId) }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: query, storage, rpc: commit }) }));
vi.mock("@/lib/brand-workspace-server", () => ({ requireBrandSpace: vi.fn(async () => ({ error: new Response(null, { status: 403 }) })) }));

import { GET, POST } from "./route";

describe("gift mission privacy", () => {
  beforeEach(() => {
    storage.from.mockClear();
    commit.mockClear();
    fileInfo = { size: 1024, contentType: "video/mp4" };
    tables.gift_campaigns = [{ id: unclaimedMission.campaign_id, name: "Private campaign" }];
    tables.profiles = [{ id: actorId, account_type: "creator", username: "shared" }];
    tables.gift_missions = [unclaimedMission];
    tables.gift_videos = [];
    tables.creators = [];
    tables.creator_links = [];
    vi.mocked(requireBrandSpace).mockResolvedValue({ error: new Response(null, { status: 403 }) } as never);
  });

  it("does not reveal an unclaimed mission merely because a profile has the same handle", async () => {
    const response = await GET(new NextRequest("http://localhost/api/gifting"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.missions).toEqual([]);
    expect(body.campaigns).toEqual([]);
  });

  it("does not let a matching handle accept another creator's unclaimed mission", async () => {
    const response = await POST(new NextRequest("http://localhost/api/gifting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "act", missionId: unclaimedMission.id, action: { type: "accept" } }),
    }));
    expect(response.status).toBe(403);
  });

  it("does not create a gift mission for an unlinked social handle", async () => {
    tables.profiles = [{ id: actorId, account_type: "brand", plan: "pro", full_name: "Maison Bloom" }];
    tables.gift_campaigns = [{
      id: unclaimedMission.campaign_id,
      user_id: actorId,
      workspace_id: "55555555-5555-4555-8555-555555555555",
      name: "Routine",
      product: "Sérum",
      brief: "Test",
      deadline: "2026-10-23",
      video_count: 1,
      fixed_fee_cents: 0,
      allow_ads: false,
      rights_days: 0,
      territories: "",
    }];
    vi.mocked(requireBrandSpace).mockResolvedValue({ ownerId: actorId, spaceId: "55555555-5555-4555-8555-555555555555" });
    const response = await POST(new NextRequest("http://localhost/api/gifting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "invite", campaignId: unclaimedMission.campaign_id, handle: "shared", platform: "tiktok" }),
    }));
    expect(response.status).toBe(409);
  });

  it("does not issue a video upload token to a creator who merely shares the handle", async () => {
    const response = await POST(new NextRequest("http://localhost/api/gifting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "upload_url", missionId: unclaimedMission.id, contentType: "video/mp4", size: 1024 }),
    }));
    expect(response.status).toBe(403);
    expect(storage.from).not.toHaveBeenCalled();
  });

  it("issues a short-lived private upload token only to the assigned creator", async () => {
    tables.gift_missions = [{ ...unclaimedMission, creator_user_id: actorId, status: "delivered" }];
    const response = await POST(new NextRequest("http://localhost/api/gifting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "upload_url", missionId: unclaimedMission.id, contentType: "video/mp4", size: 1024 }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.path).toMatch(new RegExp(`^${unclaimedMission.id}/[0-9a-f-]{36}\\.mp4$`));
    expect(body.token).toBe("short-lived-token");
  });

  it("rejects an oversized upload before issuing a token", async () => {
    tables.gift_missions = [{ ...unclaimedMission, creator_user_id: actorId, status: "delivered" }];
    const response = await POST(new NextRequest("http://localhost/api/gifting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "upload_url", missionId: unclaimedMission.id, contentType: "video/mp4", size: 501 * 1024 * 1024 }),
    }));
    expect(response.status).toBe(400);
    expect(storage.from).not.toHaveBeenCalled();
  });

  it("rejects metadata-only submission without a previously uploaded video", async () => {
    tables.gift_missions = [{ ...unclaimedMission, creator_user_id: actorId, status: "delivered", revision: 0 }];
    const response = await POST(new NextRequest("http://localhost/api/gifting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "act", missionId: unclaimedMission.id, action: { type: "submit", videoName: "fake.mp4" } }),
    }));
    expect(response.status).toBe(400);
    expect(commit).not.toHaveBeenCalled();
  });

  it("commits the video and mission together with the expected revision", async () => {
    tables.gift_missions = [{ ...unclaimedMission, creator_user_id: actorId, status: "delivered", revision: 7 }];
    const storagePath = `${unclaimedMission.id}/66666666-6666-4666-8666-666666666666.mp4`;
    const response = await POST(new NextRequest("http://localhost/api/gifting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "act", missionId: unclaimedMission.id, action: { type: "submit", videoName: "real.mp4", storagePath } }),
    }));
    expect(response.status).toBe(200);
    expect(commit).toHaveBeenCalledWith("gift_commit_mission_action", expect.objectContaining({
      p_expected_revision: 7,
      p_video: expect.objectContaining({ storage_path: storagePath, position: 1, kind: "video" }),
    }));
  });

  it("does not approve an old metadata-only video", async () => {
    tables.gift_missions = [{ ...unclaimedMission, user_id: actorId, workspace_id: "55555555-5555-4555-8555-555555555555", status: "submitted", revision: 0 }];
    tables.gift_videos = [{ mission_id: unclaimedMission.id, name: "fake.mp4", status: "pending", storage_path: null }];
    vi.mocked(requireBrandSpace).mockResolvedValue({ ownerId: actorId, spaceId: "55555555-5555-4555-8555-555555555555" });
    const response = await POST(new NextRequest("http://localhost/api/gifting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "act", missionId: unclaimedMission.id, action: { type: "approve" } }),
    }));
    expect(response.status).toBe(400);
    expect(commit).not.toHaveBeenCalled();
  });
});

describe("several contents per mission", () => {
  const brandId = "77777777-7777-4777-8777-777777777777";
  const spaceId = "55555555-5555-4555-8555-555555555555";
  const uuid = (n: number) => {
    const d = String(n);
    return `${d.repeat(8)}-${d.repeat(4)}-4${d.repeat(3)}-8${d.repeat(3)}-${d.repeat(12)}`;
  };
  const path = (n: number, ext: string) => `${unclaimedMission.id}/${uuid(n)}.${ext}`;
  const post = (body: Record<string, unknown>) =>
    POST(new NextRequest("http://localhost/api/gifting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
  const asBrand = () => {
    vi.mocked(requireBrandSpace).mockResolvedValue({ ownerId: brandId, spaceId });
    tables.profiles = [{ id: actorId, account_type: "brand" }];
  };

  beforeEach(() => {
    storage.from.mockClear();
    commit.mockClear();
    signedUrlFor.mockClear();
    fileInfo = { size: 1024, contentType: "video/mp4" };
    tables.profiles = [
      { id: actorId, account_type: "creator", username: "lea" },
      { id: brandId, account_type: "brand", business_name: "Maison Bloom", full_name: "Jeanne Bloom" },
    ];
    tables.gift_campaigns = [{
      id: unclaimedMission.campaign_id,
      user_id: brandId,
      name: "Routine",
      product: "Sérum",
      deadline: "2026-10-23",
      video_count: 3,
      brief: "Trois contenus.",
    }];
    tables.gift_missions = [{
      ...unclaimedMission,
      user_id: brandId,
      workspace_id: spaceId,
      creator_user_id: actorId,
      status: "delivered",
      revision: 4,
    }];
    tables.gift_videos = [];
    vi.mocked(requireBrandSpace).mockResolvedValue({ error: new Response(null, { status: 403 }) } as never);
  });

  it("gives the creator the brand name and every content sorted by slot", async () => {
    tables.gift_videos = [
      { mission_id: unclaimedMission.id, position: 3, kind: "photo", name: "c.jpg", status: "pending", feedback: "", storage_path: path(3, "jpg") },
      { mission_id: unclaimedMission.id, position: 1, kind: "video", name: "a.mp4", status: "approved", feedback: "", storage_path: path(1, "mp4") },
    ];
    const response = await GET(new NextRequest("http://localhost/api/gifting"));
    const body = await response.json();
    expect(body.role).toBe("creator");
    expect(body.campaigns).toEqual([
      expect.objectContaining({ id: unclaimedMission.campaign_id, video_count: 3, brand_id: brandId, brand_name: "Maison Bloom" }),
    ]);
    expect(body.campaigns[0]).not.toHaveProperty("user_id");
    expect(body.videos.map((v: { position: number; kind: string }) => [v.position, v.kind])).toEqual([[1, "video"], [3, "photo"]]);
  });

  it("hands out an upload slot for a photo, within the expected count and the 25 MB photo limit", async () => {
    const ok = await post({ op: "upload_url", missionId: unclaimedMission.id, position: 2, contentType: "image/png", size: 2048 });
    expect(ok.status).toBe(200);
    const ticket = await ok.json();
    expect(ticket).toMatchObject({ position: 2, kind: "photo", token: "short-lived-token" });
    expect(ticket.path).toMatch(new RegExp(`^${unclaimedMission.id}/[0-9a-f-]{36}\\.png$`));

    const big = await post({ op: "upload_url", missionId: unclaimedMission.id, position: 2, contentType: "image/jpeg", size: 26 * 1024 * 1024 });
    expect(big.status).toBe(400);
    const tooFar = await post({ op: "upload_url", missionId: unclaimedMission.id, position: 4, contentType: "video/mp4", size: 1024 });
    expect(tooFar.status).toBe(400);
    const gif = await post({ op: "upload_url", missionId: unclaimedMission.id, position: 1, contentType: "image/gif", size: 1024 });
    expect(gif.status).toBe(400);
  });

  it("refuses to replace an approved content", async () => {
    tables.gift_videos = [
      { mission_id: unclaimedMission.id, position: 1, kind: "video", name: "a.mp4", status: "approved", feedback: "", storage_path: path(1, "mp4") },
    ];
    const response = await post({ op: "upload_url", missionId: unclaimedMission.id, position: 1, contentType: "video/mp4", size: 1024 });
    expect(response.status).toBe(409);
  });

  it("submits slot 2 as a photo (kind from the stored file) and keeps the mission delivered until all 3 are in", async () => {
    fileInfo = { size: 4096, contentType: "image/png" };
    const response = await post({
      op: "act",
      missionId: unclaimedMission.id,
      action: { type: "submit", position: 2, name: "look.png", kind: "video", storagePath: path(2, "png") },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, status: "delivered", position: 2, progress: { expected: 3, sent: 1 } });
    expect(commit).toHaveBeenCalledWith("gift_commit_mission_action", expect.objectContaining({
      p_expected_revision: 4,
      p_mission: expect.objectContaining({ status: "delivered", approved_at: null }),
      p_video: expect.objectContaining({ position: 2, kind: "photo", name: "look.png", status: "pending", storage_path: path(2, "png") }),
    }));
  });

  it("refuses a photo over 25 MB even if the bucket accepted it", async () => {
    fileInfo = { size: 30 * 1024 * 1024, contentType: "image/jpeg" };
    const response = await post({
      op: "act",
      missionId: unclaimedMission.id,
      action: { type: "submit", position: 1, name: "huge.jpg", storagePath: path(1, "jpg") },
    });
    expect(response.status).toBe(400);
    expect(commit).not.toHaveBeenCalled();
  });

  it("lets the brand approve one slot and approves the mission when the last one is approved", async () => {
    asBrand();
    tables.gift_missions = [{ ...tables.gift_missions[0], status: "submitted" }];
    tables.gift_videos = [1, 2, 3].map((n) => ({
      mission_id: unclaimedMission.id,
      position: n,
      kind: "video",
      name: `${n}.mp4`,
      status: n === 2 ? "pending" : "approved",
      feedback: "",
      approved_at: n === 2 ? null : "2026-10-01T00:00:00.000Z",
      storage_path: path(n, "mp4"),
    }));
    const response = await post({ op: "act", missionId: unclaimedMission.id, action: { type: "approve", position: 2 } });
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("approved");
    const call = commit.mock.calls[0] as unknown as [string, { p_mission: { approved_at: string | null }; p_video: Record<string, unknown> }];
    expect(call[1].p_video).toMatchObject({ position: 2, status: "approved", storage_path: null });
    expect(call[1].p_mission.approved_at).toEqual(expect.any(String));
  });

  it("does not approve an empty slot", async () => {
    asBrand();
    const response = await post({ op: "act", missionId: unclaimedMission.id, action: { type: "approve", position: 2 } });
    expect(response.status).toBe(400);
    expect(commit).not.toHaveBeenCalled();
  });

  it("asks for changes on one slot only, with the feedback from the brand", async () => {
    asBrand();
    tables.gift_videos = [
      { mission_id: unclaimedMission.id, position: 3, kind: "photo", name: "c.jpg", status: "pending", feedback: "", storage_path: path(3, "jpg") },
    ];
    const response = await post({
      op: "act",
      missionId: unclaimedMission.id,
      action: { type: "request_changes", position: 3, feedback: "Cadrage plus serré" },
    });
    expect(response.status).toBe(200);
    expect(commit).toHaveBeenCalledWith("gift_commit_mission_action", expect.objectContaining({
      p_video: expect.objectContaining({ position: 3, status: "changes_requested", feedback: "Cadrage plus serré" }),
    }));
  });

  it("opens the content of the requested slot (slot 1 by default)", async () => {
    tables.gift_videos = [
      { mission_id: unclaimedMission.id, position: 1, kind: "video", name: "a.mp4", status: "pending", feedback: "", storage_path: path(1, "mp4") },
      { mission_id: unclaimedMission.id, position: 2, kind: "photo", name: "b.webp", status: "pending", feedback: "", storage_path: path(2, "webp") },
    ];
    const second = await (await post({ op: "video_url", missionId: unclaimedMission.id, position: 2 })).json();
    expect(second).toEqual({ url: `https://storage.example/${path(2, "webp")}`, position: 2, kind: "photo" });
    const first = await (await post({ op: "video_url", missionId: unclaimedMission.id })).json();
    expect(first).toMatchObject({ position: 1, kind: "video" });
    const empty = await post({ op: "video_url", missionId: unclaimedMission.id, position: 3 });
    expect(empty.status).toBe(404);
    const bad = await post({ op: "video_url", missionId: unclaimedMission.id, position: 0 });
    expect(bad.status).toBe(400);
  });
});

describe("gift campaigns with a share link and applications", () => {
  const spaceId = "55555555-5555-4555-8555-555555555555";
  const creatorId = "66666666-6666-4666-8666-666666666666";
  const application = {
    ...unclaimedMission,
    id: "77777777-7777-4777-8777-777777777777",
    user_id: actorId,
    workspace_id: spaceId,
    creator_user_id: creatorId,
    status: "applied",
    revision: 4,
    source: "link",
  };
  const post = (body: Record<string, unknown>) =>
    POST(new NextRequest("http://localhost/api/gifting", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

  beforeEach(() => {
    commit.mockClear();
    tables.gift_missions = [application];
    tables.gift_videos = [];
    tables.creator_links = [];
    tables.gift_campaigns = [{ id: unclaimedMission.campaign_id, user_id: actorId, workspace_id: spaceId, name: "Routine", video_count: 1 }];
  });

  it("creates the campaign at once, open, with an unguessable share token and no creator handle", async () => {
    tables.profiles = [{ id: actorId, account_type: "brand", plan: "free" }];
    vi.mocked(requireBrandSpace).mockResolvedValue({ ownerId: actorId, spaceId });
    const response = await post({
      op: "create_campaign",
      name: "Routine",
      product: "Sérum",
      brief: "Montre la texture.",
      deadline: "2999-01-01",
      spots: 8,
      autoApprove: true,
      allowAds: false,
    });
    expect(response.status).toBe(200);
    const { campaign } = await response.json();
    expect(campaign).toMatchObject({ status: "active", share_enabled: true, spots: 8, auto_approve: true, user_id: actorId, workspace_id: spaceId });
    expect(campaign.share_token).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("refuses an invalid campaign with a clear rule error", async () => {
    tables.profiles = [{ id: actorId, account_type: "brand", plan: "pro" }];
    vi.mocked(requireBrandSpace).mockResolvedValue({ ownerId: actorId, spaceId });
    const response = await post({ op: "create_campaign", name: "R", product: "P", brief: "B", deadline: "2020-01-01", allowAds: false });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Deadline is in the past.");
  });

  it("lets only the brand that owns the campaign regenerate or pause its link", async () => {
    tables.profiles = [{ id: actorId, account_type: "brand", plan: "pro" }];
    vi.mocked(requireBrandSpace).mockResolvedValue({ ownerId: actorId, spaceId: "99999999-9999-4999-8999-999999999999" });
    const other = await post({ op: "share_link", campaignId: unclaimedMission.campaign_id, action: "regenerate" });
    expect(other.status).toBe(404);
    vi.mocked(requireBrandSpace).mockResolvedValue({ ownerId: actorId, spaceId });
    const ok = await post({ op: "share_link", campaignId: unclaimedMission.campaign_id, action: "disable" });
    expect(ok.status).toBe(200);
    const bad = await post({ op: "share_link", campaignId: unclaimedMission.campaign_id, action: "explode" });
    expect(bad.status).toBe(400);
  });

  it("does not let the applicant (or any creator) approve an application", async () => {
    tables.profiles = [{ id: actorId, account_type: "creator" }];
    vi.mocked(requireBrandSpace).mockResolvedValue({ error: new Response(null, { status: 403 }) } as never);
    const response = await post({ op: "act", missionId: application.id, action: { type: "approve_application" } });
    expect(response.status).toBe(403);
    expect(commit).not.toHaveBeenCalled();
  });

  it("approving an application is Pro: Free and Growth get the 402 paywall, nothing is committed", async () => {
    for (const plan of ["free", "basic"]) {
      tables.profiles = [{ id: actorId, account_type: "brand", plan }];
      vi.mocked(requireBrandSpace).mockResolvedValue({ ownerId: actorId, spaceId });
      commit.mockClear();
      const response = await post({ op: "act", missionId: application.id, action: { type: "approve_application" } });
      expect(response.status).toBe(402);
      expect(await response.json()).toMatchObject({ ok: false, error: "plan_required", feature: "gifting-links", requiredTier: "pro", used: null, limit: null, resetsAt: null });
      expect(commit).not.toHaveBeenCalled();
    }
  });

  it("publishing a share link (enable / regenerate) is Pro; pausing it stays allowed", async () => {
    tables.profiles = [{ id: actorId, account_type: "brand", plan: "basic" }];
    vi.mocked(requireBrandSpace).mockResolvedValue({ ownerId: actorId, spaceId });
    for (const action of ["enable", "regenerate"]) {
      const res = await post({ op: "share_link", campaignId: unclaimedMission.campaign_id, action });
      expect(res.status).toBe(402);
      expect((await res.json()).feature).toBe("gifting-links");
    }
    expect((await post({ op: "share_link", campaignId: unclaimedMission.campaign_id, action: "disable" })).status).toBe(200);
    tables.profiles = [{ id: actorId, account_type: "brand", plan: "pro" }];
    expect((await post({ op: "share_link", campaignId: unclaimedMission.campaign_id, action: "regenerate" })).status).toBe(200);
  });

  it("brand approval goes through the locked review function with the revision, then activates the creator link", async () => {
    tables.profiles = [{ id: actorId, account_type: "brand", plan: "pro" }];
    vi.mocked(requireBrandSpace).mockResolvedValue({ ownerId: actorId, spaceId });
    commit.mockResolvedValueOnce({ data: "ok" as never, error: null });
    const response = await post({ op: "act", missionId: application.id, action: { type: "approve_application" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "invited" });
    expect(commit).toHaveBeenCalledWith("gift_review_application", { p_mission_id: application.id, p_expected_revision: 4, p_status: "invited" });
  });

  it("maps a full campaign and a stale review to 409, and refuses reviewing a non-application", async () => {
    tables.profiles = [{ id: actorId, account_type: "brand", plan: "scale" }];
    vi.mocked(requireBrandSpace).mockResolvedValue({ ownerId: actorId, spaceId });
    commit.mockResolvedValueOnce({ data: "full" as never, error: null });
    const full = await post({ op: "act", missionId: application.id, action: { type: "approve_application" } });
    expect(full.status).toBe(409);
    expect((await full.json()).error).toBe("Every spot of this campaign is taken.");
    commit.mockResolvedValueOnce({ data: "stale" as never, error: null });
    expect((await post({ op: "act", missionId: application.id, action: { type: "decline_application" } })).status).toBe(409);
    tables.gift_missions = [{ ...application, status: "invited" }];
    commit.mockClear();
    const notApplied = await post({ op: "act", missionId: application.id, action: { type: "approve_application" } });
    expect(notApplied.status).toBe(400);
    expect(commit).not.toHaveBeenCalled();
  });

  it("lets the applicant withdraw, but not someone else", async () => {
    tables.profiles = [{ id: actorId, account_type: "creator" }];
    vi.mocked(requireBrandSpace).mockResolvedValue({ error: new Response(null, { status: 403 }) } as never);
    tables.gift_missions = [{ ...application, creator_user_id: actorId }];
    const own = await post({ op: "act", missionId: application.id, action: { type: "withdraw" } });
    expect(own.status).toBe(200);
    expect(commit).toHaveBeenCalledWith("gift_commit_mission_action", expect.objectContaining({ p_mission: expect.objectContaining({ status: "declined" }) }));
    tables.gift_missions = [application];
    expect((await post({ op: "act", missionId: application.id, action: { type: "withdraw" } })).status).toBe(403);
  });
});
