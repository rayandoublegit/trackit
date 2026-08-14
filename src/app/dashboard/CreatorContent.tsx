"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import {
  CREATOR_CONTENT_MAX_FILE_LABEL,
  creatorContentFileTooLargeMessage,
  creatorContentStorageErrorMessage,
  isCreatorContentFileTooLarge,
} from "@/lib/content-upload-limits";
import { CONTENT_UPDATED_EVENT, dispatchContentUpdated } from "@/lib/outreach-history-events";
import { supabase } from "@/lib/supabase";
import { ContentPostStatsDisplay } from "./ContentPostStats";
import { InfoTip } from "./analytics-metric-cards";

const BLUE = "var(--ws-accent)";
const TRACKIT_LOGO = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

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

const externFont = "'InterDisplay', 'Inter Display', sans-serif";

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
            fontFamily: externFont,
            fontSize: 13,
            color: BLUE,
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

export function CreatorContent({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [brandId, setBrandId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastUploadedLink, setLastUploadedLink] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

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
  }, [userId]);


  const pickFiles = (list: FileList | File[] | null | undefined) => {
    const files = Array.from(list ?? []).filter((f) => f.size > 0);
    if (!files.length) return;
    const tooLarge = files.find((f) => isCreatorContentFileTooLarge(f.size));
    if (tooLarge) {
      setError(creatorContentFileTooLargeMessage(lang, tooLarge.name));
      return;
    }
    setPendingFiles((prev) => [...prev, ...files]);
    setError(null);
  };

  const uploadAll = async () => {
    if (!userId) return;
    if (!pendingFiles.length) {
      setError(lang === "fr" ? "Ajoutez au moins un fichier." : "Add at least one file.");
      return;
    }
    if (!supabase) {
      setError(lang === "fr" ? "Stockage indisponible." : "Storage unavailable.");
      return;
    }

    const trimmedPostUrl = postUrl.trim();
    if (trimmedPostUrl && !/tiktok\.com\//i.test(trimmedPostUrl)) {
      setError(
        lang === "fr"
          ? "L'URL doit être un lien TikTok (tiktok.com)."
          : "URL must be a TikTok link (tiktok.com).",
      );
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);
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
        throw new Error(prep.error ?? (lang === "fr" ? "Impossible de charger vos marques." : "Could not load your brands."));
      }
      const brandList = prep.brands?.length ? prep.brands : brands;
      const uploadBrand = brandList.find((b) => b.id === brandId) ?? brandList[0] ?? null;
      if (!uploadBrand?.id) {
        throw new Error(
          prep.linkError ??
            (lang === "fr"
              ? "Aucune marque liée. Acceptez d'abord l'invitation de la marque."
              : "No linked brand. Accept the brand invite first."),
        );
      }
      if (!brandId) setBrandId(uploadBrand.id);

      let uploaded = 0;
      let lastCreatorRowId = uploadBrand.creatorRowId;
      let latestLinkUrl: string | null = null;

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
            ...(i === 0 && trimmedPostUrl ? { postUrl: trimmedPostUrl } : {}),
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          brandId?: string;
          creatorRowId?: string;
          linkUrl?: string | null;
        };
        if (!res.ok || !data?.ok) {
          throw new Error(
            data.error ??
              (lang === "fr"
                ? "Impossible de lier votre compte à la marque."
                : "Could not link your account to the brand."),
          );
        }
        if (data.brandId) setBrandId(data.brandId);
        if (data.creatorRowId) lastCreatorRowId = data.creatorRowId;
        if (data.linkUrl) latestLinkUrl = data.linkUrl;
        uploaded += 1;
      }

      setPendingFiles([]);
      setTitle("");
      setNotes("");
      setPostUrl("");
      setLastUploadedLink(latestLinkUrl);
      setSuccess(
        lang === "fr"
          ? `${uploaded} fichier${uploaded > 1 ? "s" : ""} envoyé${uploaded > 1 ? "s" : ""} à la marque.`
          : `${uploaded} file${uploaded > 1 ? "s" : ""} sent to the brand.`,
      );
      dispatchContentUpdated();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === "fr" ? "Échec de l'envoi." : "Upload failed.");
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
    borderRadius: 12,
    border: "1px solid var(--ws-border)",
    fontSize: 15,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
    color: "var(--ws-text)",
    background: "var(--ws-input)",
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
        <img src={TRACKIT_LOGO} alt="Trackit" style={{ height: 36, width: "auto", marginBottom: 20, opacity: 0.9 }} />
        <h1 style={{ fontSize: isMobile ? 26 : 30, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.04em", margin: 0, marginBottom: 8 }}>
          Content
        </h1>
        <p style={{ fontSize: 15, color: "var(--ws-text-muted)", letterSpacing: "-0.02em", margin: 0, maxWidth: 620, lineHeight: 1.5 }}>
          {lang === "fr"
            ? "Importez vos vidéos, fichiers et livrables — la marque les retrouve dans Gérer les créateurs, à côté des scripts."
            : "Upload your videos, files, and deliverables — the brand sees them in Manage creators, next to scripts."}
        </p>
      </div>

      <div style={{ padding: isMobile ? "20px 16px 48px" : "32px 40px 48px", maxWidth: 960 }}>
        {!loading && brands.length > 0 && (
          <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--ws-text)", lineHeight: 1.5 }}>
            <span style={{ fontWeight: 600, color: "#1A7F37" }}>
              {lang === "fr" ? "A rejoint · " : "Joined · "}
            </span>
            {lang === "fr" ? "Vos fichiers sont envoyés à " : "Your files are sent to "}
            <strong>{brands.find((b) => b.id === brandId)?.name || brands[0]?.name}</strong>
          </p>
        )}
        {!loading && brands.length === 0 && linkError && (
          <p
            style={{
              margin: "0 0 20px",
              fontSize: 13,
              color: "var(--ws-danger)",
              lineHeight: 1.5,
            }}
          >
            {lang === "fr"
              ? "Aucune marque associée. Vérifiez dans Paramètres que votre pseudo correspond à celui de la marque, ou acceptez l'invitation reçue."
              : "No linked brand. Check Settings to confirm your handle matches the brand's records, or accept your invite."}
          </p>
        )}
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
                pickFiles(e.dataTransfer.files);
              }}
              style={{
                background: dragOver ? "var(--ws-hover)" : "var(--ws-surface-2)",
                border: dragOver ? "2px dashed var(--ws-accent)" : "2px solid transparent",
                borderRadius: 16,
                minHeight: isMobile ? 300 : 420,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 32,
                textAlign: "center",
                transition: "background 0.15s, border-color 0.15s",
                opacity: uploading ? 0.7 : 1,
                pointerEvents: uploading ? "none" : "auto",
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: "var(--ws-surface)",
                  border: "1px solid var(--ws-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 20,
                  boxShadow: "var(--ws-shadow)",
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 16V4m0 0l-4 4m4-4l4 4" stroke="var(--ws-text)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 20h16" stroke="var(--ws-text)" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <p style={{ fontSize: 17, fontWeight: 600, color: "var(--ws-text)", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
                {lang === "fr" ? "Glisser-déposer pour importer" : "Drag and drop to upload"}
              </p>
              <p style={{ fontSize: 13, color: "var(--ws-text-dim)", margin: "0 0 20px", lineHeight: 1.45, maxWidth: 280 }}>
                {lang === "fr"
                  ? `Vidéos (1–2 min+), images, PDF… jusqu’à ${CREATOR_CONTENT_MAX_FILE_LABEL} par fichier.`
                  : `Videos (1–2+ min), images, PDFs… up to ${CREATOR_CONTENT_MAX_FILE_LABEL} per file.`}
              </p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{
                  background: BLUE,
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: uploading ? "wait" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {lang === "fr" ? "Choisir des fichiers" : "Choose files"}
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={(e) => {
                  pickFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              {pendingFiles.length > 0 && (
                <div style={{ marginTop: 20, width: "100%", textAlign: "left" }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ws-text-dim)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {lang === "fr" ? "Fichiers sélectionnés" : "Selected files"}
                  </p>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {pendingFiles.map((f, i) => (
                      <li key={`${f.name}-${i}`} style={{ fontSize: 13, color: "var(--ws-text)", padding: "6px 0", borderBottom: "1px solid var(--ws-border)" }}>
                        {f.name}
                        <span style={{ color: "var(--ws-text-dim)", marginLeft: 8 }}>{formatBytes(f.size)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div>
              {brands.length >= 1 && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: "var(--ws-surface-2)",
                    border: "1px solid var(--ws-border)",
                    fontSize: 13,
                    color: "var(--ws-text-muted)",
                  }}
                >
                  <span style={{ fontWeight: 600, color: "var(--ws-text)" }}>
                    {lang === "fr" ? "Destination : " : "Destination: "}
                  </span>
                  {brands.find((b) => b.id === brandId)?.name || brands[0]?.name}
                </div>
              )}
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--ws-text)", marginBottom: 8 }}>
                {lang === "fr" ? "Titre" : "Title"}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={lang === "fr" ? "Ex : UGC v1 — hook A" : "e.g. UGC v1 — hook A"}
                style={{ ...inputStyle, marginBottom: 16 }}
              />

              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--ws-text)", marginBottom: 8 }}>
                {lang === "fr" ? "Notes" : "Notes"}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={lang === "fr" ? "Contexte, version, instructions…" : "Context, version, notes…"}
                rows={4}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, marginBottom: 16 }}
              />

              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ws-text)", margin: 0 }}>
                  {lang === "fr" ? "Ajouter un URL" : "Add a URL"}
                </label>
                <InfoTip
                  lang={lang}
                  text={
                    lang === "fr"
                      ? "Collez l'URL de votre post TikTok publié pour que Trackit récupère les vues, likes et l'engagement. La marque voit ces stats dans sa campagne et peut mesurer la performance de votre contenu."
                      : "Paste the URL of your published TikTok post so Trackit can fetch views, likes, and engagement. Your brand sees these stats in their campaign and can measure how your content performs."
                  }
                />
              </div>
              <input
                type="url"
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                placeholder="https://www.tiktok.com/@toncompte/video/..."
                style={{ ...inputStyle, marginBottom: 20 }}
              />

              {error && <p style={{ fontSize: 13, color: "var(--ws-danger)", margin: "0 0 12px" }}>{error}</p>}
              {success && <p style={{ fontSize: 13, color: "var(--ws-text)", margin: "0 0 12px" }}>{success}</p>}
              {lastUploadedLink && <ContentTrackedLink lang={lang} linkUrl={lastUploadedLink} />}

              <button
                type="button"
                onClick={() => void uploadAll()}
                disabled={uploading || pendingFiles.length === 0}
                className="hero-cta-shopify"
                style={{ padding: "12px 24px", fontSize: 14, opacity: uploading || pendingFiles.length === 0 ? 0.55 : 1 }}
              >
                {uploading
                  ? lang === "fr"
                    ? "Envoi en cours…"
                    : "Uploading…"
                  : lang === "fr"
                    ? "Envoyer à la marque"
                    : "Send to brand"}
              </button>
            </div>
          </div>

        <div style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em", margin: "0 0 16px" }}>
            {lang === "fr" ? "Contenu envoyé" : "Uploaded content"}
          </h2>
          {loading ? (
            <div style={{ color: "var(--ws-text-dim)", fontSize: 14 }}>{lang === "fr" ? "Chargement…" : "Loading…"}</div>
          ) : items.length === 0 ? (
            <div style={{ border: "1px solid var(--ws-border)", borderRadius: 14, padding: "32px 20px", textAlign: "center", color: "var(--ws-text-muted)", fontSize: 14 }}>
              {lang === "fr" ? "Aucun fichier envoyé pour le moment." : "No files uploaded yet."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {items.map((item) => (
                <div key={item.id} style={{ border: "1px solid var(--ws-border)", borderRadius: 14, padding: "16px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em" }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: "var(--ws-text-dim)", marginTop: 4 }}>
                        {fmtDate(item.created_at)}
                        {item.brandName ? ` · ${item.brandName}` : ""}
                        {item.file_size ? ` · ${formatBytes(item.file_size)}` : ""}
                      </div>
                      {item.notes && (
                        <p style={{ fontSize: 13, color: "var(--ws-text-muted)", margin: "8px 0 0", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{item.notes}</p>
                      )}
                      <ContentPostStatsDisplay item={item} lang={lang} />
                      {isVideoFile(item) && (
                        <video
                          src={item.file_url}
                          controls
                          style={{ display: "block", marginTop: 12, maxWidth: "100%", maxHeight: 280, borderRadius: 12, background: "#000" }}
                        />
                      )}
                      {isImageFile(item) && !isVideoFile(item) && (
                        <img
                          src={item.file_url}
                          alt=""
                          style={{ display: "block", marginTop: 12, maxWidth: "100%", maxHeight: 280, borderRadius: 12, border: "1px solid var(--ws-border)" }}
                        />
                      )}
                      <a
                        href={item.file_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: "inline-block", marginTop: 10, fontSize: 14, color: BLUE, fontWeight: 500, textDecoration: "none" }}
                      >
                        {item.file_name} →
                      </a>
                      {item.linkUrl ? <ContentTrackedLink lang={lang} linkUrl={item.linkUrl} /> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeItem(item.id)}
                      style={{
                        border: "1px solid #FECACA",
                        background: "var(--ws-surface)",
                        color: "var(--ws-danger)",
                        borderRadius: 8,
                        padding: "6px 12px",
                        fontSize: 13,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {lang === "fr" ? "Supprimer" : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
