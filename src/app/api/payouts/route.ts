import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const authedUserId = await getAuthedUserId(request);
  if (!authedUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }
  const stripe = new Stripe(stripeKey);

  const { userId, creatorId, amount } = await request.json();
  if (userId && userId !== authedUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!creatorId || !amount || amount <= 0) {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  }

  // Creator must belong to this brand and have a connected Stripe account
  const { data: creator } = await supabaseAdmin
    .from("creators")
    .select("id, user_id, stripe_account_id, stripe_onboarded, total_earned, balance")
    .eq("id", creatorId)
    .eq("user_id", authedUserId)
    .single();

  if (!creator?.stripe_account_id) {
    return NextResponse.json(
      { error: "Creator has not connected a bank account yet" },
      { status: 400 }
    );
  }

  // Verify the account can actually receive payouts (live check with Stripe)
  const account = await stripe.accounts.retrieve(creator.stripe_account_id);
  if (!account.payouts_enabled) {
    return NextResponse.json(
      { error: "Creator's bank account setup is incomplete" },
      { status: 400 }
    );
  }

  // Amount in cents
  const amountCents = Math.round(Number(amount) * 100);

  // Transfer funds from the platform balance to the connected account
  let transfer;
  try {
    transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: "eur",
      destination: creator.stripe_account_id,
      metadata: { userId: authedUserId, creatorId },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transfer failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Record the payout
  await supabaseAdmin.from("payouts").insert({
    user_id: authedUserId,
    creator_id: creatorId,
    amount: Number(amount),
    status: "paid",
    stripe_transfer_id: transfer.id,
    paid_at: new Date().toISOString(),
  });

  // Deduct the paid amount from the creator's outstanding balance.
  // total_earned is NOT touched here: it is already credited at sale time.
  const newBalance = Math.max(0, Number(creator.balance || 0) - Number(amount));
  await supabaseAdmin
    .from("creators")
    .update({ balance: newBalance })
    .eq("id", creatorId);

  return NextResponse.json({ success: true, transferId: transfer.id });
}
