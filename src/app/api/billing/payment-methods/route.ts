import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { listStripeBillingPaymentMethods } from "@/lib/billing-payment-methods";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveStripeCustomerId } from "@/lib/stripe-billing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !stripeKey) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const stripe = new Stripe(stripeKey);

    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("id", user.id)
      .maybeSingle();

    const customerId =
      (profile?.stripe_customer_id as string | null) ??
      (await resolveStripeCustomerId(admin, stripe, user.id, user.email));

    if (!customerId) {
      return NextResponse.json({ methods: [], hasStripeCustomer: false });
    }

    const methods = await listStripeBillingPaymentMethods(stripe, customerId, {
      subscriptionId: profile?.stripe_subscription_id as string | null,
    });

    return NextResponse.json({
      methods,
      hasStripeCustomer: true,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load payment methods";
    console.error("billing/payment-methods:", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
