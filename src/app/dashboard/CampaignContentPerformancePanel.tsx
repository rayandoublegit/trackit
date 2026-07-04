"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lang } from "@/lib/useLang";
import { formatCurrency } from "@/lib/useCurrency";
import { AnalyticsSectionHeader } from "./analytics-metric-cards";

type LinkMetrics = {
  clicks: number;
  uniques: number;
  sales: number;
  revenue: number;
  commission: number;
  conversionRate: number;
  aov: number;
  epc: number;
};

type ContentLinkRow = {
  id: string;
  slug: string;
  content_id: string | null;
  creator_username: string;
  metrics: LinkMetrics;
};

type ContentMeta = {
  id: string;
  title: string;
  creatorName: string | null;
  creatorHandle: string | null;
};

export type ContentPerformanceRow = {
  contentId: string;
  title: string;
  creator: string;
  clicks: number;
  sales: number;
  revenue: number;
  conversionRate: number;
};

function formatConvRate(value: number): string {
  return `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;
}

export function CampaignContentPerformancePanel({
  lang,
  brandId,
  campaignId,
  isMobile,
}: {
  lang: Lang;
  brandId?: string;
  campaignId: string;
  isMobile?: boolean;
}) {
  const [rows, setRows] = useState<ContentPerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!brandId) return;
    const [metricsRes, contentRes] = await Promise.all([
      fetch(
        `/api/links/metrics?brand_id=${encodeURIComponent(brandId)}&campaign_id=${encodeURIComponent(campaignId)}&days=90`,
        { cache: "no-store" },
      ),
      fetch(
        `/api/content?brandId=${encodeURIComponent(brandId)}&campaignId=${encodeURIComponent(campaignId)}`,
        { cache: "no-store" },
      ),
    ]);

    const metricsData = (await metricsRes.json()) as { links?: ContentLinkRow[] };
    const contentData = (await contentRes.json()) as { ok?: boolean; items?: ContentMeta[] };

    const contentById = new Map<string, ContentMeta>();
    for (const item of contentData.items ?? []) {
      contentById.set(item.id, item);
    }

    const perf: ContentPerformanceRow[] = [];
    for (const link of metricsData.links ?? []) {
      if (!link.content_id) continue;
      const meta = contentById.get(link.content_id);
      const creator =
        meta?.creatorName ||
        (meta?.creatorHandle ? `@${meta.creatorHandle.replace(/^@/, "")}` : null) ||
        (link.creator_username ? `@${link.creator_username.replace(/^@/, "")}` : "—");
      perf.push({
        contentId: link.content_id,
        title: meta?.title?.trim() || "—",
        creator,
        clicks: link.metrics?.clicks ?? 0,
        sales: link.metrics?.sales ?? 0,
        revenue: link.metrics?.revenue ?? 0,
        conversionRate: link.metrics?.conversionRate ?? 0,
      });
    }

    perf.sort((a, b) => b.revenue - a.revenue || b.clicks - a.clicks);
    setRows(perf);
  }, [brandId, campaignId]);

  useEffect(() => {
    if (!brandId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        await load();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const onUpdated = () => void load();
    window.addEventListener("trackit:content-updated", onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("trackit:content-updated", onUpdated);
    };
  }, [brandId, load]);

  const thStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 12,
    fontWeight: 500,
    color: "#9A9A9A",
    letterSpacing: "-0.01em",
    textAlign: "left",
    borderBottom: "1px solid #EFEFEF",
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: "14px",
    fontSize: 13,
    color: "#1A1A1A",
    borderBottom: "1px solid #F5F5F5",
    verticalAlign: "middle",
  };

  const empty = !loading && rows.length === 0;

  return (
    <section style={{ marginTop: isMobile ? 28 : 36 }}>
      <AnalyticsSectionHeader
        title={lang === "fr" ? "Performance par contenu" : "Performance by content"}
        info={
          lang === "fr"
            ? "Clics et ventes attribués aux liens trackés créés pour chaque contenu (thentrack.it/l/…)."
            : "Clicks and sales attributed to tracked links created for each content piece (thentrack.it/l/…)."
        }
        lang={lang}
      />

      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #EFEFEF",
          borderRadius: 16,
          padding: isMobile ? "18px 16px" : "22px 22px 20px",
          boxSizing: "border-box",
        }}
      >
        {loading ? (
          <p style={{ margin: 0, fontSize: 13, color: "#9A9A9A" }}>{lang === "fr" ? "Chargement…" : "Loading…"}</p>
        ) : empty ? (
          <p style={{ margin: 0, fontSize: 14, color: "#6B7280", lineHeight: 1.5 }}>
            {lang === "fr"
              ? "Aucun lien tracké par contenu pour l'instant. Les liens sont créés automatiquement quand un créateur envoie du contenu."
              : "No per-content tracked links yet. Links are created automatically when a creator uploads content."}
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={thStyle}>{lang === "fr" ? "Contenu" : "Content"}</th>
                  <th style={thStyle}>{lang === "fr" ? "Créateur" : "Creator"}</th>
                  <th style={thStyle}>{lang === "fr" ? "Clics" : "Clicks"}</th>
                  <th style={thStyle}>{lang === "fr" ? "Ventes" : "Sales"}</th>
                  <th style={thStyle}>{lang === "fr" ? "CA" : "Revenue"}</th>
                  <th style={thStyle}>{lang === "fr" ? "Taux conv." : "Conv %"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.contentId}>
                    <td style={{ ...tdStyle, fontWeight: 500, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.title}
                    </td>
                    <td style={tdStyle}>{row.creator}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.clicks}</td>
                    <td style={tdStyle}>{row.sales}</td>
                    <td style={tdStyle}>{formatCurrency(row.revenue, lang)}</td>
                    <td style={tdStyle}>{formatConvRate(row.conversionRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
