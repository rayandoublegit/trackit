"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import {
  NOTE_COLORS,
  createWorkspaceNote,
  loadNotesPanelOpen,
  loadWorkspaceNotes,
  saveNotesPanelOpen,
  saveWorkspaceNotes,
  type WorkspaceNote,
  type WorkspaceNoteColor,
} from "@/lib/workspace-notes-storage";

const COLOR_ORDER: WorkspaceNoteColor[] = ["yellow", "blue", "green", "pink", "purple"];

function nextColor(notes: WorkspaceNote[]): WorkspaceNoteColor {
  const used = notes.map((n) => n.color);
  return COLOR_ORDER.find((c) => !used.includes(c)) ?? COLOR_ORDER[notes.length % COLOR_ORDER.length];
}

function StickyNote({
  note,
  lang,
  onChange,
  onDelete,
  canDelete,
  compact,
}: {
  note: WorkspaceNote;
  lang: "en" | "fr";
  onChange: (next: WorkspaceNote) => void;
  onDelete: () => void;
  canDelete: boolean;
  compact?: boolean;
}) {
  const palette = NOTE_COLORS[note.color];

  return (
    <div
      style={{
        background: palette.bg,
        borderRadius: 4,
        boxShadow: `0 4px 14px ${palette.shadow}, 0 1px 0 rgba(255,255,255,0.5) inset`,
        minHeight: compact ? 180 : 220,
        display: "flex",
        flexDirection: "column",
        transform: `rotate(${note.id.charCodeAt(note.id.length - 1) % 2 === 0 ? -0.6 : 0.6}deg)`,
        transition: "transform 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "rotate(0deg) scale(1.01)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = `rotate(${note.id.charCodeAt(note.id.length - 1) % 2 === 0 ? -0.6 : 0.6}deg) scale(1)`;
      }}
    >
      <div
        style={{
          background: palette.header,
          padding: compact ? "8px 10px" : "10px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid rgba(0,0,0,0.06)",
        }}
      >
        <input
          type="text"
          value={note.title}
          onChange={(e) => onChange({ ...note, title: e.target.value, updatedAt: Date.now() })}
          placeholder={lang === "fr" ? "Titre" : "Title"}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: compact ? 13 : 14,
            fontWeight: 600,
            color: "#1A1A1A",
            fontFamily: "inherit",
            letterSpacing: "-0.02em",
          }}
        />
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {COLOR_ORDER.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              onClick={() => onChange({ ...note, color, updatedAt: Date.now() })}
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: note.color === color ? "2px solid #1A1A1A" : "1px solid rgba(0,0,0,0.15)",
                background: NOTE_COLORS[color].bg,
                cursor: "pointer",
                padding: 0,
              }}
            />
          ))}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={lang === "fr" ? "Supprimer" : "Delete"}
              style={{
                width: 22,
                height: 22,
                border: "none",
                background: "rgba(0,0,0,0.06)",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
                color: "#5A5A5A",
                marginLeft: 2,
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>
      <textarea
        value={note.content}
        onChange={(e) => onChange({ ...note, content: e.target.value, updatedAt: Date.now() })}
        placeholder={
          lang === "fr"
            ? "Objectifs, idées, priorités…"
            : "Goals, ideas, priorities…"
        }
        style={{
          flex: 1,
          width: "100%",
          boxSizing: "border-box",
          border: "none",
          outline: "none",
          resize: "none",
          background: "transparent",
          padding: compact ? "10px 12px 12px" : "12px 14px 14px",
          fontSize: compact ? 13 : 14,
          lineHeight: 1.65,
          color: "#1A1A1A",
          fontFamily: "inherit",
          letterSpacing: "-0.01em",
          minHeight: compact ? 120 : 150,
        }}
      />
    </div>
  );
}

