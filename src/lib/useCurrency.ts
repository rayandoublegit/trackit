"use client";

import { useCallback } from "react";
import {
  defaultDisplayCurrency,
  getAppLang,
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

/** Formats using the currency implied by app language (fr → EUR, en → USD). */
export function formatCurrency(amount: number | string, lang?: "en" | "fr"): string {
  const resolvedLang = lang ?? (typeof window !== "undefined" ? getAppLang() : "en");
  return formatCurrencyWithCode(amount, defaultDisplayCurrency(resolvedLang));
}

export function useDisplayCurrency(): DisplayCurrency {
  const lang = useLang();
  return defaultDisplayCurrency(lang);
}

export function useCurrencyFormat() {
  const currency = useDisplayCurrency();
  const format = useCallback(
    (amount: number | string) => formatCurrencyWithCode(amount, currency),
    [currency],
  );
  return { currency, format };
}
