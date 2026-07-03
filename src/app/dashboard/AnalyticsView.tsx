"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLang } from "@/lib/useLang";
import { CreatorAnalytics } from "./CreatorAnalytics";
import { formatCurrency } from "@/lib/useCurrency";
import { canUseAdvancedAnalytics, type PlanTier } from "@/lib/plan-limits";
import { formatTrendLabel, type PeriodTrend } from "@/lib/analytics-periods";
import { campaignStatusLabel } from "@/lib/campaign-status";
import { OUTREACH_HISTORY_UPDATED_EVENT, PAYOUTS_UPDATED_EVENT, SALES_UPDATED_EVENT, CAMPAIGNS_UPDATED_EVENT, dispatchSalesUpdated } from "@/lib/outreach-history-events";
import { SplitHeaderActions } from "./SplitHeaderActions";
import { CreatorAvatar } from "./CreatorAvatar";
import { useDashboardNavigation } from "./DashboardNavigationProvider";
import { parseCommissionRate } from "@/lib/creator-crm";
import {
  COMMISSION_NOT_CONFIGURED_CODE,
  commissionNotConfiguredMessage,
  commissionRateFromDiscoverySnapshot,
  normalizeCreatorHandle,
} from "@/lib/managed-creator-commission";
import { notifySaleRecorded } from "@/lib/notifications-storage";
import { primeNotificationSound } from "@/lib/notification-sound";

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

type DateRange = "today" | "3d" | "7d" | "30d" | "90d" | "custom";
type SortKey = "sales" | "commission" | "roi" | "creator";

function ChartEmpty({ lang }: { lang: "en" | "fr" }) {
  return (
    <div style={{ padding: "48px 24px", textAlign: "center", color: "#9A9A9A", fontSize: 13 }}>
      {lang === "fr" ? "Pas assez de données pour afficher ce graphique." : "Not enough data to display this chart."}
    </div>
  );
}

export function AnalyticsView(props: { userId?: string; isMobile?: boolean; lang?: string; plan?: PlanTier; shopifyStore?: string; onUpgradePro?: () => void; onConnectShopify?: () => void; isCreator?: boolean }) {
  if (props.isCreator) {
    return <CreatorAnalytics userId={props.userId} isMobile={props.isMobile} />;
  }
  return <BrandAnalyticsView {...props} />;
}

