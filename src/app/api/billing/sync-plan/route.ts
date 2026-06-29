import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { normalizePlan } from "@/lib/plan-limits";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  syncFromCheckoutSession,
  syncSubscriptionPlanForUser,
} from "@/lib/stripe-billing";

export const dynamic = "force-dynamic";

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

  let sessionId: string | undefined;
  try {
    const body = (await request.json()) as { sessionId?: string };
    sessionId = body.sessionId?.trim() || undefined;
  } catch {
    sessionId = undefined;
  }

  const stripe = new Stripe(stripeKey);

  try {
    let result = sessionId
      ? await syncFromCheckoutSession(admin, stripe, sessionId, user.id)
      : null;

    if (!result) {
      result = await syncSubscriptionPlanForUser(
        admin,
        stripe,
        user.id,
        user.email
      );
    }

    return NextResponse.json({
      plan: normalizePlan(result.plan),
      billingInterval: result.subscriptionInfo?.billingInterval ?? null,
      nextBillingDate: result.subscriptionInfo?.nextBillingDate ?? null,
      hasActiveSubscription: result.plan !== "free",
      synced: true,
    });
  } catch (err) {
    console.error("billing/sync-plan:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
