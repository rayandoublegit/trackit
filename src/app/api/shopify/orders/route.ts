import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  extractDiscountCodes,
  ingestShopifyOrder,
  resolveBrandUserIdFromShop,
} from "@/lib/shopify-order-ingest";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const order = JSON.parse(body) as Record<string, unknown>;
  const supabase = getSupabase();

  const shopDomain = request.headers.get("x-shopify-shop-domain") || "";
  const brandUserId = shopDomain ? await resolveBrandUserIdFromShop(supabase, shopDomain) : null;

  if (!brandUserId) {
    return NextResponse.json({ received: true, matched: false, reason: "unknown_shop" });
  }

  const codes = extractDiscountCodes(order);
  if (codes.length === 0) {
    return NextResponse.json({ received: true, matched: false });
  }

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
