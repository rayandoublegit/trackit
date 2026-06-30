import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Records a MANUAL payout (PayPal / Revolut / IBAN done outside Trackit):
// inserts a payout row and deducts the amount from the creator's balance.
export async function POST(request: NextRequest) {
  const authedUserId = await getAuthedUserId(request);
  if (!authedUserId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { userId, creatorId, amount, method } = await request.json();
  if (userId && userId !== authedUserId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (!creatorId || !amount || Number(amount) <= 0) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields" }, { status: 400 });
  }

  const { data: creator } = await supabaseAdmin
    .from("creators")
    .select("id, user_id, balance")
    .eq("id", creatorId)
    .eq("user_id", authedUserId)
    .single();

  if (!creator) {
    return NextResponse.json({ ok: false, error: "Creator not found" }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from("payouts").insert({
    user_id: authedUserId,
    creator_id: creatorId,
    amount: Number(amount),
    status: "paid",
    stripe_transfer_id: `manual_${method || "unknown"}_${Date.now()}`,
    paid_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const newBalance = Math.max(0, Number(creator.balance || 0) - Number(amount));
  await supabaseAdmin.from("creators").update({ balance: newBalance }).eq("id", creatorId);

  return NextResponse.json({ ok: true, newBalance });
}
