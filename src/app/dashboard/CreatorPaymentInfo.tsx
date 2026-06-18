"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";

const BLUE = "#0047FF";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.1)",
  fontSize: 15,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
  marginBottom: 14,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: "rgba(0,0,0,0.55)",
  marginBottom: 6,
  letterSpacing: "-0.01em",
};

export function CreatorPaymentInfo({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const [accountHolder, setAccountHolder] = useState("");
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!supabase || !userId) { setLoading(false); return; }
      try {
        const { data } = await supabase
          .from("creator_payment_info")
          .select("account_holder, bank_name, iban")
          .eq("creator_id", userId)
          .maybeSingle();
        if (!cancelled && data) {
          setAccountHolder(data.account_holder || "");
          setBankName(data.bank_name || "");
          setIban(data.iban || "");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [userId]);

  const handleSave = async () => {
    if (!supabase || !userId) return;
    setError("");
    setSaved(false);
    if (!accountHolder.trim() || !iban.trim()) {
      setError(lang === "fr" ? "Renseignez au moins le titulaire et l'IBAN." : "Please fill in at least the account holder and IBAN.");
      return;
    }
    setSaving(true);
    try {
      const { error: upErr } = await supabase
        .from("creator_payment_info")
        .upsert(
          {
            creator_id: userId,
            account_holder: accountHolder.trim(),
            bank_name: bankName.trim(),
            iban: iban.trim().replace(/\s+/g, ""),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "creator_id" }
        );
      if (upErr) { setError(upErr.message); return; }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ paddingLeft: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingTop: 24, paddingBottom: 48, background: "#FFFFFF" }}>
      <div style={{ maxWidth: 560 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.025em", marginBottom: 6 }}>
          {lang === "fr" ? "Mes coordonnées de paiement" : "My payment details"}
        </h2>
        <p style={{ fontSize: 14, color: "rgba(0,0,0,0.5)", lineHeight: 1.5, marginBottom: 28 }}>
          {lang === "fr"
            ? "Ces informations sont utilisées pour vous verser vos commissions. Elles restent confidentielles."
            : "These details are used to pay your commissions. They stay confidential."}
        </p>

        {loading ? (
          <div style={{ fontSize: 14, color: "rgba(0,0,0,0.4)" }}>{lang === "fr" ? "Chargement..." : "Loading..."}</div>
        ) : (
          <div>
            <label style={labelStyle}>{lang === "fr" ? "Titulaire du compte" : "Account holder"}</label>
            <input type="text" value={accountHolder} onChange={(e) => { setAccountHolder(e.target.value); setSaved(false); }} placeholder={lang === "fr" ? "Nom complet du titulaire" : "Full name of account holder"} style={inputStyle} />

            <label style={labelStyle}>{lang === "fr" ? "Nom de la banque" : "Bank name"}</label>
            <input type="text" value={bankName} onChange={(e) => { setBankName(e.target.value); setSaved(false); }} placeholder={lang === "fr" ? "Ex : BNP Paribas" : "e.g. Chase"} style={inputStyle} />

            <label style={labelStyle}>IBAN</label>
            <input type="text" value={iban} onChange={(e) => { setIban(e.target.value); setSaved(false); }} placeholder="FR76 ..." style={{ ...inputStyle, fontFamily: "monospace", letterSpacing: "0.04em" }} />

            {error && (
              <div style={{ fontSize: 14, color: "#992323", padding: "10px 12px", borderRadius: 10, background: "rgba(153,35,35,0.06)", marginBottom: 14 }}>{error}</div>
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
