import { NextRequest, NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/** Start Stripe Connect Standard OAuth (sales source). CSRF: base64 state + httpOnly cookie (same as Shopify). */
export async function GET(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) {
    const appUrl = request.nextUrl.origin || request.nextUrl.origin;
    return NextResponse.redirect(`${appUrl}/dashboard?view=integrations&stripe=error`);
  }

  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID?.trim();
  if (!clientId) {
    console.error("Stripe Connect authorize: STRIPE_CONNECT_CLIENT_ID missing");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    return NextResponse.redirect(`${appUrl}/dashboard?view=integrations&stripe=error`);
  }

  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/stripe-connect/callback`;
  const state = Buffer.from(
    JSON.stringify({ nonce: Math.random().toString(), userId }),
  ).toString("base64");

  const authorizeUrl = new URL("https://connect.stripe.com/oauth/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("scope", "read_write");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl.toString());
  response.cookies.set("stripe_connect_state", state, {
    httpOnly: true,
    maxAge: 600,
    sameSite: "lax",
    path: "/",
  });
  return response;
}
