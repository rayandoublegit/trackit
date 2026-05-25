import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }
  const stripe = new Stripe(stripeKey);

  const { creatorId, email } = await request.json();
  if (!creatorId) {
    return NextResponse.json({ error: "Missing creatorId" }, { status: 400 });
  }

  // Look up creator + any existing connected account
  const { data: creator } = await supabaseAdmin
    .from("creators")
    .select("id, stripe_account_id")
    .eq("id", creatorId)
    .single();

  let accountId = creator?.stripe_account_id as string | undefined;

  // Create an Express connected account if none exists
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: email || undefined,
      capabilities: {
        transfers: { requested: true },
      },
    });
    accountId = account.id;
    await supabaseAdmin
      .from("creators")
      .update({ stripe_account_id: accountId })
      .eq("id", creatorId);
  }

  const origin =
    request.headers.get("origin") || "https://thentrack.it";

  // Create the hosted onboarding link
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/dashboard?payout_refresh=1`,
    return_url: `${origin}/dashboard?payout_connected=1`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: accountLink.url });
}
