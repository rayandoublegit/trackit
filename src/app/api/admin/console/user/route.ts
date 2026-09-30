import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { checkoutPlanMetadata } from "@/lib/checkout";
import { COMPED_STATUS, giftedStatus, isCompStatus, whopMembershipId } from "@/lib/comp-plan";
import { normalizePlan } from "@/lib/plan-limits";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-data";
import { selectProfileRow } from "@/lib/profile-row";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveStripeCustomerId, syncFromStripeSubscription } from "@/lib/stripe-billing";
import { cancelWhopMembership, whopConfigured } from "@/lib/whop";
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
 *  - action "setPlan": value = "free" | "basic" | "pro" | "scale" (Free resilie Stripe et Whop)
 *  - action "resetQuota": remet le quota de decouvertes gratuit a zero
 */
function priceIdForPlan(plan: string): string | null {
  const normalized = normalizePlan(plan);
  if (normalized === "basic") return getGrowthPriceId("usd") || null;
  if (normalized === "pro") return getProPriceId("usd") || null;
  if (normalized === "scale") return getScalePriceId("usd") || null;
  return null;
}

// Statuses that still grant paid access, so a Stripe re-sync would put the plan back.
const LIVE_STRIPE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);

/**
 * Ends every paid source for an account so Free sticks: all live Stripe
 * subscriptions of its customer (not just the stored one) and its Whop
 * membership. Returns an error message when something could not be canceled.
 */
