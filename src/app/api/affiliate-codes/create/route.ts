import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireWorkspaceAccess } from "@/lib/api-auth";
import { buildStripePromoCodeBase, stripePromoCodeCandidate } from "@/lib/stripe-promo-code";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function isCodeTakenError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string; raw?: { code?: string; message?: string } };
  const code = err.code || err.raw?.code || "";
  const message = `${err.message || ""} ${err.raw?.message || ""}`.toLowerCase();
  return (
    code === "resource_already_exists" ||
    message.includes("already exists") ||
    (message.includes("promotion code") && message.includes("taken"))
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const access = await requireWorkspaceAccess(request, body.userId);
  if ("error" in access) return access.error;
  const userId = access.workspaceId;

  const creatorRowId = String(body.creatorRowId || body.creatorId || "").trim();
  const campaignId = String(body.campaignId || "").trim();
  const percentOffRaw = Number(body.percentOff ?? 15);
  const percentOff = Number.isFinite(percentOffRaw) ? Math.min(100, Math.max(1, Math.round(percentOffRaw))) : 15;
  const requestedCode = String(body.code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (!creatorRowId || !campaignId) {
    return NextResponse.json(
      { ok: false, error: "Missing creatorRowId or campaignId" },
      { status: 400 },
    );
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeKey) {
    return NextResponse.json({ ok: false, error: "Stripe is not configured" }, { status: 500 });
  }

  const { data: connection } = await supabaseAdmin
    .from("stripe_connections")
    .select("stripe_account_id")
    .eq("user_id", userId)
    .is("disconnected_at", null)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const stripeAccountId = connection?.stripe_account_id as string | undefined;
  if (!stripeAccountId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Connect Stripe in Integrations first.",
        errorFr: "Connectez Stripe dans Intégrations d'abord.",
        code: "stripe_not_connected",
      },
      { status: 400 },
    );
  }

  const { data: campaign } = await supabaseAdmin
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!campaign) {
    return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 });
  }

  const { data: creator } = await supabaseAdmin
    .from("creators")
    .select("id, handle")
    .eq("id", creatorRowId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!creator) {
    return NextResponse.json({ ok: false, error: "Creator not found" }, { status: 404 });
  }

  const { data: link } = await supabaseAdmin
    .from("campaign_creators")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("creator_id", creatorRowId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!link) {
    return NextResponse.json(
      { ok: false, error: "Creator is not in this campaign" },
      { status: 400 },
    );
  }

  const { data: existing } = await supabaseAdmin
    .from("affiliate_promo_codes")
    .select("id, code, percent_off, stripe_promotion_code_id")
    .eq("user_id", userId)
    .eq("campaign_id", campaignId)
    .eq("creator_row_id", creatorRowId)
    .eq("stripe_account_id", stripeAccountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.code && !requestedCode) {
    return NextResponse.json({
      ok: true,
      code: existing.code,
      percentOff: Number(existing.percent_off) || percentOff,
      existing: true,
    });
  }

  const stripe = new Stripe(stripeKey);
  const baseCode = requestedCode || buildStripePromoCodeBase(String(creator.handle || ""), percentOff);

  let coupon: Stripe.Coupon;
  try {
    coupon = await stripe.coupons.create(
      {
        percent_off: percentOff,
        duration: "forever",
        name: `Trackit ${baseCode}`.slice(0, 40),
        metadata: {
          trackit_creator_row_id: creatorRowId,
          trackit_campaign_id: campaignId,
          trackit_user_id: userId,
        },
      },
      { stripeAccount: stripeAccountId },
    );
  } catch (error) {
    console.error("Stripe coupon create error:", error);
    return NextResponse.json({ ok: false, error: "Failed to create Stripe coupon" }, { status: 502 });
  }

  let promotionCode: Stripe.PromotionCode | null = null;
  let finalCode = baseCode;
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = stripePromoCodeCandidate(baseCode, attempt);
    try {
      promotionCode = await stripe.promotionCodes.create(
        {
          promotion: { type: "coupon", coupon: coupon.id },
          code: candidate,
          metadata: {
            trackit_creator_row_id: creatorRowId,
            trackit_campaign_id: campaignId,
            trackit_user_id: userId,
          },
        },
        { stripeAccount: stripeAccountId },
      );
      finalCode = candidate;
      break;
    } catch (error) {
      if (isCodeTakenError(error)) continue;
      console.error("Stripe promotion code create error:", error);
      return NextResponse.json(
        { ok: false, error: "Failed to create Stripe promotion code" },
        { status: 502 },
      );
    }
  }

  if (!promotionCode) {
    return NextResponse.json(
      { ok: false, error: "Could not find an available promo code" },
      { status: 409 },
    );
  }

  const { error: insertError } = await supabaseAdmin.from("affiliate_promo_codes").insert({
    user_id: userId,
    campaign_id: campaignId,
    creator_row_id: creatorRowId,
    stripe_account_id: stripeAccountId,
    stripe_coupon_id: coupon.id,
    stripe_promotion_code_id: promotionCode.id,
    code: finalCode,
    percent_off: percentOff,
  });

  if (insertError) {
    console.error("affiliate_promo_codes insert error:", insertError);
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    code: finalCode,
    percentOff,
    stripePromotionCodeId: promotionCode.id,
    stripeCouponId: coupon.id,
  });
}
