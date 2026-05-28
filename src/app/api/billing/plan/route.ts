import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { resolvePlanFromCheckout } from "@/lib/checkout";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveStripeCustomerId } from "@/lib/stripe-billing";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
]);

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

  const { data: profile } = await admin
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();

  let plan: PlanTier = normalizePlan(profile?.plan);

  try {
    const stripe = new Stripe(stripeKey);
    const customerId = await resolveStripeCustomerId(
      admin,
      stripe,
      user.id,
      user.email
    );

    if (customerId) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 20,
      });

      const activeSub = subscriptions.data.find((sub) =>
        ACTIVE_STATUSES.has(sub.status)
      );

      if (activeSub) {
        const rawPrice = activeSub.items.data[0]?.price;
        const priceId =
          typeof rawPrice === "string" ? rawPrice : rawPrice?.id ?? null;
        plan = resolvePlanFromCheckout(
          priceId,
          activeSub.metadata?.plan
        );
      } else {
        plan = "free";
      }
    }
  } catch (err) {
    console.error("billing/plan:", err);
  }

  return NextResponse.json({ plan });
}
