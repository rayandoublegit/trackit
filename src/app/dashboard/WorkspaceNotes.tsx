"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import {
  createWorkspaceNote,
  loadNotesPanelOpen,
  loadWorkspaceNotes,
  saveNotesPanelOpen,
  saveWorkspaceNotes,
} from "@/lib/workspace-notes-storage";

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
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(defaultOpen);
  const resolvedUserIdRef = useRef<string | null>(userId ?? null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback((text: string, uid: string) => {
    saveWorkspaceNotes(uid, [{ ...createWorkspaceNote(), content: text, updatedAt: Date.now() }]);
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
        setContent(stored.map((n) => n.content).filter(Boolean).join("\n\n"));
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

  const scheduleSave = (text: string) => {
    const uid = resolvedUserIdRef.current;
    if (!uid) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => persist(text, uid), 500);
  };

  const handleChange = (text: string) => {
    setContent(text);
    scheduleSave(text);
  };

  const toggleOpen = () => {
    const uid = resolvedUserIdRef.current;
    const next = !open;
    setOpen(next);
    if (uid && variant === "widget") saveNotesPanelOpen(uid, next);
  };

  if (loading) {
    return (
      <div style={{ fontSize: 14, color: "#9A9A9A", padding: variant === "page" ? 0 : "8px 0" }}>
        {lang === "fr" ? "Chargement…" : "Loading…"}
      </div>
    );
  }

  const textBlock = (
    <textarea
      value={content}
      onChange={(e) => handleChange(e.target.value)}
      placeholder={
        lang === "fr"
          ? "Objectifs, idées, priorités…"
          : "Goals, ideas, priorities…"
      }
      style={{
        width: "100%",
        minHeight:
          variant === "widget"
            ? 180
            : isMobile
              ? 360
              : "calc(100vh - 200px)",
        boxSizing: "border-box",
        border: "1px solid #EFEFEF",
        borderRadius: 12,
        outline: "none",
        resize: "vertical",
        background: "#FAFAFA",
        padding: variant === "widget" ? "14px 16px" : "20px 24px",
        fontSize: 14,
        lineHeight: 1.65,
        color: "#1A1A1A",
        fontFamily: "inherit",
        letterSpacing: "-0.01em",
        display: "block",
      }}
    />
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
                ? "Vos objectifs, idées et priorités."
                : "Your goals, ideas, and priorities."}
            </p>
          </div>
          <span style={{ fontSize: 12, color: "#9A9A9A", flexShrink: 0 }}>
            {open ? (lang === "fr" ? "Masquer" : "Hide") : (lang === "fr" ? "Afficher" : "Show")}
          </span>
        </button>
        {open && textBlock}
      </div>
    );
  }

  return textBlock;
}
