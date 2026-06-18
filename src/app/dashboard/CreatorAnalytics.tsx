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

function StatCard({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div style={{ flex: "1 1 200px", minWidth: 170, background: accent ? BLUE : "#FFFFFF", border: accent ? "none" : "1px solid #EFEFEF", borderRadius: 16, padding: "22px 24px", boxShadow: accent ? "0 8px 24px rgba(0,71,255,0.18)" : "0 1px 2px rgba(0,0,0,0.03)" }}>
      <div style={{ fontSize: 13, color: accent ? "rgba(255,255,255,0.85)" : "#9A9A9A", marginBottom: 10, letterSpacing: "-0.01em", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 650, color: accent ? "#FFFFFF" : "#1A1A1A", letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: accent ? "rgba(255,255,255,0.7)" : "#B0B0B0", marginTop: 8, letterSpacing: "-0.01em" }}>{hint}</div>}
    </div>
  );
}

export function CreatorAnalytics({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [firstName, setFirstName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!userId) { setLoading(false); return; }
      try {
        const res = await fetch(`/api/creator/stats?userId=${userId}`);
        const data = await res.json();
        if (!cancelled && data?.ok) {
          setStats(data);
          if (data.creatorName) setFirstName(String(data.creatorName).split(" ")[0]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return (
      <div style={{ paddingLeft: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingTop: 32, color: "#9A9A9A", fontSize: 14, background: "#FFFFFF", minHeight: "100vh" }}>
        {lang === "fr" ? "Chargement de vos statistiques..." : "Loading your stats..."}
      </div>
    );
  }

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return iso; }
  };

  const greeting = firstName
    ? (lang === "fr" ? `Bonjour ${firstName}` : `Hi ${firstName}`)
    : (lang === "fr" ? "Bonjour" : "Welcome");
  const subtitle = stats?.brandName
    ? (lang === "fr" ? `Voici un aperçu de votre partenariat avec ${stats.brandName}.` : `Here's an overview of your partnership with ${stats.brandName}.`)
    : (lang === "fr" ? "Voici un aperçu de votre activité de créateur." : "Here's an overview of your creator activity.");
  const sales = stats?.sales ?? [];

  return (
    <div style={{ paddingLeft: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingTop: 32, paddingBottom: 48, background: "#FFFFFF", minHeight: "100vh", flex: 1 }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>

        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: isMobile ? 24 : 28, fontWeight: 650, color: "#1A1A1A", letterSpacing: "-0.035em", margin: "0 0 8px" }}>{greeting}</h1>
          <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", letterSpacing: "-0.01em", margin: 0, lineHeight: 1.5 }}>{subtitle}</p>
          {stats?.discountCode && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 16, padding: "8px 14px", borderRadius: 999, background: "rgba(0,71,255,0.06)", border: "1px solid rgba(0,71,255,0.15)" }}>
              <span style={{ fontSize: 13, color: "rgba(0,0,0,0.5)", letterSpacing: "-0.01em" }}>{lang === "fr" ? "Votre code" : "Your code"}</span>
              <span style={{ fontSize: 13, fontWeight: 650, color: BLUE, letterSpacing: "0.02em" }}>{stats.discountCode}</span>
              {stats.commissionRate != null && (
                <span style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", letterSpacing: "-0.01em" }}>· {stats.commissionRate}%</span>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
          <StatCard label={lang === "fr" ? "Ventes générées" : "Sales driven"} value={formatCurrency(stats?.totalSales ?? 0, lang)} hint={lang === "fr" ? "Total des commandes via votre code" : "Total orders via your code"} />
          <StatCard label={lang === "fr" ? "Commissions gagnées" : "Commissions earned"} value={formatCurrency(stats?.totalCommissions ?? 0, lang)} hint={lang === "fr" ? "Cumul depuis le début" : "All-time total"} />
          <StatCard label={lang === "fr" ? "Solde à recevoir" : "Balance due"} value={formatCurrency(stats?.balance ?? 0, lang)} hint={lang === "fr" ? "En attente de versement" : "Awaiting payout"} accent />
        </div>
