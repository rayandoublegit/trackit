"use client";

import { useEffect, useMemo, useState } from "react";
import { useLang } from "@/lib/useLang";
import { formatCurrency } from "@/lib/useCurrency";

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

const TOP_CREATORS = [
  { rank: 1, creator: "Mia Chen", platform: "TikTok", sales: 8400, commission: 672, status: "Active" },
  { rank: 2, creator: "Jordan Lee", platform: "Instagram", sales: 6200, commission: 496, status: "Active" },
  { rank: 3, creator: "Sam Taylor", platform: "YouTube", sales: 3900, commission: 312, status: "Active" },
  { rank: 4, creator: "Alex Rivera", platform: "TikTok", sales: 2800, commission: 224, status: "Inactive" },
  { rank: 5, creator: "Riley Park", platform: "Instagram", sales: 2100, commission: 168, status: "Active" },
];

const CAMPAIGNS = [
  { name: "Summer Fitness", creators: 24, sales: 12400, commissions: 992, roi: "12.5x", start: "Mar 1, 2026", status: "Active" },
  { name: "Protein Launch", creators: 18, sales: 8200, commissions: 656, roi: "10.2x", start: "Feb 14, 2026", status: "Paused" },
  { name: "Brand Awareness Q1", creators: 42, sales: 3900, commissions: 312, roi: "8.1x", start: "Jan 5, 2026", status: "Completed" },
];

const OUTREACH_PLATFORMS = [
  { platform: "TikTok", sent: 68, replied: 24, converted: 8, preview: "Hey! Love your content — want to collab?" },
  { platform: "Instagram", sent: 52, replied: 19, converted: 6, preview: "We think you'd be perfect for our brand..." },
  { platform: "YouTube", sent: 27, replied: 7, converted: 2, preview: "Partnership opportunity for your audience" },
];

