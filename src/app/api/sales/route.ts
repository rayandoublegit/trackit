import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function DELETE(request: NextRequest) {
  const authedUserId = await getAuthedUserId(request);
  if (!authedUserId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  }

  const { data: sale, error: fetchErr } = await supabaseAdmin
    .from("sales")
    .select("id, user_id, creator_id, order_amount, commission_amount, shopify_order_id, shop_domain")
    .eq("id", id)
    .eq("user_id", authedUserId)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  if (!sale) return NextResponse.json({ ok: false, error: "Sale not found" }, { status: 404 });

  const { data: creator } = await supabaseAdmin
    .from("creators")
    .select("id, balance, total_earned, total_sales")
    .eq("id", sale.creator_id)
    .eq("user_id", authedUserId)
    .maybeSingle();

  const shopifyOrderId = String(sale.shopify_order_id || "").trim();
  const isManualSale = sale.shop_domain === "manual" || shopifyOrderId.startsWith("manual_");
  if (shopifyOrderId && !isManualSale) {
    const { error: suppressErr } = await supabaseAdmin.from("sales_suppressions").upsert(
      { user_id: authedUserId, shopify_order_id: shopifyOrderId },
      { onConflict: "user_id,shopify_order_id" },
    );
    if (suppressErr) {
      console.error("sales suppression record failed:", suppressErr.message);
    }
  }

  const { error: deleteErr } = await supabaseAdmin.from("sales").delete().eq("id", id).eq("user_id", authedUserId);
  if (deleteErr) return NextResponse.json({ ok: false, error: deleteErr.message }, { status: 500 });

  if (creator) {
    const commission = Number(sale.commission_amount) || 0;
    await supabaseAdmin
      .from("creators")
      .update({
        balance: Math.max(0, Number(creator.balance || 0) - commission),
        total_earned: Math.max(0, Number(creator.total_earned || 0) - commission),
        total_sales: Math.max(0, Number(creator.total_sales || 0) - 1),
      })
      .eq("id", creator.id);
  }

  return NextResponse.json({ ok: true });
}
