import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validShopifyHmac } from "@/lib/shopify-webhook";
import {
  ingestShopifyOrder,
  normalizeShopDomain,
  resolveBrandUserIdFromShop,
  resolveShopifyCredentials,
} from "@/lib/shopify-order-ingest";

export const dynamic = "force-dynamic";

/**
 * orders/create webhook. Nothing in the body is trusted unless Shopify signed
 * it with the app secret. Stores connected with a custom-app token (manual
 * connection) sign with a secret we don't hold: the order is then re-read from
 * Shopify with the store's own token, so a forged call can't create sales.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let order: Record<string, unknown>;
  try {
    order = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ received: false, error: "Invalid JSON" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ received: false, error: "Server misconfigured" }, { status: 500 });

  const shopDomain = normalizeShopDomain(request.headers.get("x-shopify-shop-domain") || "");
  const brandUserId = shopDomain ? await resolveBrandUserIdFromShop(supabase, shopDomain) : null;

  if (!brandUserId) {
    return NextResponse.json({ received: true, matched: false, reason: "unknown_shop" });
  }

  const signed = validShopifyHmac(rawBody, request.headers.get("x-shopify-hmac-sha256"), process.env.SHOPIFY_CLIENT_SECRET);
  if (!signed) {
    const orderId = String(order.id ?? "").replace(/\D/g, "");
    const creds = orderId ? await resolveShopifyCredentials(supabase, brandUserId) : null;
    if (!orderId || !creds || normalizeShopDomain(creds.shop) !== shopDomain) {
      return NextResponse.json({ received: false, error: "Unverified webhook" }, { status: 401 });
    }
    const res = await fetch(`https://${shopDomain}/admin/api/2024-01/orders/${orderId}.json`, {
      headers: { "X-Shopify-Access-Token": creds.accessToken },
      cache: "no-store",
    }).catch(() => null);
    const payload = res?.ok ? ((await res.json().catch(() => null)) as { order?: Record<string, unknown> } | null) : null;
    if (!payload?.order) {
      return NextResponse.json({ received: false, error: "Unverified webhook" }, { status: 401 });
    }
    order = payload.order;
  }

  // No early return on missing discount codes: the ingest also attributes
  // orders coming from tracked links (?ref= in landing_site) without any code.
  const result = await ingestShopifyOrder(supabase, order, {
    userId: brandUserId,
    shopDomain,
  });

  return NextResponse.json({
    received: true,
    matched: result.matched,
    isNew: result.isNew,
    creatorId: result.creatorId,
  });
}
