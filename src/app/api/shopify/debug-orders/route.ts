import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const { userId } = await request.json();
  if (!userId) return NextResponse.json({ error: "No userId" }, { status: 400 });

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("shopify_store, shopify_access_token")
    .eq("id", userId)
    .single();
  if (!profile?.shopify_store || !profile?.shopify_access_token) {
    return NextResponse.json({ error: "No store" }, { status: 400 });
  }

  const { data: creators } = await supabaseAdmin
    .from("creators")
    .select("id, discount_code, commission_rate")
    .eq("user_id", userId)
    .not("discount_code", "is", null);

  const discountMap = new Map(
    (creators || []).map((c: any) => [c.discount_code?.toUpperCase(), c])
  );

  const ordersRes = await fetch(
    `https://${profile.shopify_store}/admin/api/2024-01/orders.json?status=any&limit=10`,
    { headers: { "X-Shopify-Access-Token": profile.shopify_access_token } }
  );
  const { orders } = await ordersRes.json();

  const trace: any[] = [];
  for (const order of orders || []) {
    const codes: string[] = (order.discount_codes || []).map((d: any) => String(d.code).toUpperCase());
    for (const code of codes) {
      const creator: any = discountMap.get(code);
      if (!creator) { trace.push({ code, matched: false }); continue; }

      const orderAmount = parseFloat(order.total_price || "0");
      const commissionRate = creator.commission_rate || 10;
      const commissionAmount = parseFloat(((orderAmount * commissionRate) / 100).toFixed(2));

      const row = {
        creator_id: creator.id,
        user_id: userId,
        shopify_order_id: String(order.id),
        order_amount: orderAmount,
        commission_amount: commissionAmount,
        discount_code_used: code,
        campaign_id: null,
        shop_domain: profile.shopify_store,
        status: order.financial_status === "paid" ? "paid" : "pending",
        created_at: order.created_at,
      };

      const { error } = await supabaseAdmin
        .from("sales")
        .upsert(row, { onConflict: "shopify_order_id" });

      trace.push({ code, matched: true, upsertError: error ? error.message : null, row });
    }
  }

  return NextResponse.json({ discountMapKeys: Array.from(discountMap.keys()), trace });
}
