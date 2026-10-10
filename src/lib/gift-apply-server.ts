import type { SupabaseClient } from "@supabase/supabase-js";
import { insertBrandNotification } from "@/lib/brand-notifications";
import { joinCreatorToBrand } from "@/lib/creator-brand-join";
import { CREATOR_LINK_STATUS } from "@/lib/creator-dashboard-access";
import { buildGiftContract } from "@/lib/gifting";
import {
  checkGiftRequirements,
  creatorsIndexKey,
  GIFT_APPLY_MAX_PER_HOUR,
  giftApplicationStatus,
  giftCampaignAvailability,
  giftCreatorStatsFromIndex,
  parseGiftApplication,
  todayIso,
  type GiftCreatorStats,
  type GiftPlatform,
} from "@/lib/gift-share";
import { brandCanPublish, brandPublicIdentity, countTakenSpots, loadGiftCampaignByToken } from "@/lib/gift-share-server";

// A creator applies to a gift campaign through its share link. Everything
// here runs with the service role after the route has authenticated the user.

export type ApplyResult = { status: number; body: Record<string, unknown> };

type Profile = { account_type?: string | null; onboarding_completed?: boolean | null; username?: string | null; full_name?: string | null };

/**
 * A brand that finished its onboarding is never turned into a creator through
 * a public link. A brand-new account (the profile trigger may default it to
 * "brand") that never onboarded is free to become a creator.
 */
export function isEstablishedBrand(profile: Profile | null | undefined): boolean {
  return (profile?.account_type ?? "").toLowerCase() === "brand" && profile?.onboarding_completed === true;
}

/** creator↔brand link set to active (created when missing). A revoked link stays revoked. */
export async function activateGiftCreatorLink(admin: SupabaseClient, brandId: string, creatorId: string): Promise<void> {
  try {
    const { data } = await admin
      .from("creator_links")
      .select("id, status")
      .eq("creator_id", creatorId)
      .eq("brand_id", brandId)
      .maybeSingle();
    const link = data as { id: string; status: string } | null;
    if (!link) {
      await admin.from("creator_links").insert({ creator_id: creatorId, brand_id: brandId, status: CREATOR_LINK_STATUS.active });
    } else if (link.status === CREATOR_LINK_STATUS.pendingReview) {
      await admin.from("creator_links").update({ status: CREATOR_LINK_STATUS.active }).eq("id", link.id);
    }
  } catch (error) {
    console.error("gift link activation failed:", (error as Error).message);
  }
}

async function lookupStats(admin: SupabaseClient, platform: GiftPlatform, handle: string): Promise<GiftCreatorStats | null> {
  const { data, error } = await admin
    .from("creators_index")
    .select("username, display_name, avatar_url, followers, avg_views, engagement_rate, country_code")
    .eq("username", creatorsIndexKey(platform, handle))
    .maybeSingle();
  if (error) return null;
  return giftCreatorStatsFromIndex(data as Record<string, unknown> | null);
}

/** What the page needs to know about the signed-in viewer for this campaign. */
export async function giftViewerState(admin: SupabaseClient, actorId: string | null, token: string): Promise<ApplyResult> {
  const campaign = await loadGiftCampaignByToken(admin, token);
  if (!campaign) return { status: 404, body: { ok: false, error: "not_found" } };
  if (!actorId) return { status: 200, body: { ok: true, viewer: "anonymous", mission: null } };
  if (campaign.user_id === actorId) return { status: 200, body: { ok: true, viewer: "owner", mission: null } };
  const [{ data: profile }, { data: mission }] = await Promise.all([
    admin.from("profiles").select("account_type, onboarding_completed, username, full_name").eq("id", actorId).maybeSingle(),
    admin.from("gift_missions").select("id, status, creator_handle, creator_platform").eq("campaign_id", campaign.id).eq("creator_user_id", actorId).maybeSingle(),
  ]);
  const p = profile as Profile | null;
  return {
    status: 200,
    body: {
      ok: true,
      viewer: isEstablishedBrand(p) ? "brand" : "creator",
      username: p?.username ?? null,
      fullName: p?.full_name ?? null,
      mission: mission ? { status: (mission as { status: string }).status } : null,
    },
  };
}

