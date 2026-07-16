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

type SharedPaymentMethodsSnapshot = {
  methods: PaymentMethod[];
  hasStripeCustomer: boolean;
  error: string | null;
  loading: boolean;
};

let sharedSnapshot: SharedPaymentMethodsSnapshot = {
  methods: [],
  hasStripeCustomer: false,
  error: null,
  loading: true,
};

let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

async function fetchSharedPaymentMethods() {
  if (inflight) return inflight;

  sharedSnapshot = { ...sharedSnapshot, loading: true, error: null };
  notifyListeners();

  inflight = (async () => {
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
      sharedSnapshot = {
        methods: data.methods ?? [],
        hasStripeCustomer: Boolean(data.hasStripeCustomer),
        error: null,
        loading: false,
      };
    } catch (err) {
      sharedSnapshot = {
        methods: [],
        hasStripeCustomer: false,
        error: err instanceof Error ? err.message : "Failed to load payment methods",
        loading: false,
      };
    } finally {
      notifyListeners();
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export function refreshPaymentMethods() {
  return fetchSharedPaymentMethods();
}

export function usePaymentMethods() {
  const [, bump] = useState(0);

  useEffect(() => {
    const listener = () => bump((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    void fetchSharedPaymentMethods();
    const onFocus = () => {
      void fetchSharedPaymentMethods();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchSharedPaymentMethods();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("trackit-plan-updated", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("trackit-plan-updated", onFocus);
    };
  }, []);

  const refresh = useCallback(async () => {
    await fetchSharedPaymentMethods();
  }, []);

  const openManage = useCallback(() => {
    void openStripeBillingPortal();
  }, []);

  const defaultMethod = getDefaultPaymentMethod(sharedSnapshot.methods);

  return {
    methods: sharedSnapshot.methods,
    defaultMethod,
    loading: sharedSnapshot.loading,
    error: sharedSnapshot.error,
    hasStripeCustomer: sharedSnapshot.hasStripeCustomer,
    hasPaymentMethod: sharedSnapshot.methods.length > 0,
    manageInBilling: true,
    refresh,
    openManage,
  };
}
