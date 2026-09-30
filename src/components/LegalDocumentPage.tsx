"use client";

import Link from "next/link";
import { useLang } from "@/lib/useLang";
import { getLegalContent, type LegalDocumentType } from "@/lib/legal-content";
import { legalLinks } from "@/lib/legal-links";
import { ManageCookiesLink } from "@/components/CookieConsent";

const TRACKIT_LOGO = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

const TYPE_TO_KEY = { legal: "legal", terms: "terms", privacy: "privacy", cookies: "cookies" } as const;

const textStyle = {
  fontSize: 15,
  lineHeight: 1.65,
  color: "#4B5563",
  letterSpacing: "-0.01em",
} as const;

const linkStyle = {
  fontSize: 14,
  color: "#0047FF",
  textDecoration: "none",
  letterSpacing: "-0.02em",
  fontWeight: 500,
} as const;

export function LegalDocumentPage({ type }: { type: LegalDocumentType }) {
  const lang = useLang();
  const doc = getLegalContent(type, lang);
  const fr = lang === "fr";
  const homeHref = fr ? "/fr" : "/";
  const backLabel = fr ? "← Retour à l'accueil" : "← Back to home";
  const links = legalLinks(lang);
  const currentKey = TYPE_TO_KEY[type];

  return (
    <div
      lang={lang}
      style={{
        minHeight: "100vh",
        background: "#FFFFFF",
        color: "#1A1A1A",
        fontFamily: "'InstrumentSans', sans-serif",
        padding: "48px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href={homeHref} style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 40, textDecoration: "none" }}>
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
            {doc.lastUpdatedLabel}
            {fr ? " : " : ": "}
            {doc.lastUpdated}
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
              {(() => {
                // Paragraphs up to the last one ending with ":" introduce the list; the rest follow it.
                const list = section.list ?? [];
                const leadCount = list.length
                  ? section.paragraphs.reduce((n, p, i) => (p.trimEnd().endsWith(":") ? i + 1 : n), 0)
                  : 0;
                const renderParagraph = (paragraph: string, key: string) => (
                  <p key={key} style={{ ...textStyle, margin: "0 0 14px" }}>
                    {paragraph}
                  </p>
                );
                return (
                  <>
                    {section.paragraphs.slice(0, leadCount).map((p, i) => renderParagraph(p, `lead-${i}`))}
                    {list.length > 0 && <List items={list} />}
                    {section.paragraphs.slice(leadCount).map((p, i) => renderParagraph(p, `p-${i}`))}
                  </>
                );
              })()}
              {section.table && (
                <div style={{ overflowX: "auto", margin: "4px 0 14px", border: "1px solid #EFEFEF", borderRadius: 12 }}>
                  <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", fontSize: 13.5, lineHeight: 1.5 }}>
                    <thead>
                      <tr>
                        {section.table.headers.map((header) => (
                          <th
                            key={header}
                            scope="col"
                            style={{
                              textAlign: "left",
                              padding: "10px 12px",
                              background: "#FAFAFA",
                              color: "#1A1A1A",
                              fontWeight: 600,
                              borderBottom: "1px solid #EFEFEF",
                            }}
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.table.rows.map((row, r) => (
                        <tr key={r}>
                          {row.map((cell, c) => (
                            <td
                              key={c}
                              style={{
                                padding: "10px 12px",
                                color: c === 0 ? "#1A1A1A" : "#4B5563",
                                fontFamily: c === 0 ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
                                fontSize: c === 0 ? 12.5 : undefined,
                                verticalAlign: "top",
                                borderTop: r === 0 ? undefined : "1px solid #F3F3F3",
                              }}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(section.links?.length || section.manageCookies) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center" }}>
                  {section.links?.map((link) => (
                    <Link key={link.href} href={link.href} style={linkStyle}>
                      {link.label} →
                    </Link>
                  ))}
                  {section.manageCookies && (
                    <ManageCookiesLink
                      style={{
                        ...linkStyle,
                        padding: "8px 14px",
                        border: "1px solid #D9D9D9",
                        borderRadius: 10,
                        color: "#1A1A1A",
                      }}
                    />
                  )}
                </div>
              )}
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
          <Link href={homeHref} style={{ fontSize: 14, color: "#7A7A7A", textDecoration: "none", letterSpacing: "-0.02em" }}>
            {backLabel}
          </Link>
          <nav aria-label={fr ? "Informations légales" : "Legal"} style={{ display: "flex", flexWrap: "wrap", gap: "10px 18px" }}>
            {links.map((link) =>
              link.key === currentKey ? (
                <span key={link.key} aria-current="page" style={{ ...linkStyle, color: "#1A1A1A" }}>
                  {link.label}
                </span>
              ) : (
                <Link key={link.key} href={link.href} style={linkStyle}>
                  {link.label}
                </Link>
              ),
            )}
            <ManageCookiesLink style={{ ...linkStyle, color: "#7A7A7A", fontWeight: 400 }} />
          </nav>
        </footer>
      </div>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul style={{ ...textStyle, margin: "0 0 14px", paddingLeft: 22 }}>
      {items.map((item) => (
        <li key={item} style={{ marginBottom: 8 }}>
          {item}
        </li>
      ))}
    </ul>
  );
}
