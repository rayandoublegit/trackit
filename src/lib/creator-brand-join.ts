import type { SupabaseClient } from "@supabase/supabase-js";
import { insertBrandNotification } from "@/lib/brand-notifications";
import {
  CREATOR_ROW_SYNC_SELECT,
  ensureCreatorRowForBrandLink,
  normalizeCreatorHandle,
  syncCreatorRowsByProfileHandle,
} from "@/lib/creator-account";
import { syncCreatorToDiscoverySaved, type BrandCreatorSyncRow } from "@/lib/creator-discovery-sync";
import { CREATOR_LINK_STATUS } from "@/lib/creator-dashboard-access";
import { resolveOwnerActiveWorkspaceId } from "@/lib/workspace-db";

export type CreatorBrandJoinInput = {
  brandId: string;
  creatorId: string;
  socialHandle: string;
  fullName?: string | null;
  inviteId?: string | null;
  /** Workspace the creator row belongs to; defaults to the brand's active workspace. */
  workspaceId?: string | null;
};

export type CreatorBrandJoinResult =
  | { ok: true; creatorRowId: string | null; workspaceId: string | null; handle: string }
  | { ok: false; error: string };

/**
 * Turns a signed-in account into a creator of `brandId`: creator profile, the
 * creator↔brand link, the brand's CRM row (found by handle or created) and the
 * Discovery pipeline entry. Shared by brand invites and campaign join links.
 */
export async function joinCreatorToBrand(
  supabase: SupabaseClient,
  input: CreatorBrandJoinInput,
): Promise<CreatorBrandJoinResult> {
  const { brandId, creatorId } = input;
  const handle = normalizeCreatorHandle(input.socialHandle);
  const fullName = (input.fullName || "").trim();
  if (!handle) return { ok: false, error: "Missing social handle" };

  const profileUpdate: Record<string, unknown> = {
    account_type: "creator",
    onboarding_completed: true,
    username: handle,
  };
  if (fullName) profileUpdate.full_name = fullName;
  const { error: profErr } = await supabase.from("profiles").update(profileUpdate).eq("id", creatorId);
  if (profErr) return { ok: false, error: profErr.message };

  const linkRow: Record<string, unknown> = {
    creator_id: creatorId,
    brand_id: brandId,
    status: CREATOR_LINK_STATUS.pendingReview,
  };
  if (input.inviteId) linkRow.invite_id = input.inviteId;
  const { error: linkErr } = await supabase
    .from("creator_links")
    .upsert(linkRow, { onConflict: "creator_id,brand_id" });
  if (linkErr) return { ok: false, error: linkErr.message };

  const workspaceId = input.workspaceId ?? (await resolveOwnerActiveWorkspaceId(supabase, brandId));
  let creatorRowId: string | null = null;

  let existingQuery = supabase.from("creators").select("id, handle, linked_user_id").eq("user_id", brandId);
  if (workspaceId) existingQuery = existingQuery.eq("workspace_id", workspaceId);
  const { data: existingRows } = await existingQuery;
  const rows = (existingRows ?? []) as { id: string; handle: string | null; linked_user_id: string | null }[];
  const existing =
    rows.find((row) => row.linked_user_id === creatorId) ??
    rows.find((row) => normalizeCreatorHandle(row.handle) === handle) ??
    null;

  if (existing) {
    await supabase
      .from("creators")
      .update({ linked_user_id: creatorId, full_name: fullName || undefined, needs_review: true })
      .eq("id", existing.id);
    creatorRowId = existing.id;
  } else {
    const insertRow: Record<string, unknown> = {
      user_id: brandId,
      handle,
      full_name: fullName || handle,
      linked_user_id: creatorId,
      platform: "tiktok",
      commission_rate: 10,
      needs_review: true,
    };
    if (workspaceId) insertRow.workspace_id = workspaceId;
    const { data: inserted, error: insertErr } = await supabase
      .from("creators")
      .insert(insertRow)
      .select("id")
      .single();
    if (insertErr) return { ok: false, error: insertErr.message };
    creatorRowId = inserted?.id ?? null;
  }

  if (!creatorRowId) {
    const ensured = await ensureCreatorRowForBrandLink(supabase, brandId, creatorId, {
      username: handle,
      full_name: fullName || null,
    });
    creatorRowId = ensured?.id ?? null;
  }

  if (creatorRowId) {
    const { data: creatorForSync } = await supabase
      .from("creators")
      .select(CREATOR_ROW_SYNC_SELECT)
      .eq("id", creatorRowId)
      .eq("user_id", brandId)
      .maybeSingle();
    if (creatorForSync) {
      const syncErr = await syncCreatorToDiscoverySaved(supabase, brandId, creatorForSync as BrandCreatorSyncRow, {
        pipelineStatus: "signed",
        workspaceId,
      });
      if (syncErr) return { ok: false, error: syncErr.message };
    }
  }

  await syncCreatorRowsByProfileHandle(supabase, creatorId, { username: handle, full_name: fullName || null });

  return { ok: true, creatorRowId, workspaceId, handle };
}

/** Brand name shown to creators on invite and join pages. */
export async function publicBrandName(supabase: SupabaseClient, brandId: string): Promise<string | null> {
  const { data: brand } = await supabase
    .from("profiles")
    .select("business_name, full_name, username")
    .eq("id", brandId)
    .maybeSingle();
  return brand?.business_name || brand?.full_name || (brand?.username ? `@${brand.username}` : null);
}

export async function notifyCreatorJoined(
  supabase: SupabaseClient,
  brandId: string,
  handle: string,
  fullName?: string | null,
  extra: Record<string, unknown> = {},
) {
  await insertBrandNotification(supabase, brandId, "creator_joined", {
    creatorName: fullName || `@${handle.replace(/^@/, "")}`,
    handle,
    ...extra,
  });
}
