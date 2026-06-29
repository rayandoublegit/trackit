"use client";

import Link from "next/link";
import { useLang } from "@/lib/useLang";
import { getPrivacyContent, getTermsContent } from "@/lib/legal-content";

const TRACKIT_LOGO = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

export function LegalDocumentPage({ type }: { type: "privacy" | "terms" }) {
  const lang = useLang();
  const doc = type === "privacy" ? getPrivacyContent(lang) : getTermsContent(lang);
  const backLabel = lang === "fr" ? "← Retour à l'accueil" : "← Back to home";
  const otherLabel =
    doc.title.includes("Privacy") || doc.title.includes("confidentialité")
      ? lang === "fr"
        ? "Conditions générales"
        : "Terms & Conditions"
      : lang === "fr"
        ? "Politique de confidentialité"
        : "Privacy Policy";
  const otherPath =
    doc.title.includes("Privacy") || doc.title.includes("confidentialité") ? "/terms" : "/privacy";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#FFFFFF",
        color: "#1A1A1A",
        fontFamily: "'InstrumentSans', sans-serif",
        padding: "48px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 40, textDecoration: "none" }}>
          <img src={TRACKIT_LOGO} alt="Trackit" style={{ height: 36, width: "auto" }} />
        </Link>

        <header style={{ marginBottom: 40, paddingBottom: 32, borderBottom: "1px solid #EFEFEF" }}>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: "-0.04em",
              margin: "0 0 12px",
              lineHeight: 1.15,
              fontFamily: "'InterDisplay', sans-serif",
            }}
          >
            {doc.title}
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.01em" }}>
            {doc.lastUpdatedLabel} : {doc.lastUpdated}
          </p>
        </header>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: "#4B5563", margin: "0 0 40px", letterSpacing: "-0.01em" }}>
          {doc.intro}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          {doc.sections.map((section) => (
            <section key={section.title}>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: "-0.03em",
                  margin: "0 0 14px",
                  fontFamily: "'InterDisplay', sans-serif",
                  color: "#1A1A1A",
                }}
              >
                {section.title}
              </h2>
              {section.list && section.list.length > 0 && (
                <ul
                  style={{
                    margin: section.paragraphs.length ? "0 0 14px" : 0,
                    paddingLeft: 22,
                    color: "#4B5563",
                    fontSize: 15,
                    lineHeight: 1.65,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {section.list.map((item) => (
                    <li key={item} style={{ marginBottom: 8 }}>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
              {section.paragraphs.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 40)}
                  style={{
                    margin: "0 0 14px",
                    fontSize: 15,
                    lineHeight: 1.65,
                    color: "#4B5563",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <footer
          style={{
            marginTop: 56,
            paddingTop: 32,
            borderTop: "1px solid #EFEFEF",
            display: "flex",
            flexWrap: "wrap",
            gap: 20,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link
            href="/"
            style={{ fontSize: 14, color: "#7A7A7A", textDecoration: "none", letterSpacing: "-0.02em" }}
          >
            {backLabel}
          </Link>
          <Link
            href={otherPath}
            style={{ fontSize: 14, color: "#0047FF", textDecoration: "none", letterSpacing: "-0.02em", fontWeight: 500 }}
          >
            {otherLabel} →
          </Link>
        </footer>
      </div>
    </div>
  );
}
