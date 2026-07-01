import type { SupabaseClient } from "@supabase/supabase-js";

export type ActiveDashboardCreator = {
  id: string;
  handle: string;
  full_name: string | null;
  avatar_url: string | null;
  platform: string | null;
  commission_rate: number | null;
  discount_code: string | null;
  linked_user_id: string | null;
  created_at: string;
  joined_at: string;
};

const SELECT =
  "id, handle, full_name, avatar_url, platform, commission_rate, discount_code, linked_user_id, created_at, needs_review, dashboard_active";

const LEGACY_SELECT =
  "id, handle, full_name, avatar_url, platform, commission_rate, discount_code, linked_user_id, created_at, needs_review";

type CreatorRow = {
  id: string;
  handle: string;
  full_name: string | null;
  avatar_url: string | null;
  platform: string | null;
  commission_rate: number | null;
  discount_code: string | null;
  linked_user_id: string | null;
  created_at: string;
  needs_review?: boolean | null;
};

/** Créateurs dont le dashboard créateur est actif pour cette marque. */
export async function listActiveDashboardCreators(
  supabase: SupabaseClient,
  brandId: string,
): Promise<ActiveDashboardCreator[]> {
  const { data: flagged, error: flaggedErr } = await supabase
    .from("creators")
    .select(SELECT)
    .eq("user_id", brandId)
    .eq("dashboard_active", true)
    .order("created_at", { ascending: false });

  let rows: CreatorRow[] = (flagged as CreatorRow[] | null) ?? [];
  if (flaggedErr?.message?.includes("dashboard_active")) {
    const { data: legacy } = await supabase
      .from("creators")
      .select(LEGACY_SELECT)
      .eq("user_id", brandId)
      .not("linked_user_id", "is", null)
      .order("created_at", { ascending: false });
    rows = ((legacy as CreatorRow[] | null) ?? []).filter(
      (r) => r.linked_user_id && r.needs_review !== true,
    );
  } else if (flaggedErr) {
    throw new Error(flaggedErr.message);
  }

  if (!rows?.length) return [];

  const linkedIds = [
    ...new Set(rows.map((r) => r.linked_user_id).filter(Boolean)),
  ] as string[];

  const { data: links } = linkedIds.length
    ? await supabase
        .from("creator_links")
        .select("creator_id, created_at")
        .eq("brand_id", brandId)
        .in("creator_id", linkedIds)
    : { data: [] as { creator_id: string; created_at: string }[] };

  const joinedAtByCreator = new Map((links ?? []).map((l) => [l.creator_id, l.created_at]));

  return rows.map((row) => ({
    id: row.id,
    handle: row.handle,
    full_name: row.full_name,
    avatar_url: row.avatar_url,
    platform: row.platform,
    commission_rate: row.commission_rate,
    discount_code: row.discount_code,
    linked_user_id: row.linked_user_id,
    created_at: row.created_at,
    joined_at:
      (row.linked_user_id && joinedAtByCreator.get(row.linked_user_id)) || row.created_at,
  }));
}

export async function activateCreatorDashboard(
  supabase: SupabaseClient,
  brandId: string,
  creatorRowId: string,
): Promise<void> {
  const patch: Record<string, unknown> = {
    needs_review: false,
    dashboard_active: true,
  };
  const { error } = await supabase
    .from("creators")
    .update(patch)
    .eq("id", creatorRowId)
    .eq("user_id", brandId);
  if (error && !error.message.includes("dashboard_active")) {
    throw new Error(error.message);
  }
  if (error?.message?.includes("dashboard_active")) {
    await supabase
      .from("creators")
      .update({ needs_review: false })
      .eq("id", creatorRowId)
      .eq("user_id", brandId);
  }
}

export async function deactivateCreatorDashboard(
  supabase: SupabaseClient,
  brandId: string,
  creatorRowId: string,
): Promise<void> {
  const patch: Record<string, unknown> = {
    linked_user_id: null,
    dashboard_active: false,
  };
  const { error } = await supabase
    .from("creators")
    .update(patch)
    .eq("id", creatorRowId)
    .eq("user_id", brandId);
  if (error && !error.message.includes("dashboard_active")) {
    throw new Error(error.message);
  }
  if (error?.message?.includes("dashboard_active")) {
    await supabase
      .from("creators")
      .update({ linked_user_id: null })
      .eq("id", creatorRowId)
      .eq("user_id", brandId);
  }
}