function BrandAnalyticsView({ userId, isMobile, lang: langProp, plan, shopifyStore, onUpgradePro, onConnectShopify }: { userId?: string; isMobile?: boolean; lang?: string; plan?: PlanTier; shopifyStore?: string; onUpgradePro?: () => void; onConnectShopify?: () => void }) {
  const isFree = plan === "free";
  const hasAdvancedAnalytics = canUseAdvancedAnalytics(plan as PlanTier);
  const langHook = useLang();
  const lang = langProp === "fr" || langProp === "en" ? langProp : langHook;
  const { navigate } = useDashboardNavigation();
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [range, setRange] = useState<DateRange>("30d");
  const [compare, setCompare] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("sales");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const refreshAnalytics = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/analytics?userId=${userId}&range=${range}`);
      const data = await res.json();
      setAnalyticsData(data);
    } catch {
      /* keep current data */
    }
  }, [userId, range]);

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
            dispatchSalesUpdated();
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

  useEffect(() => {
    if (!userId) return;

    window.addEventListener(OUTREACH_HISTORY_UPDATED_EVENT, refreshAnalytics);
    window.addEventListener(PAYOUTS_UPDATED_EVENT, refreshAnalytics);
    window.addEventListener(SALES_UPDATED_EVENT, refreshAnalytics);
    window.addEventListener(CAMPAIGNS_UPDATED_EVENT, refreshAnalytics);
    return () => {
      window.removeEventListener(OUTREACH_HISTORY_UPDATED_EVENT, refreshAnalytics);
      window.removeEventListener(PAYOUTS_UPDATED_EVENT, refreshAnalytics);
      window.removeEventListener(SALES_UPDATED_EVENT, refreshAnalytics);
      window.removeEventListener(CAMPAIGNS_UPDATED_EVENT, refreshAnalytics);
    };
  }, [userId, refreshAnalytics]);

  const shopifyConnected = !!(shopifyStore || analyticsData?.shopifyConnected);
  const HAS_DATA = !loadingData && (analyticsData?.hasData === true || shopifyConnected);

  const sortedCreators = useMemo(() => {
    type CreatorPerfRow = {
      id?: string;
      full_name?: string;
      handle?: string;
      avatar_url?: string;
      platform?: string;
      periodRevenue?: number;
      periodCommission?: number;
      salesCount?: number;
      commissionPaid?: number;
      commissionPaidPeriod?: number;
      roi?: number;
      status?: string;
    };
    const source: CreatorPerfRow[] = analyticsData?.creatorsPerformance || analyticsData?.creators || [];
    const rows = source.map((c, i) => {
      const revenue = Number(c.periodRevenue ?? 0);
      const periodCommission = Number(c.periodCommission ?? 0);
      const paidPeriod = Number(c.commissionPaidPeriod ?? 0);
      const paidAllTime = Number(c.commissionPaid ?? 0);
      const commission = paidPeriod > 0 ? paidPeriod : periodCommission > 0 ? periodCommission : paidAllTime;
      const roi = Number(c.roi ?? (periodCommission > 0 ? revenue / periodCommission : 0));
      const handle = (c.handle || "").replace(/^@/, "");
      return {
        id: c.id || `creator-${i}`,
        rank: i + 1,
        creator: c.full_name || (handle ? `@${handle}` : "—"),
        handle,
        avatar_url: c.avatar_url || null,
        platform: c.platform || "—",
        sales: revenue,
        salesCount: Number(c.salesCount ?? 0),
        commission,
        status: c.status || (revenue > 0 ? "Active" : "Inactive"),
        roi,
      };
    });
    rows.sort((a, b) => {
      const av = sortKey === "creator" ? a.creator : sortKey === "commission" ? a.commission : sortKey === "roi" ? a.roi : a.sales;
      const bv = sortKey === "creator" ? b.creator : sortKey === "commission" ? b.commission : sortKey === "roi" ? b.roi : b.sales;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    rows.forEach((r, i) => {
      r.rank = i + 1;
    });
    return rows;
  }, [sortKey, sortDir, analyticsData]);

  const campaignRows = analyticsData?.campaigns || [];
  const totalSent = analyticsData?.totalSent || 0;
  const outreachMessagesSent = analyticsData?.outreachMessagesSent || 0;
  const responseRate = analyticsData?.responseRate || 0;
  const converted = analyticsData?.converted || 0;
  const totalRevenue = analyticsData?.totalRevenue || 0;
  const totalCommissions = analyticsData?.totalCommissions || 0;
  const accruedCommissions = analyticsData?.accruedCommissions || 0;
  const revenueTimeline = (analyticsData?.revenueTimeline || []) as Array<{ date: string; revenue: number }>;
  const platformBreakdown = (analyticsData?.platformBreakdown || []) as Array<{ platform: string; revenue: number; commission: number; salesCount: number }>;
  const outreachByPlatform = (analyticsData?.outreachByPlatform || []) as Array<{ platform: string; sent: number; replied: number; converted: number; bestMessage: string }>;
  const followUpImpact = analyticsData?.followUpImpact as
    | { withFollowUp?: { sent: number; replied: number; replyRate: number }; withoutFollowUp?: { sent: number; replied: number; replyRate: number } }
    | undefined;
  const netRevenue = Math.max(0, totalRevenue - accruedCommissions);
  const conversionRate = outreachMessagesSent > 0 ? Math.round((converted / outreachMessagesSent) * 100) : 0;
  const avgCommissionRate = totalRevenue > 0 ? Math.round((accruedCommissions / totalRevenue) * 100) : 0;
  const trends = analyticsData?.trends as
    | {
        revenue?: PeriodTrend;
        commissions?: PeriodTrend;
        outreachSent?: PeriodTrend;
        responseRate?: PeriodTrend;
      }
    | undefined;

  const [showSaleModal, setShowSaleModal] = useState(false);
  const [saleCreators, setSaleCreators] = useState<{ id: string; label: string; handle: string; commission?: number }[]>([]);
  const [saleCreatorId, setSaleCreatorId] = useState("");
  const [saleAmount, setSaleAmount] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [saleCampaignId, setSaleCampaignId] = useState("");
  const [saleBusy, setSaleBusy] = useState(false);
  const [saleMsg, setSaleMsg] = useState("");
  const saleModalBackdropReadyRef = useRef(false);

  useEffect(() => {
    if (!showSaleModal) {
      saleModalBackdropReadyRef.current = false;
      return;
    }
    saleModalBackdropReadyRef.current = false;
    const timer = window.setTimeout(() => {
      saleModalBackdropReadyRef.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [showSaleModal]);

  const closeSaleModal = useCallback(() => {
    if (saleBusy) return;
    setShowSaleModal(false);
  }, [saleBusy]);

  const openSaleModal = useCallback(async () => {
    setShowSaleModal(true);
    setSaleMsg("");
    try {
      const [creatorsRes, savedRes] = await Promise.all([
        fetch(`/api/creators-list?userId=${userId}`),
        fetch("/api/saved", { cache: "no-store" }),
      ]);
      const data = await creatorsRes.json();
      const savedData = savedRes.ok ? await savedRes.json() : { rows: [] };

      const commissionByHandle = new Map<string, number>();
      for (const row of savedData.rows || []) {
        const rate = commissionRateFromDiscoverySnapshot(row.snapshot);
        if (rate != null) {
          commissionByHandle.set(normalizeCreatorHandle(String(row.creator_username || "")), rate);
        }
      }

      const list = (data.creators || data || []).map(
        (c: { id: string; full_name?: string; handle?: string; commission_rate?: number | null }) => {
        const handle = c.handle || "";
        const fromCrm = commissionByHandle.get(normalizeCreatorHandle(handle));
        const fromCreator = parseCommissionRate(c.commission_rate);
        const commission = fromCrm ?? fromCreator ?? 10;
        return {
          id: c.id,
          label: c.full_name || handle || c.id,
          handle,
          commission,
        };
      });
      setSaleCreators(list);
      if (list.length > 0) setSaleCreatorId(list[0].id);
    } catch {
      setSaleMsg(lang === "fr" ? "Impossible de charger vos créateurs" : "Could not load your creators");
    }
  }, [lang, userId]);

  const submitManualSale = async () => {
    if (!saleCreatorId || !saleAmount) return;
    primeNotificationSound();
    setSaleBusy(true);
    setSaleMsg("");
    try {
      const res = await fetch("/api/sales/manual", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, creatorId: saleCreatorId, amount: saleAmount, date: saleDate || undefined, campaignId: saleCampaignId || undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        const selectedCreator = saleCreators.find((c) => c.id === saleCreatorId);
        const creatorName = selectedCreator?.label?.trim() || (lang === "fr" ? "un créateur" : "a creator");
        const orderTotal = Number.parseFloat(saleAmount) || 0;
        if (userId) {
          notifySaleRecorded(lang, creatorName, orderTotal, data.commissionAmount ?? 0, userId);
        }
        dispatchSalesUpdated();
        setShowSaleModal(false);
        setSaleBusy(false);
        setSaleAmount("");
        setSaleDate("");
        setSaleCampaignId("");
        setSaleMsg("");
        void refreshAnalytics();
      } else {
        setSaleMsg(
          data.code === COMMISSION_NOT_CONFIGURED_CODE
            ? commissionNotConfiguredMessage(lang)
            : (lang === "fr" ? data.errorFr : undefined) || data.error || (lang === "fr" ? "Échec de l'ajout" : "Failed to add sale")
        );
        setSaleBusy(false);
      }
    } catch {
      setSaleMsg(lang === "fr" ? "Erreur réseau" : "Network error");
      setSaleBusy(false);
    }
  };

  const selectedSaleCreator = saleCreators.find((c) => c.id === saleCreatorId);
  const hasSaleCommission = selectedSaleCreator?.commission != null;

  const saleModal =
    showSaleModal && typeof document !== "undefined"
      ? createPortal(
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200 }}
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget || !saleModalBackdropReadyRef.current) return;
        closeSaleModal();
      }}
    >
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 380, maxWidth: "90vw" }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 4px", color: "#1A1A1A" }}>{lang === "fr" ? "Ajouter une vente" : "Add a sale"}</h3>
        <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 16px" }}>{lang === "fr" ? "Enregistrez une vente générée par un créateur. La commission est calculée automatiquement." : "Record a sale driven by a creator. Commission is calculated automatically."}</p>
        <label style={{ fontSize: 12, fontWeight: 500, color: "#555", display: "block", marginBottom: 4 }}>{lang === "fr" ? "Créateur" : "Creator"}</label>
        <select value={saleCreatorId} onChange={(e) => setSaleCreatorId(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #E5E5E5", fontSize: 14, marginBottom: 12 }}>
          {saleCreators.length === 0 && <option value="">{lang === "fr" ? "Aucun créateur géré" : "No managed creators"}</option>}
          {saleCreators.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
              {c.commission != null ? ` (${c.commission}%)` : lang === "fr" ? " — commission manquante" : " — no commission"}
            </option>
          ))}
        </select>
        {saleCreatorId && !hasSaleCommission ? (
          <div style={{ marginBottom: 12, padding: "12px 14px", borderRadius: 8, border: "1px solid #EFEFEF", background: "#FFFFFF" }}>
            <p style={{ fontSize: 13, color: "#1A1A1A", margin: "0 0 10px", lineHeight: 1.45 }}>
              {commissionNotConfiguredMessage(lang)}
            </p>
            <button
              type="button"
              onClick={() => {
                setShowSaleModal(false);
                navigate({ view: "creators" });
              }}
              style={{ border: "none", background: "#0047FF", color: "#fff", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
            >
              {lang === "fr" ? "Ouvrir Find it → Gérer" : "Open Find it → Manage"}
            </button>
          </div>
        ) : null}
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
        {saleMsg ? <div style={{ fontSize: 13, color: "#C0392B", marginBottom: 12 }}>{saleMsg}</div> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" disabled={saleBusy} onClick={closeSaleModal} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #E5E5E5", background: "#fff", fontSize: 14, cursor: "pointer" }}>{lang === "fr" ? "Annuler" : "Cancel"}</button>
          <button type="button" disabled={saleBusy || !saleCreatorId || !saleAmount || !hasSaleCommission} onClick={submitManualSale} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#0047FF", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", opacity: saleBusy || !saleCreatorId || !saleAmount || !hasSaleCommission ? 0.5 : 1 }}>{saleBusy ? "…" : lang === "fr" ? "Ajouter" : "Add"}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
      : null;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const exportAnalyticsCsv = () => {
    if (!canUseAdvancedAnalytics(plan as PlanTier)) {
      if (onUpgradePro) void onUpgradePro();
      else alert(lang === "fr" ? "L'export CSV et le ROI avancé sont disponibles sur le plan Pro." : "CSV export and advanced ROI are available on the Pro plan.");
      return;
    }
    if (!analyticsData) return;

    const creatorRows = (analyticsData.creatorsPerformance || analyticsData.creators || []) as Array<{
      full_name?: string;
      handle?: string;
      platform?: string;
      periodRevenue?: number;
      periodCommission?: number;
      commissionPaid?: number;
    }>;

    const rows = [
      ["Metric", "Value"],
      ["Total Revenue", analyticsData.totalRevenue || 0],
      ["Total Commissions Paid", analyticsData.totalCommissions || 0],
      ["Accrued Commissions", analyticsData.accruedCommissions || 0],
      ["Total Creators Contacted", analyticsData.totalSent || 0],
      ["Outreach Messages Sent", analyticsData.outreachMessagesSent || 0],
      ["Response Rate", `${analyticsData.responseRate || 0}%`],
      ["Converted", analyticsData.converted || 0],
      "",
      ["Creator", "Platform", "Revenue", "Commission", "Commission Paid"],
      ...creatorRows.map((c) => [
        c.full_name || c.handle || "",
        c.platform || "",
        c.periodRevenue || 0,
        c.periodCommission || 0,
        c.commissionPaid || 0,
      ]),
      "",
      ["Campaign", "Creators", "Sales", "Commissions", "Status"],
      ...(analyticsData.campaigns || []).map((c: { name?: string; creatorCount?: number; totalSales?: number; totalCommissions?: number; status?: string }) => [
        c.name,
        c.creatorCount ?? 0,
        c.totalSales ?? 0,
        c.totalCommissions ?? 0,
        c.status,
      ]),
    ];

    const csv = rows.map((r) => (Array.isArray(r) ? r.join(",") : "")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trackit-analytics-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loadingData) {
    return (
      <>
        <AnalyticsHeader isMobile={isMobile} lang={lang} range={range} setRange={setRange} compare={compare} setCompare={setCompare} analyticsData={analyticsData} />
        <div style={{ padding: 80, textAlign: "center", color: "#9A9A9A", fontSize: 14 }}>
          {lang === "fr" ? "Chargement des analytiques…" : "Loading analytics…"}
        </div>
      </>
    );
  }

  if (!HAS_DATA) {
    return (
      <>
        <AnalyticsHeader isMobile={isMobile} lang={lang} range={range} setRange={setRange} compare={compare} setCompare={setCompare} analyticsData={analyticsData} />
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
      <AnalyticsHeader isMobile={isMobile} lang={lang} range={range} setRange={setRange} compare={compare} setCompare={setCompare} analyticsData={analyticsData} />
      <div style={{ padding: isMobile ? 16 : "24px 40px 40px", paddingTop: isMobile ? 56 : undefined }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <SplitHeaderActions
            variant="white"
            size="compact"
            primaryLabel={lang === "fr" ? "+ Ajouter une vente" : "+ Add a sale"}
            onPrimaryClick={openSaleModal}
            menuAriaLabel={lang === "fr" ? "Plus d'actions" : "More actions"}
            menuItems={[
              {
                label: lang === "fr" ? "Exporter CSV →" : "Export CSV →",
                onClick: exportAnalyticsCsv,
                icon: (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M12 3v12M8 11l4 4 4-4M5 21h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ),
              },
            ]}
          />
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
            {revenueTimeline.length > 0 ? (
              <RevenueTimelineChart lang={lang} points={revenueTimeline} />
            ) : (
              <ChartEmpty lang={lang} />
            )}
          </ChartCard>
          <ChartCard title={lang === "fr" ? "Performance des messages" : "Outreach Performance"}>
            {outreachMessagesSent > 0 ? (
              <FunnelBarChart lang={lang} totalSent={outreachMessagesSent} responseRate={responseRate} converted={converted} />
            ) : (
              <ChartEmpty lang={lang} />
            )}
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
                ) : sortedCreators.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #F5F5F5", position: "relative" }}>
                    <td style={{ padding: "12px 8px", filter: isFree && i >= 2 ? "blur(4px)" : "none", userSelect: isFree && i >= 2 ? "none" : "auto" }}><RankBadge rank={r.rank} /></td>
                    <td style={{ padding: "12px 8px", filter: isFree && i >= 2 ? "blur(4px)" : "none", userSelect: isFree && i >= 2 ? "none" : "auto" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <CreatorAvatar src={r.avatar_url} username={r.handle} displayName={r.creator} size={36} alt={r.creator} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 500, color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.creator}</div>
                          {r.handle && r.creator !== `@${r.handle}` ? (
                            <div style={{ fontSize: 12, color: "#0047FF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{r.handle}</div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 8px", color: "#7A7A7A", filter: isFree && i >= 2 ? "blur(4px)" : "none" }}>{r.platform}</td>
                    <td style={{ padding: "12px 8px", filter: isFree && i >= 2 ? "blur(4px)" : "none" }}>
                      <div style={{ fontWeight: 500, color: "#1A1A1A" }}>{formatCurrency(r.sales, lang)}</div>
                      {r.salesCount > 0 ? (
                        <div style={{ fontSize: 11, color: "#9A9A9A", marginTop: 2 }}>
                          {r.salesCount} {lang === "fr" ? (r.salesCount > 1 ? "ventes" : "vente") : r.salesCount > 1 ? "sales" : "sale"}
                        </div>
                      ) : null}
                    </td>
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
            {platformBreakdown.length > 0 ? (
              <PlatformBreakdownChart lang={lang} rows={platformBreakdown} />
            ) : (
              <ChartEmpty lang={lang} />
            )}
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
              ) : campaignRows.map((c: { id?: string; name?: string; platform?: string; status?: string; created_at?: string | null; start_date?: string | null; creatorCount?: number; totalSales?: number; totalCommissions?: number; roi?: number }) => (
                <tr key={c.id || c.name} style={{ borderBottom: "1px solid #F5F5F5" }}>
                  <td style={{ padding: "12px 8px", fontWeight: 500 }}>{c.name || "—"}</td>
                  <td style={{ padding: "12px 8px" }}>{c.creatorCount ?? 0}</td>
                  <td style={{ padding: "12px 8px" }}>{formatCurrency(c.totalSales ?? 0, lang)}</td>
                  <td style={{ padding: "12px 8px" }}>{formatCurrency(c.totalCommissions ?? 0, lang)}</td>
                  <td style={{ padding: "12px 8px" }}>{c.roi && c.roi > 0 ? `${c.roi.toFixed(1)}x` : "—"}</td>
                  <td style={{ padding: "12px 8px", color: "#7A7A7A" }}>{formatCampaignStartDate(c.start_date || c.created_at, lang)}</td>
                  <td style={{ padding: "12px 8px" }}><CampaignStatus lang={lang} status={String(c.status || "Draft")} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </ChartCard>

        <ChartCard title={lang === "fr" ? "Détail des messages" : "Outreach Breakdown"} style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            <MiniStat label={lang === "fr" ? "Total envoyé" : "Total sent"} value={String(outreachMessagesSent)} />
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
              {outreachByPlatform.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "32px 8px", textAlign: "center", color: "#9A9A9A", fontSize: 13 }}>
                    {lang === "fr" ? "Aucun message envoyé sur cette période." : "No outreach sent in this period."}
                  </td>
                </tr>
              ) : outreachByPlatform.map((row) => (
                <tr key={row.platform} style={{ borderBottom: "1px solid #F5F5F5" }}>
                  <td style={{ padding: "12px 8px", fontWeight: 500 }}>{row.platform}</td>
                  <td style={{ padding: "12px 8px" }}>{row.sent}</td>
                  <td style={{ padding: "12px 8px" }}>{row.replied}</td>
                  <td style={{ padding: "12px 8px" }}>{row.converted}</td>
                  <td style={{ padding: "12px 8px", color: "#7A7A7A", maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {row.bestMessage || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </ChartCard>

        <ChartCard title={lang === "fr" ? "Impact des relances" : "Follow Up Impact"}>
          {(followUpImpact?.withFollowUp?.sent || 0) + (followUpImpact?.withoutFollowUp?.sent || 0) > 0 ? (
            <FollowUpImpactChart lang={lang} withFollowUp={followUpImpact?.withFollowUp} withoutFollowUp={followUpImpact?.withoutFollowUp} />
          ) : (
            <ChartEmpty lang={lang} />
          )}
        </ChartCard>
      </div>
    </>
  );
}

function AnalyticsHeader({ lang, range, setRange, compare, setCompare, isMobile, analyticsData }: {
  lang: "en" | "fr";
  range: DateRange; setRange: (r: DateRange) => void;
  compare: boolean; setCompare: (v: boolean) => void;
  isMobile?: boolean;
  analyticsData?: any;
}) {
  const ranges: { id: DateRange; label: string }[] = [
    { id: "today", label: lang === "fr" ? "Aujourd'hui" : "Today" },
    { id: "3d", label: lang === "fr" ? "3 jours" : "3 days" },
    { id: "7d", label: lang === "fr" ? "7 jours" : "7 days" },
    { id: "30d", label: lang === "fr" ? "30 jours" : "30 days" },
    { id: "90d", label: lang === "fr" ? "90 jours" : "90 days" },
    { id: "custom", label: lang === "fr" ? "Personnalisé" : "Custom" },
  ];
  return (
    <div style={{ paddingTop: isMobile ? 56 : 40, paddingRight: isMobile ? 16 : 40, paddingBottom: isMobile ? 16 : 20, paddingLeft: isMobile ? 16 : 40, borderBottom: "1px solid #EFEFEF", background: "#FFF" }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", margin: 0, letterSpacing: "-0.04em" }}>{lang === "fr" ? "Analytiques" : "Analytics"}</h1>
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
  const normalized = status.toLowerCase();
  const label =
    normalized === "active"
      ? lang === "fr"
        ? "Actif"
        : "Active"
      : normalized === "inactive"
        ? lang === "fr"
          ? "Inactif"
          : "Inactive"
        : normalized === "pending"
          ? lang === "fr"
            ? "En attente"
            : "Pending"
          : normalized === "paid"
            ? lang === "fr"
              ? "Payé"
              : "Paid"
            : status;
  const color =
    normalized === "active" || normalized === "paid"
      ? "#2E7D32"
      : normalized === "pending"
        ? "#B8860B"
        : "#7A7A7A";
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, textTransform: "capitalize", letterSpacing: "-0.01em" }}>
      {label}
    </span>
  );
}

function CampaignStatus({ lang, status }: { lang: "en" | "fr"; status: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: "#1A1A1A", textTransform: "capitalize", letterSpacing: "-0.01em" }}>
      {campaignStatusLabel(status, lang)}
    </span>
  );
}

function formatCampaignStartDate(value: string | null | undefined, lang: "en" | "fr") {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.split("T")[0] ?? "—";
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { year: "numeric", month: "short", day: "numeric" });
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

function RevenueTimelineChart({ lang, points }: { lang: "en" | "fr"; points: Array<{ date: string; revenue: number }> }) {
  const max = Math.max(...points.map((p) => p.revenue), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 180, paddingTop: 8 }}>
      {points.map((p) => {
        const h = Math.max(8, Math.round((p.revenue / max) * 100));
        return (
          <div key={p.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 28 }}>
            <div style={{ width: "100%", maxWidth: 40, height: `${h}%`, minHeight: 8, background: "#0047FF", borderRadius: "6px 6px 0 0" }} title={formatCurrency(p.revenue, lang)} />
            <span style={{ fontSize: 10, color: "#9A9A9A" }}>{p.date.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

function PlatformBreakdownChart({
  lang,
  rows,
}: {
  lang: "en" | "fr";
  rows: Array<{ platform: string; revenue: number; commission: number; salesCount: number }>;
}) {
  const max = Math.max(...rows.map((r) => r.revenue), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((row) => {
        const pct = Math.max(4, Math.round((row.revenue / max) * 100));
        return (
          <div key={row.platform}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
              <span style={{ fontWeight: 500, color: "#1A1A1A" }}>{row.platform}</span>
              <span style={{ color: "#7A7A7A" }}>{formatCurrency(row.revenue, lang)} · {row.salesCount} {lang === "fr" ? "ventes" : "sales"}</span>
            </div>
            <div style={{ height: 8, background: "#F0F0F0", borderRadius: 999 }}>
              <div style={{ width: `${pct}%`, height: 8, background: "#0047FF", borderRadius: 999 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FollowUpImpactChart({
  lang,
  withFollowUp,
  withoutFollowUp,
}: {
  lang: "en" | "fr";
  withFollowUp?: { sent: number; replied: number; replyRate: number };
  withoutFollowUp?: { sent: number; replied: number; replyRate: number };
}) {
  const groups = [
    { label: lang === "fr" ? "Avec relance" : "With follow-up", stats: withFollowUp },
    { label: lang === "fr" ? "Sans relance" : "Without follow-up", stats: withoutFollowUp },
  ];
  const maxRate = Math.max(withFollowUp?.replyRate || 0, withoutFollowUp?.replyRate || 0, 1);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {groups.map((g) => (
        <div key={g.label} style={{ background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 8 }}>{g.label}</div>
          <div style={{ fontSize: 12, color: "#7A7A7A", marginBottom: 10 }}>
            {g.stats?.sent ?? 0} {lang === "fr" ? "envoyés" : "sent"} · {g.stats?.replied ?? 0} {lang === "fr" ? "réponses" : "replies"}
          </div>
          <div style={{ height: 8, background: "#ECECEC", borderRadius: 999, marginBottom: 6 }}>
            <div
              style={{
                width: `${Math.max(4, Math.round(((g.stats?.replyRate || 0) / maxRate) * 100))}%`,
                height: 8,
                background: "#95BF47",
                borderRadius: 999,
              }}
            />
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#1A1A1A" }}>{g.stats?.replyRate ?? 0}%</div>
        </div>
      ))}
    </div>
  );
}
