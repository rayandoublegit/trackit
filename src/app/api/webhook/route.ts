import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { resolvePlanFromCheckout } from "@/lib/checkout";
import {
  clearSubscription,
  getSubscriptionIdFromInvoice,
  planFromSubscription,
  syncFromStripeSubscription,
  syncProfileSubscription,
  resolveUserId,
} from "@/lib/stripe-billing";

export const dynamic = "force-dynamic";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const supabaseAdmin =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
    : null;

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (!stripe || !supabaseAdmin) return;

  const userId =
    session.metadata?.userId ??
    session.client_reference_id ??
    null;

  const email =
    session.customer_email ??
    session.customer_details?.email ??
    null;

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  let plan = resolvePlanFromCheckout(null, session.metadata?.plan);
  let subscriptionStatus: "active" | "inactive" = "active";

  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (userId && !subscription.metadata?.userId) {
      await stripe.subscriptions.update(subscriptionId, {
        metadata: {
          ...subscription.metadata,
          userId: String(userId),
          plan: session.metadata?.plan ?? subscription.metadata?.plan ?? "",
        },
      });
    }
    await syncFromStripeSubscription(
      supabaseAdmin,
      stripe,
      subscription,
      userId
    );
    return;
  }

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    expand: ["data.price"],
  });
  const rawPrice = lineItems.data[0]?.price;
  const priceId =
    typeof rawPrice === "string" ? rawPrice : rawPrice?.id ?? null;
  plan = resolvePlanFromCheckout(priceId, session.metadata?.plan);

  if (session.mode !== "subscription") {
    subscriptionStatus = "active";
  }

  console.log("Webhook: checkout completed", {
    userId,
    priceId,
    plan,
    mode: session.mode,
  });

  if (!userId) {
    console.log("Webhook: checkout skipped — no userId");
    return;
  }

  const usernameBase = email?.split("@")[0]?.trim() || "founder";

  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!existing) {
    await supabaseAdmin.from("profiles").insert({
      id: userId,
      username: usernameBase,
      plan,
      subscription_status: subscriptionStatus,
      subscription_active: plan !== "free",
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
    });
    return;
  }

  await syncProfileSubscription(supabaseAdmin, userId, {
    plan,
    subscriptionStatus,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
  });
}

export async function POST(request: Request) {
  if (!stripe || !supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not set." },
      { status: 500 }
    );
  }

  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature header." },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  console.log("Webhook: event type", event.type);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncFromStripeSubscription(supabaseAdmin, stripe, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await clearSubscription(supabaseAdmin, stripe, subscription);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = getSubscriptionIdFromInvoice(invoice);
        if (subId) {
          const subscription = await stripe.subscriptions.retrieve(subId);
          await syncFromStripeSubscription(supabaseAdmin, stripe, subscription);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = getSubscriptionIdFromInvoice(invoice);
        if (!subId) break;
        const subscription = await stripe.subscriptions.retrieve(subId);
        const userId = await resolveUserId({
          supabase: supabaseAdmin,
          stripe,
          subscription,
        });
        if (!userId) break;
        const plan =
          subscription.status === "canceled"
            ? "free"
            : planFromSubscription(subscription);
        await syncProfileSubscription(supabaseAdmin, userId, {
          plan,
          subscriptionStatus: "past_due",
          stripeCustomerId:
            typeof subscription.customer === "string"
              ? subscription.customer
              : subscription.customer?.id,
          stripeSubscriptionId: subscription.id,
        });
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Webhook handler failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
