"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/useCurrency";
import { dispatchCampaignsUpdated, dispatchPayoutsUpdated, dispatchSalesUpdated, SALES_UPDATED_EVENT } from "@/lib/outreach-history-events";
import { getPeriodBounds, isWithinPeriod, type AnalyticsDateRange } from "@/lib/analytics-periods";
import { getCampaignCreatorAttribution } from "@/lib/db";
import { isSaleAttributedToCampaign } from "@/lib/campaign-sales-attribution";

type TrackedSale = {
  id: string;
  creator_id: string;
  order_amount: number;
  commission_amount: number;
  discount_code_used?: string | null;
  shopify_order_id?: string | null;
  shop_domain?: string | null;
  status?: string | null;
  created_at: string;
  campaign_id?: string | null;
  creators?: {
    handle?: string;
    full_name?: string;
    avatar_url?: string;
    platform?: string;
  } | null;
};

async function fetchTrackedSales(userId: string): Promise<TrackedSale[]> {
  const { supabase } = await import("@/lib/supabase");
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("sales")
    .select(
      "id, creator_id, order_amount, commission_amount, discount_code_used, shopify_order_id, shop_domain, status, created_at, campaign_id, creators ( handle, full_name, avatar_url, platform )",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error(error);
    return [];
  }
  return (data || []) as TrackedSale[];
}

function saleCreatorMeta(sale: TrackedSale) {
  const c = sale.creators;
  if (Array.isArray(c)) return c[0] ?? null;
  return c ?? null;
}

function isShopifySale(sale: TrackedSale) {
  return !!(sale.shopify_order_id || sale.shop_domain) && sale.shop_domain !== "manual";
}

function saleMatchesSearch(sale: TrackedSale, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const creator = saleCreatorMeta(sale);
  const handle = String(creator?.handle || "").toLowerCase();
  const name = String(creator?.full_name || "").toLowerCase();
  const code = String(sale.discount_code_used || "").toLowerCase();
  const amount = String(sale.order_amount || "");
  return handle.includes(q) || name.includes(q) || code.includes(q) || amount.includes(q);
}

