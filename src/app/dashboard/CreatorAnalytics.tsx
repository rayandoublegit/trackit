"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLang } from "@/lib/useLang";
import { formatCurrency, useDisplayCurrency } from "@/lib/useCurrency";
import { useCreatorStats } from "@/lib/useCreatorStats";
import { supabase } from "@/lib/supabase";
import { AnalyticsPeriodDropdown } from "./AnalyticsPeriodDropdown";
import {
  analyticsPeriodLabel,
  isWithinPeriod,
  resolveAnalyticsDateBounds,
  type AnalyticsDateRange,
} from "@/lib/analytics-periods";

const BLUE = "#0047FF";

const CREATOR_PERIOD_OPTIONS: AnalyticsDateRange[] = ["today", "3d", "7d", "30d", "90d", "all"];

type AnalyticsMode = "all" | "sales" | "rpm";

type RpmVideo = {
  id: string;
  title: string;
  brandName: string;
  campaignName: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  accrued: number;
  pending: number;
  postUrl: string | null;
  postedAt: string | null;
};

type RpmPayload = {
  totals: {
    views: number;
    accrued: number;
    pending: number;
    videos: number;
    rpmRate?: number;
    balanceDue?: number;
    paidOut?: number;
  };
  videos: RpmVideo[];
};

async function sessionAuthHeaders(): Promise<HeadersInit> {
  if (!supabase) return {};
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

function MetricCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent ? BLUE : "var(--ws-surface)",
        border: accent ? "none" : "1px solid var(--ws-border)",
        borderRadius: 16,
        padding: "22px 24px",
        boxShadow: accent ? "0 8px 24px rgba(0,71,255,0.15)" : "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: accent ? "rgba(255,255,255,0.8)" : "var(--ws-text-dim)",
          marginBottom: 10,
          letterSpacing: "-0.01em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 600,
          color: accent ? "#FFFFFF" : "var(--ws-text)",
          letterSpacing: "-0.04em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {hint ? (
        <div
          style={{
            fontSize: 12,
            color: accent ? "rgba(255,255,255,0.65)" : "var(--ws-text-dim)",
            marginTop: 8,
            letterSpacing: "-0.01em",
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function TypeBadge({ label, tone }: { label: string; tone: "commission" | "rpm" }) {
  const isRpm = tone === "rpm";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "-0.01em",
        background: isRpm ? "rgba(0,71,255,0.08)" : "rgba(16,185,129,0.1)",
        color: isRpm ? BLUE : "#059669",
      }}
    >
      {label}
    </span>
  );
}

function StatusBadge({
  label,
  paid,
}: {
  label: string;
  paid: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: paid ? "#ECFDF3" : "#FFF7ED",
        color: paid ? "#1FB567" : "#D97706",
      }}
    >
      {label}
    </span>
  );
}

function formatViews(n: number, lang: string) {
  return new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US").format(Math.max(0, Math.floor(n)));
}

