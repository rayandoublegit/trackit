"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import { CreatorPaymentInfo } from "./CreatorPaymentInfo";
import {
  canUseAutoPayouts,
  canUseBalance,
  canUseManualPayouts,
  canUseStripeConnectPayouts,
  type PlanTier,
} from "@/lib/plan-limits";
import { formatCurrency } from "@/lib/useCurrency";
import {
  formatPaymentLabel,
  formatPaymentLabelShort,
  usePaymentMethods,
  type PaymentMethod,
} from "./usePaymentMethods";
import { notifyCreatorPaid, notifyFundsAdded } from "@/lib/notifications-storage";
import { primeNotificationSound } from "@/lib/notification-sound";
import { dispatchPayoutsUpdated, dispatchSalesUpdated, SALES_UPDATED_EVENT } from "@/lib/outreach-history-events";
import {
  dismissSaleFeedItems,
  loadDismissedSaleIds,
} from "@/lib/live-sales-feed-storage";
import { CreatorAvatar } from "./CreatorAvatar";
import { CreatorPayoutMethodFields, creatorHasPayoutDetails, type CreatorPayoutMethodFieldsHandle } from "./CreatorPayoutMethodFields";
import { useDashboardNavigation } from "./DashboardNavigationProvider";
import { PayItWelcomeLoading, PayItWelcomeView, usePayItActivity } from "./PayItWelcomeView";
import { PlatformBrandIcon } from "./PlatformBrandIcon";
import { UpgradeModal } from "./UpgradeModal";
import { getGateModalProps, type GateFeatureKey } from "@/lib/plan-marketing";

function PaywallModal({
  featureKey,
  lang,
  onClose,
  onUpgrade,
  onUpgradePro,
  onUpgradeScale,
}: {
  featureKey: GateFeatureKey;
  lang: "en" | "fr";
  onClose: () => void;
  onUpgrade?: () => void;
  onUpgradePro?: () => void;
  onUpgradeScale?: () => void;
}) {
  const gate = getGateModalProps(featureKey, lang);
  return (
    <UpgradeModal
      lang={lang}
      featureKey={featureKey}
      onClose={onClose}
      onPrimary={() => {
        onClose();
        if (gate.requiredTier === "scale") void onUpgradeScale?.();
        else if (gate.requiredTier === "pro") void onUpgradePro?.();
        else void onUpgrade?.();
      }}
    />
  );
}

type SalePlatform = "tiktok" | "instagram" | "youtube";

type SaleNotification = {
  id: string;
  amount: number;
  creatorHandle: string;
  commissionRate: number;
  platform: SalePlatform;
  minutesAgo: number;
  createdAt: string;
  isNew?: boolean;
};

type SaleFeedSection = "today" | "yesterday" | "earlier";

