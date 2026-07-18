import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireWorkspaceAccess } from "@/lib/api-auth";
import { canUseStripeConnectPayouts, normalizePlan } from "@/lib/plan-limits";

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

    const body = (await request.json()) as { userId?: string; email?: string };
    const access = await requireWorkspaceAccess(request, body.userId);
    if ("error" in access) return access.error;
    const userId = access.workspaceId;
    const email = body.email;
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

    // Look up existing connect account for this user
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_connect_account_id, plan")
      .eq("id", userId)
      .single();

    if (!canUseStripeConnectPayouts(normalizePlan(profile?.plan))) {
      return NextResponse.json({ error: "Stripe Connect requires Pro plan or above" }, { status: 403 });
    }

    let accountId = profile?.stripe_connect_account_id as string | null;

    // Create an Express account if none exists yet
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        ...(email ? { email } : {}),
        capabilities: {
          transfers: { requested: true },
        },
        business_profile: {
          product_description: "Creator commission payouts via Trackit",
        },
        metadata: { userId: String(userId) },
      });
      accountId = account.id;

      await supabaseAdmin
        .from("profiles")
        .update({ stripe_connect_account_id: accountId, stripe_connect_status: "pending" })
        .eq("id", userId);
    }

    // Create an account link to start (or resume) onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${base}/dashboard?connect=refresh`,
      return_url: `${base}/dashboard?connect=return`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Stripe Connect error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
