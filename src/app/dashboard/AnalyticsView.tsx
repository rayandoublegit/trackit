"use client";

import { useEffect, useMemo, useState } from "react";
import { useLang } from "@/lib/useLang";
import { CreatorAnalytics } from "./CreatorAnalytics";
import { formatCurrency } from "@/lib/useCurrency";
import { canUseAdvancedAnalytics, type PlanTier } from "@/lib/plan-limits";
import { formatTrendLabel, type PeriodTrend } from "@/lib/analytics-periods";

const btnPrimary: React.CSSProperties = {
  background: "#0047FF", color: "#FFF", border: "none", borderRadius: 10,
  padding: "10px 18px", fontSize: 13, fontWeight: 500, fontFamily: "inherit",
  cursor: "pointer", letterSpacing: "-0.02em",
};
const btnSecondary: React.CSSProperties = {
  background: "#FFF", color: "#1A1A1A", border: "1px solid #E5E5E5", borderRadius: 10,
  padding: "10px 16px", fontSize: 13, fontWeight: 500, fontFamily: "inherit",
  cursor: "pointer", letterSpacing: "-0.02em",
};

type DateRange = "today" | "7d" | "30d" | "90d" | "custom";
type SortKey = "sales" | "commission" | "roi" | "creator";

function ChartEmpty({ lang }: { lang: "en" | "fr" }) {
  return (
    <div style={{ padding: "48px 24px", textAlign: "center", color: "#9A9A9A", fontSize: 13 }}>
      {lang === "fr" ? "Pas assez de données pour afficher ce graphique." : "Not enough data to display this chart."}
    </div>
  );
}