const btnOutline: React.CSSProperties = {
  background: "#FFFFFF",
  color: "#1A1A1A",
  border: "1px solid #E5E5E5",
  borderRadius: 10,
  padding: "10px 16px",
  fontSize: 14,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function splitShares(amount: number, commissionRate: number) {
  const creatorShare = round2(amount * commissionRate);
  const brandShare = round2(amount - creatorShare);
  return { creatorShare, brandShare };
}

function saleFeedSection(minutesAgo: number): SaleFeedSection {
  if (minutesAgo < 24 * 60) return "today";
  if (minutesAgo < 48 * 60) return "yesterday";
  return "earlier";
}

function saleFeedSectionLabel(section: SaleFeedSection, lang: "en" | "fr") {
  if (section === "today") return lang === "fr" ? "Aujourd'hui" : "Today";
  if (section === "yesterday") return lang === "fr" ? "Hier" : "Yesterday";
  return lang === "fr" ? "Plus tôt" : "Earlier";
}

function formatSaleFeedTime(createdAt: string, lang: "en" | "fr") {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "—";
  const mins = minutesAgoFromIso(createdAt);
  const section = saleFeedSection(mins);
  const time = d.toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-US", { hour: "2-digit", minute: "2-digit" });
  if (section === "today") return time;
  if (section === "yesterday") return lang === "fr" ? `Hier · ${time}` : `Yesterday · ${time}`;
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function groupSalesBySection(sales: SaleNotification[]) {
  const order: SaleFeedSection[] = ["today", "yesterday", "earlier"];
  const groups = new Map<SaleFeedSection, SaleNotification[]>();
  for (const section of order) groups.set(section, []);
  for (const sale of sales) {
    groups.get(saleFeedSection(sale.minutesAgo))?.push(sale);
  }
  return order
    .map((section) => ({ section, items: groups.get(section) ?? [] }))
    .filter((group) => group.items.length > 0);
}

function formatRelativeTime(minutesAgo: number, lang: "en" | "fr") {
  if (minutesAgo < 1) return "Just now";
  if (minutesAgo === 1) return lang === "fr" ? "il y a 1 minute" : "1 minute ago";
  if (minutesAgo < 60) return lang === "fr" ? `il y a ${minutesAgo} minutes` : `${minutesAgo} minutes ago`;
  const hours = Math.floor(minutesAgo / 60);
  if (hours === 1) return lang === "fr" ? "il y a 1 heure" : "1 hour ago";
  return lang === "fr" ? `il y a ${hours} heures` : `${hours} hours ago`;
}

function platformLabel(platform: SalePlatform) {
  if (platform === "tiktok") return "TikTok";
  if (platform === "instagram") return "Instagram";
  return "YouTube";
}

function salePlatformLogoSrc(platform: SalePlatform): string | null {
  if (platform === "instagram") return "/instagram-logo.svg";
  if (platform === "tiktok") return "/tiktok-logo.svg";
  return null;
}

function SalePlatformLogo({ platform }: { platform: SalePlatform }) {
  const label = platformLabel(platform);
  const logoSrc = salePlatformLogoSrc(platform);
  const outer = 20;
  const inner = 16;

  if (logoSrc) {
    return (
      <span
        style={{
          width: outer,
          height: outer,
          borderRadius: "50%",
          overflow: "hidden",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
        title={label}
      >
        <img src={logoSrc} alt={label} width={inner} height={inner} style={{ display: "block", objectFit: "contain" }} />
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }} title={label}>
      <PlatformBrandIcon platform={platform} size={inner} />
    </span>
  );
}

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

function saleCreatorMeta(sale: TrackedSale) {
  const c = sale.creators;
  if (Array.isArray(c)) return c[0] ?? null;
  return c ?? null;
}

function minutesAgoFromIso(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

function salePlatformFromCreator(platform?: string | null): SalePlatform {
  const p = String(platform || "").toLowerCase();
  if (p.includes("instagram")) return "instagram";
  if (p.includes("youtube")) return "youtube";
  return "tiktok";
}

function commissionRateFromSale(sale: TrackedSale) {
  const order = Number(sale.order_amount) || 0;
  const commission = Number(sale.commission_amount) || 0;
  return order > 0 ? commission / order : 0;
}

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
    .limit(150);
  if (error) {
    console.error(error);
    return [];
  }
  return (data || []) as TrackedSale[];
}

function mapSaleToNotification(row: TrackedSale, isNew: boolean): SaleNotification {
  const creator = saleCreatorMeta(row);
  const handle = creator?.handle || creator?.full_name || "creator";
  return {
    id: row.id,
    amount: Number(row.order_amount) || 0,
    creatorHandle: String(handle).replace(/^@/, ""),
    commissionRate: commissionRateFromSale(row),
    platform: salePlatformFromCreator(creator?.platform),
    minutesAgo: minutesAgoFromIso(row.created_at),
    createdAt: row.created_at,
    isNew,
  };
}

export function LiveSalesFeed({ isMobile, userId }: { isMobile?: boolean; userId?: string } = {}) {
  const lang = useLang();
  const [notifications, setNotifications] = useState<SaleNotification[]>([]);
  const [paused, setPaused] = useState(false);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);
  const hiddenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    hiddenIdsRef.current = loadDismissedSaleIds(userId);
    knownIdsRef.current = new Set();
    initialLoadRef.current = true;
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      const rows = await fetchTrackedSales(userId);
      if (cancelled) return;
      const visible = rows.filter((row) => !hiddenIdsRef.current.has(row.id));
      const mapped = visible.slice(0, 30).map((row) =>
        mapSaleToNotification(row, !knownIdsRef.current.has(row.id) && !initialLoadRef.current),
      );
      for (const row of visible) knownIdsRef.current.add(row.id);
      initialLoadRef.current = false;
      setNotifications(mapped);
    };

    void load();
    const onUpdate = () => void load();
    window.addEventListener(SALES_UPDATED_EVENT, onUpdate);
    const interval = window.setInterval(load, 25000);
    return () => {
      cancelled = true;
      window.removeEventListener(SALES_UPDATED_EVENT, onUpdate);
      window.clearInterval(interval);
    };
  }, [userId]);

  const clearNotifications = () => {
    if (!userId) {
      setNotifications([]);
      return;
    }
    const ids = notifications.map((sale) => sale.id);
    hiddenIdsRef.current = dismissSaleFeedItems(userId, ids);
    setNotifications([]);
  };

  const removeNotification = (id: string) => {
    if (userId) {
      hiddenIdsRef.current = dismissSaleFeedItems(userId, [id]);
    } else {
      hiddenIdsRef.current.add(id);
    }
    setNotifications((list) => list.filter((n) => n.id !== id));
  };

  const list = useMemo(() => notifications, [notifications]);
  const groupedSales = useMemo(() => groupSalesBySection(list), [list]);

  const thStyle: React.CSSProperties = {
    padding: "16px 22px",
    fontSize: 13,
    fontWeight: 600,
    color: "#6B7280",
    textAlign: "left",
    borderBottom: "1px solid #EFEFEF",
    background: "#FFFFFF",
    whiteSpace: "nowrap",
    letterSpacing: "-0.01em",
  };

  const tdStyle: React.CSSProperties = {
    padding: "18px 22px",
    fontSize: 15,
    color: "#1A1A1A",
    borderBottom: "1px solid #F5F5F5",
    verticalAlign: "middle",
    letterSpacing: "-0.02em",
  };

  const sectionRowStyle: React.CSSProperties = {
    padding: "10px 22px",
    fontSize: 12,
    fontWeight: 600,
    color: "#6B7280",
    background: "#FAFAFA",
    borderBottom: "1px solid #EFEFEF",
    letterSpacing: "-0.01em",
  };

  const headerLinkStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 13,
    color: "#6B7280",
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "-0.01em",
  };

  return (
    <>
      <style>{`
        @keyframes saleRowIn {
          from { opacity: 0; background: #F5F8FF; }
          to { opacity: 1; background: #FFFFFF; }
        }
      `}</style>

      <div style={{ marginBottom: 36 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0 }}>
            {lang === "fr" ? "Ventes en direct" : "Live sales"}
          </h2>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <button type="button" onClick={() => setPaused((p) => !p)} style={headerLinkStyle}>
              {paused ? (lang === "fr" ? "Reprendre" : "Resume") : lang === "fr" ? "Pause" : "Pause"}
            </button>
            <button
              type="button"
              onClick={clearNotifications}
              disabled={list.length === 0}
              style={{
                ...headerLinkStyle,
                opacity: list.length === 0 ? 0.4 : 1,
                cursor: list.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              {lang === "fr" ? "Tout effacer" : "Clear all"}
            </button>
          </div>
        </div>

        <div style={{ position: "relative", border: "1px solid #EFEFEF", borderRadius: 16, overflow: "auto" }}>
          {paused && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.82)",
                pointerEvents: "none",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: "#9A9A9A", letterSpacing: "-0.02em" }}>
                {lang === "fr" ? "Flux en pause" : "Feed paused"}
              </span>
            </div>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 640 : undefined, opacity: paused ? 0.45 : 1, transition: "opacity 0.2s ease" }}>
            <thead>
              <tr>
                <th style={thStyle}>{lang === "fr" ? "Créateur" : "Creator"}</th>
                <th style={thStyle}>{lang === "fr" ? "Plateforme" : "Platform"}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{lang === "fr" ? "Vente" : "Sale"}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{lang === "fr" ? "Commission" : "Commission"}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{lang === "fr" ? "Date" : "Date"}</th>
                <th style={{ ...thStyle, width: 44 }} aria-label={lang === "fr" ? "Actions" : "Actions"} />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#9A9A9A", padding: 48 }}>
                    {lang === "fr" ? "Aucune vente pour le moment." : "No sales yet."}
                  </td>
                </tr>
              ) : (
                groupedSales.map(({ section, items }) => (
                  <Fragment key={section}>
                    <tr>
                      <td colSpan={6} style={sectionRowStyle}>
                        {saleFeedSectionLabel(section, lang)}
                      </td>
                    </tr>
                    {items.map((sale) => {
                      const { creatorShare } = splitShares(sale.amount, sale.commissionRate);
                      return (
                        <tr
                          key={sale.id}
                          style={{
                            background: "#FFFFFF",
                            animation: sale.isNew ? "saleRowIn 0.6s ease-out" : undefined,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#FAFAFA";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "#FFFFFF";
                          }}
                        >
                          <td style={{ ...tdStyle, fontWeight: 500 }}>@{sale.creatorHandle}</td>
                          <td style={tdStyle}>
                            <SalePlatformLogo platform={sale.platform} />
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
                            {formatCurrency(sale.amount, lang)}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>
                            {formatCurrency(creatorShare, lang)}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", color: "#6B7280", fontSize: 14 }}>
                            {formatSaleFeedTime(sale.createdAt, lang)}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", paddingLeft: 8, paddingRight: 16 }}>
                            <button
                              type="button"
                              onClick={() => removeNotification(sale.id)}
                              aria-label={lang === "fr" ? "Supprimer" : "Remove"}
                              style={{
                                background: "none",
                                border: "none",
                                color: "#9CA3AF",
                                fontSize: 18,
                                lineHeight: 1,
                                cursor: "pointer",
                                padding: 0,
                                fontFamily: "inherit",
                              }}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// --- Shared payment methods (Settings + Payouts) ---

const pmBtnSecondary: React.CSSProperties = {
  background: "#FFFFFF",
  color: "#1A1A1A",
  border: "1px solid #E5E5E5",
  borderRadius: 10,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

function CardBrandIcon({ brand }: { brand: string }) {
  const isMastercard = brand.toLowerCase() === "mastercard";
  return (
    <div
      style={{
        width: 44,
        height: 28,
        borderRadius: 6,
        background: isMastercard ? "#1A1A1A" : "#1A1F71",
        color: "#FFFFFF",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "-0.02em",
        flexShrink: 0,
      }}
    >
      {isMastercard ? "MC" : "VISA"}
    </div>
  );
}

function PaymentMethodCardItem({ method }: { method: PaymentMethod }) {
  const lang = useLang();
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #EFEFEF",
        borderRadius: 12,
        padding: 16,
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <CardBrandIcon brand={method.brand} />
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", marginBottom: 4 }}>
          {formatPaymentLabel(method)}
        </div>
        <div style={{ fontSize: 12, color: "#7A7A7A" }}>
          {lang === "fr" ? "Expire" : "Expires"} {method.expiry}
        </div>
      </div>
      {method.isDefault && (
        <span style={{ fontSize: 11, fontWeight: 600, color: "#1A1A1A", textTransform: "capitalize", letterSpacing: "-0.01em" }}>
          {lang === "fr" ? "Par défaut" : "Default"}
        </span>
      )}
    </div>
  );
}

export function BillingPaymentMethodSummary({ compact }: { compact?: boolean }) {
  const lang = useLang();
  const { defaultMethod, loading, error, hasPaymentMethod, openManage } = usePaymentMethods();

  if (loading) {
    return (
      <p style={{ fontSize: 13, color: "#7A7A7A", margin: compact ? "8px 0 0" : "0", letterSpacing: "-0.01em" }}>
        {lang === "fr" ? "Chargement de la carte…" : "Loading card…"}
      </p>
    );
  }

  if (error) {
    return (
      <p style={{ fontSize: 13, color: "#C62828", margin: compact ? "8px 0 0" : "0", letterSpacing: "-0.01em" }}>
        {error}
      </p>
    );
  }

  if (!hasPaymentMethod || !defaultMethod) {
    return (
      <p style={{ fontSize: 13, color: "#7A7A7A", margin: compact ? "8px 0 0" : "0", letterSpacing: "-0.01em" }}>
        {lang === "fr"
          ? "Aucune carte enregistrée pour votre abonnement."
          : "No card on file for your subscription."}{" "}
        <button
          type="button"
          onClick={openManage}
          style={{ background: "none", border: "none", padding: 0, color: "#0047FF", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
        >
          {lang === "fr" ? "Ajouter une carte" : "Add a card"}
        </button>
      </p>
    );
  }

  return (
    <p style={{ fontSize: 13, color: "#7A7A7A", margin: compact ? "8px 0 0" : "0", letterSpacing: "-0.01em" }}>
      {lang === "fr" ? "Facturé sur" : "Billed to"}{" "}
      <span style={{ color: "#1A1A1A", fontWeight: 500 }}>
        {formatPaymentLabelShort(defaultMethod, lang)}
      </span>
      {!compact && (
        <>
          {" "}
          · {lang === "fr" ? "expire" : "expires"} {defaultMethod.expiry}
        </>
      )}
    </p>
  );
}

export function PaymentMethodsBillingSection() {
  const lang = useLang();
  const { methods, loading, error, hasPaymentMethod, openManage } = usePaymentMethods();

  if (loading) {
    return (
      <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0, letterSpacing: "-0.01em" }}>
        {lang === "fr" ? "Chargement..." : "Loading..."}
      </p>
    );
  }

  if (error) {
    return (
      <p style={{ fontSize: 13, color: "#C62828", margin: 0, letterSpacing: "-0.01em" }}>
        {error}
      </p>
    );
  }

  return (
    <>
      <p style={{ fontSize: 12, color: "#9A9A9A", margin: "0 0 12px", letterSpacing: "-0.01em", lineHeight: 1.45 }}>
        {lang === "fr"
          ? "Carte utilisée lors du choix de votre offre et pour les renouvellements Stripe."
          : "Card used when you chose your plan and for Stripe renewals."}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        {methods.map((m) => (
          <PaymentMethodCardItem key={m.id} method={m} />
        ))}
        {!hasPaymentMethod && (
          <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0, letterSpacing: "-0.01em" }}>
            {lang === "fr"
              ? "Aucune carte enregistrée. Ajoutez-en une via le portail de facturation Stripe."
              : "No card on file. Add one in the Stripe billing portal."}
          </p>
        )}
      </div>
      <button type="button" onClick={openManage} style={{ ...pmBtnSecondary, marginBottom: 16 }}>
        {hasPaymentMethod
          ? lang === "fr"
            ? "Mettre à jour la carte"
            : "Update card"
          : lang === "fr"
            ? "Ajouter une carte"
            : "Add a card"}
      </button>
      <div style={{ padding: "12px 14px", background: "#FAFAFA", borderRadius: 10, fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em" }}>
        Switch to annual billing — save 20%
      </div>
    </>
  );
}


// --- Payouts workspace ---

function creatorHasPaymentMethod(c: {
  paypal_link?: string | null;
  revolut_link?: string | null;
  iban?: string | null;
}) {
  return creatorHasPayoutDetails(c);
}

function paypalUsername(raw: string) {
  return String(raw || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^paypal\.me\//i, "")
    .replace(/\/.*$/, "");
}

function revolutUsername(raw: string) {
  return String(raw || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^revolut\.me\//i, "")
    .replace(/\/.*$/, "");
}

function paymentMethodLabel(c: {
  paypal_link?: string | null;
  revolut_link?: string | null;
  iban?: string | null;
}, lang: "en" | "fr") {
  if (paypalUsername(String(c.paypal_link || ""))) return "PayPal";
  if (revolutUsername(String(c.revolut_link || ""))) return "Revolut";
  if (String(c.iban || "").trim()) return lang === "fr" ? "Virement" : "Bank";
  return lang === "fr" ? "Non configuré" : "Not set";
}

type CompletedPayout = {
  id: string;
  creator_id: string | null;
  amount: number;
  status: string;
  stripe_transfer_id: string | null;
  paid_at: string | null;
  created_at: string | null;
  creator: {
    handle?: string;
    full_name?: string;
    avatar_url?: string;
    platform?: string;
  } | null;
};

function payoutMethodLabel(transferId: string | null | undefined, lang: "en" | "fr") {
  const id = String(transferId ?? "");
  if (id.startsWith("manual_paypal")) return "PayPal";
  if (id.startsWith("manual_revolut")) return "Revolut";
  if (id.startsWith("manual_iban")) return "IBAN";
  if (id.startsWith("tr_")) return "Stripe Connect";
  if (id && !id.startsWith("manual_")) return "Stripe Connect";
  return lang === "fr" ? "Manuel" : "Manual";
}

type PayoutTableSortKey = "name" | "balance" | "payment" | "earned" | "sales";

type PayoutTableCreator = {
  id: string;
  full_name?: string;
  handle?: string;
  username?: string;
  avatar_url?: string;
  platform?: string | null;
  followers?: number | null;
  engagement_rate?: number | null;
  discount_code?: string | null;
  balance?: number;
  total_earned?: number;
  total_sales?: number;
  paypal_link?: string | null;
  revolut_link?: string | null;
  iban?: string | null;
};

function fmtFollowerCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

function PayoutSortArrows({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", marginLeft: 4, verticalAlign: "middle" }} aria-hidden>
      <svg width="8" height="5" viewBox="0 0 8 5" style={{ opacity: active && dir === "asc" ? 1 : 0.35 }}>
        <path d="M4 0L7.5 4.5H0.5L4 0z" fill="currentColor" />
      </svg>
      <svg width="8" height="5" viewBox="0 0 8 5" style={{ opacity: active && dir === "desc" ? 1 : 0.35, marginTop: 1 }}>
        <path d="M4 5L0.5 0.5H7.5L4 5z" fill="currentColor" />
      </svg>
    </span>
  );
}

function CreatorsPayoutTable({
  creators,
  lang,
  isMobile,
  onSelectCreator,
}: {
  creators: PayoutTableCreator[];
  lang: "en" | "fr";
  isMobile?: boolean;
  onSelectCreator: (creator: PayoutTableCreator) => void;
}) {
  const [sort, setSort] = useState<{ key: PayoutTableSortKey; dir: "asc" | "desc" }>({
    key: "balance",
    dir: "desc",
  });

  const thStyle: React.CSSProperties = {
    padding: "20px 22px",
    fontSize: 15,
    fontWeight: 600,
    color: "#1A1A1A",
    textAlign: "left",
    borderBottom: "1px solid #EFEFEF",
    background: "#FFFFFF",
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
  };

  const tdStyle: React.CSSProperties = {
    padding: "20px 22px",
    fontSize: 16,
    color: "#1A1A1A",
    borderBottom: "1px solid #F5F5F5",
    verticalAlign: "middle",
  };

  const toggleSort = (key: PayoutTableSortKey) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "balance" ? "desc" : "asc" },
    );
  };

  const sortedCreators = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...creators].sort((a, b) => {
      if (sort.key === "name") {
        const aName = String(a.full_name || a.handle || a.username || "").toLowerCase();
        const bName = String(b.full_name || b.handle || b.username || "").toLowerCase();
        return aName.localeCompare(bName) * dir;
      }
      if (sort.key === "balance") {
        return ((Number(a.balance) || 0) - (Number(b.balance) || 0)) * dir;
      }
      if (sort.key === "payment") {
        return paymentMethodLabel(a, lang).localeCompare(paymentMethodLabel(b, lang)) * dir;
      }
      if (sort.key === "earned") {
        return ((Number(a.total_earned) || 0) - (Number(b.total_earned) || 0)) * dir;
      }
      return ((Number(a.total_sales) || 0) - (Number(b.total_sales) || 0)) * dir;
    });
  }, [creators, sort, lang]);

  const columns: { key: PayoutTableSortKey; label: string }[] = [
    { key: "name", label: lang === "fr" ? "Créateur" : "Creator" },
    { key: "balance", label: lang === "fr" ? "Montant dû" : "Amount owed" },
    { key: "payment", label: lang === "fr" ? "Type de paiement" : "Payment type" },
    { key: "earned", label: lang === "fr" ? "Total gagné" : "Total earned" },
    { key: "sales", label: lang === "fr" ? "Ventes" : "Sales" },
  ];

  return (
    <div style={{ border: "1px solid #EFEFEF", borderRadius: 16, overflow: "auto", marginBottom: 36 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 720 : undefined }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={thStyle} onClick={() => toggleSort(col.key)}>
                {col.label}
                <PayoutSortArrows active={sort.key === col.key} dir={sort.dir} />
              </th>
            ))}
            <th style={{ ...thStyle, cursor: "default", width: 56 }}>{lang === "fr" ? "Actions" : "Actions"}</th>
          </tr>
        </thead>
        <tbody>
          {sortedCreators.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} style={{ ...tdStyle, textAlign: "center", color: "#9A9A9A", padding: 48 }}>
                {lang === "fr" ? "Aucun créateur pour le moment." : "No creators yet."}
              </td>
            </tr>
          ) : (
            sortedCreators.map((creator) => {
              const name = creator.full_name || creator.handle || creator.username || "Creator";
              const handle = creator.handle || creator.username || "";
              const balance = Number(creator.balance) || 0;
              const methodLabel = paymentMethodLabel(creator, lang);

              return (
                <tr
                  key={creator.id}
                  onClick={() => onSelectCreator(creator)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#FAFAFA";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#FFFFFF";
                  }}
                >
                  <td style={{ ...tdStyle, fontWeight: 500 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <CreatorAvatar src={creator.avatar_url} username={creator.handle} displayName={name} size={40} alt={name} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 500, letterSpacing: "-0.02em" }}>{name}</div>
                        {handle && (
                          <div style={{ fontSize: 14, color: "#9A9A9A", letterSpacing: "-0.01em", marginTop: 2 }}>
                            @{String(handle).replace(/^@/, "")}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: "#1A1A1A" }}>
                    {formatCurrency(balance, lang)}
                  </td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#1A1A1A",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {methodLabel}
                    </span>
                  </td>
                  <td style={tdStyle}>{formatCurrency(Number(creator.total_earned) || 0, lang)}</td>
                  <td style={tdStyle}>{creator.total_sales ?? 0}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                    {balance > 0 && (
                      <button
                        type="button"
                        aria-label={lang === "fr" ? `Payer ${name}` : `Pay ${name}`}
                        onClick={() => onSelectCreator(creator)}
                        style={{
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          padding: 6,
                          color: "#1A1A1A",
                        }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

type PayoutOverviewStats = {
  totalOwed: number;
  pendingCreators: number;
  readyToPay: number;
  missingPaymentDetails: number;
  totalCommissionsEarned: number;
  totalTrackedSales: number;
  totalPaid: number;
  completedPaymentsCount: number;
  timeline: CommissionDayBucket[];
  breakdown: {
    earned: number;
    paid: number;
    pending: number;
  };
};

type CommissionDayBucket = {
  dateKey: string;
  earned: number;
  paid: number;
};

function dayKeyFromIso(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildCommissionTimeline(
  sales: TrackedSale[],
  completedPayouts: CompletedPayout[],
  dayCount = 30,
): CommissionDayBucket[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const buckets: CommissionDayBucket[] = [];
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.push({
      dateKey: dayKeyFromIso(d.toISOString()) ?? "",
      earned: 0,
      paid: 0,
    });
  }

  const byDay = new Map(buckets.map((bucket) => [bucket.dateKey, bucket]));

  for (const sale of sales) {
    const key = dayKeyFromIso(sale.created_at);
    const bucket = key ? byDay.get(key) : undefined;
    if (bucket) bucket.earned = round2(bucket.earned + (Number(sale.commission_amount) || 0));
  }

  for (const payout of completedPayouts) {
    const key = dayKeyFromIso(payout.paid_at || payout.created_at);
    const bucket = key ? byDay.get(key) : undefined;
    if (bucket) bucket.paid = round2(bucket.paid + (Number(payout.amount) || 0));
  }

  return buckets;
}

type PayoutOverviewPeriod = "today" | "7d" | "30d" | "all";

const PAYOUT_OVERVIEW_PERIODS: PayoutOverviewPeriod[] = ["today", "7d", "30d", "all"];

function payoutOverviewPeriodLabel(period: PayoutOverviewPeriod, lang: "en" | "fr") {
  if (period === "today") return lang === "fr" ? "Aujourd'hui" : "Today";
  if (period === "7d") return lang === "fr" ? "7 derniers jours" : "Last 7 days";
  if (period === "30d") return lang === "fr" ? "30 derniers jours" : "Last 30 days";
  return lang === "fr" ? "Globalité" : "All time";
}

function saleDayKey(sale: TrackedSale) {
  return dayKeyFromIso(sale.created_at);
}

function isSaleInPeriod(sale: TrackedSale, period: PayoutOverviewPeriod) {
  const key = saleDayKey(sale);
  if (!key) return false;
  if (period === "all") return true;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const saleDate = new Date(`${key}T12:00:00`);
  if (Number.isNaN(saleDate.getTime())) return false;

  if (period === "today") return key === dayKeyFromIso(today.toISOString());

  const dayCount = period === "7d" ? 7 : 30;
  const start = new Date(today);
  start.setDate(start.getDate() - (dayCount - 1));
  return saleDate >= start && saleDate <= today;
}

function countSalesInPeriod(sales: TrackedSale[], period: PayoutOverviewPeriod) {
  return sales.filter((sale) => isSaleInPeriod(sale, period)).length;
}

function sumCommissionsInPeriod(sales: TrackedSale[], period: PayoutOverviewPeriod) {
  return round2(
    sales
      .filter((sale) => isSaleInPeriod(sale, period))
      .reduce((sum, sale) => sum + (Number(sale.commission_amount) || 0), 0),
  );
}

function allTimeDayCount(sales: TrackedSale[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let earliest: Date | null = null;

  for (const sale of sales) {
    const key = saleDayKey(sale);
    if (!key) continue;
    const d = new Date(`${key}T12:00:00`);
    if (Number.isNaN(d.getTime())) continue;
    if (!earliest || d < earliest) earliest = d;
  }

  if (!earliest) return 30;
  const span = Math.ceil((today.getTime() - earliest.getTime()) / 86400000) + 1;
  return Math.min(90, Math.max(7, span));
}

function buildTodayHourlyTimeline(
  sales: TrackedSale[],
  completedPayouts: CompletedPayout[],
): CommissionDayBucket[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dayKeyFromIso(today.toISOString()) ?? "";

  const buckets: CommissionDayBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    dateKey: `${todayKey}T${String(hour).padStart(2, "0")}`,
    earned: 0,
    paid: 0,
  }));

  for (const sale of sales) {
    const key = saleDayKey(sale);
    if (key !== todayKey) continue;
    const hour = new Date(sale.created_at).getHours();
    if (hour >= 0 && hour < 24) {
      buckets[hour].earned = round2(buckets[hour].earned + (Number(sale.commission_amount) || 0));
    }
  }

  for (const payout of completedPayouts) {
    const key = dayKeyFromIso(payout.paid_at || payout.created_at);
    if (key !== todayKey) continue;
    const hour = new Date(payout.paid_at || payout.created_at || "").getHours();
    if (hour >= 0 && hour < 24) {
      buckets[hour].paid = round2(buckets[hour].paid + (Number(payout.amount) || 0));
    }
  }

  return buckets;
}

function buildOverviewTimeline(
  sales: TrackedSale[],
  completedPayouts: CompletedPayout[],
  period: PayoutOverviewPeriod,
): CommissionDayBucket[] {
  if (period === "today") return buildTodayHourlyTimeline(sales, completedPayouts);
  if (period === "7d") return buildCommissionTimeline(sales, completedPayouts, 7);
  if (period === "30d") return buildCommissionTimeline(sales, completedPayouts, 30);
  return buildCommissionTimeline(sales, completedPayouts, allTimeDayCount(sales));
}

function formatTimelineAxisLabel(dateKey: string, lang: "en" | "fr", period: PayoutOverviewPeriod) {
  if (!dateKey) return "—";
  if (period === "today" && dateKey.includes("T")) {
    const hour = Number(dateKey.split("T")[1]);
    if (!Number.isFinite(hour)) return dateKey;
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    return d.toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-US", { hour: "numeric", minute: "2-digit" });
  }
  return formatTimelineDayLabel(dateKey, lang);
}

function PayoutOverviewPeriodSelect({
  value,
  onChange,
  lang,
}: {
  value: PayoutOverviewPeriod;
  onChange: (period: PayoutOverviewPeriod) => void;
  lang: "en" | "fr";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          padding: 0,
          fontSize: 13,
          color: "#6B7280",
          letterSpacing: "-0.01em",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {payoutOverviewPeriodLabel(value, lang)}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="#6B7280" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            minWidth: 180,
            background: "#FFFFFF",
            border: "1px solid #EFEFEF",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
            padding: 6,
            zIndex: 40,
          }}
        >
          {PAYOUT_OVERVIEW_PERIODS.map((period) => {
            const active = period === value;
            return (
              <button
                key={period}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(period);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: active ? "#F5F5F5" : "transparent",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 10px",
                  fontSize: 13,
                  color: "#1A1A1A",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "-0.01em",
                }}
              >
                {payoutOverviewPeriodLabel(period, lang)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTimelineDayLabel(dateKey: string, lang: "en" | "fr") {
  if (!dateKey) return "—";
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "short" });
}

function computePayoutOverviewStats(
  creators: PayoutTableCreator[],
  completedPayouts: CompletedPayout[],
  sales: TrackedSale[] = [],
): PayoutOverviewStats {
  const pending = creators.filter((c) => (Number(c.balance) || 0) > 0);
  const totalOwed = pending.reduce((sum, c) => sum + (Number(c.balance) || 0), 0);
  const readyToPay = pending.filter((c) => creatorHasPayoutDetails(c)).length;
  const missingPaymentDetails = pending.length - readyToPay;
  const totalCommissionsEarned = creators.reduce((sum, c) => sum + (Number(c.total_earned) || 0), 0);
  const totalTrackedSales = creators.reduce((sum, c) => sum + (Number(c.total_sales) || 0), 0);
  const totalPaid = completedPayouts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const timeline = buildCommissionTimeline(sales, completedPayouts);

  return {
    totalOwed,
    pendingCreators: pending.length,
    readyToPay,
    missingPaymentDetails,
    totalCommissionsEarned,
    totalTrackedSales,
    totalPaid,
    completedPaymentsCount: completedPayouts.length,
    timeline,
    breakdown: {
      earned: totalCommissionsEarned,
      paid: totalPaid,
      pending: totalOwed,
    },
  };
}

function buildCumulativeValues(buckets: CommissionDayBucket[]) {
  let sum = 0;
  return buckets.map((bucket) => {
    sum = round2(sum + bucket.earned);
    return sum;
  });
}

/** Straight segments only — readable, no exaggerated curves. */
function buildLinePath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}

function chartAxisIndices(count: number): number[] {
  if (count <= 1) return [0];
  if (count <= 4) return Array.from({ length: count }, (_, i) => i);
  const ticks = Math.min(5, count);
  const indices = new Set<number>([0, count - 1]);
  for (let i = 1; i < ticks - 1; i++) {
    indices.add(Math.round((i / (ticks - 1)) * (count - 1)));
  }
  return [...indices].sort((a, b) => a - b);
}

const PAYOUT_CHART_BLUE = "#0047FF";

function PayoutCommissionChart({
  buckets,
  lang,
  isMobile,
  period,
}: {
  buckets: CommissionDayBucket[];
  lang: "en" | "fr";
  isMobile?: boolean;
  period: PayoutOverviewPeriod;
}) {
  const cumulative = useMemo(() => buildCumulativeValues(buckets), [buckets]);
  const chartW = 640;
  const chartH = 120;
  const padX = 12;
  const padY = 14;
  const innerW = chartW - padX * 2;
  const innerH = chartH - padY * 2;
  const maxY = Math.max(...cumulative, 0.01);
  const baselineY = padY + innerH;

  const points = cumulative.map((value, index) => ({
    x: padX + (index / Math.max(buckets.length - 1, 1)) * innerW,
    y: padY + innerH - (value / maxY) * innerH,
  }));

  const linePath = buildLinePath(points);
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${baselineY} L ${points[0].x.toFixed(2)} ${baselineY} Z`
      : "";
  const flatLine = `M ${padX} ${baselineY} L ${padX + innerW} ${baselineY}`;
  const hasActivity = cumulative.some((value, index) => value > 0 || buckets[index]?.earned > 0);
  const axisIndices = chartAxisIndices(buckets.length);

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <svg
        viewBox={`0 0 ${chartW} ${chartH}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={lang === "fr" ? "Évolution cumulative des commissions" : "Cumulative commission trend"}
        style={{ width: "100%", height: isMobile ? 100 : 128, display: "block" }}
      >
        <defs>
          <linearGradient id="payoutCommissionFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PAYOUT_CHART_BLUE} stopOpacity="0.1" />
            <stop offset="100%" stopColor={PAYOUT_CHART_BLUE} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Light baseline */}
        <line
          x1={padX}
          y1={baselineY}
          x2={padX + innerW}
          y2={baselineY}
          stroke="#EFEFEF"
          strokeWidth="1"
        />
        {!hasActivity ? (
          <path d={flatLine} fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeDasharray="4 4" />
        ) : (
          <>
            <path d={areaPath} fill="url(#payoutCommissionFill)" />
            <path
              d={linePath}
              fill="none"
              stroke={PAYOUT_CHART_BLUE}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {points.map((p, i) => (
              <circle
                key={`pt-${buckets[i]?.dateKey ?? i}`}
                cx={p.x}
                cy={p.y}
                r={buckets.length > 20 ? 2.5 : 3.5}
                fill="#FFFFFF"
                stroke={PAYOUT_CHART_BLUE}
                strokeWidth="1.75"
              />
            ))}
          </>
        )}
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          fontSize: 11,
          color: "#9A9A9A",
          letterSpacing: "-0.01em",
          marginTop: 10,
        }}
      >
        {axisIndices.map((idx) => (
          <span key={`axis-${buckets[idx]?.dateKey ?? idx}`} style={{ flex: 1, textAlign: idx === 0 ? "left" : idx === buckets.length - 1 ? "right" : "center" }}>
            {formatTimelineAxisLabel(buckets[idx]?.dateKey ?? "", lang, period)}
          </span>
        ))}
      </div>
    </div>
  );
}

function StripeOverviewSideMetric({
  label,
  value,
  hint,
  hintColor,
  showDivider = true,
}: {
  label: string;
  value: string;
  hint?: string;
  hintColor?: string;
  showDivider?: boolean;
}) {
  return (
    <div style={{ paddingBottom: showDivider ? 24 : 0, marginBottom: showDivider ? 24 : 0, borderBottom: showDivider ? "1px solid #EFEFEF" : "none" }}>
      <div style={{ fontSize: 13, color: "#6B7280", letterSpacing: "-0.01em", marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", lineHeight: 1.05 }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: hintColor ?? "#1A1A1A", letterSpacing: "-0.01em", lineHeight: 1.45, marginTop: 8 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function PayoutOverviewMetric({
  label,
  value,
  hint,
  hintColor,
  large,
}: {
  label: string;
  value: string;
  hint?: string;
  hintColor?: string;
  large?: boolean;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13, color: "#6B7280", letterSpacing: "-0.01em", marginBottom: 12 }}>{label}</div>
      <div
        style={{
          fontSize: large ? 36 : 30,
          fontWeight: 600,
          color: "#1A1A1A",
          letterSpacing: "-0.04em",
          lineHeight: 1.05,
          marginBottom: hint ? 10 : 0,
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: hintColor ?? "#9A9A9A", letterSpacing: "-0.01em", lineHeight: 1.45 }}>{hint}</div>
      )}
    </div>
  );
}

