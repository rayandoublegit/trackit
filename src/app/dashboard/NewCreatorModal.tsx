"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/useLang";

const BLUE = "#0047FF";

type PendingCreator = {
  id: string;
  handle: string;
  full_name: string | null;
  avatar_url: string | null;
  platform: string | null;
  commission_rate: number | null;
  discount_code: string | null;
};

export function NewCreatorModal({ brandId }: { brandId?: string }) {
  const lang = useLang();
  const [queue, setQueue] = useState<PendingCreator[]>([]);
  const [commission, setCommission] = useState("10");
  const [discount, setDiscount] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [saving, setSaving] = useState(false);

  const current = queue[0];

  const load = async () => {
    if (!brandId) return;
    try {
      const res = await fetch(`/api/creators/pending-review?brandId=${brandId}`);
      const data = await res.json();
      if (data?.ok && Array.isArray(data.creators)) setQueue(data.creators);
    } catch {}
  };

  useEffect(() => {
    void load();
    if (!brandId) return;
    const interval = setInterval(() => { void load(); }, 15000);
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [brandId]);

  // Pré-remplit les champs quand un nouveau créateur arrive en tête de file
  useEffect(() => {
    if (current) {
      setCommission(current.commission_rate != null ? String(current.commission_rate) : "10");
      setDiscount(current.discount_code || "");
      setPlatform(current.platform || "tiktok");
    }
  }, [current?.id]);

  const next = () => setQueue((q) => q.slice(1));

  const handleSave = async () => {
    if (!brandId || !current) return;
    setSaving(true);
    try {
      await fetch("/api/creators/pending-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, creatorId: current.id, commissionRate: commission, discountCode: discount, platform }),
      });
      next();
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = async () => {
    if (!brandId || !current) return;
    setSaving(true);
    try {
      await fetch(`/api/creators/pending-review?creatorId=${current.id}&brandId=${brandId}`, { method: "DELETE" });
      next();
    } finally {
      setSaving(false);
    }
  };

  if (!current) return null;

  const displayName = current.full_name || `@${current.handle}`;
  const inputStyle: React.CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.1)", fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: "rgba(0,0,0,0.55)", marginBottom: 6, letterSpacing: "-0.01em" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: "#FFFFFF", borderRadius: 24, padding: 40, maxWidth: 480, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", overflow: "hidden", background: "#F2F2F2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
            {current.avatar_url ? (
              <img src={current.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 32, color: "#B5B5B5", fontWeight: 600 }}>{displayName.replace("@", "").charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: BLUE, letterSpacing: "0.02em", textTransform: "uppercase", marginBottom: 8 }}>
            {lang === "fr" ? "Nouveau créateur" : "New creator"}
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "#1A1A1A", margin: "0 0 8px", letterSpacing: "-0.03em" }}>{displayName}</h2>
          <p style={{ fontSize: 15, color: "rgba(0,0,0,0.55)", margin: 0, lineHeight: 1.5 }}>
            {lang === "fr"
              ? "a rejoint via votre lien d'invitation. Complétez ses informations pour finaliser."
              : "joined via your invite link. Complete their details to finish setup."}
          </p>
        </div>

        <label style={labelStyle}>{lang === "fr" ? "Commission (%)" : "Commission (%)"}</label>
        <input type="number" value={commission} onChange={(e) => setCommission(e.target.value)} style={{ ...inputStyle, marginBottom: 18 }} />

        <label style={labelStyle}>{lang === "fr" ? "Code promo" : "Discount code"}</label>
        <input type="text" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder={lang === "fr" ? "Ex : SARAH10" : "e.g. SARAH10"} style={{ ...inputStyle, marginBottom: 18 }} />

        <label style={labelStyle}>{lang === "fr" ? "Plateforme" : "Platform"}</label>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={{ ...inputStyle, marginBottom: 28 }}>
          <option value="tiktok">TikTok</option>
          <option value="instagram">Instagram</option>
        </select>

        <button type="button" onClick={handleSave} disabled={saving} style={{ width: "100%", padding: "14px 20px", borderRadius: 14, border: "none", background: BLUE, color: "#FFFFFF", fontSize: 16, fontWeight: 600, fontFamily: "inherit", cursor: saving ? "default" : "pointer", letterSpacing: "-0.01em", opacity: saving ? 0.7 : 1, marginBottom: 12 }}>
          {saving ? (lang === "fr" ? "Enregistrement..." : "Saving...") : (lang === "fr" ? "Enregistrer le créateur" : "Save creator")}
        </button>
        <button type="button" onClick={handleDismiss} disabled={saving} style={{ width: "100%", padding: "12px", borderRadius: 14, border: "none", background: "transparent", color: "rgba(0,0,0,0.5)", fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}>
          {lang === "fr" ? "Ignorer pour l'instant" : "Skip for now"}
        </button>

        {queue.length > 1 && (
          <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#9A9A9A" }}>
            {lang === "fr" ? `+${queue.length - 1} autre(s) en attente` : `+${queue.length - 1} more waiting`}
          </div>
        )}
      </div>
    </div>
  );
}
