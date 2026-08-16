"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { CreatorAnalytics } from "./CreatorAnalytics";
import { formatCurrency, useDisplayCurrency } from "@/lib/useCurrency";
import { canUseAdvancedAnalytics, type PlanTier } from "@/lib/plan-limits";
import {
  fillChartSeries,
  computeTrend,
  formatTrendLabel,
  getPeriodBounds,
  toDayKey,
  type PeriodTrend,
} from "@/lib/analytics-periods";
import { campaignStatusLabel } from "@/lib/campaign-status";
import { dispatchSalesUpdated } from "@/lib/outreach-history-events";
import { useAnalyticsAutoRefresh } from "@/lib/analytics-auto-refresh";
import { SplitHeaderActions } from "./SplitHeaderActions";
import { CreatorAvatar } from "./CreatorAvatar";
import { AddSalePanel } from "./AddSalePanel";
import {
  AnalyticsChartCard as ChartCard,
  AnalyticsSectionHeader,
  HeroBarChartCard,
  ProfitabilityPill,
  SummaryMetricCard,
  trendColors,
} from "./analytics-metric-cards";
import { AnalyticsSalesPanel } from "./AnalyticsSalesPanel";

type DateRange = "today" | "3d" | "7d" | "30d" | "90d" | "custom";
type SortKey = "sales" | "commission" | "roi" | "creator";

export function AnalyticsView(props: { userId?: string; isMobile?: boolean; lang?: string; plan?: PlanTier; shopifyStore?: string; onUpgradePro?: () => void; onConnectShopify?: () => void; isCreator?: boolean }) {
  if (props.isCreator) {
    return <CreatorAnalytics userId={props.userId} isMobile={props.isMobile} />;
  }
  return <BrandAnalyticsView {...props} />;
}

