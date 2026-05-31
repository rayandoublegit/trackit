"use client";

import { useCallback, useEffect, useState } from "react";
import type { BillingPaymentMethod } from "@/lib/billing-payment-methods";
import { openStripeBillingPortal } from "@/lib/open-billing-portal";

export type PaymentMethod = BillingPaymentMethod;

export function getDefaultPaymentMethod(methods: PaymentMethod[]): PaymentMethod | null {
  return methods.find((m) => m.isDefault) ?? methods[0] ?? null;
}

export function formatPaymentLabel(method: PaymentMethod): string {
  return `${method.brand} ending in ${method.last4}`;
}

export function formatPaymentLabelShort(method: PaymentMethod, lang: "en" | "fr"): string {
  return lang === "fr"
    ? `${method.brand} ···· ${method.last4}`
    : `${method.brand} ···· ${method.last4}`;
}

export function usePaymentMethods() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasStripeCustomer, setHasStripeCustomer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/payment-methods", {
        credentials: "include",
      });
      const data = (await res.json()) as {
        methods?: PaymentMethod[];
        hasStripeCustomer?: boolean;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load payment methods");
      }
      setMethods(data.methods ?? []);
      setHasStripeCustomer(Boolean(data.hasStripeCustomer));
    } catch (err) {
      setMethods([]);
      setHasStripeCustomer(false);
      setError(err instanceof Error ? err.message : "Failed to load payment methods");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const openManage = useCallback(() => {
    void openStripeBillingPortal();
  }, []);

  const defaultMethod = getDefaultPaymentMethod(methods);

  return {
    methods,
    defaultMethod,
    loading,
    error,
    hasStripeCustomer,
    hasPaymentMethod: methods.length > 0,
    manageInBilling: true,
    refresh,
    openManage,
  };
}
