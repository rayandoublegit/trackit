import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Stripe from "stripe";

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log(
      "Webhook: session",
      JSON.stringify(session.metadata ?? null)
    );

    const userId = session.metadata?.userId
      ? String(session.metadata.userId)
      : null;

    const email =
      session.customer_email ??
      session.customer_details?.email ??
      null;

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      expand: ["data.price"],
    });

    const rawPrice = lineItems.data[0]?.price;
    const priceId =
      typeof rawPrice === "string" ? rawPrice : rawPrice?.id ?? null;

    console.log("Webhook: priceId", priceId);

    const sparkId = process.env.STRIPE_SPARK_PRICE_ID;
    const buildId = process.env.STRIPE_BUILD_PRICE_ID;
    const scaleId = process.env.STRIPE_SCALE_PRICE_ID;

    const plan =
      priceId && sparkId && priceId === sparkId
        ? "spark"
        : priceId && buildId && priceId === buildId
          ? "build"
          : priceId && scaleId && priceId === scaleId
            ? "scale"
            : "spark";

    console.log("Webhook: plan mapped to", plan);
    console.log("Webhook: userId", userId);

    if (userId) {
      const usernameBase =
        email?.split("@")[0]?.trim() || "founder";

      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      const { error: profileError } = existing
        ? await supabaseAdmin
            .from("profiles")
            .update({
              plan,
              subscription_status: "active",
            })
            .eq("id", userId)
        : await supabaseAdmin.from("profiles").insert({
            id: userId,
            username: usernameBase,
            plan,
            subscription_status: "active",
          });

      console.log("Webhook: profile create/update result", profileError);
    } else {
      console.log(
        "Webhook: upsert skipped — no userId in session.metadata"
      );
    }
  }

  return NextResponse.json({ received: true });
}
