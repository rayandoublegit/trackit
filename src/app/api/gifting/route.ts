import { NextResponse, type NextRequest } from "next/server";
import { getAuthedActorId } from "@/lib/api-auth";
import { requireBrandSpace } from "@/lib/brand-workspace-server";
import {
  applyGiftAction,
  buildGiftContract,
  giftActionPosition,
  giftContentProgress,
  giftContentType,
  giftExpectedCount,
  GiftRuleError,
  normalizeHandle,
  parseGiftCampaignRights,
  type GiftAction,
  type GiftContentKind,
  type GiftContentStatus,
  type GiftMission,
  type ShippingAddress,
} from "@/lib/gifting";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { generateGiftShareToken, parseGiftCampaignInput, todayIso } from "@/lib/gift-share";
import { brandPublicIdentity, giftProductImagePrefix } from "@/lib/gift-share-server";
import { activateGiftCreatorLink } from "@/lib/gift-apply-server";
import { canPublishGiftLinks, lowestTierFor } from "@/lib/plan-limits";
import { paywallResponse, resolveOwnerPlan } from "@/lib/plan-gate-server";

/** Gifting share links, missions by handle and application approvals are Pro and above. */
async function giftLinksPaywall(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, ownerId: string) {
  if (canPublishGiftLinks(await resolveOwnerPlan(admin, ownerId))) return null;
  return paywallResponse("gifting-links", lowestTierFor(canPublishGiftLinks), {
    code: "paywall",
    message: "Upgrade to Pro to publish the creator link.",
  });
}

export const dynamic = "force-dynamic";

type MissionRow = {
  id: string;
  campaign_id: string;
  user_id: string;
  workspace_id: string | null;
  creator_handle: string;
  creator_platform: string;
  creator_user_id: string | null;
  revision: number;
  status: GiftMission["status"];
  contract_text: string;
  signed_name: string | null;
  signed_at: string | null;
  address: ShippingAddress | null;
  carrier: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  approved_at?: string | null;
};

/** A row of gift_videos: one content (video or photo) at a slot of a mission. */
type ContentRow = {
  mission_id: string;
  /** Missing only on a database without the multi-content migration: slot 1. */
  position?: number | null;
  kind?: GiftContentKind | null;
  name: string;
  storage_path: string | null;
  status: GiftContentStatus;
  feedback: string;
  approved_at: string | null;
};

function toMission(row: MissionRow, contents: ContentRow[], expectedCount: unknown): GiftMission {
  return {
    status: row.status,
    contractText: row.contract_text,
    signedName: row.signed_name,
    signedAt: row.signed_at,
    address: row.address,
    carrier: row.carrier,
    trackingNumber: row.tracking_number,
    shippedAt: row.shipped_at,
    deliveredAt: row.delivered_at,
    expectedCount: giftExpectedCount(expectedCount),
    approvedAt: row.approved_at ?? null,
    contents: contents.map((item) => ({
      position: item.position ?? 1,
      name: item.name,
      kind: item.kind === "photo" ? "photo" : "video",
      status: item.status,
      feedback: item.feedback ?? "",
      approvedAt: item.approved_at,
      storagePath: item.storage_path,
    })),
  };
}

/** Content rows in a stable order: by mission, then slot. Rows from an old schema get position 1 and kind video. */
function sortContents<T extends { mission_id: string; position?: number | null; kind?: string | null }>(rows: T[]) {
  return rows
    .map((row) => ({ ...row, position: row.position ?? 1, kind: row.kind ?? "video" }))
    .sort((a, b) => (a.mission_id === b.mission_id ? a.position - b.position : a.mission_id < b.mission_id ? -1 : 1));
}

/** business_name, else full_name, per brand id. A missing column never breaks the listing. */
async function brandNames(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, ids: string[]) {
  const names = new Map<string, string>();
  if (!ids.length) return names;
  let rows: { id: string; business_name?: string | null; full_name?: string | null }[] = [];
  const full = await admin.from("profiles").select("id, business_name, full_name").in("id", ids);
  if (!full.error) rows = full.data ?? [];
  else {
    const fallback = await admin.from("profiles").select("id, full_name").in("id", ids);
    rows = fallback.error ? [] : fallback.data ?? [];
  }
  for (const row of rows) {
    const name = row.business_name?.trim() || row.full_name?.trim();
    if (name) names.set(row.id, name);
  }
  return names;
}

