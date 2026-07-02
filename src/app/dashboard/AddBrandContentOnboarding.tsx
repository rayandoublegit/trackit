"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { supabase } from "@/lib/supabase";
import { safeContentFileName } from "@/lib/content-shared";
import {
  selectionCardStyle,
  selectionTextPrimary,
  selectionTextSecondary,
} from "@/lib/selection-card-styles";
import { CreatorAvatar } from "./CreatorAvatar";

const BLUE = "#0047FF";

const onboardingPrimaryBtn: React.CSSProperties = {
  background: BLUE,
  color: "#FFFFFF",
  border: "none",
  borderRadius: 10,
  padding: "13px 22px",
  fontSize: 15,
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const onboardingSecondaryBtn: React.CSSProperties = {
  background: "#FFFFFF",
  color: "#1A1A1A",
  border: "1px solid #E5E5E5",
  borderRadius: 10,
  padding: "12px 20px",
  fontSize: 15,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

type CreatorRow = {
  id: string;
  handle: string;
  full_name: string | null;
  avatar_url: string | null;
  linked_user_id: string | null;
};

export function AddBrandContentOnboarding({
  brandId,
  isMobile,
  campaignCreatorIds,
  onClose,
  onSuccess,
}: {
  brandId?: string;
  isMobile?: boolean;
  /** Limite la liste aux créateurs membres de la campagne (onglet Contenu campagne). */
  campaignCreatorIds?: string[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const lang = useLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const [creators, setCreators] = useState<CreatorRow[]>([]);
  const [loadingCreators, setLoadingCreators] = useState(true);
  const [creatorRowId, setCreatorRowId] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");

  useEffect(() => {
    if (!brandId || !supabase) {
      setLoadingCreators(false);
      return;
    }
    void (async () => {
      setLoadingCreators(true);
      const { data } = await supabase
        .from("creators")
        .select("id, handle, full_name, avatar_url, linked_user_id")
        .eq("user_id", brandId)
        .not("linked_user_id", "is", null)
        .order("created_at", { ascending: false });
      let rows = (data || []) as CreatorRow[];
      if (campaignCreatorIds?.length) {
        const allowed = new Set(campaignCreatorIds.map(String));
        rows = rows.filter((row) => allowed.has(row.id));
      }
      setCreators(rows);
      if (rows[0]) setCreatorRowId(rows[0].id);
      setLoadingCreators(false);
    })();
  }, [brandId, campaignCreatorIds]);

  const pickFiles = (list: FileList | File[] | null | undefined) => {
    const files = Array.from(list ?? []).filter((f) => f.size > 0);
    if (!files.length) return;
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
    if (!supabase) {
      setMessageTone("error");
      setMessage(lang === "fr" ? "Stockage indisponible." : "Storage unavailable.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    try {
      let uploaded = 0;
      for (const file of pendingFiles) {
        const path = `brand-upload/${brandId}/${creatorRowId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeContentFileName(file.name)}`;
        const { error: upErr } = await supabase.storage
          .from("creator-content")
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw new Error(upErr.message);

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
      window.dispatchEvent(new CustomEvent("trackit:content-updated"));
      setTimeout(() => onSuccess(), 600);
    } catch (err) {
      setMessageTone("error");
      setMessage(err instanceof Error ? err.message : lang === "fr" ? "Échec de l'envoi." : "Upload failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const pagePad = isMobile ? "56px 20px 40px" : "48px 64px 64px";
  const contentMax = 720;
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

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", padding: pagePad }}>
      <div style={{ maxWidth: contentMax, margin: "0 auto" }}>
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            marginBottom: 24,
            fontSize: 14,
            fontWeight: 500,
            color: "#6B7280",
            cursor: submitting ? "default" : "pointer",
            fontFamily: "inherit",
          }}
        >
          ← {lang === "fr" ? "Retour au contenu" : "Back to content"}
        </button>

        <h1 style={{ fontSize: isMobile ? 28 : 32, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px", letterSpacing: "-0.03em" }}>
          {lang === "fr" ? "Ajouter du contenu" : "Add content"}
        </h1>
        <p style={{ fontSize: 15, color: "#6B7280", margin: "0 0 32px", lineHeight: 1.5 }}>
          {campaignCreatorIds?.length
            ? lang === "fr"
              ? "Associez des fichiers à un créateur de cette campagne. Le contenu apparaîtra ici et dans Gérer."
              : "Attach files to a creator in this campaign. Content will appear here and in Manage."
            : lang === "fr"
              ? "Associez des fichiers et des notes à un créateur. Le contenu apparaîtra dans Gérer et dans ses campagnes."
              : "Attach files and notes to a creator. Content will appear in Manage and in their campaigns."}
        </p>

        {loadingCreators ? (
          <p style={{ fontSize: 14, color: "#9A9A9A" }}>{lang === "fr" ? "Chargement des créateurs…" : "Loading creators…"}</p>
        ) : creators.length === 0 ? (
          <div>
            <p style={{ fontSize: 15, color: "#6B7280", margin: "0 0 20px", lineHeight: 1.5 }}>
              {campaignCreatorIds?.length
                ? lang === "fr"
                  ? "Aucun créateur de cette campagne n'a de compte actif. Ajoutez des créateurs à la campagne via Invitations."
                  : "No creator in this campaign has an active account. Add creators to the campaign via Invitations."
                : lang === "fr"
                  ? "Ajoutez d'abord un créateur avec un compte actif via Invitations."
                  : "Add a creator with an active account via Invitations first."}
            </p>
            <button type="button" style={onboardingSecondaryBtn} onClick={onClose}>
              {lang === "fr" ? "Retour" : "Back"}
            </button>
          </div>
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
                {lang === "fr" ? "Notes (optionnel)" : "Notes (optional)"}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder={lang === "fr" ? "Brief, hashtags, instructions…" : "Brief, hashtags, instructions…"}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
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
                    ? "Glissez des images ou vidéos ici, ou cliquez pour parcourir"
                    : "Drag images or videos here, or click to browse"}
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

            {message ? (
              <p
                style={{
                  fontSize: 14,
                  margin: "0 0 16px",
                  color: messageTone === "success" ? "#1A1A1A" : "#A32D2D",
                }}
              >
                {message}
              </p>
            ) : null}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                style={onboardingPrimaryBtn}
                disabled={submitting || !creatorRowId || pendingFiles.length === 0}
                onClick={() => void submit()}
              >
                {submitting
                  ? lang === "fr"
                    ? "Envoi…"
                    : "Uploading…"
                  : lang === "fr"
                    ? "Ajouter le contenu"
                    : "Add content"}
              </button>
              <button type="button" style={onboardingSecondaryBtn} disabled={submitting} onClick={onClose}>
                {lang === "fr" ? "Annuler" : "Cancel"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
