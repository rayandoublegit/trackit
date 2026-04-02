import { useState, useEffect } from "react";

export function useLang() {
  const [lang, setLang] = useState<"en" | "fr">("en");

  useEffect(() => {
    const saved = localStorage.getItem("klayan_lang") as "en" | "fr" | null;
    if (saved) {
      setLang(saved);
      return;
    }
    const browserLang = navigator.language || (navigator as any).userLanguage || "";
    if (browserLang.toLowerCase().startsWith("fr")) {
      setLang("fr");
      localStorage.setItem("klayan_lang", "fr");
    } else {
      setLang("en");
      localStorage.setItem("klayan_lang", "en");
    }
  }, []);

  return lang;
}
