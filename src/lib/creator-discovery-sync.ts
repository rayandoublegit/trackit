import type { SupabaseClient } from "@supabase/supabase-js";
import { accountEmailForLinkedUser } from "@/lib/linked-creator-emails";
import { resolveOwnerActiveWorkspaceId } from "@/lib/workspace-db";

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
  workspace_id?: string | null;
};

/** Upsert a linked brand creator into discovery_saved (Gérer les créateurs). */
export async function syncCreatorToDiscoverySaved(
  admin: SupabaseClient,
  brandId: string,
  creator: BrandCreatorSyncRow,
  options?: { pipelineStatus?: string; workspaceId?: string | null },
): Promise<Error | null> {
  const username = creator.handle.trim().replace(/^@+/, "").toLowerCase();
  if (!username) return new Error("Creator handle missing");

  const workspaceId =
    options?.workspaceId ??
    creator.workspace_id ??
    (await resolveOwnerActiveWorkspaceId(admin, brandId));

  let existingQuery = admin
    .from("discovery_saved")
    .select("id, snapshot, pipeline_status, notes")
    .eq("user_id", brandId)
    .eq("creator_username", username);
  if (workspaceId) existingQuery = existingQuery.eq("workspace_id", workspaceId);
  const { data: existingRows } = await existingQuery.limit(1);
  const existing = existingRows?.[0] ?? null;

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

  const row: Record<string, unknown> = {
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
  };
  if (workspaceId) row.workspace_id = workspaceId;

  const { error } = existing?.id
    ? await admin.from("discovery_saved").update(row).eq("id", existing.id)
    : await admin.from("discovery_saved").insert(row);

  return error ? new Error(error.message) : null;
}