export function AnalyticsView({ userId, isMobile, lang: langProp, plan, shopifyStore, onUpgradePro, onConnectShopify, isCreator }: { userId?: string; isMobile?: boolean; lang?: string; plan?: PlanTier; shopifyStore?: string; onUpgradePro?: () => void; onConnectShopify?: () => void; isCreator?: boolean }) {
  const isFree = plan === "free";
  const hasAdvancedAnalytics = canUseAdvancedAnalytics(plan as PlanTier);
  const langHook = useLang();
  const lang = langProp === "fr" || langProp === "en" ? langProp : langHook;

  if (isCreator) {
    return <CreatorAnalytics userId={userId} isMobile={isMobile} />;
  }
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [range, setRange] = useState<DateRange>("30d");
  const [compare, setCompare] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("sales");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (!userId) {
      setLoadingData(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoadingData(true);
      let data: Record<string, unknown> | null = null;

      const fetchAnalytics = async (activeRange: DateRange) => {
        const res = await fetch(`/api/analytics?userId=${userId}&range=${activeRange}`);
        return res.json() as Promise<Record<string, unknown>>;
      };

      try {
        data = await fetchAnalytics(range);
        const shouldSync = !!(shopifyStore || data?.shopifyConnected);
        if (shouldSync) {
          try {
            await fetch("/api/shopify/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId }),
            });
            data = await fetchAnalytics(range);
          } catch {
            // Keep first analytics payload if sync fails
          }
        }
        if (!cancelled) setAnalyticsData(data);
      } catch {
        if (!cancelled) setAnalyticsData(null);
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, shopifyStore, range]);

  const shopifyConnected = !!(shopifyStore || analyticsData?.shopifyConnected);
  const HAS_DATA = !loadingData && (analyticsData?.hasData === true || shopifyConnected);

  const sortedCreators = useMemo(() => {
    const rows = (analyticsData?.creators || []).map((c: { full_name?: string; handle?: string; username?: string; platform?: string; total_sales?: number; total_earned?: number }, i: number) => {
      const sales = c.total_sales || 0;
      const commission = c.total_earned || 0;
      return {
        rank: i + 1,
        creator: c.full_name || c.handle || c.username || "—",
        platform: c.platform || "—",
        sales,
        commission,
        status: sales > 0 ? "Active" : "Inactive",
        roi: commission > 0 ? sales / commission : 0,
      };
    });
    rows.sort((a: { creator: string; commission: number; roi: number; sales: number }, b: { creator: string; commission: number; roi: number; sales: number }) => {
      const av = sortKey === "creator" ? a.creator : sortKey === "commission" ? a.commission : sortKey === "roi" ? a.roi : a.sales;
      const bv = sortKey === "creator" ? b.creator : sortKey === "commission" ? b.commission : sortKey === "roi" ? b.roi : b.sales;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return rows;
  }, [sortKey, sortDir, analyticsData]);

  const campaignRows = analyticsData?.campaigns || [];
  const totalSent = analyticsData?.totalSent || 0;
  const responseRate = analyticsData?.responseRate || 0;
  const converted = analyticsData?.converted || 0;
  const totalRevenue = analyticsData?.totalRevenue || 0;
  const totalCommissions = analyticsData?.totalCommissions || 0;
  const netRevenue = Math.max(0, totalRevenue - totalCommissions);
  const conversionRate = totalSent > 0 ? Math.round((converted / totalSent) * 100) : 0;
  const avgCommissionRate = totalRevenue > 0 ? Math.round((totalCommissions / totalRevenue) * 100) : 0;
  const trends = analyticsData?.trends as
    | {
        revenue?: PeriodTrend;
        commissions?: PeriodTrend;
        outreachSent?: PeriodTrend;
        responseRate?: PeriodTrend;
      }
    | undefined;

  const [showSaleModal, setShowSaleModal] = useState(false);
  const [saleCreators, setSaleCreators] = useState<{ id: string; label: string }[]>([]);
  const [saleCreatorId, setSaleCreatorId] = useState("");
  const [saleAmount, setSaleAmount] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [saleCampaignId, setSaleCampaignId] = useState("");
  const [saleBusy, setSaleBusy] = useState(false);
  const [saleMsg, setSaleMsg] = useState("");

  const openSaleModal = async () => {
    setShowSaleModal(true);
    setSaleMsg("");
    try {
      const res = await fetch(`/api/creators-list?userId=${userId}`);
      const data = await res.json();
      const list = (data.creators || data || []).map((c: { id: string; full_name?: string; handle?: string }) => ({
        id: c.id,
        label: c.full_name || c.handle || c.id,
      }));
      setSaleCreators(list);
      if (list.length > 0) setSaleCreatorId(list[0].id);
    } catch {
      setSaleMsg(lang === "fr" ? "Impossible de charger vos créateurs" : "Could not load your creators");
    }
  };

  const submitManualSale = async () => {
    if (!saleCreatorId || !saleAmount) return;
    setSaleBusy(true);
    setSaleMsg("");
    try {
      const res = await fetch("/api/sales/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, creatorId: saleCreatorId, amount: saleAmount, date: saleDate || undefined, campaignId: saleCampaignId || undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        setSaleMsg(lang === "fr" ? `Vente ajoutée — ${data.commissionAmount}€ de commission créditée` : `Sale added — ${data.commissionAmount}€ commission credited`);
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setSaleMsg(data.error || (lang === "fr" ? "Échec de l'ajout" : "Failed to add sale"));
        setSaleBusy(false);
      }
    } catch {
      setSaleMsg(lang === "fr" ? "Erreur réseau" : "Network error");
      setSaleBusy(false);
    }
  };

  const saleModal = showSaleModal ? (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => !saleBusy && setShowSaleModal(false)}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 380, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 4px", color: "#1A1A1A" }}>{lang === "fr" ? "Ajouter une vente" : "Add a sale"}</h3>
        <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 16px" }}>{lang === "fr" ? "Enregistrez une vente générée par un créateur. La commission est calculée automatiquement." : "Record a sale driven by a creator. Commission is calculated automatically."}</p>
        <label style={{ fontSize: 12, fontWeight: 500, color: "#555", display: "block", marginBottom: 4 }}>{lang === "fr" ? "Créateur" : "Creator"}</label>
        <select value={saleCreatorId} onChange={(e) => setSaleCreatorId(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #E5E5E5", fontSize: 14, marginBottom: 12 }}>
          {saleCreators.length === 0 && <option value="">{lang === "fr" ? "Aucun créateur géré" : "No managed creators"}</option>}
          {saleCreators.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <label style={{ fontSize: 12, fontWeight: 500, color: "#555", display: "block", marginBottom: 4 }}>{lang === "fr" ? "Montant de la commande (€)" : "Order amount (€)"}</label>
        <input type="number" min="0" step="0.01" value={saleAmount} onChange={(e) => setSaleAmount(e.target.value)} placeholder="149.90" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #E5E5E5", fontSize: 14, marginBottom: 12, boxSizing: "border-box" }} />
        <label style={{ fontSize: 12, fontWeight: 500, color: "#555", display: "block", marginBottom: 4 }}>{lang === "fr" ? "Date (optionnel)" : "Date (optional)"}</label>
        <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #E5E5E5", fontSize: 14, marginBottom: 12, boxSizing: "border-box" }} />
        {campaignRows.length > 0 && (
          <>
            <label style={{ fontSize: 12, fontWeight: 500, color: "#555", display: "block", marginBottom: 4 }}>{lang === "fr" ? "Campagne (optionnel)" : "Campaign (optional)"}</label>
            <select value={saleCampaignId} onChange={(e) => setSaleCampaignId(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #E5E5E5", fontSize: 14, marginBottom: 16 }}>
              <option value="">{lang === "fr" ? "Aucune campagne" : "No campaign"}</option>
              {campaignRows.map((c: { id?: string; name?: string }) => (
                <option key={c.id} value={c.id}>{c.name || c.id}</option>
              ))}
            </select>
          </>
        )}
        {saleMsg && <div style={{ fontSize: 13, color: saleMsg.includes("€") ? "#0A7A3D" : "#C0392B", marginBottom: 12 }}>{saleMsg}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" disabled={saleBusy} onClick={() => setShowSaleModal(false)} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #E5E5E5", background: "#fff", fontSize: 14, cursor: "pointer" }}>{lang === "fr" ? "Annuler" : "Cancel"}</button>
          <button type="button" disabled={saleBusy || !saleCreatorId || !saleAmount} onClick={submitManualSale} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#0047FF", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", opacity: saleBusy || !saleCreatorId || !saleAmount ? 0.5 : 1 }}>{saleBusy ? "…" : lang === "fr" ? "Ajouter" : "Add"}</button>
        </div>
      </div>
    </div>
  ) : null;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  if (loadingData) {
    return (
      <>
        <AnalyticsHeader isMobile={isMobile} lang={lang} range={range} setRange={setRange} compare={compare} setCompare={setCompare} analyticsData={analyticsData} plan={plan} onUpgradePro={onUpgradePro} />
        <div style={{ padding: 80, textAlign: "center", color: "#9A9A9A", fontSize: 14 }}>
          {lang === "fr" ? "Chargement des analytiques…" : "Loading analytics…"}
        </div>
      </>
    );
  }

  if (!HAS_DATA) {
    return (
      <>
        <AnalyticsHeader isMobile={isMobile} lang={lang} range={range} setRange={setRange} compare={compare} setCompare={setCompare} analyticsData={analyticsData} plan={plan} onUpgradePro={onUpgradePro} />
        <div style={{ padding: 80, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px" }}>{lang === "fr" ? "Pas de données pour l'instant." : "No data yet."}</h2>
          <p style={{ fontSize: 14, color: "#7A7A7A", margin: "0 0 24px" }}>{lang === "fr" ? "Connectez votre boutique Shopify et lancez votre première campagne pour voir les analytiques ici." : "Connect your Shopify store and start your first campaign to see analytics here."}</p>
          <button type="button" className="hero-cta-shopify" style={{ padding: "10px 22px", fontSize: 13 }} onClick={() => onConnectShopify?.()}>{lang === "fr" ? "Connecter Shopify →" : "Connect Shopify →"}</button>
          <div style={{ marginTop: 12 }}>
            <button type="button" onClick={openSaleModal} style={{ background: "none", border: "none", color: "#0047FF", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
              {lang === "fr" ? "Ou ajoutez vos ventes manuellement" : "Or add your sales manually"}
            </button>
          </div>
        </div>
        {saleModal}
      </>
    );
  }

  return (
    <>
      <AnalyticsHeader isMobile={isMobile} lang={lang} range={range} setRange={setRange} compare={compare} setCompare={setCompare} analyticsData={analyticsData} plan={plan} onUpgradePro={onUpgradePro} />
      <div style={{ padding: isMobile ? 16 : "24px 40px 40px", paddingTop: isMobile ? 56 : undefined }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button type="button" onClick={openSaleModal} className="hero-cta-shopify-light hero-cta-compact">
            {lang === "fr" ? "+ Ajouter une vente" : "+ Add a sale"}
          </button>
        </div>
        {saleModal}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
          <KpiCard
            title={lang === "fr" ? "Revenus totaux des créateurs" : "Total Revenue from Creators"}
            value={formatCurrency(totalRevenue, lang)}
            trend={compare ? trends?.revenue : undefined}
            lang={lang}
          />
          <KpiCard
            title={lang === "fr" ? "Créateurs contactés" : "Total Creators Contacted"}
            value={String(totalSent)}
            trend={compare ? trends?.outreachSent : undefined}
            lang={lang}
          />
          <KpiCard
            title={lang === "fr" ? "Taux de réponse" : "Response Rate"}
            value={`${responseRate}%`}
            trend={compare ? trends?.responseRate : undefined}
            lang={lang}
          />
          <KpiCard
            title={lang === "fr" ? "Commissions totales payées" : "Total Commissions Paid"}
            value={formatCurrency(totalCommissions, lang)}
            trend={compare ? trends?.commissions : undefined}
            lang={lang}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <ChartCard title={lang === "fr" ? "Revenus par créateur dans le temps" : "Revenue by Creator Over Time"}>
            <ChartEmpty lang={lang} />
          </ChartCard>
          <ChartCard title={lang === "fr" ? "Performance des messages" : "Outreach Performance"}>
            {totalSent > 0 ? <FunnelBarChart lang={lang} totalSent={totalSent} responseRate={responseRate} converted={converted} /> : <ChartEmpty lang={lang} />}
          </ChartCard>
        </div>

        <ChartCard title={lang === "fr" ? "Meilleurs créateurs ce mois" : "Top Performing Creators This Month"} style={{ marginBottom: 20 }}>
          <div style={{ overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: isMobile ? "touch" : undefined }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: isMobile ? 600 : undefined }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #EFEFEF", textAlign: "left" }}>
                  <Th>{lang === "fr" ? "Rang" : "Rank"}</Th>
                  <Th sortable onClick={() => toggleSort("creator")}>{lang === "fr" ? "Créateur" : "Creator"}</Th>
                  <Th>{lang === "fr" ? "Plateforme" : "Platform"}</Th>
                  <Th sortable onClick={() => toggleSort("sales")}>{lang === "fr" ? "Ventes générées" : "Sales Driven"}</Th>
                  <Th sortable onClick={() => toggleSort("commission")}>{lang === "fr" ? "Commission payée" : "Commission Paid"}</Th>
                  <Th sortable onClick={() => hasAdvancedAnalytics ? toggleSort("roi") : undefined}>{lang === "fr" ? "ROI" : "ROI"}{!hasAdvancedAnalytics ? " 🔒" : ""}</Th>
                  <Th>{lang === "fr" ? "Statut" : "Status"}</Th>
                </tr>
              </thead>
              <tbody>
                {sortedCreators.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "32px 8px", textAlign: "center", color: "#9A9A9A", fontSize: 13 }}>
                      {lang === "fr" ? "Aucun créateur avec des ventes pour le moment." : "No creators with sales yet."}
                    </td>
                  </tr>
                ) : sortedCreators.map((r: { rank: number; creator: string; platform: string; sales: number; commission: number; roi: number; status: string }, i: number) => (
                  <tr key={r.creator} style={{ borderBottom: "1px solid #F5F5F5", position: "relative" }}>
                    <td style={{ padding: "12px 8px", filter: isFree && i >= 2 ? "blur(4px)" : "none", userSelect: isFree && i >= 2 ? "none" : "auto" }}><RankBadge rank={r.rank} /></td>
                    <td style={{ padding: "12px 8px", fontWeight: 500, color: "#1A1A1A", filter: isFree && i >= 2 ? "blur(4px)" : "none", userSelect: isFree && i >= 2 ? "none" : "auto" }}>{r.creator}</td>
                    <td style={{ padding: "12px 8px", color: "#7A7A7A", filter: isFree && i >= 2 ? "blur(4px)" : "none" }}>{r.platform}</td>
                    <td style={{ padding: "12px 8px", filter: isFree && i >= 2 ? "blur(4px)" : "none" }}>{formatCurrency(r.sales, lang)}</td>
                    <td style={{ padding: "12px 8px", filter: isFree && i >= 2 ? "blur(4px)" : "none" }}>{formatCurrency(r.commission, lang)}</td>
                    <td style={{ padding: "12px 8px", fontWeight: 500, filter: isFree && i >= 2 ? "blur(4px)" : !hasAdvancedAnalytics ? "blur(4px)" : "none", userSelect: !hasAdvancedAnalytics ? "none" : "auto" }}>{hasAdvancedAnalytics ? `${r.roi.toFixed(1)}x` : "—"}</td>
                    <td style={{ padding: "12px 8px", filter: isFree && i >= 2 ? "blur(4px)" : "none" }}><StatusBadge lang={lang} status={r.status} /></td>
                  </tr>
                ))}
                {isFree && (
                  <tr>
                    <td colSpan={7} style={{ padding: "16px 8px", textAlign: "center", background: "#F8F9FF", borderTop: "1px solid #E5EDFF" }}>
                      <span style={{ fontSize: 13, color: "#0047FF", fontWeight: 500 }}>
                        {lang === "fr" ? "🔒 Passez à Growth pour voir tous vos créateurs →" : "🔒 Upgrade to Growth to unlock all creator data →"}
                      </span>
                    </td>
                  </tr>
                )}
                {!hasAdvancedAnalytics && !isFree && (
                  <tr>
                    <td colSpan={7} style={{ padding: "16px 8px", textAlign: "center", background: "#F8F9FF", borderTop: "1px solid #E5EDFF" }}>
                      <button type="button" onClick={() => void onUpgradePro?.()} style={{ background: "none", border: "none", fontSize: 13, color: "#0047FF", fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                        {lang === "fr" ? "🔒 Passez à Pro pour le suivi ROI et l'export CSV →" : "🔒 Upgrade to Pro for ROI tracking & CSV export →"}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <ChartCard title={lang === "fr" ? "Ratio commission / revenus" : "Commission vs Revenue Ratio"}>
            {hasAdvancedAnalytics && totalRevenue > 0 ? (
              <>
                <DonutChart lang={lang} netPct={Math.round((netRevenue / totalRevenue) * 100)} />
                <p style={{ fontSize: 13, color: "#7A7A7A", margin: "16px 0 4px", textAlign: "center" }}>{lang === "fr" ? `Taux de commission moyen : ${avgCommissionRate}%` : `Average commission rate: ${avgCommissionRate}%`}</p>
                <p style={{ fontSize: 13, color: "#1A1A1A", margin: 0, textAlign: "center", fontWeight: 500 }}>{lang === "fr" ? `Revenus nets après commissions : ${formatCurrency(netRevenue, lang)}` : `Net revenue after commissions: ${formatCurrency(netRevenue, lang)}`}</p>
              </>
            ) : !hasAdvancedAnalytics ? (
              <div style={{ padding: 32, textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 12px" }}>{lang === "fr" ? "Analytiques avancées + ROI — Plan Pro" : "Advanced analytics + ROI — Pro plan"}</p>
                <button type="button" style={btnPrimary} onClick={() => void onUpgradePro?.()}>{lang === "fr" ? "Passer à Pro →" : "Upgrade to Pro →"}</button>
              </div>
            ) : (
              <ChartEmpty lang={lang} />
            )}
          </ChartCard>
          <ChartCard title={lang === "fr" ? "Répartition par plateforme" : "Platform Breakdown"}>
            <ChartEmpty lang={lang} />
          </ChartCard>
        </div>

        <ChartCard title={lang === "fr" ? "Performance des campagnes" : "Campaign Performance"} style={{ marginBottom: 20 }}>
          <div style={{ overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: isMobile ? "touch" : undefined }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: isMobile ? 600 : undefined }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #EFEFEF", textAlign: "left" }}>
                <Th>{lang === "fr" ? "Nom de la campagne" : "Campaign Name"}</Th><Th>{lang === "fr" ? "Créateurs" : "Creators"}</Th><Th>{lang === "fr" ? "Ventes totales" : "Total Sales"}</Th><Th>{lang === "fr" ? "Commissions" : "Commissions"}</Th><Th>{lang === "fr" ? "ROI moyen" : "Avg ROI"}</Th><Th>{lang === "fr" ? "Date de début" : "Start Date"}</Th><Th>{lang === "fr" ? "Statut" : "Status"}</Th>
              </tr>
            </thead>
            <tbody>
              {campaignRows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "32px 8px", textAlign: "center", color: "#9A9A9A", fontSize: 13 }}>
                    {lang === "fr" ? "Aucune campagne pour le moment." : "No campaigns yet."}
                  </td>
                </tr>
              ) : campaignRows.map((c: { id?: string; name?: string; platform?: string; status?: string; created_at?: string }) => (
                <tr key={c.id || c.name} style={{ borderBottom: "1px solid #F5F5F5" }}>
                  <td style={{ padding: "12px 8px", fontWeight: 500 }}>{c.name || "—"}</td>
                  <td style={{ padding: "12px 8px" }}>—</td>
                  <td style={{ padding: "12px 8px" }}>—</td>
                  <td style={{ padding: "12px 8px" }}>—</td>
                  <td style={{ padding: "12px 8px" }}>—</td>
                  <td style={{ padding: "12px 8px", color: "#7A7A7A" }}>{c.created_at?.split("T")[0] ?? "—"}</td>
                  <td style={{ padding: "12px 8px" }}><CampaignStatus lang={lang} status={String(c.status || "Draft")} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </ChartCard>

        <ChartCard title={lang === "fr" ? "Détail des messages" : "Outreach Breakdown"} style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            <MiniStat label={lang === "fr" ? "Total envoyé" : "Total sent"} value={String(totalSent)} />
            <MiniStat label={lang === "fr" ? "Taux de réponse" : "Reply rate"} value={`${responseRate}%`} />
            <MiniStat label={lang === "fr" ? "Convertis" : "Converted"} value={String(converted)} />
            <MiniStat label={lang === "fr" ? "Conversion en partenaire" : "Conversion to partner"} value={`${conversionRate}%`} />
          </div>
          <div style={{ overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: isMobile ? "touch" : undefined }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: isMobile ? 500 : undefined }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #EFEFEF", textAlign: "left" }}>
                <Th>{lang === "fr" ? "Plateforme" : "Platform"}</Th><Th>{lang === "fr" ? "Envoyé" : "Sent"}</Th><Th>{lang === "fr" ? "Répondu" : "Replied"}</Th><Th>{lang === "fr" ? "Converti" : "Converted"}</Th><Th>{lang === "fr" ? "Aperçu du meilleur message" : "Best performing message preview"}</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} style={{ padding: "32px 8px", textAlign: "center", color: "#9A9A9A", fontSize: 13 }}>
                  {lang === "fr" ? "Répartition par plateforme non disponible pour le moment." : "Platform breakdown not available yet."}
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </ChartCard>

        <ChartCard title={lang === "fr" ? "Impact des relances" : "Follow Up Impact"}>
          <ChartEmpty lang={lang} />
        </ChartCard>
      </div>
    </>
  );
}

function AnalyticsHeader({ lang, range, setRange, compare, setCompare, isMobile, analyticsData, plan, onUpgradePro }: {
  lang: "en" | "fr";
  range: DateRange; setRange: (r: DateRange) => void;
  compare: boolean; setCompare: (v: boolean) => void;
  isMobile?: boolean;
  analyticsData?: any;
  plan?: PlanTier;
  onUpgradePro?: () => void;
}) {
  const ranges: { id: DateRange; label: string }[] = [
    { id: "today", label: lang === "fr" ? "Aujourd'hui" : "Today" },
    { id: "7d", label: lang === "fr" ? "7 jours" : "7 days" },
    { id: "30d", label: lang === "fr" ? "30 jours" : "30 days" },
    { id: "90d", label: lang === "fr" ? "90 jours" : "90 days" },
    { id: "custom", label: lang === "fr" ? "Personnalisé" : "Custom" },
  ];
  return (
    <div style={{ paddingTop: isMobile ? 56 : 40, paddingRight: isMobile ? 16 : 40, paddingBottom: isMobile ? 16 : 20, paddingLeft: isMobile ? 16 : 40, borderBottom: "1px solid #EFEFEF", background: "#FFF" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap", marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", margin: 0, letterSpacing: "-0.04em" }}>{lang === "fr" ? "Analytiques" : "Analytics"}</h1>
        <button
          type="button"
          className="hero-cta-shopify-light hero-cta-compact"
          style={{ marginTop: 8 }}
          onClick={() => {
            if (!canUseAdvancedAnalytics(plan as PlanTier)) {
              if (onUpgradePro) void onUpgradePro();
              else alert(lang === "fr" ? "L'export CSV et le ROI avancé sont disponibles sur le plan Pro." : "CSV export and advanced ROI are available on the Pro plan.");
              return;
            }
            if (!analyticsData) return;

            const rows = [
              ["Metric", "Value"],
              ["Total Revenue", analyticsData.totalRevenue || 0],
              ["Total Commissions", analyticsData.totalCommissions || 0],
              ["Total Creators Contacted", analyticsData.totalSent || 0],
              ["Response Rate", `${analyticsData.responseRate || 0}%`],
              ["Converted", analyticsData.converted || 0],
              "",
              ["Creator", "Platform", "Sales", "Commission"],
              ...(analyticsData.creators || []).map((c: any) => [
                c.full_name || c.handle,
                c.platform,
                c.total_sales || 0,
                c.total_earned || 0,
              ]),
              "",
              ["Campaign", "Platform", "Status"],
              ...(analyticsData.campaigns || []).map((c: any) => [
                c.name,
                c.platform,
                c.status,
              ]),
            ];

            const csv = rows.map(r => Array.isArray(r) ? r.join(",") : "").join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `trackit-analytics-${new Date().toISOString().split("T")[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          {lang === "fr" ? "Exporter CSV →" : "Export CSV →"}
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", background: "#F5F5F5", borderRadius: 10, padding: 3, gap: 2, overflowX: isMobile ? "auto" : undefined, flexWrap: isMobile ? "nowrap" : undefined }}>
            {ranges.map((r) => (
              <button key={r.id} type="button" onClick={() => setRange(r.id)} style={{
                padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 13, fontFamily: "inherit", cursor: "pointer",
                background: range === r.id ? "#FFF" : "transparent", color: range === r.id ? "#1A1A1A" : "#7A7A7A",
                fontWeight: range === r.id ? 500 : 400, boxShadow: range === r.id ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
              }}>{r.label}</button>
            ))}
          </div>
          {compare && analyticsData?.trends?.revenue ? (
            <TrendStat trend={analyticsData.trends.revenue as PeriodTrend} lang={lang} />
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "#7A7A7A" }}>{lang === "fr" ? "Comparer à la période précédente" : "Compare to previous period"}</span>
          <CompareToggle on={compare} onToggle={() => setCompare(!compare)} />
        </div>
      </div>
    </div>
  );
}

function CompareToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} style={{ position: "relative", width: 40, height: 22, background: on ? "#0047FF" : "#E5E5E5", borderRadius: 999, border: "none", cursor: "pointer", padding: 0 }}>
      <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, background: "#FFF", borderRadius: "50%", transition: "left 0.2s" }} />
    </button>
  );
}

function trendColors(direction: PeriodTrend["direction"]) {
  if (direction === "up") return { fg: "#1FB567", bg: "rgba(31,181,103,0.12)" };
  if (direction === "down") return { fg: "#E53935", bg: "rgba(229,57,53,0.12)" };
  return { fg: "#9A9A9A", bg: "#F5F5F5" };
}

function TrendStat({ trend, lang }: { trend: PeriodTrend; lang: "en" | "fr" }) {
  const { fg, bg } = trendColors(trend.direction);
  const label = formatTrendLabel(trend.changePct, lang);
  const prefix = trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        color: fg,
        background: bg,
        padding: "6px 10px",
        borderRadius: 8,
        letterSpacing: "-0.02em",
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden>{prefix}</span>
      <span>{label}</span>
      <span style={{ fontWeight: 500, color: fg, opacity: 0.85 }}>
        {lang === "fr" ? "revenus" : "revenue"}
      </span>
    </span>
  );
}

function KpiCard({
  title,
  value,
  sub,
  subColor,
  trend,
  lang,
}: {
  title: string;
  value: string;
  sub?: string;
  subColor?: string;
  trend?: PeriodTrend;
  lang?: "en" | "fr";
}) {
  const showTrend = trend && lang;
  const { fg, bg } = showTrend ? trendColors(trend.direction) : { fg: "", bg: "" };
  return (
    <div style={{ background: "#FFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: 8, letterSpacing: "-0.01em" }}>{title}</div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: sub || showTrend ? 6 : 0 }}>
        <div style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em" }}>{value}</div>
        {showTrend ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 600,
              color: fg,
              background: bg,
              padding: "4px 8px",
              borderRadius: 6,
              letterSpacing: "-0.02em",
            }}
          >
            <span aria-hidden>{trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"}</span>
            {formatTrendLabel(trend.changePct, lang)}
          </span>
        ) : null}
      </div>
      {sub ? <div style={{ fontSize: 12, color: subColor || "#9A9A9A", letterSpacing: "-0.01em" }}>{sub}</div> : null}
      {showTrend ? (
        <div style={{ fontSize: 11, color: "#9A9A9A", letterSpacing: "-0.01em" }}>
          {lang === "fr" ? "vs période précédente" : "vs previous period"}
        </div>
      ) : null}
    </div>
  );
}

function ChartCard({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "#FFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 24, ...style }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", margin: "0 0 16px", letterSpacing: "-0.02em" }}>{title}</h3>
      {children}
    </div>
  );
}

function Th({ children, sortable, onClick }: { children: React.ReactNode; sortable?: boolean; onClick?: () => void }) {
  return (
    <th style={{ padding: "10px 8px", color: "#9A9A9A", fontWeight: 500, fontSize: 12, cursor: sortable ? "pointer" : "default", userSelect: "none" }} onClick={onClick}>
      {children}{sortable ? " ↕" : ""}
    </th>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const colors: Record<number, string> = { 1: "#D4AF37", 2: "#9E9E9E", 3: "#CD7F32" };
  const c = colors[rank] ?? "#9A9A9A";
  return <span style={{ fontWeight: 600, color: c }}>#{rank}</span>;
}

function StatusBadge({ lang, status }: { lang: "en" | "fr"; status: string }) {
  const label =
    status === "Active"
      ? lang === "fr"
        ? "Actif"
        : "Active"
      : status === "Inactive"
        ? lang === "fr"
          ? "Inactif"
          : "Inactive"
        : status;
  return <span style={{ fontSize: 11, fontWeight: 600, color: "#1A1A1A", textTransform: "capitalize", letterSpacing: "-0.01em" }}>{label}</span>;
}

function CampaignStatus({ lang, status }: { lang: "en" | "fr"; status: string }) {
  const map: Record<string, { en: string; fr: string }> = {
    Active: { en: "Active", fr: "Actif" },
    Paused: { en: "Paused", fr: "En pause" },
    Completed: { en: "Completed", fr: "Terminé" },
  };
  const s = map[status] ?? map.Completed;
  return <span style={{ fontSize: 11, fontWeight: 600, color: "#1A1A1A", textTransform: "capitalize", letterSpacing: "-0.01em" }}>{lang === "fr" ? s.fr : s.en}</span>;
}

function MiniStat({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div style={{ background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 12, padding: 16, textAlign: "center" }}>
      <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: large ? 28 : 22, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em" }}>{value}</div>
    </div>
  );
}

function FunnelBarChart({ lang, totalSent, responseRate, converted }: { lang: "en" | "fr"; totalSent: number; responseRate: number; converted: number }) {
  const replied = Math.round((totalSent * responseRate) / 100);
  const bars = [
    { label: lang === "fr" ? "Envoyé" : "Sent", value: totalSent, color: "#9A9A9A", h: 100 },
    { label: lang === "fr" ? "Répondu" : "Replied", value: replied, color: "#95BF47", h: totalSent > 0 ? Math.max(8, Math.round((replied / totalSent) * 100)) : 0 },
    { label: lang === "fr" ? "Converti" : "Converted", value: converted, color: "#2E7D32", h: totalSent > 0 ? Math.max(8, Math.round((converted / totalSent) * 100)) : 0 },
  ];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-around", height: 180, gap: 12, paddingTop: 8 }}>
      {bars.map((b) => (
        <div key={b.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ width: "100%", maxWidth: 56, height: `${b.h}%`, minHeight: 8, background: b.color, borderRadius: "6px 6px 0 0" }} />
          <span style={{ fontSize: 11, color: "#7A7A7A" }}>{b.label}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A" }}>{b.value}</span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ lang, netPct }: { lang: "en" | "fr"; netPct: number }) {
  const circumference = 377;
  const dash = Math.round((netPct / 100) * circumference);
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r="60" fill="none" stroke="#EFEFEF" strokeWidth="24" />
        <circle cx="80" cy="80" r="60" fill="none" stroke="#0047FF" strokeWidth="24" strokeDasharray={`${dash} ${circumference}`} strokeDashoffset="0" transform="rotate(-90 80 80)" />
        <text x="80" y="76" textAnchor="middle" fontSize="22" fontWeight="600" fill="#1A1A1A">{netPct}%</text>
        <text x="80" y="94" textAnchor="middle" fontSize="11" fill="#9A9A9A">{lang === "fr" ? "Revenus nets" : "Net revenue"}</text>
      </svg>
    </div>
  );
}
