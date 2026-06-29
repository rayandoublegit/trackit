import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  COMMISSION_NOT_CONFIGURED_CODE,
  commissionNotConfiguredMessage,
  getManagedCommissionRateForCreator,
} from "@/lib/managed-creator-commission";

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
  const campaignId = String(body.campaignId || "");
  const orderAmount = parseFloat(String(body.amount || "0"));

  if (!userId) return NextResponse.json({ ok: false, error: "No userId" }, { status: 400 });
  if (!creatorId) return NextResponse.json({ ok: false, error: "No creatorId" }, { status: 400 });
  if (!orderAmount || orderAmount <= 0 || orderAmount > 1000000) {
    return NextResponse.json({ ok: false, error: "Invalid amount" }, { status: 400 });
  }

  // Creator must belong to this user (same ownership rule as the sync).
  const { data: creator } = await supabaseAdmin
    .from("creators")
    .select("id, user_id, handle, balance, total_earned, total_sales, commission_rate, discount_code")
    .eq("id", creatorId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!creator) return NextResponse.json({ ok: false, error: "Creator not found" }, { status: 404 });

  const managedCommission = await getManagedCommissionRateForCreator(supabaseAdmin, userId, creator);
  if ("error" in managedCommission) {
    return NextResponse.json(
      {
        ok: false,
        code: COMMISSION_NOT_CONFIGURED_CODE,
        error: commissionNotConfiguredMessage("en"),
        errorFr: commissionNotConfiguredMessage("fr"),
      },
      { status: 400 }
    );
  }

  // Resolve which campaign this sale belongs to.
  // Manual pick (campaignId) wins; otherwise auto-attach to the creator's campaign:
  // a single campaign -> that one; multiple -> active first, then most recent.
  let linkedCampaignId: string | null = null;
  let campaignDiscountCode: string | null = null;

  const { data: ccLinks } = await supabaseAdmin
    .from("campaign_creators")
    .select("campaign_id, discount_code, campaigns(status, created_at)")
    .eq("creator_id", creator.id)
    .eq("user_id", userId);

  const links = (ccLinks || []) as Array<{
    campaign_id: string;
    discount_code: string | null;
    campaigns: { status?: string | null; created_at?: string | null } | null;
  }>;

  let chosen: (typeof links)[number] | null = null;
  if (campaignId) {
    chosen = links.find((l) => String(l.campaign_id) === String(campaignId)) ?? null;
  } else if (links.length === 1) {
    chosen = links[0];
  } else if (links.length > 1) {
    const active = links
      .filter((l) => (l.campaigns?.status || "").toLowerCase() === "active")
      .sort((a, b) => (b.campaigns?.created_at || "").localeCompare(a.campaigns?.created_at || ""));
    const byRecency = [...links].sort((a, b) =>
      (b.campaigns?.created_at || "").localeCompare(a.campaigns?.created_at || "")
    );
    chosen = active[0] ?? byRecency[0] ?? null;
  }

  if (chosen) {
    linkedCampaignId = String(chosen.campaign_id);
    campaignDiscountCode = chosen.discount_code ? String(chosen.discount_code) : null;
  } else if (campaignId) {
    const { data: campaign } = await supabaseAdmin
      .from("campaigns")
      .select("id")
      .eq("id", campaignId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!campaign) {
      return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 });
    }

    linkedCampaignId = String(campaign.id);
  }

  const commissionRate = managedCommission.rate;
  const commissionAmount = parseFloat(((orderAmount * commissionRate) / 100).toFixed(2));

  const { error } = await supabaseAdmin.from("sales").insert({
    creator_id: creator.id,
    user_id: userId,
    shopify_order_id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    order_amount: orderAmount,
    commission_amount: commissionAmount,
    discount_code_used: campaignDiscountCode || creator.discount_code || "manual",
    campaign_id: linkedCampaignId,
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