const BRAND_ACTIONS = new Set(["ship", "deliver", "approve", "request_changes", "approve_application", "decline_application"]);
const CREATOR_ACTIONS = new Set(["accept", "decline", "sign", "deliver", "submit", "withdraw"]);
const REVIEW_ACTIONS = new Set(["approve_application", "decline_application"]);

/** Campaign fields a creator sees on a mission: never the owner's workspace, token or settings. */
const CREATOR_CAMPAIGN_FIELDS = ["id", "user_id", "name", "product", "deadline", "video_count", "brief", "offer", "product_images"] as const;

type ContentLookup = { status?: string | null; storage_path?: string | null; kind?: string | null };

/**
 * One content row of a mission. Before migration 000045 the table has no
 * position/kind columns: only slot 1 exists, found by mission alone.
 */
async function findContent(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  missionId: string,
  position: number,
  columns: string,
): Promise<{ data: ContentLookup | null; error: { message: string } | null; legacy: boolean }> {
  const res = await admin.from("gift_videos").select(columns).eq("mission_id", missionId).eq("position", position).maybeSingle();
  if (!res.error || res.error.code !== "42703") return { data: (res.data as ContentLookup | null) ?? null, error: res.error, legacy: false };
  if (position !== 1) return { data: null, error: null, legacy: true };
  const legacyColumns = columns.split(",").map((c) => c.trim()).filter((c) => c !== "kind").join(", ");
  const old = await admin.from("gift_videos").select(legacyColumns).eq("mission_id", missionId).maybeSingle();
  return { data: (old.data as ContentLookup | null) ?? null, error: old.error, legacy: true };
}

