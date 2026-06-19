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

  // Get user's shopify store
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("shopify_store, shopify_access_token")
    .eq("id", userId)
    .single();

  if (!profile?.shopify_store || !profile?.shopify_access_token) {
    return NextResponse.json({ error: "No Shopify store connected" }, { status: 400 });
  }

  // Get creators with discount codes for this user
  const { data: creators } = await supabaseAdmin
    .from("creators")
    .select("id, discount_code, commission_rate")
    .eq("user_id", userId)
    .not("discount_code", "is", null);

  const discountMap = new Map(
    (creators || []).map(c => [c.discount_code?.toUpperCase(), c])
  );

  // Campaign-specific codes (one per creator+campaign). A matched campaign code
  // tags the sale with campaign_id and applies the link's rate.
  const { data: campaignLinks } = await supabaseAdmin
    .from("campaign_creators")
    .select("creator_id, campaign_id, discount_code, commission_rate")
    .eq("user_id", userId)
    .not("discount_code", "is", null);

  const campaignCodeMap = new Map(
    (campaignLinks || []).map(l => [
      l.discount_code?.toUpperCase(),
      { creator_id: l.creator_id, campaign_id: l.campaign_id, rate: l.commission_rate },
    ])
  );

  if (discountMap.size === 0 && campaignCodeMap.size === 0) {
    return NextResponse.json({ synced: 0, message: "No creators with discount codes" });
  }

  // Pull last 250 orders from Shopify
  const ordersRes = await fetch(
    `https://${profile.shopify_store}/admin/api/2024-01/orders.json?status=any&limit=250`,
    { headers: { "X-Shopify-Access-Token": profile.shopify_access_token } }
  );
  const { orders } = await ordersRes.json();
  if (!orders) return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });

  let synced = 0;
  for (const order of orders) {
    const codes: string[] = order.discount_codes?.map((d: any) => d.code.toUpperCase()) || [];
    for (const code of codes) {
      // Campaign code wins; else fall back to the creator's own code.
      const campaignLink = campaignCodeMap.get(code);
      const creator = campaignLink
        ? { id: campaignLink.creator_id, commission_rate: campaignLink.rate }
        : discountMap.get(code);
      if (!creator) continue;
      const linkedCampaignId = campaignLink ? campaignLink.campaign_id : null;

      const orderAmount = parseFloat(order.total_price || "0");
      const commissionRate = creator.commission_rate || 10;
      const commissionAmount = parseFloat(((orderAmount * commissionRate) / 100).toFixed(2));

      // Check if this order was already recorded (avoid double-counting balance)
      const { data: existing } = await supabaseAdmin
        .from("sales")
        .select("id")
        .eq("shopify_order_id", String(order.id))
        .maybeSingle();
      const isNew = !existing;

      // Upsert to avoid duplicate rows
      const { error } = await supabaseAdmin.from("sales").upsert({
        creator_id: creator.id,
        user_id: userId,
        shopify_order_id: String(order.id),
        order_amount: orderAmount,
        commission_amount: commissionAmount,
        discount_code_used: code,
        campaign_id: linkedCampaignId,
        shop_domain: profile.shopify_store,
        status: order.financial_status === "paid" ? "paid" : "pending",
        created_at: order.created_at,
      }, { onConflict: "shopify_order_id" });

      if (!error) {
        synced++;
        // Only credit the creator's balance for genuinely new sales
        if (isNew) {
          const { data: cRow } = await supabaseAdmin
            .from("creators")
            .select("balance, total_earned, total_sales")
            .eq("id", creator.id)
            .single();
          await supabaseAdmin
            .from("creators")
            .update({
              balance: Number(cRow?.balance || 0) + commissionAmount,
              total_earned: Number(cRow?.total_earned || 0) + commissionAmount,
              total_sales: Number(cRow?.total_sales || 0) + 1,
            })
            .eq("id", creator.id);
        }
      }
    }
  }

  // Also register webhook if not done yet
  await fetch(
    `https://${profile.shopify_store}/admin/api/2024-01/webhooks.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": profile.shopify_access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        webhook: {
          topic: "orders/create",
          address: `${process.env.NEXT_PUBLIC_APP_URL}/api/shopify/orders`,
          format: "json",
        },
      }),
    }
  );

  return NextResponse.json({ synced, orders: orders.length });
}
