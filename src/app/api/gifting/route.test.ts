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

const storage = {
  from: vi.fn(() => ({
    createSignedUploadUrl: vi.fn(async () => ({ data: { token: "short-lived-token" }, error: null })),
    createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://storage.example/private" }, error: null })),
    info: vi.fn(async () => ({ data: { size: 1024, contentType: "video/mp4" }, error: null })),
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
      p_video: expect.objectContaining({ storage_path: storagePath }),
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
