"use client";

import { useLang } from "@/lib/useLang";
import { formatCurrency } from "@/lib/useCurrency";
import { useCreatorStats } from "@/lib/useCreatorStats";

const BLUE = "#0047FF";

function MetricCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
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

export function CreatorAnalytics({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const { stats, loading, error } = useCreatorStats(userId);
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

  const pad = isMobile ? "56px 16px 48px" : "40px 40px 48px";

  if (loading) {
    return (
      <div style={{ padding: pad, color: "#9A9A9A", fontSize: 14, background: "#FFFFFF", minHeight: "100%" }}>
        {lang === "fr" ? "Chargement de vos analytiques…" : "Loading your analytics…"}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100%", background: "#FFFFFF" }}>
      <div
        style={{
          paddingTop: isMobile ? 56 : 40,
          paddingRight: isMobile ? 16 : 40,
          paddingBottom: isMobile ? 16 : 24,
          paddingLeft: isMobile ? 16 : 40,
          borderBottom: "1px solid #EFEFEF",
        }}
      >
        <h1 style={{ fontSize: isMobile ? 26 : 30, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0, marginBottom: 8 }}>
          {lang === "fr" ? "Analytiques" : "Analytics"}
        </h1>
        <p style={{ fontSize: 15, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0, maxWidth: 560, lineHeight: 1.5 }}>
          {stats?.brandName
            ? lang === "fr"
              ? `Ventes et commissions générées pour ${stats.brandName}.`
              : `Sales and commissions driven for ${stats.brandName}.`
            : lang === "fr"
              ? "Vue d'ensemble de vos ventes et commissions."
              : "Overview of your sales and commissions."}
        </p>
      </div>

      <div style={{ padding: isMobile ? "20px 16px 48px" : "32px 40px 48px", maxWidth: 1080 }}>
        {error && (
          <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 12, background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)", fontSize: 13, color: "#DC2626" }}>
            {error}
          </div>
        )}
        {!stats?.linked && !error && (
          <div style={{ marginBottom: 20, padding: "12px 14px", borderRadius: 12, background: "#F5F8FF", border: "1px solid #D6E4FF", fontSize: 13, color: "#5A5A5A", lineHeight: 1.5 }}>
            {lang === "fr"
              ? "Reliez votre compte à la marque (invitation ou pseudo identique) pour voir vos ventes."
              : "Link your account to the brand (invite or matching handle) to see your sales."}
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
            <span style={{ fontSize: 13, color: "#7A7A7A" }}>{lang === "fr" ? "Votre code promo" : "Your promo code"}</span>
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
            label={lang === "fr" ? "Commissions gagnées" : "Commissions earned"}
            value={formatCurrency(stats?.totalCommissions ?? 0, lang)}
            hint={lang === "fr" ? "Total cumulé" : "All-time total"}
          />
          <MetricCard
            label={lang === "fr" ? "Solde à recevoir" : "Balance due"}
            value={formatCurrency(stats?.balance ?? 0, lang)}
            hint={lang === "fr" ? "En attente de versement" : "Awaiting payout"}
            accent={(stats?.balance ?? 0) > 0}
          />
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
              {lang === "fr" ? "Historique de mes ventes" : "My sales history"}
            </div>
            {allSales.length > 0 && (
              <span style={{ fontSize: 12, color: "#9A9A9A" }}>
                {allSales.length} {lang === "fr" ? "vente(s)" : "sale(s)"}
              </span>
            )}
          </div>
          {allSales.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", marginBottom: 6 }}>
                {lang === "fr" ? "Vos ventes apparaîtront ici" : "Your sales will appear here"}
              </div>
              <p style={{ fontSize: 14, color: "#7A7A7A", lineHeight: 1.5, margin: "0 auto", maxWidth: 400 }}>
                {lang === "fr"
                  ? "Dès qu'une commande passe avec votre code promo, elle s'affiche ici avec votre commission."
                  : "Once an order comes in with your promo code, it shows here with your commission."}
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: isMobile ? 520 : undefined }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #EFEFEF" }}>
                    <th style={{ textAlign: "left", padding: "12px 20px", color: "#9A9A9A", fontWeight: 500 }}>{lang === "fr" ? "Date" : "Date"}</th>
                    {!isMobile && (
                      <th style={{ textAlign: "left", padding: "12px 20px", color: "#9A9A9A", fontWeight: 500 }}>{lang === "fr" ? "Marque" : "Brand"}</th>
                    )}
                    <th style={{ textAlign: "left", padding: "12px 20px", color: "#9A9A9A", fontWeight: 500 }}>{lang === "fr" ? "Code" : "Code"}</th>
                    <th style={{ textAlign: "right", padding: "12px 20px", color: "#9A9A9A", fontWeight: 500 }}>{lang === "fr" ? "Vente" : "Sale"}</th>
                    <th style={{ textAlign: "right", padding: "12px 20px", color: "#9A9A9A", fontWeight: 500 }}>{lang === "fr" ? "Commission" : "Commission"}</th>
                    <th style={{ textAlign: "right", padding: "12px 20px", color: "#9A9A9A", fontWeight: 500 }}>{lang === "fr" ? "Statut" : "Status"}</th>
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
                          {sale.discountCode || stats?.discountCode || "—"}
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
    </div>
  );
}
