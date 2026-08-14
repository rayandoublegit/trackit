import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOwnerActiveWorkspaceId } from "@/lib/workspace-db";

export type ScriptRef = { id: string; title: string };

export async function syncScriptRefToDiscoverySaved(
  admin: SupabaseClient,
  brandId: string,
  creatorId: string,
  scriptRef: ScriptRef
): Promise<Error | null> {
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("handle, full_name, avatar_url, platform, followers, engagement_rate, niche, workspace_id")
    .eq("id", creatorId)
    .eq("user_id", brandId)
    .maybeSingle();
  if (creatorErr) return new Error(creatorErr.message);
  if (!creator?.handle) return null;

  const username = creator.handle.trim().replace(/^@+/, "").toLowerCase();
  if (!username) return null;

  const workspaceId =
    (creator.workspace_id as string | null) ??
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
  const prevScripts = Array.isArray(prevCrm.scripts) ? prevCrm.scripts : [];
  const scripts = [...prevScripts];
  if (!scripts.some((s) => s && typeof s === "object" && (s as ScriptRef).id === scriptRef.id)) {
    scripts.push(scriptRef);
  }

  const snapshot = {
    ...prevSnap,
    username,
    displayName: creator.full_name?.trim() || username,
    trackitCreatorId: creatorId,
    crm: { ...prevCrm, scripts },
  };

  const row: Record<string, unknown> = {
    user_id: brandId,
    creator_username: username,
    display_name: creator.full_name?.trim() || username,
    avatar_url: creator.avatar_url ?? "",
    platform: creator.platform ?? "tiktok",
    followers: Number(creator.followers ?? 0) || 0,
    engagement_rate: Number(creator.engagement_rate ?? 0) || 0,
    primary_niche: creator.niche ?? "",
    snapshot,
    pipeline_status: existing?.pipeline_status ?? "signed",
    notes: existing?.notes ?? "",
    updated_at: new Date().toISOString(),
  };
  if (workspaceId) row.workspace_id = workspaceId;

  const { error } = existing?.id
    ? await admin.from("discovery_saved").update(row).eq("id", existing.id)
    : await admin.from("discovery_saved").insert(row);
  return error ? new Error(error.message) : null;
}
