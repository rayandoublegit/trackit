import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireWorkspaceAccess } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** Active Stripe Connect sales connection for the current workspace. */
export async function GET(request: NextRequest) {
  const access = await requireWorkspaceAccess(request);
  if ("error" in access) return access.error;
  const userId = access.workspaceId;

  const { data: connection, error } = await supabaseAdmin
    .from("stripe_connections")
    .select("stripe_account_id, livemode, connected_at")
    .eq("user_id", userId)
    .is("disconnected_at", null)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Stripe Connect status fetch error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const stripeAccountId = (connection?.stripe_account_id as string | undefined) ?? null;
  const connected = Boolean(stripeAccountId);

  const campaignId = request.nextUrl.searchParams.get("campaignId")?.trim() || "";
  let promoCodes: { creatorRowId: string; code: string; percentOff: number }[] = [];

  if (connected && stripeAccountId && campaignId) {
    const { data: rows, error: codesError } = await supabaseAdmin
      .from("affiliate_promo_codes")
      .select("creator_row_id, code, percent_off")
      .eq("user_id", userId)
      .eq("campaign_id", campaignId)
      .eq("stripe_account_id", stripeAccountId);

    if (codesError) {
      console.error("Stripe Connect status promo codes error:", codesError);
    } else {
      promoCodes = (rows ?? []).map((row) => ({
        creatorRowId: String(row.creator_row_id),
        code: String(row.code),
        percentOff: Number(row.percent_off) || 0,
      }));
    }
  }

  return NextResponse.json({
    ok: true,
    connected,
    stripeAccountId,
    livemode: connection?.livemode ?? null,
    promoCodes,
  });
}