export async function applyToGiftCampaign(
  admin: SupabaseClient,
  actorId: string,
  body: Record<string, unknown>,
): Promise<ApplyResult> {
  const token = String(body.token ?? "");
  const campaign = await loadGiftCampaignByToken(admin, token);
  if (!campaign) return { status: 404, body: { ok: false, error: "not_found" } };
  if (campaign.user_id === actorId) return { status: 400, body: { ok: false, error: "own_campaign" } };

  const [taken, canPublish] = await Promise.all([countTakenSpots(admin, campaign.id), brandCanPublish(admin, campaign.user_id)]);
  const availability = giftCampaignAvailability(
    { status: campaign.status, share_enabled: canPublish ? campaign.share_enabled : false, deadline: campaign.deadline, spots: campaign.spots },
    taken,
    todayIso(),
  );
  if (!availability.open) return { status: 410, body: { ok: false, error: availability.reason } };

  const { data: profileRow } = await admin
    .from("profiles")
    .select("account_type, onboarding_completed, username, full_name")
    .eq("id", actorId)
    .maybeSingle();
  const profile = profileRow as Profile | null;
  if (isEstablishedBrand(profile)) return { status: 403, body: { ok: false, error: "brand_account" } };

  const parsed = parseGiftApplication(body, campaign.platforms);
  if (!parsed.ok) return { status: 400, body: { ok: false, error: parsed.code } };
  const { platform, handle, message } = parsed.value;

  const { data: linkRow } = await admin
    .from("creator_links")
    .select("id, status")
    .eq("creator_id", actorId)
    .eq("brand_id", campaign.user_id)
    .maybeSingle();
  const link = linkRow as { id: string; status: string } | null;
  if (link && (link.status === CREATOR_LINK_STATUS.revoked || link.status === CREATOR_LINK_STATUS.ignored)) {
    return { status: 403, body: { ok: false, error: "not_allowed" } };
  }

  const stats = await lookupStats(admin, platform, handle);
  const check = checkGiftRequirements(campaign, platform, stats);
  if (!check.ok) return { status: 422, body: { ok: false, error: "requirements", failures: check.failures } };

  const fullName = String(body.fullName ?? profile?.full_name ?? "").trim().slice(0, 120);
  // First contact with this brand: creator profile, link (pending review) and the brand's CRM row,
  // exactly like the affiliate join link. An existing link is left as it is.
  if (!link) {
    const joined = await joinCreatorToBrand(admin, {
      brandId: campaign.user_id,
      creatorId: actorId,
      socialHandle: profile?.username || handle,
      fullName,
      workspaceId: campaign.workspace_id ?? undefined,
    });
    if (!joined.ok) return { status: 500, body: { ok: false, error: "join_failed" } };
  } else if ((profile?.account_type ?? "").toLowerCase() !== "creator") {
    await admin.from("profiles").update({ account_type: "creator" }).eq("id", actorId);
  }

  const brand = await brandPublicIdentity(admin, campaign);
  const lang = body.lang === "fr" ? "fr" : "en";
  const contract = buildGiftContract({
    lang,
    brandName: brand.name || (lang === "fr" ? "La marque" : "The brand"),
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

  const wanted = giftApplicationStatus(campaign.auto_approve === true, check);
  const rpc = await admin.rpc("gift_apply_to_campaign", {
    p_campaign_id: campaign.id,
    p_creator_user_id: actorId,
    p_handle: handle,
    p_platform: platform,
    p_contract: contract,
    p_message: message,
    p_stats: stats,
    p_auto_approve: wanted === "invited",
    p_max_per_hour: GIFT_APPLY_MAX_PER_HOUR,
  });
  if (rpc.error) return { status: 500, body: { ok: false, error: "server" } };
  const result = (rpc.data ?? {}) as { ok?: boolean; code?: string; status?: string; mission_id?: string };
  if (!result.ok) {
    const code = result.code || "server";
    const status = code === "already" ? 200 : code === "rate_limited" ? 429 : code === "not_found" ? 404 : code === "handle_taken" ? 409 : 410;
    return { status, body: { ok: code === "already", error: code, alreadyApplied: code === "already", missionStatus: result.status ?? null } };
  }

  if (result.status === "invited") await activateGiftCreatorLink(admin, campaign.user_id, actorId);
  await insertBrandNotification(admin, campaign.user_id, "gift_application", {
    creatorName: stats?.displayName || fullName || `@${handle}`,
    handle,
    platform,
    campaignId: campaign.id,
    campaignName: campaign.name,
    autoApproved: result.status === "invited",
  });
  return { status: 200, body: { ok: true, missionStatus: result.status, alreadyApplied: false } };
}
