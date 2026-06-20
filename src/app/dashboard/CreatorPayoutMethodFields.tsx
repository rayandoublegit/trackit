"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export type PayoutMethodType = "paypal" | "revolut" | "iban";

export type CreatorPayoutFields = {
  id: string;
  paypal_link?: string | null;
  revolut_link?: string | null;
  iban?: string | null;
};

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

function defaultPayoutMethodType(c: CreatorPayoutFields): PayoutMethodType {
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

export function creatorHasPayoutDetails(c: { paypal_link?: string | null; revolut_link?: string | null; iban?: string | null }) {
  return Boolean(c.paypal_link || c.revolut_link || c.iban);
}

export function CreatorPayoutMethodFields({
  creator,
  lang,
  onUpdate,
}: {
  creator: CreatorPayoutFields;
  lang: "en" | "fr";
  onUpdate: (next: CreatorPayoutFields) => void;
}) {
  const [method, setMethod] = useState<PayoutMethodType>(() => defaultPayoutMethodType(creator));
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMethod(defaultPayoutMethodType(creator));
    setOpen(false);
  }, [creator.id, creator.paypal_link, creator.revolut_link, creator.iban]);

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
