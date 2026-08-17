import { createServerClient } from "@supabase/ssr";
import Stripe from "stripe";
import { NextResponse, type NextRequest } from "next/server";
import { checkoutPlanMetadata, resolvePlanFromCheckout } from "@/lib/checkout";
import { saveOnboardingProfileAdmin, type OnboardingSavePayload } from "@/lib/onboarding-save";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveStripeCustomerId } from "@/lib/stripe-billing";
import { resolveWorkspaceContextForUser } from "@/lib/workspace-access";
import {
  assertNonEmptyStripePriceId,
  getStripePriceEnvVarNames,
  growthPriceIds,
  proPriceIds,
  scalePriceIds,
} from "@/lib/stripe-config";

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export async function POST(request: NextRequest) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!stripeKey) {
      return NextResponse.json({ error: "Missing Stripe key" }, { status: 500 });
    }

    if (!appUrl) {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "App URL not configured" }, { status: 500 });
      }
      console.error("Checkout: NEXT_PUBLIC_APP_URL is missing — success/cancel URLs will be invalid");
    }

    const stripe = new Stripe(stripeKey);
    const body = await request.json();

    const { priceId, userId, email, cancelUrl, onboarding } = body as {
      priceId?: string;
      userId?: string;
      email?: string;
      cancelUrl?: string;
      onboarding?: OnboardingSavePayload;
    };

    if (!priceId) {
      return NextResponse.json({ error: "Missing priceId" }, { status: 400 });
    }

    const checkoutEnvCandidates = (() => {
      if (growthPriceIds().includes(priceId)) {
        return ["STRIPE_GROWTH_PRICE_ID", "NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID", "STRIPE_BASIC_PRICE_ID"];
      }
      if (proPriceIds().includes(priceId)) {
        return ["STRIPE_PRO2_PRICE_ID", "NEXT_PUBLIC_STRIPE_PRO2_PRICE_ID", "STRIPE_PRO_PRICE_ID"];
      }
      if (scalePriceIds().includes(priceId)) {
        return ["STRIPE_SCALE_PRICE_ID", "NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID"];
      }
      return getStripePriceEnvVarNames();
    })();

    try {
      assertNonEmptyStripePriceId(priceId, checkoutEnvCandidates);
    } catch (e: unknown) {
      return NextResponse.json({ error: errMessage(e) }, { status: 400 });
    }

    const resolvedPlan = resolvePlanFromCheckout(priceId);
    if (resolvedPlan === "free") {
      return NextResponse.json({ error: "Unknown or invalid price" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    let resolvedUserId = userId ? String(userId) : null;
    let resolvedEmail = email ?? null;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Always prefer authenticated session user for paid checkout metadata.
    if (supabaseUrl && supabaseAnonKey) {
      const authClient = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {},
        },
      });
      const {
        data: { user: sessionUser },
      } = await authClient.auth.getUser();

      if (onboarding) {
        if (!sessionUser || !admin) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (resolvedUserId && resolvedUserId !== sessionUser.id) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        resolvedUserId = sessionUser.id;
        resolvedEmail = sessionUser.email ?? resolvedEmail;

        const saved = await saveOnboardingProfileAdmin(admin, sessionUser.id, sessionUser.email, onboarding, {
          markComplete: false,
        });
        if (!saved.ok) {
          return NextResponse.json({ error: saved.error }, { status: 400 });
        }
      } else if (sessionUser) {
        const workspace = await resolveWorkspaceContextForUser(sessionUser);
        resolvedUserId = workspace.ownerId;
        resolvedEmail = workspace.ownerEmail ?? resolvedEmail;
      }
      // Guest checkout is allowed: Stripe collects email, webhook links by customer email.
    } else if (onboarding) {
      return NextResponse.json({ error: "Not configured" }, { status: 500 });
    }

    const base = (appUrl ?? "http://localhost:3000").replace(/\/$/, "");

    const sparkPriceId = process.env.STRIPE_SPARK_PRICE_ID?.trim();
    const isSpark = Boolean(sparkPriceId && priceId === sparkPriceId);
    const isOneShot = priceId === "price_1TQzvsFC3qsxzaqxr3ydKYDS";
    const oneShotSuccessUrl = `${base}/analyze?oneshot=true`;

    const planMeta = checkoutPlanMetadata(resolvedPlan);

    // Always land on billing after paid checkout so sync-plan + UI refresh run.
    const checkoutSuccessBase = isOneShot
      ? oneShotSuccessUrl
      : `${base}/dashboard?view=billing&upgraded=true`;

    const successUrl = checkoutSuccessBase.includes("?")
      ? `${checkoutSuccessBase}&session_id={CHECKOUT_SESSION_ID}`
      : `${checkoutSuccessBase}?session_id={CHECKOUT_SESSION_ID}`;

    let stripeCustomerId: string | null = null;
    if (resolvedUserId && admin) {
      stripeCustomerId = await resolveStripeCustomerId(
        admin,
        stripe,
        resolvedUserId,
        resolvedEmail
      );
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: isOneShot ? "payment" : "subscription",
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: 1 }],
      ...(stripeCustomerId
        ? {
            customer: stripeCustomerId,
            customer_update: { name: "auto", address: "auto" },
          }
        : resolvedEmail
          ? { customer_email: resolvedEmail }
          : {}),
      ...(resolvedUserId
        ? {
            client_reference_id: resolvedUserId,
            metadata: { userId: resolvedUserId, plan: planMeta },
          }
        : {}),
      ...(!isOneShot && resolvedUserId
        ? {
            subscription_data: {
              metadata: { userId: resolvedUserId, plan: planMeta },
              ...(isSpark ? { trial_period_days: 7 } : {}),
            },
          }
        : !isOneShot && isSpark
          ? { subscription_data: { trial_period_days: 7 } }
          : {}),
      success_url: successUrl,
      cancel_url: cancelUrl ?? `${base}/dashboard?view=billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    const message = errMessage(e);
    console.error("Checkout error:", message, e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