export async function GET(request: NextRequest) {
  const actorId = await getAuthedActorId(request);
  if (!actorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { data: profile } = await admin
    .from("profiles")
    .select("account_type")
    .eq("id", actorId)
    .maybeSingle();
  const asCreator = profile?.account_type === "creator";

  if (asCreator) {
    const claimed = await admin.from("gift_missions").select("*").eq("creator_user_id", actorId);
    if (claimed.error) return NextResponse.json({ error: claimed.error.message }, { status: 500 });
    const missions = claimed.data ?? [];
    const ids = missions.map((item) => item.id);
    const campaignIds = [...new Set(missions.map((item) => item.campaign_id))];
    const [videos, campaigns] = await Promise.all([
      ids.length
        ? admin.from("gift_videos").select("*").in("mission_id", ids)
        : Promise.resolve({ data: [], error: null }),
      campaignIds.length
        ? admin.from("gift_campaigns").select("*").in("id", campaignIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (videos.error) return NextResponse.json({ error: videos.error.message }, { status: 500 });
    if (campaigns.error) return NextResponse.json({ error: campaigns.error.message }, { status: 500 });
    const campaignRows = ((campaigns.data ?? []) as Record<string, unknown>[]).map((row) => {
      const picked = Object.fromEntries(CREATOR_CAMPAIGN_FIELDS.map((key) => [key, row[key] ?? null]));
      return picked as { id: string; user_id: string; name: string; product: string; deadline: string; video_count: number; brief: string; offer: string | null; product_images: string[] | null };
    });
    const names = await brandNames(admin, [...new Set(campaignRows.map((c) => c.user_id))]);
    return NextResponse.json({
      role: "creator",
      wishlists: [],
      items: [],
      campaigns: campaignRows.map(({ user_id, ...campaign }) => ({
        ...campaign,
        video_count: giftExpectedCount(campaign.video_count),
        brand_id: user_id,
        brand_name: names.get(user_id) ?? null,
      })),
      missions,
      videos: sortContents((videos.data ?? []) as ContentRow[]),
    });
  }

  const access = await requireBrandSpace(request);
  if ("error" in access) return access.error;
  const { ownerId, spaceId } = access;
  const [wishlists, campaigns, missions] = await Promise.all([
    admin.from("gift_wishlists").select("*").eq("user_id", ownerId).eq("workspace_id", spaceId),
    admin.from("gift_campaigns").select("*").eq("user_id", ownerId).eq("workspace_id", spaceId),
    admin.from("gift_missions").select("*").eq("user_id", ownerId).eq("workspace_id", spaceId),
  ]);
  const failed = [wishlists.error, campaigns.error, missions.error].find(Boolean);
  if (failed) return NextResponse.json({ error: failed.message }, { status: 500 });
  const wishlistIds = (wishlists.data ?? []).map((item) => item.id);
  const missionIds = (missions.data ?? []).map((item) => item.id);
  const [items, videos] = await Promise.all([
    wishlistIds.length
      ? admin.from("gift_wishlist_creators").select("*").in("wishlist_id", wishlistIds)
      : Promise.resolve({ data: [], error: null }),
    missionIds.length
      ? admin.from("gift_videos").select("*").in("mission_id", missionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (items.error) return NextResponse.json({ error: items.error.message }, { status: 500 });
  if (videos.error) return NextResponse.json({ error: videos.error.message }, { status: 500 });
  const brand = await brandPublicIdentity(admin, { user_id: ownerId, workspace_id: spaceId }).catch(() => ({ name: null }));
  return NextResponse.json({
    role: "brand",
    brandName: brand.name ?? "",
    wishlists: wishlists.data ?? [],
    items: items.data ?? [],
    campaigns: campaigns.data ?? [],
    missions: missions.data ?? [],
    videos: sortContents((videos.data ?? []) as ContentRow[]),
  });
}

export async function POST(request: NextRequest) {
  const actorId = await getAuthedActorId(request);
  if (!actorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const op = String(body.op ?? "");

  if (op === "act") {
    return actOnMission(request, actorId, admin, body);
  }
  if (op === "upload_url" || op === "video_url") {
    return mediaOnMission(request, actorId, admin, body, op);
  }

  const access = await requireBrandSpace(request);
  if ("error" in access) return access.error;
  const { ownerId, spaceId } = access;
  const { data: profile } = await admin
    .from("profiles")
    .select("account_type, full_name")
    .eq("id", actorId)
    .maybeSingle();
  if (profile?.account_type === "creator") {
    return NextResponse.json({ error: "Brands only." }, { status: 403 });
  }

  try {
    if (op === "create_wishlist") {
      const name = String(body.name ?? "").trim();
      if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
      const { data, error } = await admin
        .from("gift_wishlists")
        .insert({
          user_id: ownerId,
          workspace_id: spaceId,
          name,
          description: String(body.description ?? "").slice(0, 500),
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ wishlist: data });
    }

    if (op === "add_creator") {
      const handle = normalizeHandle(String(body.handle ?? ""));
      const platform = body.platform === "instagram" ? "instagram" : "tiktok";
      const { data: list } = await admin
        .from("gift_wishlists")
        .select("id")
        .eq("id", String(body.wishlistId ?? ""))
        .eq("user_id", ownerId)
        .maybeSingle();
      if (!list) return NextResponse.json({ error: "Wishlist not found." }, { status: 404 });
      const { data, error } = await admin
        .from("gift_wishlist_creators")
        .insert({ wishlist_id: list.id, handle, platform })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ item: data });
    }

    if (op === "create_campaign") {
      // Created open, with its share link: no creator needed to start.
      const input = parseGiftCampaignInput(body, { today: todayIso(), imagePrefix: giftProductImagePrefix(ownerId) });
      const { data, error } = await admin
        .from("gift_campaigns")
        .insert({
          user_id: ownerId,
          workspace_id: spaceId,
          status: "active",
          name: input.name,
          product: input.product,
          brief: input.brief,
          deadline: input.deadline,
          video_count: input.videoCount,
          fixed_fee_cents: input.fixedFeeCents,
          allow_ads: input.allowAds,
          rights_days: input.rightsDays,
          territories: input.territories,
          share_token: generateGiftShareToken(),
          share_enabled: true,
          spots: input.spots,
          auto_approve: input.autoApprove,
          offer: input.offer,
          product_value_cents: input.productValueCents,
          product_images: input.productImages,
          min_followers: input.minFollowers,
          platforms: input.platforms,
          countries: input.countries,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ campaign: data });
    }

    if (op === "share_link" || op === "campaign_status") {
      const { data: campaign } = await admin
        .from("gift_campaigns")
        .select("id")
        .eq("id", String(body.campaignId ?? ""))
        .eq("user_id", ownerId)
        .eq("workspace_id", spaceId)
        .maybeSingle();
      if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
      let patch: Record<string, unknown>;
      if (op === "campaign_status") {
        const status = String(body.status ?? "");
        if (status !== "active" && status !== "completed") return NextResponse.json({ error: "Unknown operation." }, { status: 400 });
        patch = { status };
      } else {
        const action = String(body.action ?? "");
        if (action === "regenerate" || action === "enable") {
          const wall = await giftLinksPaywall(admin, ownerId);
          if (wall) return wall;
        }
        if (action === "regenerate") patch = { share_token: generateGiftShareToken(), share_enabled: true };
        else if (action === "disable") patch = { share_enabled: false };
        else if (action === "enable") patch = { share_enabled: true };
        else return NextResponse.json({ error: "Unknown operation." }, { status: 400 });
      }
      const { data, error } = await admin
        .from("gift_campaigns")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", campaign.id)
        .eq("user_id", ownerId)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ campaign: data });
    }

    if (op === "invite") {
      const wall = await giftLinksPaywall(admin, ownerId);
      if (wall) return wall;
      const handle = normalizeHandle(String(body.handle ?? ""));
      const platform = body.platform === "instagram" ? "instagram" : "tiktok";
      const { data: campaign } = await admin
        .from("gift_campaigns")
        .select("*")
        .eq("id", String(body.campaignId ?? ""))
        .eq("user_id", ownerId)
        .eq("workspace_id", spaceId)
        .maybeSingle();
      if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
      const { data: creator, error: creatorError } = await admin
        .from("creators")
        .select("linked_user_id")
        .eq("user_id", ownerId)
        .eq("workspace_id", spaceId)
        .eq("platform", platform)
        .eq("handle", handle)
        .maybeSingle();
      if (creatorError) return NextResponse.json({ error: "Could not verify creator link." }, { status: 500 });
      if (!creator?.linked_user_id) {
        return NextResponse.json({ error: "Creator must join this brand before a gift mission can be sent." }, { status: 409 });
      }
      const { data: link, error: linkError } = await admin
        .from("creator_links")
        .select("id")
        .eq("creator_id", creator.linked_user_id)
        .eq("brand_id", ownerId)
        .eq("status", "active")
        .maybeSingle();
      if (linkError) return NextResponse.json({ error: "Could not verify creator link." }, { status: 500 });
      if (!link) {
        return NextResponse.json({ error: "Creator must join this brand before a gift mission can be sent." }, { status: 409 });
      }
      const contract = buildGiftContract({
        lang: body.lang === "fr" ? "fr" : "en",
        brandName: String(profile?.full_name || "Brand"),
        creatorHandle: handle,
        campaignName: campaign.name,
        product: campaign.product,
        brief: campaign.brief,
        videoCount: campaign.video_count,
        deadline: campaign.deadline,
        fixedFeeCents: campaign.fixed_fee_cents,
        allowAds: campaign.allow_ads,
        rightsDays: campaign.rights_days,
        territories: campaign.territories,
      });
      const { data, error } = await admin
        .from("gift_missions")
        .insert({
          campaign_id: campaign.id,
          user_id: ownerId,
          workspace_id: spaceId,
          creator_handle: handle,
          creator_platform: platform,
          creator_user_id: creator.linked_user_id,
          contract_text: contract,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ mission: data });
    }
  } catch (error) {
    if (error instanceof GiftRuleError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  return NextResponse.json({ error: "Unknown operation." }, { status: 400 });
}

async function actOnMission(
  request: NextRequest,
  actorId: string,
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  body: Record<string, unknown>,
) {
  const { data: row } = await admin
    .from("gift_missions")
    .select("*")
    .eq("id", String(body.missionId ?? ""))
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Mission not found." }, { status: 404 });
  const mission = row as MissionRow;

  const { data: profile } = await admin
    .from("profiles")
    .select("account_type")
    .eq("id", actorId)
    .maybeSingle();
  const isBrand = await brandOwns(request, mission.user_id, mission.workspace_id);
  const isCreator = profile?.account_type === "creator" && mission.creator_user_id === actorId;
  const raw = body.action as (GiftAction & Record<string, unknown>) | undefined;
  if (!raw || typeof raw !== "object" || !("type" in raw)) {
    return NextResponse.json({ error: "Action manquante." }, { status: 400 });
  }
  if (raw.type === "deliver") {
    if (!isBrand && !isCreator) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
  } else if (BRAND_ACTIONS.has(raw.type) && !isBrand) {
    return NextResponse.json({ error: "Brands only." }, { status: 403 });
  } else if (CREATOR_ACTIONS.has(raw.type) && !isCreator) {
    return NextResponse.json({ error: "Invited creator only." }, { status: 403 });
  }

  if (REVIEW_ACTIONS.has(raw.type)) {
    if (raw.type === "approve_application") {
      const wall = await giftLinksPaywall(admin, mission.user_id);
      if (wall) return wall;
    }
    return reviewApplication(admin, mission, raw.type as "approve_application" | "decline_application");
  }

  const [contentsResult, campaignResult] = await Promise.all([
    admin.from("gift_videos").select("*").eq("mission_id", mission.id),
    admin.from("gift_campaigns").select("video_count").eq("id", mission.campaign_id).maybeSingle(),
  ]);
  if (contentsResult.error) return NextResponse.json({ error: contentsResult.error.message }, { status: 500 });
  const contents = sortContents((contentsResult.data ?? []) as ContentRow[]);
  const expectedCount = giftExpectedCount(campaignResult.data?.video_count);

  const isContentAction = raw.type === "submit" || raw.type === "approve" || raw.type === "request_changes";
  let position = 1;
  try {
    if (isContentAction) position = giftActionPosition(raw);
  } catch (error) {
    if (error instanceof GiftRuleError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
  const slot = contents.find((item) => item.position === position);

  let action: GiftAction = raw;
  let submittedPath: string | null = null;
  if (raw.type === "approve") {
    if (!slot?.storage_path || !isGiftContentPath(mission.id, slot.storage_path)) {
      return NextResponse.json({ error: "A real uploaded video is required for approval." }, { status: 400 });
    }
    action = { type: "approve", position };
  } else if (raw.type === "request_changes") {
    action = { type: "request_changes", position, feedback: String(raw.feedback ?? "") };
  } else if (raw.type === "submit") {
    submittedPath = String(raw.storagePath ?? "");
    if (!isGiftContentPath(mission.id, submittedPath)) {
      return NextResponse.json({ error: "Invalid gift video path." }, { status: 400 });
    }
    const file = await admin.storage.from("gift-videos").info(submittedPath);
    const type = file.data ? giftContentType(file.data.contentType ?? "") : null;
    const size = file.data?.size;
    if (file.error || !type || typeof size !== "number" || size <= 0 || size > type.maxBytes) {
      return NextResponse.json({ error: "Upload a supported file before submitting." }, { status: 400 });
    }
    // The stored file decides the kind, not what the browser claims.
    action = {
      type: "submit",
      position,
      name: String(raw.name ?? raw.videoName ?? ""),
      storagePath: submittedPath,
      kind: type.kind,
    };
  }

  let next: GiftMission;
  try {
    next = applyGiftAction(toMission(mission, contents, expectedCount), action, new Date().toISOString());
  } catch (error) {
    if (error instanceof GiftRuleError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const changed = isContentAction ? next.contents.find((item) => item.position === position) : undefined;
  const committed = await admin.rpc("gift_commit_mission_action", {
    p_mission_id: mission.id,
    p_expected_revision: mission.revision,
    p_mission: {
      status: next.status,
      signed_name: next.signedName,
      signed_at: next.signedAt,
      address: next.address,
      carrier: next.carrier,
      tracking_number: next.trackingNumber,
      shipped_at: next.shippedAt,
      delivered_at: next.deliveredAt,
      approved_at: next.approvedAt,
    },
    p_video: changed
      ? {
          position: changed.position,
          kind: changed.kind,
          name: changed.name,
          status: changed.status,
          feedback: changed.feedback,
          approved_at: changed.approvedAt,
          storage_path: submittedPath,
        }
      : null,
  });
  if (committed.error) return NextResponse.json({ error: committed.error.message }, { status: 500 });
  if (!committed.data) return NextResponse.json({ error: "Mission changed. Refresh and try again." }, { status: 409 });

  return NextResponse.json({
    ok: true,
    status: next.status,
    ...(isContentAction ? { position } : {}),
    progress: giftContentProgress(next.contents, next.expectedCount),
  });
}

/**
 * Brand approves or declines an application from the share link. The state
 * machine decides the next status; the SQL function re-checks it under the
 * campaign lock (revision and spots) so two approvals can't overfill it.
 */
async function reviewApplication(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  mission: MissionRow,
  type: "approve_application" | "decline_application",
) {
  let next: GiftMission;
  try {
    next = applyGiftAction(toMission(mission, [], 1), { type }, new Date().toISOString());
  } catch (error) {
    if (error instanceof GiftRuleError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
  const result = await admin.rpc("gift_review_application", {
    p_mission_id: mission.id,
    p_expected_revision: mission.revision,
    p_status: next.status,
  });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  if (result.data === "full") return NextResponse.json({ error: "Every spot of this campaign is taken." }, { status: 409 });
  if (result.data === "not_applied") return NextResponse.json({ error: "This application was already reviewed." }, { status: 409 });
  if (result.data !== "ok") return NextResponse.json({ error: "Mission changed. Refresh and try again." }, { status: 409 });
  if (next.status === "invited" && mission.creator_user_id) {
    await activateGiftCreatorLink(admin, mission.user_id, mission.creator_user_id);
  }
  return NextResponse.json({ ok: true, status: next.status });
}

async function brandOwns(request: NextRequest, ownerId: string, spaceId: string | null) {
  const access = await requireBrandSpace(request);
  if ("error" in access) return false;
  return access.ownerId === ownerId && access.spaceId === spaceId;
}

/** `<missionId>/<uuid>.<ext>`: the only shape upload_url ever hands out. */
function isGiftContentPath(missionId: string, path: string) {
  return path.startsWith(`${missionId}/`)
    && /^[0-9a-f-]{36}\.(mp4|mov|webm|jpg|png|webp)$/.test(path.slice(missionId.length + 1));
}

async function mediaOnMission(
  request: NextRequest,
  actorId: string,
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  body: Record<string, unknown>,
  op: "upload_url" | "video_url",
) {
  const { data: mission, error } = await admin.from("gift_missions")
    .select("id, campaign_id, user_id, workspace_id, creator_user_id, status")
    .eq("id", String(body.missionId ?? "")).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!mission) return NextResponse.json({ error: "Mission not found." }, { status: 404 });

  const isCreator = mission.creator_user_id === actorId;
  const access = await requireBrandSpace(request);
  const isBrand = !("error" in access)
    && access.ownerId === mission.user_id
    && access.spaceId === mission.workspace_id;

  let position: number;
  try {
    position = giftActionPosition(body);
  } catch (cause) {
    if (cause instanceof GiftRuleError) return NextResponse.json({ error: cause.message }, { status: 400 });
    throw cause;
  }

  if (op === "upload_url") {
    if (!isCreator || !["delivered", "submitted"].includes(mission.status)) {
      return NextResponse.json({ error: "Creator cannot upload to this mission." }, { status: 403 });
    }
    const contentType = String(body.contentType ?? "");
    const size = Number(body.size);
    const type = giftContentType(contentType);
    if (!type || !Number.isSafeInteger(size) || size < 1 || size > type.maxBytes) {
      return NextResponse.json(
        { error: "Upload an MP4, MOV or WebM video up to 500 MB, or a JPEG, PNG or WebP photo up to 25 MB." },
        { status: 400 },
      );
    }
    const [campaign, existing] = await Promise.all([
      admin.from("gift_campaigns").select("video_count").eq("id", mission.campaign_id).maybeSingle(),
      findContent(admin, mission.id, position, "status"),
    ]);
    if (existing.legacy && position > 1) {
      // Database not migrated yet (000045): a second file would overwrite the first.
      return NextResponse.json({ error: "Only one content per mission is available for now." }, { status: 409 });
    }
    if (position > giftExpectedCount(campaign.data?.video_count)) {
      return NextResponse.json({ error: "This campaign does not expect that many contents." }, { status: 400 });
    }
    if (existing.data?.status === "approved") {
      return NextResponse.json({ error: "This content is already approved." }, { status: 409 });
    }
    const path = `${mission.id}/${crypto.randomUUID()}.${type.extension}`;
    const signed = await admin.storage.from("gift-videos").createSignedUploadUrl(path);
    if (signed.error || !signed.data) {
      return NextResponse.json({ error: signed.error?.message ?? "Could not start upload." }, { status: 500 });
    }
    return NextResponse.json({ path, token: signed.data.token, position, kind: type.kind });
  }

  if (!isCreator && !isBrand) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const { data: content, error: contentError } = await findContent(admin, mission.id, position, "storage_path, kind");
  if (contentError) return NextResponse.json({ error: contentError.message }, { status: 500 });
  if (!content?.storage_path || !isGiftContentPath(mission.id, content.storage_path)) {
    return NextResponse.json({ error: "No uploaded content." }, { status: 404 });
  }
  const signed = await admin.storage.from("gift-videos").createSignedUrl(content.storage_path, 60);
  if (signed.error || !signed.data) {
    return NextResponse.json({ error: signed.error?.message ?? "Could not open video." }, { status: 500 });
  }
  return NextResponse.json({ url: signed.data.signedUrl, position, kind: content.kind === "photo" ? "photo" : "video" });
}
