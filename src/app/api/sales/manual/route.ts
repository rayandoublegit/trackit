import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Manual sale entry — for brands without Shopify (SaaS, Starter plan, etc).
// Mirrors /api/shopify/sync: inserts into `sales` and credits the creator.
export async function POST(request: Request) {
  const body = await request.json();
  const userId = String(body.userId || "");
  const creatorId = String(body.creatorId || "");
  const orderAmount = parseFloat(String(body.amount || "0"));

  if (!userId) return NextResponse.json({ ok: false, error: "No userId" }, { status: 400 });
  if (!creatorId) return NextResponse.json({ ok: false, error: "No creatorId" }, { status: 400 });
  if (!orderAmount || orderAmount <= 0 || orderAmount > 1000000) {
    return NextResponse.json({ ok: false, error: "Invalid amount" }, { status: 400 });
  }

  // Creator must belong to this user (same ownership rule as the sync).
  const { data: creator } = await supabaseAdmin
    .from("creators")
    .select("id, user_id, balance, total_earned, total_sales, commission_rate, discount_code")
    .eq("id", creatorId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!creator) return NextResponse.json({ ok: false, error: "Creator not found" }, { status: 404 });

  const commissionRate = creator.commission_rate || 10;
  const commissionAmount = parseFloat(((orderAmount * commissionRate) / 100).toFixed(2));

  const { error } = await supabaseAdmin.from("sales").insert({
    creator_id: creator.id,
    user_id: userId,
    shopify_order_id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    order_amount: orderAmount,
    commission_amount: commissionAmount,
    discount_code_used: creator.discount_code || "manual",
    shop_domain: "manual",
    status: "paid",
    created_at: body.date ? new Date(body.date).toISOString() : new Date().toISOString(),
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await supabaseAdmin
    .from("creators")
    .update({
      balance: Number(creator.balance || 0) + commissionAmount,
      total_earned: Number(creator.total_earned || 0) + commissionAmount,
      total_sales: Number(creator.total_sales || 0) + 1,
    })
    .eq("id", creator.id);

  return NextResponse.json({ ok: true, orderAmount, commissionAmount, commissionRate });
}
