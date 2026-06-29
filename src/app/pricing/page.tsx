"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PricingPlans } from "@/components/PricingPlans";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";
import type { BillingInterval } from "@/lib/stripe-billing";

function PricingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentPlan, setCurrentPlan] = useState<PlanTier>("free");
  const [subscriptionInterval, setSubscriptionInterval] = useState<BillingInterval | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);

  const returnTo = searchParams.get("returnTo") || "/dashboard";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/billing/plan", { credentials: "include" });
        const payload = await res.json().catch(() => ({})) as { plan?: string; billingInterval?: BillingInterval | null };
        if (cancelled) return;
        setCurrentPlan(normalizePlan(payload.plan));
        setSubscriptionInterval(payload.billingInterval ?? null);
      } catch {
        if (cancelled) return;
        setCurrentPlan("free");
        setSubscriptionInterval(null);
      } finally {
        if (!cancelled) setLoadingPlan(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleStayFree = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(returnTo);
  };

  const cancelUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/pricing?returnTo=${encodeURIComponent(returnTo)}`
      : undefined;

  return (
    <main style={{ minHeight: "100vh", background: "#FFFFFF", padding: "32px 20px 56px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <PricingPlans
          currentPlan={currentPlan}
          subscriptionInterval={subscriptionInterval}
          loadingPlan={loadingPlan}
          cancelUrl={cancelUrl}
          onStayFree={handleStayFree}
        />
      </div>
    </main>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: "100vh", background: "#FFFFFF" }} />}>
      <PricingPageContent />
    </Suspense>
  );
}
