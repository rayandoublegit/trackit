"use client";

import { useSyncExternalStore } from "react";
import {
  getAppLang,
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

/**
 * The app language. The server always renders English, so hydration uses "en"
 * and React switches to the stored language right after — no hydration mismatch
 * for French visitors. Client-side renders read the stored language directly.
 */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getAppLang, () => "en");
}
