"use client";
import { useEffect, useState } from "react";

export default function V2Page() {
  const [lang, setLang] = useState("en");
  useEffect(() => {
    const saved = localStorage.getItem("klayan_lang");
    if (saved) setLang(saved);
    else if (navigator.language.startsWith("fr")) setLang("fr");
  }, []);

  return (
    <div style={{ background: "#000", minHeight: "100vh" }}>
      <div style={{ padding: "24px 32px" }}>
        <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.6)", textDecoration: "none", fontSize: 14, fontFamily: "'Europa Grotesk No 2 SH', sans-serif" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          {lang === "fr" ? "Retour" : "Back"}
        </a>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
        <div style={{ overflow: "hidden", maxWidth: "min(65%, 90vw)", marginLeft: "5%" }}>
          <img
            src={lang === "fr" ? "/images/titlefrench.png" : "/images/titleusa.png"}
            alt="Title"
            style={{ width: "100%", height: "auto", marginTop: lang === "fr" ? -30 : -60, display: "block" }}
          />
        </div>
        <img
          src={lang === "fr" ? "/images/uifrench.png" : "/images/uienglish.png"}
          alt="UI Preview"
          style={{ maxWidth: "80%", height: "auto", marginTop: 20 }}
        />
        <img
          src={lang === "fr" ? "/images/newtitlefrench.png" : "/images/newtitleenglish.png"}
          alt="New Title"
          style={{ width: 300, height: "auto", marginTop: 48, marginRight: "3%" }}
        />
      </div>
      </div>
    </div>
  );
}
