import { supabase } from "@/lib/supabase";

function getBuildPriceId(): string | undefined {
  return process.env.NEXT_PUBLIC_STRIPE_BUILD_PRICE_ID;
}

function getScalePriceId(): string | undefined {
  return process.env.NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID;
}

function getSparkPriceId(): string | undefined {
  return process.env.NEXT_PUBLIC_STRIPE_SPARK_PRICE_ID;
}

function getPriceIdForUpgrade(plan: string): string | undefined {
  if (plan === "free") return getSparkPriceId();
  if (plan === "spark") return getBuildPriceId();
  if (plan === "build") return getScalePriceId();
  return undefined;
}

/**
 * Start Stripe Checkout for a subscription price. Redirects the browser on success.
 */
export async function handleUpgrade(priceId: string): Promise<void> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const res = await fetch("/api/create-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      priceId,
      userId: user?.id,
      email: user?.email,
    }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(payload.error ?? "Could not start checkout.");
  }

  if (payload.url) {
    window.location.href = payload.url;
  }
}

export {
  getBuildPriceId,
  getScalePriceId,
  getSparkPriceId,
  getPriceIdForUpgrade,
};