function BrandAnalyticsView({ userId, isMobile, lang: langProp, plan, shopifyStore, onUpgradePro, onConnectShopify }: { userId?: string; isMobile?: boolean; lang?: string; plan?: PlanTier; shopifyStore?: string; onUpgradePro?: () => void; onConnectShopify?: () => void }) {
  useDisplayCurrency();
  const isFree = plan === "free";
  const hasAdvancedAnalytics = canUseAdvancedAnalytics(plan as PlanTier);
  const langHook = useLang();
  const lang = langProp === "fr" || langProp === "en" ? langProp : langHook;
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [range, setRange] = useState<DateRange>("30d");
  const [compare, setCompare] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("sales");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const hasPaintedRef = useRef(false);

  const tzOffset = new Date().getTimezoneOffset();

  const fetchAnalytics = useCallback(
    async (activeRange: DateRange) => {
      const { cachedJsonFetch } = await import("@/lib/dashboard-fetch-cache");
      return cachedJsonFetch<Record<string, unknown>>(
        `/api/analytics?userId=${userId}&range=${activeRange}&tzOffset=${tzOffset}`,
        { credentials: "include" },
        { preferCache: true, ttlMs: 20_000 },
      );
    },
    [userId, tzOffset],
  );

  const refreshAnalytics = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await fetchAnalytics(range);
      setAnalyticsData(data);
      hasPaintedRef.current = true;
    } catch {
      /* keep current data */
    }
  }, [userId, range, fetchAnalytics]);

  useEffect(() => {
    if (!userId) {
      setLoadingData(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      // Keep previous charts visible while range changes / soft refresh.
      if (!hasPaintedRef.current) setLoadingData(true);

      try {
        const data = await fetchAnalytics(range);
        if (cancelled) return;
        setAnalyticsData(data);
        hasPaintedRef.current = true;
        setLoadingData(false);

        // Shopify sync in background — never block the first paint.
        const shouldSync = !!(shopifyStore || data?.shopifyConnected);
        if (!shouldSync) return;
        try {
          await fetch("/api/shopify/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          });
          if (cancelled) return;
          dispatchSalesUpdated();
          const refreshed = await fetchAnalytics(range);
          if (!cancelled) setAnalyticsData(refreshed);
        } catch {
          // Keep first analytics payload if sync fails
        }
      } catch {
        if (!cancelled) {
          if (!hasPaintedRef.current) setAnalyticsData(null);
          setLoadingData(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, shopifyStore, range, tzOffset, fetchAnalytics]);

  useAnalyticsAutoRefresh(refreshAnalytics, { enabled: !!userId });

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
      const commission = paidPeriod > 0 ? paidPeriod : periodCommission;
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
  const totalRevenue = analyticsData?.totalRevenue || 0;
  const totalCommissions = analyticsData?.totalCommissions || 0;
  const accruedCommissions = analyticsData?.accruedCommissions || 0;
  const revenueTimeline = (analyticsData?.revenueTimeline || []) as Array<{
    date: string;
    revenue: number;
    commission?: number;
    salesCount?: number;
    net?: number;
  }>;
  const netRevenue = Math.max(0, totalRevenue - accruedCommissions);
  const overallRoi = accruedCommissions > 0 ? totalRevenue / accruedCommissions : 0;
  const isProfitable = overallRoi >= 1 || (accruedCommissions === 0 && totalRevenue > 0);
  const trends = analyticsData?.trends as
    | {
        revenue?: PeriodTrend;
        commissions?: PeriodTrend;
        accruedCommissions?: PeriodTrend;
        netRevenue?: PeriodTrend;
        roi?: PeriodTrend;
        outreachSent?: PeriodTrend;
        responseRate?: PeriodTrend;
        converted?: PeriodTrend;
      }
    | undefined;

  const periodBounds = useMemo(() => {
    const periodRange = range === "custom" ? "30d" : range;
    return getPeriodBounds(periodRange);
  }, [range]);

  const currentStartKey = toDayKey(periodBounds.start);

  // Full span: previous period → current (for bar charts).
  const revenueSeriesFull = useMemo(
    () =>
      fillChartSeries(
        revenueTimeline.map((p) => ({ date: p.date, value: Number(p.revenue) || 0 })),
        periodBounds.prevStart,
        periodBounds.end,
      ),
    [revenueTimeline, periodBounds],
  );
  const salesCountSeriesFull = useMemo(
    () =>
      fillChartSeries(
        revenueTimeline.map((p) => ({ date: p.date, value: Number(p.salesCount) || 0 })),
        periodBounds.prevStart,
        periodBounds.end,
      ),
    [revenueTimeline, periodBounds],
  );

  // Current period only (hero line charts).
  const revenueSeries = useMemo(
    () => revenueSeriesFull.filter((p) => p.date >= currentStartKey),
    [revenueSeriesFull, currentStartKey],
  );
  const netSeries = useMemo(
    () =>
      fillChartSeries(
        revenueTimeline.map((p) => ({
          date: p.date,
          value: Number(p.net ?? Math.max(0, (Number(p.revenue) || 0) - (Number(p.commission) || 0))),
        })),
        periodBounds.start,
        periodBounds.end,
      ).filter((p) => p.date >= currentStartKey),
    [revenueTimeline, periodBounds, currentStartKey],
  );
  const salesCountSeries = useMemo(
    () => salesCountSeriesFull.filter((p) => p.date >= currentStartKey),
    [salesCountSeriesFull, currentStartKey],
  );

  const salesVolumeTrend = useMemo(() => {
    const prevStartKey = toDayKey(periodBounds.prevStart);
    let current = 0;
    let previous = 0;
    for (const p of revenueTimeline) {
      const count = Number(p.salesCount) || 0;
      if (p.date >= currentStartKey) current += count;
      else if (p.date >= prevStartKey && p.date < currentStartKey) previous += count;
    }
    return computeTrend(current, previous);
  }, [revenueTimeline, currentStartKey, periodBounds.prevStart]);

  const periodSalesCount = useMemo(
    () => salesCountSeries.reduce((sum, p) => sum + p.value, 0),
    [salesCountSeries],
  );

  const roiSparklineSeries = useMemo(
    () =>
      revenueSeries.map((p) => {
        const day = revenueTimeline.find((t) => t.date === p.date);
        const rev = Number(day?.revenue) || 0;
        const comm = Number(day?.commission) || 0;
        return { date: p.date, value: comm > 0 ? rev / comm : 0 };
      }),
    [revenueSeries, revenueTimeline],
  );

  const [showAddSalePanel, setShowAddSalePanel] = useState(false);

  const saleCampaignOptions = useMemo(
    () =>
      (campaignRows as { id?: string; name?: string }[])
        .filter((c) => c.id)
        .map((c) => ({ id: String(c.id), name: String(c.name || c.id) })),
    [campaignRows],
  );

  const handleSaleAdded = useCallback(async () => {
    dispatchSalesUpdated();
    await refreshAnalytics();
  }, [refreshAnalytics]);

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
            <button type="button" onClick={() => setShowAddSalePanel(true)} style={{ background: "none", border: "none", color: "#0047FF", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
              {lang === "fr" ? "Ou ajoutez vos ventes manuellement" : "Or add your sales manually"}
            </button>
          </div>
        </div>
        <AddSalePanel
          open={showAddSalePanel}
          onClose={() => setShowAddSalePanel(false)}
          lang={lang}
          userId={userId}
          campaigns={saleCampaignOptions}
          onSuccess={handleSaleAdded}
        />
      </>
    );
  }

  return (
    <>
      <AnalyticsHeader isMobile={isMobile} lang={lang} range={range} setRange={setRange} compare={compare} setCompare={setCompare} analyticsData={analyticsData} />
      <div style={{ padding: isMobile ? 16 : "24px 40px 40px", paddingTop: isMobile ? 16 : undefined }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <SplitHeaderActions
            variant="white"
            size="compact"
            primaryLabel={lang === "fr" ? "+ Ajouter une vente" : "+ Add a sale"}
            onPrimaryClick={() => setShowAddSalePanel(true)}
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
        <AddSalePanel
          open={showAddSalePanel}
          onClose={() => setShowAddSalePanel(false)}
          lang={lang}
          userId={userId}
          campaigns={saleCampaignOptions}
          onSuccess={handleSaleAdded}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: 14,
            marginBottom: 14,
          }}
        >
          <SummaryMetricCard
            title={lang === "fr" ? "Revenus totaux" : "Total revenue"}
            info={
              lang === "fr"
                ? "Somme des commandes générées par vos créateurs sur la période sélectionnée."
                : "Sum of orders driven by your creators in the selected period."
            }
            value={formatCurrency(totalRevenue, lang)}
            trend={compare ? trends?.revenue : undefined}
            sparklineSeries={revenueSeries}
            lang={lang}
          />
          <SummaryMetricCard
            title={lang === "fr" ? "Revenus nets" : "Net revenue"}
            info={
              lang === "fr"
                ? "Revenus générés moins les commissions dues aux créateurs."
                : "Revenue generated minus commissions owed to creators."
            }
            value={formatCurrency(netRevenue, lang)}
            trend={compare ? trends?.netRevenue : undefined}
            sparklineSeries={netSeries}
            lang={lang}
            profitability={totalRevenue > 0 || accruedCommissions > 0 ? isProfitable : undefined}
          />
          <SummaryMetricCard
            title={lang === "fr" ? "Rentabilité (ROI)" : "Profitability (ROI)"}
            info={
              lang === "fr"
                ? "Revenus divisés par les commissions dues. Au-dessus de 1×, le partenariat est rentable."
                : "Revenue divided by commissions owed. Above 1×, the partnership is profitable."
            }
            value={overallRoi > 0 ? `${overallRoi.toFixed(1)}×` : "—"}
            trend={compare ? trends?.roi : undefined}
            sparklineSeries={roiSparklineSeries}
            lang={lang}
            profitability={totalRevenue > 0 || accruedCommissions > 0 ? isProfitable : undefined}
          />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: "stretch",
            gap: isMobile ? 20 : 20,
            marginBottom: 28,
            minWidth: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <HeroBarChartCard
              title={lang === "fr" ? "Volume de ventes" : "Sales volume"}
              info={
                lang === "fr"
                  ? "Volume cumulé de ventes, de la période précédente à la période actuelle — un bâton tous les 7 jours."
                  : "Cumulative sales volume from the previous period through the current one — one bar every 7 days."
              }
              value={String(periodSalesCount || analyticsData?.salesCount || 0)}
              trend={compare ? salesVolumeTrend : undefined}
              series={salesCountSeries}
              formatPoint={(v) =>
                lang === "fr"
                  ? `${Math.round(v)} vente${Math.round(v) === 1 ? "" : "s"}`
                  : `${Math.round(v)} sale${Math.round(v) === 1 ? "" : "s"}`
              }
              lang={lang}
              period={range === "custom" ? "custom" : range}
              onPeriodChange={(next) => {
                if (next === "today" || next === "3d" || next === "7d" || next === "30d" || next === "90d") {
                  setRange(next);
                }
              }}
            />
          </div>

          <AnalyticsSalesPanel
            userId={userId}
            lang={lang}
            isMobile={isMobile}
            syncRange={range === "custom" ? "30d" : range}
            onSalesChange={refreshAnalytics}
          />
        </div>

        <AnalyticsSectionHeader
          title={lang === "fr" ? "Performances créateurs" : "Creator performance"}
          info={
            lang === "fr"
              ? "Classement des créateurs par ventes générées, commissions et rentabilité."
              : "Creators ranked by sales driven, commissions, and profitability."
          }
          lang={lang}
        />

        <ChartCard
          title={lang === "fr" ? "Meilleurs créateurs" : "Top performing creators"}
          info={
            lang === "fr"
              ? "Classement des créateurs par ventes générées, commissions et rentabilité (ROI)."
              : "Creators ranked by sales driven, commissions, and profitability (ROI)."
          }
          style={{ marginBottom: 20 }}
        >
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
                    <td style={{ padding: "12px 8px" }}><RankBadge rank={r.rank} /></td>
                    <td style={{ padding: "12px 8px" }}>
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
                    <td style={{ padding: "12px 8px", color: "#7A7A7A" }}>{r.platform}</td>
                    <td style={{ padding: "12px 8px" }}>
                      <div style={{ fontWeight: 500, color: "#1A1A1A" }}>{formatCurrency(r.sales, lang)}</div>
                      {r.salesCount > 0 ? (
                        <div style={{ fontSize: 11, color: "#9A9A9A", marginTop: 2 }}>
                          {r.salesCount} {lang === "fr" ? (r.salesCount > 1 ? "ventes" : "vente") : r.salesCount > 1 ? "sales" : "sale"}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: "12px 8px" }}>{formatCurrency(r.commission, lang)}</td>
                    <td style={{ padding: "12px 8px", fontWeight: 500, filter: !hasAdvancedAnalytics ? "blur(4px)" : "none", userSelect: !hasAdvancedAnalytics ? "none" : "auto" }}>
                      {hasAdvancedAnalytics ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: r.roi >= 1 ? "#166534" : r.roi > 0 ? "#991B1B" : "#9A9A9A" }}>
                            {r.roi > 0 ? `${r.roi.toFixed(1)}×` : "—"}
                          </span>
                          {r.roi > 0 ? <ProfitabilityPill profitable={r.roi >= 1} lang={lang} /> : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ padding: "12px 8px" }}><StatusBadge lang={lang} status={r.status} /></td>
                  </tr>
                ))}

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

        <ChartCard
          title={lang === "fr" ? "Performance des campagnes" : "Campaign performance"}
          info={
            lang === "fr"
              ? "Ventes, commissions et ROI par campagne sur la période."
              : "Sales, commissions, and ROI by campaign for this period."
          }
          style={{ marginBottom: 20 }}
        >
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
                  <td style={{ padding: "12px 8px" }}>
                    {c.roi && c.roi > 0 ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 500, color: c.roi >= 1 ? "#166534" : "#991B1B" }}>
                        {c.roi.toFixed(1)}×
                        <ProfitabilityPill profitable={c.roi >= 1} lang={lang} />
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ padding: "12px 8px", color: "#7A7A7A" }}>{formatCampaignStartDate(c.start_date || c.created_at, lang)}</td>
                  <td style={{ padding: "12px 8px" }}><CampaignStatus lang={lang} status={String(c.status || "Draft")} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
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
    <div style={{ paddingTop: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingBottom: isMobile ? 16 : 20, paddingLeft: isMobile ? 16 : 40, borderBottom: "1px solid var(--ws-border)", background: "var(--ws-surface)" }}>
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
