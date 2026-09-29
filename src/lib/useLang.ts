"use client";

import { createContext, createElement, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";
import {
  getAppLang,
  localizeHref,
  LOCALE_UPDATED_EVENT,
  TRACKIT_LANG_KEY,
  type AppLang,
} from "@/lib/locale-preferences";

export type Lang = AppLang;

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === TRACKIT_LANG_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(LOCALE_UPDATED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LOCALE_UPDATED_EVENT, onChange);
  };
}

// Pages under /fr render in French on the server too (no English flash, and
// search engines read French). Everywhere else the address and stored choice
// decide on the client.
const LangContext = createContext<Lang | null>(null);

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return createElement(LangContext.Provider, { value: lang }, children);
}

export function useLang(): Lang {
  const forced = useContext(LangContext);
  const current = useSyncExternalStore(subscribe, getAppLang, () => forced ?? "en");
  return forced ?? current;
}

/** Internal links that stay in the current language (/pricing → /fr/pricing). */
export function useLocaleHref(): (href: string) => string {
  const lang = useLang();
  return useCallback((href: string) => localizeHref(href, lang), [lang]);
}