function SaleTimelineIcon({ shopify }: { shopify: boolean }) {
  if (shopify) {
    return (
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: "#ECFDF3",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <img src="/shopify-logo.svg" alt="" width={16} height={16} style={{ display: "block", objectFit: "contain" }} />
      </span>
    );
  }
  return (
    <span
      style={{
        width: 32,
        height: 32,
        borderRadius: 10,
        background: "#EFF6FF",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: "#2563EB",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const deleteBtnStyle: React.CSSProperties = {
  border: "1px solid #FECACA",
  background: "#FFF",
  color: "#DC2626",
  borderRadius: 8,
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: "-0.01em",
  flexShrink: 0,
};

export function AnalyticsSalesPanel({
  userId,
  lang,
  isMobile,
  campaignId,
  campaignCreatorIds,
  syncRange,
  onSalesChange,
}: {
  userId?: string;
  lang: "en" | "fr";
  isMobile?: boolean;
  campaignId?: string;
  campaignCreatorIds?: string[];
  syncRange?: Exclude<AnalyticsDateRange, "all" | "custom">;
  /** Called after a sale is deleted so parent analytics can refresh immediately. */
  onSalesChange?: () => void | Promise<void>;
}) {
  const [sales, setSales] = useState<TrackedSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creatorCounts, setCreatorCounts] = useState<Record<string, string[]>>({});
  const [linkMeta, setLinkMeta] = useState<Record<string, { historical_sales_attached: boolean; joined_at: string }>>({});

  const loadSales = useCallback(async () => {
    if (!userId) {
      setSales([]);
      setCreatorCounts({});
      setLinkMeta({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const [rows, attribution] = await Promise.all([
      fetchTrackedSales(userId),
      campaignId ? getCampaignCreatorAttribution(userId) : Promise.resolve({ creatorCounts: {}, linkMeta: {} }),
    ]);
    setSales(rows);
    setCreatorCounts(attribution.creatorCounts);
    setLinkMeta(attribution.linkMeta);
    setLoading(false);
  }, [userId, campaignId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadSales();
      if (cancelled) return;
    })();
    const onUpdate = () => void loadSales();
    window.addEventListener(SALES_UPDATED_EVENT, onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener(SALES_UPDATED_EVENT, onUpdate);
    };
  }, [loadSales]);

  const scopedSales = useMemo(() => {
    if (!campaignId) return sales;
    const roster =
      campaignCreatorIds?.map(String) ??
      creatorCounts[campaignId]?.map(String) ??
      [];
    if (roster.length === 0) {
      return sales.filter((sale) => String(sale.campaign_id || "") === campaignId);
    }
    const countsForCampaign = { [campaignId]: roster };
    return sales.filter((sale) => isSaleAttributedToCampaign(sale, campaignId, countsForCampaign, linkMeta));
  }, [sales, campaignId, campaignCreatorIds, creatorCounts, linkMeta]);

  const periodBounds = useMemo(() => {
    if (!syncRange) return null;
    return getPeriodBounds(syncRange);
  }, [syncRange]);

  const filteredSales = useMemo(() => {
    return scopedSales.filter((sale) => {
      if (periodBounds && !isWithinPeriod(sale.created_at, periodBounds.start, periodBounds.end)) return false;
      return saleMatchesSearch(sale, search);
    });
  }, [scopedSales, periodBounds, search]);

  const removeSale = async (sale: TrackedSale) => {
    if (!userId || deletingId) return;
    const shopify = isShopifySale(sale);
    const ok = window.confirm(
      shopify
        ? lang === "fr"
          ? "Supprimer cette vente de Trackit ? Elle ne sera pas réimportée lors des prochaines synchros Shopify."
          : "Remove this sale from Trackit? It will not be re-imported on future Shopify syncs."
        : lang === "fr"
          ? "Supprimer cette vente ? La commission du créateur sera ajustée."
          : "Delete this sale? The creator's commission will be adjusted.",
    );
    if (!ok) return;

    setDeletingId(sale.id);
    try {
      const res = await fetch(`/api/sales?id=${encodeURIComponent(sale.id)}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && data.ok) {
        setSales((list) => list.filter((row) => row.id !== sale.id));
        dispatchSalesUpdated();
        dispatchPayoutsUpdated();
        dispatchCampaignsUpdated();
        await onSalesChange?.();
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <aside
      style={{
        width: isMobile ? "100%" : 288,
        maxWidth: "100%",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #EFEFEF",
          borderRadius: 16,
          padding: "16px 14px 14px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
          display: "flex",
          flexDirection: "column",
          flex: isMobile ? undefined : 1,
          height: isMobile ? 480 : 420,
          maxHeight: isMobile ? 480 : 420,
          minHeight: isMobile ? 280 : 420,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <div style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", margin: 0, letterSpacing: "-0.03em" }}>
            {lang === "fr" ? "Dernières ventes" : "Latest sales"}
          </h2>
        </div>

        <div style={{ position: "relative", marginBottom: 12 }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9A9A9A" }}
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === "fr" ? "Rechercher une vente" : "Search sales"}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "9px 12px 9px 34px",
              borderRadius: 999,
              border: "1px solid #E5E5E5",
              background: "#FAFAFA",
              fontSize: 12,
              fontFamily: "inherit",
              color: "#1A1A1A",
              letterSpacing: "-0.02em",
              outline: "none",
            }}
          />
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "scroll",
            overflowX: "hidden",
            paddingRight: 4,
            marginRight: -2,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {loading ? (
            <div style={{ padding: "32px 8px", textAlign: "center", color: "#9A9A9A", fontSize: 12 }}>
              {lang === "fr" ? "Chargement…" : "Loading…"}
            </div>
          ) : filteredSales.length === 0 ? (
            <div style={{ padding: "32px 8px", textAlign: "center", color: "#9A9A9A", fontSize: 12, lineHeight: 1.5 }}>
              {lang === "fr" ? "Aucune vente pour le moment." : "No sales yet."}
            </div>
          ) : (
            <div style={{ position: "relative", paddingLeft: 4 }}>
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  left: 19,
                  top: 16,
                  bottom: 16,
                  width: 1,
                  borderLeft: "1px dashed #E5E5E5",
                }}
              />
              {filteredSales.map((sale) => {
                const creator = saleCreatorMeta(sale);
                const handle = String(creator?.handle || creator?.full_name || "creator").replace(/^@/, "");
                const shopify = isShopifySale(sale);
                const title = shopify
                  ? lang === "fr"
                    ? "Vente Shopify"
                    : "Shopify sale"
                  : lang === "fr"
                    ? "Vente manuelle"
                    : "Manual sale";
                const amount = formatCurrency(Number(sale.order_amount) || 0, lang);
                const commission = formatCurrency(Number(sale.commission_amount) || 0, lang);
                const code = String(sale.discount_code_used || "").trim();
                const codePart = code && code !== "MANUAL" ? ` · ${code}` : "";

                return (
                  <div
                    key={sale.id}
                    style={{
                      display: "flex",
                      gap: 12,
                      marginBottom: 18,
                      position: "relative",
                    }}
                  >
                    <SaleTimelineIcon shopify={shopify} />
                    <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 8,
                          marginBottom: 4,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#1A1A1A",
                            letterSpacing: "-0.02em",
                            lineHeight: 1.3,
                          }}
                        >
                          {title}
                        </div>
                        <button
                          type="button"
                          onClick={() => void removeSale(sale)}
                          disabled={deletingId === sale.id}
                          style={{
                            ...deleteBtnStyle,
                            opacity: deletingId === sale.id ? 0.6 : 1,
                            cursor: deletingId === sale.id ? "wait" : "pointer",
                          }}
                        >
                          {lang === "fr" ? "Supprimer" : "Delete"}
                        </button>
                      </div>
                      <div style={{ fontSize: 12, color: "#7A7A7A", lineHeight: 1.45, letterSpacing: "-0.02em" }}>
                        @{handle} · {amount}
                        {codePart}
                        <br />
                        {lang === "fr" ? "Commission" : "Commission"} {commission}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
