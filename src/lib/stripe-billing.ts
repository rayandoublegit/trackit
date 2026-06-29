import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { resolvePlanFromCheckout } from "@/lib/checkout";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused"
  | "inactive";

const PAID_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
]);

export function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status
): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "unpaid";
    case "paused":
      return "paused";
    default:
      return "inactive";
  }
}

export function subscriptionGrantsPaidAccess(
  status: Stripe.Subscription.Status
): boolean {
  return PAID_SUBSCRIPTION_STATUSES.has(status);
}

export function planFromSubscription(subscription: Stripe.Subscription): PlanTier {
  if (!subscriptionGrantsPaidAccess(subscription.status)) {
    return "free";
  }
  const priceId =
    typeof subscription.items.data[0]?.price === "string"
      ? subscription.items.data[0]?.price
      : subscription.items.data[0]?.price?.id ?? null;
  return resolvePlanFromCheckout(priceId, subscription.metadata?.plan);
}

export function planFromPriceId(priceId: string | null | undefined): PlanTier {
  return resolvePlanFromCheckout(priceId, null);
}

export type BillingInterval = "month" | "year";

export type ActiveSubscriptionInfo = {
  subscriptionId: string;
  plan: PlanTier;
  priceId: string | null;
  billingInterval: BillingInterval | null;
  nextBillingDate: number | null;
  currency: string | null;
  status: Stripe.Subscription.Status;
};

function subscriptionPrice(subscription: Stripe.Subscription): Stripe.Price | null {
  const raw = subscription.items.data[0]?.price;
  if (!raw) return null;
  return typeof raw === "string" ? null : raw;
}

export async function getActiveSubscriptionInfo(
  stripe: Stripe,
  customerId: string
): Promise<ActiveSubscriptionInfo | null> {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 20,
    expand: ["data.items.data.price"],
  });

  const activeSub = subscriptions.data.find((sub) =>
    subscriptionGrantsPaidAccess(sub.status)
  );
  if (!activeSub) return null;

  const price = subscriptionPrice(activeSub);
  const priceId = price?.id ?? null;
  const recurring = price?.recurring?.interval;
  const billingInterval: BillingInterval | null =
    recurring === "year" ? "year" : recurring === "month" ? "month" : null;

  const nextBillingDate =
    activeSub.items.data[0]?.current_period_end ?? null;

  return {
    subscriptionId: activeSub.id,
    plan: planFromSubscription(activeSub),
    priceId,
    billingInterval,
    nextBillingDate,
    currency: activeSub.currency ?? price?.currency ?? null,
    status: activeSub.status,
  };
}

/** Stripe Invoice subscription id (supports legacy and newer API shapes). */
export function getSubscriptionIdFromInvoice(
  invoice: Stripe.Invoice
): string | null {
  const legacy = (
    invoice as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
    }
  ).subscription;
  if (legacy) {
    return typeof legacy === "string" ? legacy : legacy.id ?? null;
  }
  const fromParent = (
    invoice as {
      parent?: { subscription_details?: { subscription?: string | null } };
    }
  ).parent?.subscription_details?.subscription;
  return fromParent ?? null;
}

export async function resolveStripeCustomerId(
  supabase: SupabaseClient,
  stripe: Stripe,
  userId: string,
  email?: string | null
): Promise<string | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id as string;
  }

  let resolvedEmail = email;
  if (!resolvedEmail) {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    resolvedEmail = authUser?.user?.email ?? null;
  }
  if (!resolvedEmail) return null;

  const customers = await stripe.customers.list({
    email: resolvedEmail,
    limit: 1,
  });
  const customerId = customers.data[0]?.id ?? null;

  if (customerId) {
    await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", userId);
  }

  return customerId;
}

