import type { SupabaseClient } from "@supabase/supabase-js";
import { publicBrandName } from "@/lib/creator-brand-join";
import { GIFT_PRODUCT_BUCKET, giftTakesSpot, isGiftShareToken, toPublicGiftCampaign, todayIso, type PublicGiftCampaign } from "@/lib/gift-share";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Server-side reads behind the public gift page and the apply route.
// Always the service role, always filtered to public fields before leaving.

export type GiftCampaignRow = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  name: string;
  product: string;
  brief: string;
  status: string;
  video_count: number;
  deadline: string;
  fixed_fee_cents: number;
  currency?: string | null;
  allow_ads: boolean;
  rights_days: number;
  territories: string;
  share_token?: string | null;
  share_enabled?: boolean | null;
  spots?: number | null;
  auto_approve?: boolean | null;
  offer?: string | null;
  product_value_cents?: number | null;
  product_images?: string[] | null;
  min_followers?: number | null;
  platforms?: string[] | null;
  countries?: string[] | null;
};

export async function loadGiftCampaignByToken(admin: SupabaseClient, token: string): Promise<GiftCampaignRow | null> {
  if (!isGiftShareToken(token)) return null;
  const { data, error } = await admin.from("gift_campaigns").select("*").eq("share_token", token).maybeSingle();
  if (error || !data) return null;
  return data as GiftCampaignRow;
}

/** Missions holding a spot (the brand said yes; applications and refusals do not count). */
export async function countTakenSpots(admin: SupabaseClient, campaignId: string): Promise<number> {
  const { data } = await admin.from("gift_missions").select("status").eq("campaign_id", campaignId);
  return (data ?? []).filter((row) => giftTakesSpot(String((row as { status?: string }).status ?? ""))).length;
}

/** Paid plans only publish creator links (same rule as sending a mission by handle). */
export async function brandCanPublish(admin: SupabaseClient, ownerId: string): Promise<boolean> {
  const { data } = await admin.from("profiles").select("plan").eq("id", ownerId).maybeSingle();
  const plan = (data as { plan?: string | null } | null)?.plan;
  return Boolean(plan) && plan !== "free";
}

/** Brand name and logo as creators see them: the workspace first, then the profile. */
export async function brandPublicIdentity(
  admin: SupabaseClient,
  campaign: Pick<GiftCampaignRow, "user_id" | "workspace_id">,
): Promise<{ name: string | null; logoUrl: string | null }> {
  let name: string | null = null;
  let logoUrl: string | null = null;
  if (campaign.workspace_id) {
    const { data } = await admin.from("workspaces").select("name, avatar_url").eq("id", campaign.workspace_id).maybeSingle();
    const ws = data as { name?: string | null; avatar_url?: string | null } | null;
    if (ws?.avatar_url && /^https:\/\//.test(ws.avatar_url)) logoUrl = ws.avatar_url;
    if (ws?.name?.trim()) name = ws.name.trim();
  }
  const profileName = await publicBrandName(admin, campaign.user_id);
  if (profileName) name = profileName;
  if (!logoUrl) {
    const { data } = await admin.from("profiles").select("avatar_url").eq("id", campaign.user_id).maybeSingle();
    const url = (data as { avatar_url?: string | null } | null)?.avatar_url;
    if (url && /^https:\/\//.test(url)) logoUrl = url;
  }
  return { name, logoUrl };
}

/** What /gift/<token> renders, or null (unknown token, no database). */
export async function loadPublicGiftCampaign(token: string): Promise<PublicGiftCampaign | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const campaign = await loadGiftCampaignByToken(admin, token);
  if (!campaign) return null;
  const [taken, brand, canPublish] = await Promise.all([
    countTakenSpots(admin, campaign.id),
    brandPublicIdentity(admin, campaign),
    brandCanPublish(admin, campaign.user_id),
  ]);
  return toPublicGiftCampaign(campaign as unknown as Record<string, unknown>, brand, taken, todayIso(), { brandCanPublish: canPublish });
}

/** Public folder of one brand's product photos: the only image URLs a campaign may hold. */
export function giftProductImagePrefix(ownerId: string): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  return `${url.replace(/\/$/, "")}/storage/v1/object/public/${GIFT_PRODUCT_BUCKET}/${ownerId}/`;
}
