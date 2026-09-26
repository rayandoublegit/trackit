import { PLAN_PRICES } from "@/lib/plan-marketing";
import { checkoutPlanMetadata } from "@/lib/checkout";

const WHOP_API = "https://api.whop.com/api/v1";
const WHOP_VERSION = "2026-07-01";

export const WHOP_ACCOUNT_ID = "biz_kiDPNGwI4cxjKg";
export const WHOP_PRODUCT_ID = "prod_8y8W4yOTWKExg";

const PLAN_COPY: Record<"basic" | "pro" | "scale", { title: string; monthly: number; annual: number }> = {
  basic: { title: "Trackit Starter", monthly: PLAN_PRICES.growthMonthly, annual: PLAN_PRICES.growthAnnual },
  pro: { title: "Trackit Pro", monthly: PLAN_PRICES.proMonthly, annual: PLAN_PRICES.proAnnual },
  scale: { title: "Trackit Scale", monthly: PLAN_PRICES.scaleMonthly, annual: PLAN_PRICES.scaleAnnual },
};

export function whopConfigured(): boolean {
  return Boolean(process.env.WHOP_API_KEY);
}

export async function whopFetch(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const key = process.env.WHOP_API_KEY;
  if (!key) throw new Error("Whop is not configured");
  const res = await fetch(`${WHOP_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Api-Version-Date": WHOP_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const error = json.error as { message?: string } | undefined;
    const message = error?.message || (typeof json.message === "string" ? json.message : `Whop ${res.status}`);
    throw new Error(message);
  }
  return json;
}

export async function createWhopCheckout(input: {
  tier: "basic" | "pro" | "scale";
  annual: boolean;
  currency: "usd" | "eur";
  userId: string;
  email?: string | null;
  redirectUrl: string;
}): Promise<string> {
  const copy = PLAN_COPY[input.tier];
  const price = input.annual ? copy.annual : copy.monthly;
  const metadata = {
    userId: input.userId,
    plan: checkoutPlanMetadata(input.tier),
    interval: input.annual ? "year" : "month",
    email: input.email ?? "",
  };
  const json = await whopFetch("/checkout_configurations", {
    method: "POST",
    body: JSON.stringify({
      account_id: WHOP_ACCOUNT_ID,
      metadata,
      redirect_url: input.redirectUrl,
      plan: {
        product_id: WHOP_PRODUCT_ID,
        title: `${copy.title} ${input.annual ? "annual" : "monthly"} ${input.currency.toUpperCase()}`,
        plan_type: "renewal",
        initial_price: price,
        renewal_price: price,
        billing_period: input.annual ? 365 : 30,
        currency: input.currency,
        visibility: "hidden",
        metadata,
      },
    }),
  });
  const url = typeof json.purchase_url === "string" ? json.purchase_url : "";
  if (!url) throw new Error("Whop did not return a checkout link");
  return url.startsWith("http") ? url : `https://whop.com${url}`;
}

export async function cancelWhopMembership(
  membershipId: string,
  mode: "immediate" | "at_period_end" = "immediate"
): Promise<void> {
  await whopFetch(`/memberships/${membershipId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ cancellation_mode: mode }),
  });
}

export async function whopMembershipManageUrl(membershipId: string): Promise<string | null> {
  const json = await whopFetch(`/memberships/${membershipId}`);
  return typeof json.manage_url === "string" && json.manage_url ? json.manage_url : null;
}
