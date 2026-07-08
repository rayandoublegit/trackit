"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { canInviteCreators, type PlanTier } from "@/lib/plan-limits";
import { ActiveDashboardCreatorsPanel } from "./ActiveDashboardCreatorsPanel";
import { UpgradeModal } from "./UpgradeModal";

const BLUE = "#0047FF";
const externFont = "'InterDisplay', 'Inter Display', sans-serif";

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
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const linkCardRef = useRef<HTMLDivElement>(null);
  const canInvite = canInviteCreators(plan);

  const pagePad = isMobile ? "56px 20px 40px" : "48px 64px 64px";

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
    } finally {
      setLoading(false);
    }
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

  useEffect(() => {
    if (link && linkCardRef.current) {
      linkCardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [link]);

  return (
    <div style={{ minHeight: "100%", background: "#FFFFFF", padding: pagePad }}>
      {upgradeModalOpen && (
        <UpgradeModal
          lang={lang}
          featureKey="invitations"
          currentPlan={plan}
          onClose={() => setUpgradeModalOpen(false)}
          showAllPlansLink={Boolean(onViewPricing)}
        />
      )}
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <header style={{ marginBottom: isMobile ? 24 : 28 }}>
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
          <p style={{ fontSize: 15, color: "#6B7280", margin: 0, lineHeight: 1.55, letterSpacing: "-0.01em" }}>
            {lang === "fr"
              ? "Invitez un créateur à rejoindre votre programme."
              : "Invite a creator to join your program."}
          </p>
        </header>

        <section
          ref={linkCardRef}
          style={{
            border: "1px solid #EFEFEF",
            borderRadius: 16,
            background: "#FAFAFA",
            padding: isMobile ? "24px 20px" : "32px 28px",
            marginBottom: isMobile ? 28 : 32,
          }}
        >
          <div style={{ maxWidth: 720 }}>
            <h2
              style={{
                fontSize: isMobile ? 17 : 18,
                fontWeight: 600,
                color: "#1A1A1A",
                margin: "0 0 8px",
                letterSpacing: "-0.02em",
              }}
            >
              {lang === "fr" ? "Lien d'invitation" : "Invite link"}
            </h2>
            <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 20px", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
              {lang === "fr"
                ? "Partagez ce lien par message, email ou DM. Le créateur pourra créer son compte et rejoindre votre espace."
                : "Share this link via message, email, or DM. The creator can create their account and join your workspace."}
            </p>

            {!link ? (
              <button
                type="button"
                onClick={() => void generate()}
                disabled={loading}
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
            ) : (
              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                  <input
                    type="text"
                    readOnly
                    value={link}
                    onFocus={(e) => e.target.select()}
                    style={{
                      flex: "1 1 220px",
                      minWidth: 0,
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid #E5E5E5",
                      fontSize: 14,
                      fontFamily: externFont,
                      letterSpacing: "-0.02em",
                      outline: "none",
                      boxSizing: "border-box",
                      color: "#1A1A1A",
                      background: "#FFFFFF",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void copy()}
                    style={{
                      flexShrink: 0,
                      padding: "12px 18px",
                      borderRadius: 10,
                      border: "none",
                      background: copied ? "#1A7F37" : "#1A1A1A",
                      color: "#FFFFFF",
                      fontSize: 14,
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

            {error && (
              <p style={{ color: "#dc2626", fontSize: 13, margin: "16px 0 0", lineHeight: 1.45 }}>{error}</p>
            )}
          </div>
        </section>

        <ActiveDashboardCreatorsPanel brandId={userId} isMobile={isMobile} compactTop />
      </div>
    </div>
  );
}
