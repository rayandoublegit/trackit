"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
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

function formatUsd(amount: number) {
  return `$${amount.toFixed(2)}`;
}

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

export function LiveSalesFeed() {
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
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
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
      <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }} aria-hidden>
        🛍️
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 4 }}>
          {lang === "fr" ? "Une vente de" : "A sale of"} {formatUsd(sale.amount)} {lang === "fr" ? "vient d'arriver" : "just dropped"}
        </div>
        <div style={{ fontSize: 12, color: "#7A7A7A", letterSpacing: "-0.01em", marginBottom: 8, lineHeight: 1.45 }}>
          {lang === "fr" ? "Répartition :" : "Split:"} {formatUsd(creatorShare)} {lang === "fr" ? "pour" : "for"} @{sale.creatorHandle} · {formatUsd(brandShare)} {lang === "fr" ? "conservé" : "kept"}
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
  owed: string;
  hasPaymentMethod: boolean;
  paymentLabel?: string;
};

const PAYOUT_PARTNERS_SEED: PayoutPartner[] = [
  { id: "1", name: "Alex Rivera", handle: "@alexcreates", owed: "$124.50", hasPaymentMethod: true, paymentLabel: "PayPal · alex@email.com" },
  { id: "2", name: "Jordan Lee", handle: "@jordanlee", owed: "$89.00", hasPaymentMethod: false },
  { id: "3", name: "Sam Taylor", handle: "@samtaylor", owed: "$210.25", hasPaymentMethod: true, paymentLabel: "Bank · •••• 4821" },
  { id: "4", name: "Morgan Kim", handle: "@morgankim", owed: "$56.75", hasPaymentMethod: false },
];

function formatPayoutBalanceUsd(amount: number) {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
    owed: formatPayoutBalanceUsd(Number(c.balance) || 0),
    hasPaymentMethod: false,
  };
}

function PayoutsPageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: "32px 40px 24px 40px", borderBottom: "1px solid #EFEFEF", background: "#FFFFFF" }}>
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
}: {
  plan: "free" | "basic" | "pro";
  onUpgrade: () => void;
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

  useEffect(() => {
    const load = async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("creators")
        .select("id, handle, full_name, avatar_url, platform, balance, total_earned, total_sales, discount_code")
        .eq("user_id", user.id)
        .gt("balance", 0)
        .order("balance", { ascending: false });
      if (data && data.length > 0) setCreators(data);
    };
    void load();
  }, []);

  const tablePartners = useMemo(
    () => (creators.length > 0 ? creators.map((c) => mapDbCreatorToPartner(c, lang)) : partners),
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
      setPayMessage(`Payment of ${partner.owed} sent to ${partner.name}.`);
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
    setPayMessage(`${formatPayoutBalanceUsd(amount)} added to your balance.`);
  };

  const parsedFundAmount = parseFloat(fundAmount.replace(/[^0-9.]/g, ""));
  const canAddFunds = defaultPaymentMethod !== null && parsedFundAmount > 0;
  const chargingLabel = defaultPaymentMethod ? `${defaultPaymentMethod.brand} ···· ${defaultPaymentMethod.last4}` : null;

  return (
    <>
      <PayoutsPageHeader title={lang === "fr" ? "Paiements" : "Payouts"} subtitle={lang === "fr" ? "Suivez les commissions et payez les créateurs automatiquement lors des ventes Shopify" : "Track commissions and pay creators automatically when Shopify sales come in"} />
      <div style={{ padding: 40, position: "relative" }}>
        {plan === "free" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 20,
              background: "rgba(255,255,255,0.92)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
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
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, marginBottom: 20 }}>
          <div style={{ background: "#0047FF", color: "#FFFFFF", borderRadius: 16, padding: 28 }}>
            <div style={{ fontSize: 12, opacity: 0.8, letterSpacing: "-0.01em", marginBottom: 6 }}>{lang === "fr" ? "Votre solde" : "Your balance"}</div>
            <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.04em", marginBottom: 18 }}>{formatPayoutBalanceUsd(balance)}</div>
            <button type="button" onClick={openAddFunds} className="hero-cta-shopify">{lang === "fr" ? "Ajouter des fonds" : "Add money to balance"}</button>
          </div>
          <PayoutsWorkspacePaymentCard />
        </div>

        <LiveSalesFeed />

        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 20, marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 2 }}>{lang === "fr" ? "Automatiser les paiements" : "Automate payouts"}</div>
            <div style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em" }}>{lang === "fr" ? "Quand une vente Shopify est détectée, payez automatiquement la commission au créateur" : "When a Shopify sale is detected, automatically pay the creator their commission"}</div>
          </div>
          <PayoutsToggle on={false} />
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
                This partner has no payout method on file. Add one before you can pay {registering.owed}.
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

          <div style={{ display: "flex", flexDirection: "column" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em" }}>No partners match your search</div>
            ) : (
              filtered.map((partner, i) => (
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
                    {partner.hasPaymentMethod ? (
                      <div style={{ fontSize: 11, color: "#7A7A7A", marginTop: 4, letterSpacing: "-0.01em" }}>{partner.paymentLabel}</div>
                    ) : (
                      <div style={{ fontSize: 11, color: "#C45C00", marginTop: 4, letterSpacing: "-0.01em" }}>No payment method</div>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginRight: 8 }}>{partner.owed}</div>
                  <button
                    type="button"
                    onClick={() => handlePayClick(partner)}
                    disabled={payingId === partner.id || registeringId === partner.id}
                    style={{ ...payoutsBtnPrimary, minWidth: 72, opacity: payingId === partner.id ? 0.7 : 1 }}
                  >
                    {payingId === partner.id ? "Paying…" : lang === "fr" ? "Payer" : "Pay"}
                  </button>
                </div>
              ))
            )}
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

      {payoutModal === "addFunds" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }} onClick={() => setPayoutModal(null)}>
          <div style={{ background: "#FFFFFF", borderRadius: 16, padding: 28, maxWidth: 440, width: "100%", boxShadow: "0 24px 48px rgba(0,0,0,0.12)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: "0 0 8px 0" }}>{lang === "fr" ? "Ajouter des fonds" : "Add money to balance"}</h3>
            <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: "0 0 20px 0", lineHeight: 1.5 }}>Current balance: {formatPayoutBalanceUsd(balance)}</p>
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
                    <button key={amt} type="button" onClick={() => setFundAmount(String(amt))} style={{ ...payoutsBtnSecondary, padding: "6px 12px", fontSize: 12 }}>${amt}</button>
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
              <button type="button" onClick={openAdd} style={{ ...pmBtnSecondary, flex: 1 }}>
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
