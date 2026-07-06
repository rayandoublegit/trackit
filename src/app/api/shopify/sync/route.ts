import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildShopifySyncMaps,
  extractDiscountCodes,
  ingestShopifyOrder,
  resolveShopifyCredentials,
} from "@/lib/shopify-order-ingest";
import { hydrateCreatorDiscountCodesFromCrm, syncAffiliateEntriesToCreators } from "@/lib/creator-promo-codes";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId || "");
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });

  const credentials = await resolveShopifyCredentials(supabaseAdmin, userId);
  if (!credentials) {
    return NextResponse.json({ error: "No Shopify store connected" }, { status: 400 });
  }

  const affiliateEntries = Array.isArray(body.entries) ? body.entries : [];
  if (affiliateEntries.length > 0) {
    const normalized = affiliateEntries
      .map((row: { handle?: string; creator?: string; code?: string }) => ({
        handle: String(row.handle || row.creator || ""),
        code: String(row.code || ""),
      }))
      .filter((row: { handle: string; code: string }) => row.handle && row.code);
    await syncAffiliateEntriesToCreators(supabaseAdmin, userId, normalized);
  }

  const hydratedFromCrm = await hydrateCreatorDiscountCodesFromCrm(supabaseAdmin, userId);
  const maps = await buildShopifySyncMaps(supabaseAdmin, userId);
  const registeredCodes = [
    ...maps.discountMap.keys(),
    ...maps.campaignCodeMap.keys(),
  ];

  if (registeredCodes.length === 0) {
    return NextResponse.json({
      synced: 0,
      created: 0,
      hydratedFromCrm,
      error: "no_creator_codes",
      message:
        hydratedFromCrm > 0
          ? "Codes CRM synchronisés, mais aucun créateur lié. Ajoutez vos créateurs aux campagnes ou définissez un code promo dans Gérer (colonne Code promo)."
          : "Aucun code promo trouvé. Définissez le code promo dans Gérer (Find it → Gérer) ou générez un lien d'affiliation pour chaque créateur.",
      messageEn:
        hydratedFromCrm > 0
          ? "CRM codes synced but no linked creators. Add creators to campaigns or set a promo code in Manage."
          : "No promo codes found. Set the promo code in Manage (Find it → Manage) or generate an affiliate link per creator.",
    });
  }

  const ordersRes = await fetch(
    `https://${credentials.shop}/admin/api/2024-01/orders.json?status=any&limit=250`,
    { headers: { "X-Shopify-Access-Token": credentials.accessToken } }
  );

  if (!ordersRes.ok) {
    const details = await ordersRes.text().catch(() => "");
    return NextResponse.json(
      {
        error: "shopify_api_failed",
        status: ordersRes.status,
        message:
          ordersRes.status === 401 || ordersRes.status === 403
            ? "Token Shopify invalide ou permission read_orders manquante."
            : "Impossible de récupérer les commandes Shopify.",
        details: details.slice(0, 500),
      },
      { status: 502 }
    );
  }

  const payload = (await ordersRes.json()) as { orders?: Record<string, unknown>[] };
  const orders = payload.orders;
  if (!orders) {
    return NextResponse.json({ error: "Failed to parse Shopify orders" }, { status: 500 });
  }

  let synced = 0;
  let created = 0;
  let ordersWithCodes = 0;
  const skipped = {
    no_codes: 0,
    no_match: 0,
    no_commission: 0,
    db_error: 0,
    suppressed: 0,
  };
  const dbErrors: string[] = [];

  for (const order of orders) {
    const codes = extractDiscountCodes(order);
    if (codes.length > 0) ordersWithCodes++;

    const result = await ingestShopifyOrder(supabaseAdmin, order, {
      userId,
      shopDomain: credentials.shop,
      maps,
    });

    if (result.matched) {
      synced++;
      if (result.isNew) created++;
    } else if (result.skipReason) {
      skipped[result.skipReason]++;
      if (result.skipReason === "db_error" && result.error) {
        dbErrors.push(result.error);
      }
    }
  }

  return NextResponse.json({
    synced,
    created,
    orders: orders.length,
    ordersWithCodes,
    registeredCodes,
    hydratedFromCrm,
    skipped,
    dbErrors: dbErrors.slice(0, 5),
    ok: true,
  });
}
