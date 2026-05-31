import { supabase } from "@/lib/supabase";

const STRIPE_BILLING_PORTAL_LOGIN_URL = "https://billing.stripe.com/p/login";

export async function openStripeBillingPortal(): Promise<void> {
  if (!supabase) {
    window.location.href = STRIPE_BILLING_PORTAL_LOGIN_URL;
    return;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    window.location.href = STRIPE_BILLING_PORTAL_LOGIN_URL;
    return;
  }
  const res = await fetch("/api/billing-portal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: user.id }),
  });
  const data = (await res.json()) as { url?: string };
  if (res.ok && data.url) {
    window.location.href = data.url;
    return;
  }
  window.location.href = STRIPE_BILLING_PORTAL_LOGIN_URL;
}
