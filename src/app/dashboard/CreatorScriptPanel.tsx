"use client";

import { useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/useLang";
import { discoveryCopy } from "@/lib/discovery-copy";
import { supabase } from "@/lib/supabase";
import { CreatorAvatar } from "./CreatorAvatar";

const TRACKIT_LOGO = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

type ExistingScript = {
  id: string;
  title: string;
  content: string | null;
  file_url: string | null;
  created_at: string;
};

export function CreatorScriptPanel({
  lang,
  isMobile,
  brandId,
  creatorUsername,
  displayName,
  platform,
  followers,
  avatarUrl,
  targetCreatorId: initialCreatorId,
  onClose,
  onSaved,
}: {
  lang: Lang;
  isMobile?: boolean;
  brandId: string;
  creatorUsername: string;
  displayName: string;
  platform?: string;
  followers?: number;
  avatarUrl?: string | null;
  targetCreatorId?: string | null;
  onClose: () => void;
  onSaved: (script: { id: string; title: string }) => void;
}) {
  const t = discoveryCopy(lang);
  const fileRef = useRef<HTMLInputElement>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<ExistingScript[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingExisting(true);
      try {
        const handle = encodeURIComponent(creatorUsername.replace(/^@/, ""));
        const res = await fetch(`/api/scripts?brandId=${brandId}&targetHandle=${handle}`);
        const data = (await res.json()) as { ok?: boolean; scripts?: ExistingScript[] };
        if (!cancelled && data?.ok) setExisting(data.scripts ?? []);
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brandId, creatorUsername]);

  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);

  const pickFile = (picked: File | undefined) => {
    if (!picked) return;
    setFile(picked);
    setFileName(picked.name);
    setError(null);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError(lang === "fr" ? "Le titre est requis." : "Title is required.");
      return;
    }
    if (!content.trim() && !file && !link.trim()) {
      setError(
        lang === "fr"
          ? "Ajoutez du texte, un fichier ou un lien."
          : "Add text, a file, or a link.",
      );
      return;
    }

    setSaving(true);
    setError(null);
    setSavedFlash(false);

    try {
      const handle = creatorUsername.replace(/^@/, "");
      let creatorRowId = initialCreatorId?.trim() || null;

      if (!creatorRowId && supabase) {
        const { data: existing } = await supabase
          .from("creators")
          .select("id")
          .eq("user_id", brandId)
          .ilike("handle", handle)
          .maybeSingle();
        creatorRowId = existing?.id ?? null;
      }

      if (!creatorRowId) {
        const creatorRes = await fetch("/api/creators", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: handle,
            display_name: displayName,
            platform: platform ?? "tiktok",
            followers_count: followers ?? 0,
            avatar_url: avatarUrl ?? "",
          }),
        });
        const creatorData = (await creatorRes.json()) as { id?: string; error?: string };
        if (!creatorRes.ok || !creatorData.id) {
          throw new Error(creatorData.error ?? t.scriptError);
        }
        creatorRowId = creatorData.id;
      }

      let fileUrl = link.trim() || null;
      if (file && supabase) {
        const ext = file.name.split(".").pop() || "bin";
        const path = `${brandId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("scripts")
          .upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) throw new Error(upErr.message);
        const { data: pub } = supabase.storage.from("scripts").getPublicUrl(path);
        fileUrl = pub.publicUrl;
      }

      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          title: title.trim(),
          content: content.trim() || null,
          fileUrl,
          targetCreatorId: creatorRowId,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; id?: string; error?: string };
      if (!res.ok || !data?.ok || !data.id) {
        throw new Error(data.error ?? t.scriptError);
      }

      const saved = { id: data.id, title: title.trim() };
      setExisting((list) => [
        {
          id: saved.id,
          title: saved.title,
          content: content.trim() || null,
          file_url: fileUrl,
          created_at: new Date().toISOString(),
        },
        ...list,
      ]);
      setTitle("");
      setContent("");
      setLink("");
      setFile(null);
      setFileName(null);
      setSavedFlash(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedFlash(false), 2000);
      window.dispatchEvent(new CustomEvent("trackit:scripts-updated"));
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.scriptError);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #E5E5E5",
    fontSize: 15,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
    color: "#1A1A1A",
    background: "#FFFFFF",
  };

  return (
    <div style={{ minHeight: "100%" }}>
      <img
        src={TRACKIT_LOGO}
        alt="Trackit"
        style={{ height: 40, width: "auto", display: "block", marginBottom: 20, opacity: 0.9 }}
      />
      <button
        type="button"
        onClick={onClose}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontSize: 15,
          fontWeight: 600,
          color: "#1A1A1A",
          fontFamily: "inherit",
          padding: 0,
          marginBottom: 28,
          letterSpacing: "-0.02em",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t.scriptPanelBack}
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
        <CreatorAvatar username={creatorUsername} src={avatarUrl} displayName={displayName} size={52} alt={displayName} priority />
        <div>
          <h1
            style={{
              fontSize: isMobile ? 24 : 28,
              fontWeight: 600,
              color: "#1A1A1A",
              margin: "0 0 4px",
              letterSpacing: "-0.04em",
            }}
          >
            {t.scriptPanelTitle}
          </h1>
          <p style={{ fontSize: 14, color: "#7A7A7A", margin: 0 }}>{t.scriptPanelSubtitle(displayName)}</p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: isMobile ? 28 : 40,
          alignItems: "start",
        }}
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickFile(e.dataTransfer.files[0]);
          }}
          style={{
            background: dragOver ? "#F0F4FF" : "#F7F7F7",
            border: dragOver ? "2px dashed #0047FF" : "2px solid transparent",
            borderRadius: 16,
            minHeight: isMobile ? 280 : 360,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
            textAlign: "center",
            transition: "background 0.15s, border-color 0.15s",
            opacity: saving ? 0.7 : 1,
            pointerEvents: saving ? "none" : "auto",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "#FFFFFF",
              border: "1px solid #EFEFEF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="4" y="5" width="16" height="14" rx="2" stroke="#1A1A1A" strokeWidth="1.5" />
              <circle cx="9" cy="10" r="1.5" fill="#1A1A1A" />
              <path d="M4 16l4.5-4.5 3 3L16 10l4 4" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
            {t.scriptDragTitle}
          </p>
          <p style={{ fontSize: 13, color: "#9A9A9A", margin: "0 0 20px" }}>{t.scriptFileTypes}</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={saving}
            style={{
              background: "#0047FF",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 10,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {t.scriptChooseFile}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.txt,.md"
            style={{ display: "none" }}
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          {fileName && (
            <p style={{ fontSize: 12, color: "#7A7A7A", marginTop: 16, marginBottom: 0 }}>{fileName}</p>
          )}
        </div>

        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 8 }}>
            {t.scriptTitleLabel}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.scriptTitlePlaceholder}
            style={{ ...inputStyle, marginBottom: 16 }}
          />

          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 8 }}>
            {t.scriptContentLabel}
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t.scriptContentPlaceholder}
            rows={isMobile ? 8 : 10}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, marginBottom: 16 }}
          />

          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 8 }}>
            {t.scriptLinkLabel}
          </label>
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://"
            style={{ ...inputStyle, marginBottom: 20 }}
          />

          {error && (
            <p style={{ fontSize: 13, color: "#C62828", margin: "0 0 12px" }}>{error}</p>
          )}

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="hero-cta-shopify"
            style={{ padding: "12px 24px", fontSize: 14, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? t.scriptSaving : savedFlash ? t.scriptSavedBtn : t.scriptSave}
          </button>

          {(loadingExisting || existing.length > 0) && (
            <div style={{ marginTop: 32 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#9A9A9A", margin: "0 0 8px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                {t.scriptExisting}
              </p>
              {loadingExisting ? (
                <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0 }}>{t.loading}</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {existing.map((s, index) => (
                    <li
                      key={s.id}
                      style={{
                        padding: "12px 0",
                        borderBottom: index < existing.length - 1 ? "1px solid #F0F0F0" : "none",
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", marginBottom: s.content || s.file_url ? 4 : 0, letterSpacing: "-0.02em" }}>
                        {s.title}
                      </div>
                      {s.content && (
                        <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 4px", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                          {s.content.length > 160 ? `${s.content.slice(0, 160)}…` : s.content}
                        </p>
                      )}
                      {s.file_url && (
                        <a
                          href={s.file_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 13, color: "#0047FF", fontWeight: 500, textDecoration: "none" }}
                        >
                          {lang === "fr" ? "Voir le fichier" : "View file"} →
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
