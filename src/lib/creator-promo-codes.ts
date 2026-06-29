import type { SupabaseClient } from "@supabase/supabase-js";
import { commissionRateFromDiscountCode } from "@/lib/creator-crm";
import {
  commissionRateFromDiscoverySnapshot,
  normalizeCreatorHandle,
} from "@/lib/managed-creator-commission";

export type ShopifyCreatorRow = {
  id: string;
  user_id: string;
  handle?: string | null;
  balance?: number;
  total_earned?: number;
  total_sales?: number;
  commission_rate?: number | null;
  discount_code?: string | null;
};

export function normalizeDiscountCode(code: string): string {
  return String(code || "").trim().toUpperCase().replace(/[\s_-]+/g, "");
}

function promoCodeFromSnapshot(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== "object") return "";
  const root = snapshot as Record<string, unknown>;
  const crm = root.crm;
  if (crm && typeof crm === "object") {
    const promo = (crm as Record<string, unknown>).promoCode;
    if (typeof promo === "string" && promo.trim()) return promo.trim().toUpperCase();
  }
  return "";
}

export function findCreatorForUsername(
  creators: ShopifyCreatorRow[],
  username: string
): ShopifyCreatorRow | undefined {
  const target = normalizeCreatorHandle(username);
  if (!target) return undefined;
  return creators.find((c) => normalizeCreatorHandle(c.handle || "") === target);
}

/** Ensures a creators row exists for attribution (Shopify sync, affiliates, Gérer). */
export async function ensureCreatorForHandle(
  admin: SupabaseClient,
  userId: string,
  handle: string,
  extras?: { platform?: string; full_name?: string }
): Promise<ShopifyCreatorRow | null> {
  const normalized = normalizeCreatorHandle(handle);
  if (!normalized) return null;

  const { data: existing } = await admin
    .from("creators")
    .select("id, user_id, handle, discount_code, commission_rate, balance, total_earned, total_sales")
    .eq("user_id", userId)
    .ilike("handle", normalized)
    .maybeSingle();

  if (existing?.id) return existing as ShopifyCreatorRow;

  const { data: created, error } = await admin
    .from("creators")
    .upsert(
      {
        user_id: userId,
        handle: normalized,
        full_name: extras?.full_name || normalized,
        platform: extras?.platform || "TikTok",
      },
      { onConflict: "user_id,handle" }
    )
    .select("id, user_id, handle, discount_code, commission_rate, balance, total_earned, total_sales")
    .single();

  if (error || !created) return null;
  return created as ShopifyCreatorRow;
}

export async function applyDiscountCodeToCreator(
  admin: SupabaseClient,
  userId: string,
  creatorId: string,
  code: string,
  commissionRate?: number | null
): Promise<boolean> {
  const normalized = normalizeDiscountCode(code);
  if (!normalized) return false;

  const patch: Record<string, unknown> = { discount_code: normalized };
  if (commissionRate != null && commissionRate > 0) {
    patch.commission_rate = commissionRate;
  } else {
    const fromCode = commissionRateFromDiscountCode(normalized);
    if (fromCode != null) patch.commission_rate = fromCode;
  }

  const { error } = await admin
    .from("creators")
    .update(patch)
    .eq("id", creatorId)
    .eq("user_id", userId);

  return !error;
}

/** Copies promo codes from Gérer (discovery_saved) onto creators.discount_code. */
export async function hydrateCreatorDiscountCodesFromCrm(
  admin: SupabaseClient,
  userId: string
): Promise<number> {
  const [{ data: savedRows }, { data: creatorRows }] = await Promise.all([
    admin.from("discovery_saved").select("creator_username, snapshot").eq("user_id", userId),
    admin
      .from("creators")
      .select("id, user_id, handle, discount_code, commission_rate, balance, total_earned, total_sales")
      .eq("user_id", userId),
  ]);

  const creators = (creatorRows || []) as ShopifyCreatorRow[];
  let hydrated = 0;

  for (const row of savedRows || []) {
    const promoCode = promoCodeFromSnapshot(row.snapshot);
    if (!promoCode) continue;

    const creator =
      findCreatorForUsername(creators, String(row.creator_username || "")) ??
      (await ensureCreatorForHandle(admin, userId, String(row.creator_username || "")));
    if (!creator) continue;
    if (!creators.some((c) => c.id === creator.id)) creators.push(creator);

    const current = normalizeDiscountCode(String(creator.discount_code || ""));
    const next = normalizeDiscountCode(promoCode);
    if (current === next) continue;

    const rate =
      commissionRateFromDiscoverySnapshot(row.snapshot) ??
      commissionRateFromDiscountCode(next) ??
      null;

    const ok = await applyDiscountCodeToCreator(admin, userId, creator.id, next, rate);
    if (ok) {
      creator.discount_code = next;
      if (rate != null) creator.commission_rate = rate;
      hydrated++;
    }
  }

  return hydrated;
}

/** Sync affiliate panel codes (handle + code pairs) onto creators. */
export async function syncAffiliateEntriesToCreators(
  admin: SupabaseClient,
  userId: string,
  entries: Array<{ handle: string; code: string }>
): Promise<number> {
  const { data: creatorRows } = await admin
    .from("creators")
    .select("id, user_id, handle, discount_code, commission_rate, balance, total_earned, total_sales")
    .eq("user_id", userId);

  const creators = (creatorRows || []) as ShopifyCreatorRow[];
  let synced = 0;

  for (const entry of entries) {
    const code = normalizeDiscountCode(entry.code);
    if (!code) continue;

    const creator =
      findCreatorForUsername(creators, entry.handle) ??
      (await ensureCreatorForHandle(admin, userId, entry.handle));
    if (!creator) continue;
    if (!creators.some((c) => c.id === creator.id)) creators.push(creator);

    const current = normalizeDiscountCode(String(creator.discount_code || ""));
    if (current === code) continue;

    const ok = await applyDiscountCodeToCreator(
      admin,
      userId,
      creator.id,
      code,
      commissionRateFromDiscountCode(code)
    );
    if (ok) {
      creator.discount_code = code;
      synced++;
    }
  }

  return synced;
}

/** Register discovery_saved promo codes in the in-memory discount map. */
export function mergeDiscoveryPromoCodesIntoMap(
  discountMap: Map<string, ShopifyCreatorRow>,
  savedRows: Array<{ creator_username?: string | null; snapshot?: unknown }>,
  creators: ShopifyCreatorRow[]
) {
  for (const row of savedRows) {
    const promoCode = promoCodeFromSnapshot(row.snapshot);
    if (!promoCode) continue;
    const creator = findCreatorForUsername(creators, String(row.creator_username || ""));
    if (!creator) continue;
    const key = normalizeDiscountCode(promoCode);
    if (key) discountMap.set(key, { ...creator, discount_code: promoCode });
  }
}
