"use client";

import { useCallback, useEffect, useState } from "react";

export interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expiry: string;
  isDefault: boolean;
}

const STORAGE_KEY = "trackit_payment_methods";

const defaultMethods: PaymentMethod[] = [
  { id: "1", brand: "Visa", last4: "4242", expiry: "12/28", isDefault: true },
];

type Listener = () => void;
const listeners = new Set<Listener>();

function loadFromStorage(): PaymentMethod[] {
  if (typeof window === "undefined") return defaultMethods;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultMethods;
    const parsed = JSON.parse(raw) as PaymentMethod[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultMethods;
  } catch {
    return defaultMethods;
  }
}

function persist(methods: PaymentMethod[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(methods));
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDefaultPaymentMethod(methods: PaymentMethod[]): PaymentMethod | null {
  return methods.find((m) => m.isDefault) ?? methods[0] ?? null;
}

export function formatPaymentLabel(method: PaymentMethod): string {
  return `${method.brand} ending in ${method.last4}`;
}

export function usePaymentMethods() {
  const [methods, setMethods] = useState<PaymentMethod[]>(defaultMethods);

  useEffect(() => {
    setMethods(loadFromStorage());
    const unsubscribe = subscribe(() => setMethods(loadFromStorage()));
    return () => { unsubscribe(); };
  }, []);

  const addMethod = useCallback((method: PaymentMethod) => {
    const current = loadFromStorage();
    const next = method.isDefault
      ? [...current.map((m) => ({ ...m, isDefault: false })), method]
      : current.length === 0
        ? [{ ...method, isDefault: true }]
        : [...current, method];
    persist(next);
  }, []);

  const removeMethod = useCallback((id: string) => {
    let next = loadFromStorage().filter((m) => m.id !== id);
    if (next.length > 0 && !next.some((m) => m.isDefault)) {
      next = next.map((m, i) => ({ ...m, isDefault: i === 0 }));
    }
    persist(next);
  }, []);

  const setDefault = useCallback((id: string) => {
    const next = loadFromStorage().map((m) => ({ ...m, isDefault: m.id === id }));
    persist(next);
  }, []);

  return { methods, addMethod, removeMethod, setDefault };
}
