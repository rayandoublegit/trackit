import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  const { userId, creatorId, amount } = await request.json();
  if (!userId || !creatorId || !amount) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Get user balance
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("balance")
    .eq("id", userId)
    .single();

  const currentBalance = profile?.balance || 0;
  if (currentBalance < amount) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
  }

  // Deduct from user balance
  await supabaseAdmin
    .from("profiles")
    .update({ balance: currentBalance - amount })
    .eq("id", userId);

  // Update creator balance
  const { data: creator } = await supabaseAdmin
    .from("creators")
    .select("balance, total_earned")
    .eq("id", creatorId)
    .single();

  await supabaseAdmin
    .from("creators")
    .update({ 
      balance: 0,
      total_earned: (creator?.total_earned || 0) + amount
    })
    .eq("id", creatorId);

  // Record payout
  await supabaseAdmin
    .from("sales")
    .insert({
      user_id: userId,
      order_amount: amount,
      commission_amount: amount,
      discount_code_used: "MANUAL_PAYOUT",
      status: "paid"
    });

  return NextResponse.json({ ok: true });
}