async function endPaidAccess(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  stripe: Stripe | null,
  target: { id: string; email: string | null; stripe_subscription_id: string | null; subscription_status: string | null },
): Promise<{ canceled: string[]; error: string | null }> {
  const canceled: string[] = [];
  if (stripe) {
    try {
      const customerId = await resolveStripeCustomerId(db, stripe, target.id, target.email);
      const ids = new Set<string>();
      if (target.stripe_subscription_id) ids.add(target.stripe_subscription_id);
      if (customerId) {
        const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
        for (const sub of subs.data) if (LIVE_STRIPE_STATUSES.has(sub.status)) ids.add(sub.id);
      }
      for (const id of ids) {
        try {
          const sub = await stripe.subscriptions.retrieve(id);
          if (LIVE_STRIPE_STATUSES.has(sub.status)) {
            await stripe.subscriptions.cancel(id);
            canceled.push(`stripe:${id}`);
          }
        } catch (err) {
          // Already gone on Stripe's side: nothing left to cancel.
          if (!(err instanceof Stripe.errors.StripeInvalidRequestError)) throw err;
        }
      }
    } catch (err) {
      return { canceled, error: err instanceof Error ? err.message : "Stripe error" };
    }
  } else if (target.stripe_subscription_id) {
    return { canceled, error: "Stripe is not configured on the server, the subscription can't be canceled." };
  }

  const membership = whopMembershipId(target.subscription_status);
  if (membership) {
    if (!whopConfigured()) return { canceled, error: "Whop is not configured on the server, the membership can't be canceled." };
    try {
      await cancelWhopMembership(membership, "immediate");
      canceled.push(`whop:${membership}`);
    } catch (err) {
      return { canceled, error: err instanceof Error ? err.message : "Whop error" };
    }
  }
  return { canceled, error: null };
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
  let targetEmail: string | null = null;
  // Every successful change is written to the staff audit log before answering.
  const done = async (payload: Record<string, unknown>) => {
    await logAdminAction(db, admin, {
      action: `user.${action}`,
      targetUserId: userId,
      targetEmail,
      details: { value: value ?? null, result: payload },
    });
    return NextResponse.json(payload);
  };

  // Recupere le profil cible
  const target = await selectProfileRow<{
    id: string;
    email: string | null;
    role: string | null;
    stripe_subscription_id: string | null;
    stripe_customer_id: string | null;
    subscription_status: string | null;
  }>(db, userId, ["id", "email", "role", "stripe_subscription_id", "stripe_customer_id", "subscription_status"]);

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!target.email) {
    const { data: authUser } = await db.auth.admin.getUserById(userId);
    target.email = authUser.user?.email ?? null;
  }
  targetEmail = target.email;

  // --- Action: changer le role (DB) ---
  if (action === "role") {
    const newRole = (value ?? "").toLowerCase();
    if (!VALID_ROLES.has(newRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    // Garde-fou: empeche de te retirer ton propre acces admin par accident.
    if (target.id === admin.userId && newRole !== "admin") {
      return NextResponse.json(
        { error: "You can't remove your own admin access." },
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
    return done({ ok: true, userId, role: newRole });
  }

  // --- Actions Stripe: annulation ---
  if (action === "cancel" || action === "cancelNow") {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
    }
    if (!target.stripe_subscription_id) {
      return NextResponse.json(
        { error: "This user has no active Stripe subscription." },
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
      return done({ ok: true, userId, action });
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
        { error: "This user has no active Stripe subscription." },
        { status: 400 }
      );
    }
    const newPlan = normalizePlan(value);
    const newPriceId = priceIdForPlan(newPlan);
    if (!newPriceId) {
      return NextResponse.json({ error: "Unknown plan or missing price_id: " + String(value) }, { status: 400 });
    }
    try {
      const stripe = new Stripe(stripeKey);
      const sub = await stripe.subscriptions.retrieve(target.stripe_subscription_id);
      const currentItem = sub.items.data[0];
      if (!currentItem) {
        return NextResponse.json({ error: "Subscription has no item, cannot change the plan." }, { status: 400 });
      }
      if (currentItem.price.id === newPriceId) {
        return NextResponse.json({ error: "The user is already on this plan." }, { status: 400 });
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
      return done({ ok: true, userId, action, plan: newPlan });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Stripe error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // --- Remettre a zero le quota gratuit (pour retester la paywall) ---
  if (action === "resetQuota") {
    const { error } = await db
      .from("profiles")
      .update({ discoveries_used: 0, discoveries_reset_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return done({ ok: true, userId, action });
  }

  // --- Poser un plan sans Stripe (ou aligner un abo Stripe existant) ---
  if (action === "setPlan" || action === "giftMonth" || action === "revokeComp") {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const stripe = stripeKey ? new Stripe(stripeKey) : null;

    if (action === "revokeComp") {
      if (target.stripe_subscription_id && stripe) {
        return NextResponse.json(
          { error: "This user has a Stripe subscription. Cancel it from the Stripe actions." },
          { status: 400 }
        );
      }
      const { error } = await db
        .from("profiles")
        .update({
          plan: "free",
          subscription_active: false,
          subscription_status: "inactive",
        })
        .eq("id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return done({ ok: true, userId, action, plan: "free" });
    }

    const requested = normalizePlan(action === "giftMonth" ? value || "pro" : value);
    if (action === "setPlan" && requested === "free") {
      const ended = await endPaidAccess(db, stripe, target);
      if (ended.error) return NextResponse.json({ error: ended.error, canceled: ended.canceled }, { status: 500 });
      const { error } = await db
        .from("profiles")
        .update({
          plan: "free",
          subscription_active: false,
          subscription_status: "inactive",
          stripe_subscription_id: null,
        })
        .eq("id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return done({ ok: true, userId, action, plan: "free", canceled: ended.canceled });
    }

    if (requested === "free") {
      return NextResponse.json({ error: "Pick a paid plan to gift." }, { status: 400 });
    }

    if (action === "giftMonth" && target.stripe_subscription_id && stripe) {
      try {
        const coupon = await stripe.coupons.create({
          percent_off: 100,
          duration: "repeating",
          duration_in_months: 1,
          name: "Trackit — 1 month gifted",
        });
        await stripe.subscriptions.update(target.stripe_subscription_id, {
          discounts: [{ coupon: coupon.id }],
        });
        await db
          .from("profiles")
          .update({ subscription_status: giftedStatus(30) })
          .eq("id", userId);
        return done({ ok: true, userId, action, plan: requested, stripe: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Stripe error";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    if (action === "setPlan" && target.stripe_subscription_id && stripe) {
      const newPriceId = priceIdForPlan(requested);
      if (!newPriceId) {
        return NextResponse.json({ error: "Missing Stripe price for this plan." }, { status: 400 });
      }
      try {
        const sub = await stripe.subscriptions.retrieve(target.stripe_subscription_id);
        const currentItem = sub.items.data[0];
        if (!currentItem) {
          return NextResponse.json({ error: "Subscription has no item." }, { status: 400 });
        }
        await stripe.subscriptions.update(target.stripe_subscription_id, {
          items: [{ id: currentItem.id, price: newPriceId }],
          proration_behavior: "create_prorations",
          metadata: { ...sub.metadata, userId: target.id, plan: checkoutPlanMetadata(requested) },
        });
        const refreshed = await stripe.subscriptions.retrieve(target.stripe_subscription_id, {
          expand: ["items.data.price"],
        });
        await syncFromStripeSubscription(db, stripe, refreshed, userId);
        return done({ ok: true, userId, action, plan: requested, stripe: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Stripe error";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    const status = action === "giftMonth" ? giftedStatus(30) : COMPED_STATUS;
    const { error } = await db
      .from("profiles")
      .update({
        plan: requested,
        subscription_active: true,
        subscription_status: status,
      })
      .eq("id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return done({ ok: true, userId, action, plan: requested, comp: !isCompStatus(status) ? false : true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