export async function findUserIdForStripeCustomer(
  supabase: SupabaseClient,
  stripe: Stripe,
  customerId: string
): Promise<string | null> {
  const { data: byCustomer } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (byCustomer?.id) return byCustomer.id;

  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;
  const email = customer.email;
  if (!email) return null;

  const { data: listData, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) {
    console.error("stripe-billing: listUsers failed", error);
    return null;
  }
  const match = listData.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  return match?.id ?? null;
}

export async function resolveUserId({
  supabase,
  stripe,
  explicitUserId,
  customerId,
  subscription,
}: {
  supabase: SupabaseClient;
  stripe: Stripe;
  explicitUserId?: string | null;
  customerId?: string | null;
  subscription?: Stripe.Subscription | null;
}): Promise<string | null> {
  if (explicitUserId) return explicitUserId;
  if (subscription?.metadata?.userId) {
    return String(subscription.metadata.userId);
  }
  const customer =
    customerId ??
    (typeof subscription?.customer === "string"
      ? subscription.customer
      : subscription?.customer?.id ?? null);
  if (!customer) return null;
  return findUserIdForStripeCustomer(supabase, stripe, customer);
}

export async function syncProfileSubscription(
  supabase: SupabaseClient,
  userId: string,
  {
    plan,
    subscriptionStatus,
    stripeCustomerId,
    stripeSubscriptionId,
  }: {
    plan: PlanTier;
    subscriptionStatus: SubscriptionStatus;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
  }
): Promise<{ error: Error | null }> {
  const subscriptionActive =
    plan !== "free" &&
    (subscriptionStatus === "active" ||
      subscriptionStatus === "trialing" ||
      subscriptionStatus === "past_due");

  const payload: Record<string, unknown> = {
    plan: normalizePlan(plan),
    subscription_status: subscriptionStatus,
    subscription_active: subscriptionActive,
  };
  if (stripeCustomerId) payload.stripe_customer_id = stripeCustomerId;
  if (stripeSubscriptionId !== undefined) {
    payload.stripe_subscription_id = stripeSubscriptionId;
  }

  const { error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", userId);

  if (error) {
    console.error("stripe-billing: profile update failed", error);
    return { error: new Error(error.message) };
  }
  return { error: null };
}

export async function syncFromStripeSubscription(
  supabase: SupabaseClient,
  stripe: Stripe,
  subscription: Stripe.Subscription,
  explicitUserId?: string | null
): Promise<void> {
  const userId = await resolveUserId({
    supabase,
    stripe,
    explicitUserId,
    subscription,
  });
  if (!userId) {
    console.warn(
      "stripe-billing: no user for subscription",
      subscription.id
    );
    return;
  }

  const plan = planFromSubscription(subscription);
  const subscriptionStatus = subscriptionGrantsPaidAccess(subscription.status)
    ? mapStripeSubscriptionStatus(subscription.status)
    : "inactive";

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  await syncProfileSubscription(supabase, userId, {
    plan: subscriptionGrantsPaidAccess(subscription.status) ? plan : "free",
    subscriptionStatus:
      plan === "free" ? "inactive" : subscriptionStatus,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionGrantsPaidAccess(subscription.status)
      ? subscription.id
      : null,
  });

  console.log("stripe-billing: synced subscription", {
    userId,
    plan,
    status: subscription.status,
    subscriptionId: subscription.id,
  });
}

export async function clearSubscription(
  supabase: SupabaseClient,
  stripe: Stripe,
  subscription: Stripe.Subscription,
  explicitUserId?: string | null
): Promise<void> {
  const userId = await resolveUserId({
    supabase,
    stripe,
    explicitUserId,
    subscription,
  });
  if (!userId) {
    console.warn(
      "stripe-billing: no user to clear subscription",
      subscription.id
    );
    return;
  }

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  await syncProfileSubscription(supabase, userId, {
    plan: "free",
    subscriptionStatus: "inactive",
    stripeCustomerId: customerId,
    stripeSubscriptionId: null,
  });

  console.log("stripe-billing: cleared subscription", {
    userId,
    subscriptionId: subscription.id,
  });
}
