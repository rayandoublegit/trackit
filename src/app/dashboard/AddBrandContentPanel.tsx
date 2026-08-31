"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLang } from "@/lib/useLang";
import { supabase } from "@/lib/supabase";
import { safeContentFileName } from "@/lib/content-shared";
import {
  CREATOR_CONTENT_MAX_FILE_LABEL,
  creatorContentFileTooLargeMessage,
  creatorContentStorageErrorMessage,
  isCreatorContentFileTooLarge,
} from "@/lib/content-upload-limits";
import { dispatchContentUpdated } from "@/lib/outreach-history-events";
import {
  selectionCardStyle,
  selectionTextPrimary,
  selectionTextSecondary,
} from "@/lib/selection-card-styles";
import { CreatorAvatar } from "./CreatorAvatar";
import { InfoTip } from "./analytics-metric-cards";

const BLUE = "#0047FF";
const drawerFont = "'InterDisplay', 'Inter Display', sans-serif";

const drawerBtnPrimary: React.CSSProperties = {
  fontFamily: drawerFont,
  letterSpacing: "-0.02em",
  fontSize: 14,
  borderRadius: 8,
  fontWeight: 600,
  color: "#FFF",
  background: "#1A1A1A",
  border: "none",
  padding: "11px 16px",
  cursor: "pointer",
};

type CreatorRow = {
  id: string;
  handle: string;
  full_name: string | null;
  avatar_url: string | null;
  linked_user_id: string | null;
};

