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
    return NextResponse.json({ error: "No Shopify store connected" }, { status: 400 });
  }

  const ordersRes = await fetch(
    `https://${profile.shopify_store}/admin/api/2024-01/orders.json?status=any&limit=10`,
    { headers: { "X-Shopify-Access-Token": profile.shopify_access_token } }
  );
  const json = await ordersRes.json();
  const orders = json.orders || [];

  const summary = orders.map((o: any) => ({
    id: o.id,
    name: o.name,
    total_price: o.total_price,
    financial_status: o.financial_status,
    discount_codes: o.discount_codes,
    discount_applications: o.discount_applications,
  }));

  return NextResponse.json({ count: orders.length, http: ordersRes.status, orders: summary });
}
