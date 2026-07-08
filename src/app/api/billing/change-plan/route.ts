import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  changeSubscriptionPlanForUser,
  type PaidPlanTier,
} from "@/lib/stripe-billing";

export const dynamic = "force-dynamic";

const PAID_TIERS = new Set<PaidPlanTier>(["basic", "pro", "scale"]);

export async function POST(request: NextRequest) {
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

  let tier: PlanTier = "basic";
  let annual = false;
  try {
    const body = (await request.json()) as { tier?: string; annual?: boolean };
    tier = normalizePlan(body.tier);
    annual = Boolean(body.annual);
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!PAID_TIERS.has(tier as PaidPlanTier)) {
    return NextResponse.json({ error: "Invalid plan tier" }, { status: 400 });
  }

  const stripe = new Stripe(stripeKey);

  try {
    const result = await changeSubscriptionPlanForUser(
      admin,
      stripe,
      user.id,
      tier as PaidPlanTier,
      annual,
      user.email
    );

    if (!result.updated) {
      return NextResponse.json(
        { noSubscription: true, error: "No active subscription" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      updated: true,
      plan: normalizePlan(result.plan),
    });
  } catch (err) {
    console.error("billing/change-plan:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Plan change failed" },
      { status: 500 }
    );
  }
}