export function WorkspaceNotes({
  userId,
  isMobile,
  variant = "page",
  defaultOpen = true,
}: {
  userId?: string;
  isMobile?: boolean;
  variant?: "page" | "widget";
  defaultOpen?: boolean;
}) {
  const lang = useLang();
  const [notes, setNotes] = useState<WorkspaceNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [open, setOpen] = useState(defaultOpen);
  const resolvedUserIdRef = useRef<string | null>(userId ?? null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback((next: WorkspaceNote[], uid: string) => {
    saveWorkspaceNotes(uid, next);
    setSavedAt(Date.now());
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      let uid = userId;
      if (!uid && supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id;
      }
      if (!uid) {
        if (!cancelled) setLoading(false);
        return;
      }
      resolvedUserIdRef.current = uid;
      const stored = loadWorkspaceNotes(uid);
      if (!cancelled) {
        setNotes(stored);
        if (variant === "widget") {
          setOpen(loadNotesPanelOpen(uid));
        }
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, variant]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const scheduleSave = (next: WorkspaceNote[]) => {
    const uid = resolvedUserIdRef.current;
    if (!uid) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => persist(next, uid), 500);
  };

  const updateNotes = (next: WorkspaceNote[]) => {
    setNotes(next);
    scheduleSave(next);
  };

  const toggleOpen = () => {
    const uid = resolvedUserIdRef.current;
    const next = !open;
    setOpen(next);
    if (uid && variant === "widget") saveNotesPanelOpen(uid, next);
  };

  const addNote = () => {
    updateNotes([...notes, createWorkspaceNote({ color: nextColor(notes) })]);
  };

  const savedLabel = savedAt ? (lang === "fr" ? "Enregistré" : "Saved") : null;

  if (loading) {
    return (
      <div style={{ fontSize: 14, color: "#9A9A9A", padding: variant === "page" ? 0 : "8px 0" }}>
        {lang === "fr" ? "Chargement…" : "Loading…"}
      </div>
    );
  }

  const notesGrid = (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(240px, 1fr))",
        gap: variant === "widget" ? 16 : 20,
      }}
    >
      {notes.map((note) => (
        <StickyNote
          key={note.id}
          note={note}
          lang={lang}
          compact={variant === "widget"}
          canDelete={notes.length > 1}
          onChange={(next) => updateNotes(notes.map((n) => (n.id === next.id ? next : n)))}
          onDelete={() => updateNotes(notes.filter((n) => n.id !== note.id))}
        />
      ))}
      <button
        type="button"
        onClick={addNote}
        style={{
          minHeight: variant === "widget" ? 180 : 220,
          borderRadius: 4,
          border: "2px dashed rgba(0,0,0,0.12)",
          background: "#FAFAFA",
          color: "#7A7A7A",
          fontSize: 14,
          fontWeight: 500,
          fontFamily: "inherit",
          cursor: "pointer",
          letterSpacing: "-0.01em",
        }}
      >
        + {lang === "fr" ? "Nouvelle note" : "New note"}
      </button>
    </div>
  );

  if (variant === "widget") {
    return (
      <div style={{ marginBottom: 24 }}>
        <button
          type="button"
          onClick={toggleOpen}
          style={{
            display: "flex",
            width: "100%",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: 0,
            marginBottom: open ? 16 : 0,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontFamily: "inherit",
            textAlign: "left",
          }}
        >
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", margin: 0, marginBottom: 4 }}>
              {lang === "fr" ? "Notes" : "Notes"}
            </h3>
            <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0, letterSpacing: "-0.01em" }}>
              {lang === "fr"
                ? "Vos objectifs et idées — sauvegarde automatique."
                : "Your goals and ideas — auto-saved."}
            </p>
          </div>
          <span style={{ fontSize: 12, color: "#9A9A9A", flexShrink: 0 }}>
            {open ? (lang === "fr" ? "Masquer" : "Hide") : (lang === "fr" ? "Afficher" : "Show")}
          </span>
        </button>
        {open && notesGrid}
        {open && savedLabel && (
          <p style={{ fontSize: 12, color: "#9A9A9A", margin: "12px 0 0", letterSpacing: "-0.01em" }}>
            {savedLabel}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {notesGrid}
      <p style={{ fontSize: 12, color: "#9A9A9A", margin: "16px 0 0", letterSpacing: "-0.01em" }}>
        {lang === "fr"
          ? `Sauvegarde automatique sur cet appareil.${savedLabel ? ` · ${savedLabel}` : ""}`
          : `Auto-saved on this device.${savedLabel ? ` · ${savedLabel}` : ""}`}
      </p>
    </>
  );
}
