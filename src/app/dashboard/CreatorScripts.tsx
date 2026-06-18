"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/useLang";

const BLUE = "#0047FF";

type Script = {
  id: string;
  title: string;
  content: string | null;
  file_url: string | null;
  created_at: string;
  brandName: string;
  status: string | null;
};

export function CreatorScripts({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);

  const load = async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/creator/scripts?userId=${userId}`);
      const data = await res.json();
      if (data?.ok) setScripts(data.scripts || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [userId]);

  const markDone = async (scriptId: string) => {
    if (!userId) return;
    setMarking(scriptId);
    try {
      await fetch("/api/creator/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, scriptId, status: "done" }),
      });
      setScripts((list) => list.map((s) => (s.id === scriptId ? { ...s, status: "done" } : s)));
    } finally {
      setMarking(null);
    }
  };

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; }
  };

  return (
    <div style={{ paddingLeft: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, paddingTop: 24, paddingBottom: 48, background: "#FFFFFF", minHeight: "100vh" }}>
      <div style={{ maxWidth: 760 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", margin: 0, letterSpacing: "-0.04em" }}>{lang === "fr" ? "Scripts" : "Scripts"}</h1>
        <p style={{ fontSize: 14, color: "#7A7A7A", margin: "6px 0 28px" }}>{lang === "fr" ? "Les scripts et briefs envoyés par la marque." : "Scripts and briefs sent by the brand."}</p>

        {loading ? (
          <div style={{ color: "#9A9A9A", fontSize: 14 }}>{lang === "fr" ? "Chargement..." : "Loading..."}</div>
        ) : scripts.length === 0 ? (
          <div style={{ border: "1px solid #EFEFEF", borderRadius: 16, padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", marginBottom: 6 }}>{lang === "fr" ? "Aucun script pour le moment" : "No scripts yet"}</div>
            <p style={{ fontSize: 14, color: "rgba(0,0,0,0.45)", margin: 0 }}>{lang === "fr" ? "Vous verrez ici les scripts envoyés par la marque." : "Scripts sent by the brand will appear here."}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {scripts.map((s) => (
              <div key={s.id} style={{ border: "1px solid #EFEFEF", borderRadius: 14, padding: "18px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 4 }}>{s.title}</div>
                    <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: s.content ? 10 : 0 }}>
                      {fmtDate(s.created_at)}{s.brandName ? ` · ${s.brandName}` : ""}
                    </div>
                    {s.content && <p style={{ fontSize: 14, color: "rgba(0,0,0,0.7)", lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap" }}>{s.content}</p>}
                    {s.file_url && <a href={s.file_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10, fontSize: 14, color: BLUE, fontWeight: 500, textDecoration: "none" }}>{lang === "fr" ? "Voir le fichier joint" : "View attachment"} →</a>}
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {s.status === "done" ? (
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1A7F37", display: "flex", alignItems: "center", gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#1A7F37" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        {lang === "fr" ? "Fait" : "Done"}
                      </span>
                    ) : (
                      <button type="button" onClick={() => markDone(s.id)} disabled={marking === s.id} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${BLUE}`, background: "#FFFFFF", color: BLUE, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: marking === s.id ? "default" : "pointer", opacity: marking === s.id ? 0.6 : 1, whiteSpace: "nowrap" }}>
                        {lang === "fr" ? "Marquer comme fait" : "Mark as done"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
