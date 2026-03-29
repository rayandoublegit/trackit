import { useState, useEffect } from "react";

export function useLang() {
  const [lang, setLang] = useState<"en" | "fr">("en");

  useEffect(() => {
    const saved = localStorage.getItem("klayan_lang") as "en" | "fr" | null;
    if (saved) setLang(saved);
  }, []);

  return lang;
}
