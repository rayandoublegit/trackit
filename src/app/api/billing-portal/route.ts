import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveStripeCustomerId } from "@/lib/stripe-billing";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !stripeKey) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  try {
    const body = (await req.json()) as { userId?: string };
    const userId = body.userId;

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {},
      },
    });

    const {
      data: { user: cookieUser },
    } = await supabase.auth.getUser();

    const resolvedUserId = cookieUser?.id ?? userId;
    if (!resolvedUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { data: authUser, error } = await admin.auth.admin.getUserById(resolvedUserId);
    if (error || !authUser?.user?.email) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const stripe = new Stripe(stripeKey);
    const customerId = await resolveStripeCustomerId(
      admin,
      stripe,
      resolvedUserId,
      authUser.user.email
    );

    if (!customerId) {
      return NextResponse.json({ error: "No Stripe customer found" }, { status: 404 });
    }

    const configuration =
      process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID ??
      "bpc_1T5pKiFC3qsxzaqx37tUdyDM";

    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://trackit.app").replace(/\/$/, "");

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${base}/dashboard?view=billing`,
      configuration,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Billing portal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
