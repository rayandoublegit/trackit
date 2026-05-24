"use client";
import { useEffect, useState } from "react";

export type Lang = "en" | "fr";

export function useLang(): Lang {
  const [lang, setLang] = useState<Lang>("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const get = (): Lang => {
      const stored = localStorage.getItem("trackit_lang") as Lang | null;
      if (stored === "en" || stored === "fr") return stored;
      const browser = navigator.language.toLowerCase();
      const detected = browser.startsWith("fr") ? "fr" : "en";
      localStorage.setItem("trackit_lang", detected);
      return detected;
    };
    setLang(get());
    setMounted(true);

    const onStorage = (e: StorageEvent) => {
      if (e.key === "trackit_lang") setLang(get());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return mounted ? lang : "en";
}
