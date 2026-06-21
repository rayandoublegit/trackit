"use client";

import { useLang } from "@/lib/useLang";
import { formatCurrency } from "@/lib/useCurrency";
import { useCreatorStats } from "@/lib/useCreatorStats";
import type { DashboardView } from "@/lib/dashboard-view-storage";

const BLUE = "#0047FF";

type GettingStarted = {
  shopify: boolean;
  creators: boolean;
  outreach: boolean;
  sales: boolean;
  creatorsCount: number;
  outreachCount: number;
  salesCount: number;
};


function OverviewHeader({
  isMobile,
  title,
  subtitle,
}: {
  isMobile?: boolean;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        paddingTop: isMobile ? 56 : 40,
        paddingRight: isMobile ? 16 : 40,
        paddingBottom: isMobile ? 16 : 28,
        paddingLeft: isMobile ? 16 : 40,
        borderBottom: "1px solid #EFEFEF",
        background: "#FFFFFF",
      }}
    >
      <h1 style={{ fontSize: isMobile ? 26 : 30, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0, marginBottom: 8 }}>
        {title}
      </h1>
      <p style={{ fontSize: 15, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0, maxWidth: 560, lineHeight: 1.5 }}>
        {subtitle}
      </p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent ? BLUE : "#FFFFFF",
        border: accent ? "none" : "1px solid #EFEFEF",
        borderRadius: 16,
        padding: "22px 24px",
        boxShadow: accent ? "0 8px 24px rgba(0,71,255,0.15)" : "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 500, color: accent ? "rgba(255,255,255,0.8)" : "#9A9A9A", marginBottom: 10, letterSpacing: "-0.01em" }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, color: accent ? "#FFFFFF" : "#1A1A1A", letterSpacing: "-0.04em", lineHeight: 1 }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: accent ? "rgba(255,255,255,0.65)" : "#B0B0B0", marginTop: 8, letterSpacing: "-0.01em" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function QuickAction({
  label,
  description,
  onClick,
}: {
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 4,
        textAlign: "left",
        padding: "16px 18px",
        borderRadius: 14,
        border: "1px solid #EFEFEF",
        background: "#FFFFFF",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "border-color 0.15s ease, box-shadow 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#D6E4FF";
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,71,255,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#EFEFEF";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{label}</span>
      <span style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", lineHeight: 1.45 }}>{description}</span>
    </button>
  );
}

