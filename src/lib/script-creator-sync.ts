import type { SupabaseClient } from "@supabase/supabase-js";

export type ScriptRef = { id: string; title: string };

export async function syncScriptRefToDiscoverySaved(
  admin: SupabaseClient,
  brandId: string,
  creatorId: string,
  scriptRef: ScriptRef
): Promise<Error | null> {
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("handle, full_name, avatar_url, platform, followers, engagement_rate, niche")
    .eq("id", creatorId)
    .eq("user_id", brandId)
    .maybeSingle();
  if (creatorErr) return new Error(creatorErr.message);
  if (!creator?.handle) return null;

  const username = creator.handle.trim().replace(/^@+/, "").toLowerCase();
  if (!username) return null;

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

  const row = {
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

  const { error } = await admin
    .from("discovery_saved")
    .upsert(row, { onConflict: "user_id,creator_username" });
  return error ? new Error(error.message) : null;
}
