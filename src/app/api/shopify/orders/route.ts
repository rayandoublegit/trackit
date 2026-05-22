import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function verifyShopifyWebhook(body: string, hmacHeader: string): boolean {
  const secret = process.env.SHOPIFY_CLIENT_SECRET || "";
  const hash = crypto.createHmac("sha256", secret).update(body).digest("base64");
  return hash === hmacHeader;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256") || "";
  
  if (!verifyShopifyWebhook(body, hmac)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const order = JSON.parse(body);
  const supabase = getSupabase();

  const discountCodes: string[] = order.discount_codes?.map((d: any) => d.code.toUpperCase()) || [];
  const orderAmount = parseFloat(order.total_price || "0");
  const shopDomain = request.headers.get("x-shopify-shop-domain") || "";

  if (discountCodes.length === 0) {
    return NextResponse.json({ received: true, matched: false });
  }

  for (const code of discountCodes) {
    const { data: creator } = await supabase
      .from("creators")
      .select("id, user_id, balance, total_earned, total_sales, commission_rate")
      .eq("discount_code", code)
      .maybeSingle();

    if (!creator) continue;

    const commissionRate = creator.commission_rate || 10;
    const commissionAmount = parseFloat(((orderAmount * commissionRate) / 100).toFixed(2));

    await supabase.from("sales").insert({
      creator_id: creator.id,
      user_id: creator.user_id,
      shopify_order_id: String(order.id),
      order_amount: orderAmount,
      commission_amount: commissionAmount,
      discount_code_used: code,
      shop_domain: shopDomain,
      status: "pending"
    });

    await supabase
      .from("creators")
      .update({
        balance: (creator.balance || 0) + commissionAmount,
        total_earned: (creator.total_earned || 0) + commissionAmount,
        total_sales: (creator.total_sales || 0) + 1
      })
      .eq("id", creator.id);

    console.log(`Sale attributed: ${code} → creator ${creator.id} → $${commissionAmount} commission`);
  }

  return NextResponse.json({ received: true });
}
