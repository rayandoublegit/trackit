"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/useLang";
import { formatCurrency } from "@/lib/useCurrency";

const BLUE = "#0047FF";

type CreatorStats = {
  linked: boolean;
  brandName?: string | null;
  discountCode?: string | null;
  commissionRate?: number | null;
  totalSales: number;
  totalCommissions: number;
  balance: number;
  totalEarned?: number;
  salesCount: number;
  sales: { orderAmount: number; commissionAmount: number; date: string; discountCode: string | null }[];
};

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ flex: "1 1 180px", minWidth: 160, background: accent ? BLUE : "#FFFFFF", border: accent ? "none" : "1px solid #EFEFEF", borderRadius: 16, padding: "20px 22px" }}>
      <div style={{ fontSize: 13, color: accent ? "rgba(255,255,255,0.8)" : "#9A9A9A", marginBottom: 8, letterSpacing: "-0.01em" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, color: accent ? "#FFFFFF" : "#1A1A1A", letterSpacing: "-0.03em" }}>{value}</div>
    </div>
  );
}

export function CreatorAnalytics({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!userId) { setLoading(false); return; }
      try {
        const res = await fetch(`/api/creator/stats?userId=${userId}`);
        const data = await res.json();
        if (!cancelled && data?.ok) setStats(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return (
      <div style={{ paddingLeft: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingTop: 32, color: "#9A9A9A", fontSize: 14 }}>
        {lang === "fr" ? "Chargement de vos statistiques..." : "Loading your stats..."}
      </div>
    );
  }

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return iso; }
  };

  return (
    <div style={{ paddingLeft: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingTop: 24, paddingBottom: 48, background: "#FFFFFF" }}>
      {stats?.brandName && (
        <p style={{ fontSize: 14, color: "rgba(0,0,0,0.5)", marginBottom: 20, letterSpacing: "-0.01em" }}>
          {lang === "fr" ? "Partenariat avec " : "Partnership with "}<strong style={{ color: "#1A1A1A" }}>{stats.brandName}</strong>
          {stats.discountCode ? (lang === "fr" ? ` · Code : ${stats.discountCode}` : ` · Code: ${stats.discountCode}`) : ""}
        </p>
      )}

      {!stats?.linked ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "55vh", textAlign: "center", padding: "0 24px" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(0,71,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M3 17l5-5 4 4 8-8" stroke="#0047FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 8h4v4" stroke="#0047FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", marginBottom: 8, letterSpacing: "-0.02em" }}>
            {lang === "fr" ? "Pas encore de ventes" : "No sales recorded yet"}
          </div>
          <p style={{ fontSize: 14, color: "rgba(0,0,0,0.5)", lineHeight: 1.5, margin: 0, maxWidth: 380 }}>
            {lang === "fr"
              ? "Vos ventes et commissions apparaîtront ici dès que la marque les aura enregistrées."
              : "Your sales and commissions will appear here once the brand records them."}
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 28 }}>
            <StatCard label={lang === "fr" ? "Ventes générées" : "Sales driven"} value={formatCurrency(stats.totalSales, lang)} />
            <StatCard label={lang === "fr" ? "Commissions gagnées" : "Commissions earned"} value={formatCurrency(stats.totalCommissions, lang)} />
            <StatCard label={lang === "fr" ? "Solde à recevoir" : "Balance due"} value={formatCurrency(stats.balance, lang)} accent />
          </div>

          <div style={{ border: "1px solid #EFEFEF", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #EFEFEF", fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>
              {lang === "fr" ? "Historique de mes ventes" : "My sales history"}
            </div>
            {stats.sales.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center", color: "#9A9A9A", fontSize: 14 }}>
                {lang === "fr" ? "Aucune vente pour le moment." : "No sales yet."}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #EFEFEF" }}>
                      <th style={{ textAlign: "left", padding: "12px 20px", color: "#9A9A9A", fontWeight: 500 }}>{lang === "fr" ? "Date" : "Date"}</th>
                      <th style={{ textAlign: "right", padding: "12px 20px", color: "#9A9A9A", fontWeight: 500 }}>{lang === "fr" ? "Montant vente" : "Sale amount"}</th>
                      <th style={{ textAlign: "right", padding: "12px 20px", color: "#9A9A9A", fontWeight: 500 }}>{lang === "fr" ? "Ma commission" : "My commission"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.sales.map((s, i) => (
                      <tr key={i} style={{ borderBottom: i < stats.sales.length - 1 ? "1px solid #F5F5F5" : "none" }}>
                        <td style={{ padding: "12px 20px", color: "#1A1A1A" }}>{fmtDate(s.date)}</td>
                        <td style={{ padding: "12px 20px", textAlign: "right", color: "#1A1A1A" }}>{formatCurrency(s.orderAmount, lang)}</td>
                        <td style={{ padding: "12px 20px", textAlign: "right", color: "#0047FF", fontWeight: 600 }}>{formatCurrency(s.commissionAmount, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
