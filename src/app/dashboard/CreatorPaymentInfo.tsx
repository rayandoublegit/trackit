"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";

const BLUE = "#0047FF";

type PayMethod = "paypal" | "revolut" | "iban";

const METHOD_OPTIONS: { id: PayMethod; label: string }[] = [
  { id: "paypal", label: "PayPal" },
  { id: "revolut", label: "Revolut" },
  { id: "iban", label: "IBAN" },
];

const FIELD_CONFIG: Record<PayMethod, { placeholder: string; prefix?: string }> = {
  paypal: { placeholder: "username", prefix: "paypal.me/" },
  revolut: { placeholder: "username", prefix: "revolut.me/" },
  iban: { placeholder: "FR76 1234 5678 9012 3456 7890 123" },
};

function stripHandle(raw: string, host: string): string {
  let v = raw.trim();
  v = v.replace(/^https?:\/\//i, "");
  v = v.replace(new RegExp("^" + host + "\\/", "i"), "");
  v = v.replace(/^@/, "");
  return v.trim();
}

function displayValue(method: PayMethod, stored: string): string {
  if (method === "paypal") return stripHandle(stored, "paypal\\.me");
  if (method === "revolut") return stripHandle(stored, "revolut\\.me");
  return stored;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid var(--ws-border)",
  fontSize: 15,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
  marginBottom: 14,
  background: "var(--ws-input)",
  color: "var(--ws-text)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: "var(--ws-text-muted)",
  marginBottom: 6,
  letterSpacing: "-0.01em",
};

export function CreatorPaymentInfo({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const [method, setMethod] = useState<PayMethod>("paypal");
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [bankName, setBankName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!userId) { setLoading(false); return; }
      try {
        const res = await fetch(`/api/creator/payment?userId=${userId}`);
        const data = await res.json();
        if (!cancelled && data?.ok) {
          // Determine la methode active selon ce qui est rempli en DB.
          if (data.paypal) { setMethod("paypal"); setValue(displayValue("paypal", data.paypal)); }
          else if (data.revolut) { setMethod("revolut"); setValue(displayValue("revolut", data.revolut)); }
          else if (data.iban) { setMethod("iban"); setValue(data.iban); }
          setAccountHolder(data.accountHolder || "");
          setBankName(data.bankName || "");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const handleSave = async () => {
    if (!userId) return;
    setError("");
    setSaved(false);
    if (!value.trim()) {
      setError(lang === "fr" ? "Renseignez vos coordonnées de paiement." : "Please fill in your payment details.");
      return;
    }
    if (method === "iban" && !accountHolder.trim()) {
      setError(lang === "fr" ? "Renseignez le titulaire du compte." : "Please fill in the account holder.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/creator/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          method,
          value: value.trim(),
          accountHolder: accountHolder.trim(),
          bankName: bankName.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) { setError(data?.error || (lang === "fr" ? "Échec de l'enregistrement." : "Save failed.")); return; }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const current = METHOD_OPTIONS.find((m) => m.id === method) ?? METHOD_OPTIONS[0];
  const config = FIELD_CONFIG[method];

  return (
    <div style={{ paddingLeft: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingTop: 24, paddingBottom: 48, background: "var(--ws-surface)" }}>
      <div style={{ maxWidth: 560 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.025em", marginBottom: 6, color: "var(--ws-text)" }}>
          {lang === "fr" ? "Mes coordonnées de paiement" : "My payment details"}
        </h2>
        <p style={{ fontSize: 14, color: "var(--ws-text-muted)", lineHeight: 1.5, marginBottom: 28 }}>
          {lang === "fr"
            ? "Ces informations sont utilisées pour vous verser vos commissions. Elles restent confidentielles."
            : "These details are used to pay your commissions. They stay confidential."}
        </p>

        {loading ? (
          <div style={{ fontSize: 14, color: "var(--ws-text-dim)" }}>{lang === "fr" ? "Chargement..." : "Loading..."}</div>
        ) : (
          <div ref={rootRef}>
            <label style={labelStyle}>{lang === "fr" ? "Moyen de paiement" : "Payment method"}</label>
            <div style={{ position: "relative", marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--ws-border)", background: "var(--ws-input)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
              >
                <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em" }}>{current.label}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                  <path d="M6 9l6 6 6-6" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {open && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--ws-surface)", border: "1px solid var(--ws-border)", borderRadius: 12, boxShadow: "var(--ws-shadow)", zIndex: 20, overflow: "hidden" }}>
                  {METHOD_OPTIONS.map((option, i) => {
                    const active = option.id === method;
                    return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => { setMethod(option.id); setValue(""); setOpen(false); setSaved(false); setError(""); }}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "none", borderBottom: i < METHOD_OPTIONS.length - 1 ? "1px solid var(--ws-border)" : "none", background: active ? BLUE : "var(--ws-surface)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
                    >
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: active ? "#FFFFFF" : "var(--ws-text)", letterSpacing: "-0.02em" }}>{option.label}</span>
                    </button>
                  );})}
                </div>
              )}
            </div>

            {method === "iban" && (
              <>
                <label style={labelStyle}>{lang === "fr" ? "Titulaire du compte" : "Account holder"}</label>
                <input type="text" value={accountHolder} onChange={(e) => { setAccountHolder(e.target.value); setSaved(false); }} placeholder={lang === "fr" ? "Nom complet du titulaire" : "Full name of account holder"} style={inputStyle} />

                <label style={labelStyle}>{lang === "fr" ? "Nom de la banque" : "Bank name"}</label>
                <input type="text" value={bankName} onChange={(e) => { setBankName(e.target.value); setSaved(false); }} placeholder={lang === "fr" ? "Ex : BNP Paribas" : "e.g. Chase"} style={inputStyle} />
              </>
            )}

            <label style={labelStyle}>{current.label}</label>
            <div style={{ display: "flex", alignItems: "stretch", marginBottom: 14, border: "1px solid var(--ws-border)", borderRadius: 12, overflow: "hidden", background: "var(--ws-input)" }}>
              {config.prefix && (
                <span style={{ display: "flex", alignItems: "center", padding: "0 12px", background: "var(--ws-surface-2)", borderRight: "1px solid var(--ws-border)", fontSize: 14, color: "var(--ws-text-dim)", whiteSpace: "nowrap" }}>{config.prefix}</span>
              )}
              <input
                type="text"
                value={value}
                onChange={(e) => { setValue(e.target.value); setSaved(false); }}
                placeholder={config.placeholder}
                style={{ flex: 1, padding: "12px 14px", border: "none", fontSize: 15, fontFamily: method === "iban" ? "monospace" : "inherit", letterSpacing: method === "iban" ? "0.04em" : "normal", outline: "none", boxSizing: "border-box", background: "transparent", color: "var(--ws-text)" }}
              />
            </div>

            {error && (
              <div style={{ fontSize: 14, color: "var(--ws-danger)", padding: "10px 12px", borderRadius: 10, background: "rgba(239,68,68,0.1)", marginBottom: 14 }}>{error}</div>
            )}
            {saved && (
              <div style={{ fontSize: 14, color: "#1A7F37", padding: "10px 12px", borderRadius: 10, background: "rgba(26,127,55,0.08)", marginBottom: 14 }}>
                {lang === "fr" ? "Coordonnées enregistrées." : "Details saved."}
              </div>
            )}

            <button type="button" onClick={handleSave} disabled={saving} style={{ width: "100%", padding: "13px 20px", borderRadius: 12, border: "none", background: BLUE, color: "#FFFFFF", fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: saving ? "default" : "pointer", letterSpacing: "-0.01em", opacity: saving ? 0.7 : 1 }}>
              {saving ? (lang === "fr" ? "Enregistrement..." : "Saving...") : (lang === "fr" ? "Enregistrer" : "Save")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
