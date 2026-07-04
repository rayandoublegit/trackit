"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/useCurrency";
import { SALES_UPDATED_EVENT } from "@/lib/outreach-history-events";
import { AnalyticsPeriodDropdown, HERO_PERIOD_OPTIONS } from "./AnalyticsPeriodDropdown";
import type { AnalyticsDateRange } from "@/lib/analytics-periods";

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

type TimeFilter = "today" | "yesterday" | "week";

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
  return !!(sale.shopify_order_id || sale.shop_domain);
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function saleInTimeFilter(sale: TrackedSale, filter: TimeFilter, now = new Date()) {
  const created = new Date(sale.created_at);
  if (Number.isNaN(created.getTime())) return false;
  if (filter === "today") return isSameDay(created, now);
  if (filter === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return isSameDay(created, y);
  }
  const weekStart = startOfDay(now);
  weekStart.setDate(weekStart.getDate() - 6);
  return created >= weekStart && created <= endOfDay(now);
}

function formatSaleTime(iso: string, lang: "en" | "fr") {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
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
        <path
          d="M12 5v14M5 12h14"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function AnalyticsSalesPanel({
  userId,
  lang,
  isMobile,
  campaignId,
  period,
  onPeriodChange,
  periodOptions = HERO_PERIOD_OPTIONS,
}: {
  userId?: string;
  lang: "en" | "fr";
  isMobile?: boolean;
  /** When set, only sales linked to this campaign are shown. */
  campaignId?: string;
  period?: AnalyticsDateRange;
  onPeriodChange?: (period: AnalyticsDateRange) => void;
  periodOptions?: AnalyticsDateRange[];
}) {
  const [sales, setSales] = useState<TrackedSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("today");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!userId) {
      setSales([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const rows = await fetchTrackedSales(userId);
      if (!cancelled) {
        setSales(rows);
        setLoading(false);
      }
    };

    void load();
    const onUpdate = () => void load();
    window.addEventListener(SALES_UPDATED_EVENT, onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener(SALES_UPDATED_EVENT, onUpdate);
    };
  }, [userId]);

  const scopedSales = useMemo(() => {
    if (!campaignId) return sales;
    return sales.filter((sale) => String(sale.campaign_id || "") === campaignId);
  }, [sales, campaignId]);

  const filteredSales = useMemo(() => {
    return scopedSales.filter((sale) => saleInTimeFilter(sale, timeFilter) && saleMatchesSearch(sale, search));
  }, [scopedSales, timeFilter, search]);

  const todayCount = useMemo(
    () => scopedSales.filter((sale) => saleInTimeFilter(sale, "today")).length,
    [scopedSales],
  );

  const filterLabels: { id: TimeFilter; label: string }[] = [
    { id: "today", label: lang === "fr" ? "Aujourd'hui" : "Today" },
    { id: "yesterday", label: lang === "fr" ? "Hier" : "Yesterday" },
    { id: "week", label: lang === "fr" ? "Cette semaine" : "This week" },
  ];

  const summaryText =
    timeFilter === "today"
      ? lang === "fr"
        ? (
            <>
              <strong style={{ color: "#1A1A1A", fontWeight: 600 }}>{todayCount}</strong>
              {" "}nouvelle{todayCount > 1 ? "s" : ""} vente{todayCount > 1 ? "s" : ""} aujourd'hui
            </>
          )
        : (
            <>
              <strong style={{ color: "#1A1A1A", fontWeight: 600 }}>{todayCount}</strong>
              {" "}new sale{todayCount === 1 ? "" : "s"} today
            </>
          )
      : lang === "fr"
        ? `${filteredSales.length} vente${filteredSales.length > 1 ? "s" : ""}`
        : `${filteredSales.length} sale${filteredSales.length === 1 ? "" : "s"}`;

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
          flex: 1,
          minHeight: isMobile ? undefined : 420,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", margin: 0, letterSpacing: "-0.03em" }}>
            {lang === "fr" ? "Dernières ventes" : "Latest sales"}
          </h2>
          {period && onPeriodChange ? (
            <AnalyticsPeriodDropdown
              value={period}
              onChange={onPeriodChange}
              lang={lang}
              options={periodOptions}
              align="right"
              variant="subtle"
            />
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 5, marginBottom: 10, flexWrap: "wrap" }}>
          {filterLabels.map((f) => {
            const active = timeFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setTimeFilter(f.id)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 999,
                  border: active ? "1px solid #1A1A1A" : "1px solid #E5E5E5",
                  background: active ? "#1A1A1A" : "#FFFFFF",
                  color: active ? "#FFFFFF" : "#1A1A1A",
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  letterSpacing: "-0.02em",
                }}
              >
                {f.label}
              </button>
            );
          })}
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

        <p style={{ fontSize: 12, color: "#9A9A9A", margin: "0 0 14px", letterSpacing: "-0.02em" }}>
          {loading ? (lang === "fr" ? "Chargement…" : "Loading…") : summaryText}
        </p>

        <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingRight: 2 }}>
          {!loading && filteredSales.length === 0 ? (
            <div style={{ padding: "32px 8px", textAlign: "center", color: "#9A9A9A", fontSize: 12, lineHeight: 1.5 }}>
              {lang === "fr"
                ? "Aucune vente pour ce filtre."
                : "No sales for this filter."}
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
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", lineHeight: 1.3 }}>
                          {title}
                        </div>
                        <div style={{ fontSize: 11, color: "#9A9A9A", whiteSpace: "nowrap", flexShrink: 0, letterSpacing: "-0.01em" }}>
                          {formatSaleTime(sale.created_at, lang)}
                        </div>
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
