"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import { formatCurrency } from "@/lib/useCurrency";
import {
  formatPaymentLabel,
  getDefaultPaymentMethod,
  usePaymentMethods,
  type PaymentMethod,
} from "./usePaymentMethods";

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

const INITIAL_SALES: Omit<SaleNotification, "id">[] = [
  { amount: 89.99, creatorHandle: "fashionwithemma", commissionRate: 0.15, platform: "tiktok", minutesAgo: 2 },
  { amount: 134.5, creatorHandle: "fitnessbysarah", commissionRate: 0.1, platform: "instagram", minutesAgo: 8 },
  { amount: 249, creatorHandle: "travelwithleo", commissionRate: 0.12, platform: "tiktok", minutesAgo: 23 },
  { amount: 67, creatorHandle: "beautybyjulie", commissionRate: 0.15, platform: "tiktok", minutesAgo: 45 },
  { amount: 189.99, creatorHandle: "foodieparadise", commissionRate: 0.1, platform: "instagram", minutesAgo: 67 },
];

const SIMULATE_CREATORS = INITIAL_SALES.map((s) => ({
  creatorHandle: s.creatorHandle,
  commissionRate: s.commissionRate,
  platform: s.platform,
}));

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

function nextId() {
  return `sale-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function seedNotifications(): SaleNotification[] {
  return INITIAL_SALES.map((s, i) => ({ ...s, id: `seed-${i}` }));
}

export function LiveSalesFeed({ isMobile }: { isMobile?: boolean } = {}) {
  const lang = useLang();
  const [notifications, setNotifications] = useState<SaleNotification[]>(seedNotifications);
  const [paused, setPaused] = useState(false);

  const simulateSale = () => {
    if (paused) return;
    const creator = SIMULATE_CREATORS[Math.floor(Math.random() * SIMULATE_CREATORS.length)];
    const amount = round2(20 + Math.random() * 280);
    const entry: SaleNotification = {
      id: nextId(),
      amount,
      creatorHandle: creator.creatorHandle,
      commissionRate: creator.commissionRate,
      platform: creator.platform,
      minutesAgo: 0,
      isNew: true,
    };
    setNotifications((list) => [entry, ...list]);
    setTimeout(() => {
      setNotifications((list) => list.map((n) => (n.id === entry.id ? { ...n, isNew: false } : n)));
    }, 500);
  };

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
            <button type="button" onClick={simulateSale} disabled={paused} style={{ ...btnOutline, opacity: paused ? 0.45 : 1, cursor: paused ? "not-allowed" : "pointer" }}>
              {lang === "fr" ? "Simuler une vente" : "Simulate sale"}
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
                No sale notifications
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

const pmBtnBlack: React.CSSProperties = {
  background: "#1A1A1A",
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

const pmInputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #E5E5E5",
  fontSize: 14,
  fontFamily: "inherit",
  color: "#1A1A1A",
  letterSpacing: "-0.02em",
  background: "#FFFFFF",
};

function PaymentToast({ message }: { message: string }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        background: "#1A1A1A",
        color: "#FFFFFF",
        padding: "12px 18px",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 500,
        zIndex: 1100,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        fontFamily: "inherit",
      }}
    >
      {message}
    </div>
  );
}

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

function formatCardNumberInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function formatExpiryInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function detectBrand(cardNumber: string): string {
  const d = cardNumber.replace(/\D/g, "");
  if (d.startsWith("5")) return "Mastercard";
  return "Visa";
}

function nextPaymentId() {
  return `pm-${Date.now()}`;
}

export function AddPaymentMethodModal({ onClose, onAdded }: { onClose: () => void; onAdded?: () => void }) {
  const { methods, addMethod } = usePaymentMethods();
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [nameOnCard, setNameOnCard] = useState("");

  const digits = cardNumber.replace(/\D/g, "");
  const canSubmit = digits.length >= 15 && expiry.length >= 5 && cvc.length >= 3 && nameOnCard.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const brand = detectBrand(cardNumber);
    const last4 = digits.slice(-4);
    const method: PaymentMethod = {
      id: nextPaymentId(),
      brand,
      last4,
      expiry: expiry.trim(),
      isDefault: methods.length === 0,
    };
    addMethod(method);
    onAdded?.();
    onClose();
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#FFFFFF", borderRadius: 16, padding: 28, maxWidth: 440, width: "100%", boxShadow: "0 24px 48px rgba(0,0,0,0.12)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: "0 0 8px" }}>Add payment method</h3>
        <label style={{ display: "block", fontSize: 12, color: "#9A9A9A", marginBottom: 6 }}>Card number</label>
        <input
          type="text"
          value={cardNumber}
          onChange={(e) => setCardNumber(formatCardNumberInput(e.target.value))}
          placeholder="4242 4242 4242 4242"
          style={{ ...pmInputStyle, marginBottom: 12 }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#9A9A9A", marginBottom: 6 }}>Expiry</label>
            <input
              type="text"
              value={expiry}
              onChange={(e) => setExpiry(formatExpiryInput(e.target.value))}
              placeholder="MM/YY"
              style={pmInputStyle}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#9A9A9A", marginBottom: 6 }}>CVC</label>
            <input
              type="text"
              value={cvc}
              onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="123"
              style={pmInputStyle}
            />
          </div>
        </div>
        <label style={{ display: "block", fontSize: 12, color: "#9A9A9A", marginBottom: 6 }}>Name on card</label>
        <input
          type="text"
          value={nameOnCard}
          onChange={(e) => setNameOnCard(e.target.value)}
          placeholder="Jane Smith"
          style={{ ...pmInputStyle, marginBottom: 12 }}
        />
        <p style={{ fontSize: 12, color: "#9A9A9A", margin: "0 0 16px", lineHeight: 1.45 }}>
          Your card is encrypted and stored securely via Stripe.
        </p>
        <button type="button" onClick={handleSubmit} disabled={!canSubmit} style={{ ...pmBtnBlack, width: "100%", opacity: canSubmit ? 1 : 0.5 }}>
          Add card →
        </button>
        <button type="button" onClick={onClose} style={{ ...pmBtnSecondary, width: "100%", marginTop: 10 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function RemovePaymentMethodModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#FFFFFF", borderRadius: 16, padding: 28, maxWidth: 400, width: "100%", boxShadow: "0 24px 48px rgba(0,0,0,0.12)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontSize: 14, color: "#1A1A1A", margin: "0 0 20px", lineHeight: 1.5, fontWeight: 500 }}>
          Remove this payment method? This will also disconnect it from your payout balance.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose} style={{ ...pmBtnSecondary, flex: 1 }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              flex: 1,
              background: "#DC2626",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 10,
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            Remove card
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentMethodCardItem({
  method,
  onSetDefault,
  onRemove,
}: {
  method: PaymentMethod;
  onSetDefault: () => void;
  onRemove: () => void;
}) {
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
          {method.brand} {lang === "fr" ? "se terminant par" : "ending in"} {method.last4}
        </div>
        <div style={{ fontSize: 12, color: "#7A7A7A" }}>Expiry: {method.expiry}</div>
      </div>
      {method.isDefault && (
        <span style={{ fontSize: 11, fontWeight: 600, color: "#1FB567", background: "rgba(31,181,103,0.12)", padding: "4px 10px", borderRadius: 999 }}>
          Default
        </span>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onSetDefault}
          disabled={method.isDefault}
          style={{
            ...pmBtnSecondary,
            opacity: method.isDefault ? 0.45 : 1,
            cursor: method.isDefault ? "not-allowed" : "pointer",
          }}
        >
          Set as default
        </button>
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: "none",
            border: "none",
            color: "#DC2626",
            fontSize: 13,
            fontWeight: 500,
            fontFamily: "inherit",
            cursor: "pointer",
            padding: "8px 4px",
          }}
        >
          {lang === "fr" ? "Supprimer" : "Remove"}
        </button>
      </div>
    </div>
  );
}

export function PaymentMethodsBillingSection() {
  const { methods, removeMethod, setDefault } = usePaymentMethods();
  const [addOpen, setAddOpen] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const confirmRemove = () => {
    if (!removeId) return;
    removeMethod(removeId);
    setRemoveId(null);
    setToast("Payment method removed ✓");
  };

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        {methods.map((m) => (
          <PaymentMethodCardItem
            key={m.id}
            method={m}
            onSetDefault={() => setDefault(m.id)}
            onRemove={() => setRemoveId(m.id)}
          />
        ))}
      </div>
      <button type="button" onClick={() => setAddOpen(true)} style={{ ...pmBtnSecondary, marginBottom: 16 }}>
        + Add payment method
      </button>
      <div style={{ padding: "12px 14px", background: "#FAFAFA", borderRadius: 10, fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em" }}>
        Switch to annual billing — save 20%
      </div>

      {addOpen && (
        <AddPaymentMethodModal
          onClose={() => setAddOpen(false)}
          onAdded={() => setToast("Card added ✓")}
        />
      )}
      {removeId && <RemovePaymentMethodModal onClose={() => setRemoveId(null)} onConfirm={confirmRemove} />}
      {toast && <PaymentToast message={toast} />}
    </>
  );
}


// --- Payouts workspace ---

type PayoutPartner = {
  id: string;
  name: string;
  handle: string;
  owed: number;
  hasPaymentMethod: boolean;
  paymentLabel?: string;
};

const PAYOUT_PARTNERS_SEED: PayoutPartner[] = [];

function mapDbCreatorToPartner(c: {
  id: string;
  handle?: string | null;
  full_name?: string | null;
  balance?: number | null;
}, lang: "en" | "fr"): PayoutPartner {
  const rawHandle = c.handle || "";
  const handle = rawHandle.startsWith("@") ? rawHandle : rawHandle ? `@${rawHandle}` : "@creator";
  return {
    id: c.id,
    name: c.full_name || c.handle || (lang === "fr" ? "Créateur" : "Creator"),
    handle,
    owed: Number(c.balance) || 0,
    hasPaymentMethod: false,
  };
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
  isMobile,
  userId,
}: {
  plan: "free" | "basic" | "pro";
  onUpgrade: () => void;
  isMobile?: boolean;
  userId?: string;
}) {
  const lang = useLang();
  const [search, setSearch] = useState("");
  const [creators, setCreators] = useState<any[]>([]);
  const [partners, setPartners] = useState<PayoutPartner[]>(PAYOUT_PARTNERS_SEED);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [methodType, setMethodType] = useState<"paypal" | "bank">("paypal");
  const [methodValue, setMethodValue] = useState("");
  const [payMessage, setPayMessage] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const { methods: paymentMethods } = usePaymentMethods();
  const defaultPaymentMethod = getDefaultPaymentMethod(paymentMethods);
  const [payoutModal, setPayoutModal] = useState<"addFunds" | null>(null);
  const [addPaymentForFunds, setAddPaymentForFunds] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [autoPayoutMonthly, setAutoPayoutMonthly] = useState(false);
  const [selectedCreatorPayout, setSelectedCreatorPayout] = useState<any>(null);
  const [payoutsTab, setPayoutsTab] = useState<"overview" | "balances">("overview");

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

  const tablePartners = useMemo(
    () => creators.map((c) => mapDbCreatorToPartner(c, lang)),
    [creators, partners, lang]
  );

  const q = search.trim().toLowerCase();
  const filtered = tablePartners.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q)
  );
  const registering = tablePartners.find((p) => p.id === registeringId) ?? partners.find((p) => p.id === registeringId) ?? null;

  const handlePayClick = (partner: PayoutPartner) => {
    setPayMessage(null);
    if (!partner.hasPaymentMethod) {
      setRegisteringId(partner.id);
      setMethodType("paypal");
      setMethodValue("");
      return;
    }
    setPayingId(partner.id);
    setTimeout(() => {
      setPayMessage(`Payment of ${formatCurrency(partner.owed, lang)} sent to ${partner.name}.`);
      setPayingId(null);
    }, 600);
  };

  const handleSavePaymentMethod = () => {
    if (!registering || !methodValue.trim()) return;
    const label = methodType === "paypal" ? `PayPal · ${methodValue.trim()}` : `Bank · ${methodValue.trim()}`;
    setPartners((prev) =>
      prev.map((p) => (p.id === registering.id ? { ...p, hasPaymentMethod: true, paymentLabel: label } : p))
    );
    setRegisteringId(null);
    setMethodValue("");
    setPayMessage(`Payment method saved for ${registering.name}. You can pay them now.`);
  };

  const openAddFunds = () => {
    setPayMessage(null);
    setFundAmount("");
    setPayoutModal("addFunds");
  };

  const handleAddFunds = () => {
    const amount = parseFloat(fundAmount.replace(/[^0-9.]/g, ""));
    if (!amount || amount <= 0) return;
    setBalance((b) => b + amount);
    setFundAmount("");
    setPayoutModal(null);
    setPayMessage(`${formatCurrency(amount, lang)} added to your balance.`);
  };

  const parsedFundAmount = parseFloat(fundAmount.replace(/[^0-9.]/g, ""));
  const canAddFunds = defaultPaymentMethod !== null && parsedFundAmount > 0;
  const chargingLabel = defaultPaymentMethod ? `${defaultPaymentMethod.brand} ···· ${defaultPaymentMethod.last4}` : null;

  return (
    <>
      <PayoutsPageHeader isMobile={isMobile} title={lang === "fr" ? "Paiements" : "Payouts"} subtitle={lang === "fr" ? "Suivez les commissions et payez les créateurs automatiquement lors des ventes Shopify" : "Track commissions and pay creators automatically when Shopify sales come in"} />
      <div style={{ paddingLeft: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, background: "#FFFFFF" }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 0, borderBottom: "1px solid #EFEFEF", paddingBottom: 0 }}>
          {[
            { id: "overview", label: lang === "fr" ? "Aperçu" : "Overview" },
            { id: "balances", label: lang === "fr" ? "Soldes des créateurs" : "Creator Balances" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPayoutsTab(tab.id as "overview" | "balances")}
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
        {plan === "free" && (
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
                {lang === "fr" ? "Paiements disponibles sur Basic et Pro" : "Payouts available on Basic and Pro"}
              </h3>
              <p style={{ fontSize: 14, color: "#7A7A7A", margin: "0 0 24px", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
                {lang === "fr" ? "Passez à l'offre supérieure pour payer les commissions automatiquement" : "Upgrade to pay creator commissions automatically"}
              </p>
              <button
                type="button"
                onClick={() => void onUpgrade()}
                style={{ ...payoutsBtnPrimary, width: "100%" }}
              >
                {lang === "fr" ? "Passer à Basic →" : "Upgrade to Basic →"}
              </button>
            </div>
          </div>
        )}

        {payoutsTab === "overview" && (
        <>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 20, marginBottom: 20 }}>
          <div style={{ background: "#0047FF", color: "#FFFFFF", borderRadius: 16, padding: 28, flex: isMobile ? undefined : 1.4, width: isMobile ? "100%" : undefined }}>
            <div style={{ fontSize: 12, opacity: 0.8, letterSpacing: "-0.01em", marginBottom: 6 }}>{lang === "fr" ? "Votre solde" : "Your balance"}</div>
            <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.04em", marginBottom: 18 }}>{formatCurrency(balance, lang)}</div>
            <button type="button" onClick={openAddFunds} className="hero-cta-shopify-dark">{lang === "fr" ? "Ajouter des fonds" : "Add money to balance"}</button>
          </div>
          <div style={{ width: isMobile ? "100%" : undefined, flex: isMobile ? undefined : 1 }}>
            <PayoutsWorkspacePaymentCard />
          </div>
        </div>

        <LiveSalesFeed isMobile={isMobile} />


        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 20, marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 2 }}>{lang === "fr" ? "Paiement automatique mensuel" : "Monthly auto payout"}</div>
            <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em" }}>{lang === "fr" ? "Le 1er de chaque mois, tous les créateurs avec un solde positif sont payés automatiquement." : "On the 1st of every month, all creators with a positive balance are paid automatically."}</div>
          </div>
          <label style={{ cursor: "pointer", display: "flex" }}>
            <input
              type="checkbox"
              checked={autoPayoutMonthly}
              onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                const val = e.target.checked;
                setAutoPayoutMonthly(val);
                const { supabase } = await import("@/lib/supabase");
                if (!supabase) return;
                await supabase.from("profiles").update({ auto_payout_monthly: val }).eq("id", userId);
              }}
              style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
            />
            <PayoutsToggle on={autoPayoutMonthly} />
          </label>
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "18px 20px", borderBottom: "1px solid #EFEFEF" }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 14 }}>{lang === "fr" ? "Payer les partenaires" : "Pay partners"}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 12, padding: "10px 14px" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#9A9A9A" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round"/></svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search partners by name or handle..."
                style={{ background: "transparent", border: "none", outline: "none", fontSize: 14, fontFamily: "inherit", flex: 1, color: "#1A1A1A", letterSpacing: "-0.02em" }}
              />
            </div>
          </div>

          {payMessage && (
            <div style={{ margin: "0 20px", marginTop: 14, padding: "12px 14px", background: "#F0F6FF", border: "1px solid #D6E4FF", borderRadius: 10, fontSize: 13, color: "#0047FF", letterSpacing: "-0.02em" }}>
              {payMessage}
            </div>
          )}

          {registering && (
            <div style={{ margin: "14px 20px 0", padding: 20, background: "#FFFBF0", border: "1px solid #FFE4A8", borderRadius: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 4 }}>
                Register payment method for {registering.name}
              </div>
              <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", marginBottom: 16 }}>
                This partner has no payout method on file. Add one before you can pay {formatCurrency(registering.owed, lang)}.
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button type="button" onClick={() => setMethodType("paypal")} style={{ ...payoutsBtnSecondary, background: methodType === "paypal" ? "#F5F5F5" : "#FFFFFF", borderColor: methodType === "paypal" ? "#1A1A1A" : "#E5E5E5" }}>PayPal</button>
                <button type="button" onClick={() => setMethodType("bank")} style={{ ...payoutsBtnSecondary, background: methodType === "bank" ? "#F5F5F5" : "#FFFFFF", borderColor: methodType === "bank" ? "#1A1A1A" : "#E5E5E5" }}>Bank account</button>
              </div>
              <input
                type="text"
                value={methodValue}
                onChange={(e) => setMethodValue(e.target.value)}
                placeholder={methodType === "paypal" ? "PayPal email" : "Account number or IBAN"}
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E5E5", fontSize: 14, fontFamily: "inherit", marginBottom: 12, letterSpacing: "-0.02em" }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={handleSavePaymentMethod} disabled={!methodValue.trim()} style={{ ...payoutsBtnPrimary, opacity: methodValue.trim() ? 1 : 0.5 }}>Save & continue</button>
                <button type="button" onClick={() => { setRegisteringId(null); setMethodValue(""); }} style={payoutsBtnSecondary}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: isMobile ? "touch" : undefined }}>
          <div style={{ display: "flex", flexDirection: "column", minWidth: isMobile ? 500 : undefined }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em" }}>No partners match your search</div>
            ) : (
              filtered.map((partner, i) => {
                const creator = creators.find((c) => c.id === partner.id) ?? {
                  id: partner.id,
                  full_name: partner.name,
                  handle: partner.handle.replace(/^@/, ""),
                  balance: partner.owed,
                  paypal_link: null as string | null,
                  revolut_link: null as string | null,
                  iban: null as string | null,
                };
                return (
                <div
                  key={partner.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "16px 20px",
                    borderBottom: i < filtered.length - 1 ? "1px solid #F5F5F5" : "none",
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#EFEFEF", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{partner.name}</div>
                    <div style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em" }}>{partner.handle}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      {creator.paypal_link ? (
                        <span style={{ fontSize: 11, background: "#003087", color: "#fff", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>PayPal</span>
                      ) : creator.revolut_link ? (
                        <span style={{ fontSize: 11, background: "#7B2FF7", color: "#fff", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>Revolut</span>
                      ) : creator.iban ? (
                        <span style={{ fontSize: 11, background: "#059669", color: "#fff", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>Bank</span>
                      ) : (
                        <span style={{ fontSize: 11, background: "#F5F5F5", color: "#9A9A9A", padding: "2px 8px", borderRadius: 4 }}>{lang === "fr" ? "Aucun moyen de paiement" : "No payment method"}</span>
                      )}
                    </div>
                    {partner.hasPaymentMethod ? (
                      <div style={{ fontSize: 11, color: "#7A7A7A", marginTop: 4, letterSpacing: "-0.01em" }}>{partner.paymentLabel}</div>
                    ) : (
                      <div style={{ fontSize: 11, color: "#C45C00", marginTop: 4, letterSpacing: "-0.01em" }}>No payment method</div>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginRight: 8 }}>{formatCurrency(partner.owed, lang)}</div>
                  <button
                    type="button"
                    onClick={() => {
                      if (plan === "free") {
                        alert(lang === "fr" ? "Les paiements sont disponibles à partir du plan Basic." : "Payouts are available on Basic plan and above.");
                        return;
                      }
                      const amount = creator.balance;
                      if (!amount || amount <= 0) {
                        alert(lang === "fr" ? "Solde insuffisant" : "No balance to pay");
                        return;
                      }

                      if (creator.paypal_link) {
                        const clean = creator.paypal_link.replace("https://paypal.me/", "").replace("paypal.me/", "");
                        window.open(`https://paypal.me/${clean}/${amount}`, '_blank');
                      } else if (creator.revolut_link) {
                        const clean = creator.revolut_link.replace("https://revolut.me/", "").replace("revolut.me/", "");
                        window.open(`https://revolut.me/${clean}`, '_blank');
                      } else if (creator.iban) {
                        navigator.clipboard.writeText(creator.iban);
                        alert(lang === "fr"
                          ? `IBAN copié: ${creator.iban}\nMontant à virer: ${amount}€`
                          : `IBAN copied: ${creator.iban}\nAmount to transfer: $${amount}`
                        );
                      } else {
                        alert(lang === "fr"
                          ? `${creator.full_name || creator.handle} n'a pas encore ajouté ses coordonnées de paiement.`
                          : `${creator.full_name || creator.handle} hasn't added their payment details yet.`
                        );
                      }
                    }}
                    disabled={payingId === partner.id || registeringId === partner.id}
                    className="hero-cta-shopify hero-cta-compact"
                    style={{ minWidth: 72, opacity: payingId === partner.id ? 0.7 : 1 }}
                  >
                    {payingId === partner.id ? "Paying…" : lang === "fr" ? "Payer" : "Pay"}
                  </button>
                </div>
                );
              })
            )}
          </div>
          </div>
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
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", margin: "0 0 16px", letterSpacing: "-0.03em" }}>
            {lang === "fr" ? "Soldes des créateurs" : "Creator balances"}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {creators.map((creator) => (
              <div key={creator.id} onClick={() => setSelectedCreatorPayout(creator)} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #EFEFEF", borderRadius: 12, padding: "12px 16px", cursor: "pointer", transition: "box-shadow 0.15s" }}>
                <img src={creator.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${creator.handle}`} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#1A1A1A" }}>{creator.full_name || creator.handle}</div>
                  <div style={{ fontSize: 12, color: "#9A9A9A" }}>@{creator.handle || creator.username}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: creator.balance > 0 ? "#1A1A1A" : "#9A9A9A" }}>
                    {creator.balance > 0 ? formatCurrency(creator.balance, lang) : formatCurrency(0, lang)}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    {creator.paypal_link ? <span style={{ background: "#003087", color: "#fff", padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>PayPal</span>
                    : creator.revolut_link ? <span style={{ background: "#7B2FBE", color: "#fff", padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>Revolut</span>
                    : creator.iban ? <span style={{ background: "#1B5E20", color: "#fff", padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>Bank</span>
                    : <span style={{ background: "#F5F5F5", color: "#9A9A9A", padding: "1px 6px", borderRadius: 4, fontSize: 10 }}>{lang === "fr" ? "Aucun" : "None"}</span>}
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9A9A9A" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </div>
            ))}
          </div>
        </div>

      {selectedCreatorPayout && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setSelectedCreatorPayout(null)}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, maxWidth: 440, width: "100%", position: "relative" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
              <img src={selectedCreatorPayout.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedCreatorPayout.handle}`} alt="" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover" }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 18, color: "#1A1A1A" }}>{selectedCreatorPayout.full_name || selectedCreatorPayout.handle}</div>
                <div style={{ fontSize: 13, color: "#9A9A9A" }}>@{selectedCreatorPayout.handle || selectedCreatorPayout.username}</div>
              </div>
              <button type="button" onClick={() => setSelectedCreatorPayout(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#9A9A9A", fontSize: 20 }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
              <div style={{ background: "#F8F8F8", borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#9A9A9A", marginBottom: 4 }}>{lang === "fr" ? "Solde actuel" : "Current balance"}</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: "#0047FF" }}>{formatCurrency(selectedCreatorPayout.balance || 0, lang)}</div>
              </div>
              <div style={{ background: "#F8F8F8", borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#9A9A9A", marginBottom: 4 }}>{lang === "fr" ? "Total gagné" : "Total earned"}</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{formatCurrency(selectedCreatorPayout.total_earned || 0, lang)}</div>
              </div>
              <div style={{ background: "#F8F8F8", borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#9A9A9A", marginBottom: 4 }}>{lang === "fr" ? "Ventes" : "Sales"}</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{selectedCreatorPayout.total_sales || 0}</div>
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 10 }}>{lang === "fr" ? "Méthode de paiement" : "Payment method"}</div>
              {selectedCreatorPayout.paypal_link ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F0F4FF", borderRadius: 10, padding: "10px 14px" }}>
                  <span style={{ background: "#003087", color: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>PayPal</span>
                  <span style={{ fontSize: 13, color: "#1A1A1A" }}>{selectedCreatorPayout.paypal_link}</span>
                </div>
              ) : selectedCreatorPayout.revolut_link ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F5F0FF", borderRadius: 10, padding: "10px 14px" }}>
                  <span style={{ background: "#7B2FBE", color: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>Revolut</span>
                  <span style={{ fontSize: 13, color: "#1A1A1A" }}>{selectedCreatorPayout.revolut_link}</span>
                </div>
              ) : selectedCreatorPayout.iban ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F0FFF4", borderRadius: 10, padding: "10px 14px" }}>
                  <span style={{ background: "#1B5E20", color: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>IBAN</span>
                  <span style={{ fontSize: 13, color: "#1A1A1A", fontFamily: "monospace" }}>{selectedCreatorPayout.iban}</span>
                </div>
              ) : (
                <div style={{ background: "#F8F8F8", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#9A9A9A" }}>
                  {lang === "fr" ? "Aucune méthode de paiement configurée" : "No payment method configured"}
                </div>
              )}
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 10 }}>{lang === "fr" ? "Réseaux sociaux" : "Social links"}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {selectedCreatorPayout.platform === "Instagram" || selectedCreatorPayout.handle ? (
                  <a href={`https://www.instagram.com/${selectedCreatorPayout.handle || selectedCreatorPayout.username}`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "#F5F5F5", borderRadius: 8, fontSize: 12, color: "#1A1A1A", textDecoration: "none", fontWeight: 500 }}>
                    Instagram →
                  </a>
                ) : null}
                {selectedCreatorPayout.platform === "TikTok" || selectedCreatorPayout.handle ? (
                  <a href={`https://www.tiktok.com/@${selectedCreatorPayout.handle || selectedCreatorPayout.username}`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "#F5F5F5", borderRadius: 8, fontSize: 12, color: "#1A1A1A", textDecoration: "none", fontWeight: 500 }}>
                    TikTok →
                  </a>
                ) : null}
                {selectedCreatorPayout.platform === "YouTube" ? (
                  <a href={`https://www.youtube.com/@${selectedCreatorPayout.handle || selectedCreatorPayout.username}`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "#F5F5F5", borderRadius: 8, fontSize: 12, color: "#1A1A1A", textDecoration: "none", fontWeight: 500 }}>
                    YouTube →
                  </a>
                ) : null}
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 10 }}>{lang === "fr" ? "Modifier le moyen de paiement" : "Edit payment method"}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  type="text"
                  placeholder="paypal.me/username"
                  defaultValue={selectedCreatorPayout.paypal_link || ""}
                  onBlur={async (e) => {
                    const { supabase } = await import("@/lib/supabase");
                    if (!supabase) return;
                    await supabase.from("creators").update({ paypal_link: e.target.value }).eq("id", selectedCreatorPayout.id);
                    setSelectedCreatorPayout({ ...selectedCreatorPayout, paypal_link: e.target.value });
                  }}
                  style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E5E5", fontSize: 13, fontFamily: "inherit", width: "100%" }}
                />
                <input
                  type="text"
                  placeholder="revolut.me/username"
                  defaultValue={selectedCreatorPayout.revolut_link || ""}
                  onBlur={async (e) => {
                    const { supabase } = await import("@/lib/supabase");
                    if (!supabase) return;
                    await supabase.from("creators").update({ revolut_link: e.target.value }).eq("id", selectedCreatorPayout.id);
                    setSelectedCreatorPayout({ ...selectedCreatorPayout, revolut_link: e.target.value });
                  }}
                  style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E5E5", fontSize: 13, fontFamily: "inherit", width: "100%" }}
                />
                <input
                  type="text"
                  placeholder="IBAN (FR76 ...)"
                  defaultValue={selectedCreatorPayout.iban || ""}
                  onBlur={async (e) => {
                    const { supabase } = await import("@/lib/supabase");
                    if (!supabase) return;
                    await supabase.from("creators").update({ iban: e.target.value }).eq("id", selectedCreatorPayout.id);
                    setSelectedCreatorPayout({ ...selectedCreatorPayout, iban: e.target.value });
                  }}
                  style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E5E5", fontSize: 13, fontFamily: "inherit", width: "100%" }}
                />
              </div>
              <div style={{ fontSize: 11, color: "#9A9A9A", marginTop: 6 }}>{lang === "fr" ? "Cliquez en dehors du champ pour sauvegarder" : "Click outside the field to save"}</div>
            </div>
            {selectedCreatorPayout.discount_code && (
              <div style={{ marginBottom: 20, background: "#F8F8F8", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, color: "#9A9A9A" }}>{lang === "fr" ? "Code de réduction" : "Discount code"}</div>
                  <div style={{ fontWeight: 600, fontSize: 14, fontFamily: "monospace" }}>{selectedCreatorPayout.discount_code}</div>
                </div>
                <button type="button" onClick={() => navigator.clipboard.writeText(selectedCreatorPayout.discount_code)} style={{ background: "none", border: "1px solid #E5E5E5", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                  {lang === "fr" ? "Copier" : "Copy"}
                </button>
              </div>
            )}
            <button
              type="button"
              disabled={!selectedCreatorPayout.balance || selectedCreatorPayout.balance <= 0}
              onClick={() => {
                if (plan === "free") {
                  alert(lang === "fr" ? "Les paiements sont disponibles à partir du plan Basic." : "Payouts are available on Basic plan and above.");
                  return;
                }
                const amount = selectedCreatorPayout.balance;
                const creator = selectedCreatorPayout;
                if (!amount || amount <= 0) {
                  alert(lang === "fr" ? "Solde insuffisant" : "No balance to pay");
                  return;
                }
                if (creator.paypal_link) {
                  const clean = creator.paypal_link.replace("https://paypal.me/", "").replace("paypal.me/", "");
                  window.open(`https://paypal.me/${clean}/${amount}`, '_blank');
                } else if (creator.revolut_link) {
                  const clean = creator.revolut_link.replace("https://revolut.me/", "").replace("revolut.me/", "");
                  window.open(`https://revolut.me/${clean}`, '_blank');
                } else if (creator.iban) {
                  navigator.clipboard.writeText(creator.iban);
                  alert(lang === "fr" ? `IBAN copié ✓\nMontant: ${formatCurrency(amount, lang)}` : `IBAN copied ✓\nAmount: ${formatCurrency(amount, lang)}`);
                } else {
                  alert(lang === "fr" ? "Ajoutez d'abord une méthode de paiement" : "Add a payment method first");
                }
              }}
              style={{
                width: "100%",
                padding: "14px",
                background: selectedCreatorPayout.balance > 0 ? "#0047FF" : "#E5E5E5",
                color: selectedCreatorPayout.balance > 0 ? "#fff" : "#9A9A9A",
                border: "none",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: selectedCreatorPayout.balance > 0 ? "pointer" : "not-allowed",
                fontFamily: "inherit",
                letterSpacing: "-0.02em"
              }}
            >
              {selectedCreatorPayout.balance > 0
                ? `${lang === "fr" ? "Payer" : "Pay"} ${formatCurrency(selectedCreatorPayout.balance, lang)}`
                : lang === "fr" ? "Aucun solde à payer" : "No balance to pay"
              }
            </button>
          </div>
        </div>
      )}
        </>
        )}

      {payoutModal === "addFunds" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }} onClick={() => setPayoutModal(null)}>
          <div style={{ background: "#FFFFFF", borderRadius: 16, padding: 28, maxWidth: 440, width: "100%", boxShadow: "0 24px 48px rgba(0,0,0,0.12)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: "0 0 8px 0" }}>{lang === "fr" ? "Ajouter des fonds" : "Add money to balance"}</h3>
            <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: "0 0 20px 0", lineHeight: 1.5 }}>Current balance: {formatCurrency(balance, lang)}</p>
            {!defaultPaymentMethod ? (
              <>
                <p style={{ fontSize: 14, color: "#1A1A1A", letterSpacing: "-0.02em", margin: "0 0 16px 0" }}>Add a payment method before you can fund your balance.</p>
                <button type="button" onClick={() => setAddPaymentForFunds(true)} style={{ ...payoutsBtnPrimary, width: "100%" }}>Add a payment method</button>
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

      {addPaymentForFunds && (
        <AddPaymentMethodModal
          onClose={() => setAddPaymentForFunds(false)}
          onAdded={() => setPayMessage("Payment method connected. You can add funds now.")}
        />
      )}


      </div>
    </>
  );
}

export function PayoutsWorkspacePaymentCard({ onOpenAddPayment }: { onOpenAddPayment?: () => void }) {
  const lang = useLang();
  const { methods, removeMethod } = usePaymentMethods();
  const defaultMethod = getDefaultPaymentMethod(methods);
  const [addOpen, setAddOpen] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const openAdd = () => {
    setAddOpen(true);
    onOpenAddPayment?.();
  };

  const confirmRemove = () => {
    if (!removeId) return;
    removeMethod(removeId);
    setRemoveId(null);
    setToast("Payment method removed ✓");
  };

  return (
    <>
      <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 24 }}>
        <div style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 8 }}>{lang === "fr" ? "Votre méthode de paiement" : "Your payment method"}</div>
        {!defaultMethod ? (
          <>
            <div style={{ fontSize: 14, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 16 }}>No card connected</div>
            <button type="button" onClick={openAdd} style={{ ...pmBtnSecondary, width: "100%" }}>
              Connect a card or bank
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
                <div style={{ fontSize: 12, color: "#9A9A9A", marginTop: 2 }}>{lang === "fr" ? "Expire" : "Expires"} {defaultMethod.expiry}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={openAdd} className="hero-cta-shopify-light hero-cta-compact-sm" style={{ flex: 1 }}>
                {lang === "fr" ? "Mettre à jour" : "Update payment method"}
              </button>
              <button
                type="button"
                onClick={() => setRemoveId(defaultMethod.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#DC2626",
                  fontSize: 13,
                  fontWeight: 500,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  padding: "10px 8px",
                }}
              >
                {lang === "fr" ? "Supprimer" : "Remove"}
              </button>
            </div>
          </>
        )}
      </div>

      {addOpen && (
        <AddPaymentMethodModal
          onClose={() => setAddOpen(false)}
          onAdded={() => setToast("Card added ✓")}
        />
      )}
      {removeId && <RemovePaymentMethodModal onClose={() => setRemoveId(null)} onConfirm={confirmRemove} />}
      {toast && <PaymentToast message={toast} />}
    </>
  );
}
