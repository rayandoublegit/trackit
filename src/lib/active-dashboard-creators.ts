import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as browserSupabase } from "@/lib/supabase";

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

const CREATOR_SELECT =
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

/** Créateur validé via « Ajouter le créateur » : compte lié + plus en attente de revue. */
export function isActiveDashboardCreator(row: {
  linked_user_id?: string | null;
  needs_review?: boolean | null;
}): boolean {
  return Boolean(row.linked_user_id) && row.needs_review !== true;
}

async function enrichWithJoinedDates(
  supabase: SupabaseClient,
  brandId: string,
  rows: CreatorRow[],
): Promise<ActiveDashboardCreator[]> {
  const linkedIds = [...new Set(rows.map((r) => r.linked_user_id).filter(Boolean))] as string[];

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

/** Créateurs dont le dashboard créateur est actif pour cette marque (serveur). */
export async function listActiveDashboardCreators(
  supabase: SupabaseClient,
  brandId: string,
): Promise<ActiveDashboardCreator[]> {
  const { data, error } = await supabase
    .from("creators")
    .select(CREATOR_SELECT)
    .eq("user_id", brandId)
    .not("linked_user_id", "is", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = ((data as CreatorRow[] | null) ?? []).filter(isActiveDashboardCreator);
  if (!rows.length) return [];

  return enrichWithJoinedDates(supabase, brandId, rows);
}

/** Charge la liste côté navigateur (session marque) — même source que Gérer. */
export async function listActiveDashboardCreatorsClient(
  brandId: string,
): Promise<ActiveDashboardCreator[]> {
  if (!browserSupabase) return [];
  const { data, error } = await browserSupabase
    .from("creators")
    .select(CREATOR_SELECT)
    .eq("user_id", brandId)
    .not("linked_user_id", "is", null)
    .order("created_at", { ascending: false });

  if (error) return [];

  const rows = ((data as CreatorRow[] | null) ?? []).filter(isActiveDashboardCreator);
  if (!rows.length) return [];

  return enrichWithJoinedDates(browserSupabase, brandId, rows);
}

export async function activateCreatorDashboard(
  supabase: SupabaseClient,
  brandId: string,
  creatorRowId: string,
  linkedUserId?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = {
    needs_review: false,
    dashboard_active: true,
  };
  if (linkedUserId) patch.linked_user_id = linkedUserId;

  const { error } = await supabase
    .from("creators")
    .update(patch)
    .eq("id", creatorRowId)
    .eq("user_id", brandId);

  if (error?.message?.includes("dashboard_active")) {
    const legacy: Record<string, unknown> = { needs_review: false };
    if (linkedUserId) legacy.linked_user_id = linkedUserId;
    const { error: legacyErr } = await supabase
      .from("creators")
      .update(legacy)
      .eq("id", creatorRowId)
      .eq("user_id", brandId);
    if (legacyErr) throw new Error(legacyErr.message);
    return;
  }
  if (error) throw new Error(error.message);
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

  if (error?.message?.includes("dashboard_active")) {
    const { error: legacyErr } = await supabase
      .from("creators")
      .update({ linked_user_id: null })
      .eq("id", creatorRowId)
      .eq("user_id", brandId);
    if (legacyErr) throw new Error(legacyErr.message);
    return;
  }
  if (error) throw new Error(error.message);
}
