import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { resolveCommissionRateForManualSale } from "@/lib/managed-creator-commission";
import { parseTrackitClientReferenceId } from "@/lib/stripe-promo-code";

const LOOKBACK_SECONDS = 25 * 60 * 60;

export type StripeSalesSyncReport = {
  accounts: number;
  sessionsScanned: number;
  salesInserted: number;
  recurringInserted: number;
  skippedNoAttribution: number;
};

type PromoRow = {
  code: string;
  stripe_promotion_code_id: string;
  creator_row_id: string | null;
  campaign_id: string | null;
};

type Attribution = {
  creatorRowId: string;
  campaignId: string | null;
  attributedVia: "promo_code" | "client_reference_id";
  discountCode: string | null;
};

function createdGte(): number {
  return Math.floor(Date.now() / 1000) - LOOKBACK_SECONDS;
}

function uniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "23505" || `${error.message || ""}`.toLowerCase().includes("duplicate");
}

function sessionPaid(session: Stripe.Checkout.Session): boolean {
  return session.status === "complete" && (session.payment_status === "paid" || session.payment_status === "no_payment_required");
}

function extractPromotionRefs(session: Stripe.Checkout.Session): { ids: string[]; codes: string[] } {
  const ids: string[] = [];
  const codes: string[] = [];

  const discounts = (session.discounts || []) as Array<{
    promotion_code?: string | Stripe.PromotionCode | null;
    coupon?: string | Stripe.Coupon | null;
  }>;

  for (const discount of discounts) {
    const promo = discount.promotion_code;
    if (!promo) continue;
    if (typeof promo === "string") {
      ids.push(promo);
    } else {
      if (promo.id) ids.push(promo.id);
      if (promo.code) codes.push(promo.code.toUpperCase());
    }
  }

  const breakdown = session.total_details?.breakdown as
    | {
        discounts?: Array<{
          discount?: {
            promotion_code?: string | Stripe.PromotionCode | null;
          } | null;
        }>;
      }
    | undefined;

  for (const entry of breakdown?.discounts || []) {
    const promo = entry.discount?.promotion_code;
    if (!promo) continue;
    if (typeof promo === "string") {
      ids.push(promo);
    } else {
      if (promo.id) ids.push(promo.id);
      if (promo.code) codes.push(promo.code.toUpperCase());
    }
  }

  return { ids, codes };
}

function resolveAttribution(
  session: Stripe.Checkout.Session,
  promosById: Map<string, PromoRow>,
  promosByCode: Map<string, PromoRow>,
): Attribution | null {
  const { ids, codes } = extractPromotionRefs(session);
  for (const id of ids) {
    const row = promosById.get(id);
    if (row?.creator_row_id) {
      return {
        creatorRowId: row.creator_row_id,
        campaignId: row.campaign_id,
        attributedVia: "promo_code",
        discountCode: row.code,
      };
    }
  }
  for (const code of codes) {
    const row = promosByCode.get(code.toUpperCase());
    if (row?.creator_row_id) {
      return {
        creatorRowId: row.creator_row_id,
        campaignId: row.campaign_id,
        attributedVia: "promo_code",
        discountCode: row.code,
      };
    }
  }

  const creatorFromRef = parseTrackitClientReferenceId(session.client_reference_id);
  if (creatorFromRef) {
    return {
      creatorRowId: creatorFromRef,
      campaignId: null,
      attributedVia: "client_reference_id",
      discountCode: null,
    };
  }

  return null;
}

async function resolveStripeInvoiceId(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  stripeAccount: string,
): Promise<string> {
  const direct =
    typeof session.invoice === "string"
      ? session.invoice
      : session.invoice && typeof session.invoice === "object"
        ? session.invoice.id
        : null;
  if (direct) return direct;

  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription && typeof session.subscription === "object"
        ? session.subscription.id
        : null;

  if (subId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subId, {}, { stripeAccount });
      const latest =
        typeof sub.latest_invoice === "string"
          ? sub.latest_invoice
          : sub.latest_invoice && typeof sub.latest_invoice === "object"
            ? sub.latest_invoice.id
            : null;
      if (latest) return latest;
    } catch (error) {
      console.error("stripe-sales-sync: subscription retrieve failed", subId, error);
    }
  }

  return session.id;
}