function PayoutsOverviewPanel({
  stats,
  sales,
  completedPayouts,
  lang,
  isMobile,
}: {
  stats: PayoutOverviewStats;
  sales: TrackedSale[];
  completedPayouts: CompletedPayout[];
  lang: "en" | "fr";
  isMobile?: boolean;
}) {
  const [period, setPeriod] = useState<PayoutOverviewPeriod>("30d");

  const timeline = useMemo(
    () => buildOverviewTimeline(sales, completedPayouts, period),
    [sales, completedPayouts, period],
  );

  const periodCommission = useMemo(() => {
    if (period === "all") return stats.totalCommissionsEarned;
    return sumCommissionsInPeriod(sales, period);
  }, [period, sales, stats.totalCommissionsEarned]);

  const periodSalesCount = useMemo(() => {
    if (period === "all") return stats.totalTrackedSales;
    return countSalesInPeriod(sales, period);
  }, [period, sales, stats.totalTrackedSales]);

  const commissionsLabel =
    period === "all"
      ? lang === "fr"
        ? "Commissions totales"
        : "Total commissions"
      : lang === "fr"
        ? "Commissions générées"
        : "Commissions earned";

  const commissionsSub =
    periodSalesCount === 0
      ? period === "today"
        ? lang === "fr"
          ? "Aucune commission aujourd'hui"
          : "No commissions today"
        : lang === "fr"
          ? "Aucune vente sur cette période"
          : "No sales in this period"
      : period === "all"
        ? lang === "fr"
          ? `${periodSalesCount} vente${periodSalesCount > 1 ? "s" : ""} trackée${periodSalesCount > 1 ? "s" : ""}`
          : `${periodSalesCount} tracked sale${periodSalesCount > 1 ? "s" : ""}`
        : lang === "fr"
          ? `${periodSalesCount} vente${periodSalesCount > 1 ? "s" : ""} sur la période`
          : `${periodSalesCount} sale${periodSalesCount > 1 ? "s" : ""} in period`;
  const pendingSub =
    stats.pendingCreators === 0
      ? lang === "fr"
        ? "Tous les soldes sont à jour"
        : "All balances are settled"
      : lang === "fr"
        ? `${stats.pendingCreators} créateur${stats.pendingCreators > 1 ? "s" : ""} en attente`
        : `${stats.pendingCreators} creator${stats.pendingCreators > 1 ? "s" : ""} pending`;

  const readySub =
    stats.pendingCreators === 0
      ? lang === "fr"
        ? "Aucun paiement en attente"
        : "No payouts pending"
      : stats.missingPaymentDetails === 0
        ? lang === "fr"
          ? `${stats.readyToPay} prêt${stats.readyToPay > 1 ? "s" : ""} à payer`
          : `${stats.readyToPay} ready to pay`
        : lang === "fr"
          ? `${stats.readyToPay} prêt${stats.readyToPay > 1 ? "s" : ""} · ${stats.missingPaymentDetails} sans coordonnées`
          : `${stats.readyToPay} ready · ${stats.missingPaymentDetails} missing details`;

  const paidSub =
    stats.completedPaymentsCount === 0
      ? lang === "fr"
        ? "Aucun paiement enregistré"
        : "No payments recorded yet"
      : lang === "fr"
        ? `${stats.completedPaymentsCount} paiement${stats.completedPaymentsCount > 1 ? "s" : ""} effectué${stats.completedPaymentsCount > 1 ? "s" : ""}`
        : `${stats.completedPaymentsCount} payment${stats.completedPaymentsCount > 1 ? "s" : ""} completed`;

  return (
    <div
      style={{
        marginBottom: isMobile ? 56 : 72,
        paddingBottom: isMobile ? 32 : 40,
        borderBottom: "1px solid #EFEFEF",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 220px",
          gap: isMobile ? 32 : 48,
          alignItems: "stretch",
        }}
      >
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 24,
              flexWrap: "wrap",
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 13, color: "#6B7280", letterSpacing: "-0.01em" }}>
              {commissionsLabel}
            </div>
            <PayoutOverviewPeriodSelect value={period} onChange={setPeriod} lang={lang} />
          </div>

          <div style={{ marginBottom: 4 }}>
            <div
              style={{
                fontSize: isMobile ? 32 : 36,
                fontWeight: 600,
                color: "#1A1A1A",
                letterSpacing: "-0.04em",
                lineHeight: 1.05,
              }}
            >
              {formatCurrency(periodCommission, lang)}
            </div>
            <div style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginTop: 8 }}>
              {commissionsSub}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: isMobile ? 88 : 112, marginTop: 8 }}>
            <PayoutCommissionChart buckets={timeline} lang={lang} isMobile={isMobile} period={period} />
          </div>
        </div>

        <div
          style={{
            borderTop: isMobile ? "1px solid #EFEFEF" : "none",
            borderLeft: isMobile ? "none" : "1px solid #EFEFEF",
            paddingTop: isMobile ? 28 : 0,
            paddingLeft: isMobile ? 0 : 32,
            minWidth: 0,
          }}
        >
          <StripeOverviewSideMetric
            label={lang === "fr" ? "À verser" : "Amount owed"}
            value={formatCurrency(stats.totalOwed, lang)}
            hint={pendingSub}
          />
          <StripeOverviewSideMetric
            label={lang === "fr" ? "Déjà versé" : "Already paid"}
            value={formatCurrency(stats.totalPaid, lang)}
            hint={paidSub}
            showDivider={false}
          />
          <div style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", lineHeight: 1.45, marginTop: 4 }}>
            {readySub}
          </div>
        </div>
      </div>
    </div>
  );
}

