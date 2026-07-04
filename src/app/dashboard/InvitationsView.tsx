"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { canInviteCreators, type PlanTier } from "@/lib/plan-limits";
import { ActiveDashboardCreatorsPanel } from "./ActiveDashboardCreatorsPanel";
import { UpgradeModal } from "./UpgradeModal";
import { getSavedCreators } from "@/lib/db";
import { loadAffiliates, saveAffiliates, type StoredAffiliate } from "@/lib/affiliates-storage";
import { CreatorAvatar } from "./CreatorAvatar";

const BLUE = "#0047FF";

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

function slugFromHandle(handle: string) {
  const base = handle.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9]/g, "") || "creator";
  return `${base}_${Math.random().toString(36).slice(2, 8)}`;
}

function codeFromHandle(handle: string, discount = "15") {
  const base = handle.replace(/^@/, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "CREATOR";
  const pct = discount.replace(/\D/g, "") || "15";
  return `${base}${pct}`;
}

function affiliateReferralLink(ref: string) {
  return `${typeof window !== "undefined" ? window.location.origin : "https://trackit.app"}/r/${ref}`;
}

function handlesMatch(a: string, b: string) {
  return a.replace(/^@/, "").toLowerCase() === b.replace(/^@/, "").toLowerCase();
}

type SavedPick = {
  id: string;
  handle: string;
  full_name?: string;
  platform?: string;
  avatar_url?: string;
  discount_code?: string;
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
  const affiliateCardRef = useRef<HTMLDivElement>(null);
  const canInvite = canInviteCreators(plan);

  const [savedCreators, setSavedCreators] = useState<SavedPick[]>([]);
  const [loadingCreators, setLoadingCreators] = useState(true);
  const [affiliateHandle, setAffiliateHandle] = useState("");
  const [affiliateSelectedId, setAffiliateSelectedId] = useState<string | null>(null);
  const [affiliateGenerated, setAffiliateGenerated] = useState<{
    link: string;
    code: string;
    ref: string;
  } | null>(null);
  const [affiliateCopied, setAffiliateCopied] = useState<"link" | "code" | null>(null);
  const [affiliateLoading, setAffiliateLoading] = useState(false);

  const pagePad = isMobile ? "56px 20px 40px" : "48px 64px 64px";

  useEffect(() => {
    if (!userId) {
      setLoadingCreators(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoadingCreators(true);
      try {
        const data = await getSavedCreators(userId);
        if (cancelled) return;
        setSavedCreators(
          data.map((row) => ({
            id: String((row as { id?: string }).id ?? ""),
            handle: String((row as { handle?: string; username?: string }).handle ?? (row as { username?: string }).username ?? ""),
            full_name: typeof (row as { full_name?: string }).full_name === "string" ? (row as { full_name: string }).full_name : undefined,
            platform: typeof (row as { platform?: string }).platform === "string" ? (row as { platform: string }).platform : undefined,
            avatar_url: typeof (row as { avatar_url?: string }).avatar_url === "string" ? (row as { avatar_url: string }).avatar_url : undefined,
            discount_code: typeof (row as { discount_code?: string }).discount_code === "string" ? (row as { discount_code: string }).discount_code : undefined,
          }))
        );
      } finally {
        if (!cancelled) setLoadingCreators(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

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

  const selectAffiliateCreator = (creator: SavedPick) => {
    const normalized = creator.handle.replace(/^@/, "");
    setAffiliateSelectedId(creator.id);
    setAffiliateHandle(normalized ? `@${normalized}` : "");
    setAffiliateGenerated(null);
    setAffiliateCopied(null);
  };

  const generateAffiliate = async () => {
    if (!userId) return;
    const handle = affiliateHandle.trim().replace(/^@/, "");
    if (!handle) return;

    setAffiliateLoading(true);
    try {
      const existing = loadAffiliates(userId).find((a) => handlesMatch(a.creator, handle));
      const selected = savedCreators.find((c) => c.id === affiliateSelectedId);
      const nextRef = existing?.ref || slugFromHandle(handle);
      const nextCode = existing?.code || selected?.discount_code || codeFromHandle(handle);
      const nextLink = affiliateReferralLink(nextRef);

      const row: StoredAffiliate = {
        creator: `@${handle}`,
        platform: selected?.platform || "TikTok",
        ref: nextRef,
        code: nextCode,
        clicks: existing?.clicks ?? 0,
        conversions: existing?.conversions ?? 0,
        sales: existing?.sales ?? 0,
        commission: existing?.commission ?? 0,
        status: existing?.status ?? "Active",
      };
      const list = loadAffiliates(userId);
      saveAffiliates(userId, [row, ...list.filter((a) => !handlesMatch(a.creator, handle))]);

      await fetch("/api/affiliates/set-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          creatorId: selected?.id || undefined,
          handle: `@${handle}`,
          code: nextCode,
          ref: nextRef,
        }),
      }).catch(() => {});

      setAffiliateGenerated({ link: nextLink, code: nextCode, ref: nextRef });
    } finally {
      setAffiliateLoading(false);
    }
  };

  const copyAffiliate = async (text: string, kind: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setAffiliateCopied(kind);
      setTimeout(() => setAffiliateCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (link && linkCardRef.current) {
      linkCardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [link]);

  useEffect(() => {
    if (affiliateGenerated && affiliateCardRef.current) {
      affiliateCardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [affiliateGenerated]);

  const canGenerateAffiliate = affiliateHandle.trim().replace(/^@/, "").length > 0;

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
              ? "Invitez un créateur à rejoindre votre programme et générez son lien d'affiliation."
              : "Invite a creator to join your program and generate their affiliate link."}
          </p>
        </header>

        <section
          ref={linkCardRef}
          style={{
            border: "1px solid #EFEFEF",
            borderRadius: 16,
            background: "#FAFAFA",
            padding: isMobile ? "24px 20px" : "32px 28px",
            marginBottom: isMobile ? 20 : 24,
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
                      fontFamily: "'InterDisplay', 'Inter Display', sans-serif",
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

        <section
          ref={affiliateCardRef}
          style={{
            border: "1px solid #EFEFEF",
            borderRadius: 16,
            background: "#FFFFFF",
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
              {lang === "fr" ? "Lien d'affiliation" : "Affiliate link"}
            </h2>
            <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 20px", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
              {lang === "fr"
                ? "Générez le lien d'affiliation du créateur. Il apparaîtra dans Gérer vos créateurs et sur le dashboard du créateur."
                : "Generate the creator's affiliate link. It will appear in Manage creators and on the creator dashboard."}
            </p>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 10 }}>
                {lang === "fr" ? "Créateurs sauvegardés" : "Saved creators"}
              </div>
              {loadingCreators ? (
                <div style={{ fontSize: 13, color: "#9A9A9A" }}>{lang === "fr" ? "Chargement…" : "Loading…"}</div>
              ) : savedCreators.length === 0 ? (
                <div style={{ fontSize: 13, color: "#9A9A9A", padding: "12px 14px", background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 12 }}>
                  {lang === "fr"
                    ? "Aucun créateur sauvegardé. Ajoutez-en depuis Gérer, ou saisissez un pseudo ci-dessous."
                    : "No saved creators yet. Add some from Manage, or enter a handle below."}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
                  {savedCreators.map((c) => {
                    const active = affiliateSelectedId === c.id;
                    return (
                      <button
                        key={c.id || c.handle}
                        type="button"
                        onClick={() => selectAffiliateCreator(c)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: active ? "1px solid #1A1A1A" : "1px solid #EFEFEF",
                          background: active ? "#FAFAFA" : "#FFF",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          textAlign: "left",
                        }}
                      >
                        <CreatorAvatar src={c.avatar_url} username={c.handle} displayName={c.full_name || c.handle} size={32} alt={c.handle} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}>{c.full_name || c.handle}</div>
                          <div style={{ fontSize: 12, color: "#9A9A9A" }}>@{c.handle.replace(/^@/, "")}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 8 }}>
                {lang === "fr" ? "Ou saisissez un pseudo" : "Or enter a handle"}
              </label>
              <input
                type="text"
                value={affiliateHandle}
                onChange={(e) => {
                  setAffiliateHandle(e.target.value);
                  setAffiliateSelectedId(null);
                  setAffiliateGenerated(null);
                }}
                placeholder="@creator"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #E5E5E5",
                  fontSize: 14,
                  fontFamily: "inherit",
                  color: "#1A1A1A",
                }}
              />
            </div>

            {!affiliateGenerated ? (
              <button
                type="button"
                onClick={() => void generateAffiliate()}
                disabled={!canGenerateAffiliate || affiliateLoading}
                style={{
                  ...inviteSecondaryBtn,
                  opacity: !canGenerateAffiliate || affiliateLoading ? 0.5 : 1,
                  cursor: !canGenerateAffiliate || affiliateLoading ? "default" : "pointer",
                }}
              >
                {affiliateLoading
                  ? lang === "fr"
                    ? "Génération…"
                    : "Generating…"
                  : lang === "fr"
                    ? "Générer"
                    : "Generate"}
              </button>
            ) : (
              <div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#9A9A9A", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {lang === "fr" ? "Lien généré" : "Generated link"}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input
                      type="text"
                      readOnly
                      value={affiliateGenerated.link}
                      onFocus={(e) => e.target.select()}
                      style={{
                        flex: "1 1 220px",
                        minWidth: 0,
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: "1px solid #E5E5E5",
                        fontSize: 14,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        color: "#1A1A1A",
                        background: "#FAFAFA",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void copyAffiliate(affiliateGenerated.link, "link")}
                      style={{
                        flexShrink: 0,
                        padding: "12px 18px",
                        borderRadius: 10,
                        border: "none",
                        background: "#1A1A1A",
                        color: "#FFF",
                        fontSize: 14,
                        fontWeight: 500,
                        fontFamily: "inherit",
                        cursor: "pointer",
                      }}
                    >
                      {affiliateCopied === "link"
                        ? lang === "fr"
                          ? "Copié"
                          : "Copied"
                        : lang === "fr"
                          ? "Copier"
                          : "Copy"}
                    </button>
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#9A9A9A", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {lang === "fr" ? "Code promo" : "Promo code"}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 16, fontWeight: 700, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: "0.04em" }}>
                      {affiliateGenerated.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => void copyAffiliate(affiliateGenerated.code, "code")}
                      style={{
                        border: "1px solid #E5E5E5",
                        background: "#FFF",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {affiliateCopied === "code"
                        ? lang === "fr"
                          ? "Copié"
                          : "Copied"
                        : lang === "fr"
                          ? "Copier le code"
                          : "Copy code"}
                    </button>
                  </div>
                </div>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: "#7A7A7A", lineHeight: 1.45 }}>
                  {lang === "fr"
                    ? "Le lien et le code sont préremplis dans Gérer vos créateurs. Le créateur les verra sur son dashboard."
                    : "The link and code are prefilled in Manage creators. The creator will see them on their dashboard."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setAffiliateGenerated(null);
                    setAffiliateHandle("");
                    setAffiliateSelectedId(null);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: BLUE,
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {lang === "fr" ? "Générer pour un autre créateur" : "Generate for another creator"}
                </button>
              </div>
            )}
          </div>
        </section>

        <ActiveDashboardCreatorsPanel brandId={userId} isMobile={isMobile} compactTop />
      </div>
    </div>
  );
}
