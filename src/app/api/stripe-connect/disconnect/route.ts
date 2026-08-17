import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { requireWorkspaceAccess } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** Revoke Stripe Connect OAuth access and mark the connection disconnected. */
export async function POST(request: Request) {
  const access = await requireWorkspaceAccess(request);
  if ("error" in access) return access.error;
  const userId = access.workspaceId;

  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID?.trim();
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!clientId || !stripeKey) {
    return NextResponse.json(
      { ok: false, error: "Stripe Connect is not configured" },
      { status: 500 },
    );
  }

  const { data: connection, error: fetchError } = await supabaseAdmin
    .from("stripe_connections")
    .select("id, stripe_account_id")
    .eq("user_id", userId)
    .is("disconnected_at", null)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    console.error("Stripe Connect disconnect fetch error:", fetchError);
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  if (!connection?.stripe_account_id) {
    return NextResponse.json({ ok: false, error: "No active Stripe connection" }, { status: 404 });
  }

  try {
    const stripe = new Stripe(stripeKey);
    await stripe.oauth.deauthorize({
      client_id: clientId,
      stripe_user_id: connection.stripe_account_id,
    });
  } catch (error) {
    // Account may already be revoked in Stripe — still mark local row disconnected.
    console.error("Stripe Connect deauthorize error:", error);
  }

  const { error: updateError } = await supabaseAdmin
    .from("stripe_connections")
    .update({ disconnected_at: new Date().toISOString() })
    .eq("id", connection.id);

  if (updateError) {
    console.error("Stripe Connect disconnect update error:", updateError);
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
