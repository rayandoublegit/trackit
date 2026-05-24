import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all users with auto_payout_monthly enabled
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("auto_payout_monthly", true);

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ ok: true, paid: 0 });
  }

  let totalPaid = 0;

  for (const profile of profiles) {
    // Get all creators with positive balance for this user
    const { data: creators } = await supabaseAdmin
      .from("creators")
      .select("id, balance, total_earned, full_name")
      .eq("user_id", profile.id)
      .gt("balance", 0);

    if (!creators || creators.length === 0) continue;

    for (const creator of creators) {
      const amount = creator.balance;

      // Reset creator balance and update total earned
      await supabaseAdmin
        .from("creators")
        .update({ balance: 0, total_earned: (creator.total_earned || 0) + amount })
        .eq("id", creator.id);

      // Record payout
      await supabaseAdmin
        .from("sales")
        .insert({
          user_id: profile.id,
          order_amount: amount,
          commission_amount: amount,
          discount_code_used: "MONTHLY_AUTO_PAYOUT",
          status: "paid"
        });

      totalPaid++;
    }
  }

  return NextResponse.json({ ok: true, paid: totalPaid });
}
