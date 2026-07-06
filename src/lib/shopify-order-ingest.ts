import type { SupabaseClient } from "@supabase/supabase-js";
import { commissionRateFromDiscountCode, parseCommissionRate } from "@/lib/creator-crm";
import {
  loadManagedCommissionByHandle,
  normalizeCreatorHandle,
  resolveCommissionRateForShopifySale,
} from "@/lib/managed-creator-commission";
import {
  mergeDiscoveryPromoCodesIntoMap,
  normalizeDiscountCode,
  type ShopifyCreatorRow,
} from "@/lib/creator-promo-codes";

export type CampaignLinkRow = {
  campaign_id: string;
  campaigns: { status?: string | null; created_at?: string | null } | null;
};

export type { ShopifyCreatorRow } from "@/lib/creator-promo-codes";
export { normalizeDiscountCode } from "@/lib/creator-promo-codes";

export type ShopifySyncMaps = {
  discountMap: Map<string, ShopifyCreatorRow>;
  campaignCodeMap: Map<
    string,
    { creator_id: string; campaign_id: string; rate: number | null }
  >;
  linksByCreator: Map<string, CampaignLinkRow[]>;
  commissionByHandle: Map<string, number>;
};

export function normalizeShopDomain(shopDomain: string): string {
  return shopDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export function extractDiscountCodes(order: Record<string, unknown>): string[] {
  const codeSet = new Set<string>();

  const add = (raw: unknown) => {
    if (!raw) return;
    const normalized = normalizeDiscountCode(String(raw));
    if (normalized) codeSet.add(normalized);
  };

  for (const d of (order.discount_codes as Array<{ code?: string }> | undefined) || []) {
    add(d?.code);
  }

  for (const a of (order.discount_applications as Array<{ code?: string; title?: string; type?: string }> | undefined) || []) {
    add(a?.code);
    if (a?.type === "discount_code" || !a?.type) add(a?.title);
  }

  for (const item of (order.line_items as Array<Record<string, unknown>> | undefined) || []) {
    for (const alloc of (item.discount_allocations as Array<{ discount_application_index?: number }> | undefined) || []) {
      const idx = alloc.discount_application_index;
      if (idx == null) continue;
      const app = (order.discount_applications as Array<{ code?: string; title?: string }> | undefined)?.[idx];
      add(app?.code);
      add(app?.title);
    }
  }

  return Array.from(codeSet);
}

export function pickCampaignFromLinks(links: CampaignLinkRow[]): string | null {
  if (links.length === 0) return null;
  if (links.length === 1) return String(links[0].campaign_id);
  const active = links
    .filter((l) => (l.campaigns?.status || "").toLowerCase() === "active")
    .sort((a, b) => (b.campaigns?.created_at || "").localeCompare(a.campaigns?.created_at || ""));
  if (active[0]) return String(active[0].campaign_id);
  const byRecency = [...links].sort((a, b) =>
    (b.campaigns?.created_at || "").localeCompare(a.campaigns?.created_at || ""),
  );
  return String(byRecency[0].campaign_id);
}

export async function resolveBrandUserIdFromShop(
  admin: SupabaseClient,
  shopDomain: string
): Promise<string | null> {
  const shop = normalizeShopDomain(shopDomain);
  if (!shop) return null;

  const { data: store } = await admin
    .from("shopify_stores")
    .select("user_id")
    .eq("shop_domain", shop)
    .maybeSingle();
  if (store?.user_id) return String(store.user_id);

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("shopify_store", shop)
    .maybeSingle();
  return profile?.id ? String(profile.id) : null;
}

export async function resolveShopifyCredentials(
  admin: SupabaseClient,
  userId: string
): Promise<{ shop: string; accessToken: string } | null> {
  const { data: store } = await admin
    .from("shopify_stores")
    .select("shop_domain, access_token")
    .eq("user_id", userId)
    .maybeSingle();

  if (store?.shop_domain && store?.access_token) {
    return { shop: String(store.shop_domain), accessToken: String(store.access_token) };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("shopify_store, shopify_access_token")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.shopify_store && profile?.shopify_access_token) {
    return {
      shop: String(profile.shopify_store),
      accessToken: String(profile.shopify_access_token),
    };
  }

  return null;
}

function resolveCommissionRateFast(
  creator: ShopifyCreatorRow,
  commissionByHandle: Map<string, number>,
  campaignLinkRate: number | null | undefined,
  discountCode: string
): number | null {
  const handle = normalizeCreatorHandle(creator.handle || "");
  const crmRate = handle ? commissionByHandle.get(handle) : undefined;
  if (crmRate != null) return crmRate;

  const linkRate = parseCommissionRate(campaignLinkRate);
  if (linkRate != null) return linkRate;

  const creatorRate = parseCommissionRate(creator.commission_rate);
  if (creatorRate != null) return creatorRate;

  const fromCode = commissionRateFromDiscountCode(discountCode);
  if (fromCode != null) return fromCode;

  return null;
}

export async function buildShopifySyncMaps(
  admin: SupabaseClient,
  userId: string
): Promise<ShopifySyncMaps> {
  const commissionByHandle = await loadManagedCommissionByHandle(admin, userId);

  const [{ data: creators }, { data: savedRows }] = await Promise.all([
    admin
      .from("creators")
      .select("id, user_id, handle, discount_code, commission_rate, balance, total_earned, total_sales")
      .eq("user_id", userId),
    admin.from("discovery_saved").select("creator_username, snapshot").eq("user_id", userId),
  ]);

  const creatorRows = (creators || []) as ShopifyCreatorRow[];
  const discountMap = new Map<string, ShopifyCreatorRow>();
  for (const creator of creatorRows) {
    const code = normalizeDiscountCode(String(creator.discount_code || ""));
    if (code) discountMap.set(code, creator);
  }
  mergeDiscoveryPromoCodesIntoMap(discountMap, savedRows || [], creatorRows);

  const { data: campaignLinks } = await admin
    .from("campaign_creators")
    .select("creator_id, campaign_id, discount_code, commission_rate")
    .eq("user_id", userId);

  const campaignCodeMap = new Map<
    string,
    { creator_id: string; campaign_id: string; rate: number | null }
  >();
  for (const link of campaignLinks || []) {
    const code = normalizeDiscountCode(String(link.discount_code || ""));
    if (!code) continue;
    campaignCodeMap.set(code, {
      creator_id: String(link.creator_id),
      campaign_id: String(link.campaign_id),
      rate: link.commission_rate != null ? Number(link.commission_rate) : null,
    });
  }

  const { data: allCampaignLinks } = await admin
    .from("campaign_creators")
    .select("creator_id, campaign_id, campaigns(status, created_at)")
    .eq("user_id", userId);

  const linksByCreator = new Map<string, CampaignLinkRow[]>();
  for (const link of allCampaignLinks || []) {
    const creatorId = String(link.creator_id);
    const bucket = linksByCreator.get(creatorId) || [];
    bucket.push({
      campaign_id: String(link.campaign_id),
      campaigns: link.campaigns as CampaignLinkRow["campaigns"],
    });
    linksByCreator.set(creatorId, bucket);
  }

  return { discountMap, campaignCodeMap, linksByCreator, commissionByHandle };
}

type OrderMatch = {
  creator: ShopifyCreatorRow;
  linkedCampaignId: string | null;
  code: string;
  commissionRate: number;
};

async function findCreatorByDiscountCode(
  admin: SupabaseClient,
  userId: string,
  code: string,
  maps: ShopifySyncMaps
): Promise<ShopifyCreatorRow | null> {
  const normalized = normalizeDiscountCode(code);
  const cached = maps.discountMap.get(normalized);
  if (cached) return cached;

  const { data: rows } = await admin
    .from("creators")
    .select("id, user_id, handle, discount_code, commission_rate, balance, total_earned, total_sales")
    .eq("user_id", userId)
    .not("discount_code", "is", null);

  for (const row of rows || []) {
    if (normalizeDiscountCode(String(row.discount_code || "")) === normalized) {
      const creator = row as ShopifyCreatorRow;
      maps.discountMap.set(normalized, creator);
      return creator;
    }
  }
  return null;
}

async function matchOrderWithMaps(
  admin: SupabaseClient,
  userId: string,
  codes: string[],
  maps: ShopifySyncMaps
): Promise<{ match: OrderMatch | null; reason?: "no_match" | "no_commission" }> {
  for (const code of codes) {
    const campaignLink = maps.campaignCodeMap.get(code);
    if (!campaignLink) continue;

    const { data: creatorRow } = await admin
      .from("creators")
      .select("id, user_id, handle, balance, total_earned, total_sales, commission_rate, discount_code")
      .eq("id", campaignLink.creator_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!creatorRow) continue;

    const commissionRate = resolveCommissionRateFast(
      creatorRow as ShopifyCreatorRow,
      maps.commissionByHandle,
      campaignLink.rate,
      code
    );
    if (commissionRate == null) continue;

    return {
      match: {
        creator: creatorRow as ShopifyCreatorRow,
        linkedCampaignId: campaignLink.campaign_id,
        code,
        commissionRate,
      },
    };
  }

  for (const code of codes) {
    const creator = await findCreatorByDiscountCode(admin, userId, code, maps);
    if (!creator) continue;

    const commissionRate = resolveCommissionRateFast(
      creator,
      maps.commissionByHandle,
      null,
      code
    );
    if (commissionRate == null) continue;

    const linkedCampaignId = pickCampaignFromLinks(maps.linksByCreator.get(String(creator.id)) || []);
    return { match: { creator, linkedCampaignId, code, commissionRate } };
  }

  const hasCreatorCode = codes.some((code) => maps.discountMap.has(code));
  return { match: null, reason: hasCreatorCode ? "no_commission" : "no_match" };
}

async function matchOrderLive(
  admin: SupabaseClient,
  userId: string,
  codes: string[]
): Promise<{ match: OrderMatch | null; reason?: "no_match" | "no_commission" }> {
  const maps = await buildShopifySyncMaps(admin, userId);
  return matchOrderWithMaps(admin, userId, codes, maps);
}

export type IngestShopifyOrderResult = {
  matched: boolean;
  isNew: boolean;
  creatorId?: string;
  commissionAmount?: number;
  orderAmount?: number;
  skipReason?: "no_codes" | "no_match" | "no_commission" | "db_error" | "suppressed";
  error?: string;
};

export async function ingestShopifyOrder(
  admin: SupabaseClient,
  order: Record<string, unknown>,
  options: {
    userId: string;
    shopDomain: string;
    maps?: ShopifySyncMaps;
  }
): Promise<IngestShopifyOrderResult> {
  const codes = extractDiscountCodes(order);

  // Lot B: affiliate-link attribution. Our /l/[slug] redirect appends ?ref=slug,
  // which Shopify keeps in the order's landing_site (and sometimes note_attributes).
  const o = order as Record<string, unknown>;
  const refSlug = ((): string | null => {
    const ls = String(o.landing_site || "");
    const m = ls.match(/[?&]ref=([A-Za-z0-9_-]+)/);
    if (m) return m[1];
    const notes = (o.note_attributes as Array<{ name?: string; value?: string }> | undefined) || [];
    const n = notes.find((a) => (a.name || "").toLowerCase() === "ref");
    return n?.value || null;
  })();
  let refInfo: { slug: string; linkId: string; creatorUsername: string | null; campaignId: string | null } | null = null;
  if (refSlug) {
    const { data: al } = await admin
      .from("affiliate_links")
      .select("id, slug, creator_username, campaign_id")
      .eq("slug", refSlug)
      .maybeSingle();
    if (al) refInfo = { slug: al.slug, linkId: al.id, creatorUsername: al.creator_username, campaignId: al.campaign_id };
  }

  if (codes.length === 0 && !refInfo) return { matched: false, isNew: false, skipReason: "no_codes" };

  const matchRes = codes.length
    ? (options.maps
        ? await matchOrderWithMaps(admin, options.userId, codes, options.maps)
        : await matchOrderLive(admin, options.userId, codes))
    : { match: null, reason: "no_codes" as const };
  let match = matchRes.match;
  const reason = matchRes.reason as "no_match" | "no_commission" | "no_codes" | "db_error" | undefined;

  // Ref-only fallback: no promo code used, but the buyer came through a tracked link.
  if (!match && refInfo?.creatorUsername) {
    const { data: cr } = await admin
      .from("creators")
      .select("id, handle, commission_rate")
      .eq("user_id", options.userId)
      .ilike("handle", refInfo.creatorUsername)
      .maybeSingle();
    if (cr) {
      match = {
        creator: cr,
        commissionRate: parseCommissionRate((cr as { commission_rate?: string | number | null }).commission_rate) ?? 0,
        code: "ref:" + refInfo.slug,
        linkedCampaignId: refInfo.campaignId,
      } as unknown as typeof match;
    }
  }

  if (!match) {
    return { matched: false, isNew: false, skipReason: reason || "no_match" };
  }

  const orderAmount = parseFloat(String(order.total_price || "0"));
  const commissionAmount = parseFloat(((orderAmount * match.commissionRate) / 100).toFixed(2));
  const status = order.financial_status === "paid" ? "paid" : "pending";
  const shopDomain = normalizeShopDomain(options.shopDomain);
  const shopifyOrderId = String(order.id);

  const { data: suppressed } = await admin
    .from("sales_suppressions")
    .select("id")
    .eq("user_id", options.userId)
    .eq("shopify_order_id", shopifyOrderId)
    .maybeSingle();
  if (suppressed) {
    return { matched: false, isNew: false, skipReason: "suppressed" };
  }

  const { data: existing } = await admin
    .from("sales")
    .select("id")
    .eq("shopify_order_id", shopifyOrderId)
    .maybeSingle();
  const isNew = !existing;

  const saleRow = {
    creator_id: match.creator.id,
    user_id: options.userId,
    shopify_order_id: shopifyOrderId,
    order_amount: orderAmount,
    commission_amount: commissionAmount,
    discount_code_used: match.code,
    campaign_id: match.linkedCampaignId,
    shop_domain: shopDomain,
    affiliate_link_id: refInfo?.linkId ?? null,
    attributed_ref: refInfo?.slug ?? null,
    status,
    created_at: order.created_at || new Date().toISOString(),
  };

  if (refInfo) {
    await admin
      .from("link_clicks")
      .update({ converted: true })
      .eq("ref_code", refInfo.slug)
      .eq("converted", false)
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());
  }

  let dbError: string | undefined;
  if (isNew) {
    const { error } = await admin.from("sales").insert(saleRow);
    dbError = error?.message;
  } else {
    const { error } = await admin.from("sales").update(saleRow).eq("id", existing.id);
    dbError = error?.message;
  }

  if (dbError) {
    return { matched: false, isNew: false, skipReason: "db_error", error: dbError };
  }

  if (isNew) {
    const { data: freshCreator } = await admin
      .from("creators")
      .select("balance, total_earned, total_sales")
      .eq("id", match.creator.id)
      .maybeSingle();

    await admin
      .from("creators")
      .update({
        balance: Number(freshCreator?.balance || match.creator.balance || 0) + commissionAmount,
        total_earned: Number(freshCreator?.total_earned || match.creator.total_earned || 0) + commissionAmount,
        total_sales: Number(freshCreator?.total_sales || match.creator.total_sales || 0) + 1,
      })
      .eq("id", match.creator.id);

    if (options.maps) {
      const cached = options.maps.discountMap.get(match.code);
      if (cached) {
        cached.balance = Number(freshCreator?.balance || 0) + commissionAmount;
        cached.total_earned = Number(freshCreator?.total_earned || 0) + commissionAmount;
        cached.total_sales = Number(freshCreator?.total_sales || 0) + 1;
      }
    }
  }

  return {
    matched: true,
    isNew,
    creatorId: match.creator.id,
    commissionAmount,
    orderAmount,
  };
}

/** Fallback async resolver for webhook paths without preloaded maps. */
export async function resolveCommissionForMatchedCreator(
  admin: SupabaseClient,
  userId: string,
  creator: ShopifyCreatorRow,
  campaignLinkRate: number | null | undefined,
  discountCode: string
): Promise<number | null> {
  return resolveCommissionRateForShopifySale(
    admin,
    userId,
    creator,
    campaignLinkRate,
    discountCode
  );
}