function BrandHomeOverview({
  lang,
  isMobile,
  displayName,
  businessName,
  gettingStarted,
  activeCampaigns,
  onNavigate,
}: {
  lang: "en" | "fr";
  isMobile?: boolean;
  displayName: string;
  businessName: string | null;
  gettingStarted: GettingStarted;
  activeCampaigns: number;
  onNavigate: (view: DashboardView) => void;
}) {
  const setupDone = [gettingStarted.creators, gettingStarted.outreach, gettingStarted.sales].filter(Boolean).length;
  const setupTotal = 3;

  return (
    <>
      <OverviewHeader
        isMobile={isMobile}
        title={displayName ? (lang === "fr" ? `Bonjour, ${displayName}` : `Hi, ${displayName}`) : lang === "fr" ? "Accueil" : "Home"}
        subtitle={
          businessName
            ? lang === "fr"
              ? `Vue d'ensemble de ${businessName} — créateurs, campagnes et ventes.`
              : `Overview for ${businessName} — creators, campaigns, and sales.`
            : lang === "fr"
              ? "Vue d'ensemble de votre programme créateurs."
              : "Overview of your creator program."
        }
      />
      <div style={{ padding: isMobile ? 16 : 40, paddingTop: isMobile ? 20 : 32 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
            gap: 16,
            marginBottom: 28,
          }}
        >
          <MetricCard label={lang === "fr" ? "Créateurs" : "Creators"} value={gettingStarted.creatorsCount} hint={lang === "fr" ? "Gérés" : "Managed"} />
          <MetricCard label={lang === "fr" ? "Messages" : "Outreach"} value={gettingStarted.outreachCount} hint={lang === "fr" ? "Envoyés" : "Sent"} />
          <MetricCard label={lang === "fr" ? "Ventes" : "Sales"} value={gettingStarted.salesCount} hint={lang === "fr" ? "Suivies" : "Tracked"} />
          <MetricCard label={lang === "fr" ? "Campagnes actives" : "Active campaigns"} value={activeCampaigns} accent={activeCampaigns > 0} />
        </div>

        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", margin: "0 0 12px" }}>
            {lang === "fr" ? "Actions rapides" : "Quick actions"}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 12 }}>
            <QuickAction
              label={lang === "fr" ? "Trouver des créateurs" : "Find creators"}
              description={lang === "fr" ? "Parcourir la recherche et sauvegarder des profils." : "Browse discovery and save profiles."}
              onClick={() => onNavigate("discovery")}
            />
            <QuickAction
              label={lang === "fr" ? "Lancer une campagne" : "Launch a campaign"}
              description={lang === "fr" ? "Créer ou gérer vos collaborations." : "Create or manage collaborations."}
              onClick={() => onNavigate("campaigns")}
            />
            <QuickAction
              label={lang === "fr" ? "Voir les paiements" : "View payouts"}
              description={lang === "fr" ? "Commissions et versements créateurs." : "Commissions and creator payouts."}
              onClick={() => onNavigate("payouts")}
            />
          </div>
        </div>

        {setupDone < setupTotal && (
          <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: isMobile ? 20 : 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", margin: 0 }}>
                {lang === "fr" ? "Mise en route" : "Getting started"}
              </h2>
              <span style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em" }}>
                {setupDone}/{setupTotal}
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 999, background: "#F0F0F0", marginBottom: 18, overflow: "hidden" }}>
              <div style={{ width: `${(setupDone / setupTotal) * 100}%`, height: "100%", background: BLUE, borderRadius: 999, transition: "width 0.3s ease" }} />
            </div>
            {[
              { done: gettingStarted.creators, label: lang === "fr" ? "Ajouter vos premiers créateurs" : "Add your first creators", view: "discovery" as DashboardView },
              { done: gettingStarted.outreach, label: lang === "fr" ? "Envoyer un premier message" : "Send your first outreach", view: "outreach" as DashboardView },
              { done: gettingStarted.sales, label: lang === "fr" ? "Suivre votre première vente" : "Track your first sale", view: "payouts" as DashboardView },
            ].map((step) => (
              <button
                key={step.label}
                type="button"
                onClick={() => !step.done && onNavigate(step.view)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: "12px 0",
                  border: "none",
                  borderBottom: "1px solid #F5F5F5",
                  background: "transparent",
                  cursor: step.done ? "default" : "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: step.done ? BLUE : "transparent",
                    border: step.done ? "none" : "2px solid #DCDCDC",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {step.done && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span style={{ fontSize: 14, color: step.done ? "#9A9A9A" : "#1A1A1A", textDecoration: step.done ? "line-through" : "none", opacity: step.done ? 0.65 : 1 }}>
                  {step.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function CreatorHomeOverview({
  lang,
  isMobile,
  userId,
  onNavigate,
}: {
  lang: "en" | "fr";
  isMobile?: boolean;
  userId?: string;
  onNavigate: (view: DashboardView) => void;
}) {
  const { stats, loading, error } = useCreatorStats(userId);

  const firstName = stats?.creatorName?.replace(/^@/, "").split(" ")[0] ?? "";
  const allSales = stats?.sales ?? [];

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  const saleStatusLabel = (status: string | null | undefined) => {
    const s = String(status || "pending").toLowerCase();
    if (s === "paid") return lang === "fr" ? "Payée" : "Paid";
    return lang === "fr" ? "En attente" : "Pending";
  };

  const saleStatusStyle = (status: string | null | undefined) => {
    const s = String(status || "pending").toLowerCase();
    if (s === "paid") return { bg: "#ECFDF3", color: "#1FB567" };
    return { bg: "#FFF7ED", color: "#D97706" };
  };

  if (loading) {
    return (
      <>
        <OverviewHeader isMobile={isMobile} title={lang === "fr" ? "Accueil" : "Home"} subtitle={lang === "fr" ? "Chargement…" : "Loading…"} />
        <div style={{ padding: isMobile ? 16 : 40, color: "#9A9A9A", fontSize: 14 }}>{lang === "fr" ? "Chargement de votre overview…" : "Loading your overview…"}</div>
      </>
    );
  }

  return (
    <>
      <OverviewHeader
        isMobile={isMobile}
        title={firstName ? (lang === "fr" ? `Bonjour, ${firstName}` : `Hi, ${firstName}`) : lang === "fr" ? "Accueil" : "Home"}
        subtitle={
          stats?.brandName
            ? lang === "fr"
              ? `Partenariat avec ${stats.brandName} — vos ventes et commissions.`
              : `Partnership with ${stats.brandName} — your sales and commissions.`
            : lang === "fr"
              ? "Vue d'ensemble de votre activité créateur."
              : "Overview of your creator activity."
        }
      />
      <div style={{ padding: isMobile ? 16 : 40, paddingTop: isMobile ? 20 : 32 }}>
        {error && (
          <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 12, background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)", fontSize: 13, color: "#DC2626" }}>
            {error}
          </div>
        )}
        {!stats?.linked && !error && (
          <div style={{ marginBottom: 20, padding: "12px 14px", borderRadius: 12, background: "#F5F8FF", border: "1px solid #D6E4FF", fontSize: 13, color: "#5A5A5A", lineHeight: 1.5 }}>
            {lang === "fr"
              ? "Votre compte n'est pas encore relié à une fiche créateur. Acceptez l'invitation de la marque ou vérifiez que votre pseudo correspond."
              : "Your account isn't linked to a creator profile yet. Accept the brand invite or make sure your handle matches."}
          </div>
        )}
        {stats?.discountCode && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 20,
              padding: "8px 14px",
              borderRadius: 999,
              background: "rgba(0,71,255,0.06)",
              border: "1px solid rgba(0,71,255,0.12)",
            }}
          >
            <span style={{ fontSize: 13, color: "#7A7A7A" }}>{lang === "fr" ? "Code promo" : "Promo code"}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: BLUE }}>{stats.discountCode}</span>
            {stats.commissionRate != null && <span style={{ fontSize: 13, color: "#9A9A9A" }}>· {stats.commissionRate}%</span>}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
          <MetricCard
            label={lang === "fr" ? "Ventes générées" : "Sales driven"}
            value={formatCurrency(stats?.totalSales ?? 0, lang)}
            hint={lang === "fr" ? `${stats?.salesCount ?? 0} commande(s) via votre code` : `${stats?.salesCount ?? 0} order(s) via your code`}
          />
          <MetricCard
            label={lang === "fr" ? "Commissions" : "Commissions"}
            value={formatCurrency(stats?.totalCommissions ?? 0, lang)}
            hint={lang === "fr" ? "Total cumulé" : "All-time total"}
          />
          <MetricCard
            label={lang === "fr" ? "Solde à recevoir" : "Balance due"}
            value={formatCurrency(stats?.balance ?? 0, lang)}
            hint={lang === "fr" ? "Après paiements déjà versés" : "After completed payouts"}
            accent={(stats?.balance ?? 0) > 0}
          />
        </div>

        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", margin: "0 0 12px" }}>
            {lang === "fr" ? "Actions rapides" : "Quick actions"}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 12 }}>
            <QuickAction
              label={lang === "fr" ? "Mes paiements" : "My payouts"}
              description={lang === "fr" ? "Solde, IBAN et historique de versements." : "Balance, payout method, and history."}
              onClick={() => onNavigate("payouts")}
            />
            <QuickAction
              label="Scripts"
              description={lang === "fr" ? "Briefs et scripts envoyés par la marque." : "Briefs and scripts from the brand."}
              onClick={() => onNavigate("scripts")}
            />
            <QuickAction
              label={lang === "fr" ? "Analytiques" : "Analytics"}
              description={lang === "fr" ? "Détail de vos ventes et performances." : "Detailed sales and performance."}
              onClick={() => onNavigate("analytics")}
            />
          </div>
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, overflow: "hidden" }}>
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid #EFEFEF",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>
              {lang === "fr" ? "Mes ventes" : "My sales"}
            </div>
            {allSales.length > 0 && (
              <span style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em" }}>
                {allSales.length} {lang === "fr" ? "vente(s)" : "sale(s)"}
              </span>
            )}
          </div>
          {allSales.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", fontSize: 14, color: "#7A7A7A", lineHeight: 1.5 }}>
              {lang === "fr"
                ? "Vos ventes apparaîtront ici dès qu'une commande passe avec votre code promo."
                : "Your sales will show here once an order comes in with your promo code."}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: isMobile ? 520 : undefined }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #EFEFEF" }}>
                    <th style={{ textAlign: "left", padding: "12px 20px", color: "#9A9A9A", fontWeight: 500 }}>
                      {lang === "fr" ? "Date" : "Date"}
                    </th>
                    {!isMobile && (
                      <th style={{ textAlign: "left", padding: "12px 20px", color: "#9A9A9A", fontWeight: 500 }}>
                        {lang === "fr" ? "Marque" : "Brand"}
                      </th>
                    )}
                    <th style={{ textAlign: "left", padding: "12px 20px", color: "#9A9A9A", fontWeight: 500 }}>
                      {lang === "fr" ? "Code" : "Code"}
                    </th>
                    <th style={{ textAlign: "right", padding: "12px 20px", color: "#9A9A9A", fontWeight: 500 }}>
                      {lang === "fr" ? "Vente" : "Sale"}
                    </th>
                    <th style={{ textAlign: "right", padding: "12px 20px", color: "#9A9A9A", fontWeight: 500 }}>
                      {lang === "fr" ? "Commission" : "Commission"}
                    </th>
                    <th style={{ textAlign: "right", padding: "12px 20px", color: "#9A9A9A", fontWeight: 500 }}>
                      {lang === "fr" ? "Statut" : "Status"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allSales.map((sale) => {
                    const statusStyle = saleStatusStyle(sale.status);
                    return (
                      <tr key={sale.id} style={{ borderBottom: "1px solid #F5F5F5" }}>
                        <td style={{ padding: "14px 20px", color: "#1A1A1A", whiteSpace: "nowrap" }}>{fmtDate(sale.date)}</td>
                        {!isMobile && (
                          <td style={{ padding: "14px 20px", color: "#7A7A7A" }}>{sale.brandName || "—"}</td>
                        )}
                        <td style={{ padding: "14px 20px", color: "#7A7A7A", fontFamily: "monospace", fontSize: 13 }}>
                          {sale.discountCode || "—"}
                        </td>
                        <td style={{ padding: "14px 20px", textAlign: "right", color: "#1A1A1A" }}>
                          {formatCurrency(sale.orderAmount, lang)}
                        </td>
                        <td style={{ padding: "14px 20px", textAlign: "right", color: BLUE, fontWeight: 600 }}>
                          {formatCurrency(sale.commissionAmount, lang)}
                        </td>
                        <td style={{ padding: "14px 20px", textAlign: "right" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 8px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 600,
                              background: statusStyle.bg,
                              color: statusStyle.color,
                            }}
                          >
                            {saleStatusLabel(sale.status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function HomeOverviewView({
  isMobile,
  isCreator,
  fullName,
  username,
  businessName,
  userId,
  gettingStarted,
  activeCampaigns,
  onNavigate,
}: {
  isMobile?: boolean;
  isCreator?: boolean;
  fullName: string | null;
  username: string | null;
  businessName: string | null;
  userId?: string;
  gettingStarted: GettingStarted;
  activeCampaigns: number;
  onNavigate: (view: DashboardView) => void;
}) {
  const lang = useLang();
  const displayName = fullName?.split(" ")[0] || (username ? username.replace(/^@/, "") : "");

  if (isCreator) {
    return <CreatorHomeOverview lang={lang} isMobile={isMobile} userId={userId} onNavigate={onNavigate} />;
  }

  return (
    <BrandHomeOverview
      lang={lang}
      isMobile={isMobile}
      displayName={displayName}
      businessName={businessName}
      gettingStarted={gettingStarted}
      activeCampaigns={activeCampaigns}
      onNavigate={onNavigate}
    />
  );
}