export function AddBrandContentPanel({
  open,
  onClose,
  brandId,
  campaignCreatorIds,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  brandId?: string;
  /** Limite la liste aux créateurs membres de la campagne (onglet Contenu campagne). */
  campaignCreatorIds?: string[];
  onSuccess?: () => void;
}) {
  const lang = useLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const [shown, setShown] = useState(false);
  const [creators, setCreators] = useState<CreatorRow[]>([]);
  const [loadingCreators, setLoadingCreators] = useState(false);
  const [creatorRowId, setCreatorRowId] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [postUrl, setPostUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setNotes("");
    setPendingFiles([]);
    setPostUrl("");
    setDragOver(false);
    setMessage("");
    setMessageTone("error");
  }, [open]);

  useEffect(() => {
    if (!open || !brandId || !supabase) {
      if (!open) setLoadingCreators(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoadingCreators(true);
      const { data } = await supabase
        .from("creators")
        .select("id, handle, full_name, avatar_url, linked_user_id")
        .eq("user_id", brandId)
        .not("linked_user_id", "is", null)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      let rows = (data || []) as CreatorRow[];
      if (campaignCreatorIds?.length) {
        const allowed = new Set(campaignCreatorIds.map(String));
        rows = rows.filter((row) => allowed.has(row.id));
      }
      setCreators(rows);
      setCreatorRowId(rows[0]?.id ?? "");
      setLoadingCreators(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [brandId, campaignCreatorIds, open]);

  const pickFiles = (list: FileList | File[] | null | undefined) => {
    const files = Array.from(list ?? []).filter((f) => f.size > 0);
    if (!files.length) return;
    const tooLarge = files.find((f) => isCreatorContentFileTooLarge(f.size));
    if (tooLarge) {
      setMessageTone("error");
      setMessage(creatorContentFileTooLargeMessage(lang, tooLarge.name));
      return;
    }
    setPendingFiles((prev) => [...prev, ...files]);
    setMessage("");
  };

  const submit = async () => {
    if (!brandId || !creatorRowId) {
      setMessageTone("error");
      setMessage(lang === "fr" ? "Sélectionnez un créateur." : "Select a creator.");
      return;
    }
    if (!pendingFiles.length) {
      setMessageTone("error");
      setMessage(lang === "fr" ? "Ajoutez au moins un fichier." : "Add at least one file.");
      return;
    }
    const trimmedPostUrl = postUrl.trim();
    if (
      trimmedPostUrl &&
      !/tiktok\.com\//i.test(trimmedPostUrl) &&
      !/instagram\.com\/(p|reel|reels|tv)\//i.test(trimmedPostUrl)
    ) {
      setMessageTone("error");
      setMessage(
        lang === "fr"
          ? "L'URL doit être un lien TikTok ou Instagram (post/reel)."
          : "URL must be a TikTok or Instagram post/reel link.",
      );
      return;
    }
    if (!supabase) {
      setMessageTone("error");
      setMessage(lang === "fr" ? "Stockage indisponible." : "Storage unavailable.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    try {
      let uploaded = 0;
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        if (isCreatorContentFileTooLarge(file.size)) {
          throw new Error(creatorContentFileTooLargeMessage(lang, file.name));
        }
        const path = `brand-upload/${brandId}/${creatorRowId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeContentFileName(file.name)}`;
        const { error: upErr } = await supabase.storage
          .from("creator-content")
          .upload(path, file, {
            upsert: false,
            contentType: file.type || undefined,
            cacheControl: "3600",
          });
        if (upErr) throw new Error(creatorContentStorageErrorMessage(lang, upErr.message));

        const { data: pub } = supabase.storage.from("creator-content").getPublicUrl(path);
        const itemTitle =
          pendingFiles.length === 1 && title.trim() ? title.trim() : title.trim() || file.name;

        const res = await fetch("/api/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandId,
            creatorRowId,
            title: itemTitle,
            notes: notes.trim() || null,
            fileUrl: pub.publicUrl,
            fileName: file.name,
            fileType: file.type || null,
            fileSize: file.size,
            ...(i === 0 && trimmedPostUrl ? { postUrl: trimmedPostUrl } : {}),
          }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data?.ok) throw new Error(data.error ?? (lang === "fr" ? "Échec de l'envoi." : "Upload failed."));
        uploaded += 1;
      }

      setMessageTone("success");
      setMessage(
        lang === "fr"
          ? `${uploaded} fichier${uploaded > 1 ? "s" : ""} ajouté${uploaded > 1 ? "s" : ""}.`
          : `${uploaded} file${uploaded > 1 ? "s" : ""} added.`,
      );
      dispatchContentUpdated();
      onSuccess?.();
      setTimeout(() => onClose(), 400);
    } catch (err) {
      setMessageTone("error");
      setMessage(err instanceof Error ? err.message : lang === "fr" ? "Échec de l'envoi." : "Upload failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = Boolean(creatorRowId && pendingFiles.length > 0 && !submitting);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #E5E5E5",
    fontSize: 15,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
    color: "#1A1A1A",
    letterSpacing: "-0.01em",
  };

  if (!open || typeof document === "undefined") return null;

  const subtitle = campaignCreatorIds?.length
    ? lang === "fr"
      ? "Associez des fichiers à un créateur de cette campagne. Le contenu apparaîtra ici et dans Gérer."
      : "Attach files to a creator in this campaign. Content will appear here and in Manage."
    : lang === "fr"
      ? "Associez des fichiers et des notes à un créateur. Le contenu apparaîtra dans Gérer et dans leurs campagnes."
      : "Attach files and notes to a creator. Content will appear in Manage and in their campaigns.";

  return createPortal(
    <div
      onClick={() => {
        if (!submitting) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 1200,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          height: "100%",
          background: "#FFF",
          overflowY: "auto",
          transform: shown ? "translateX(0)" : "translateX(40px)",
          opacity: shown ? 1 : 0,
          transition: "transform .18s ease, opacity .18s ease",
          padding: "28px 28px 56px",
          boxSizing: "border-box",
          fontFamily: drawerFont,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 12 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: "none",
              border: "none",
              color: "#9A9A9A",
              fontWeight: 500,
              fontSize: 14,
              cursor: submitting ? "default" : "pointer",
              padding: 0,
              fontFamily: "inherit",
              letterSpacing: "-0.02em",
            }}
          >
            {lang === "fr" ? "Retour" : "Back"}
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            style={{
              ...drawerBtnPrimary,
              opacity: canSubmit ? 1 : 0.45,
              cursor: canSubmit ? "pointer" : "default",
            }}
          >
            {submitting
              ? lang === "fr"
                ? "Envoi…"
                : "Uploading…"
              : lang === "fr"
                ? "Ajouter le contenu"
                : "Add content"}
          </button>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px", letterSpacing: "-0.03em" }}>
          {lang === "fr" ? "Ajouter du contenu" : "Add content"}
        </h2>
        <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 28px", lineHeight: 1.5, letterSpacing: "-0.02em" }}>
          {subtitle}
        </p>

        {loadingCreators ? (
          <p style={{ fontSize: 14, color: "#9A9A9A" }}>{lang === "fr" ? "Chargement des créateurs…" : "Loading creators…"}</p>
        ) : creators.length === 0 ? (
          <p style={{ fontSize: 15, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
            {campaignCreatorIds?.length
              ? lang === "fr"
                ? "Aucun créateur de cette campagne n'a de compte actif. Ajoutez des créateurs à la campagne via Invitations."
                : "No creator in this campaign has an active account. Add creators to the campaign via Invitations."
              : lang === "fr"
                ? "Ajoutez d'abord un créateur avec un compte actif via Invitations."
                : "Add a creator with an active account via Invitations first."}
          </p>
        ) : (
          <>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", marginBottom: 10 }}>
                {lang === "fr" ? "Créateur" : "Creator"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {creators.map((creator) => {
                  const selected = creatorRowId === creator.id;
                  return (
                    <button
                      key={creator.id}
                      type="button"
                      onClick={() => setCreatorRowId(creator.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        width: "100%",
                        textAlign: "left",
                        padding: "12px 14px",
                        borderRadius: 10,
                        ...selectionCardStyle(selected),
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      <CreatorAvatar
                        src={creator.avatar_url}
                        username={creator.handle}
                        displayName={creator.full_name ?? undefined}
                        size={36}
                        alt={creator.full_name || creator.handle}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: selectionTextPrimary(selected) }}>
                          {creator.full_name || creator.handle || "—"}
                        </div>
                        {creator.handle ? (
                          <div style={{ fontSize: 13, color: selectionTextSecondary(selected) }}>
                            @{creator.handle.replace(/^@/, "")}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 8 }}>
                {lang === "fr" ? "Titre" : "Title"}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={lang === "fr" ? "Ex : UGC TikTok #1" : "e.g. UGC TikTok #1"}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 8 }}>
                {lang === "fr" ? "Notes" : "Notes"}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder={lang === "fr" ? "Brief, hashtags, instructions…" : "Brief, hashtags, instructions…"}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 8 }}>
                {lang === "fr" ? "Fichiers" : "Files"}
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  pickFiles(e.dataTransfer.files);
                }}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? BLUE : "#E5E5E5"}`,
                  borderRadius: 14,
                  padding: "32px 20px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragOver ? "rgba(0,71,255,0.04)" : "#FAFAFA",
                }}
              >
                <p style={{ margin: 0, fontSize: 14, color: "#6B7280", lineHeight: 1.5 }}>
                  {lang === "fr"
                    ? `Glissez des images ou vidéos ici (max ${CREATOR_CONTENT_MAX_FILE_LABEL}, 1–2 min+), ou cliquez pour parcourir`
                    : `Drag images or videos here (max ${CREATOR_CONTENT_MAX_FILE_LABEL}, 1–2+ min), or click to browse`}
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/*,video/*,.pdf,.doc,.docx"
                  style={{ display: "none" }}
                  onChange={(e) => pickFiles(e.target.files)}
                />
              </div>
              {pendingFiles.length > 0 ? (
                <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none" }}>
                  {pendingFiles.map((file, i) => (
                    <li
                      key={`${file.name}-${i}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 13,
                        color: "#4B5563",
                        padding: "8px 0",
                        borderBottom: "1px solid #F0F0F0",
                      }}
                    >
                      <span>{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setPendingFiles((list) => list.filter((_, idx) => idx !== i))}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#9A9A9A",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontSize: 12,
                        }}
                      >
                        {lang === "fr" ? "Retirer" : "Remove"}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", margin: 0 }}>
                  {lang === "fr" ? "Liens URL" : "URL links"}
                </label>
                <InfoTip
                  lang={lang}
                  text={
                    lang === "fr"
                      ? "Collez l'URL du post TikTok ou Instagram publié pour récupérer les vues, likes et l'engagement. Les stats apparaîtront dans Performance par contenu."
                      : "Paste the published TikTok or Instagram post URL to fetch views, likes, and engagement. Stats will show in Performance by content."
                  }
                />
              </div>
              <input
                type="url"
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                placeholder="https://www.tiktok.com/@…/video/… ou https://www.instagram.com/reel/…"
                style={inputStyle}
              />
              <p style={{ fontSize: 12, color: "#9A9A9A", margin: "8px 0 0", lineHeight: 1.45 }}>
                {lang === "fr"
                  ? "Optionnel — associé au premier fichier envoyé."
                  : "Optional — linked to the first uploaded file."}
              </p>
            </div>

            {message ? (
              <p
                style={{
                  fontSize: 14,
                  margin: 0,
                  color: messageTone === "success" ? "#1A1A1A" : "#A32D2D",
                }}
              >
                {message}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
