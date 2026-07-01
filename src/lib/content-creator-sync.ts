import type { SupabaseClient } from "@supabase/supabase-js";

export type ContentRef = { id: string; title: string };

export async function syncContentRefToDiscoverySaved(
  admin: SupabaseClient,
  brandId: string,
  creatorRowId: string,
  contentRef: ContentRef,
): Promise<Error | null> {
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("handle, full_name, avatar_url, platform, followers, engagement_rate, niche")
    .eq("id", creatorRowId)
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
  const prevContent = Array.isArray(prevCrm.content) ? prevCrm.content : [];
  const content = [...prevContent];
  if (!content.some((c) => c && typeof c === "object" && (c as ContentRef).id === contentRef.id)) {
    content.push(contentRef);
  }

  const snapshot = {
    ...prevSnap,
    username,
    displayName: creator.full_name?.trim() || username,
    trackitCreatorId: creatorRowId,
    crm: { ...prevCrm, content },
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