export function CreatorAnalytics({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const fr = lang === "fr";
  useDisplayCurrency();
  const { stats, loading, error, reload } = useCreatorStats(userId);
  const [period, setPeriod] = useState<AnalyticsDateRange>("30d");
  const [mode, setMode] = useState<AnalyticsMode>("all");
  const [rpm, setRpm] = useState<RpmPayload | null>(null);
  const [rpmLoading, setRpmLoading] = useState(false);
  const [rpmError, setRpmError] = useState("");
  const allSales = stats?.sales ?? [];

  const periodBounds = useMemo(() => resolveAnalyticsDateBounds(period), [period]);

  const filteredSales = useMemo(() => {
    if (!periodBounds) return allSales;
    return allSales.filter((sale) => isWithinPeriod(sale.date, periodBounds.start, periodBounds.end));
  }, [allSales, periodBounds]);

  const periodSalesTotal = filteredSales.reduce((sum, sale) => sum + (Number(sale.orderAmount) || 0), 0);
  const periodCommissionTotal = filteredSales.reduce(
    (sum, sale) => sum + (Number(sale.commissionAmount) || 0),
    0,
  );
  const periodLabel = analyticsPeriodLabel(period, lang);

  const loadRpm = useCallback(async () => {
    if (!userId) {
      setRpm(null);
      return;
    }
    setRpmLoading(true);
    setRpmError("");
    try {
      const authHeaders = await sessionAuthHeaders();
      const res = await fetch(`/api/creator/rpm?userId=${encodeURIComponent(userId)}`, {
        credentials: "include",
        cache: "no-store",
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRpmError(data.error || (fr ? "Chargement RPM impossible" : "Could not load RPM"));
        setRpm(null);
        return;
      }
      setRpm({
        totals: data.totals || { views: 0, accrued: 0, pending: 0, videos: 0, rpmRate: 1 },
        videos: (data.videos || []) as RpmVideo[],
      });
    } catch {
      setRpmError(fr ? "Erreur réseau" : "Network error");
      setRpm(null);
    } finally {
      setRpmLoading(false);
    }
  }, [userId, fr]);

  useEffect(() => {
    void loadRpm();
    const onFocus = () => {
      void reload();
      void loadRpm();
    };
    const onContent = () => void loadRpm();
    window.addEventListener("focus", onFocus);
    window.addEventListener("trackit:content-updated", onContent);
    window.addEventListener("trackit:rpm-updated", onContent);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("trackit:content-updated", onContent);
      window.removeEventListener("trackit:rpm-updated", onContent);
    };
  }, [loadRpm, reload]);

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(fr ? "fr-FR" : "en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  const isSalePaid = (status: string | null | undefined) => {
    const s = String(status || "pending").toLowerCase();
    return s === "paid" || s === "completed" || s === "success";
  };

  const saleStatusLabel = (status: string | null | undefined) => {
    if (isSalePaid(status)) return fr ? "Payée" : "Paid";
    return fr ? "En attente" : "Pending";
  };

  const hasCommission = (stats?.salesCount ?? 0) > 0 || periodCommissionTotal > 0 || Boolean(stats?.discountCode);
  const hasRpm = (rpm?.totals.videos ?? 0) > 0 || (rpm?.totals.accrued ?? 0) > 0 || (rpm?.totals.views ?? 0) > 0;
  const showSales = mode === "all" || mode === "sales";
  const showRpm = mode === "all" || mode === "rpm";

  const pendingTotal = Math.max(stats?.balance ?? 0, rpm?.totals.pending ?? 0);
  const rpmGains = rpm?.totals.accrued ?? 0;

  const pad = isMobile ? "16px 16px 48px" : "40px 40px 48px";

  if (loading && !stats) {
    return (
      <div
        style={{
          padding: pad,
          color: "var(--ws-text-dim)",
          fontSize: 14,
          background: "var(--ws-surface)",
          minHeight: "100%",
        }}
      >
        {fr ? "Chargement de vos analytiques…" : "Loading your analytics…"}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100%", background: "var(--ws-surface)" }}>
      <div
        style={{
          paddingTop: isMobile ? 16 : 40,
          paddingRight: isMobile ? 16 : 40,
          paddingBottom: isMobile ? 16 : 24,
          paddingLeft: isMobile ? 16 : 40,
          borderBottom: "1px solid var(--ws-border)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontSize: isMobile ? 26 : 30,
                fontWeight: 600,
                color: "var(--ws-text)",
                letterSpacing: "-0.04em",
                margin: 0,
                marginBottom: 8,
              }}
            >
              {fr ? "Analytiques" : "Analytics"}
            </h1>
            <p
              style={{
                fontSize: 15,
                color: "var(--ws-text-muted)",
                letterSpacing: "-0.02em",
                margin: 0,
                maxWidth: 620,
                lineHeight: 1.5,
              }}
            >
              {stats?.brandName
                ? fr
                  ? `Ventes, commissions et RPM pour ${stats.brandName} — historique et paiements.`
                  : `Sales, commissions and RPM for ${stats.brandName} — history and payouts.`
                : fr
                  ? "Ventes, commissions, RPM et historique de paiement."
                  : "Sales, commissions, RPM and payout history."}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {hasCommission ? <TypeBadge label={fr ? "Commission" : "Commission"} tone="commission" /> : null}
              {hasRpm ? <TypeBadge label="RPM" tone="rpm" /> : null}
              {!hasCommission && !hasRpm ? (
                <span style={{ fontSize: 12, color: "var(--ws-text-dim)" }}>
                  {fr ? "Aucun modèle de paiement actif pour l’instant" : "No active payout model yet"}
                </span>
              ) : null}
            </div>
          </div>
          {showSales ? (
            <AnalyticsPeriodDropdown
              value={period}
              onChange={setPeriod}
              lang={lang}
              options={CREATOR_PERIOD_OPTIONS}
              align="right"
            />
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          {(
            [
              { id: "all" as const, label: fr ? "Tout" : "All" },
              { id: "sales" as const, label: fr ? "Ventes / Commission" : "Sales / Commission" },
              { id: "rpm" as const, label: "RPM" },
            ] as const
          ).map((tab) => {
            const active = mode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMode(tab.id)}
                style={{
                  border: "1px solid var(--ws-border)",
                  background: active ? BLUE : "var(--ws-surface)",
                  color: active ? "#fff" : "var(--ws-text)",
                  borderRadius: 999,
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  letterSpacing: "-0.02em",
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: isMobile ? "20px 16px 48px" : "32px 40px 48px", maxWidth: 1080 }}>
        {(error || rpmError) && (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(220,38,38,0.06)",
              border: "1px solid rgba(220,38,38,0.15)",
              fontSize: 13,
              color: "var(--ws-danger)",
            }}
          >
            {error || rpmError}
          </div>
        )}

        {!stats?.linked && !error ? (
          <div
            style={{
              marginBottom: 20,
              padding: "12px 14px",
              borderRadius: 12,
              background: "var(--ws-surface-2)",
              border: "1px solid var(--ws-border)",
              fontSize: 13,
              color: "var(--ws-text-muted)",
              lineHeight: 1.5,
            }}
          >
            {fr
              ? "Reliez votre compte à la marque (invitation ou pseudo identique) pour voir vos analytiques."
              : "Link your account to the brand (invite or matching handle) to see your analytics."}
          </div>
        ) : null}

        {stats?.discountCode ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 20,
              padding: "8px 14px",
              borderRadius: 999,
              background: "rgba(0,71,255,0.06)",
              border: "1px solid rgba(0,71,255,0.12)",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--ws-text-muted)" }}>
              {fr ? "Votre code promo" : "Your promo code"}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ws-accent)" }}>{stats.discountCode}</span>
            {stats.commissionRate != null ? (
              <span style={{ fontSize: 13, color: "var(--ws-text-dim)" }}>· {stats.commissionRate}%</span>
            ) : null}
          </div>
        ) : null}

        {/* Summary — always show both models */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
            gap: 16,
            marginBottom: 16,
          }}
        >
          {showSales ? (
            <>
              <MetricCard
                label={fr ? "Ventes générées" : "Sales driven"}
                value={formatCurrency(periodSalesTotal, lang)}
                hint={
                  fr
                    ? `${filteredSales.length} commande(s) — ${periodLabel.toLowerCase()}`
                    : `${filteredSales.length} order(s) — ${periodLabel.toLowerCase()}`
                }
              />
              <MetricCard
                label={fr ? "Commissions gagnées" : "Commissions earned"}
                value={formatCurrency(periodCommissionTotal, lang)}
                hint={
                  fr
                    ? `Paiement à la commission · ${periodLabel.toLowerCase()}`
                    : `Commission payout · ${periodLabel.toLowerCase()}`
                }
              />
            </>
          ) : null}
          {showRpm ? (
            <>
              <MetricCard
                label={fr ? "Vues générées" : "Views driven"}
                value={rpmLoading && !rpm ? "…" : formatViews(rpm?.totals.views ?? 0, lang)}
                hint={
                  fr
                    ? `${rpm?.totals.videos ?? 0} vidéo(s) · paiement RPM`
                    : `${rpm?.totals.videos ?? 0} video(s) · RPM payout`
                }
              />
              <MetricCard
                label={fr ? "Gains RPM" : "RPM earned"}
                value={rpmLoading && !rpm ? "…" : formatCurrency(rpmGains, lang)}
                hint={
                  fr
                    ? `Total des vues × ${rpm?.totals.rpmRate || 1} € / 1 000`
                    : `Total views × €${rpm?.totals.rpmRate || 1} / 1,000`
                }
                accent={rpmGains > 0}
              />
            </>
          ) : null}
        </div>

        <div style={{ marginBottom: 28 }}>
          <MetricCard
            label={fr ? "En attente de versement" : "Awaiting payout"}
            value={formatCurrency(pendingTotal, lang)}
            hint={
              fr
                ? "Commissions + RPM pas encore payés"
                : "Commissions + RPM not yet paid out"
            }
            accent={pendingTotal > 0}
          />
        </div>

        {/* Sales history */}
        {showSales ? (
          <div
            style={{
              background: "var(--ws-surface)",
              border: "1px solid var(--ws-border)",
              borderRadius: 16,
              overflow: "hidden",
              marginBottom: showRpm ? 28 : 0,
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--ws-border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em" }}>
                  {fr ? `Historique des ventes — ${periodLabel}` : `Sales history — ${periodLabel}`}
                </div>
                <TypeBadge label={fr ? "Commission" : "Commission"} tone="commission" />
              </div>
              {filteredSales.length > 0 ? (
                <span style={{ fontSize: 12, color: "var(--ws-text-dim)" }}>
                  {filteredSales.length} {fr ? "vente(s)" : "sale(s)"}
                </span>
              ) : null}
            </div>
            {filteredSales.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ws-text)", marginBottom: 6 }}>
                  {fr ? "Aucune vente sur cette période" : "No sales in this period"}
                </div>
                <p
                  style={{
                    fontSize: 14,
                    color: "var(--ws-text-muted)",
                    lineHeight: 1.5,
                    margin: "0 auto",
                    maxWidth: 400,
                  }}
                >
                  {fr
                    ? "Essayez une autre période ou attendez qu'une commande passe avec votre code promo."
                    : "Try another period or wait for an order with your promo code."}
                </p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 14,
                    minWidth: isMobile ? 560 : undefined,
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--ws-border)" }}>
                      <th style={{ textAlign: "left", padding: "12px 20px", color: "var(--ws-text-dim)", fontWeight: 500 }}>
                        {fr ? "Date" : "Date"}
                      </th>
                      {!isMobile ? (
                        <th style={{ textAlign: "left", padding: "12px 20px", color: "var(--ws-text-dim)", fontWeight: 500 }}>
                          {fr ? "Marque" : "Brand"}
                        </th>
                      ) : null}
                      <th style={{ textAlign: "left", padding: "12px 20px", color: "var(--ws-text-dim)", fontWeight: 500 }}>
                        {fr ? "Type" : "Type"}
                      </th>
                      <th style={{ textAlign: "left", padding: "12px 20px", color: "var(--ws-text-dim)", fontWeight: 500 }}>
                        {fr ? "Code" : "Code"}
                      </th>
                      <th style={{ textAlign: "right", padding: "12px 20px", color: "var(--ws-text-dim)", fontWeight: 500 }}>
                        {fr ? "Vente" : "Sale"}
                      </th>
                      <th style={{ textAlign: "right", padding: "12px 20px", color: "var(--ws-text-dim)", fontWeight: 500 }}>
                        {fr ? "Commission" : "Commission"}
                      </th>
                      <th style={{ textAlign: "right", padding: "12px 20px", color: "var(--ws-text-dim)", fontWeight: 500 }}>
                        {fr ? "Paiement" : "Payout"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.map((sale) => {
                      const paid = isSalePaid(sale.status);
                      return (
                        <tr key={sale.id} style={{ borderBottom: "1px solid var(--ws-border)" }}>
                          <td style={{ padding: "14px 20px", color: "var(--ws-text)", whiteSpace: "nowrap" }}>
                            {fmtDate(sale.date)}
                          </td>
                          {!isMobile ? (
                            <td style={{ padding: "14px 20px", color: "var(--ws-text-muted)" }}>
                              {sale.brandName || "—"}
                            </td>
                          ) : null}
                          <td style={{ padding: "14px 20px" }}>
                            <TypeBadge label={fr ? "Commission" : "Commission"} tone="commission" />
                          </td>
                          <td
                            style={{
                              padding: "14px 20px",
                              color: "var(--ws-text-muted)",
                              fontFamily: "monospace",
                              fontSize: 13,
                            }}
                          >
                            {sale.discountCode || stats?.discountCode || "—"}
                          </td>
                          <td style={{ padding: "14px 20px", textAlign: "right", color: "var(--ws-text)" }}>
                            {formatCurrency(sale.orderAmount, lang)}
                          </td>
                          <td
                            style={{
                              padding: "14px 20px",
                              textAlign: "right",
                              color: "var(--ws-accent)",
                              fontWeight: 600,
                            }}
                          >
                            {formatCurrency(sale.commissionAmount, lang)}
                          </td>
                          <td style={{ padding: "14px 20px", textAlign: "right" }}>
                            <StatusBadge label={saleStatusLabel(sale.status)} paid={paid} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {/* RPM videos */}
        {showRpm ? (
          <div
            style={{
              background: "var(--ws-surface)",
              border: "1px solid var(--ws-border)",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--ws-border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em" }}>
                  {fr ? "Gains RPM par vidéo" : "RPM earnings by video"}
                </div>
                <TypeBadge label="RPM" tone="rpm" />
              </div>
              {(rpm?.videos.length ?? 0) > 0 ? (
                <span style={{ fontSize: 12, color: "var(--ws-text-dim)" }}>
                  {rpm?.videos.length} {fr ? "vidéo(s)" : "video(s)"}
                </span>
              ) : null}
            </div>
            {rpmLoading && !rpm ? (
              <p style={{ padding: "28px 20px", color: "var(--ws-text-dim)", fontSize: 14, margin: 0 }}>
                {fr ? "Chargement des vues…" : "Loading views…"}
              </p>
            ) : (rpm?.videos.length ?? 0) === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ws-text)", marginBottom: 6 }}>
                  {fr ? "Aucune vidéo pour l’instant" : "No videos yet"}
                </div>
                <p
                  style={{
                    fontSize: 14,
                    color: "var(--ws-text-muted)",
                    lineHeight: 1.5,
                    margin: "0 auto",
                    maxWidth: 420,
                  }}
                >
                  {fr
                    ? "Uploadez du contenu avec une URL TikTok pour calculer les vues et les gains RPM."
                    : "Upload content with a TikTok URL to calculate views and RPM earnings."}
                </p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 14,
                    minWidth: isMobile ? 600 : undefined,
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--ws-border)" }}>
                      <th style={{ textAlign: "left", padding: "12px 20px", color: "var(--ws-text-dim)", fontWeight: 500 }}>
                        {fr ? "Vidéo" : "Video"}
                      </th>
                      {!isMobile ? (
                        <th style={{ textAlign: "left", padding: "12px 20px", color: "var(--ws-text-dim)", fontWeight: 500 }}>
                          {fr ? "Campagne" : "Campaign"}
                        </th>
                      ) : null}
                      <th style={{ textAlign: "left", padding: "12px 20px", color: "var(--ws-text-dim)", fontWeight: 500 }}>
                        {fr ? "Type" : "Type"}
                      </th>
                      <th style={{ textAlign: "right", padding: "12px 20px", color: "var(--ws-text-dim)", fontWeight: 500 }}>
                        {fr ? "Vues" : "Views"}
                      </th>
                      <th style={{ textAlign: "right", padding: "12px 20px", color: "var(--ws-text-dim)", fontWeight: 500 }}>
                        {fr ? "Gains" : "Earned"}
                      </th>
                      <th style={{ textAlign: "right", padding: "12px 20px", color: "var(--ws-text-dim)", fontWeight: 500 }}>
                        {fr ? "Paiement" : "Payout"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rpm?.videos || []).map((v) => {
                      const paid = v.accrued > 0 && v.pending <= 0;
                      return (
                        <tr key={v.id} style={{ borderBottom: "1px solid var(--ws-border)" }}>
                          <td style={{ padding: "14px 20px", color: "var(--ws-text)" }}>
                            <div style={{ fontWeight: 600, letterSpacing: "-0.02em" }}>{v.title}</div>
                            <div style={{ fontSize: 12, color: "var(--ws-text-muted)", marginTop: 2 }}>
                              {v.brandName || "—"}
                              {v.postedAt ? ` · ${fmtDate(v.postedAt)}` : ""}
                            </div>
                          </td>
                          {!isMobile ? (
                            <td style={{ padding: "14px 20px", color: "var(--ws-text-muted)" }}>
                              {v.campaignName || "—"}
                            </td>
                          ) : null}
                          <td style={{ padding: "14px 20px" }}>
                            <TypeBadge label="RPM" tone="rpm" />
                          </td>
                          <td
                            style={{
                              padding: "14px 20px",
                              textAlign: "right",
                              color: "var(--ws-text)",
                              fontWeight: 600,
                            }}
                          >
                            {formatViews(v.views, lang)}
                          </td>
                          <td
                            style={{
                              padding: "14px 20px",
                              textAlign: "right",
                              color: "var(--ws-accent)",
                              fontWeight: 600,
                            }}
                          >
                            {formatCurrency(v.accrued, lang)}
                          </td>
                          <td style={{ padding: "14px 20px", textAlign: "right" }}>
                            <StatusBadge
                              label={
                                paid
                                  ? fr
                                    ? "Payé"
                                    : "Paid"
                                  : fr
                                    ? "En attente"
                                    : "Pending"
                              }
                              paid={paid}
                            />
                            {!paid && v.pending > 0 ? (
                              <div style={{ fontSize: 11, color: "var(--ws-text-dim)", marginTop: 4 }}>
                                {formatCurrency(v.pending, lang)}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
