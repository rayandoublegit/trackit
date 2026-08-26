"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLang } from "@/lib/useLang";
import {
  CREATOR_CONTENT_MAX_FILE_LABEL,
  creatorContentFileTooLargeMessage,
  creatorContentStorageErrorMessage,
  isCreatorContentFileTooLarge,
} from "@/lib/content-upload-limits";
import { CONTENT_UPDATED_EVENT, dispatchContentUpdated } from "@/lib/outreach-history-events";
import { supabase } from "@/lib/supabase";
import { formatCompactStat } from "@/lib/content-shared";
import { InfoTip } from "./analytics-metric-cards";

const drawerFont = "'InterDisplay', 'Inter Display', sans-serif";

type BrandOption = { id: string; name: string; creatorRowId: string | null };

type ContentItem = {
  id: string;
  brand_id: string;
  title: string;
  notes: string | null;
  file_url: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  brandName: string;
  linkUrl?: string | null;
  post_url?: string | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  posted_at?: string | null;
  stats_updated_at?: string | null;
};

function ContentTrackedLink({ lang, linkUrl }: { lang: "en" | "fr"; linkUrl: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      style={{
        marginTop: 12,
        padding: "12px 14px",
        borderRadius: 12,
        border: "1px solid var(--ws-border)",
        background: "var(--ws-surface-2)",
      }}
    >
      <p style={{ fontSize: 12, color: "var(--ws-text-muted)", margin: "0 0 8px", lineHeight: 1.45, letterSpacing: "-0.01em" }}>
        {lang === "fr"
          ? "Ton lien pour ce contenu — mets-le en bio/description"
          : "Your link for this content — add it to your bio or description"}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: drawerFont,
            fontSize: 13,
            color: "var(--ws-accent)",
            letterSpacing: "-0.02em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={linkUrl}
        >
          {linkUrl}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          style={{
            flexShrink: 0,
            border: "1px solid var(--ws-border)",
            background: "var(--ws-surface)",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
            color: "var(--ws-text)",
          }}
        >
          {copied ? (lang === "fr" ? "Copié" : "Copied") : lang === "fr" ? "Copier" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function isImageFile(item: Pick<ContentItem, "file_url" | "file_type" | "file_name">): boolean {
  if (item.file_type?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp|heic)(\?|$)/i.test(item.file_url || item.file_name);
}

function isVideoFile(item: Pick<ContentItem, "file_url" | "file_type" | "file_name">): boolean {
  if (item.file_type?.startsWith("video/")) return true;
  return /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(item.file_url || item.file_name);
}

function formatBytes(size: number | null | undefined): string {
  if (!size || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function safeStorageName(name: string): string {
  return name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 120);
}

function formatDate(iso: string, lang: "fr" | "en") {
  try {
    return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function CreatorContentCard({
  item,
  lang,
  onDelete,
}: {
  item: ContentItem;
  lang: "fr" | "en";
  onDelete: (id: string) => void;
}) {
  const isImage = isImageFile(item);
  const isVideo = isVideoFile(item);

  return (
    <article className="bc-card">
      <div className="bc-card__media">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.file_url} alt="" />
        ) : isVideo ? (
          <video src={item.file_url} controls />
        ) : (
          <div className="bc-card__file">{item.file_name}</div>
        )}
      </div>
      <div className="bc-card__body">
        <div className="bc-card__title">{item.title}</div>
        <div className="bc-card__meta">
          {item.brandName || "—"}
          {" · "}
          {formatDate(item.created_at, lang)}
          {item.file_size ? ` · ${formatBytes(item.file_size)}` : ""}
        </div>
        {item.notes ? <p className="bc-card__notes">{item.notes}</p> : null}
        <div className="bc-card__metrics">
          {(
            [
              { label: lang === "fr" ? "Vues" : "Views", value: item.views },
              { label: lang === "fr" ? "Likes" : "Likes", value: item.likes },
              { label: lang === "fr" ? "Comms" : "Comments", value: item.comments },
              { label: lang === "fr" ? "Shares" : "Shares", value: item.shares },
            ] as const
          ).map((m) => (
            <div key={m.label} className="bc-card__metric">
              <span>{m.label}</span>
              <strong>{formatCompactStat(m.value, lang)}</strong>
            </div>
          ))}
        </div>
        {item.linkUrl ? <ContentTrackedLink lang={lang} linkUrl={item.linkUrl} /> : null}
        <div className="bc-card__actions" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <a className="bc-card__download" href={item.file_url} target="_blank" rel="noreferrer">
            {lang === "fr" ? "Télécharger" : "Download"} →
          </a>
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            style={{
              marginLeft: "auto",
              border: "none",
              background: "none",
              color: "var(--ws-danger)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
              padding: 0,
              letterSpacing: "-0.01em",
            }}
          >
            {lang === "fr" ? "Supprimer" : "Delete"}
          </button>
        </div>
      </div>
    </article>
  );
}

export function CreatorContent({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const fr = lang === "fr";
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [brandId, setBrandId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Panneau d'upload
  const [addOpen, setAddOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [hookId, setHookId] = useState("");
  const [hooks, setHooks] = useState<{ id: string; title: string; brandName?: string }[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [lastUploadedLink, setLastUploadedLink] = useState<string | null>(null);

  const brandName = brands.find((b) => b.id === brandId)?.name || brands[0]?.name || "";

  const load = async (): Promise<BrandOption[]> => {
    if (!userId) {
      setLoading(false);
      return [];
    }
    try {
      const res = await fetch(`/api/creator/content?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        items?: ContentItem[];
        brands?: BrandOption[];
        linkError?: string;
      };
      if (data?.ok) {
        setItems(data.items ?? []);
        const nextBrands = data.brands ?? [];
        setBrands(nextBrands);
        setBrandId((current) => current || (nextBrands[0]?.id ?? ""));
        setLinkError(nextBrands.length === 0 ? (data.linkError ?? null) : null);
        return nextBrands;
      }
    } finally {
      setLoading(false);
    }
    return [];
  };

  useEffect(() => {
    void load();
    if (!userId) return;
    void fetch("/api/creator/sync-brand-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    }).then(() => load());
    const onUpdated = () => void load();
    window.addEventListener(CONTENT_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(CONTENT_UPDATED_EVENT, onUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!addOpen) {
      setShown(false);
      return;
    }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [addOpen]);

  useEffect(() => {
    if (!addOpen) return;
    setTitle("");
    setNotes("");
    setPostUrl("");
    setHookId("");
    setPendingFiles([]);
    setDragOver(false);
    setMessage("");
    setMessageTone("error");
    setLastUploadedLink(null);
  }, [addOpen]);

  useEffect(() => {
    if (!addOpen || !userId) return;
    void (async () => {
      try {
        const res = await fetch(`/api/creator/hooks?userId=${encodeURIComponent(userId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setHooks([]);
          return;
        }
        const rows = ((data.hooks || []) as { id: string; title: string; brandName?: string }[]).map((h) => ({
          id: h.id,
          title: h.title,
          brandName: h.brandName,
        }));
        setHooks(rows);
      } catch {
        setHooks([]);
      }
    })();
  }, [addOpen, userId]);

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

  const uploadAll = async () => {
    if (!userId) return;
    if (!pendingFiles.length) {
      setMessageTone("error");
      setMessage(fr ? "Ajoutez au moins un fichier." : "Add at least one file.");
      return;
    }
    if (!supabase) {
      setMessageTone("error");
      setMessage(fr ? "Stockage indisponible." : "Storage unavailable.");
      return;
    }

    const trimmedPostUrl = postUrl.trim();
    if (!trimmedPostUrl) {
      setMessageTone("error");
      setMessage(
        fr
          ? "L’URL du post TikTok est obligatoire pour calculer les vues."
          : "A TikTok post URL is required so we can track views.",
      );
      return;
    }
    if (!/tiktok\.com\//i.test(trimmedPostUrl)) {
      setMessageTone("error");
      setMessage(fr ? "L'URL doit être un lien TikTok (tiktok.com)." : "URL must be a TikTok link (tiktok.com).");
      return;
    }

    setUploading(true);
    setMessage("");
    setLastUploadedLink(null);

    try {
      const prepRes = await fetch(`/api/creator/content?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
      const prep = (await prepRes.json()) as {
        ok?: boolean;
        brands?: BrandOption[];
        linkError?: string;
        error?: string;
      };
      if (!prepRes.ok) {
        throw new Error(prep.error ?? (fr ? "Impossible de charger vos marques." : "Could not load your brands."));
      }
      const brandList = prep.brands?.length ? prep.brands : brands;
      const uploadBrand = brandList.find((b) => b.id === brandId) ?? brandList[0] ?? null;
      if (!uploadBrand?.id) {
        throw new Error(
          prep.linkError ??
            (fr
              ? "Aucune marque liée. Acceptez d'abord l'invitation de la marque."
              : "No linked brand. Accept the brand invite first."),
        );
      }
      if (!brandId) setBrandId(uploadBrand.id);

      let uploaded = 0;
      let lastCreatorRowId = uploadBrand.creatorRowId;
      let latestLinkUrl: string | null = null;
      let lastViews: number | null = null;
      let lastRpmAmount = 0;

      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        if (isCreatorContentFileTooLarge(file.size)) {
          throw new Error(creatorContentFileTooLargeMessage(lang, file.name));
        }
        const path = `${userId}/${uploadBrand.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeStorageName(file.name)}`;
        const { error: upErr } = await supabase.storage
          .from("creator-content")
          .upload(path, file, {
            upsert: false,
            contentType: file.type || undefined,
            cacheControl: "3600",
          });
        if (upErr) throw new Error(creatorContentStorageErrorMessage(lang, upErr.message));

        const { data: pub } = supabase.storage.from("creator-content").getPublicUrl(path);
        const itemTitle = pendingFiles.length === 1 && title.trim() ? title.trim() : title.trim() || file.name;

        const res = await fetch("/api/creator/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            brandId: uploadBrand.id,
            creatorRowId: lastCreatorRowId || undefined,
            title: itemTitle,
            notes: notes.trim() || null,
            fileUrl: pub.publicUrl,
            fileName: file.name,
            fileType: file.type || null,
            fileSize: file.size,
            ...(hookId ? { hookId } : {}),
            postUrl: trimmedPostUrl,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          brandId?: string;
          creatorRowId?: string;
          linkUrl?: string | null;
          stats?: { views?: number | null; likes?: number | null };
          rpm?: { amount?: number; rpmRate?: number };
        };
        if (!res.ok || !data?.ok) {
          throw new Error(
            data.error ??
              (fr ? "Impossible de lier votre compte à la marque." : "Could not link your account to the brand."),
          );
        }
        if (data.brandId) setBrandId(data.brandId);
        if (data.creatorRowId) lastCreatorRowId = data.creatorRowId;
        if (data.linkUrl) latestLinkUrl = data.linkUrl;
        if (typeof data.stats?.views === "number") lastViews = data.stats.views;
        if (typeof data.rpm?.amount === "number") lastRpmAmount += data.rpm.amount;
        uploaded += 1;
      }

      setPendingFiles([]);
      setTitle("");
      setNotes("");
      setPostUrl("");
      setLastUploadedLink(latestLinkUrl);
      setMessageTone("success");
      const viewsPart =
        lastViews != null
          ? fr
            ? ` · ${new Intl.NumberFormat("fr-FR").format(lastViews)} vues`
            : ` · ${new Intl.NumberFormat("en-US").format(lastViews)} views`
          : "";
      const rpmPart =
        lastRpmAmount > 0
          ? fr
            ? ` · +${lastRpmAmount.toFixed(2)} € RPM`
            : ` · +€${lastRpmAmount.toFixed(2)} RPM`
          : "";
      setMessage(
        fr
          ? `${uploaded} fichier${uploaded > 1 ? "s" : ""} envoyé${uploaded > 1 ? "s" : ""} à ${brandName || "la marque"}${viewsPart}${rpmPart}.`
          : `${uploaded} file${uploaded > 1 ? "s" : ""} sent to ${brandName || "the brand"}${viewsPart}${rpmPart}.`,
      );
      dispatchContentUpdated();
      try {
        window.dispatchEvent(new Event("trackit:rpm-updated"));
      } catch {
        /* ignore */
      }
      await load();
      // Sans lien à copier, referme le panneau ; sinon laisse le créateur copier son lien.
      if (!latestLinkUrl) {
        setTimeout(() => setAddOpen(false), 600);
      }
    } catch (err) {
      setMessageTone("error");
      setMessage(err instanceof Error ? err.message : fr ? "Échec de l'envoi." : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const removeItem = async (id: string) => {
    if (!userId) return;
    await fetch(`/api/creator/content?id=${encodeURIComponent(id)}&userId=${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    dispatchContentUpdated();
    setItems((list) => list.filter((i) => i.id !== id));
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid var(--ws-border)",
    fontSize: 15,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
    color: "var(--ws-text)",
    background: "var(--ws-input)",
    letterSpacing: "-0.01em",
  };

  const canSubmit = Boolean(pendingFiles.length > 0 && !uploading && brands.length > 0);

  const drawer =
    addOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            onClick={() => {
              if (!uploading) setAddOpen(false);
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
                background: "var(--ws-surface)",
                color: "var(--ws-text)",
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
                  onClick={() => setAddOpen(false)}
                  disabled={uploading}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--ws-text-dim)",
                    fontWeight: 500,
                    fontSize: 14,
                    cursor: uploading ? "default" : "pointer",
                    padding: 0,
                    fontFamily: "inherit",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {fr ? "Retour" : "Back"}
                </button>
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => void uploadAll()}
                  style={{
                    fontFamily: drawerFont,
                    letterSpacing: "-0.02em",
                    fontSize: 14,
                    borderRadius: 8,
                    fontWeight: 600,
                    color: "var(--ws-btn-text)",
                    background: "var(--ws-btn)",
                    border: "none",
                    padding: "11px 16px",
                    opacity: canSubmit ? 1 : 0.45,
                    cursor: canSubmit ? "pointer" : "default",
                  }}
                >
                  {uploading
                    ? fr
                      ? "Envoi…"
                      : "Uploading…"
                    : fr
                      ? "Envoyer à la marque"
                      : "Send to brand"}
                </button>
              </div>

              <h2 style={{ fontSize: 22, fontWeight: 600, color: "var(--ws-text)", margin: "0 0 8px", letterSpacing: "-0.03em" }}>
                {fr ? "Ajouter du contenu" : "Add content"}
              </h2>
              <p style={{ fontSize: 14, color: "var(--ws-text-muted)", margin: "0 0 20px", lineHeight: 1.5, letterSpacing: "-0.02em" }}>
                {fr
                  ? "Vos fichiers arrivent directement dans le dashboard de la marque, avec vos stats."
                  : "Your files land directly in the brand's dashboard, along with your stats."}
              </p>

              {brands.length > 0 ? (
                <div
                  style={{
                    marginBottom: 24,
                    padding: "12px 14px",
                    borderRadius: 10,
                    background: "var(--ws-surface-2)",
                    border: "1px solid var(--ws-border)",
                    fontSize: 13,
                    color: "var(--ws-text-muted)",
                  }}
                >
                  <span style={{ fontWeight: 600, color: "var(--ws-text)" }}>
                    {fr ? "Destination : " : "Destination: "}
                  </span>
                  {brandName}
                </div>
              ) : (
                <p style={{ fontSize: 14, color: "var(--ws-danger)", margin: "0 0 24px", lineHeight: 1.5 }}>
                  {fr
                    ? "Aucune marque associée. Acceptez d'abord l'invitation de la marque."
                    : "No linked brand. Accept the brand invite first."}
                </p>
              )}

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--ws-text)", marginBottom: 8 }}>
                  {fr ? "Titre" : "Title"}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={fr ? "Ex : UGC v1 — hook A" : "e.g. UGC v1 — hook A"}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--ws-text)", marginBottom: 8 }}>
                  {fr ? "Notes" : "Notes"}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder={fr ? "Contexte, version, instructions…" : "Context, version, notes…"}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--ws-text)", marginBottom: 8 }}>
                  {fr ? "Hook utilisé" : "Hook used"}
                </label>
                <select
                  value={hookId}
                  onChange={(e) => setHookId(e.target.value)}
                  disabled={hooks.length === 0}
                  style={{ ...inputStyle, cursor: hooks.length ? "pointer" : "default" }}
                >
                  <option value="">
                    {hooks.length === 0
                      ? fr
                        ? "Aucun hook disponible"
                        : "No hooks available"
                      : fr
                        ? "Choisir un hook (optionnel)"
                        : "Choose a hook (optional)"}
                  </option>
                  {hooks.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.title}
                      {h.brandName ? ` — ${h.brandName}` : ""}
                    </option>
                  ))}
                </select>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--ws-text-muted)", lineHeight: 1.4 }}>
                  {fr
                    ? "La marque pourra filtrer ce contenu par hook dans Contenu."
                    : "The brand can filter this content by hook in Content."}
                </p>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--ws-text)", marginBottom: 8 }}>
                  {fr ? "Fichiers" : "Files"}
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
                    border: `2px dashed ${dragOver ? "var(--ws-accent)" : "var(--ws-border)"}`,
                    borderRadius: 14,
                    padding: "32px 20px",
                    textAlign: "center",
                    cursor: "pointer",
                    background: dragOver ? "var(--ws-hover)" : "var(--ws-surface-2)",
                  }}
                >
                  <p style={{ margin: 0, fontSize: 14, color: "var(--ws-text-muted)", lineHeight: 1.5 }}>
                    {fr
                      ? `Glissez des images ou vidéos ici (max ${CREATOR_CONTENT_MAX_FILE_LABEL}, 1–2 min+), ou cliquez pour parcourir`
                      : `Drag images or videos here (max ${CREATOR_CONTENT_MAX_FILE_LABEL}, 1–2+ min), or click to browse`}
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept="image/*,video/*,.pdf,.doc,.docx"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      pickFiles(e.target.files);
                      e.target.value = "";
                    }}
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
                          color: "var(--ws-text-muted)",
                          padding: "8px 0",
                          borderBottom: "1px solid var(--ws-border)",
                        }}
                      >
                        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {file.name}
                          <span style={{ color: "var(--ws-text-dim)", marginLeft: 8 }}>{formatBytes(file.size)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setPendingFiles((list) => list.filter((_, idx) => idx !== i))}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--ws-text-dim)",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            fontSize: 12,
                          }}
                        >
                          {fr ? "Retirer" : "Remove"}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ws-text)", margin: 0 }}>
                    {fr ? "URL du post" : "Post URL"}
                    <span style={{ color: "var(--ws-danger)", marginLeft: 4 }} aria-hidden>
                      *
                    </span>
                  </label>
                  <InfoTip
                    lang={lang}
                    text={
                      fr
                        ? "Collez l'URL de votre post TikTok publié pour que Trackit récupère les vues, likes et l'engagement. Obligatoire — sans URL, les stats ne peuvent pas être calculées."
                        : "Paste the URL of your published TikTok post so Trackit can fetch views, likes, and engagement. Required — without a URL, stats can’t be calculated."
                    }
                  />
                </div>
                <input
                  type="url"
                  required
                  value={postUrl}
                  onChange={(e) => setPostUrl(e.target.value)}
                  placeholder="https://www.tiktok.com/@toncompte/video/..."
                  style={inputStyle}
                />
                <p style={{ fontSize: 12, color: "var(--ws-text-dim)", margin: "8px 0 0", lineHeight: 1.45 }}>
                  {fr
                    ? "Obligatoire — lien TikTok pour calculer les vues et l’engagement."
                    : "Required — TikTok link so we can calculate views and engagement."}
                </p>
              </div>

              {message ? (
                <p
                  style={{
                    fontSize: 14,
                    margin: 0,
                    color: messageTone === "success" ? "var(--ws-text)" : "var(--ws-danger)",
                  }}
                >
                  {message}
                </p>
              ) : null}
              {lastUploadedLink ? <ContentTrackedLink lang={lang} linkUrl={lastUploadedLink} /> : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`bc-page${isMobile ? " is-mobile" : ""}`}>
      <div className="bc-topbar">
        <h1 className="bc-topbar__title">{fr ? "Contenu" : "Content"}</h1>
        <button type="button" className="bc-cta" onClick={() => setAddOpen(true)}>
          {fr ? "Ajouter" : "Add"}
        </button>
      </div>

      <div className="bc-rule" aria-hidden />

      <div className="bc-main">
        <div className="bc-hero-row">
          <h2 className="bc-hero-title">
            {fr ? "Vos clips. Votre contenu." : "Your clips. Your content."}
          </h2>
          {brandName ? (
            <span
              style={{
                flex: "0 0 auto",
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid var(--ws-border)",
                background: "var(--ws-surface-2)",
                fontSize: 13.5,
                color: "var(--ws-text-muted)",
                letterSpacing: "-0.01em",
                whiteSpace: "nowrap",
              }}
            >
              {fr ? "Envoyé à" : "Sent to"}
              <strong style={{ color: "var(--ws-text)", fontWeight: 600 }}>{brandName}</strong>
            </span>
          ) : null}
        </div>

        {!loading && brands.length === 0 && linkError ? (
          <p style={{ margin: "0 0 20px", fontSize: 13.5, color: "var(--ws-danger)", lineHeight: 1.5 }}>
            {fr
              ? "Aucune marque associée. Vérifiez dans Paramètres que votre pseudo correspond à celui de la marque, ou acceptez l'invitation reçue."
              : "No linked brand. Check Settings to confirm your handle matches the brand's records, or accept your invite."}
          </p>
        ) : null}

        {loading ? (
          <p className="bc-empty">{fr ? "Chargement…" : "Loading…"}</p>
        ) : items.length === 0 ? (
          <div className="bc-empty-block">
            <p>
              {fr
                ? "Aucune vidéo pour l’instant. Ajoutez du contenu — il arrive directement chez votre marque."
                : "No videos yet. Add content — it lands directly in your brand's dashboard."}
            </p>
            <button type="button" className="bc-cta" onClick={() => setAddOpen(true)}>
              {fr ? "Ajouter" : "Add"}
            </button>
          </div>
        ) : (
          <div className="bc-grid">
            {items.map((item) => (
              <CreatorContentCard key={item.id} item={item} lang={lang} onDelete={(id) => void removeItem(id)} />
            ))}
          </div>
        )}
      </div>

      {drawer}
    </div>
  );
}
