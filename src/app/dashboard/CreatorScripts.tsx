"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/useLang";

const BLUE = "var(--ws-accent)";

type Script = {
  id: string;
  title: string;
  content: string | null;
  file_url: string | null;
  created_at: string;
  brandName: string;
  status: string | null;
};

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url);
}

export function CreatorScripts({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);

  const load = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/creator/scripts?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
      const data = await res.json();
      if (data?.ok) setScripts(data.scripts || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    if (!userId) return;
    const interval = setInterval(() => {
      void load();
    }, 20000);
    const onFocus = () => {
      void load();
    };
    const onScriptsUpdated = () => {
      void load();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("trackit:scripts-updated", onScriptsUpdated);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("trackit:scripts-updated", onScriptsUpdated);
    };
  }, [userId]);

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
    try {
      return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div style={{ minHeight: "100%", background: "var(--ws-surface)" }}>
      <div
        style={{
          paddingTop: isMobile ? 56 : 40,
          paddingRight: isMobile ? 16 : 40,
          paddingBottom: isMobile ? 16 : 24,
          paddingLeft: isMobile ? 16 : 40,
          borderBottom: "1px solid var(--ws-border)",
        }}
      >
        <h1 style={{ fontSize: isMobile ? 26 : 30, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.04em", margin: 0, marginBottom: 8 }}>
          Scripts
        </h1>
        <p style={{ fontSize: 15, color: "var(--ws-text-muted)", letterSpacing: "-0.02em", margin: 0, maxWidth: 560, lineHeight: 1.5 }}>
          {lang === "fr"
            ? "Briefs et scripts envoyés par la marque depuis votre fiche créateur."
            : "Briefs and scripts sent by the brand from your creator profile."}
        </p>
      </div>

      <div style={{ padding: isMobile ? "20px 16px 48px" : "32px 40px 48px", maxWidth: 820 }}>
        {loading ? (
          <div style={{ color: "var(--ws-text-dim)", fontSize: 14 }}>{lang === "fr" ? "Chargement…" : "Loading…"}</div>
        ) : scripts.length === 0 ? (
          <div style={{ border: "1px solid var(--ws-border)", borderRadius: 16, padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ws-text)", marginBottom: 6 }}>
              {lang === "fr" ? "Aucun script pour le moment" : "No scripts yet"}
            </div>
            <p style={{ fontSize: 14, color: "var(--ws-text-muted)", margin: 0, lineHeight: 1.5 }}>
              {lang === "fr"
                ? "Quand la marque vous envoie un script depuis « Gérer les créateurs », il apparaît ici."
                : "When the brand sends you a script from Manage creators, it appears here."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {scripts.map((s) => (
              <div key={s.id} style={{ border: "1px solid var(--ws-border)", borderRadius: 14, padding: "18px 20px", background: "var(--ws-surface)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em", marginBottom: 4 }}>{s.title}</div>
                    <div style={{ fontSize: 12, color: "var(--ws-text-dim)", marginBottom: s.content || s.file_url ? 10 : 0 }}>
                      {fmtDate(s.created_at)}
                      {s.brandName ? ` · ${s.brandName}` : ""}
                    </div>
                    {s.content && (
                      <p style={{ fontSize: 14, color: "var(--ws-text-muted)", lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap" }}>
                        {s.content}
                      </p>
                    )}
                    {s.file_url && isImageUrl(s.file_url) && (
                      <img
                        src={s.file_url}
                        alt=""
                        style={{ display: "block", marginTop: 12, maxWidth: "100%", maxHeight: 280, borderRadius: 12, border: "1px solid var(--ws-border)" }}
                      />
                    )}
                    {s.file_url && (
                      <a
                        href={s.file_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: "inline-block", marginTop: 10, fontSize: 14, color: BLUE, fontWeight: 500, textDecoration: "none" }}
                      >
                        {isImageUrl(s.file_url)
                          ? lang === "fr"
                            ? "Ouvrir l'image en grand"
                            : "Open full image"
                          : lang === "fr"
                            ? "Voir le fichier joint"
                            : "View attachment"}{" "}
                        →
                      </a>
                    )}
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {s.status === "done" ? (
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1A7F37", display: "flex", alignItems: "center", gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M5 13l4 4L19 7" stroke="#1A7F37" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {lang === "fr" ? "Fait" : "Done"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void markDone(s.id)}
                        disabled={marking === s.id}
                        className="hero-cta-raised-light"
                        style={{
                          padding: "8px 14px",
                          fontSize: 13,
                          opacity: marking === s.id ? 0.6 : 1,
                          whiteSpace: "nowrap",
                        }}
                      >
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
