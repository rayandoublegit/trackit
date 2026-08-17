import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

function appBase(request: NextRequest) {
  return request.nextUrl.origin;
}

function errorRedirect(request: NextRequest) {
  return NextResponse.redirect(`${appBase(request)}/dashboard?view=integrations&stripe=error`);
}

/** Complete Stripe Connect Standard OAuth and persist the connected account. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = request.cookies.get("stripe_connect_state")?.value;
  const oauthError = searchParams.get("error");

  if (oauthError) {
    console.error("Stripe Connect OAuth error:", oauthError, searchParams.get("error_description"));
    const response = errorRedirect(request);
    response.cookies.delete("stripe_connect_state");
    return response;
  }

  if (!code || !state || !storedState || state !== storedState) {
    console.error("Stripe Connect callback: invalid state or missing code");
    const response = errorRedirect(request);
    response.cookies.delete("stripe_connect_state");
    return response;
  }

  let userId = "";
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64").toString()) as { userId?: string };
    userId = decoded.userId || "";
  } catch {
    console.error("Stripe Connect callback: failed to decode state");
    const response = errorRedirect(request);
    response.cookies.delete("stripe_connect_state");
    return response;
  }

  if (!userId) {
    console.error("Stripe Connect callback: missing userId in state");
    const response = errorRedirect(request);
    response.cookies.delete("stripe_connect_state");
    return response;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeKey) {
    console.error("Stripe Connect callback: STRIPE_SECRET_KEY missing");
    const response = errorRedirect(request);
    response.cookies.delete("stripe_connect_state");
    return response;
  }

  try {
    const stripe = new Stripe(stripeKey);
    const token = await stripe.oauth.token({
      grant_type: "authorization_code",
      code,
    });

    const stripeAccountId = token.stripe_user_id;
    if (!stripeAccountId) {
      throw new Error("No stripe_user_id in OAuth token response");
    }

    const livemode =
      typeof token.livemode === "boolean" ? token.livemode : !stripeKey.startsWith("sk_test");

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Soft-disconnect any other active connection for this workspace.
    await supabase
      .from("stripe_connections")
      .update({ disconnected_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("disconnected_at", null)
      .neq("stripe_account_id", stripeAccountId);

    const { error: upsertError } = await supabase.from("stripe_connections").upsert(
      {
        user_id: userId,
        stripe_account_id: stripeAccountId,
        livemode,
        connected_at: new Date().toISOString(),
        disconnected_at: null,
      },
      { onConflict: "stripe_account_id" },
    );

    if (upsertError) {
      throw upsertError;
    }

    const response = NextResponse.redirect(
      `${appBase(request)}/dashboard?view=integrations&stripe=connected&account=${encodeURIComponent(stripeAccountId)}`,
    );
    response.cookies.delete("stripe_connect_state");
    return response;
  } catch (error) {
    console.error("Stripe Connect callback error:", error);
    const response = errorRedirect(request);
    response.cookies.delete("stripe_connect_state");
    return response;
  }
}
