"use client";

import { useState } from "react";
import { useLang } from "@/lib/useLang";

const BLUE = "#0047FF";
const TRACKIT_LOGO = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

const PROCESS_STEPS = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M10 13a5 5 0 007.07 0l1.41-1.41a5 5 0 00-7.07-7.07L10 5.93" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M14 11a5 5 0 00-7.07 0L5.52 12.41a5 5 0 007.07 7.07L14 18.07" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    fr: { title: "Générez votre lien", desc: "Un lien d'invitation unique, prêt à partager en un clic." },
    en: { title: "Generate your link", desc: "A unique invite link, ready to share in one click." },
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M22 2L11 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
    fr: { title: "Envoyez-le au créateur", desc: "Par DM, email ou message — le créateur rejoint en quelques secondes." },
    en: { title: "Send it to the creator", desc: "Via DM, email or message — they join in seconds." },
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3 9h18" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="8" cy="14" r="1.5" fill="currentColor" />
      </svg>
    ),
    fr: { title: "Il accède à son espace", desc: "Dashboard dédié, codes promo et suivi des ventes en autonomie." },
    en: { title: "They get their own space", desc: "Dedicated dashboard, promo codes and sales tracking on their own." },
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 100 7H14a3.5 3.5 0 110 7H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    fr: { title: "Commissions versées", desc: "Chaque vente Shopify est trackée et payée automatiquement." },
    en: { title: "Commissions paid out", desc: "Every Shopify sale is tracked and paid automatically." },
  },
] as const;

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
        .invite-step {
          animation: inviteFadeUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
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
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <img src={TRACKIT_LOGO} alt="Trackit" style={{ height: isMobile ? 22 : 26, width: "auto" }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: BLUE,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {lang === "fr" ? "Invitations" : "Invitations"}
            </span>
          </div>
          <h1
            style={{
              fontSize: isMobile ? 26 : 30,
              fontWeight: 650,
              color: "#1A1A1A",
              margin: 0,
              letterSpacing: "-0.04em",
              lineHeight: 1.15,
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
              marginBottom: isMobile ? 32 : 40,
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
            <div
              aria-hidden
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 3,
                background: `linear-gradient(90deg, ${BLUE} 0%, rgba(0,71,255,0.15) 100%)`,
              }}
            />

            <div style={{ position: "relative", marginBottom: 22 }}>
              <div style={{ fontSize: 16, fontWeight: 650, color: "#1A1A1A", letterSpacing: "-0.03em", marginBottom: 6 }}>
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

          <div style={{ marginBottom: isMobile ? 32 : 40 }}>
            <div style={{ marginBottom: isMobile ? 20 : 28 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: BLUE,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                {lang === "fr" ? "Comment ça marche" : "How it works"}
              </div>
              <h2
                style={{
                  fontSize: isMobile ? 20 : 22,
                  fontWeight: 650,
                  color: "#1A1A1A",
                  margin: 0,
                  letterSpacing: "-0.03em",
                }}
              >
                {lang === "fr" ? "Le process en 4 étapes" : "The 4-step process"}
              </h2>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
                gap: isMobile ? 12 : 20,
              }}
            >
              {PROCESS_STEPS.map((step, i) => {
                const copy = lang === "fr" ? step.fr : step.en;
                return (
                  <div
                    key={copy.title}
                    className="invite-step"
                    style={{
                      animationDelay: `${0.15 + i * 0.1}s`,
                      border: "1px solid #EFEFEF",
                      borderRadius: 18,
                      padding: isMobile ? "20px 20px 20px 60px" : "26px 22px 24px",
                      background: "#FFFFFF",
                      position: "relative",
                      minHeight: isMobile ? undefined : 220,
                      transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "rgba(0,71,255,0.25)";
                      e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,71,255,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#EFEFEF";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <div
                      style={{
                        position: isMobile ? "absolute" : "static",
                        left: isMobile ? 18 : undefined,
                        top: isMobile ? 20 : undefined,
                        width: isMobile ? 36 : 40,
                        height: isMobile ? 36 : 40,
                        borderRadius: 12,
                        background: "rgba(0,71,255,0.08)",
                        border: "1px solid rgba(0,71,255,0.12)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: BLUE,
                        marginBottom: isMobile ? 0 : 18,
                      }}
                    >
                      {step.icon}
                    </div>
                    <div
                      style={{
                        position: "absolute",
                        top: isMobile ? 20 : 18,
                        right: 18,
                        fontSize: 12,
                        fontWeight: 700,
                        color: "rgba(0,71,255,0.35)",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 650, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 8, lineHeight: 1.35 }}>
                      {copy.title}
                    </div>
                    <p style={{ fontSize: isMobile ? 12 : 13, color: "#7A7A7A", margin: 0, lineHeight: 1.55, letterSpacing: "-0.01em" }}>
                      {copy.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            style={{
              paddingTop: 24,
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