async function insertSaleIdempotent(
  admin: SupabaseClient,
  row: Record<string, unknown>,
): Promise<"inserted" | "exists" | "error"> {
  const invoiceId = String(row.stripe_invoice_id || "");
  if (!invoiceId) return "error";

  const { data: existing } = await admin
    .from("sales")
    .select("id")
    .eq("stripe_invoice_id", invoiceId)
    .maybeSingle();
  if (existing) return "exists";

  const { error } = await admin.from("sales").insert(row);
  if (!error) return "inserted";
  if (uniqueViolation(error)) return "exists";
  console.error("stripe-sales-sync: sales insert error", error);
  return "error";
}

async function creditCreator(
  admin: SupabaseClient,
  creatorId: string,
  commissionAmount: number,
): Promise<void> {
  const { data: creator } = await admin
    .from("creators")
    .select("balance, total_earned, total_sales")
    .eq("id", creatorId)
    .maybeSingle();
  if (!creator) return;

  await admin
    .from("creators")
    .update({
      balance: Number(creator.balance || 0) + commissionAmount,
      total_earned: Number(creator.total_earned || 0) + commissionAmount,
      total_sales: Number(creator.total_sales || 0) + 1,
    })
    .eq("id", creatorId);
}

async function buildSaleRow(
  admin: SupabaseClient,
  params: {
    userId: string;
    creatorRowId: string;
    campaignId: string | null;
    orderAmount: number;
    discountCode: string | null;
    stripeInvoiceId: string;
    isRecurring: boolean;
    createdAt: number | null | undefined;
  },
): Promise<Record<string, unknown> | null> {
  const { data: creator } = await admin
    .from("creators")
    .select("id, user_id, handle, commission_rate, discount_code")
    .eq("id", params.creatorRowId)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (!creator) return null;

  let campaignId = params.campaignId;
  if (!campaignId) {
    const { data: links } = await admin
      .from("campaign_creators")
      .select("campaign_id, campaigns(status, created_at)")
      .eq("creator_id", creator.id)
      .eq("user_id", params.userId);
    const typed = (links || []) as Array<{
      campaign_id: string;
      campaigns: { status?: string | null; created_at?: string | null } | null;
    }>;
    if (typed.length === 1) {
      campaignId = typed[0].campaign_id;
    } else if (typed.length > 1) {
      const active = typed
        .filter((l) => (l.campaigns?.status || "").toLowerCase() === "active")
        .sort((a, b) => (b.campaigns?.created_at || "").localeCompare(a.campaigns?.created_at || ""));
      campaignId = (active[0] ?? typed[0])?.campaign_id ?? null;
    }
  }

  const managed = await resolveCommissionRateForManualSale(
    admin,
    params.userId,
    creator,
    campaignId,
  );
  const commissionRate = "error" in managed ? 0 : managed.rate;
  const commissionAmount = parseFloat(((params.orderAmount * commissionRate) / 100).toFixed(2));

  return {
    creator_id: creator.id,
    user_id: params.userId,
    order_amount: params.orderAmount,
    commission_amount: commissionAmount,
    discount_code_used: params.discountCode || creator.discount_code || "stripe",
    campaign_id: campaignId,
    shop_domain: "stripe",
    shopify_order_id: `stripe_${params.stripeInvoiceId}`,
    status: "paid",
    source: "stripe",
    stripe_invoice_id: params.stripeInvoiceId,
    is_recurring: params.isRecurring,
    created_at: params.createdAt
      ? new Date(params.createdAt * 1000).toISOString()
      : new Date().toISOString(),
  };
}

