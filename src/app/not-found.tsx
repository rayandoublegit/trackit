"use client";

import Link from "next/link";
import { useLang, useLocaleHref } from "@/lib/useLang";

// Client component so /fr/... 404s read in French. React hoists the title and
// robots tags into <head>.
export default function NotFound() {
  const lang = useLang();
  const localeHref = useLocaleHref();
  const fr = lang === "fr";
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'InterDisplay', sans-serif",
        padding: 24,
        textAlign: "center",
      }}
    >
      <title>{fr ? "Page introuvable | Trackit" : "Page not found | Trackit"}</title>
      <meta name="robots" content="noindex, follow" />
      <div>
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 12 }}>404</h1>
        <p style={{ color: "#666", marginBottom: 24 }}>
          {fr ? "Cette page n’existe pas sur Trackit." : "This page doesn't exist on Trackit."}
        </p>
        <Link href={localeHref("/")} style={{ color: "#0047FF", fontWeight: 600, textDecoration: "none" }}>
          {fr ? "← Retour à Trackit" : "← Back to Trackit"}
        </Link>
      </div>
    </main>
  );
}
