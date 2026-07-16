import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCommissionRate, commissionRateFromDiscountCode } from "@/lib/creator-crm";

export const COMMISSION_NOT_CONFIGURED_CODE = "COMMISSION_NOT_CONFIGURED";

export function normalizeCreatorHandle(handle: string): string {
  return handle.trim().replace(/^@+/, "").toLowerCase();
}

/** Commission explicitly set in Find it → Gérer (snapshot.crm.commissionRate). */
export function commissionRateFromDiscoverySnapshot(snapshot: unknown): number | undefined {
  if (!snapshot || typeof snapshot !== "object") return undefined;
  const snap = snapshot as Record<string, unknown>;
  const crm = snap.crm;
  if (crm && typeof crm === "object") {
    const c = crm as Record<string, unknown>;
    const fromCrm = parseCommissionRate(c.commissionRate) ?? parseCommissionRate(c.commission_rate);
    if (fromCrm != null) return fromCrm;
  }
  return parseCommissionRate(snap.commissionRate) ?? parseCommissionRate(snap.commission_rate);
}

export function commissionNotConfiguredMessage(lang: "fr" | "en" = "en"): string {
  return lang === "fr"
    ? "Vous devez définir la commission du créateur dans Find it → Gérer avant d'ajouter une vente."
    : "You must set the creator's commission in Find it → Manage before adding a sale.";
}

export async function getManagedCommissionRateForCreator(
  admin: SupabaseClient,
  userId: string,
  creator: { handle?: string | null }
): Promise<{ rate: number } | { error: typeof COMMISSION_NOT_CONFIGURED_CODE }> {
  const handle = normalizeCreatorHandle(creator.handle || "");
  if (!handle) return { error: COMMISSION_NOT_CONFIGURED_CODE };

  const { data: saved } = await admin
    .from("discovery_saved")
    .select("snapshot")
    .eq("user_id", userId)
    .ilike("creator_username", handle)
    .maybeSingle();

  const rate = commissionRateFromDiscoverySnapshot(saved?.snapshot);
  if (rate == null) return { error: COMMISSION_NOT_CONFIGURED_CODE };
  return { rate };
}

/** Manual / campaign sale: CRM → campaign default → creator row → promo code suffix. */
export async function resolveCommissionRateForManualSale(
  admin: SupabaseClient,
  userId: string,
  creator: { id?: string; handle?: string | null; commission_rate?: number | null },
  campaignId?: string | null
): Promise<{ rate: number } | { error: typeof COMMISSION_NOT_CONFIGURED_CODE }> {
  const managed = await getManagedCommissionRateForCreator(admin, userId, creator);
  if (!("error" in managed)) return managed;

  let campaignLinkRate: number | null = null;
  let campaignDefaultRate: number | null = null;

  if (campaignId) {
    const { data: campaign } = await admin
      .from("campaigns")
      .select("commission_rate")
      .eq("id", campaignId)
      .eq("user_id", userId)
      .maybeSingle();

    campaignDefaultRate = parseCommissionRate(campaign?.commission_rate) ?? null;

    if (creator.id) {
      const { data: link } = await admin
        .from("campaign_creators")
        .select("discount_code")
        .eq("campaign_id", campaignId)
        .eq("creator_id", creator.id)
        .eq("user_id", userId)
        .maybeSingle();

      campaignLinkRate =
        commissionRateFromDiscountCode(String(link?.discount_code || "")) ?? null;
    }
  }

  if (campaignLinkRate != null) return { rate: campaignLinkRate };
  if (campaignDefaultRate != null) return { rate: campaignDefaultRate };

  const creatorRate = parseCommissionRate(creator.commission_rate);
  if (creatorRate != null) return { rate: creatorRate };

  return { error: COMMISSION_NOT_CONFIGURED_CODE };
}

export async function loadManagedCommissionByHandle(
  admin: SupabaseClient,
  userId: string
): Promise<Map<string, number>> {
  const { data: rows } = await admin
    .from("discovery_saved")
    .select("creator_username, snapshot")
    .eq("user_id", userId);

  const map = new Map<string, number>();
  for (const row of rows || []) {
    const rate = commissionRateFromDiscoverySnapshot(row.snapshot);
    if (rate != null) {
      map.set(normalizeCreatorHandle(String(row.creator_username || "")), rate);
    }
  }
  return map;
}

/** Commission for Shopify-attributed sales: Gérer CRM → campaign link → creator row → code suffix. */
export async function resolveCommissionRateForShopifySale(
  admin: SupabaseClient,
  userId: string,
  creator: { handle?: string | null; commission_rate?: number | null },
  campaignLinkRate?: number | null,
  discountCode?: string | null
): Promise<number | null> {
  const managed = await getManagedCommissionRateForCreator(admin, userId, creator);
  if (!("error" in managed)) return managed.rate;

  const linkRate = parseCommissionRate(campaignLinkRate);
  if (linkRate != null) return linkRate;

  const creatorRate = parseCommissionRate(creator.commission_rate);
  if (creatorRate != null) return creatorRate;

  const fromCode = commissionRateFromDiscountCode(discountCode || "");
  if (fromCode != null) return fromCode;

  return null;
}
