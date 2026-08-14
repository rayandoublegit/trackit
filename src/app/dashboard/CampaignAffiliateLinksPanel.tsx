"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lang } from "@/lib/useLang";
import { buildTrackitShortLink } from "@/lib/affiliate-short-link";
import { formatCurrency, useDisplayCurrency } from "@/lib/useCurrency";
import { AnalyticsBarChart, AnalyticsSectionHeader } from "./analytics-metric-cards";

type LinkMetrics = {
  clicks: number;
  uniques: number;
  sales: number;
  revenue: number;
  commission: number;
  conversionRate: number;
  byDay: Record<string, number>;
  devices: Record<string, number>;
  countries: Record<string, number>;
  sources: Record<string, number>;
};

type LinkTotals = {
  clicks: number;
  uniques: number;
  sales: number;
  revenue: number;
  commission: number;
};

function formatConvRate(value: number): string {
  return `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;
}

type AffiliateLinkRow = {
  id: string;
  slug: string;
  creator_username: string;
  campaign_id: string | null;
  destination_url: string;
  active: boolean;
  created_at: string;
  metrics: LinkMetrics;
};

const externFont = "'InterDisplay', 'Inter Display', sans-serif";

const PERIOD_OPTIONS = [7, 30, 90] as const;

function topEntry(map: Record<string, number> | undefined): string {
  const entries = Object.entries(map ?? {}).filter(([key]) => key.trim());
  if (!entries.length) return "—";
  entries.sort(([, a], [, b]) => b - a);
  return entries[0][0];
}

function formatSourceLabel(raw: string, lang: Lang): string {
  const value = raw.toLowerCase();
  if (value === "direct") return lang === "fr" ? "Direct" : "Direct";
  if (value.includes("tiktok")) return "TikTok";
  if (value.includes("instagram")) return "Instagram";
  if (value.includes("youtube")) return "YouTube";
  if (value.includes("twitter") || value.includes("x.com")) return "X";
  return raw.replace(/^www\./, "");
}

function formatDeviceLabel(raw: string, lang: Lang): string {
  const value = raw.toLowerCase();
  if (value === "mobile") return lang === "fr" ? "Mobile" : "Mobile";
  if (value === "desktop") return lang === "fr" ? "Ordinateur" : "Desktop";
  if (value === "tablet") return lang === "fr" ? "Tablette" : "Tablet";
  return raw || "—";
}

export function CampaignAffiliateLinksPanel({
  lang,
  brandId,
  campaignId,
  campaignName,
  isMobile,
  onGoToLinksTab,
}: {
  lang: Lang;
  brandId?: string;
  campaignId: string;
  campaignName: string;
  isMobile?: boolean;
  onGoToLinksTab?: () => void;
}) {
  useDisplayCurrency();
  const [links, setLinks] = useState<AffiliateLinkRow[]>([]);
  const [totals, setTotals] = useState<LinkTotals>({
    clicks: 0,
    uniques: 0,
    sales: 0,
    revenue: 0,
    commission: 0,
  });
  const [days, setDays] = useState<(typeof PERIOD_OPTIONS)[number]>(30);
  const [loading, setLoading] = useState(true);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    if (!brandId) return;
    const res = await fetch(
      `/api/links/metrics?brand_id=${encodeURIComponent(brandId)}&campaign_id=${encodeURIComponent(campaignId)}&days=${days}`,
      { cache: "no-store" },
    );
    const data = (await res.json()) as {
      links?: AffiliateLinkRow[];
      totals?: LinkTotals;
    };
    const rows = Array.isArray(data.links) ? data.links : [];
    rows.sort((a, b) => (b.metrics?.clicks ?? 0) - (a.metrics?.clicks ?? 0));
    setLinks(rows);
    setTotals(
      data.totals ?? {
        clicks: 0,
        uniques: 0,
        sales: 0,
        revenue: 0,
        commission: 0,
      },
    );
  }, [brandId, campaignId, days]);

  useEffect(() => {
    if (!brandId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        await loadMetrics();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brandId, loadMetrics]);

  const chartPoints = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const link of links) {
      for (const [day, count] of Object.entries(link.metrics?.byDay ?? {})) {
        byDay[day] = (byDay[day] ?? 0) + count;
      }
    }
    return Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, value }));
  }, [links]);

  const copyLink = async (slug: string, destinationUrl?: string) => {
    try {
      await navigator.clipboard.writeText(buildTrackitShortLink(slug, destinationUrl));
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const thStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--ws-text-dim)",
    letterSpacing: "-0.01em",
    textAlign: "left",
    borderBottom: "1px solid var(--ws-border)",
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: "14px",
    fontSize: 13,
    color: "var(--ws-text)",
    borderBottom: "1px solid var(--ws-border)",
    verticalAlign: "middle",
  };

  return (
    <section style={{ marginBottom: 28 }}>
      <AnalyticsSectionHeader
        title={lang === "fr" ? "Liens d'affiliation" : "Affiliate links"}
        info={
          lang === "fr"
            ? "Clics, ventes, chiffre d'affaires et visiteurs uniques sur vos liens d'affiliation (générés à partir de l'URL de destination) pour cette campagne."
            : "Clicks, sales, revenue and unique visitors on your affiliate links (built from the destination URL) for this campaign."
        }
        lang={lang}
      />

      <div
        style={{
          background: "var(--ws-surface)",
          border: "1px solid var(--ws-border)",
          borderRadius: 16,
          padding: isMobile ? "18px 16px" : "22px 22px 20px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "flex-end",
            justifyContent: "space-between",
            gap: 14,
            marginBottom: 18,
            paddingBottom: 16,
            borderBottom: "1px solid var(--ws-border)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              flex: 1,
              minWidth: 0,
            }}
          >
            <div style={{ flex: 1, minWidth: 0, paddingRight: isMobile ? 12 : 20 }}>
              <div style={{ fontSize: 12, color: "var(--ws-text-dim)", marginBottom: 4, letterSpacing: "-0.025em" }}>
                {lang === "fr" ? "Clics" : "Clicks"}
              </div>
              <div style={{ fontSize: 28, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.03em" }}>
                {loading ? "…" : totals.clicks}
              </div>
            </div>
            <div style={{ width: 1, background: "var(--ws-border)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, padding: isMobile ? "0 12px" : "0 20px" }}>
              <div style={{ fontSize: 12, color: "var(--ws-text-dim)", marginBottom: 4, letterSpacing: "-0.025em" }}>
                {lang === "fr" ? "Ventes" : "Sales"}
              </div>
              <div style={{ fontSize: 28, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.03em" }}>
                {loading ? "…" : totals.sales}
              </div>
            </div>
            <div style={{ width: 1, background: "var(--ws-border)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, padding: isMobile ? "0 12px" : "0 20px" }}>
              <div style={{ fontSize: 12, color: "var(--ws-text-dim)", marginBottom: 4, letterSpacing: "-0.025em" }}>
                {lang === "fr" ? "CA total" : "Total revenue"}
              </div>
              <div style={{ fontSize: 28, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.03em" }}>
                {loading ? "…" : formatCurrency(totals.revenue, lang)}
              </div>
            </div>
            <div style={{ width: 1, background: "var(--ws-border)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, paddingLeft: isMobile ? 12 : 20 }}>
              <div style={{ fontSize: 12, color: "var(--ws-text-dim)", marginBottom: 4, letterSpacing: "-0.025em" }}>
                {lang === "fr" ? "Visiteurs uniques" : "Unique visitors"}
              </div>
              <div style={{ fontSize: 28, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.03em" }}>
                {loading ? "…" : totals.uniques}
              </div>
            </div>
          </div>

          <div style={{ display: "inline-flex", gap: 4, background: "var(--ws-pill)", borderRadius: 10, padding: 4, alignSelf: isMobile ? "flex-start" : "center" }}>
            {PERIOD_OPTIONS.map((option) => {
              const active = days === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDays(option)}
                  style={{
                    border: "none",
                    borderRadius: 8,
                    padding: "7px 12px",
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    background: active ? "var(--ws-surface)" : "transparent",
                    color: active ? "var(--ws-text)" : "var(--ws-text-muted)",
                    boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {option} {lang === "fr" ? "j" : "d"}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ws-text-dim)", fontSize: 13 }}>
            {lang === "fr" ? "Chargement…" : "Loading…"}
          </div>
        ) : links.length === 0 ? (
          <div style={{ padding: "40px 16px", textAlign: "center" }}>
            <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--ws-text-muted)", lineHeight: 1.5 }}>
              {lang === "fr"
                ? "Générez votre premier lien d'affiliation depuis votre campagne."
                : "Generate your first affiliate link from your campaign."}
            </p>
            {onGoToLinksTab ? (
              <button
                type="button"
                onClick={onGoToLinksTab}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--ws-text)",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "-0.02em",
                }}
              >
                {lang === "fr" ? "Aller à l'onglet Liens →" : "Go to Links tab →"}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ws-text)", marginBottom: 12, letterSpacing: "-0.02em" }}>
                {lang === "fr" ? "Évolution des clics" : "Click trend"}
              </div>
              {chartPoints.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--ws-text-dim)", margin: 0 }}>
                  {lang === "fr" ? "Aucun clic sur cette période." : "No clicks in this period."}
                </p>
              ) : (
                <AnalyticsBarChart
                  lang={lang}
                  points={chartPoints}
                  formatValue={(v) =>
                    lang === "fr"
                      ? `${Math.round(v)} clic${Math.round(v) === 1 ? "" : "s"}`
                      : `${Math.round(v)} click${Math.round(v) === 1 ? "" : "s"}`
                  }
                  height={160}
                />
              )}
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>{lang === "fr" ? "Lien" : "Link"}</th>
                    <th style={thStyle}>{lang === "fr" ? "Créateur" : "Creator"}</th>
                    <th style={thStyle}>{lang === "fr" ? "Campagne" : "Campaign"}</th>
                    <th style={thStyle}>{lang === "fr" ? "Clics" : "Clicks"}</th>
                    <th style={thStyle}>{lang === "fr" ? "Visiteurs un." : "Uniques"}</th>
                    <th style={thStyle}>{lang === "fr" ? "Ventes" : "Sales"}</th>
                    <th style={thStyle}>{lang === "fr" ? "CA" : "Revenue"}</th>
                    <th style={thStyle}>{lang === "fr" ? "Commission" : "Commission"}</th>
                    <th style={thStyle}>{lang === "fr" ? "Taux conv." : "Conv %"}</th>
                    <th style={thStyle}>{lang === "fr" ? "Meilleure source" : "Top source"}</th>
                    <th style={thStyle}>{lang === "fr" ? "Meilleur appareil" : "Top device"}</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => {
                    const topSource = formatSourceLabel(topEntry(link.metrics?.sources), lang);
                    const topDevice = formatDeviceLabel(topEntry(link.metrics?.devices), lang);
                    const shortUrl = buildTrackitShortLink(link.slug, link.destination_url);
                    return (
                      <tr key={link.id}>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            <span
                              style={{
                                fontFamily: externFont,
                                fontSize: 13,
                                color: "var(--ws-text)",
                                letterSpacing: "-0.02em",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {shortUrl}
                            </span>
                            <button
                              type="button"
                              onClick={() => void copyLink(link.slug, link.destination_url)}
                              style={{
                                flexShrink: 0,
                                border: "1px solid var(--ws-border)",
                                background: "var(--ws-surface)",
                                borderRadius: 8,
                                padding: "4px 8px",
                                fontSize: 11,
                                fontWeight: 500,
                                cursor: "pointer",
                                fontFamily: "inherit",
                                color: "var(--ws-text)",
                              }}
                            >
                              {copiedSlug === link.slug
                                ? lang === "fr"
                                  ? "Copié"
                                  : "Copied"
                                : lang === "fr"
                                  ? "Copier"
                                  : "Copy"}
                            </button>
                          </div>
                        </td>
                        <td style={tdStyle}>@{link.creator_username.replace(/^@/, "")}</td>
                        <td style={{ ...tdStyle, color: "var(--ws-text-muted)" }}>{campaignName}</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{link.metrics?.clicks ?? 0}</td>
                        <td style={tdStyle}>{link.metrics?.uniques ?? 0}</td>
                        <td style={tdStyle}>{link.metrics?.sales ?? 0}</td>
                        <td style={tdStyle}>{formatCurrency(link.metrics?.revenue ?? 0, lang)}</td>
                        <td style={tdStyle}>{formatCurrency(link.metrics?.commission ?? 0, lang)}</td>
                        <td style={tdStyle}>{formatConvRate(link.metrics?.conversionRate ?? 0)}</td>
                        <td style={tdStyle}>{topSource}</td>
                        <td style={tdStyle}>{topDevice}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
