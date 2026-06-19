"use client";

import { useState } from "react";
import { useLang } from "@/lib/useLang";

const BLUE = "#0047FF";
const TRACKIT_LOGO = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

export function InvitationsView({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const generate = async () => {
    if (!userId) return;
    setLoading(true); setError(""); setCopied(false);
    try {
      const res = await fetch("/api/invites/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: userId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data?.token) {
        setError(data?.error || (lang === "fr" ? "Impossible de générer le lien." : "Could not generate the link."));
        return;
      }
      setLink(`${window.location.origin}/invite/${data.token}`);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  const px = isMobile ? 16 : 40;

  return (
    <>
      <style>{`
        @keyframes inviteFadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes invitePulse {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50% { transform: scale(1.06); opacity: 0.85; }
        }
        @keyframes inviteSuccessIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .invite-hero-card {
          animation: inviteFadeUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .invite-glow {
          animation: invitePulse 3.5s ease-in-out infinite;
        }
        .invite-link-result {
          animation: inviteSuccessIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>

      <div
        style={{
          paddingTop: isMobile ? 56 : 40,
          paddingRight: px,
          paddingBottom: isMobile ? 16 : 24,
          paddingLeft: px,
          borderBottom: "1px solid #EFEFEF",
          background: "#FFFFFF",
        }}
      >
        <div style={{ maxWidth: 960 }}>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: "#1A1A1A",
              margin: 0,
              letterSpacing: "-0.04em",
            }}
          >
            {lang === "fr" ? "Inviter un créateur" : "Invite a creator"}
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#7A7A7A",
              margin: "8px 0 0",
              letterSpacing: "-0.02em",
              lineHeight: 1.5,
              maxWidth: 520,
            }}
          >
            {lang === "fr"
              ? "Un lien unique pour onboarder vos créateurs et lancer vos campagnes en quelques minutes."
              : "One unique link to onboard creators and launch campaigns in minutes."}
          </p>
        </div>
      </div>

      <div
        style={{
          paddingLeft: px,
          paddingRight: px,
          paddingTop: isMobile ? 24 : 32,
          paddingBottom: isMobile ? 40 : 56,
          background: "#FFFFFF",
          minHeight: "100vh",
          flex: 1,
        }}
      >
        <div style={{ maxWidth: 960 }}>
          <div
            className="invite-hero-card"
            style={{
              position: "relative",
              overflow: "hidden",
              border: "1px solid #EFEFEF",
              borderRadius: 20,
              padding: isMobile ? "24px 20px" : "32px 32px 28px",
              marginBottom: 0,
              background: "#FFFFFF",
              boxShadow: "0 12px 40px rgba(0, 71, 255, 0.06)",
            }}
          >
            <div
              className="invite-glow"
              aria-hidden
              style={{
                position: "absolute",
                top: -40,
                right: -40,
                width: 160,
                height: 160,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(0,71,255,0.12) 0%, transparent 70%)",
                pointerEvents: "none",
              }}
            />

            <div style={{ position: "relative", marginBottom: 22 }}>
              <div style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", marginBottom: 6 }}>
                {lang === "fr" ? "Votre lien d'invitation" : "Your invite link"}
              </div>
              <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0, lineHeight: 1.5, letterSpacing: "-0.01em" }}>
                {lang === "fr"
                  ? "Le créateur s'inscrit, accède à son espace et reçoit ses commissions automatiquement."
                  : "The creator signs up, gets their own space and receives commissions automatically."}
              </p>
            </div>

            {!link ? (
              <button
                type="button"
                className="hero-cta-shopify"
                onClick={generate}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "14px 20px",
                  fontSize: 15,
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? "default" : "pointer",
                }}
              >
                {loading
                  ? (lang === "fr" ? "Génération..." : "Generating...")
                  : (lang === "fr" ? "Générer un lien d'invitation" : "Generate an invite link")}
              </button>
            ) : (
              <div className="invite-link-result">
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#6B6B6B",
                    marginBottom: 8,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {lang === "fr" ? "Lien prêt à partager" : "Link ready to share"}
                </label>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                  <input
                    type="text"
                    readOnly
                    value={link}
                    onFocus={(e) => e.target.select()}
                    style={{
                      flex: "1 1 280px",
                      minWidth: 0,
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid #E5E5E5",
                      fontSize: 13,
                      fontFamily: "monospace",
                      outline: "none",
                      boxSizing: "border-box",
                      color: "#1A1A1A",
                      background: "#FFFFFF",
                      letterSpacing: "-0.01em",
                    }}
                  />
                  <button
                    type="button"
                    onClick={copy}
                    className="hero-cta-shopify"
                    style={{
                      padding: "12px 22px",
                      fontSize: 14,
                      background: copied ? "#1A7F37" : BLUE,
                      boxShadow: copied ? "0 8px 24px rgba(26,127,55,0.3)" : undefined,
                    }}
                  >
                    {copied ? (lang === "fr" ? "Copié !" : "Copied!") : (lang === "fr" ? "Copier" : "Copy")}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => { setLink(""); setCopied(false); }}
                  style={{
                    background: "none",
                    border: "none",
                    color: BLUE,
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    padding: 0,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {lang === "fr" ? "Générer un nouveau lien" : "Generate a new link"}
                </button>
              </div>
            )}

            {error && (
              <div
                style={{
                  marginTop: 16,
                  fontSize: 14,
                  color: "#992323",
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(153,35,35,0.06)",
                  border: "1px solid rgba(153,35,35,0.1)",
                }}
              >
                {error}
              </div>
            )}
          </div>

          <div
            style={{
              paddingTop: 24,
              marginTop: isMobile ? 32 : 40,
              borderTop: "1px solid #EFEFEF",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", letterSpacing: "-0.01em" }}>
              {lang === "fr" ? "Propulsé par" : "Powered by"}
            </span>
            <img src={TRACKIT_LOGO} alt="Trackit" style={{ height: 36, width: "auto", opacity: 0.9 }} />
          </div>
        </div>
      </div>
    </>
  );
}
