import Stripe from "stripe";
import { NextResponse } from "next/server";

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

    const successUrl =
      analysisId && String(analysisId).trim()
        ? `${base}/verdict/${String(analysisId).trim()}?upgraded=true`
        : `${base}/dashboard?upgraded=true`;

    const sparkPriceId = process.env.STRIPE_SPARK_PRICE_ID?.trim();
    const isSpark = sparkPriceId && priceId === sparkPriceId;
    const isOneShot = priceId === "price_1TQzvsFC3qsxzaqxr3ydKYDS";
    const oneShotSuccessUrl = `${base}/analyze?oneshot=true`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: isOneShot ? "payment" : "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      ...(email ? { customer_email: email } : {}),
      metadata: userId ? { userId: String(userId) } : {},
      ...(!isOneShot && isSpark ? { subscription_data: { trial_period_days: 7 } } : {}),
      success_url: isOneShot ? oneShotSuccessUrl : successUrl,
      cancel_url: cancelUrl ?? `${base}`,
    });

    console.log("Checkout: session created", session.url);
    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    const message = errMessage(e);
    console.error("Checkout error:", message, e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
