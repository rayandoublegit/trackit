import { useState, useEffect } from "react";

export function useLang() {
  const [lang, setLang] = useState<"en" | "fr">("en");

  useEffect(() => {
    const saved = localStorage.getItem("klayan_lang") as "en" | "fr" | null;
    if (saved) {
      setLang(saved);
    } else {
      const browserLang = navigator.language || (navigator as any).userLanguage || "";
      const detected = browserLang.toLowerCase().startsWith("fr") ? "fr" : "en";
      setLang(detected);
      localStorage.setItem("klayan_lang", detected);
    }

    const handler = (e: Event) => {
      const val = (e as CustomEvent).detail;
      if (val === "en" || val === "fr") setLang(val);
    };
    window.addEventListener("klayan_lang_change", handler);
    return () => window.removeEventListener("klayan_lang_change", handler);
  }, []);

  return lang;
}