export function AnalyticsView({ userId, isMobile, lang: langProp, plan, shopifyStore, onUpgradePro }: { userId?: string; isMobile?: boolean; lang?: string; plan?: "free" | "basic" | "pro"; shopifyStore?: string; onUpgradePro?: () => void }) {
  const isFree = plan === "free";
  const langHook = useLang();
  const lang = langProp === "fr" || langProp === "en" ? langProp : langHook;
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
    if (shopifyStore && userId) {
      fetch("/api/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }).catch(() => {});
    }
    fetch(`/api/analytics?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        setAnalyticsData(data);
        setLoadingData(false);
      })
      .catch(() => setLoadingData(false));
  }, [userId, shopifyStore]);

  const HAS_DATA = !loadingData && (analyticsData?.hasData ?? false);

  const sortedCreators = useMemo(() => {
    const rows = TOP_CREATORS.map((r) => ({ ...r, roi: r.sales / r.commission }));
    rows.sort((a, b) => {
      const av = sortKey === "creator" ? a.creator : sortKey === "commission" ? a.commission : sortKey === "roi" ? a.roi : a.sales;
      const bv = sortKey === "creator" ? b.creator : sortKey === "commission" ? b.commission : sortKey === "roi" ? b.roi : b.sales;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return rows;
  }, [sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  if (!loadingData && !HAS_DATA) {
    return (
      <>
        <AnalyticsHeader isMobile={isMobile} lang={lang} range={range} setRange={setRange} compare={compare} setCompare={setCompare} analyticsData={analyticsData} plan={plan} onUpgradePro={onUpgradePro} />
        <div style={{ padding: 80, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px" }}>{lang === "fr" ? "Pas de données pour l'instant." : "No data yet."}</h2>
          <p style={{ fontSize: 14, color: "#7A7A7A", margin: "0 0 24px" }}>{lang === "fr" ? "Connectez votre boutique Shopify et lancez votre première campagne pour voir les analytiques ici." : "Connect your Shopify store and start your first campaign to see analytics here."}</p>
          <button type="button" style={btnPrimary}>{lang === "fr" ? "Connecter Shopify →" : "Connect Shopify →"}</button>
        </div>
      </>
    );
  }

  return (
    <>
      <AnalyticsHeader isMobile={isMobile} lang={lang} range={range} setRange={setRange} compare={compare} setCompare={setCompare} analyticsData={analyticsData} plan={plan} onUpgradePro={onUpgradePro} />
      <div style={{ padding: isMobile ? 16 : "24px 40px 40px", paddingTop: isMobile ? 56 : undefined }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
          <KpiCard title={lang === "fr" ? "Revenus totaux des créateurs" : "Total Revenue from Creators"} value={analyticsData?.totalRevenue ? formatCurrency(analyticsData.totalRevenue, lang) : formatCurrency(0, lang)} sub={lang === "fr" ? "vs période précédente +18% ↑" : "vs last period +18% ↑"} subColor="#2E7D32" />
          <KpiCard title={lang === "fr" ? "Créateurs contactés" : "Total Creators Contacted"} value={String(analyticsData?.totalSent || 0)} sub={lang === "fr" ? "vs période précédente +23 ↑" : "vs last period +23 ↑"} subColor="#2E7D32" />
          <KpiCard title={lang === "fr" ? "Taux de réponse" : "Response Rate"} value={`${analyticsData?.responseRate || 0}%`} sub={lang === "fr" ? "vs période précédente -2% ↓" : "vs last period -2% ↓"} subColor="#C62828" />
          <KpiCard title={lang === "fr" ? "Commissions totales payées" : "Total Commissions Paid"} value={analyticsData?.totalCommissions ? formatCurrency(analyticsData.totalCommissions, lang) : formatCurrency(0, lang)} sub={lang === "fr" ? "vs période précédente +9% ↑" : "vs last period +9% ↑"} subColor="#2E7D32" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <ChartCard title={lang === "fr" ? "Revenus par créateur dans le temps" : "Revenue by Creator Over Time"}>
            <LineChart />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12, justifyContent: "center" }}>
              {["Mia Chen", "Jordan Lee", "Sam Taylor", "Alex Rivera", "Riley Park"].map((name, i) => (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#7A7A7A" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: ["#0047FF", "#FF3D8B", "#95BF47", "#F57F17", "#6D00CC"][i] }} />
                  {name}
                </div>
              ))}
            </div>
          </ChartCard>
          <ChartCard title={lang === "fr" ? "Performance des messages" : "Outreach Performance"}>
            <FunnelBarChart lang={lang} />
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
                  <Th sortable onClick={() => toggleSort("roi")}>{lang === "fr" ? "ROI" : "ROI"}</Th>
                  <Th>{lang === "fr" ? "Statut" : "Status"}</Th>
                </tr>
              </thead>
              <tbody>
                {sortedCreators.map((r, i) => (
                  <tr key={r.creator} style={{ borderBottom: "1px solid #F5F5F5", position: "relative" }}>
                    <td style={{ padding: "12px 8px", filter: isFree && i >= 2 ? "blur(4px)" : "none", userSelect: isFree && i >= 2 ? "none" : "auto" }}><RankBadge rank={r.rank} /></td>
                    <td style={{ padding: "12px 8px", fontWeight: 500, color: "#1A1A1A", filter: isFree && i >= 2 ? "blur(4px)" : "none", userSelect: isFree && i >= 2 ? "none" : "auto" }}>{r.creator}</td>
                    <td style={{ padding: "12px 8px", color: "#7A7A7A", filter: isFree && i >= 2 ? "blur(4px)" : "none" }}>{r.platform}</td>
                    <td style={{ padding: "12px 8px", filter: isFree && i >= 2 ? "blur(4px)" : "none" }}>{formatCurrency(r.sales, lang)}</td>
                    <td style={{ padding: "12px 8px", filter: isFree && i >= 2 ? "blur(4px)" : "none" }}>{formatCurrency(r.commission, lang)}</td>
                    <td style={{ padding: "12px 8px", fontWeight: 500, filter: isFree && i >= 2 ? "blur(4px)" : "none" }}>{r.roi.toFixed(1)}x</td>
                    <td style={{ padding: "12px 8px", filter: isFree && i >= 2 ? "blur(4px)" : "none" }}><StatusBadge lang={lang} status={r.status} /></td>
                  </tr>
                ))}
                {isFree && (
                  <tr>
                    <td colSpan={7} style={{ padding: "16px 8px", textAlign: "center", background: "#F8F9FF", borderTop: "1px solid #E5EDFF" }}>
                      <span style={{ fontSize: 13, color: "#0047FF", fontWeight: 500 }}>
                        {lang === "fr" ? "🔒 Passez à Basic pour voir tous vos créateurs →" : "🔒 Upgrade to Basic to unlock all creator data →"}
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <ChartCard title={lang === "fr" ? "Ratio commission / revenus" : "Commission vs Revenue Ratio"}>
            <DonutChart lang={lang} />
            <p style={{ fontSize: 13, color: "#7A7A7A", margin: "16px 0 4px", textAlign: "center" }}>{lang === "fr" ? "Taux de commission moyen : 8%" : "Average commission rate: 8%"}</p>
            <p style={{ fontSize: 13, color: "#1A1A1A", margin: 0, textAlign: "center", fontWeight: 500 }}>{lang === "fr" ? `Revenus nets après commissions : ${formatCurrency(22540, lang)}` : `Net revenue after commissions: ${formatCurrency(22540, lang)}`}</p>
          </ChartCard>
          <ChartCard title={lang === "fr" ? "Répartition par plateforme" : "Platform Breakdown"}>
            <PlatformBars lang={lang} />
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
              {CAMPAIGNS.map((c) => (
                <tr key={c.name} style={{ borderBottom: "1px solid #F5F5F5" }}>
                  <td style={{ padding: "12px 8px", fontWeight: 500 }}>{c.name}</td>
                  <td style={{ padding: "12px 8px" }}>{c.creators}</td>
                  <td style={{ padding: "12px 8px" }}>{formatCurrency(c.sales, lang)}</td>
                  <td style={{ padding: "12px 8px" }}>{formatCurrency(c.commissions, lang)}</td>
                  <td style={{ padding: "12px 8px" }}>{c.roi}</td>
                  <td style={{ padding: "12px 8px", color: "#7A7A7A" }}>{c.start}</td>
                  <td style={{ padding: "12px 8px" }}><CampaignStatus lang={lang} status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </ChartCard>

        <ChartCard title={lang === "fr" ? "Détail des messages" : "Outreach Breakdown"} style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            <MiniStat label={lang === "fr" ? "Total envoyé" : "Total sent"} value="147" />
            <MiniStat label={lang === "fr" ? "Taux d'ouverture" : "Open rate"} value="68%" />
            <MiniStat label={lang === "fr" ? "Taux de réponse" : "Reply rate"} value="34%" />
            <MiniStat label={lang === "fr" ? "Conversion en partenaire" : "Conversion to partner"} value="12%" />
          </div>
          <div style={{ overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: isMobile ? "touch" : undefined }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: isMobile ? 500 : undefined }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #EFEFEF", textAlign: "left" }}>
                <Th>{lang === "fr" ? "Plateforme" : "Platform"}</Th><Th>{lang === "fr" ? "Envoyé" : "Sent"}</Th><Th>{lang === "fr" ? "Répondu" : "Replied"}</Th><Th>{lang === "fr" ? "Converti" : "Converted"}</Th><Th>{lang === "fr" ? "Aperçu du meilleur message" : "Best performing message preview"}</Th>
              </tr>
            </thead>
            <tbody>
              {OUTREACH_PLATFORMS.map((r) => (
                <tr key={r.platform} style={{ borderBottom: "1px solid #F5F5F5" }}>
                  <td style={{ padding: "12px 8px", fontWeight: 500 }}>{r.platform}</td>
                  <td style={{ padding: "12px 8px" }}>{r.sent}</td>
                  <td style={{ padding: "12px 8px" }}>{r.replied}</td>
                  <td style={{ padding: "12px 8px" }}>{r.converted}</td>
                  <td style={{ padding: "12px 8px", color: "#7A7A7A", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.preview}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </ChartCard>

        <ChartCard title={lang === "fr" ? "Impact des relances" : "Follow Up Impact"}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <MiniStat label={lang === "fr" ? "Deals conclus grâce aux relances" : "Deals closed from follow up"} value="23%" large />
            <MiniStat label={lang === "fr" ? "Relances moyennes avant réponse" : "Average follow ups before reply"} value="2.4" large />
          </div>
          <FollowUpLineChart lang={lang} />
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
  plan?: "free" | "basic" | "pro";
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
            if (plan !== "pro") {
              if (onUpgradePro) void onUpgradePro();
              else alert(lang === "fr" ? "L'export CSV est disponible sur le plan Pro." : "CSV export is available on the Pro plan.");
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
        <div style={{ display: "inline-flex", background: "#F5F5F5", borderRadius: 10, padding: 3, gap: 2, overflowX: isMobile ? "auto" : undefined, flexWrap: isMobile ? "nowrap" : undefined }}>
          {ranges.map((r) => (
            <button key={r.id} type="button" onClick={() => setRange(r.id)} style={{
              padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 13, fontFamily: "inherit", cursor: "pointer",
              background: range === r.id ? "#FFF" : "transparent", color: range === r.id ? "#1A1A1A" : "#7A7A7A",
              fontWeight: range === r.id ? 500 : 400, boxShadow: range === r.id ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
            }}>{r.label}</button>
          ))}
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

function KpiCard({ title, value, sub, subColor }: { title: string; value: string; sub: string; subColor: string }) {
  return (
    <div style={{ background: "#FFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: 8, letterSpacing: "-0.01em" }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", marginBottom: 6 }}>{value}</div>
      <div style={{ fontSize: 12, color: subColor, letterSpacing: "-0.01em" }}>{sub}</div>
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
  const active = status === "Active";
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
  return <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 6, background: active ? "#E8F5E9" : "#F5F5F5", color: active ? "#2E7D32" : "#9A9A9A" }}>{label}</span>;
}

function CampaignStatus({ lang, status }: { lang: "en" | "fr"; status: string }) {
  const map: Record<string, { bg: string; c: string; en: string; fr: string }> = {
    Active: { bg: "#E8F5E9", c: "#2E7D32", en: "Active", fr: "Actif" },
    Paused: { bg: "#FFF8E1", c: "#F57F17", en: "Paused", fr: "En pause" },
    Completed: { bg: "#F5F5F5", c: "#9A9A9A", en: "Completed", fr: "Terminé" },
  };
  const s = map[status] ?? map.Completed;
  return <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 6, background: s.bg, color: s.c }}>{lang === "fr" ? s.fr : s.en}</span>;
}

function MiniStat({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div style={{ background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 12, padding: 16, textAlign: "center" }}>
      <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: large ? 28 : 22, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em" }}>{value}</div>
    </div>
  );
}

function LineChart() {
  const lines = [
    { color: "#0047FF", pts: "10,80 40,65 70,50 100,45 130,30 160,25 190,20 220,15 250,10" },
    { color: "#FF3D8B", pts: "10,90 40,75 70,70 100,55 130,50 160,40 190,35 220,30 250,25" },
    { color: "#95BF47", pts: "10,95 40,85 70,80 100,75 130,65 160,55 190,50 220,45 250,40" },
    { color: "#F57F17", pts: "10,100 40,95 70,90 100,85 130,80 160,75 190,70 220,65 250,60" },
    { color: "#6D00CC", pts: "10,105 40,100 70,95 100,90 130,85 160,80 190,75 220,70 250,65" },
  ];
  return (
    <svg viewBox="0 0 260 100" style={{ width: "100%", height: 180 }}>
      {[0, 25, 50, 75, 100].map((y) => <line key={y} x1="10" y1={y} x2="250" y2={y} stroke="#F0F0F0" strokeWidth="1" />)}
      {lines.map((l) => <polyline key={l.color} fill="none" stroke={l.color} strokeWidth="2" points={l.pts} />)}
    </svg>
  );
}

function FunnelBarChart({ lang }: { lang: "en" | "fr" }) {
  const bars = [
    { label: lang === "fr" ? "Envoyé" : "Sent", value: 147, color: "#9A9A9A", h: 100 },
    { label: lang === "fr" ? "Ouvert" : "Opened", value: 100, color: "#0047FF", h: 68 },
    { label: lang === "fr" ? "Répondu" : "Replied", value: 50, color: "#95BF47", h: 34 },
    { label: lang === "fr" ? "Converti" : "Converted", value: 18, color: "#2E7D32", h: 12 },
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

function DonutChart({ lang }: { lang: "en" | "fr" }) {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r="60" fill="none" stroke="#EFEFEF" strokeWidth="24" />
        <circle cx="80" cy="80" r="60" fill="none" stroke="#0047FF" strokeWidth="24" strokeDasharray="301 377" strokeDashoffset="0" transform="rotate(-90 80 80)" />
        <text x="80" y="76" textAnchor="middle" fontSize="22" fontWeight="600" fill="#1A1A1A">92%</text>
        <text x="80" y="94" textAnchor="middle" fontSize="11" fill="#9A9A9A">{lang === "fr" ? "Revenus nets" : "Net revenue"}</text>
      </svg>
    </div>
  );
}

function PlatformBars({ lang }: { lang: "en" | "fr" }) {
  const items = [
    { name: "TikTok", amount: 12400, pct: 51, color: "#1A1A1A" },
    { name: "Instagram", amount: 8200, pct: 33, color: "#E1306C" },
    { name: "YouTube", amount: 3900, pct: 16, color: "#FF0000" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {items.map((i) => (
        <div key={i.name}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
            <span style={{ fontWeight: 500, color: "#1A1A1A" }}>{i.name}</span>
            <span style={{ color: "#7A7A7A" }}>{formatCurrency(i.amount, lang)} · {i.pct}%</span>
          </div>
          <div style={{ height: 10, background: "#EFEFEF", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${i.pct}%`, height: "100%", background: i.color, borderRadius: 999 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function FollowUpLineChart({ lang }: { lang: "en" | "fr" }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 8, justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#7A7A7A" }}>
          <span style={{ width: 12, height: 3, background: "#0047FF", borderRadius: 2 }} /> {lang === "fr" ? "Avec relance" : "With follow-up"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#7A7A7A" }}>
          <span style={{ width: 12, height: 3, background: "#9A9A9A", borderRadius: 2 }} /> {lang === "fr" ? "Sans relance" : "Without follow-up"}
        </div>
      </div>
      <svg viewBox="0 0 260 100" style={{ width: "100%", height: 140 }}>
        {[0, 25, 50, 75, 100].map((y) => <line key={y} x1="10" y1={y} x2="250" y2={y} stroke="#F0F0F0" strokeWidth="1" />)}
        <polyline fill="none" stroke="#0047FF" strokeWidth="2" points="10,70 50,55 90,45 130,38 170,32 210,28 250,25" />
        <polyline fill="none" stroke="#9A9A9A" strokeWidth="2" strokeDasharray="4 4" points="10,85 50,78 90,72 130,68 170,65 210,62 250,60" />
      </svg>
    </div>
  );
}
