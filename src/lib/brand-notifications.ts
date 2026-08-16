import type { SupabaseClient } from "@supabase/supabase-js";

export type BrandNotificationType =
  | "creator_joined"
  | "script_done"
  | "content_uploaded"
  | "creator_message";

export type BrandNotificationRow = {
  id: string;
  type: BrandNotificationType | string;
  payload: Record<string, unknown>;
  created_at: string;
};

/**
 * Enregistre une notification serveur pour la marque (fire-and-forget :
 * un échec ne doit jamais bloquer l'action du créateur).
 */
export async function insertBrandNotification(
  admin: SupabaseClient,
  brandId: string,
  type: BrandNotificationType,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { error } = await admin
      .from("brand_notifications")
      .insert({ brand_id: brandId, type, payload });
    if (error) console.error("brand notification insert failed:", error.message);
  } catch (e) {
    console.error("brand notification insert failed:", (e as Error).message);
  }
}

/** Nom affichable du créateur depuis son profil (fallback handle puis générique). */
export async function resolveCreatorDisplayName(
  admin: SupabaseClient,
  creatorUserId: string,
): Promise<string> {
  try {
    const { data } = await admin
      .from("profiles")
      .select("full_name, username")
      .eq("id", creatorUserId)
      .maybeSingle();
    const name = (data?.full_name || "").trim();
    if (name) return name;
    const handle = (data?.username || "").trim();
    if (handle) return `@${handle.replace(/^@/, "")}`;
  } catch {
    /* ignore */
  }
  return "";
}
