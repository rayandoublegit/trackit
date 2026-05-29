import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json({ error: "Missing Stripe key" }, { status: 500 });
    }
    const stripe = new Stripe(stripeKey);

    const { userId } = (await request.json()) as { userId?: string };
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_connect_account_id, stripe_connect_status")
      .eq("id", userId)
      .single();

    const accountId = profile?.stripe_connect_account_id as string | null;
    if (!accountId) {
      return NextResponse.json({ connected: false, status: "none" });
    }

    // Ask Stripe for the live state of the account
    const account = await stripe.accounts.retrieve(accountId);
    const fullyOnboarded = account.charges_enabled && account.payouts_enabled && account.details_submitted;
    const status = fullyOnboarded ? "active" : "pending";

    // Keep our DB in sync
    if (profile?.stripe_connect_status !== status) {
      await supabaseAdmin
        .from("profiles")
        .update({ stripe_connect_status: status })
        .eq("id", userId);
    }

    return NextResponse.json({
      connected: fullyOnboarded,
      status,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Stripe Connect status error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
