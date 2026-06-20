"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import { loadWorkspaceNotes, saveWorkspaceNotes } from "@/lib/workspace-notes-storage";

function NotesPageHeader({
  isMobile,
  title,
  subtitle,
  savedLabel,
}: {
  isMobile?: boolean;
  title: string;
  subtitle?: string;
  savedLabel?: string | null;
}) {
  return (
    <div
      style={{
        paddingTop: isMobile ? 56 : 40,
        paddingRight: isMobile ? 16 : 40,
        paddingBottom: isMobile ? 16 : 24,
        paddingLeft: isMobile ? 16 : 40,
        borderBottom: "1px solid #EFEFEF",
        background: "#FFFFFF",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0, marginBottom: subtitle ? 6 : 0 }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0, maxWidth: 560, lineHeight: 1.5 }}>
              {subtitle}
            </p>
          )}
        </div>
        {savedLabel && (
          <span style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginTop: 8 }}>
            {savedLabel}
          </span>
        )}
      </div>
    </div>
  );
}

export function NotesView({ isMobile, userId }: { isMobile?: boolean; userId?: string }) {
  const lang = useLang();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedUserIdRef = useRef<string | null>(userId ?? null);

  const persist = useCallback((text: string, uid: string) => {
    saveWorkspaceNotes(uid, text);
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
        setContent(stored ?? "");
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, lang]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const scheduleSave = (text: string) => {
    const uid = resolvedUserIdRef.current;
    if (!uid) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => persist(text, uid), 600);
  };

  const savedLabel =
    savedAt
      ? lang === "fr"
        ? "Enregistré"
        : "Saved"
      : null;

  if (loading) {
    return (
      <>
        <NotesPageHeader
          isMobile={isMobile}
          title={lang === "fr" ? "Notes" : "Notes"}
          subtitle={lang === "fr" ? "Vos objectifs, aspirations et idées pour votre programme créateurs." : "Your goals, aspirations, and ideas for your creator program."}
        />
        <div style={{ padding: isMobile ? 16 : 40, color: "#9A9A9A", fontSize: 14 }}>
          {lang === "fr" ? "Chargement…" : "Loading…"}
        </div>
      </>
    );
  }

  return (
    <>
      <NotesPageHeader
        isMobile={isMobile}
        title={lang === "fr" ? "Notes" : "Notes"}
        subtitle={
          lang === "fr"
            ? "Un espace libre pour vos objectifs, aspirations et priorités créateurs."
            : "A free space for your goals, aspirations, and creator priorities."
        }
        savedLabel={savedLabel}
      />
      <div style={{ padding: isMobile ? 16 : 40, paddingTop: isMobile ? 16 : 32 }}>
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #EFEFEF",
            borderRadius: 16,
            padding: isMobile ? 20 : 28,
            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
          }}
        >
          <textarea
            value={content}
            onChange={(e) => {
              const next = e.target.value;
              setContent(next);
              scheduleSave(next);
            }}
            onBlur={() => {
              const uid = resolvedUserIdRef.current;
              if (uid) persist(content, uid);
            }}
            placeholder={
              lang === "fr"
                ? "Commencez à écrire vos objectifs…"
                : "Start writing your goals…"
            }
            style={{
              width: "100%",
              minHeight: isMobile ? "52vh" : "58vh",
              boxSizing: "border-box",
              border: "none",
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
              fontSize: 15,
              lineHeight: 1.75,
              color: "#1A1A1A",
              letterSpacing: "-0.02em",
              background: "transparent",
            }}
          />
        </div>
        <p style={{ fontSize: 12, color: "#9A9A9A", margin: "12px 0 0", letterSpacing: "-0.01em" }}>
          {lang === "fr"
            ? "Sauvegarde automatique sur cet appareil."
            : "Auto-saved on this device."}
        </p>
      </div>
    </>
  );
}
