import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type CampaignLinkRow = {
  campaign_id: string;
  campaigns: { status?: string | null; created_at?: string | null } | null;
};

function pickCampaignFromLinks(links: CampaignLinkRow[]): string | null {
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

export async function POST(request: NextRequest) {
  const body = await request.text();
  const order = JSON.parse(body);
  const supabase = getSupabase();

  // Lecture du code a tous les endroits possibles (commande normale + draft order).
  const codeSet = new Set<string>();
  for (const d of (order.discount_codes || [])) {
    if (d?.code) codeSet.add(String(d.code).toUpperCase());
  }
  for (const a of (order.discount_applications || [])) {
    if (a?.code) codeSet.add(String(a.code).toUpperCase());
    if (a?.title) codeSet.add(String(a.title).toUpperCase());
  }
  const discountCodes = Array.from(codeSet);

  const orderAmount = parseFloat(order.total_price || "0");
  const shopDomain = request.headers.get("x-shopify-shop-domain") || "";
  const status = order.financial_status === "paid" ? "paid" : "pending";

  if (discountCodes.length === 0) {
    return NextResponse.json({ received: true, matched: false });
  }

  for (const code of discountCodes) {
    const { data: campaignLink } = await supabase
      .from("campaign_creators")
      .select("creator_id, campaign_id, commission_rate")
      .eq("discount_code", code)
      .maybeSingle();

    let creator: {
      id: string;
      user_id: string;
      balance?: number;
      total_earned?: number;
      total_sales?: number;
      commission_rate?: number;
    } | null = null;
    let linkedCampaignId: string | null = null;
    let commissionRate = 10;

    if (campaignLink) {
      const { data: cRow } = await supabase
        .from("creators")
        .select("id, user_id, balance, total_earned, total_sales, commission_rate")
        .eq("id", campaignLink.creator_id)
        .maybeSingle();
      if (cRow) {
        creator = cRow;
        linkedCampaignId = String(campaignLink.campaign_id);
        commissionRate = Number(campaignLink.commission_rate ?? cRow.commission_rate ?? 10);
      }
    }

    if (!creator) {
      const { data: cRow } = await supabase
        .from("creators")
        .select("id, user_id, balance, total_earned, total_sales, commission_rate")
        .eq("discount_code", code)
        .maybeSingle();
      if (!cRow) continue;
      creator = cRow;
      commissionRate = Number(cRow.commission_rate ?? 10);

      const { data: ccLinks } = await supabase
        .from("campaign_creators")
        .select("campaign_id, campaigns(status, created_at)")
        .eq("creator_id", cRow.id)
        .eq("user_id", cRow.user_id);

      linkedCampaignId = pickCampaignFromLinks((ccLinks || []) as CampaignLinkRow[]);
    }

    const commissionAmount = parseFloat(((orderAmount * commissionRate) / 100).toFixed(2));

    // Anti-double-comptage : ne crediter le balance que si la vente est nouvelle.
    const { data: existing } = await supabase
      .from("sales")
      .select("id")
      .eq("shopify_order_id", String(order.id))
      .maybeSingle();
    const isNew = !existing;

    await supabase.from("sales").upsert({
      creator_id: creator.id,
      user_id: creator.user_id,
      shopify_order_id: String(order.id),
      order_amount: orderAmount,
      commission_amount: commissionAmount,
      discount_code_used: code,
      campaign_id: linkedCampaignId,
      shop_domain: shopDomain,
      status,
      created_at: order.created_at,
    }, { onConflict: "shopify_order_id" });

    if (isNew) {
      await supabase
        .from("creators")
        .update({
          balance: (creator.balance || 0) + commissionAmount,
          total_earned: (creator.total_earned || 0) + commissionAmount,
          total_sales: (creator.total_sales || 0) + 1,
        })
        .eq("id", creator.id);
    }
  }

  return NextResponse.json({ received: true });
}
