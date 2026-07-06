import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";
import {
  COMMISSION_NOT_CONFIGURED_CODE,
  commissionNotConfiguredMessage,
  resolveCommissionRateForManualSale,
} from "@/lib/managed-creator-commission";
import { endOfLocalDayIso, parseTzOffsetMinutes, toDayKey } from "@/lib/analytics-periods";

function resolveManualSaleCreatedAt(dateInput?: string, tzOffsetMinutes?: number): string {
  if (!dateInput?.trim()) return new Date().toISOString();
  const trimmed = dateInput.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const todayKey = toDayKey(new Date(), tzOffsetMinutes);
    if (trimmed === todayKey) return new Date().toISOString();
    return endOfLocalDayIso(trimmed, tzOffsetMinutes ?? 0);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function parseOrderAmount(raw: string): number {
  const normalized = String(raw || "").trim().replace(/\s/g, "").replace(/,/g, ".");
  return parseFloat(normalized);
}

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Manual sale entry — for brands without Shopify (SaaS, Starter plan, etc).
// Mirrors /api/shopify/sync: inserts into `sales` and credits the creator.
export async function POST(request: NextRequest) {
  const authedUserId = await getAuthedUserId(request);
  if (!authedUserId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const bodyUserId = String(body.userId || "");
  if (bodyUserId && bodyUserId !== authedUserId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const userId = authedUserId;
  const creatorId = String(body.creatorId || "");
  const campaignId = String(body.campaignId || "");
  const orderAmount = parseOrderAmount(String(body.amount || "0"));

  if (!userId) return NextResponse.json({ ok: false, error: "No userId" }, { status: 400 });
  if (!creatorId) return NextResponse.json({ ok: false, error: "No creatorId" }, { status: 400 });
  if (!orderAmount || !Number.isFinite(orderAmount) || orderAmount <= 0) {
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

  const managedCommission = await resolveCommissionRateForManualSale(
    supabaseAdmin,
    userId,
    creator,
    campaignId || null
  );
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
  const tzOffset = parseTzOffsetMinutes(body.tzOffset != null ? String(body.tzOffset) : null);

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
    created_at: resolveManualSaleCreatedAt(body.date ? String(body.date) : undefined, tzOffset),
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
