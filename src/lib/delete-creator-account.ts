import type { SupabaseClient } from "@supabase/supabase-js";
import { CREATOR_LINK_STATUS } from "@/lib/creator-dashboard-access";

function brandDisplayName(profile: {
  business_name: string | null;
  full_name: string | null;
  username: string | null;
}): string {
  return (
    profile.business_name?.trim() ||
    profile.full_name?.trim() ||
    (profile.username ? `@${profile.username}` : "Trackit")
  );
}

/** Supprime le compte créateur, sa fiche marque et trace l'email pour le message de connexion. */
export async function deleteCreatorAccountForBrand(
  admin: SupabaseClient,
  brandId: string,
  creatorRowId: string,
): Promise<void> {
  const { data: creator, error: fetchErr } = await admin
    .from("creators")
    .select("id, linked_user_id, handle, full_name")
    .eq("id", creatorRowId)
    .eq("user_id", brandId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!creator) throw new Error("Creator not found");

  const linkedUserId = creator.linked_user_id;
  const username = String(creator.handle || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();

  const { data: brandProfile } = await admin
    .from("profiles")
    .select("business_name, full_name, username")
    .eq("id", brandId)
    .maybeSingle();

  const brandName = brandProfile ? brandDisplayName(brandProfile) : "Trackit";

  let email: string | null = null;
  if (linkedUserId) {
    const { data: authUser } = await admin.auth.admin.getUserById(linkedUserId);
    email = authUser?.user?.email?.trim().toLowerCase() ?? null;
  }

  if (email) {
    await admin.from("creator_deactivations").upsert(
      {
        email,
        brand_id: brandId,
        brand_name: brandName,
        creator_handle: username || null,
        deactivated_at: new Date().toISOString(),
      },
      { onConflict: "email,brand_id" },
    );
  }

  if (username) {
    await admin
      .from("discovery_saved")
      .delete()
      .eq("user_id", brandId)
      .eq("creator_username", username);
  }

  await admin.from("creator_content").delete().eq("creator_row_id", creatorRowId);

  if (linkedUserId) {
    await admin
      .from("creator_links")
      .update({ status: CREATOR_LINK_STATUS.revoked })
      .eq("brand_id", brandId)
      .eq("creator_id", linkedUserId);
  }

  const { error: deleteRowErr } = await admin
    .from("creators")
    .delete()
    .eq("id", creatorRowId)
    .eq("user_id", brandId);
  if (deleteRowErr) throw new Error(deleteRowErr.message);

  if (linkedUserId) {
    const { error: deleteUserErr } = await admin.auth.admin.deleteUser(linkedUserId);
    if (deleteUserErr) throw new Error(deleteUserErr.message);
  }
}

export async function findDeactivatedCreatorBrand(
  admin: SupabaseClient,
  email: string,
): Promise<{ brandName: string } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await admin
    .from("creator_deactivations")
    .select("brand_name, deactivated_at")
    .eq("email", normalized)
    .order("deactivated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error?.message?.includes("creator_deactivations")) return null;
  if (error || !data?.brand_name) return null;

  return { brandName: String(data.brand_name) };
}
