"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useLang } from "@/lib/useLang";
import { workspaceStorageKey } from "@/lib/workspaces";

type PlannedCall = {
  id: string;
  title: string;
  when: string;
  withWho: string;
  notes: string;
};

function storageKey(userId?: string) {
  return workspaceStorageKey(`trackit.planner.calls.${userId || "anon"}`);
}

export function PlannerView({
  userId,
  isMobile,
  variant = "planner",
}: {
  userId?: string;
  isMobile?: boolean;
  variant?: "planner" | "meetings";
}) {
  const lang = useLang();
  const [calls, setCalls] = useState<PlannedCall[]>([]);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [withWho, setWithWho] = useState("");
  const isMeetings = variant === "meetings";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (raw) setCalls(JSON.parse(raw) as PlannedCall[]);
    } catch {
      /* ignore */
    }
  }, [userId]);

  const persist = (next: PlannedCall[]) => {
    setCalls(next);
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const addCall = () => {
    if (!title.trim() || !when) return;
    persist([
      {
        id: `${Date.now()}`,
        title: title.trim(),
        when,
        withWho: withWho.trim(),
        notes: "",
      },
      ...calls,
    ]);
    setTitle("");
    setWhen("");
    setWithWho("");
  };

  return (
    <div className="ws-page" style={{ padding: isMobile ? 16 : undefined }}>
      <h1>{isMeetings ? "Meetings" : lang === "fr" ? "Planner" : "Planner"}</h1>
      <p className="lead">
        {isMeetings
          ? lang === "fr"
            ? "Calls créateurs, briefings et follow-ups — ton agenda affiliation."
            : "Creator calls, briefings, and follow-ups — your affiliation calendar."
          : lang === "fr"
            ? "Planifiez vos calls créateurs, follow-ups et briefings — comme un agenda d’affiliation."
            : "Plan creator calls, follow-ups, and briefings — your affiliation calendar."}
      </p>

      <div className="ws-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>
          {isMeetings
            ? lang === "fr"
              ? "Nouveau meeting"
              : "New meeting"
            : lang === "fr"
              ? "Nouveau call"
              : "New call"}
        </h3>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr 1fr auto" }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={lang === "fr" ? "Titre (ex. Brief campagne été)" : "Title (e.g. Summer campaign brief)"}
            style={inputStyle}
          />
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={inputStyle} />
          <input
            value={withWho}
            onChange={(e) => setWithWho(e.target.value)}
            placeholder={lang === "fr" ? "Avec qui ?" : "With whom?"}
            style={inputStyle}
          />
          <button type="button" className="ws-sidebar__create" onClick={addCall}>
            {lang === "fr" ? "Ajouter" : "Add"}
          </button>
        </div>
      </div>

      <div className="ws-card-grid">
        {calls.length === 0 ? (
          <div className="ws-card">
            <h3>{lang === "fr" ? "Aucun call planifié" : "No calls planned"}</h3>
            <p>{lang === "fr" ? "Ajoutez votre premier call créateur ci-dessus." : "Add your first creator call above."}</p>
          </div>
        ) : (
          calls.map((call) => (
            <div key={call.id} className="ws-card">
              <h3>{call.title}</h3>
              <p>
                {new Date(call.when).toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}
                {call.withWho ? ` · ${call.withWho}` : ""}
              </p>
              <button
                type="button"
                onClick={() => persist(calls.filter((c) => c.id !== call.id))}
                style={{ ...linkBtn, marginTop: 10 }}
              >
                {lang === "fr" ? "Supprimer" : "Delete"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  border: "1px solid var(--ws-border)",
  background: "var(--ws-input)",
  color: "var(--ws-text)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const linkBtn: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--ws-accent)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
  fontFamily: "inherit",
};
