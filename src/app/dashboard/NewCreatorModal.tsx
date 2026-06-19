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
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 13px",
    borderRadius: 10,
    border: "1px solid #E5E5E5",
    background: "#FFFFFF",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
    color: "#1A1A1A",
    letterSpacing: "-0.01em",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 500,
    color: "#6B6B6B",
    marginBottom: 6,
    letterSpacing: "-0.01em",
  };

  return (
    <>
      <style>{`
        .ncm-field:focus {
          border-color: #0047FF;
          box-shadow: 0 0 0 3px rgba(0, 71, 255, 0.12);
        }
      `}</style>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: 20,
        }}
      >
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: 20,
            border: "1px solid #EFEFEF",
            padding: "28px 28px 24px",
            maxWidth: 440,
            width: "100%",
            boxShadow: "0 24px 48px rgba(0,0,0,0.08), 0 8px 20px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                overflow: "hidden",
                background: "#FFFFFF",
                border: "1px solid #EFEFEF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {current.avatar_url ? (
                <img src={current.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 24, color: BLUE, fontWeight: 600, letterSpacing: "-0.02em" }}>
                  {displayName.replace("@", "").charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div style={{ minWidth: 0, paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: BLUE,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                {lang === "fr" ? "Bonne nouvelle !" : "Great news!"}
              </div>
              <h2
                style={{
                  fontSize: 19,
                  fontWeight: 650,
                  color: "#1A1A1A",
                  margin: "0 0 8px",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.25,
                }}
              >
                {lang === "fr" ? "Vous avez un nouveau créateur !" : "You have a new creator!"}
              </h2>
              <p
                style={{
                  fontSize: 13,
                  color: "#7A7A7A",
                  margin: 0,
                  lineHeight: 1.5,
                  letterSpacing: "-0.01em",
                }}
              >
                {lang === "fr" ? (
                  <>
                    <span style={{ color: "#1A1A1A", fontWeight: 600 }}>{displayName}</span>
                    {" "}vient de rejoindre via votre lien d&apos;invitation — complétez ses infos pour le lancer !
                  </>
                ) : (
                  <>
                    <span style={{ color: "#1A1A1A", fontWeight: 600 }}>{displayName}</span>
                    {" "}just joined via your invite link — complete their details to get them started!
                  </>
                )}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 22 }}>
            <div>
              <label style={labelStyle}>{lang === "fr" ? "Commission (%)" : "Commission (%)"}</label>
              <input type="number" value={commission} onChange={(e) => setCommission(e.target.value)} className="ncm-field" style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle}>{lang === "fr" ? "Code promo" : "Discount code"}</label>
              <input
                type="text"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder={lang === "fr" ? "Ex : SARAH10" : "e.g. SARAH10"}
                className="ncm-field"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>{lang === "fr" ? "Plateforme" : "Platform"}</label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="ncm-field" style={inputStyle}>
                <option value="tiktok">TikTok</option>
                <option value="instagram">Instagram</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              width: "100%",
              padding: "13px 20px",
              borderRadius: 10,
              border: "none",
              background: BLUE,
              color: "#FFFFFF",
              fontSize: 15,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: saving ? "default" : "pointer",
              letterSpacing: "-0.01em",
              opacity: saving ? 0.7 : 1,
              marginBottom: 8,
            }}
          >
            {saving ? (lang === "fr" ? "Enregistrement..." : "Saving...") : (lang === "fr" ? "Enregistrer le créateur !" : "Save creator!")}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={saving}
            style={{
              width: "100%",
              padding: "11px 20px",
              borderRadius: 10,
              border: "none",
              background: "transparent",
              color: "#7A7A7A",
              fontSize: 14,
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: saving ? "default" : "pointer",
              letterSpacing: "-0.01em",
            }}
          >
            {lang === "fr" ? "Ignorer pour l'instant" : "Skip for now"}
          </button>

          {queue.length > 1 && (
            <div style={{ marginTop: 14, fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em" }}>
              {lang === "fr" ? `+${queue.length - 1} autre(s) créateur(s) en attente !` : `+${queue.length - 1} more creator(s) waiting!`}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
