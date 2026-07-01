"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { canInviteCreators, type PlanTier } from "@/lib/plan-limits";
import { ActiveDashboardCreatorsPanel } from "./ActiveDashboardCreatorsPanel";
import { UpgradeModal } from "./UpgradeModal";

const BLUE = "#0047FF";
const TRACKIT_LOGO = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

const inviteSecondaryBtn: React.CSSProperties = {
  background: "#FFFFFF",
  color: "#1A1A1A",
  border: "1px solid #E5E5E5",
  borderRadius: 10,
  padding: "12px 20px",
  fontSize: 15,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

export function InvitationsView({
  userId,
  isMobile,
  plan = "free",
  onUpgrade,
  onViewPricing,
}: {
  userId?: string;
  isMobile?: boolean;
  plan?: PlanTier;
  onUpgrade?: () => void;
  onViewPricing?: () => void;
}) {
  const lang = useLang();
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const canInvite = canInviteCreators(plan);

  const pagePad = isMobile ? "56px 20px 40px" : "48px 64px 64px";

  useEffect(() => {
    if (!dropdownOpen) return;
    const onDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [dropdownOpen]);

  const generate = async () => {
    if (!canInvite) {
      setUpgradeModalOpen(true);
      return;
    }
    if (!userId) return;
    setLoading(true);
    setError("");
    setCopied(false);
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
      setDropdownOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const handleCtaClick = () => {
    if (loading) return;
    if (link) {
      setDropdownOpen((open) => !open);
      return;
    }
    void generate();
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const steps =
    lang === "fr"
      ? [
          {
            title: "Partagez le lien",
            description: "Envoyez votre lien d'invitation au créateur par message, email ou DM.",
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ),
          },
          {
            title: "Le créateur s'inscrit",
            description: "Il crée son compte Trackit en quelques clics et rejoint automatiquement votre espace marque.",
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="8" r="4" stroke="#1A1A1A" strokeWidth="1.8" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ),
          },
          {
            title: "Accès au dashboard créateur",
            description: "Il accède à son espace personnel : campagnes, ventes suivies et commissions en temps réel.",
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="#1A1A1A" strokeWidth="1.8" />
                <path d="M3 9h18M9 21V9" stroke="#1A1A1A" strokeWidth="1.8" />
              </svg>
            ),
          },
          {
            title: "Commissions automatiques",
            description: "Chaque vente attribuée remonte dans Trackit et alimente ses paiements sans action manuelle.",
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ),
          },
        ]
      : [
          {
            title: "Share the link",
            description: "Send your invite link to the creator via message, email, or DM.",
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ),
          },
          {
            title: "Creator signs up",
            description: "They create their Trackit account in a few clicks and automatically join your brand workspace.",
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="8" r="4" stroke="#1A1A1A" strokeWidth="1.8" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ),
          },
          {
            title: "Creator dashboard access",
            description: "They get their own space: campaigns, tracked sales, and commissions in real time.",
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="#1A1A1A" strokeWidth="1.8" />
                <path d="M3 9h18M9 21V9" stroke="#1A1A1A" strokeWidth="1.8" />
              </svg>
            ),
          },
          {
            title: "Automatic commissions",
            description: "Every attributed sale flows into Trackit and feeds their payouts with no manual work.",
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ),
          },
        ];

  return (
    <div style={{ minHeight: "100%", background: "#FFFFFF", padding: pagePad }}>
      {upgradeModalOpen && (
        <UpgradeModal
          lang={lang}
          featureKey="invitations"
          onClose={() => setUpgradeModalOpen(false)}
          onPrimary={() => {
            setUpgradeModalOpen(false);
            void onUpgrade?.();
          }}
          showAllPlansLink={Boolean(onViewPricing)}
        />
      )}
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "minmax(260px, 360px) 1fr",
            gap: isMobile ? 40 : 48,
            alignItems: "start",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: isMobile ? 28 : 32,
                fontWeight: 600,
                color: "#1A1A1A",
                margin: "0 0 8px",
                letterSpacing: "-0.03em",
              }}
            >
              {lang === "fr" ? "Inviter un créateur" : "Invite a creator"}
            </h1>
            <p style={{ fontSize: 15, color: "#6B7280", margin: "0 0 40px", lineHeight: 1.55, letterSpacing: "-0.01em" }}>
              {lang === "fr"
                ? "Générez un lien unique et onboarder vos créateurs sur Trackit en quelques minutes, sans configuration complexe."
                : "Generate a unique link and onboard creators on Trackit in minutes, no complex setup required."}
            </p>

            <div ref={dropdownRef} style={{ position: "relative", display: "inline-block" }}>
              <button
                type="button"
                onClick={handleCtaClick}
                disabled={loading}
                aria-expanded={dropdownOpen}
                style={{
                  ...inviteSecondaryBtn,
                  opacity: loading ? 0.6 : 1,
                  cursor: loading ? "default" : "pointer",
                }}
              >
                {loading
                  ? lang === "fr"
                    ? "Génération..."
                    : "Generating..."
                  : lang === "fr"
                    ? "Générer un lien d'invitation"
                    : "Generate an invite link"}
              </button>

              {dropdownOpen && link && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    left: 0,
                    width: isMobile ? "calc(100vw - 40px)" : 380,
                    maxWidth: "calc(100vw - 48px)",
                    background: "#FFFFFF",
                    border: "1px solid #EFEFEF",
                    borderRadius: 14,
                    boxShadow: "0 16px 48px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 71, 255, 0.06)",
                    padding: 16,
                    zIndex: 30,
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#9A9A9A",
                      margin: "0 0 10px",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    {lang === "fr" ? "Lien d'invitation" : "Invite link"}
                  </p>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <input
                      type="text"
                      readOnly
                      value={link}
                      onFocus={(e) => e.target.select()}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid #E5E5E5",
                        fontSize: 13,
                        fontFamily: "'InterDisplay', 'Inter Display', sans-serif",
                        outline: "none",
                        boxSizing: "border-box",
                        color: "#1A1A1A",
                        background: "#FAFAFA",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void copy()}
                      style={{
                        flexShrink: 0,
                        padding: "10px 16px",
                        borderRadius: 8,
                        border: "none",
                        background: copied ? "#1A7F37" : BLUE,
                        color: "#FFFFFF",
                        fontSize: 13,
                        fontWeight: 500,
                        fontFamily: "inherit",
                        cursor: "pointer",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {copied ? (lang === "fr" ? "Copié" : "Copied") : lang === "fr" ? "Copier" : "Copy"}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void generate()}
                    disabled={loading}
                    style={{
                      background: "none",
                      border: "none",
                      color: BLUE,
                      fontSize: 13,
                      fontWeight: 500,
                      fontFamily: "inherit",
                      cursor: loading ? "default" : "pointer",
                      padding: 0,
                      letterSpacing: "-0.01em",
                      opacity: loading ? 0.6 : 1,
                    }}
                  >
                    {lang === "fr" ? "Générer un nouveau lien" : "Generate a new link"}
                  </button>
                </div>
              )}
            </div>

            {error && (
              <p style={{ color: "#dc2626", fontSize: 13, margin: "16px 0 0", lineHeight: 1.45 }}>{error}</p>
            )}
          </div>

          <div
            style={{
              position: "relative",
              borderRadius: 28,
              background: "linear-gradient(145deg, #0047FF 0%, #0038CC 55%, #002D99 100%)",
              padding: isMobile ? "28px 20px" : "32px 28px",
              minWidth: 0,
            }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: 24,
                right: 32,
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.12)",
              }}
            />
            <div
              aria-hidden
              style={{
                position: "absolute",
                bottom: 32,
                left: 24,
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.08)",
              }}
            />

            <div
              style={{
                position: "relative",
                background: "#FFFFFF",
                borderRadius: 20,
                boxShadow: "0 24px 48px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)",
                padding: isMobile ? "22px 18px" : "28px 26px",
                border: "1px solid rgba(255,255,255,0.8)",
              }}
            >
              <div style={{ marginBottom: isMobile ? 20 : 22 }}>
                <img
                  src={TRACKIT_LOGO}
                  alt="Trackit"
                  style={{
                    height: isMobile ? 56 : 72,
                    width: "auto",
                    display: "block",
                    marginBottom: 16,
                  }}
                />
                <p style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
                  {lang === "fr" ? "Comment ça marche" : "How it works"}
                </p>
                <p style={{ fontSize: 13, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
                  {lang === "fr"
                    ? "De l'invitation au dashboard créateur, tout est automatique une fois le lien partagé."
                    : "From invite to creator dashboard, everything runs automatically once the link is shared."}
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                  gap: isMobile ? 18 : "20px 24px",
                }}
              >
                {steps.map((step, index) => (
                  <div key={step.title} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        background: "#F9FAFB",
                        border: "1px solid #F0F0F0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {step.icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: BLUE,
                          margin: "0 0 3px",
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                        }}
                      >
                        {lang === "fr" ? `Étape ${index + 1}` : `Step ${index + 1}`}
                      </p>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", margin: "0 0 3px", letterSpacing: "-0.02em", lineHeight: 1.3 }}>
                        {step.title}
                      </p>
                      <p style={{ fontSize: 13, color: "#6B7280", margin: 0, lineHeight: 1.45, letterSpacing: "-0.01em" }}>
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <ActiveDashboardCreatorsPanel brandId={userId} isMobile={isMobile} />
      </div>
    </div>
  );
}
