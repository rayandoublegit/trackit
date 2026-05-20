"use client";

import { useMemo, useState } from "react";
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

function formatRelativeTime(minutesAgo: number) {
  if (minutesAgo < 1) return "Just now";
  if (minutesAgo === 1) return "1 minute ago";
  if (minutesAgo < 60) return `${minutesAgo} minutes ago`;
  const hours = Math.floor(minutesAgo / 60);
  if (hours === 1) return "1 hour ago";
  return `${hours} hours ago`;
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
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: "0 0 4px" }}>Live Sales Feed</h2>
            <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0, letterSpacing: "-0.01em" }}>Every sale tracked from your creators in real time.</p>
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
              {paused ? "Resume feed" : "Pause feed"}
            </button>
            <button type="button" onClick={simulateSale} disabled={paused} style={{ ...btnOutline, opacity: paused ? 0.45 : 1, cursor: paused ? "not-allowed" : "pointer" }}>
              Simulate sale
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
              Remove notifications
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
  sale,
  creatorShare,
  brandShare,
  animateIn,
  onRemove,
}: {
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
          A sale of {formatUsd(sale.amount)} just dropped
        </div>
        <div style={{ fontSize: 12, color: "#7A7A7A", letterSpacing: "-0.01em", marginBottom: 8, lineHeight: 1.45 }}>
          Split: {formatUsd(creatorShare)} for @{sale.creatorHandle} · {formatUsd(brandShare)} kept
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#9A9A9A" }}>{formatRelativeTime(sale.minutesAgo)}</span>
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
          View order
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
          Remove notification
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
          {method.brand} ending in {method.last4}
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
          Remove
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

export function PayoutsWorkspacePaymentCard({ onOpenAddPayment }: { onOpenAddPayment?: () => void }) {
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
        <div style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 8 }}>Your payment method</div>
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
                <div style={{ fontSize: 12, color: "#9A9A9A", marginTop: 2 }}>Expires {defaultMethod.expiry}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={openAdd} style={{ ...pmBtnSecondary, flex: 1 }}>
                Update payment method
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
                Remove
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