async function upsertAttributedSubscription(
  admin: SupabaseClient,
  params: {
    userId: string;
    stripeAccountId: string;
    subscriptionId: string;
    customerId: string | null;
    creatorRowId: string;
    campaignId: string | null;
    attributedVia: string;
    firstInvoiceAt: string | null;
  },
): Promise<void> {
  const { error } = await admin.from("attributed_subscriptions").upsert(
    {
      user_id: params.userId,
      stripe_account_id: params.stripeAccountId,
      stripe_subscription_id: params.subscriptionId,
      stripe_customer_id: params.customerId,
      creator_row_id: params.creatorRowId,
      campaign_id: params.campaignId,
      attributed_via: params.attributedVia,
      first_invoice_at: params.firstInvoiceAt,
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (error) {
    console.error("stripe-sales-sync: attributed_subscriptions upsert error", error);
  }
}

async function syncAccount(
  admin: SupabaseClient,
  stripe: Stripe,
  connection: { user_id: string; stripe_account_id: string },
  report: StripeSalesSyncReport,
): Promise<void> {
  const userId = connection.user_id;
  const stripeAccount = connection.stripe_account_id;

  const { data: promoRows } = await admin
    .from("affiliate_promo_codes")
    .select("code, stripe_promotion_code_id, creator_row_id, campaign_id")
    .eq("user_id", userId)
    .eq("stripe_account_id", stripeAccount);

  const promosById = new Map<string, PromoRow>();
  const promosByCode = new Map<string, PromoRow>();
  for (const row of (promoRows || []) as PromoRow[]) {
    if (row.stripe_promotion_code_id) promosById.set(row.stripe_promotion_code_id, row);
    if (row.code) promosByCode.set(row.code.toUpperCase(), row);
  }

  let sessions: Stripe.Response<Stripe.ApiList<Stripe.Checkout.Session>>;
  try {
    sessions = await stripe.checkout.sessions.list(
      {
        limit: 100,
        created: { gte: createdGte() },
        status: "complete",
        expand: ["data.discounts.promotion_code"],
      },
      { stripeAccount },
    );
  } catch (error) {
    console.error("stripe-sales-sync: sessions.list expand failed, retrying plain", error);
    sessions = await stripe.checkout.sessions.list(
      {
        limit: 100,
        created: { gte: createdGte() },
        status: "complete",
      },
      { stripeAccount },
    );
  }

  for (const session of sessions.data) {
    report.sessionsScanned += 1;
    if (!sessionPaid(session)) continue;

    const attribution = resolveAttribution(session, promosById, promosByCode);
    if (!attribution) {
      report.skippedNoAttribution += 1;
      continue;
    }

    const amountTotal = typeof session.amount_total === "number" ? session.amount_total : 0;
    const orderAmount = parseFloat((amountTotal / 100).toFixed(2));

    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription && typeof session.subscription === "object"
          ? session.subscription.id
          : null;

    let resolvedCampaignId = attribution.campaignId;

    if (orderAmount > 0) {
      const stripeInvoiceId = await resolveStripeInvoiceId(stripe, session, stripeAccount);
      const saleRow = await buildSaleRow(admin, {
        userId,
        creatorRowId: attribution.creatorRowId,
        campaignId: attribution.campaignId,
        orderAmount,
        discountCode: attribution.discountCode,
        stripeInvoiceId,
        isRecurring: false,
        createdAt: session.created,
      });
      if (!saleRow) {
        report.skippedNoAttribution += 1;
      } else {
        resolvedCampaignId = (saleRow.campaign_id as string | null) ?? attribution.campaignId;
        const result = await insertSaleIdempotent(admin, saleRow);
        if (result === "inserted") {
          report.salesInserted += 1;
          await creditCreator(admin, attribution.creatorRowId, Number(saleRow.commission_amount) || 0);
        }
      }
    }

    if (subscriptionId) {
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer && typeof session.customer === "object"
            ? session.customer.id
            : null;
      await upsertAttributedSubscription(admin, {
        userId,
        stripeAccountId: stripeAccount,
        subscriptionId,
        customerId,
        creatorRowId: attribution.creatorRowId,
        campaignId: resolvedCampaignId,
        attributedVia: attribution.attributedVia,
        firstInvoiceAt: session.created
          ? new Date(session.created * 1000).toISOString()
          : new Date().toISOString(),
      });
    }
  }

  const { data: attributedSubs } = await admin
    .from("attributed_subscriptions")
    .select(
      "stripe_subscription_id, creator_row_id, campaign_id, attributed_via, first_invoice_at",
    )
    .eq("user_id", userId)
    .eq("stripe_account_id", stripeAccount)
    .is("canceled_at", null);

  const subMap = new Map(
    (attributedSubs || []).map((row) => [String(row.stripe_subscription_id), row]),
  );
  if (subMap.size === 0) return;

  const invoices = await stripe.invoices.list(
    {
      limit: 100,
      created: { gte: createdGte() },
      status: "paid",
    },
    { stripeAccount },
  );

  for (const invoice of invoices.data) {
    const subDetails = invoice.parent?.subscription_details?.subscription;
    const subscriptionId =
      typeof subDetails === "string"
        ? subDetails
        : subDetails && typeof subDetails === "object"
          ? subDetails.id
          : null;
    if (!subscriptionId) continue;

    const attributed = subMap.get(subscriptionId);
    if (!attributed?.creator_row_id) continue;

    const amountPaid = typeof invoice.amount_paid === "number" ? invoice.amount_paid : 0;
    const orderAmount = parseFloat((amountPaid / 100).toFixed(2));
    if (!(orderAmount > 0)) continue;

    const isFirst =
      invoice.billing_reason === "subscription_create" ||
      (!invoice.billing_reason &&
        attributed.first_invoice_at &&
        invoice.created &&
        Math.abs(new Date(attributed.first_invoice_at).getTime() / 1000 - invoice.created) < 120);
    const isRecurring = !isFirst;

    const saleRow = await buildSaleRow(admin, {
      userId,
      creatorRowId: String(attributed.creator_row_id),
      campaignId: attributed.campaign_id ? String(attributed.campaign_id) : null,
      orderAmount,
      discountCode: null,
      stripeInvoiceId: invoice.id,
      isRecurring,
      createdAt: invoice.created,
    });
    if (!saleRow) continue;

    const result = await insertSaleIdempotent(admin, saleRow);
    if (result === "inserted") {
      if (isRecurring) report.recurringInserted += 1;
      else report.salesInserted += 1;
      await creditCreator(admin, String(attributed.creator_row_id), Number(saleRow.commission_amount) || 0);
    }
  }
}

export async function runStripeSalesSync(admin: SupabaseClient): Promise<StripeSalesSyncReport> {
  const report: StripeSalesSyncReport = {
    accounts: 0,
    sessionsScanned: 0,
    salesInserted: 0,
    recurringInserted: 0,
    skippedNoAttribution: 0,
  };

  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeKey) {
    throw new Error("STRIPE_SECRET_KEY missing");
  }

  const stripe = new Stripe(stripeKey);

  const { data: connections, error } = await admin
    .from("stripe_connections")
    .select("user_id, stripe_account_id")
    .is("disconnected_at", null);

  if (error) throw error;

  for (const connection of connections || []) {
    if (!connection.user_id || !connection.stripe_account_id) continue;
    report.accounts += 1;
    try {
      await syncAccount(
        admin,
        stripe,
        {
          user_id: String(connection.user_id),
          stripe_account_id: String(connection.stripe_account_id),
        },
        report,
      );
    } catch (err) {
      console.error(
        "stripe-sales-sync: account failed",
        connection.stripe_account_id,
        err,
      );
    }
  }

  return report;
}
