"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CURRENCY_UPDATED_EVENT,
  getDisplayCurrency,
  setDisplayCurrency as persistDisplayCurrency,
  TRACKIT_CURRENCY_KEY,
  type DisplayCurrency,
} from "@/lib/locale-preferences";
import { useLang } from "@/lib/useLang";

export type { DisplayCurrency };

export function formatCurrencyWithCode(amount: number | string, currency: DisplayCurrency): string {
  const num = typeof amount === "string" ? parseFloat(amount.replace(/[$€,]/g, "")) : amount;
  if (isNaN(num)) return String(amount);
  const locale = currency === "EUR" ? "fr-FR" : "en-US";
  return num.toLocaleString(locale, { style: "currency", currency, maximumFractionDigits: 0 });
}

/** Formats using the dashboard display currency (localStorage). */
export function formatCurrency(amount: number | string, lang?: "en" | "fr"): string {
  return formatCurrencyWithCode(amount, getDisplayCurrency(lang));
}

export function useDisplayCurrency(): DisplayCurrency {
  const lang = useLang();
  const [currency, setCurrency] = useState<DisplayCurrency>(() => getDisplayCurrency(lang));

  useEffect(() => {
    const refresh = () => setCurrency(getDisplayCurrency());
    const onStorage = (e: StorageEvent) => {
      if (e.key === TRACKIT_CURRENCY_KEY) refresh();
    };

    window.addEventListener(CURRENCY_UPDATED_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CURRENCY_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return currency;
}

export function useSetDisplayCurrency() {
  return useCallback((currency: DisplayCurrency) => {
    persistDisplayCurrency(currency);
  }, []);
}

export function useCurrencyFormat() {
  const currency = useDisplayCurrency();
  const setCurrency = useSetDisplayCurrency();
  const format = useCallback(
    (amount: number | string) => formatCurrencyWithCode(amount, currency),
    [currency],
  );
  return { currency, setCurrency, format };
}
