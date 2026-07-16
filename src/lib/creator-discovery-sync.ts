import type { SupabaseClient } from "@supabase/supabase-js";
import { accountEmailForLinkedUser } from "@/lib/linked-creator-emails";

export type BrandCreatorSyncRow = {
  id: string;
  handle: string;
  full_name: string | null;
  avatar_url?: string | null;
  platform?: string | null;
  commission_rate?: number | null;
  discount_code?: string | null;
  niche?: string | null;
  followers?: number | null;
  engagement_rate?: number | null;
  linked_user_id: string | null;
};

/** Upsert a linked brand creator into discovery_saved (Gérer les créateurs). */
export async function syncCreatorToDiscoverySaved(
  admin: SupabaseClient,
  brandId: string,
  creator: BrandCreatorSyncRow,
  options?: { pipelineStatus?: string },
): Promise<Error | null> {
  const username = creator.handle.trim().replace(/^@+/, "").toLowerCase();
  if (!username) return new Error("Creator handle missing");

  const { data: existing } = await admin
    .from("discovery_saved")
    .select("snapshot, pipeline_status, notes")
    .eq("user_id", brandId)
    .eq("creator_username", username)
    .maybeSingle();

  const prevSnap =
    existing?.snapshot && typeof existing.snapshot === "object"
      ? (existing.snapshot as Record<string, unknown>)
      : {};
  const prevCrm =
    prevSnap.crm && typeof prevSnap.crm === "object"
      ? (prevSnap.crm as Record<string, unknown>)
      : {};

  const platform = creator.platform ?? "tiktok";
  const followers = Number(creator.followers ?? 0) || 0;
  const engagementRate = Number(creator.engagement_rate ?? 0) || 0;
  const niche = creator.niche ?? "";
  const displayName = creator.full_name?.trim() || username;
  const avatarUrl = creator.avatar_url ?? "";
  const commissionRate = creator.commission_rate ?? 10;
  const promoCode = creator.discount_code?.trim() ?? "";
  const accountEmail = await accountEmailForLinkedUser(admin, creator.linked_user_id);

  const snapshot: Record<string, unknown> = {
    ...prevSnap,
    username,
    displayName,
    avatarUrl,
    platform,
    followersCount: followers,
    engagementRate,
    primaryNiche: niche,
    niche,
    commissionRate,
    trackitCreatorId: creator.id,
    linkedUserId: creator.linked_user_id,
    ...(accountEmail ? { accountEmail } : {}),
    crm: {
      ...prevCrm,
      commissionRate,
      ...(promoCode ? { promoCode } : {}),
    },
  };

  const { error } = await admin.from("discovery_saved").upsert(
    {
      user_id: brandId,
      creator_username: username,
      platform,
      display_name: displayName,
      avatar_url: avatarUrl,
      followers,
      engagement_rate: engagementRate,
      primary_niche: niche,
      snapshot,
      pipeline_status: existing?.pipeline_status ?? options?.pipelineStatus ?? "signed",
      notes: existing?.notes ?? "",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,creator_username" },
  );

  return error ? new Error(error.message) : null;
}
