"use client";

import { useEffect, useState } from "react";
import {
  getAppLang,
  LOCALE_UPDATED_EVENT,
  TRACKIT_LANG_KEY,
  type AppLang,
} from "@/lib/locale-preferences";

export type Lang = AppLang;

export function useLang(): Lang {
  const [lang, setLang] = useState<Lang>(() =>
    typeof window !== "undefined" ? getAppLang() : "en"
  );

  useEffect(() => {
    setLang(getAppLang());

    const refresh = () => setLang(getAppLang());
    const onStorage = (e: StorageEvent) => {
      if (e.key === TRACKIT_LANG_KEY) refresh();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(LOCALE_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LOCALE_UPDATED_EVENT, refresh);
    };
  }, []);

  return lang;
}
