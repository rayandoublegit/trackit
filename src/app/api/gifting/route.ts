import { NextResponse, type NextRequest } from "next/server";
import { getAuthedActorId } from "@/lib/api-auth";
import { requireBrandSpace } from "@/lib/brand-workspace-server";
import {
  applyGiftAction,
  buildGiftContract,
  GiftRuleError,
  normalizeHandle,
  parseGiftCampaignRights,
  type GiftAction,
  type GiftMission,
  type ShippingAddress,
} from "@/lib/gifting";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

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
};

type VideoRow = {
  mission_id: string;
  name: string;
  storage_path: string | null;
  status: "pending" | "changes_requested" | "approved";
  feedback: string;
  approved_at: string | null;
};

function toMission(row: MissionRow, video: VideoRow | undefined): GiftMission {
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
    video: video
      ? {
          name: video.name,
          status: video.status,
          feedback: video.feedback,
          approvedAt: video.approved_at,
        }
      : null,
  };
}

const BRAND_ACTIONS = new Set(["ship", "deliver", "approve", "request_changes"]);
const CREATOR_ACTIONS = new Set(["accept", "decline", "sign", "deliver", "submit"]);

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
        ? admin
            .from("gift_campaigns")
            .select("id, name, product, deadline, video_count, brief")
            .in("id", campaignIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (videos.error) return NextResponse.json({ error: videos.error.message }, { status: 500 });
    if (campaigns.error) return NextResponse.json({ error: campaigns.error.message }, { status: 500 });
    return NextResponse.json({
      role: "creator",
      wishlists: [],
      items: [],
      campaigns: campaigns.data ?? [],
      missions,
      videos: videos.data ?? [],
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
  return NextResponse.json({
    role: "brand",
    wishlists: wishlists.data ?? [],
    items: items.data ?? [],
    campaigns: campaigns.data ?? [],
    missions: missions.data ?? [],
    videos: videos.data ?? [],
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
      const name = String(body.name ?? "").trim();
      const product = String(body.product ?? "").trim();
      const brief = String(body.brief ?? "").trim();
      const deadline = String(body.deadline ?? "").trim();
      if (!name || !product || !brief || !deadline) {
        return NextResponse.json({ error: "Name, product, brief and deadline are required." }, { status: 400 });
      }
      const rights = parseGiftCampaignRights(body);
      const { data, error } = await admin
        .from("gift_campaigns")
        .insert({
          user_id: ownerId,
          workspace_id: spaceId,
          name,
          product,
          brief,
          deadline,
          video_count: Math.min(20, Math.max(1, Number(body.videoCount) || 1)),
          fixed_fee_cents: Math.max(0, Math.round(Number(body.fixedFeeCents) || 0)),
          allow_ads: rights.allowAds,
          rights_days: rights.rightsDays,
          territories: rights.territories,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ campaign: data });
    }

    if (op === "invite") {
      const { data: payer } = await admin
        .from("profiles")
        .select("plan")
        .eq("id", ownerId)
        .maybeSingle();
      if (!payer || payer.plan === "free" || !payer.plan) {
        return NextResponse.json({ error: "Upgrade to publish and send the creator link.", code: "paywall" }, { status: 402 });
      }
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
  const action = body.action as GiftAction | undefined;
  if (!action || typeof action !== "object" || !("type" in action)) {
    return NextResponse.json({ error: "Action manquante." }, { status: 400 });
  }
  if (action.type === "deliver") {
    if (!isBrand && !isCreator) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
  } else if (BRAND_ACTIONS.has(action.type) && !isBrand) {
    return NextResponse.json({ error: "Brands only." }, { status: 403 });
  } else if (CREATOR_ACTIONS.has(action.type) && !isCreator) {
    return NextResponse.json({ error: "Invited creator only." }, { status: 403 });
  }

  const { data: video } = await admin
    .from("gift_videos")
    .select("*")
    .eq("mission_id", mission.id)
    .maybeSingle();

  if (action.type === "approve" && (!video?.storage_path || !isGiftVideoPath(mission.id, video.storage_path))) {
    return NextResponse.json({ error: "A real uploaded video is required for approval." }, { status: 400 });
  }

  let next: GiftMission;
  try {
    next = applyGiftAction(toMission(mission, video ? (video as VideoRow) : undefined), action, new Date().toISOString());
  } catch (error) {
    if (error instanceof GiftRuleError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  let submittedPath: string | null = null;
  if (action.type === "submit") {
    submittedPath = String(action.storagePath ?? "");
    if (!isGiftVideoPath(mission.id, submittedPath)) {
      return NextResponse.json({ error: "Invalid gift video path." }, { status: 400 });
    }
    const file = await admin.storage.from("gift-videos").info(submittedPath);
    if (file.error || !file.data || !isGiftVideoFile(file.data)) {
      return NextResponse.json({ error: "Upload a supported video before submitting." }, { status: 400 });
    }
  }

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
    },
    p_video: next.video ? {
      name: next.video.name,
      status: next.video.status,
      feedback: next.video.feedback,
      approved_at: next.video.approvedAt,
      storage_path: submittedPath,
    } : null,
  });
  if (committed.error) return NextResponse.json({ error: committed.error.message }, { status: 500 });
  if (!committed.data) return NextResponse.json({ error: "Mission changed. Refresh and try again." }, { status: 409 });

  return NextResponse.json({ ok: true, status: next.status });
}

async function brandOwns(request: NextRequest, ownerId: string, spaceId: string | null) {
  const access = await requireBrandSpace(request);
  if ("error" in access) return false;
  return access.ownerId === ownerId && access.spaceId === spaceId;
}

const GIFT_VIDEO_MIMES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const GIFT_VIDEO_LIMIT = 500 * 1024 * 1024;

function isGiftVideoPath(missionId: string, path: string) {
  return path.startsWith(`${missionId}/`) && /^[0-9a-f-]{36}\.(mp4|mov|webm)$/.test(path.slice(missionId.length + 1));
}

function isGiftVideoFile(file: { size?: number; contentType?: string }) {
  return typeof file.size === "number" && file.size > 0 && file.size <= GIFT_VIDEO_LIMIT
    && GIFT_VIDEO_MIMES.has(file.contentType ?? "");
}

async function mediaOnMission(
  request: NextRequest,
  actorId: string,
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  body: Record<string, unknown>,
  op: "upload_url" | "video_url",
) {
  const { data: mission, error } = await admin.from("gift_missions")
    .select("id, user_id, workspace_id, creator_user_id, status")
    .eq("id", String(body.missionId ?? "")).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!mission) return NextResponse.json({ error: "Mission not found." }, { status: 404 });

  const isCreator = mission.creator_user_id === actorId;
  const access = await requireBrandSpace(request);
  const isBrand = !("error" in access)
    && access.ownerId === mission.user_id
    && access.spaceId === mission.workspace_id;

  if (op === "upload_url") {
    if (!isCreator || !["delivered", "submitted"].includes(mission.status)) {
      return NextResponse.json({ error: "Creator cannot upload to this mission." }, { status: 403 });
    }
    const contentType = String(body.contentType ?? "");
    const size = Number(body.size);
    if (!GIFT_VIDEO_MIMES.has(contentType) || !Number.isSafeInteger(size) || size < 1 || size > GIFT_VIDEO_LIMIT) {
      return NextResponse.json({ error: "Upload an MP4, MOV or WebM video up to 500 MB." }, { status: 400 });
    }
    const extension = contentType === "video/mp4" ? "mp4" : contentType === "video/quicktime" ? "mov" : "webm";
    const path = `${mission.id}/${crypto.randomUUID()}.${extension}`;
    const signed = await admin.storage.from("gift-videos").createSignedUploadUrl(path);
    if (signed.error || !signed.data) {
      return NextResponse.json({ error: signed.error?.message ?? "Could not start upload." }, { status: 500 });
    }
    return NextResponse.json({ path, token: signed.data.token });
  }

  if (!isCreator && !isBrand) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const { data: video, error: videoError } = await admin.from("gift_videos")
    .select("storage_path").eq("mission_id", mission.id).maybeSingle();
  if (videoError) return NextResponse.json({ error: videoError.message }, { status: 500 });
  if (!video?.storage_path || !isGiftVideoPath(mission.id, video.storage_path)) {
    return NextResponse.json({ error: "No uploaded video." }, { status: 404 });
  }
  const signed = await admin.storage.from("gift-videos").createSignedUrl(video.storage_path, 60);
  if (signed.error || !signed.data) {
    return NextResponse.json({ error: signed.error?.message ?? "Could not open video." }, { status: 500 });
  }
  return NextResponse.json({ url: signed.data.signedUrl });
}