function PayoutsPageHeader({
  title,
  subtitle,
  isMobile,
  trailing,
}: {
  title: string;
  subtitle?: string;
  isMobile?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <div style={{ paddingTop: isMobile ? 56 : 40, paddingRight: isMobile ? 16 : 40, paddingBottom: isMobile ? 12 : 16, paddingLeft: isMobile ? 16 : 40, background: "#FFFFFF" }}>
      <div
        style={{
          display: "flex",
          alignItems: trailing && isMobile ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: isMobile ? 26 : 34, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0, marginBottom: subtitle ? 6 : 0 }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 15, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0 }}>{subtitle}</p>}
        </div>
        {trailing}
      </div>
    </div>
  );
}

function PayoutsToggle({ on }: { on: boolean }) {
  return (
    <div style={{ position: "relative", width: 40, height: 22, background: on ? "#0047FF" : "#E5E5E5", borderRadius: 999, cursor: "pointer", transition: "background 0.2s" }}>
      <div style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, background: "#FFFFFF", borderRadius: "50%", transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }} />
    </div>
  );
}

const payoutPagePrimaryBtn: React.CSSProperties = {
  background: "#0047FF",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 10,
  padding: "12px 20px",
  fontSize: 15,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const payoutPageSecondaryBtn: React.CSSProperties = {
  background: "#FFFFFF",
  color: "#1A1A1A",
  border: "1px solid #E5E5E5",
  borderRadius: 10,
  padding: "12px 20px",
  fontSize: 15,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const payoutDrawerFont = "'InterDisplay', 'Inter Display', sans-serif";

const payoutDrawerAction: React.CSSProperties = {
  fontFamily: payoutDrawerFont,
  letterSpacing: "-0.02em",
  fontSize: 13,
  borderRadius: 8,
};

const payoutDrawerBtnPrimary: React.CSSProperties = {
  ...payoutDrawerAction,
  fontWeight: 600,
  color: "#FFF",
  background: "#1A1A1A",
  border: "none",
  padding: "10px 14px",
  cursor: "pointer",
};

const payoutDrawerBtnSecondary: React.CSSProperties = {
  ...payoutDrawerAction,
  fontWeight: 500,
  color: "#1A1A1A",
  background: "#FFF",
  border: "1px solid #E5E5E5",
  padding: "10px 14px",
  cursor: "pointer",
};

function CreatorPayoutPage({
  creator,
  lang,
  payingId,
  registeringId,
  payoutFieldsRef,
  salesRevenue = 0,
  onCreatorChange,
  onClose,
  onPayManual,
  onPayStripe,
  onConnectStripeBank,
}: {
  creator: PayoutTableCreator & { stripe_account_id?: string | null; email?: string | null; total_earned?: number; total_sales?: number };
  lang: "en" | "fr";
  isMobile?: boolean;
  plan: PlanTier;
  userId?: string;
  payingId: string | null;
  registeringId: string | null;
  payoutFieldsRef: React.RefObject<CreatorPayoutMethodFieldsHandle | null>;
  /** Sum of order amounts generated by this creator (brand revenue). */
  salesRevenue?: number;
  onCreatorChange: (next: PayoutTableCreator) => void;
  onClose: () => void;
  onPayManual: () => void | Promise<void>;
  onPayStripe: () => void | Promise<void>;
  onConnectStripeBank: () => void | Promise<void>;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const name = creator.full_name || creator.handle || creator.username || "Creator";
  const handle = creator.handle || creator.username || "";
  const balance = Number(creator.balance) || 0;
  const totalEarned = Number(creator.total_earned) || 0;
  const platform = salePlatformFromCreator(creator.platform);
  const followers = Number(creator.followers) || 0;
  const engagement = Number(creator.engagement_rate) || 0;
  const discountCode = creator.discount_code?.trim() || null;
  const email = creator.email?.trim() || null;
  const canPayManual = balance > 0 && creatorHasPaymentMethod(creator) && payingId !== creator.id;

  // Brand revenue (sales) vs cost (commissions earned = paid + still owed).
  const costToBrand = totalEarned;
  const revenue = Number(salesRevenue) || 0;
  const hasProfitSignal = revenue > 0 || costToBrand > 0;
  const isProfitable = hasProfitSignal && revenue > costToBrand;

  const sectionTitle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 600,
    color: "#1A1A1A",
    marginBottom: 14,
    letterSpacing: "-0.02em",
  };

  const statBox: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    border: "1px solid #EFEFEF",
    borderRadius: 12,
    padding: "16px 18px",
    background: "#FFF",
  };

  const pillBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: 20,
    letterSpacing: "-0.01em",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 1100,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          height: "100%",
          background: "#FFF",
          overflowY: "auto",
          transform: shown ? "translateX(0)" : "translateX(40px)",
          opacity: shown ? 1 : 0,
          transition: "transform .18s ease, opacity .18s ease",
          padding: "28px 28px 56px",
          boxSizing: "border-box",
          fontFamily: payoutDrawerFont,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              ...payoutDrawerAction,
              background: "none",
              border: "none",
              color: "#9A9A9A",
              fontWeight: 500,
              fontSize: 14,
              cursor: "pointer",
              padding: 0,
            }}
          >
            {lang === "fr" ? "Retour" : "Back"}
          </button>
          <button
            type="button"
            disabled={!canPayManual}
            onClick={() => void onPayManual()}
            style={{
              ...payoutDrawerBtnPrimary,
              fontSize: 14,
              padding: "11px 16px",
              opacity: canPayManual ? 1 : 0.45,
              cursor: canPayManual ? "pointer" : "default",
            }}
          >
            {payingId === creator.id
              ? lang === "fr"
                ? "Paiement…"
                : "Paying…"
              : balance > 0
                ? `${lang === "fr" ? "Payer" : "Pay"} ${formatCurrency(balance, lang)}`
                : lang === "fr"
                  ? "Payer"
                  : "Pay"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 32 }}>
          <CreatorAvatar
            src={creator.avatar_url}
            username={creator.handle}
            displayName={name}
            size={64}
            alt={name}
            priority
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {name}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {handle && <span style={{ fontSize: 14, color: "#9A9A9A" }}>@{String(handle).replace(/^@/, "")}</span>}
              <span
                style={{
                  ...pillBase,
                  fontWeight: 500,
                  color: "#1A1A1A",
                  background: "#F5F5F5",
                }}
              >
                <SalePlatformLogo platform={platform} />
                {platformLabel(platform)}
              </span>
              {discountCode && (
                <span
                  style={{
                    ...pillBase,
                    fontWeight: 500,
                    color: "#1A1A1A",
                    background: "#F5F5F5",
                  }}
                >
                  {lang === "fr" ? "Code" : "Code"} · {discountCode}
                </span>
              )}
              {hasProfitSignal && (
                <span
                  style={{
                    ...pillBase,
                    color: isProfitable ? "#166534" : "#991B1B",
                    background: isProfitable ? "#DCFCE7" : "#FEE2E2",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      display: "inline-block",
                      width: 13,
                      height: 12,
                      flexShrink: 0,
                      backgroundColor: "currentColor",
                      WebkitMaskImage: "url(/images/trackit-mark.svg)",
                      WebkitMaskSize: "contain",
                      WebkitMaskRepeat: "no-repeat",
                      WebkitMaskPosition: "center",
                      maskImage: "url(/images/trackit-mark.svg)",
                      maskSize: "contain",
                      maskRepeat: "no-repeat",
                      maskPosition: "center",
                    }}
                  />
                  {isProfitable
                    ? lang === "fr"
                      ? "Rentable"
                      : "Profitable"
                    : lang === "fr"
                      ? "Non rentable"
                      : "Not profitable"}
                </span>
              )}
            </div>
            {(followers > 0 || engagement > 0) && (
              <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 13, color: "#9A9A9A", letterSpacing: "-0.01em" }}>
                {followers > 0 && (
                  <span>
                    {fmtFollowerCount(followers)} {lang === "fr" ? "abonnés" : "followers"}
                  </span>
                )}
                {engagement > 0 && <span>{engagement.toFixed(1)}% ER</span>}
              </div>
            )}
            {email && (
              <div style={{ fontSize: 13, color: "#9A9A9A", marginTop: 8, letterSpacing: "-0.01em" }}>{email}</div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
          <div style={statBox}>
            <div style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 8 }}>
              {lang === "fr" ? "Solde à payer" : "Balance owed"}
            </div>
            <div style={{ fontSize: 24, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em" }}>
              {formatCurrency(balance, lang)}
            </div>
          </div>
          <div style={statBox}>
            <div style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 8 }}>
              {lang === "fr" ? "Total gagné" : "Total earned"}
            </div>
            <div style={{ fontSize: 24, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em" }}>
              {formatCurrency(totalEarned, lang)}
            </div>
          </div>
          <div style={statBox}>
            <div style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 8 }}>
              {lang === "fr" ? "Ventes" : "Sales"}
            </div>
            <div style={{ fontSize: 24, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em" }}>
              {creator.total_sales || 0}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 32 }}>
          <div style={sectionTitle}>
            {lang === "fr" ? "Méthode de paiement actuelle" : "Current payment method"}
          </div>
          {creatorHasPaymentMethod(creator) ? (
            <p style={{ margin: 0, fontSize: 15, color: "#1A1A1A", letterSpacing: "-0.01em", lineHeight: 1.55 }}>
              <span style={{ fontWeight: 600 }}>{paymentMethodLabel(creator, lang)}</span>
              <span style={{ color: "#9A9A9A" }}> · </span>
              <span style={{ wordBreak: "break-all", color: "#7A7A7A" }}>
                {creator.paypal_link || creator.revolut_link || creator.iban}
              </span>
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 15, color: "#9A9A9A", letterSpacing: "-0.01em", lineHeight: 1.55 }}>
              {lang === "fr"
                ? "Aucun moyen de paiement renseigné. Ajoutez PayPal, Revolut ou IBAN ci-dessous."
                : "No payment method on file. Add PayPal, Revolut, or IBAN below."}
            </p>
          )}
        </div>

        <div style={{ marginBottom: 36 }}>
          <div style={sectionTitle}>
            {lang === "fr" ? "Coordonnées de paiement" : "Payment details"}
          </div>
          <CreatorPayoutMethodFields
            ref={payoutFieldsRef}
            creator={creator}
            lang={lang}
            size="default"
            onUpdate={onCreatorChange}
            onDraftChange={onCreatorChange}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {creator.stripe_account_id ? (
            <button
              type="button"
              disabled={balance <= 0 || payingId === creator.id}
              onClick={() => void onPayStripe()}
              style={{
                ...payoutDrawerBtnPrimary,
                width: "100%",
                fontSize: 14,
                padding: "12px 16px",
                opacity: balance > 0 ? 1 : 0.45,
                cursor: balance > 0 ? "pointer" : "default",
              }}
            >
              {payingId === creator.id
                ? lang === "fr"
                  ? "Virement en cours…"
                  : "Sending transfer…"
                : `${lang === "fr" ? "Payer par virement Stripe" : "Pay via Stripe transfer"} · ${formatCurrency(balance, lang)}`}
            </button>
          ) : (
            <button
              type="button"
              disabled={registeringId === creator.id}
              onClick={() => void onConnectStripeBank()}
              style={{
                ...payoutDrawerBtnSecondary,
                width: "100%",
                fontSize: 14,
                padding: "12px 16px",
              }}
            >
              {registeringId === creator.id
                ? lang === "fr"
                  ? "Ouverture…"
                  : "Opening…"
                : lang === "fr"
                  ? "Connecter un compte bancaire (Stripe)"
                  : "Connect bank account (Stripe)"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const payoutsBtnPrimary: React.CSSProperties = {
  background: "#0047FF",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const payoutsBtnSecondary: React.CSSProperties = {
  background: "#FFFFFF",
  color: "#1A1A1A",
  border: "1px solid #E5E5E5",
  borderRadius: 10,
  padding: "10px 16px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

export function PayoutsView({
  plan,
  onUpgrade,
  onUpgradePro,
  onUpgradeScale,
  isMobile,
  userId,
  isCreator,
  shopifyStore,
  onConnectShopify,
}: {
  plan: PlanTier;
  onUpgrade: () => void;
  onUpgradePro?: () => void;
  onUpgradeScale?: () => void;
  isMobile?: boolean;
  userId?: string;
  isCreator?: boolean;
  shopifyStore?: string | null;
  onConnectShopify?: () => void;
}) {
  const lang = useLang();
  const { navState, navigate } = useDashboardNavigation();
  const { loading: payItWelcomeLoading, showWelcome: showPayItWelcome } = usePayItActivity(userId);
  const [payItWelcomeBypass, setPayItWelcomeBypass] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<GateFeatureKey | null>(null);
  const payoutCreatorId =
    navState.view === "payouts" && navState.payout?.type === "creator" ? navState.payout.id : null;
  const [creators, setCreators] = useState<any[]>([]);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [confirmPay, setConfirmPay] = useState<{ creatorId: string; name: string; amount: number; method: string } | null>(null);
  const pendingConfirmRef = useRef<{ creatorId: string; name: string; amount: number; method: string } | null>(null);
  const paymentLeftTabRef = useRef(false);
  const pendingSinceRef = useRef(0);
  const [autoPayoutMonthly, setAutoPayoutMonthly] = useState(false);
  const [activeCreator, setActiveCreator] = useState<any>(null);
  const payoutFieldsRef = useRef<CreatorPayoutMethodFieldsHandle>(null);
  const [completedPayouts, setCompletedPayouts] = useState<CompletedPayout[]>([]);
  const [trackedSales, setTrackedSales] = useState<TrackedSale[]>([]);
  const [connectStatus, setConnectStatus] = useState<"none" | "pending" | "active">("none");
  const [connectLoading, setConnectLoading] = useState(false);

  // Check Stripe Connect status on mount + after returning from onboarding
  useEffect(() => {
    if (!userId) return;
    fetch("/api/stripe/connect/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
      .then((r) => r.json())
      .then((d) => { if (d?.status) setConnectStatus(d.status); })
      .catch(() => {});
  }, [userId]);

  const handleConnectStripe = async () => {
    if (!userId || connectLoading) return;
    setConnectLoading(true);
    try {
      let email: string | undefined;
      const { supabase } = await import("@/lib/supabase");
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        email = user?.email ?? undefined;
      }
      const res = await fetch("/api/stripe/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else { alert(data.error || "Could not start Stripe onboarding"); setConnectLoading(false); }
    } catch {
      setConnectLoading(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    import("@/lib/supabase").then(({ supabase }) => {
      if (!supabase) return;
      supabase.from("profiles").select("auto_payout_monthly").eq("id", userId).single()
        .then(({ data }) => {
          if (data?.auto_payout_monthly) setAutoPayoutMonthly(true);
        });
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/creators-list?userId=${userId}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setCreators(data); })
      .catch(console.error);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const reloadCreators = () => {
      fetch(`/api/creators-list?userId=${userId}`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setCreators(data);
        })
        .catch(console.error);
    };
    window.addEventListener(SALES_UPDATED_EVENT, reloadCreators);
    return () => window.removeEventListener(SALES_UPDATED_EVENT, reloadCreators);
  }, [userId]);

  useEffect(() => {
    if (!payoutCreatorId) {
      setActiveCreator(null);
      return;
    }
    const found = creators.find((c) => c.id === payoutCreatorId);
    if (found) setActiveCreator(found);
  }, [payoutCreatorId, creators]);

  useEffect(() => {
    if (!payoutCreatorId || creators.length === 0) return;
    if (!creators.some((c) => c.id === payoutCreatorId)) {
      navigate({ view: "payouts" }, { replace: true });
    }
  }, [payoutCreatorId, creators, navigate]);

  const openCreatorPayout = (creator: PayoutTableCreator) => {
    navigate({ view: "payouts", payout: { type: "creator", id: creator.id } });
  };

  const closeCreatorPayout = () => {
    navigate({ view: "payouts" }, { replace: true });
  };

  const loadCompletedPayouts = async () => {
    try {
      const res = await fetch("/api/payouts/history", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { payouts?: CompletedPayout[] };
      setCompletedPayouts(Array.isArray(data.payouts) ? data.payouts : []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!userId) return;
    void loadCompletedPayouts();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const loadSales = async () => {
      const rows = await fetchTrackedSales(userId);
      if (!cancelled) setTrackedSales(rows);
    };

    void loadSales();
    const onUpdate = () => void loadSales();
    window.addEventListener(SALES_UPDATED_EVENT, onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener(SALES_UPDATED_EVENT, onUpdate);
    };
  }, [userId]);

  useEffect(() => {
    const tryShowPaymentConfirm = () => {
      if (document.visibilityState === "hidden") {
        if (pendingConfirmRef.current) paymentLeftTabRef.current = true;
        return;
      }
      if (!pendingConfirmRef.current) return;

      const waitedLongEnough = Date.now() - pendingSinceRef.current >= 2000;
      if (!paymentLeftTabRef.current && !waitedLongEnough) return;

      setConfirmPay(pendingConfirmRef.current);
      pendingConfirmRef.current = null;
      paymentLeftTabRef.current = false;
    };

    document.addEventListener("visibilitychange", tryShowPaymentConfirm);
    window.addEventListener("focus", tryShowPaymentConfirm);
    return () => {
      document.removeEventListener("visibilitychange", tryShowPaymentConfirm);
      window.removeEventListener("focus", tryShowPaymentConfirm);
    };
  }, []);

  const activeCreatorSalesRevenue = useMemo(() => {
    if (!activeCreator?.id) return 0;
    return trackedSales
      .filter((s) => String(s.creator_id) === String(activeCreator.id))
      .reduce((sum, s) => sum + (Number(s.order_amount) || 0), 0);
  }, [activeCreator?.id, trackedSales]);

  const payoutOverviewStats = useMemo(
    () => computePayoutOverviewStats(creators, completedPayouts, trackedSales),
    [creators, completedPayouts, trackedSales],
  );

  const handleManualCreatorPay = (creator: (typeof creators)[number]) => {
    if (!canUseManualPayouts(plan as PlanTier)) {
      alert(lang === "fr" ? "Les paiements sont disponibles à partir du plan Growth." : "Payouts are available on the Growth plan and above.");
      return;
    }
    const amount = Number(creator.balance) || 0;
    if (amount <= 0) {
      alert(lang === "fr" ? "Solde insuffisant" : "No balance to pay");
      return;
    }

    const paypal = paypalUsername(String(creator.paypal_link || ""));
    const revolut = revolutUsername(String(creator.revolut_link || ""));
    const iban = String(creator.iban || "").trim();

    if (!paypal && !revolut && !iban) {
      return;
    }

    const payload = {
      creatorId: creator.id,
      name: creator.full_name || creator.handle || "creator",
      amount,
      method: paypal ? "paypal" : revolut ? "revolut" : "iban",
    };

    if (paypal) {
      pendingConfirmRef.current = payload;
      paymentLeftTabRef.current = false;
      pendingSinceRef.current = Date.now();
      window.open(`https://paypal.me/${paypal}/${amount}`, "_blank");
    } else if (revolut) {
      pendingConfirmRef.current = payload;
      paymentLeftTabRef.current = false;
      pendingSinceRef.current = Date.now();
      window.open(`https://revolut.me/${revolut}`, "_blank");
    } else if (iban) {
      navigator.clipboard.writeText(iban);
      alert(
        lang === "fr"
          ? `IBAN copié ✓\nMontant à virer : ${formatCurrency(amount, lang)}`
          : `IBAN copied ✓\nAmount to transfer: ${formatCurrency(amount, lang)}`,
      );
      setConfirmPay(payload);
    }

  };

  const paySelectedCreator = async () => {
    if (!activeCreator) return;
    const updated = (await payoutFieldsRef.current?.flushSave()) ?? activeCreator;
    setActiveCreator(updated);
    setCreators((list) => list.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
    if (!creatorHasPaymentMethod(updated)) return;
    handleManualCreatorPay(updated);
  };

  const confirmManualPayout = async () => {
    if (!confirmPay) return;
    const { creatorId, amount, method, name } = confirmPay;
    setConfirmPay(null);
    closeCreatorPayout();
    pendingConfirmRef.current = null;

    const res = await fetch("/api/payouts/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, creatorId, amount, method }),
    });
    const data = await res.json();
    if (data.ok) {
      notifyCreatorPaid(lang, name, amount, userId);
      setCreators((list) =>
        list.map((c) =>
          c.id === creatorId ? { ...c, balance: Math.max(0, Number(c.balance || 0) - amount) } : c
        )
      );
      void loadCompletedPayouts();
      dispatchPayoutsUpdated();
    } else {
      alert((lang === "fr" ? "Erreur : " : "Error: ") + (data.error || "unknown"));
    }
  };


  const confirmPayModal = confirmPay ? (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#FFFFFF", borderRadius: 20, padding: "32px 28px", maxWidth: 420, width: "100%", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://i.ibb.co/20jgns98/navbarlogotransparent.png"
          alt="Trackit"
          style={{ height: 96, width: "auto", display: "block", margin: "0 auto 20px", objectFit: "contain" }}
        />
        <h3 style={{ fontSize: 19, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px", letterSpacing: "-0.03em" }}>
          {lang === "fr" ? "Le virement a été effectué ?" : "Did you complete the transfer?"}
        </h3>
        <p style={{ fontSize: 14, color: "#7A7A7A", margin: "0 0 6px", lineHeight: 1.5 }}>
          {lang === "fr" ? "Virement de" : "Transfer of"}{" "}
          <strong style={{ color: "#1A1A1A" }}>{formatCurrency(confirmPay.amount, lang)}</strong>{" "}
          {lang === "fr" ? "à" : "to"}{" "}
          <strong style={{ color: "#1A1A1A" }}>{confirmPay.name}</strong>
        </p>
        <p style={{ fontSize: 13, color: "#9A9A9A", margin: "0 0 24px", lineHeight: 1.5 }}>
          {lang === "fr"
            ? "Si vous confirmez, le paiement est enregistré et le solde du créateur est remis à zéro."
            : "If you confirm, the payment is recorded and the creator's balance is reset."}
        </p>
        <button type="button" onClick={() => { primeNotificationSound(); void confirmManualPayout(); }} style={{ width: "100%", padding: "13px 0", background: "#1A1A1A", color: "#FFFFFF", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 10 }}>
          {lang === "fr" ? "Oui, virement effectué ✓" : "Yes, transfer completed ✓"}
        </button>
        <button type="button" onClick={() => { setConfirmPay(null); pendingConfirmRef.current = null; paymentLeftTabRef.current = false; }} style={{ width: "100%", padding: "13px 0", background: "#F5F5F5", color: "#1A1A1A", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
          {lang === "fr" ? "Non, pas encore" : "No, not yet"}
        </button>
      </div>
    </div>
  ) : null;

  if (isCreator) {
    return (
      <>
        <PayoutsPageHeader isMobile={isMobile} title={lang === "fr" ? "Paiements" : "Payouts"} subtitle={lang === "fr" ? "Vos commissions et vos coordonnées de virement" : "Your commissions and payout details"} />
        <CreatorPaymentInfo userId={userId} isMobile={isMobile} />
      </>
    );
  }

  if (payItWelcomeLoading) {
    return <PayItWelcomeLoading isMobile={isMobile} />;
  }

  if (showPayItWelcome && !payoutCreatorId && !payItWelcomeBypass) {
    return (
      <>
        {upgradeFeature && (
          <PaywallModal
            featureKey={upgradeFeature}
            lang={lang}
            onClose={() => setUpgradeFeature(null)}
            onUpgrade={onUpgrade}
            onUpgradePro={onUpgradePro}
            onUpgradeScale={onUpgradeScale}
          />
        )}
        <PayItWelcomeView
          isMobile={isMobile}
          variant="overview"
          onPrimary={() => {
            if (!canUseManualPayouts(plan)) {
              setUpgradeFeature("payouts");
              return;
            }
            setPayItWelcomeBypass(true);
          }}
        />
      </>
    );
  }

  const payoutDrawer = payoutCreatorId && activeCreator ? (
    <CreatorPayoutPage
      creator={activeCreator}
      lang={lang}
      isMobile={isMobile}
      plan={plan}
      userId={userId}
      payingId={payingId}
      registeringId={registeringId}
      payoutFieldsRef={payoutFieldsRef}
      salesRevenue={activeCreatorSalesRevenue}
      onCreatorChange={(next) => {
        setActiveCreator(next);
        setCreators((list) => list.map((c) => (c.id === next.id ? { ...c, ...next } : c)));
      }}
      onClose={closeCreatorPayout}
      onPayManual={() => void paySelectedCreator()}
      onPayStripe={async () => {
        if (!canUseManualPayouts(plan as PlanTier)) {
          alert(lang === "fr" ? "Les paiements sont disponibles à partir du plan Growth." : "Payouts are available on Growth plan and above.");
          return;
        }
        const amount = Number(activeCreator.balance) || 0;
        if (!amount || amount <= 0) return;
        primeNotificationSound();
        setPayingId(activeCreator.id);
        try {
          const res = await fetch("/api/payouts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, creatorId: activeCreator.id, amount }),
          });
          const data = await res.json();
          if (data.success) {
            notifyCreatorPaid(lang, activeCreator.full_name || activeCreator.handle || "creator", amount, userId);
            const r = await fetch(`/api/creators-list?userId=${userId}`);
            const list = await r.json();
            if (Array.isArray(list)) setCreators(list);
            void loadCompletedPayouts();
            dispatchPayoutsUpdated();
            closeCreatorPayout();
          } else {
            alert(data.error || "Payout failed");
          }
        } catch {
          alert("Payout failed");
        } finally {
          setPayingId(null);
        }
      }}
      onConnectStripeBank={async () => {
        setRegisteringId(activeCreator.id);
        try {
          const res = await fetch("/api/payouts/connect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ creatorId: activeCreator.id, email: activeCreator.email }),
          });
          const data = await res.json();
          if (data.url) window.open(data.url, "_blank");
          else alert(data.error || "Could not start bank connection");
        } catch {
          alert("Could not start bank connection");
        } finally {
          setRegisteringId(null);
        }
      }}
    />
  ) : null;

  return (
    <>
      {upgradeFeature && (
        <PaywallModal
          featureKey={upgradeFeature}
          lang={lang}
          onClose={() => setUpgradeFeature(null)}
          onUpgrade={onUpgrade}
          onUpgradePro={onUpgradePro}
          onUpgradeScale={onUpgradeScale}
        />
      )}
      <PayoutsPageHeader isMobile={isMobile} title={lang === "fr" ? "Aperçu" : "Overview"} />
      <div style={{ padding: isMobile ? "12px 16px 16px" : "16px 40px 40px", position: "relative" }}>
        <PayoutsOverviewPanel
          stats={payoutOverviewStats}
          sales={trackedSales}
          completedPayouts={completedPayouts}
          lang={lang}
          isMobile={isMobile}
        />

        <CreatorsPayoutTable
          creators={creators}
          lang={lang}
          isMobile={isMobile}
          onSelectCreator={openCreatorPayout}
        />

        <LiveSalesFeed isMobile={isMobile} userId={userId} />


        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, marginBottom: 36, overflow: "hidden", position: "relative" }}>
          {!canUseAutoPayouts(plan as PlanTier) && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.9)", borderRadius: 16, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
              <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0, textAlign: "center" }}>
                {lang === "fr" ? "Paiements auto — Plan Pro. " : "Auto payouts — Pro plan. "}
                <button type="button" onClick={() => void (onUpgradePro ?? onUpgrade)()} style={{ background: "none", border: "none", color: "#0047FF", fontSize: 13, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                  {lang === "fr" ? "Passer à Pro →" : "Upgrade to Pro →"}
                </button>
              </p>
            </div>
          )}
          <div style={{ padding: 24, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1, opacity: canUseAutoPayouts(plan as PlanTier) ? 1 : 0.45 }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 4 }}>
                {lang === "fr" ? "Paiement automatique" : "Automatic payout"}
              </div>
              <div style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.01em" }}>
                {lang === "fr"
                  ? "Le 1er de chaque mois, tous les créateurs avec un solde positif sont payés automatiquement."
                  : "On the 1st of every month, all creators with a positive balance are paid automatically."}
              </div>
            </div>
            <label style={{ cursor: canUseAutoPayouts(plan as PlanTier) ? "pointer" : "not-allowed", display: "flex", flexShrink: 0, opacity: canUseAutoPayouts(plan as PlanTier) ? 1 : 0.45 }}>
              <input
                type="checkbox"
                checked={autoPayoutMonthly && canUseAutoPayouts(plan as PlanTier)}
                disabled={!canUseAutoPayouts(plan as PlanTier)}
                onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                  if (!canUseAutoPayouts(plan as PlanTier)) return;
                  const val = e.target.checked;
                  setAutoPayoutMonthly(val);
                  const { supabase } = await import("@/lib/supabase");
                  if (!supabase) return;
                  await supabase.from("profiles").update({ auto_payout_monthly: val }).eq("id", userId);
                }}
                style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
              />
              <PayoutsToggle on={autoPayoutMonthly && canUseAutoPayouts(plan)} />
            </label>
          </div>

          {autoPayoutMonthly && canUseAutoPayouts(plan as PlanTier) && (
            <div style={{ borderTop: "1px solid #EFEFEF", padding: "16px 20px 20px", background: "#FAFAFA" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200, opacity: canUseStripeConnectPayouts(plan) ? 1 : 0.45 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 4 }}>
                    {lang === "fr" ? "Stripe Connect" : "Stripe Connect"}
                  </div>
                  <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", lineHeight: 1.45 }}>
                    {lang === "fr"
                      ? "Versez automatiquement vos créateurs via Stripe Connect dès qu'une commission est due."
                      : "Pay creators automatically via Stripe Connect as soon as commission is owed."}
                  </div>
                  {!canUseStripeConnectPayouts(plan) && (
                    <p style={{ fontSize: 13, color: "#7A7A7A", margin: "10px 0 0", letterSpacing: "-0.01em" }}>
                      {lang === "fr" ? "Disponible sur le plan Scale. " : "Available on the Scale plan. "}
                      <button
                        type="button"
                        onClick={() => void (onUpgradeScale ?? onUpgradePro ?? onUpgrade)()}
                        style={{ background: "none", border: "none", color: "#0047FF", fontSize: 13, cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                      >
                        {lang === "fr" ? "Passer à Scale →" : "Upgrade to Scale →"}
                      </button>
                    </p>
                  )}
                </div>
                <div style={{ flexShrink: 0, opacity: canUseStripeConnectPayouts(plan) ? 1 : 0.45 }}>
                  {connectStatus === "active" ? (
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.01em" }}>
                      {lang === "fr" ? "✓ Connecté" : "✓ Connected"}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="hero-cta-shopify hero-cta-compact"
                      disabled={!canUseStripeConnectPayouts(plan) || connectLoading}
                      onClick={handleConnectStripe}
                    >
                      {connectLoading
                        ? (lang === "fr" ? "Chargement…" : "Loading…")
                        : connectStatus === "pending"
                          ? (lang === "fr" ? "Terminer la configuration" : "Finish setup")
                          : (lang === "fr" ? "Connecter Stripe" : "Connect Stripe")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

      {payoutDrawer}
      {confirmPayModal}

      </div>
    </>
  );
}

function walletBalanceStorageKey(userId: string) {
  return `trackit_wallet_balance_${userId}`;
}

function loadWalletBalance(userId: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(walletBalanceStorageKey(userId));
    if (!raw) return 0;
    const value = parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? round2(value) : 0;
  } catch {
    return 0;
  }
}

function saveWalletBalance(userId: string, amount: number) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(walletBalanceStorageKey(userId), String(round2(amount)));
  } catch {
    /* storage unavailable */
  }
}

type TransactionKind = "commission" | "payout";
type TransactionFilter = "all" | TransactionKind;

type TransactionRow = {
  id: string;
  kind: TransactionKind;
  date: string;
  creatorHandle: string;
  creatorName?: string | null;
  avatarUrl?: string | null;
  platform?: string | null;
  amount: number;
  saleAmount?: number;
  method?: string;
};

function buildTransactionRows(sales: TrackedSale[], payouts: CompletedPayout[], lang: "en" | "fr"): TransactionRow[] {
  const rows: TransactionRow[] = [];

  for (const sale of sales) {
    const creator = saleCreatorMeta(sale);
    const handle = String(creator?.handle || creator?.full_name || "creator").replace(/^@/, "");
    rows.push({
      id: `sale-${sale.id}`,
      kind: "commission",
      date: sale.created_at,
      creatorHandle: handle,
      creatorName: creator?.full_name,
      avatarUrl: creator?.avatar_url,
      platform: creator?.platform,
      amount: Number(sale.commission_amount) || 0,
      saleAmount: Number(sale.order_amount) || 0,
    });
  }

  for (const payout of payouts) {
    rows.push({
      id: `payout-${payout.id}`,
      kind: "payout",
      date: payout.paid_at || payout.created_at || new Date(0).toISOString(),
      creatorHandle: String(payout.creator?.handle || payout.creator?.full_name || "creator").replace(/^@/, ""),
      creatorName: payout.creator?.full_name,
      avatarUrl: payout.creator?.avatar_url,
      platform: payout.creator?.platform,
      amount: Number(payout.amount) || 0,
      method: payoutMethodLabel(payout.stripe_transfer_id, lang),
    });
  }

  return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function transactionMonthKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatTransactionMonthLabel(monthKey: string, lang: "en" | "fr") {
  if (monthKey === "unknown") return "—";
  const [year, month] = monthKey.split("-").map(Number);
  const d = new Date(year, (month || 1) - 1, 1);
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { month: "long", year: "numeric" });
}

function formatTransactionDate(iso: string, lang: "en" | "fr") {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupTransactionsByMonth(rows: TransactionRow[]) {
  const groups = new Map<string, TransactionRow[]>();
  for (const row of rows) {
    const key = transactionMonthKey(row.date);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => ({ key, items }));
}

function transactionKindLabel(kind: TransactionKind, lang: "en" | "fr") {
  if (kind === "commission") return lang === "fr" ? "Commission" : "Commission";
  return lang === "fr" ? "Paiement" : "Payout";
}

function formatTransactionAmount(row: TransactionRow, lang: "en" | "fr") {
  const value = formatCurrency(row.amount, lang);
  return row.kind === "payout" ? `−${value}` : value;
}

export function TransactionsView({
  userId,
  isMobile,
  isCreator,
  plan = "free",
  onUpgrade,
  onUpgradePro,
  onUpgradeScale,
}: {
  userId?: string;
  isMobile?: boolean;
  isCreator?: boolean;
  plan?: PlanTier;
  onUpgrade?: () => void;
  onUpgradePro?: () => void;
  onUpgradeScale?: () => void;
}) {
  const lang = useLang();
  const { navigate } = useDashboardNavigation();
  const { loading: payItWelcomeLoading, showWelcome: showPayItWelcome } = usePayItActivity(userId);
  const [payItWelcomeBypass, setPayItWelcomeBypass] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<GateFeatureKey | null>(null);
  const [sales, setSales] = useState<TrackedSale[]>([]);
  const [payouts, setPayouts] = useState<CompletedPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TransactionFilter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [saleRows, payoutRes] = await Promise.all([
          fetchTrackedSales(userId),
          fetch("/api/payouts/history", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setSales(saleRows);
        const payoutRows = (payoutRes as { payouts?: CompletedPayout[] }).payouts;
        setPayouts(Array.isArray(payoutRows) ? payoutRows : []);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
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

  const rows = useMemo(() => buildTransactionRows(sales, payouts, lang), [sales, payouts, lang]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== "all" && row.kind !== filter) return false;
      if (!query) return true;
      const name = String(row.creatorName || row.creatorHandle || "").toLowerCase();
      const handle = String(row.creatorHandle || "").toLowerCase();
      return name.includes(query) || handle.includes(query);
    });
  }, [rows, filter, search]);

  const groupedRows = useMemo(() => groupTransactionsByMonth(filteredRows), [filteredRows]);

  const thStyle: React.CSSProperties = {
    padding: "16px 22px",
    fontSize: 13,
    fontWeight: 600,
    color: "#6B7280",
    textAlign: "left",
    borderBottom: "1px solid #EFEFEF",
    background: "#FFFFFF",
    whiteSpace: "nowrap",
    letterSpacing: "-0.01em",
  };

  const tdStyle: React.CSSProperties = {
    padding: "18px 22px",
    fontSize: 15,
    color: "#1A1A1A",
    borderBottom: "1px solid #F5F5F5",
    verticalAlign: "middle",
    letterSpacing: "-0.02em",
  };

  const sectionRowStyle: React.CSSProperties = {
    padding: "10px 22px",
    fontSize: 12,
    fontWeight: 600,
    color: "#6B7280",
    background: "#FAFAFA",
    borderBottom: "1px solid #EFEFEF",
    letterSpacing: "-0.01em",
  };

  const filterBtn = (id: TransactionFilter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(id)}
      style={{
        background: "none",
        border: "none",
        padding: "0 0 8px",
        fontSize: 14,
        fontWeight: filter === id ? 600 : 400,
        color: filter === id ? "#1A1A1A" : "#7A7A7A",
        cursor: "pointer",
        fontFamily: "inherit",
        letterSpacing: "-0.02em",
        borderBottom: filter === id ? "2px solid #1A1A1A" : "2px solid transparent",
      }}
    >
      {label}
    </button>
  );

  if (isCreator) {
    return (
      <>
        <PayoutsPageHeader
          isMobile={isMobile}
          title="Payments"
          subtitle={
            lang === "fr"
              ? "Historique de vos commissions et paiements reçus"
              : "History of your commissions and received payouts"
          }
        />
        <CreatorPaymentInfo userId={userId} isMobile={isMobile} />
      </>
    );
  }

  if (payItWelcomeLoading) {
    return <PayItWelcomeLoading isMobile={isMobile} />;
  }

  if (showPayItWelcome && !payItWelcomeBypass) {
    return (
      <>
        {upgradeFeature && (
          <PaywallModal
            featureKey={upgradeFeature}
            lang={lang}
            onClose={() => setUpgradeFeature(null)}
            onUpgrade={onUpgrade}
            onUpgradePro={onUpgradePro}
            onUpgradeScale={onUpgradeScale}
          />
        )}
        <PayItWelcomeView
          isMobile={isMobile}
          variant="transactions"
          onPrimary={() => {
            if (!canUseManualPayouts(plan)) {
              setUpgradeFeature("transactions");
              return;
            }
            setPayItWelcomeBypass(true);
          }}
        />
      </>
    );
  }

  const resetFilters = () => {
    setFilter("all");
    setSearch("");
  };

  return (
    <>
      <PayoutsPageHeader
        isMobile={isMobile}
        title="Payments"
        trailing={
          <button
            type="button"
            onClick={resetFilters}
            className="hero-cta-raised-light"
            style={{ padding: "15px 24px", fontSize: 17 }}
          >
            {lang === "fr" ? "Réinitialiser" : "Reset"}
          </button>
        }
      />
      <div style={{ padding: isMobile ? "12px 16px 32px" : "16px 40px 48px", background: "#FFFFFF" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            {filterBtn("all", lang === "fr" ? "Toutes" : "All")}
            {filterBtn("commission", lang === "fr" ? "Commissions" : "Commissions")}
            {filterBtn("payout", lang === "fr" ? "Paiements" : "Payouts")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 12, padding: "10px 14px", minWidth: isMobile ? "100%" : 280 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="#9A9A9A" strokeWidth="2" />
              <path d="M21 21l-4.35-4.35" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === "fr" ? "Rechercher un créateur..." : "Search a creator..."}
              style={{ background: "transparent", border: "none", outline: "none", fontSize: 14, fontFamily: "inherit", flex: 1, color: "#1A1A1A", letterSpacing: "-0.02em" }}
            />
          </div>
        </div>

        <div style={{ border: "1px solid #EFEFEF", borderRadius: 16, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 720 : undefined }}>
            <thead>
              <tr>
                <th style={thStyle}>{lang === "fr" ? "Date" : "Date"}</th>
                <th style={thStyle}>{lang === "fr" ? "Créateur" : "Creator"}</th>
                <th style={thStyle}>{lang === "fr" ? "Type" : "Type"}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{lang === "fr" ? "Montant" : "Amount"}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ ...tdStyle, textAlign: "center", color: "#9A9A9A", padding: 48 }}>
                    {lang === "fr" ? "Chargement…" : "Loading…"}
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ ...tdStyle, textAlign: "center", color: "#9A9A9A", padding: 48 }}>
                    {rows.length === 0
                      ? lang === "fr"
                        ? "Vos transactions apparaîtront ici."
                        : "Your transactions will appear here."
                      : lang === "fr"
                        ? "Aucune transaction ne correspond à votre recherche."
                        : "No transactions match your search."}
                  </td>
                </tr>
              ) : (
                groupedRows.map(({ key, items }) => (
                  <Fragment key={key}>
                    <tr>
                      <td colSpan={4} style={sectionRowStyle}>
                        {formatTransactionMonthLabel(key, lang)}
                      </td>
                    </tr>
                    {items.map((row) => {
                      const name = row.creatorName || row.creatorHandle || (lang === "fr" ? "Créateur" : "Creator");
                      return (
                        <tr
                          key={row.id}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#FAFAFA";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "#FFFFFF";
                          }}
                        >
                          <td style={{ ...tdStyle, color: "#6B7280", fontSize: 14, whiteSpace: "nowrap" }}>
                            {formatTransactionDate(row.date, lang)}
                          </td>
                          <td style={tdStyle}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                              <CreatorAvatar src={row.avatarUrl} username={row.creatorHandle} displayName={name} size={36} alt={name} />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 500, letterSpacing: "-0.02em" }}>{name}</div>
                                {row.creatorHandle && (
                                  <div style={{ fontSize: 13, color: "#9A9A9A", marginTop: 2 }}>@{row.creatorHandle}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td style={{ ...tdStyle, color: "#6B7280", fontSize: 14 }}>
                            {transactionKindLabel(row.kind, lang)}
                            {row.kind === "payout" && row.method ? ` · ${row.method}` : ""}
                            {row.kind === "commission" && row.saleAmount
                              ? ` · ${formatCurrency(row.saleAmount, lang)}`
                              : ""}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>
                            {formatTransactionAmount(row, lang)}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

const TRACKIT_BLUE = "#0047FF";

function TrackitWalletCard({
  lang,
  isMobile,
  loading,
  error,
  defaultMethod,
  hasPaymentMethod,
  onManage,
}: {
  lang: "en" | "fr";
  isMobile?: boolean;
  loading: boolean;
  error: string | null;
  defaultMethod: PaymentMethod | null;
  hasPaymentMethod: boolean;
  onManage: () => void;
}) {
  return (
    <div
      style={{
        position: "relative",
        borderRadius: 20,
        padding: isMobile ? 22 : 28,
        minHeight: isMobile ? 190 : 220,
        background: "linear-gradient(145deg, #0047FF 0%, #002FA8 100%)",
        boxShadow: "0 16px 48px rgba(0,71,255,0.22)",
        color: "#FFFFFF",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -48,
          right: -48,
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.07)",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: -32,
          left: -32,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.05)",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                opacity: 0.72,
                marginBottom: 6,
              }}
            >
              {lang === "fr" ? "Carte de paiement" : "Payment card"}
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.04em" }}>Trackit</div>
          </div>
          {hasPaymentMethod && defaultMethod && (
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", opacity: 0.9 }}>
              {defaultMethod.brand.toUpperCase()}
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ fontSize: 14, opacity: 0.8, letterSpacing: "-0.02em" }}>
            {lang === "fr" ? "Chargement…" : "Loading…"}
          </div>
        ) : error ? (
          <div style={{ fontSize: 13, opacity: 0.95, lineHeight: 1.5 }}>{error}</div>
        ) : !hasPaymentMethod || !defaultMethod ? (
          <>
            <div
              style={{
                width: 44,
                height: 32,
                borderRadius: 6,
                background: "rgba(255,255,255,0.18)",
                marginBottom: 16,
              }}
            />
            <div style={{ fontSize: 15, opacity: 0.88, letterSpacing: "-0.02em", lineHeight: 1.5, marginBottom: 4 }}>
              {lang === "fr"
                ? "Ajoutez une carte pour alimenter votre solde et payer vos créateurs."
                : "Add a card to fund your balance and pay creators."}
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                width: 44,
                height: 32,
                borderRadius: 6,
                background: "linear-gradient(135deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.12) 100%)",
                marginBottom: 20,
              }}
            />
            <div
              style={{
                fontSize: isMobile ? 20 : 22,
                fontWeight: 500,
                letterSpacing: "0.14em",
                marginBottom: 16,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              ···· ···· ···· {defaultMethod.last4}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.75, letterSpacing: "-0.01em" }}>
              <span>{formatPaymentLabelShort(defaultMethod, lang)}</span>
              <span>
                {lang === "fr" ? "Expire" : "Expires"} {defaultMethod.expiry}
              </span>
            </div>
          </>
        )}
      </div>

      <div style={{ position: "relative", zIndex: 1, marginTop: 20 }}>
        <button
          type="button"
          onClick={onManage}
          className="hero-cta-raised-light"
          style={{ padding: "12px 20px", fontSize: 14, width: isMobile ? "100%" : "auto" }}
        >
          {!hasPaymentMethod
            ? lang === "fr"
              ? "Ajouter une carte"
              : "Add card"
            : lang === "fr"
              ? "Mettre à jour la carte"
              : "Update card"}
        </button>
        <p style={{ fontSize: 11, opacity: 0.65, margin: "10px 0 0", letterSpacing: "-0.01em", lineHeight: 1.4 }}>
          {lang === "fr"
            ? "Même carte que pour votre abonnement Trackit."
            : "Same card as your Trackit subscription."}
        </p>
      </div>
    </div>
  );
}

export function BalanceView({
  userId,
  isMobile,
  isCreator,
  plan = "free",
  onUpgrade,
  onUpgradePro,
  onUpgradeScale,
}: {
  userId?: string;
  isMobile?: boolean;
  isCreator?: boolean;
  plan?: PlanTier;
  onUpgrade?: () => void;
  onUpgradePro?: () => void;
  onUpgradeScale?: () => void;
}) {
  const lang = useLang();
  const { navigate } = useDashboardNavigation();
  const { loading: payItWelcomeLoading, showWelcome: showPayItWelcome, refresh: refreshPayItActivity } = usePayItActivity(userId);
  const [payItWelcomeBypass, setPayItWelcomeBypass] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<GateFeatureKey | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [creators, setCreators] = useState<PayoutTableCreator[]>([]);
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [payMessage, setPayMessage] = useState<string | null>(null);
  const {
    defaultMethod: defaultPaymentMethod,
    hasPaymentMethod: hasBillingPaymentMethod,
    loading: billingLoading,
    error: billingError,
    openManage: openBillingPaymentManage,
  } = usePaymentMethods();

  useEffect(() => {
    if (!userId) return;
    setWalletBalance(loadWalletBalance(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId || isCreator) return;
    fetch(`/api/creators-list?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setCreators(data);
      })
      .catch(console.error);
  }, [userId, isCreator]);

  const owedTotal = useMemo(
    () => creators.filter((c) => (Number(c.balance) || 0) > 0).reduce((sum, c) => sum + (Number(c.balance) || 0), 0),
    [creators],
  );

  const parsedFundAmount = parseFloat(fundAmount.replace(/[^0-9.]/g, ""));
  const canAddFunds = hasBillingPaymentMethod && parsedFundAmount > 0;
  const chargingLabel = defaultPaymentMethod ? formatPaymentLabelShort(defaultPaymentMethod, lang) : null;

  const handleAddFunds = () => {
    if (!userId) return;
    primeNotificationSound();
    const amount = parseFloat(fundAmount.replace(/[^0-9.]/g, ""));
    if (!amount || amount <= 0) return;
    const nextBalance = round2(walletBalance + amount);
    setWalletBalance(nextBalance);
    saveWalletBalance(userId, nextBalance);
    setFundAmount("");
    setAddFundsOpen(false);
    setPayMessage(
      lang === "fr"
        ? `${formatCurrency(amount, lang)} ajoutés à votre solde.`
        : `${formatCurrency(amount, lang)} added to your balance.`,
    );
    notifyFundsAdded(lang, amount, userId);
    void refreshPayItActivity();
  };

  const openAddFunds = (presetAmount?: number) => {
    if (!canUseBalance(plan)) {
      setUpgradeFeature("balance");
      return;
    }
    if (presetAmount != null) setFundAmount(String(presetAmount));
    setAddFundsOpen(true);
  };

  const balanceHint =
    owedTotal > walletBalance
      ? lang === "fr"
        ? `${formatCurrency(owedTotal - walletBalance, lang)} à ajouter pour couvrir les commissions`
        : `${formatCurrency(owedTotal - walletBalance, lang)} needed to cover commissions`
      : lang === "fr"
        ? "Prêt pour les prochains paiements"
        : "Ready for upcoming payouts";

  const owedHint =
    owedTotal > 0
      ? lang === "fr"
        ? "Montants dus aux créateurs"
        : "Amounts due to creators"
      : lang === "fr"
        ? "Aucune commission en attente"
        : "No commissions pending";

  if (isCreator) {
    return (
      <>
        <PayoutsPageHeader
          isMobile={isMobile}
          title={lang === "fr" ? "Solde" : "Balance"}
          subtitle={
            lang === "fr"
              ? "Vos commissions et vos coordonnées de virement"
              : "Your commissions and payout details"
          }
        />
        <CreatorPaymentInfo userId={userId} isMobile={isMobile} />
      </>
    );
  }

  if (payItWelcomeLoading) {
    return <PayItWelcomeLoading isMobile={isMobile} />;
  }

  if (showPayItWelcome && !payItWelcomeBypass) {
    return (
      <>
        {upgradeFeature && (
          <PaywallModal
            featureKey={upgradeFeature}
            lang={lang}
            onClose={() => setUpgradeFeature(null)}
            onUpgrade={onUpgrade}
            onUpgradePro={onUpgradePro}
            onUpgradeScale={onUpgradeScale}
          />
        )}
        <PayItWelcomeView
          isMobile={isMobile}
          variant="balance"
          onPrimary={() => {
            if (!canUseBalance(plan)) {
              setUpgradeFeature("balance");
              return;
            }
            setPayItWelcomeBypass(true);
            openAddFunds();
          }}
        />
      </>
    );
  }

  return (
    <>
      {upgradeFeature && (
        <PaywallModal
          featureKey={upgradeFeature}
          lang={lang}
          onClose={() => setUpgradeFeature(null)}
          onUpgrade={onUpgrade}
          onUpgradePro={onUpgradePro}
          onUpgradeScale={onUpgradeScale}
        />
      )}
      <PayoutsPageHeader
        isMobile={isMobile}
        title={lang === "fr" ? "Solde" : "Balance"}
        subtitle={
          lang === "fr"
            ? "Alimentez votre compte pour payer les créateurs"
            : "Fund your account to pay creators"
        }
      />
      <div
        style={{
          padding: isMobile ? "12px 16px 32px" : "16px 40px 48px",
          background: "#FFFFFF",
          minHeight: "calc(100vh - 120px)",
        }}
      >

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 340px",
            gap: isMobile ? 20 : 24,
            marginBottom: 20,
            alignItems: "stretch",
          }}
        >
          <div
            style={{
              border: "1px solid #EFEFEF",
              borderRadius: 16,
              padding: isMobile ? 22 : 28,
              background: "#FFFFFF",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ fontSize: 13, color: "#6B7280", letterSpacing: "-0.01em", marginBottom: 10 }}>
              {lang === "fr" ? "Solde disponible" : "Available balance"}
            </div>
            <div
              style={{
                fontSize: isMobile ? 36 : 44,
                fontWeight: 600,
                color: "#1A1A1A",
                letterSpacing: "-0.04em",
                lineHeight: 1.05,
                marginBottom: 10,
              }}
            >
              {formatCurrency(walletBalance, lang)}
            </div>
            <div
              style={{
                fontSize: 13,
                color: owedTotal > walletBalance ? TRACKIT_BLUE : "#9A9A9A",
                letterSpacing: "-0.01em",
                lineHeight: 1.45,
              }}
            >
              {balanceHint}
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                marginTop: 28,
                paddingTop: 28,
                borderTop: "1px solid #EFEFEF",
              }}
            >
              <button
                type="button"
                onClick={() => openAddFunds()}
                className="hero-cta-raised-light"
                style={{ padding: "15px 24px", fontSize: 17 }}
              >
                {lang === "fr" ? "Ajouter des fonds" : "Add funds"}
              </button>
              {owedTotal > 0 && (
                <button
                  type="button"
                  onClick={() => navigate({ view: "payouts" })}
                  style={{ ...payoutPageSecondaryBtn, padding: "15px 24px", fontSize: 15 }}
                >
                  {lang === "fr" ? "Voir les paiements" : "View payouts"}
                </button>
              )}
            </div>

            {hasBillingPaymentMethod && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 10 }}>
                  {lang === "fr" ? "Montants rapides" : "Quick amounts"}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[50, 100, 250, 500].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => openAddFunds(amt)}
                      style={{
                        ...payoutPageSecondaryBtn,
                        padding: "8px 14px",
                        fontSize: 13,
                        borderRadius: 999,
                      }}
                    >
                      {formatCurrency(amt, lang)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <TrackitWalletCard
            lang={lang}
            isMobile={isMobile}
            loading={billingLoading}
            error={billingError}
            defaultMethod={defaultPaymentMethod}
            hasPaymentMethod={hasBillingPaymentMethod}
            onManage={openBillingPaymentManage}
          />
        </div>

        <div
          style={{
            border: "1px solid #EFEFEF",
            borderRadius: 16,
            padding: isMobile ? 20 : 24,
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "center",
            justifyContent: "space-between",
            gap: isMobile ? 16 : 24,
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: "#6B7280", letterSpacing: "-0.01em", marginBottom: 8 }}>
              {lang === "fr" ? "Commissions à verser" : "Commissions owed"}
            </div>
            <div
              style={{
                fontSize: isMobile ? 28 : 32,
                fontWeight: 600,
                color: "#1A1A1A",
                letterSpacing: "-0.04em",
                lineHeight: 1.05,
                marginBottom: 6,
              }}
            >
              {formatCurrency(owedTotal, lang)}
            </div>
            <div style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em" }}>{owedHint}</div>
          </div>
          {owedTotal > 0 && (
            <button
              type="button"
              onClick={() => navigate({ view: "payouts" })}
              className="hero-cta-raised-light"
              style={{ padding: "12px 20px", fontSize: 14, flexShrink: 0, alignSelf: isMobile ? "stretch" : "center" }}
            >
              {lang === "fr" ? "Payer les créateurs" : "Pay creators"}
            </button>
          )}
        </div>
      </div>

      {addFundsOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 24,
          }}
          onClick={() => setAddFundsOpen(false)}
        >
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: 16,
              padding: 28,
              maxWidth: 440,
              width: "100%",
              boxShadow: "0 24px 48px rgba(0,0,0,0.12)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: "0 0 8px 0" }}>
              {lang === "fr" ? "Ajouter des fonds" : "Add money to balance"}
            </h3>
            <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: "0 0 20px 0", lineHeight: 1.5 }}>
              {lang === "fr" ? "Solde actuel :" : "Current balance:"} {formatCurrency(walletBalance, lang)}
            </p>
            {!hasBillingPaymentMethod ? (
              <>
                <p style={{ fontSize: 14, color: "#1A1A1A", letterSpacing: "-0.02em", margin: "0 0 16px 0", lineHeight: 1.5 }}>
                  {lang === "fr"
                    ? "Ajoutez d'abord votre carte Trackit bleue pour débiter votre solde."
                    : "Add your Trackit payment card first to fund your balance."}
                </p>
                <button type="button" onClick={openBillingPaymentManage} className="hero-cta-raised-light" style={{ padding: "14px 20px", fontSize: 15, width: "100%" }}>
                  {lang === "fr" ? "Ajouter une carte" : "Add card"}
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", margin: "0 0 8px 0" }}>
                  {lang === "fr" ? "Carte enregistrée" : "Saved card"}: {chargingLabel}
                </p>
                <label style={{ display: "block", fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 6 }}>
                  {lang === "fr" ? "Montant à ajouter" : "Amount to add"}
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 18, fontWeight: 500, color: "#1A1A1A" }}>{lang === "fr" ? "€" : "$"}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    placeholder="0.00"
                    style={{
                      flex: 1,
                      boxSizing: "border-box",
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid #E5E5E5",
                      fontSize: 18,
                      fontFamily: "inherit",
                      color: "#1A1A1A",
                      letterSpacing: "-0.02em",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                  {[50, 100, 250, 500].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setFundAmount(String(amt))}
                      style={{ ...payoutPageSecondaryBtn, padding: "6px 12px", fontSize: 12, borderRadius: 999 }}
                    >
                      {formatCurrency(amt, lang)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleAddFunds}
                  disabled={!canAddFunds}
                  className="hero-cta-raised-light"
                  style={{ padding: "14px 20px", fontSize: 15, width: "100%", opacity: canAddFunds ? 1 : 0.5 }}
                >
                  {lang === "fr" ? "Ajouter des fonds" : "Add funds"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setAddFundsOpen(false)}
              style={{ ...payoutPageSecondaryBtn, width: "100%", marginTop: 10 }}
            >
              {lang === "fr" ? "Annuler" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function PayoutsWorkspacePaymentCard({ onOpenAddPayment }: { onOpenAddPayment?: () => void }) {
  const lang = useLang();
  const { defaultMethod, loading, error, hasPaymentMethod, openManage } = usePaymentMethods();

  const openAdd = () => {
    onOpenAddPayment?.();
    openManage();
  };

  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 24 }}>
      <div style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 8 }}>
        {lang === "fr" ? "Carte de facturation" : "Billing card"}
      </div>
      <p style={{ fontSize: 11, color: "#9A9A9A", margin: "0 0 12px", lineHeight: 1.4 }}>
        {lang === "fr"
          ? "Même carte que pour votre abonnement Trackit."
          : "Same card as your Trackit subscription."}
      </p>
      {loading ? (
        <div style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em" }}>
          {lang === "fr" ? "Chargement..." : "Loading..."}
        </div>
      ) : error ? (
        <div style={{ fontSize: 13, color: "#C62828", letterSpacing: "-0.02em" }}>{error}</div>
      ) : !hasPaymentMethod || !defaultMethod ? (
        <>
          <div style={{ fontSize: 14, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 16 }}>
            {lang === "fr" ? "Aucune carte enregistrée" : "No card on file"}
          </div>
          <button type="button" onClick={openAdd} style={{ ...pmBtnSecondary, width: "100%" }}>
            {lang === "fr" ? "Ajouter dans la facturation" : "Add in billing"}
          </button>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <CardBrandIcon brand={defaultMethod.brand} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A", letterSpacing: "-0.02em" }}>
                {formatPaymentLabel(defaultMethod)}
              </div>
              <div style={{ fontSize: 12, color: "#9A9A9A", marginTop: 2 }}>
                {lang === "fr" ? "Expire" : "Expires"} {defaultMethod.expiry}
              </div>
            </div>
          </div>
          <button type="button" onClick={openAdd} className="hero-cta-shopify-light hero-cta-compact-sm" style={{ width: "100%" }}>
            {lang === "fr" ? "Mettre à jour la carte" : "Update card"}
          </button>
        </>
      )}
    </div>
  );
}
