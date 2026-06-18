"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import { CreatorPaymentInfo } from "./CreatorPaymentInfo";
import {
  canUseAutoPayouts,
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
import { CreatorAvatar } from "./CreatorAvatar";

type SalePlatform = "tiktok" | "instagram" | "youtube";

type SaleNotification = {
  id: string;
  amount: number;
  creatorHandle: string;
  commissionRate: number;
  platform: SalePlatform;
  minutesAgo: number;
  isNew?: boolean;
};

const btnOutline: React.CSSProperties = {
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

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function splitShares(amount: number, commissionRate: number) {
  const creatorShare = round2(amount * commissionRate);
  const brandShare = round2(amount - creatorShare);
  return { creatorShare, brandShare };
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


export function LiveSalesFeed({ isMobile }: { isMobile?: boolean } = {}) {
  const lang = useLang();
  const [notifications, setNotifications] = useState<SaleNotification[]>([]);
  const [paused, setPaused] = useState(false);

  const clearNotifications = () => setNotifications([]);

  const removeNotification = (id: string) => {
    setNotifications((list) => list.filter((n) => n.id !== id));
  };

  const list = useMemo(() => notifications, [notifications]);

  return (
    <>
      <style>{`
        @keyframes salePulse {
          0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(31, 181, 103, 0.5); }
          50% { opacity: 0.65; transform: scale(1.15); box-shadow: 0 0 0 4px rgba(31, 181, 103, 0.15); }
        }
        @keyframes saleSlideIn {
          from { opacity: 0; transform: translateY(-14px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: "0 0 4px" }}>{lang === "fr" ? "Flux des ventes en direct" : "Live sales feed"}</h2>
            <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0, letterSpacing: "-0.01em" }}>{lang === "fr" ? "Chaque vente suivie depuis vos créateurs en temps réel." : "Every sale tracked from your creators in real time."}</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, flexWrap: isMobile ? "wrap" : undefined }}>
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              style={{
                ...btnOutline,
                background: paused ? "#F5F5F5" : "#FFFFFF",
                color: paused ? "#7A7A7A" : "#1A1A1A",
              }}
            >
              {paused ? "Resume feed" : lang === "fr" ? "Mettre en pause" : "Pause feed"}
            </button>
            <button
              type="button"
              onClick={clearNotifications}
              disabled={list.length === 0}
              style={{
                ...btnOutline,
                color: list.length === 0 ? "#C4C4C4" : "#7A7A7A",
                opacity: list.length === 0 ? 0.5 : 1,
                cursor: list.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              {lang === "fr" ? "Supprimer les notifications" : "Remove notifications"}
            </button>
          </div>
        </div>

        <div style={{ position: "relative" }}>
          {paused && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(250,250,250,0.75)",
                borderRadius: 12,
                pointerEvents: "none",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 500, color: "#9A9A9A", letterSpacing: "-0.02em" }}>Feed paused</span>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: paused ? 0.45 : 1, transition: "opacity 0.2s ease" }}>
            {list.length === 0 ? (
              <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 10, padding: 32, textAlign: "center", fontSize: 13, color: "#9A9A9A" }}>
                {lang === "fr" ? "Aucune vente pour le moment." : "No sales yet."}
              </div>
            ) : (
              list.map((sale) => {
                const { creatorShare, brandShare } = splitShares(sale.amount, sale.commissionRate);
                return (
                  <SaleNotificationCard
                    key={sale.id}
                    lang={lang}
                    sale={sale}
                    creatorShare={creatorShare}
                    brandShare={brandShare}
                    animateIn={!!sale.isNew}
                    onRemove={() => removeNotification(sale.id)}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function SaleNotificationCard({
  lang,
  sale,
  creatorShare,
  brandShare,
  animateIn,
  onRemove,
}: {
  lang: "en" | "fr";
  sale: SaleNotification;
  creatorShare: number;
  brandShare: number;
  animateIn: boolean;
  onRemove: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#FFFFFF",
        borderRadius: 10,
        padding: 16,
        border: "1px solid #EFEFEF",
        borderLeft: "3px solid #1FB567",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        boxShadow: hovered ? "0 4px 16px rgba(0,0,0,0.06)" : "none",
        transition: "box-shadow 0.2s ease",
        animation: animateIn ? "saleSlideIn 0.35s ease-out" : undefined,
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: "#1FB567",
          flexShrink: 0,
          marginTop: 6,
          animation: "salePulse 1.6s ease-in-out infinite",
        }}
      />
      <img src="/shopify-logo.svg" alt="" width={20} height={20} style={{ display: "block", flexShrink: 0, objectFit: "contain" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 4 }}>
          {lang === "fr" ? "Une vente de" : "A sale of"} {formatCurrency(sale.amount, lang)} {lang === "fr" ? "vient d'arriver" : "just dropped"}
        </div>
        <div style={{ fontSize: 12, color: "#7A7A7A", letterSpacing: "-0.01em", marginBottom: 8, lineHeight: 1.45 }}>
          {lang === "fr" ? "Répartition :" : "Split:"} {formatCurrency(creatorShare, lang)} {lang === "fr" ? "pour" : "for"} @{sale.creatorHandle} · {formatCurrency(brandShare, lang)} {lang === "fr" ? "conservé" : "kept"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#9A9A9A" }}>{formatRelativeTime(sale.minutesAgo, lang)}</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#1A1A1A",
              background: "#F0F0F0",
              padding: "3px 8px",
              borderRadius: 999,
              letterSpacing: "-0.01em",
            }}
          >
            {platformLabel(sale.platform)}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          style={{
            background: "none",
            border: "none",
            color: "#9A9A9A",
            fontSize: 12,
            fontWeight: 500,
            fontFamily: "inherit",
            cursor: "pointer",
            padding: "4px 0",
            letterSpacing: "-0.01em",
          }}
        >
          {lang === "fr" ? "Voir la commande" : "View order"}
        </button>
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: "none",
            border: "none",
            color: "#9A9A9A",
            fontSize: 12,
            fontWeight: 500,
            fontFamily: "inherit",
            cursor: "pointer",
            padding: "4px 0",
            letterSpacing: "-0.01em",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#DC2626";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#9A9A9A";
          }}
        >
          {lang === "fr" ? "Supprimer la notification" : "Remove notification"}
        </button>
      </div>
    </div>
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
  return Boolean(c.paypal_link || c.revolut_link || c.iban);
}

function paymentMethodLabel(c: {
  paypal_link?: string | null;
  revolut_link?: string | null;
  iban?: string | null;
}, lang: "en" | "fr") {
  if (c.paypal_link) return "PayPal";
  if (c.revolut_link) return "Revolut";
  if (c.iban) return lang === "fr" ? "Virement" : "Bank";
  return lang === "fr" ? "Non configuré" : "Not set";
}

const payoutPanelInputStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #EFEFEF",
  background: "#FFFFFF",
  fontSize: 14,
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
  letterSpacing: "-0.02em",
  color: "#1A1A1A",
  outline: "none",
};

const payoutPanelFieldLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#1A1A1A",
  marginBottom: 6,
  letterSpacing: "-0.01em",
};

type PayoutMethodType = "paypal" | "revolut" | "iban";

function defaultPayoutMethodType(c: {
  paypal_link?: string | null;
  revolut_link?: string | null;
  iban?: string | null;
}): PayoutMethodType {
  if (c.paypal_link) return "paypal";
  if (c.revolut_link) return "revolut";
  if (c.iban) return "iban";
  return "paypal";
}

const PAYMENT_METHOD_LOGOS: Record<PayoutMethodType, { src: string; alt: string; height: number; maxWidth: number }> = {
  paypal: { src: "/payment-logos/paypal.svg", alt: "PayPal", height: 14, maxWidth: 54 },
  revolut: { src: "/payment-logos/revolut.svg", alt: "Revolut", height: 11, maxWidth: 62 },
  iban: { src: "/payment-logos/iban.svg", alt: "IBAN", height: 16, maxWidth: 48 },
};

function PaymentMethodLogo({ method }: { method: PayoutMethodType }) {
  const logo = PAYMENT_METHOD_LOGOS[method];
  return (
    <img
      src={logo.src}
      alt={logo.alt}
      style={{
        height: logo.height,
        width: "auto",
        maxWidth: logo.maxWidth,
        objectFit: "contain",
        display: "block",
        flexShrink: 0,
      }}
    />
  );
}

const PAYOUT_METHOD_OPTIONS: { id: PayoutMethodType; label: string }[] = [
  { id: "paypal", label: "PayPal" },
  { id: "revolut", label: "Revolut" },
  { id: "iban", label: "IBAN" },
];

function CreatorPayoutMethodFields({
  creator,
  lang,
  onUpdate,
}: {
  creator: {
    id: string;
    paypal_link?: string | null;
    revolut_link?: string | null;
    iban?: string | null;
  };
  lang: "en" | "fr";
  onUpdate: (next: typeof creator) => void;
}) {
  const [method, setMethod] = useState<PayoutMethodType>(() => defaultPayoutMethodType(creator));
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMethod(defaultPayoutMethodType(creator));
    setOpen(false);
  }, [creator.id]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const current = PAYOUT_METHOD_OPTIONS.find((m) => m.id === method) ?? PAYOUT_METHOD_OPTIONS[0];

  const fieldConfig: Record<PayoutMethodType, { key: "paypal_link" | "revolut_link" | "iban"; placeholder: string; label: string }> = {
    paypal: { key: "paypal_link", placeholder: "paypal.me/username", label: "PayPal" },
    revolut: { key: "revolut_link", placeholder: "revolut.me/username", label: "Revolut" },
    iban: { key: "iban", placeholder: "FR76 1234 5678 9012 3456 7890 123", label: "IBAN" },
  };
  const active = fieldConfig[method];
  const activeValue = String(creator[active.key] || "");

  const saveField = async (value: string) => {
    if (!supabase) return;
    await supabase.from("creators").update({ [active.key]: value }).eq("id", creator.id);
    onUpdate({ ...creator, [active.key]: value });
  };

  return (
    <div ref={rootRef}>
      <span style={payoutPanelFieldLabelStyle}>{lang === "fr" ? "Moyen de paiement" : "Payment method"}</span>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #EFEFEF",
            background: "#FFFFFF",
            cursor: "pointer",
            fontFamily: "inherit",
            textAlign: "left",
          }}
        >
          <PaymentMethodLogo method={current.id} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{current.label}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
            <path d="M6 9l6 6 6-6" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              right: 0,
              background: "#FFFFFF",
              border: "1px solid #EFEFEF",
              borderRadius: 12,
              boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
              zIndex: 20,
              overflow: "hidden",
            }}
          >
            {PAYOUT_METHOD_OPTIONS.map((option, i) => {
              const selected = option.id === method;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setMethod(option.id);
                    setOpen(false);
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    border: "none",
                    borderBottom: i < PAYOUT_METHOD_OPTIONS.length - 1 ? "1px solid #F5F5F5" : "none",
                    background: selected ? "#FAFAFA" : "#FFFFFF",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  <PaymentMethodLogo method={option.id} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: selected ? 600 : 500, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{option.label}</span>
                  {selected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M5 13l4 4L19 7" stroke="#0047FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <label>
        <span style={{ ...payoutPanelFieldLabelStyle, marginBottom: 6 }}>{active.label}</span>
        <input
          key={`${creator.id}-${method}`}
          type="text"
          defaultValue={activeValue}
          placeholder={active.placeholder}
          onBlur={(e) => void saveField(e.target.value)}
          style={payoutPanelInputStyle}
        />
      </label>
      <p style={{ fontSize: 12, color: "#9A9A9A", margin: "10px 0 0", letterSpacing: "-0.01em" }}>
        {lang === "fr" ? "Sauvegarde automatique en quittant le champ" : "Auto-saves when you leave the field"}
      </p>
    </div>
  );
}

function creatorHasPayoutDetails(c: { paypal_link?: string; revolut_link?: string; iban?: string }) {
  return Boolean(c.paypal_link || c.revolut_link || c.iban);
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

function formatPayoutDate(iso: string | null | undefined, lang: "en" | "fr") {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function OwedToCreatorsSummaryCard({
  lang,
  isMobile,
  balance,
  creators,
  autoPayoutMonthly,
}: {
  lang: "en" | "fr";
  isMobile?: boolean;
  balance: number;
  creators: { balance?: number; total_earned?: number; total_sales?: number; paypal_link?: string; revolut_link?: string; iban?: string }[];
  autoPayoutMonthly: boolean;
}) {
  const pending = creators.filter((c) => (Number(c.balance) || 0) > 0);
  const readyCount = pending.filter(creatorHasPayoutDetails).length;
  const missingCount = pending.length - readyCount;
  const totalEarned = creators.reduce((sum, c) => sum + (Number(c.total_earned) || 0), 0);
  const totalSales = creators.reduce((sum, c) => sum + (Number(c.total_sales) || 0), 0);
  const totalPaid = Math.max(totalEarned - balance, 0);

  const nextPayoutLabel = (() => {
    if (!autoPayoutMonthly) return lang === "fr" ? "Manuel" : "Manual";
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return next.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "short" });
  })();

  const subtitle =
    balance <= 0
      ? lang === "fr"
        ? "Tous les soldes sont à jour"
        : "All balances are settled"
      : lang === "fr"
        ? `${pending.length} créateur${pending.length > 1 ? "s" : ""} en attente · ${readyCount} prêt${readyCount > 1 ? "s" : ""} à payer`
        : `${pending.length} creator${pending.length > 1 ? "s" : ""} pending · ${readyCount} ready to pay`;

  const stat = (label: string, value: string) => (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 10, opacity: 0.75, marginTop: 4, letterSpacing: "-0.01em", lineHeight: 1.3 }}>{label}</div>
    </div>
  );

  return (
    <div
      style={{
        background: "#0047FF",
        color: "#FFFFFF",
        borderRadius: 16,
        padding: 28,
        flex: isMobile ? undefined : 1.4,
        width: isMobile ? "100%" : undefined,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        textAlign: "left",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 12, marginBottom: 6 }}>
        <div style={{ fontSize: 12, opacity: 0.8, letterSpacing: "-0.01em" }}>
          {lang === "fr" ? "À verser aux créateurs" : "Owed to creators"}
        </div>
        {pending.length > 0 && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              background: "rgba(255,255,255,0.16)",
              border: "1px solid rgba(255,255,255,0.22)",
              borderRadius: 999,
              padding: "3px 10px",
              whiteSpace: "nowrap",
            }}
          >
            {lang === "fr"
              ? `${pending.length} en attente`
              : `${pending.length} pending`}
          </span>
        )}
      </div>

      <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1 }}>
        {formatCurrency(balance, lang)}
      </div>

      <div style={{ fontSize: 13, opacity: 0.88, marginTop: 10, letterSpacing: "-0.01em", lineHeight: 1.45 }}>
        {subtitle}
      </div>

      {missingCount > 0 && (
        <div style={{ fontSize: 12, opacity: 0.82, marginTop: 6, letterSpacing: "-0.01em" }}>
          {lang === "fr"
            ? `${missingCount} créateur${missingCount > 1 ? "s" : ""} sans coordonnées de paiement`
            : `${missingCount} creator${missingCount > 1 ? "s" : ""} missing payment details`}
        </div>
      )}

      <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.18)", margin: "18px 0 16px" }} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "16px 24px",
          width: "100%",
        }}
      >
        {stat(lang === "fr" ? "Commissions totales" : "Total commissions", formatCurrency(totalEarned, lang))}
        {stat(lang === "fr" ? "Déjà versé" : "Already paid", formatCurrency(totalPaid, lang))}
        {stat(lang === "fr" ? "Ventes trackées" : "Tracked sales", String(totalSales))}
        {stat(lang === "fr" ? "Prochain versement" : "Next payout", nextPayoutLabel)}
      </div>
    </div>
  );
}

function PayoutsPageHeader({ title, subtitle, isMobile }: { title: string; subtitle?: string; isMobile?: boolean }) {
  return (
    <div style={{ paddingTop: isMobile ? 56 : 40, paddingRight: isMobile ? 16 : 40, paddingBottom: isMobile ? 16 : 24, paddingLeft: isMobile ? 16 : 40, borderBottom: "1px solid #EFEFEF", background: "#FFFFFF" }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0, marginBottom: subtitle ? 6 : 0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0 }}>{subtitle}</p>}
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
}: {
  plan: PlanTier;
  onUpgrade: () => void;
  onUpgradePro?: () => void;
  onUpgradeScale?: () => void;
  isMobile?: boolean;
  userId?: string;
  isCreator?: boolean;
}) {
  const lang = useLang();
  const [search, setSearch] = useState("");
  const [creators, setCreators] = useState<any[]>([]);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payMessage, setPayMessage] = useState<string | null>(null);
  const balance = creators.reduce((sum, c) => sum + (Number(c.balance) || 0), 0);
  const {
    defaultMethod: defaultPaymentMethod,
    hasPaymentMethod: hasBillingPaymentMethod,
    openManage: openBillingPaymentManage,
  } = usePaymentMethods();
  const [payoutModal, setPayoutModal] = useState<"addFunds" | null>(null);
  const [confirmPay, setConfirmPay] = useState<{ creatorId: string; name: string; amount: number; method: string } | null>(null);
  const [fundAmount, setFundAmount] = useState("");
  const [autoPayoutMonthly, setAutoPayoutMonthly] = useState(false);
  const [selectedCreatorPayout, setSelectedCreatorPayout] = useState<any>(null);
  const [payoutsTab, setPayoutsTab] = useState<"overview" | "balances" | "history">("overview");
  const [completedPayouts, setCompletedPayouts] = useState<CompletedPayout[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
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

  const loadCompletedPayouts = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/payouts/history", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { payouts?: CompletedPayout[] };
      setCompletedPayouts(Array.isArray(data.payouts) ? data.payouts : []);
    } catch (e) {
      console.error(e);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    void loadCompletedPayouts();
  }, [userId]);

  const creatorsPendingPayout = useMemo(
    () => creators.filter((c) => (Number(c.balance) || 0) > 0),
    [creators]
  );

  const q = search.trim().toLowerCase();
  const filteredPending = creatorsPendingPayout.filter((c) => {
    if (!q) return true;
    const name = String(c.full_name || c.handle || "").toLowerCase();
    const handle = String(c.handle || c.username || "").toLowerCase();
    return name.includes(q) || handle.includes(q);
  });

  const historyQuery = historySearch.trim().toLowerCase();
  const filteredCompletedPayouts = completedPayouts.filter((payout) => {
    if (!historyQuery) return true;
    const name = String(payout.creator?.full_name || payout.creator?.handle || "").toLowerCase();
    const handle = String(payout.creator?.handle || "").toLowerCase();
    return name.includes(historyQuery) || handle.includes(historyQuery);
  });

  const completedPayoutsTotal = completedPayouts.reduce(
    (sum, payout) => sum + (Number(payout.amount) || 0),
    0
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
    if (creator.paypal_link) {
      const clean = String(creator.paypal_link).replace("https://paypal.me/", "").replace("paypal.me/", "");
      window.open(`https://paypal.me/${clean}/${amount}`, "_blank");
    } else if (creator.revolut_link) {
      const clean = String(creator.revolut_link).replace("https://revolut.me/", "").replace("revolut.me/", "");
      window.open(`https://revolut.me/${clean}`, "_blank");
    } else if (creator.iban) {
      navigator.clipboard.writeText(String(creator.iban));
      alert(
        lang === "fr"
          ? `IBAN copié ✓\nMontant à virer : ${formatCurrency(amount, lang)}`
          : `IBAN copied ✓\nAmount to transfer: ${formatCurrency(amount, lang)}`
      );
    } else {
      alert(
        lang === "fr"
          ? `${creator.full_name || creator.handle} n'a pas encore ajouté ses coordonnées de paiement.`
          : `${creator.full_name || creator.handle} hasn't added their payment details yet.`
      );
      return;
    }
    notifyCreatorPaid(lang, creator.full_name || creator.handle || "creator", amount);
    setPayMessage(
      lang === "fr"
        ? `Paiement de ${formatCurrency(amount, lang)} initié pour ${creator.full_name || creator.handle}.`
        : `Payment of ${formatCurrency(amount, lang)} started for ${creator.full_name || creator.handle}.`
    );
    // Open the Trackit confirmation modal once the user comes back
    const method = creator.paypal_link ? "paypal" : creator.revolut_link ? "revolut" : "iban";
    setTimeout(() => {
      setConfirmPay({ creatorId: creator.id, name: creator.full_name || creator.handle || "creator", amount, method });
    }, 800);
  };

  const confirmManualPayout = async () => {
    if (!confirmPay) return;
    const { creatorId, amount, method } = confirmPay;
    setConfirmPay(null);
    const res = await fetch("/api/payouts/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, creatorId, amount, method }),
    });
    const data = await res.json();
    if (data.ok) {
      setPayMessage(
        lang === "fr"
          ? `${formatCurrency(amount, lang)} marqué comme payé ✓`
          : `${formatCurrency(amount, lang)} marked as paid ✓`
      );
      setCreators((list) =>
        list.map((c) =>
          c.id === creatorId ? { ...c, balance: Math.max(0, Number(c.balance || 0) - amount) } : c
        )
      );
      void loadCompletedPayouts();
    } else {
      alert((lang === "fr" ? "Erreur : " : "Error: ") + (data.error || "unknown"));
    }
  };


  const handleAddFunds = () => {
    const amount = parseFloat(fundAmount.replace(/[^0-9.]/g, ""));
    if (!amount || amount <= 0) return;
    setFundAmount("");
    setPayoutModal(null);
    setPayMessage(`${formatCurrency(amount, lang)} added to your balance.`);
    notifyFundsAdded(lang, amount);
  };

  const parsedFundAmount = parseFloat(fundAmount.replace(/[^0-9.]/g, ""));
  const canAddFunds = hasBillingPaymentMethod && parsedFundAmount > 0;
  const chargingLabel = defaultPaymentMethod
    ? formatPaymentLabelShort(defaultPaymentMethod, lang)
    : null;

  if (isCreator) {
    return (
      <>
        <PayoutsPageHeader isMobile={isMobile} title={lang === "fr" ? "Paiements" : "Payouts"} subtitle={lang === "fr" ? "Vos commissions et vos coordonnées de virement" : "Your commissions and payout details"} />
        <CreatorPaymentInfo userId={userId} isMobile={isMobile} />
      </>
    );
  }

  return (
    <>
      <PayoutsPageHeader isMobile={isMobile} title={lang === "fr" ? "Paiements" : "Payouts"} subtitle={lang === "fr" ? "Suivez les commissions et payez les créateurs automatiquement lors des ventes Shopify" : "Track commissions and pay creators automatically when Shopify sales come in"} />
      <div style={{ paddingLeft: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, background: "#FFFFFF" }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 0, borderBottom: "1px solid #EFEFEF", paddingBottom: 0 }}>
          {[
            { id: "overview", label: lang === "fr" ? "Aperçu" : "Overview" },
            { id: "balances", label: lang === "fr" ? "Soldes des créateurs" : "Creator Balances" },
            { id: "history", label: lang === "fr" ? "Paiements effectués" : "Completed payments" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPayoutsTab(tab.id as "overview" | "balances" | "history")}
              style={{
                padding: "10px 16px",
                background: "none",
                border: "none",
                borderBottom: payoutsTab === tab.id ? "2px solid #0047FF" : "2px solid transparent",
                color: payoutsTab === tab.id ? "#0047FF" : "#7A7A7A",
                fontWeight: payoutsTab === tab.id ? 600 : 400,
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: "-0.02em",
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: isMobile ? 16 : 40, paddingTop: isMobile ? 56 : 56, position: "relative" }}>
        {!canUseManualPayouts(plan as PlanTier) && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 20,
              background: "rgba(255,255,255,0.92)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              paddingTop: isMobile ? 32 : 48,
              borderRadius: 16,
            }}
          >
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #EFEFEF",
                borderRadius: 16,
                padding: 40,
                maxWidth: 420,
                textAlign: "center",
                boxShadow: "0 12px 40px rgba(0,0,0,0.08)",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 16 }}>🔒</div>
              <h3 style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", margin: "0 0 10px", letterSpacing: "-0.03em" }}>
                {lang === "fr" ? "Paiements disponibles sur Growth et Pro" : "Payouts available on Growth and Pro"}
              </h3>
              <p style={{ fontSize: 14, color: "#7A7A7A", margin: "0 0 24px", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
                {lang === "fr" ? "Passez à l'offre supérieure pour payer les commissions automatiquement" : "Upgrade to pay creator commissions automatically"}
              </p>
              <button
                type="button"
                onClick={() => void onUpgrade()}
                style={{ ...payoutsBtnPrimary, width: "100%" }}
              >
                {lang === "fr" ? "Passer à Growth →" : "Upgrade to Growth →"}
              </button>
            </div>
          </div>
        )}

        {payoutsTab === "overview" && (
        <>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 20, marginBottom: 20 }}>
          <OwedToCreatorsSummaryCard
            lang={lang}
            isMobile={isMobile}
            balance={balance}
            creators={creators}
            autoPayoutMonthly={autoPayoutMonthly}
          />
          <div style={{ width: isMobile ? "100%" : undefined, flex: isMobile ? undefined : 1 }}>
            <PayoutsWorkspacePaymentCard />
          </div>
        </div>

        <LiveSalesFeed isMobile={isMobile} />


        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, marginBottom: 20, overflow: "hidden", position: "relative" }}>
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
          <div style={{ padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1, opacity: canUseAutoPayouts(plan as PlanTier) ? 1 : 0.45 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 2 }}>
                {lang === "fr" ? "Paiement automatique" : "Automatic payout"}
              </div>
              <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em" }}>
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

        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid #EFEFEF" }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{lang === "fr" ? "Suivi des commissions" : "Commission tracker"}</div>
            <div style={{ display: "flex", gap: 18 }}>
              <button type="button" style={{ background: "none", border: "none", fontSize: 13, color: "#1A1A1A", fontWeight: 500, cursor: "pointer", borderBottom: "2px solid #1A1A1A", paddingBottom: 4 }}>{lang === "fr" ? "Actif" : "Active"}</button>
              <button type="button" style={{ background: "none", border: "none", fontSize: 13, color: "#7A7A7A", cursor: "pointer", paddingBottom: 4 }}>{lang === "fr" ? "Historique" : "History"}</button>
            </div>
          </div>
          <div style={{ padding: 60, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em" }}>{lang === "fr" ? "Connectez Shopify pour commencer à suivre les commissions" : "Connect Shopify to start tracking commissions"}</div>
          </div>
        </div>

        </>
        )}

        {payoutsTab === "balances" && (
        <>
        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "18px 20px", borderBottom: "1px solid #EFEFEF" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 4 }}>
              {lang === "fr" ? "Payer les créateurs" : "Pay creators"}
            </div>
            <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", marginBottom: 14 }}>
              {creatorsPendingPayout.length === 0
                ? (lang === "fr" ? "Aucun solde en attente de paiement" : "No balances awaiting payment")
                : lang === "fr"
                  ? `${creatorsPendingPayout.length} créateur${creatorsPendingPayout.length > 1 ? "s" : ""} à payer`
                  : `${creatorsPendingPayout.length} creator${creatorsPendingPayout.length > 1 ? "s" : ""} to pay`}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 12, padding: "10px 14px" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#9A9A9A" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round"/></svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={lang === "fr" ? "Rechercher par nom ou pseudo..." : "Search by name or handle..."}
                style={{ background: "transparent", border: "none", outline: "none", fontSize: 14, fontFamily: "inherit", flex: 1, color: "#1A1A1A", letterSpacing: "-0.02em" }}
              />
            </div>
          </div>

          {payMessage && (
            <div style={{ margin: "14px 20px 0", padding: "12px 14px", background: "#F0F6FF", border: "1px solid #D6E4FF", borderRadius: 10, fontSize: 13, color: "#0047FF", letterSpacing: "-0.02em" }}>
              {payMessage}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column" }}>
            {filteredPending.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center" }}>
                <div style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", marginBottom: 6 }}>
                  {creatorsPendingPayout.length === 0
                    ? (lang === "fr" ? "Tous les soldes sont à jour" : "All balances are settled")
                    : (lang === "fr" ? "Aucun créateur ne correspond à votre recherche" : "No creators match your search")}
                </div>
                {creatorsPendingPayout.length === 0 && (
                  <div style={{ fontSize: 13, color: "#9A9A9A", letterSpacing: "-0.01em" }}>
                    {lang === "fr" ? "Les créateurs avec un solde apparaîtront ici." : "Creators with a balance will appear here."}
                  </div>
                )}
              </div>
            ) : (
              filteredPending.map((creator, i) => (
                <button
                  key={creator.id}
                  type="button"
                  onClick={() => setSelectedCreatorPayout(creator)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    width: "100%",
                    padding: "16px 20px",
                    border: "none",
                    borderBottom: i < filteredPending.length - 1 ? "1px solid #F5F5F5" : "none",
                    background: "#FFFFFF",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#FAFAFA"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#FFFFFF"; }}
                >
                  <CreatorAvatar src={creator.avatar_url} size={44} alt={creator.full_name || creator.handle || ""} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>
                      {creator.full_name || creator.handle}
                    </div>
                    <div style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginTop: 2 }}>
                      @{creator.handle || creator.username}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: creatorHasPaymentMethod(creator) ? "#1A1A1A" : "#B45309", marginTop: 6, letterSpacing: "-0.01em" }}>
                      {paymentMethodLabel(creator, lang)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#0047FF", letterSpacing: "-0.02em" }}>
                      {formatCurrency(Number(creator.balance) || 0, lang)}
                    </div>
                    <div style={{ fontSize: 11, color: "#9A9A9A", marginTop: 4, letterSpacing: "-0.01em" }}>
                      {lang === "fr" ? "À payer" : "Owed"}
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9A9A9A" strokeWidth="2" style={{ flexShrink: 0 }} aria-hidden><path d="M9 18l6-6-6-6"/></svg>
                </button>
              ))
            )}
          </div>
        </div>

      {selectedCreatorPayout && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 1000,
            display: "flex",
            alignItems: isMobile ? "flex-end" : "center",
            justifyContent: "center",
            padding: isMobile ? 0 : 24,
          }}
          onClick={() => setSelectedCreatorPayout(null)}
        >
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #EFEFEF",
              borderRadius: isMobile ? "20px 20px 0 0" : 16,
              width: "100%",
              maxWidth: 440,
              maxHeight: isMobile ? "92vh" : "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 24px 48px rgba(0,0,0,0.12)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "22px 24px 20px", borderBottom: "1px solid #EFEFEF", display: "flex", alignItems: "flex-start", gap: 14, flexShrink: 0 }}>
              <CreatorAvatar src={selectedCreatorPayout.avatar_url} size={52} alt={selectedCreatorPayout.full_name || selectedCreatorPayout.handle || ""} />
              <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", lineHeight: 1.2 }}>
                  {selectedCreatorPayout.full_name || selectedCreatorPayout.handle}
                </div>
                <div style={{ fontSize: 13, color: "#9A9A9A", letterSpacing: "-0.01em", marginTop: 4 }}>
                  @{selectedCreatorPayout.handle || selectedCreatorPayout.username}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCreatorPayout(null)}
                aria-label={lang === "fr" ? "Fermer" : "Close"}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#9A9A9A", fontSize: 22, lineHeight: 1, fontFamily: "inherit", padding: 4, marginTop: -2 }}
              >
                ×
              </button>
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: "24px 24px 8px" }}>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 16, paddingBottom: 20, borderBottom: "1px solid #F5F5F5" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 8, textTransform: "uppercase", fontWeight: 600 }}>
                    {lang === "fr" ? "Solde à payer" : "Balance owed"}
                  </div>
                  <div style={{ fontSize: 36, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", lineHeight: 1 }}>
                    {formatCurrency(Number(selectedCreatorPayout.balance) || 0, lang)}
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", lineHeight: 1.6 }}>
                  <div>
                    <span style={{ color: "#9A9A9A" }}>{lang === "fr" ? "Total gagné" : "Total earned"}</span>
                    {" "}
                    <span style={{ fontWeight: 600, color: "#1A1A1A" }}>{formatCurrency(selectedCreatorPayout.total_earned || 0, lang)}</span>
                  </div>
                  <div>
                    <span style={{ color: "#9A9A9A" }}>{lang === "fr" ? "Ventes" : "Sales"}</span>
                    {" "}
                    <span style={{ fontWeight: 600, color: "#1A1A1A" }}>{selectedCreatorPayout.total_sales || 0}</span>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 8, letterSpacing: "-0.02em" }}>
                  {lang === "fr" ? "Méthode de paiement" : "Payment method"}
                </div>
                {creatorHasPaymentMethod(selectedCreatorPayout) ? (
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>
                    {paymentMethodLabel(selectedCreatorPayout, lang)}
                    <span style={{ fontWeight: 400, color: "#7A7A7A" }}> · </span>
                    <span style={{ fontWeight: 400, color: "#1A1A1A", wordBreak: "break-all" }}>
                      {selectedCreatorPayout.paypal_link || selectedCreatorPayout.revolut_link || selectedCreatorPayout.iban}
                    </span>
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "#1A1A1A", letterSpacing: "-0.02em", lineHeight: 1.5 }}>
                    {lang === "fr" ? "Ajoutez un moyen de paiement ci-dessous avant de payer ce créateur." : "Add a payment method below before paying this creator."}
                  </p>
                )}
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 14, letterSpacing: "-0.02em" }}>
                  {lang === "fr" ? "Coordonnées de paiement" : "Payment details"}
                </div>
                <CreatorPayoutMethodFields
                  creator={selectedCreatorPayout}
                  lang={lang}
                  onUpdate={(next) => {
                    setSelectedCreatorPayout(next);
                    setCreators((list) => list.map((c) => (c.id === next.id ? next : c)));
                  }}
                />
              </div>
            </div>

            <div style={{ padding: "16px 24px 24px", borderTop: "1px solid #EFEFEF", flexShrink: 0, background: "#FFFFFF" }}>
              {selectedCreatorPayout.stripe_account_id ? (
                <button
                  type="button"
                  disabled={!selectedCreatorPayout.balance || selectedCreatorPayout.balance <= 0 || payingId === selectedCreatorPayout.id}
                  onClick={async () => {
                    if (!canUseManualPayouts(plan as PlanTier)) {
                      alert(lang === "fr" ? "Les paiements sont disponibles à partir du plan Growth." : "Payouts are available on Growth plan and above.");
                      return;
                    }
                    const amount = selectedCreatorPayout.balance;
                    if (!amount || amount <= 0) return;
                    setPayingId(selectedCreatorPayout.id);
                    try {
                      const res = await fetch("/api/payouts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId, creatorId: selectedCreatorPayout.id, amount }),
                      });
                      const data = await res.json();
                      if (data.success) {
                        setPayMessage(
                          lang === "fr"
                            ? `Virement de ${formatCurrency(amount, lang)} envoyé à ${selectedCreatorPayout.full_name || selectedCreatorPayout.handle}.`
                            : `Transfer of ${formatCurrency(amount, lang)} sent to ${selectedCreatorPayout.full_name || selectedCreatorPayout.handle}.`
                        );
                        notifyCreatorPaid(lang, selectedCreatorPayout.full_name || selectedCreatorPayout.handle || "creator", amount);
                        const r = await fetch(`/api/creators-list?userId=${userId}`);
                        const list = await r.json();
                        if (Array.isArray(list)) setCreators(list);
                        void loadCompletedPayouts();
                        setSelectedCreatorPayout(null);
                      } else {
                        alert(data.error || "Payout failed");
                      }
                    } catch {
                      alert("Payout failed");
                    } finally {
                      setPayingId(null);
                    }
                  }}
                  className="hero-cta-shopify-light hero-cta-compact"
                  style={{ width: "100%", marginBottom: 8, opacity: selectedCreatorPayout.balance > 0 ? 1 : 0.5 }}
                >
                  {payingId === selectedCreatorPayout.id
                    ? (lang === "fr" ? "Virement en cours…" : "Sending transfer…")
                    : `${lang === "fr" ? "Payer par virement Stripe" : "Pay via Stripe transfer"} · ${formatCurrency(selectedCreatorPayout.balance || 0, lang)}`}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={registeringId === selectedCreatorPayout.id}
                  onClick={async () => {
                    setRegisteringId(selectedCreatorPayout.id);
                    try {
                      const res = await fetch("/api/payouts/connect", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ creatorId: selectedCreatorPayout.id, email: selectedCreatorPayout.email }),
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
                  className="hero-cta-shopify-light hero-cta-compact"
                  style={{ width: "100%", marginBottom: 8 }}
                >
                  {registeringId === selectedCreatorPayout.id
                    ? (lang === "fr" ? "Ouverture…" : "Opening…")
                    : (lang === "fr" ? "Connecter un compte bancaire (Stripe)" : "Connect bank account (Stripe)")}
                </button>
              )}

              <button
                type="button"
                disabled={!selectedCreatorPayout.balance || selectedCreatorPayout.balance <= 0 || payingId === selectedCreatorPayout.id}
                onClick={() => handleManualCreatorPay(selectedCreatorPayout)}
                className="hero-cta-shopify hero-cta-compact"
                style={{ width: "100%", opacity: selectedCreatorPayout.balance > 0 ? 1 : 0.5 }}
              >
                {selectedCreatorPayout.balance > 0
                  ? `${lang === "fr" ? "Payer" : "Pay"} ${formatCurrency(selectedCreatorPayout.balance, lang)}`
                  : (lang === "fr" ? "Aucun solde à payer" : "No balance to pay")}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
        )}

        {payoutsTab === "history" && (
        <>
        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "18px 20px", borderBottom: "1px solid #EFEFEF" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 4 }}>
              {lang === "fr" ? "Paiements effectués" : "Completed payments"}
            </div>
            <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", marginBottom: 14 }}>
              {completedPayouts.length === 0
                ? (lang === "fr" ? "Aucun paiement enregistré pour le moment" : "No payments recorded yet")
                : lang === "fr"
                  ? `${completedPayouts.length} paiement${completedPayouts.length > 1 ? "s" : ""} · ${formatCurrency(completedPayoutsTotal, lang)} versés au total`
                  : `${completedPayouts.length} payment${completedPayouts.length > 1 ? "s" : ""} · ${formatCurrency(completedPayoutsTotal, lang)} paid in total`}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 12, padding: "10px 14px" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#9A9A9A" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round"/></svg>
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder={lang === "fr" ? "Rechercher par nom ou pseudo..." : "Search by name or handle..."}
                style={{ background: "transparent", border: "none", outline: "none", fontSize: 14, fontFamily: "inherit", flex: 1, color: "#1A1A1A", letterSpacing: "-0.02em" }}
              />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {historyLoading ? (
              <div style={{ padding: 48, textAlign: "center", fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em" }}>
                {lang === "fr" ? "Chargement…" : "Loading…"}
              </div>
            ) : filteredCompletedPayouts.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center" }}>
                <div style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", marginBottom: 6 }}>
                  {completedPayouts.length === 0
                    ? (lang === "fr" ? "Vos paiements confirmés apparaîtront ici" : "Your confirmed payments will appear here")
                    : (lang === "fr" ? "Aucun paiement ne correspond à votre recherche" : "No payments match your search")}
                </div>
                {completedPayouts.length === 0 && (
                  <div style={{ fontSize: 13, color: "#9A9A9A", letterSpacing: "-0.01em" }}>
                    {lang === "fr"
                      ? "PayPal, Revolut, IBAN et Stripe Connect sont enregistrés automatiquement."
                      : "PayPal, Revolut, IBAN and Stripe Connect payouts are recorded automatically."}
                  </div>
                )}
              </div>
            ) : (
              filteredCompletedPayouts.map((payout, i) => {
                const creatorName = payout.creator?.full_name || payout.creator?.handle || (lang === "fr" ? "Créateur" : "Creator");
                const creatorHandle = payout.creator?.handle || "";
                const method = payoutMethodLabel(payout.stripe_transfer_id, lang);
                return (
                  <div
                    key={payout.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      width: "100%",
                      padding: "16px 20px",
                      borderBottom: i < filteredCompletedPayouts.length - 1 ? "1px solid #F5F5F5" : "none",
                      background: "#FFFFFF",
                    }}
                  >
                    <CreatorAvatar src={payout.creator?.avatar_url} size={44} alt={creatorName} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                        {creatorName}
                      </div>
                      <div style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginTop: 3 }}>
                        {creatorHandle ? `@${creatorHandle}` : "—"}
                        {payout.creator?.platform ? ` · ${payout.creator.platform}` : ""}
                      </div>
                      <div style={{ fontSize: 12, color: "#7A7A7A", letterSpacing: "-0.01em", marginTop: 4 }}>
                        {formatPayoutDate(payout.paid_at || payout.created_at, lang)}
                        {" · "}
                        {method}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>
                        {formatCurrency(Number(payout.amount) || 0, lang)}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", marginTop: 4, letterSpacing: "-0.01em" }}>
                        {lang === "fr" ? "Payé" : "Paid"}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        </>
        )}

      {confirmPay && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setConfirmPay(null)}>
          <div style={{ background: "#FFFFFF", borderRadius: 20, padding: "32px 28px", maxWidth: 420, width: "100%", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://i.ibb.co/20jgns98/navbarlogotransparent.png"
              alt="Trackit"
              style={{ height: 96, width: "auto", display: "block", margin: "0 auto 20px", objectFit: "contain" }}
            />
            <h3 style={{ fontSize: 19, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px", letterSpacing: "-0.03em" }}>
              {lang === "fr" ? "Confirmation du paiement" : "Payment confirmation"}
            </h3>
            <p style={{ fontSize: 14, color: "#7A7A7A", margin: "0 0 6px", lineHeight: 1.5 }}>
              {lang === "fr" ? "Virement de" : "Transfer of"} <strong style={{ color: "#1A1A1A" }}>{formatCurrency(confirmPay.amount, lang)}</strong> {lang === "fr" ? "à" : "to"} <strong style={{ color: "#1A1A1A" }}>{confirmPay.name}</strong>
            </p>
            <p style={{ fontSize: 13, color: "#9A9A9A", margin: "0 0 24px", lineHeight: 1.5 }}>
              {lang === "fr" ? "En confirmant, le paiement est enregistré et le solde du créateur est remis à zéro." : "By confirming, the payment is recorded and the creator's balance is reset."}
            </p>
            <button type="button" onClick={() => void confirmManualPayout()} style={{ width: "100%", padding: "13px 0", background: "#1A1A1A", color: "#FFFFFF", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 10 }}>
              {lang === "fr" ? "Virement effectué ✓" : "Transfer completed ✓"}
            </button>
            <button type="button" onClick={() => setConfirmPay(null)} style={{ width: "100%", padding: "13px 0", background: "#F5F5F5", color: "#1A1A1A", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
              {lang === "fr" ? "Annuler" : "Cancel"}
            </button>
          </div>
        </div>
      )}
      {payoutModal === "addFunds" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }} onClick={() => setPayoutModal(null)}>
          <div style={{ background: "#FFFFFF", borderRadius: 16, padding: 28, maxWidth: 440, width: "100%", boxShadow: "0 24px 48px rgba(0,0,0,0.12)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: "0 0 8px 0" }}>{lang === "fr" ? "Ajouter des fonds" : "Add money to balance"}</h3>
            <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: "0 0 20px 0", lineHeight: 1.5 }}>Current balance: {formatCurrency(balance, lang)}</p>
            {!hasBillingPaymentMethod ? (
              <>
                <p style={{ fontSize: 14, color: "#1A1A1A", letterSpacing: "-0.02em", margin: "0 0 16px 0" }}>
                  {lang === "fr"
                    ? "Ajoutez la carte utilisée pour votre abonnement (facturation Stripe) avant d'alimenter votre solde."
                    : "Add the card used for your subscription (Stripe billing) before you can fund your balance."}
                </p>
                <button
                  type="button"
                  onClick={openBillingPaymentManage}
                  style={{ ...payoutsBtnPrimary, width: "100%" }}
                >
                  {lang === "fr" ? "Ouvrir la facturation" : "Open billing"}
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", margin: "0 0 8px 0" }}>Charging {chargingLabel}</p>
                <label style={{ display: "block", fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 6 }}>Amount to add</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 18, fontWeight: 500, color: "#1A1A1A" }}>$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    placeholder="0.00"
                    style={{ flex: 1, boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid #E5E5E5", fontSize: 18, fontFamily: "inherit", color: "#1A1A1A", letterSpacing: "-0.02em" }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                  {[50, 100, 250, 500].map((amt) => (
                    <button key={amt} type="button" onClick={() => setFundAmount(String(amt))} style={{ ...payoutsBtnSecondary, padding: "6px 12px", fontSize: 12 }}>{formatCurrency(amt, lang)}</button>
                  ))}
                </div>
                <button type="button" onClick={handleAddFunds} disabled={!canAddFunds} style={{ ...payoutsBtnPrimary, width: "100%", opacity: canAddFunds ? 1 : 0.5 }}>Add funds</button>
              </>
            )}
            <button type="button" onClick={() => setPayoutModal(null)} style={{ ...payoutsBtnSecondary, width: "100%", marginTop: 10 }}>Cancel</button>
          </div>
        </div>
      )}

      </div>
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
