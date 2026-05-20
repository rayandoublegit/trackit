"use client";
import { useEffect, useState } from "react";

export type Lang = "en" | "fr";

export function useLang(): Lang {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    const stored = localStorage.getItem("trackit_lang") as Lang | null;
    if (stored === "en" || stored === "fr") {
      setLang(stored);
      return;
    }
    const browser = navigator.language.toLowerCase();
    setLang(browser.startsWith("fr") ? "fr" : "en");
  }, []);

  return lang;
}
