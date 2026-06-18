"use client";

import { useState } from "react";
import { useLang } from "@/lib/useLang";

const BLUE = "#0047FF";

export function InvitationsView({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const generate = async () => {
    if (!userId) return;
    setLoading(true); setError(""); setCopied(false);
    try {
      const res = await fetch("/api/invites/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: userId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data?.token) {
        setError(data?.error || (lang === "fr" ? "Impossible de générer le lien." : "Could not generate the link."));
        return;
      }
      setLink(`${window.location.origin}/invite/${data.token}`);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  return (
    <div style={{ paddingLeft: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingTop: 32, paddingBottom: 48, background: "#FFFFFF", minHeight: "100vh", flex: 1 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: isMobile ? 24 : 28, fontWeight: 650, color: "#1A1A1A", letterSpacing: "-0.035em", margin: "0 0 8px" }}>{lang === "fr" ? "Inviter un créateur" : "Invite a creator"}</h1>
          <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", letterSpacing: "-0.01em", margin: 0, lineHeight: 1.5 }}>
            {lang === "fr" ? "Générez un lien d'invitation. Le créateur s'inscrit, accède à son espace et reçoit ses commissions." : "Generate an invite link. The creator signs up, gets their own space and receives their commissions."}
          </p>
        </div>

        <div style={{ border: "1px solid #EFEFEF", borderRadius: 16, padding: isMobile ? 22 : 28 }}>
          {!link ? (
            <button type="button" onClick={generate} disabled={loading} style={{ width: "100%", padding: "14px 20px", borderRadius: 12, border: "none", background: BLUE, color: "#FFFFFF", fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: loading ? "default" : "pointer", letterSpacing: "-0.01em", opacity: loading ? 0.7 : 1 }}>
              {loading ? (lang === "fr" ? "Génération..." : "Generating...") : (lang === "fr" ? "Générer un lien d'invitation" : "Generate an invite link")}
            </button>
          ) : (
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "rgba(0,0,0,0.55)", marginBottom: 8, letterSpacing: "-0.01em" }}>{lang === "fr" ? "Votre lien d'invitation" : "Your invite link"}</label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input type="text" readOnly value={link} onFocus={(e) => e.target.select()} style={{ flex: "1 1 280px", minWidth: 0, padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.1)", fontSize: 14, fontFamily: "monospace", outline: "none", boxSizing: "border-box", color: "#1A1A1A" }} />
                <button type="button" onClick={copy} style={{ padding: "12px 22px", borderRadius: 12, border: "none", background: copied ? "#1A7F37" : BLUE, color: "#FFFFFF", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
                  {copied ? (lang === "fr" ? "Copié" : "Copied") : (lang === "fr" ? "Copier" : "Copy")}
                </button>
              </div>
              <button type="button" onClick={() => { setLink(""); setCopied(false); }} style={{ marginTop: 16, background: "none", border: "none", color: BLUE, fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", padding: 0, letterSpacing: "-0.01em" }}>
                {lang === "fr" ? "Générer un nouveau lien" : "Generate a new link"}
              </button>
            </div>
          )}
          {error && (
            <div style={{ marginTop: 16, fontSize: 14, color: "#992323", padding: "10px 12px", borderRadius: 10, background: "rgba(153,35,35,0.06)" }}>{error}</div>
          )}
        </div>

        <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid #EFEFEF", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", letterSpacing: "-0.01em" }}>{lang === "fr" ? "Propulsé par" : "Powered by"}</span>
          <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="Trackit" style={{ height: 18, width: "auto", opacity: 0.85 }} />
        </div>
      </div>
    </div>
  );
}
