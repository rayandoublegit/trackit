"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/useLang";

/**
 * Read-only affiliate link panel for the creator dashboard.
 * Shows the link assigned by the brand, or an empty state.
 */
export function CreatorAffiliateReadPanel({
  lang,
  userId,
  onClose,
}: {
  lang: Lang;
  userId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/creator/affiliate-link?userId=${encodeURIComponent(userId)}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          assigned?: boolean;
          link?: string | null;
          code?: string | null;
        };
        if (cancelled) return;
        if (data?.ok && data.assigned) {
          setLink(data.link ?? null);
          setCode(data.code ?? null);
        } else {
          setLink(null);
          setCode(null);
        }
      } catch {
        if (!cancelled) {
          setLink(null);
          setCode(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const copyText = async (text: string, kind: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 1200,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(440px, 100%)",
          height: "100%",
          background: "#FFF",
          overflowY: "auto",
          padding: "24px 26px 40px",
          boxSizing: "border-box",
          fontFamily: "'InterDisplay', 'Inter Display', sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#9A9A9A",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              padding: 0,
              fontFamily: "inherit",
            }}
          >
            {lang === "fr" ? "Retour" : "Back"}
          </button>
        </div>

        <h2
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "#1A1A1A",
            margin: "0 0 8px",
            letterSpacing: "-0.03em",
          }}
        >
          {lang === "fr" ? "Lien d'affiliation" : "Affiliate link"}
        </h2>
        <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 24px", lineHeight: 1.5 }}>
          {lang === "fr"
            ? "Votre lien de parrainage attribué par la marque."
            : "Your referral link assigned by the brand."}
        </p>

        {loading ? (
          <p style={{ fontSize: 14, color: "#9A9A9A" }}>{lang === "fr" ? "Chargement…" : "Loading…"}</p>
        ) : !link && !code ? (
          <div
            style={{
              border: "1px solid #EFEFEF",
              borderRadius: 12,
              padding: "20px 18px",
              background: "#FAFAFA",
            }}
          >
            <p style={{ margin: 0, fontSize: 14, color: "#7A7A7A", lineHeight: 1.55, letterSpacing: "-0.01em" }}>
              {lang === "fr"
                ? "Aucun lien d'affiliation n'a été encore attribué à votre compte."
                : "No affiliate link has been assigned to your account yet."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {link && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#9A9A9A", marginBottom: 8, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {lang === "fr" ? "Lien" : "Link"}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid #E5E5E5",
                    background: "#FAFAFA",
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 13,
                      color: "#1A1A1A",
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {link}
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyText(link, "link")}
                    style={{
                      flexShrink: 0,
                      border: "none",
                      background: "#1A1A1A",
                      color: "#FFF",
                      borderRadius: 8,
                      padding: "8px 12px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {copied === "link"
                      ? lang === "fr"
                        ? "Copié"
                        : "Copied"
                      : lang === "fr"
                        ? "Copier"
                        : "Copy"}
                  </button>
                </div>
              </div>
            )}

            {code && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#9A9A9A", marginBottom: 8, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {lang === "fr" ? "Code promo" : "Promo code"}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid #E5E5E5",
                    background: "#FAFAFA",
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#1A1A1A",
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {code}
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyText(code, "code")}
                    style={{
                      flexShrink: 0,
                      border: "1px solid #E5E5E5",
                      background: "#FFF",
                      color: "#1A1A1A",
                      borderRadius: 8,
                      padding: "8px 12px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {copied === "code"
                      ? lang === "fr"
                        ? "Copié"
                        : "Copied"
                      : lang === "fr"
                        ? "Copier"
                        : "Copy"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
