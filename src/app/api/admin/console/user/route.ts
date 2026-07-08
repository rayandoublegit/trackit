import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { checkoutPlanMetadata } from "@/lib/checkout";
import { normalizePlan } from "@/lib/plan-limits";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { syncFromStripeSubscription } from "@/lib/stripe-billing";
import {
  getGrowthPriceId,
  getProPriceId,
  getScalePriceId,
} from "@/lib/stripe-config";

export const dynamic = "force-dynamic";

const VALID_ROLES = new Set(["user", "staff", "admin"]);

/**
 * Actions admin sur un user precis.
 * body: { userId, action, value? }
 *  - action "role": value = "user" | "staff" | "admin"  (modif DB)
 *  - action "cancel": annule l'abonnement Stripe (a la fin de periode)
 *  - action "cancelNow": annule immediatement l'abonnement Stripe
 */
function priceIdForPlan(plan: string): string | null {
  const normalized = normalizePlan(plan);
  if (normalized === "basic") return getGrowthPriceId("usd") || null;
  if (normalized === "pro") return getProPriceId("usd") || null;
  if (normalized === "scale") return getScalePriceId("usd") || null;
  return null;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  let body: { userId?: string; action?: string; value?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { userId, action, value } = body;
  if (!userId || !action) {
    return NextResponse.json({ error: "Missing userId or action" }, { status: 400 });
  }

  // Recupere le profil cible
  const { data: target, error: targetErr } = await db
    .from("profiles")
    .select("id, email, role, stripe_subscription_id, stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  if (targetErr || !target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // --- Action: changer le role (DB) ---
  if (action === "role") {
    const newRole = (value ?? "").toLowerCase();
    if (!VALID_ROLES.has(newRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    // Garde-fou: empeche de te retirer ton propre acces admin par accident.
    if (target.id === admin.userId && newRole !== "admin") {
      return NextResponse.json(
        { error: "Tu ne peux pas retirer ton propre acces admin." },
        { status: 400 }
      );
    }
    const { error } = await db
      .from("profiles")
      .update({ role: newRole })
      .eq("id", userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, userId, role: newRole });
  }

  // --- Actions Stripe: annulation ---
  if (action === "cancel" || action === "cancelNow") {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
    }
    if (!target.stripe_subscription_id) {
      return NextResponse.json(
        { error: "Cet utilisateur n'a pas d'abonnement Stripe actif." },
        { status: 400 }
      );
    }
    try {
      const stripe = new Stripe(stripeKey);
      if (action === "cancelNow") {
        await stripe.subscriptions.cancel(target.stripe_subscription_id);
        // Reflet immediat en base
        await db
          .from("profiles")
          .update({
            plan: "free",
            subscription_active: false,
            subscription_status: "canceled",
            stripe_subscription_id: null,
          })
          .eq("id", userId);
      } else {
        await stripe.subscriptions.update(target.stripe_subscription_id, {
          cancel_at_period_end: true,
        });
        await db
          .from("profiles")
          .update({ subscription_status: "cancel_scheduled" })
          .eq("id", userId);
      }
      return NextResponse.json({ ok: true, userId, action });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Stripe error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // --- Action Stripe: changer le plan (upgrade/downgrade avec proration) ---
  if (action === "changePlan") {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
    }
    if (!target.stripe_subscription_id) {
      return NextResponse.json(
        { error: "Cet utilisateur n'a pas d'abonnement Stripe actif." },
        { status: 400 }
      );
    }
    const newPlan = normalizePlan(value);
    const newPriceId = priceIdForPlan(newPlan);
    if (!newPriceId) {
      return NextResponse.json({ error: "Plan inconnu ou price_id manquant: " + String(value) }, { status: 400 });
    }
    try {
      const stripe = new Stripe(stripeKey);
      const sub = await stripe.subscriptions.retrieve(target.stripe_subscription_id);
      const currentItem = sub.items.data[0];
      if (!currentItem) {
        return NextResponse.json({ error: "Abonnement sans item, impossible de changer le plan." }, { status: 400 });
      }
      if (currentItem.price.id === newPriceId) {
        return NextResponse.json({ error: "L'utilisateur est deja sur ce plan." }, { status: 400 });
      }
      await stripe.subscriptions.update(target.stripe_subscription_id, {
        items: [{ id: currentItem.id, price: newPriceId }],
        proration_behavior: "create_prorations",
        metadata: {
          ...sub.metadata,
          userId: target.id,
          plan: checkoutPlanMetadata(newPlan),
        },
      });
      const refreshed = await stripe.subscriptions.retrieve(target.stripe_subscription_id, {
        expand: ["items.data.price"],
      });
      await syncFromStripeSubscription(db, stripe, refreshed, userId);
      return NextResponse.json({ ok: true, userId, action, plan: newPlan });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Stripe error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
