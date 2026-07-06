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

export async function removeContentRefFromDiscoverySaved(
  admin: SupabaseClient,
  brandId: string,
  creatorRowId: string,
  contentId: string,
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
  if (!existing?.snapshot || typeof existing.snapshot !== "object") return null;

  const prevSnap = existing.snapshot as Record<string, unknown>;
  const prevCrm =
    prevSnap.crm && typeof prevSnap.crm === "object"
      ? (prevSnap.crm as Record<string, unknown>)
      : {};
  const prevContent = Array.isArray(prevCrm.content) ? prevCrm.content : [];
  const content = prevContent.filter(
    (c) => !(c && typeof c === "object" && (c as ContentRef).id === contentId),
  );
  if (content.length === prevContent.length) return null;

  const snapshot = {
    ...prevSnap,
    username,
    displayName: creator.full_name?.trim() || username,
    trackitCreatorId: creatorRowId,
    crm: { ...prevCrm, content },
  };

  const { error } = await admin
    .from("discovery_saved")
    .update({
      snapshot,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", brandId)
    .eq("creator_username", username);
  return error ? new Error(error.message) : null;
}

/** Synchronise les références CRM pour tout le contenu existant d'un créateur. */
export async function backfillDiscoveryContentRefs(
  admin: SupabaseClient,
  brandId: string,
  creatorRowId: string,
): Promise<Error | null> {
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("linked_user_id")
    .eq("id", creatorRowId)
    .eq("user_id", brandId)
    .maybeSingle();

  if (creatorErr) return new Error(creatorErr.message);
  if (!creator) return null;

  const select = "id, title";
  const byRow = await admin
    .from("creator_content")
    .select(select)
    .eq("brand_id", brandId)
    .eq("creator_row_id", creatorRowId);

  const byUser = creator.linked_user_id
    ? await admin
        .from("creator_content")
        .select(select)
        .eq("brand_id", brandId)
        .eq("creator_user_id", creator.linked_user_id)
    : { data: [] as { id: string; title: string | null }[], error: null };

  const error = byRow.error || byUser.error;
  if (error?.message?.includes("creator_content")) return null;
  if (error) return new Error(error.message);

  const merged = new Map<string, { id: string; title: string | null }>();
  for (const row of [...(byRow.data || []), ...(byUser.data || [])]) {
    merged.set(String(row.id), row);
  }
  const items = [...merged.values()];
  if (items.length === 0) return null;

  for (const item of items) {
    const syncErr = await syncContentRefToDiscoverySaved(admin, brandId, creatorRowId, {
      id: String(item.id),
      title: String(item.title || "Content"),
    });
    if (syncErr) return syncErr;
  }

  return null;
}
