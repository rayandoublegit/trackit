import Stripe from "stripe";
import { NextResponse } from "next/server";
import { resolvePlanFromCheckout } from "@/lib/checkout";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveStripeCustomerId } from "@/lib/stripe-billing";

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export async function POST(request: Request) {
  try {
    console.log("Checkout: starting");

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    console.log("Checkout: stripe key exists?", !!stripeKey);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    console.log("Checkout: NEXT_PUBLIC_APP_URL set?", !!appUrl, appUrl ?? "(missing)");

    if (!stripeKey) {
      return NextResponse.json({ error: "Missing Stripe key" }, { status: 500 });
    }

    if (!appUrl) {
      console.error(
        "Checkout: NEXT_PUBLIC_APP_URL is missing — success/cancel URLs will be invalid"
      );
    }

    const stripe = new Stripe(stripeKey);
    const body = await request.json();
    console.log("Checkout: body", body);

    const { priceId, userId, email, analysisId, currency, cancelUrl } = body as {
      priceId?: string;
      userId?: string;
      email?: string;
      analysisId?: string;
      currency?: string;
      cancelUrl?: string;
    };

    if (!priceId) {
      return NextResponse.json({ error: "Missing priceId" }, { status: 400 });
    }

    const base = (appUrl ?? "http://localhost:3000").replace(/\/$/, "");

    const sparkPriceId = process.env.STRIPE_SPARK_PRICE_ID?.trim();
    const isSpark = sparkPriceId && priceId === sparkPriceId;
    const isOneShot = priceId === "price_1TQzvsFC3qsxzaqxr3ydKYDS";
    const oneShotSuccessUrl = `${base}/analyze?oneshot=true`;

    const resolvedPlan = resolvePlanFromCheckout(priceId);
    const planMeta =
      resolvedPlan === "basic"
        ? "growth"
        : resolvedPlan === "free"
          ? "growth"
          : resolvedPlan;

    const successUrl =
      analysisId && String(analysisId).trim()
        ? `${base}/verdict/${String(analysisId).trim()}?upgraded=true`
        : isOneShot
          ? oneShotSuccessUrl
          : `${base}/dashboard?view=billing&upgraded=true`;

    let stripeCustomerId: string | null = null;
    if (userId) {
      const admin = getSupabaseAdmin();
      if (admin) {
        stripeCustomerId = await resolveStripeCustomerId(
          admin,
          stripe,
          String(userId),
          email ?? null
        );
      }
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: isOneShot ? "payment" : "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      ...(stripeCustomerId
        ? {
            customer: stripeCustomerId,
            customer_update: { name: "auto", address: "auto" },
          }
        : email
          ? { customer_email: email }
          : {}),
      ...(userId
        ? {
            client_reference_id: String(userId),
            metadata: { userId: String(userId), plan: planMeta },
          }
        : {}),
      ...(!isOneShot && userId
        ? {
            subscription_data: {
              metadata: { userId: String(userId), plan: planMeta },
              ...(isSpark ? { trial_period_days: 7 } : {}),
            },
          }
        : !isOneShot && isSpark
          ? { subscription_data: { trial_period_days: 7 } }
          : {}),
      success_url: successUrl,
      cancel_url: cancelUrl ?? `${base}/dashboard?view=billing`,
    });

    console.log("Checkout: session created", session.url);
    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    const message = errMessage(e);
    console.error("Checkout error:", message, e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
