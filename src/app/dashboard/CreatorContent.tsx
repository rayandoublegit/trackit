"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { supabase } from "@/lib/supabase";

const BLUE = "#0047FF";
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
};

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
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      };
      if (data?.ok) {
        setItems(data.items ?? []);
        const nextBrands = data.brands ?? [];
        setBrands(nextBrands);
        setBrandId((current) => current || (nextBrands[0]?.id ?? ""));
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
    const onUpdated = () => void load();
    window.addEventListener("trackit:content-updated", onUpdated);
    return () => window.removeEventListener("trackit:content-updated", onUpdated);
  }, [userId]);


  const pickFiles = (list: FileList | File[] | null | undefined) => {
    const files = Array.from(list ?? []).filter((f) => f.size > 0);
    if (!files.length) return;
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

    let brandList = brands;
    if (!brandList.length) {
      brandList = await load();
    }
    const brand = brandList.find((b) => b.id === brandId) ?? brandList[0] ?? null;
    if (!brand?.id || !brand.creatorRowId) {
      const refreshed = await load();
      const resolved = refreshed.find((b) => b.id === (brandId || refreshed[0]?.id)) ?? refreshed[0];
      if (!resolved?.creatorRowId) {
        setError(
          lang === "fr"
            ? "Impossible de lier votre compte à la marque. Réessayez dans quelques secondes."
            : "Could not link your account to the brand. Try again in a few seconds.",
        );
        return;
      }
      if (!brandId && resolved.id) setBrandId(resolved.id);
      await uploadWithBrand(resolved);
      return;
    }
    await uploadWithBrand(brand);
  };

  const uploadWithBrand = async (brand: BrandOption) => {
    if (!userId || !brand.creatorRowId || !supabase) return;
    const creatorRowId = brand.creatorRowId;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      let uploaded = 0;
      for (const file of pendingFiles) {
        const path = `${userId}/${brand.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeStorageName(file.name)}`;
        const { error: upErr } = await supabase.storage
          .from("creator-content")
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw new Error(upErr.message);

        const { data: pub } = supabase.storage.from("creator-content").getPublicUrl(path);
        const itemTitle = pendingFiles.length === 1 && title.trim() ? title.trim() : title.trim() || file.name;

        const res = await fetch("/api/creator/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            brandId: brand.id,
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
        if (!res.ok || !data?.ok) throw new Error(data.error ?? "Upload failed");
        uploaded += 1;
      }

      setPendingFiles([]);
      setTitle("");
      setNotes("");
      setSuccess(
        lang === "fr"
          ? `${uploaded} fichier${uploaded > 1 ? "s" : ""} envoyé${uploaded > 1 ? "s" : ""} à la marque.`
          : `${uploaded} file${uploaded > 1 ? "s" : ""} sent to the brand.`,
      );
      window.dispatchEvent(new CustomEvent("trackit:content-updated"));
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
    window.dispatchEvent(new CustomEvent("trackit:content-updated"));
    setItems((list) => list.filter((i) => i.id !== id));
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
    <div style={{ minHeight: "100%", background: "#FFFFFF" }}>
      <div
        style={{
          paddingTop: isMobile ? 56 : 40,
          paddingRight: isMobile ? 16 : 40,
          paddingBottom: isMobile ? 16 : 24,
          paddingLeft: isMobile ? 16 : 40,
          borderBottom: "1px solid #EFEFEF",
        }}
      >
        <img src={TRACKIT_LOGO} alt="Trackit" style={{ height: 36, width: "auto", marginBottom: 20, opacity: 0.9 }} />
        <h1 style={{ fontSize: isMobile ? 26 : 30, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0, marginBottom: 8 }}>
          Content
        </h1>
        <p style={{ fontSize: 15, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0, maxWidth: 620, lineHeight: 1.5 }}>
          {lang === "fr"
            ? "Importez vos vidéos, fichiers et livrables — la marque les retrouve dans Gérer les créateurs, à côté des scripts."
            : "Upload your videos, files, and deliverables — the brand sees them in Manage creators, next to scripts."}
        </p>
      </div>

      <div style={{ padding: isMobile ? "20px 16px 48px" : "32px 40px 48px", maxWidth: 960 }}>
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
                background: dragOver ? "#F0F4FF" : "#F7F7F7",
                border: dragOver ? "2px dashed #0047FF" : "2px solid transparent",
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
                  background: "#FFFFFF",
                  border: "1px solid #EFEFEF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 20,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 16V4m0 0l-4 4m4-4l4 4" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 20h16" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <p style={{ fontSize: 17, fontWeight: 600, color: "#1A1A1A", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
                {lang === "fr" ? "Glisser-déposer pour importer" : "Drag and drop to upload"}
              </p>
              <p style={{ fontSize: 13, color: "#9A9A9A", margin: "0 0 20px", lineHeight: 1.45, maxWidth: 280 }}>
                {lang === "fr"
                  ? "Vidéos, images, PDF, archives… tous les formats sont acceptés."
                  : "Videos, images, PDFs, archives… all file types are accepted."}
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
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#9A9A9A", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {lang === "fr" ? "Fichiers sélectionnés" : "Selected files"}
                  </p>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {pendingFiles.map((f, i) => (
                      <li key={`${f.name}-${i}`} style={{ fontSize: 13, color: "#1A1A1A", padding: "6px 0", borderBottom: "1px solid #ECECEC" }}>
                        {f.name}
                        <span style={{ color: "#9A9A9A", marginLeft: 8 }}>{formatBytes(f.size)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div>
              {brands.length > 1 && (
                <>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 8 }}>
                    {lang === "fr" ? "Marque" : "Brand"}
                  </label>
                  <select
                    value={brandId}
                    onChange={(e) => setBrandId(e.target.value)}
                    style={{ ...inputStyle, marginBottom: 16 }}
                  >
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 8 }}>
                {lang === "fr" ? "Titre (optionnel)" : "Title (optional)"}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={lang === "fr" ? "Ex : UGC v1 — hook A" : "e.g. UGC v1 — hook A"}
                style={{ ...inputStyle, marginBottom: 16 }}
              />

              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 8 }}>
                {lang === "fr" ? "Notes (optionnel)" : "Notes (optional)"}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={lang === "fr" ? "Contexte, version, instructions…" : "Context, version, notes…"}
                rows={4}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, marginBottom: 20 }}
              />

              {error && <p style={{ fontSize: 13, color: "#C62828", margin: "0 0 12px" }}>{error}</p>}
              {success && <p style={{ fontSize: 13, color: "#1A7F37", margin: "0 0 12px" }}>{success}</p>}

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
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", margin: "0 0 16px" }}>
            {lang === "fr" ? "Contenu envoyé" : "Uploaded content"}
          </h2>
          {loading ? (
            <div style={{ color: "#9A9A9A", fontSize: 14 }}>{lang === "fr" ? "Chargement…" : "Loading…"}</div>
          ) : items.length === 0 ? (
            <div style={{ border: "1px solid #EFEFEF", borderRadius: 14, padding: "32px 20px", textAlign: "center", color: "#7A7A7A", fontSize: 14 }}>
              {lang === "fr" ? "Aucun fichier envoyé pour le moment." : "No files uploaded yet."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {items.map((item) => (
                <div key={item.id} style={{ border: "1px solid #EFEFEF", borderRadius: 14, padding: "16px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: "#9A9A9A", marginTop: 4 }}>
                        {fmtDate(item.created_at)}
                        {item.brandName ? ` · ${item.brandName}` : ""}
                        {item.file_size ? ` · ${formatBytes(item.file_size)}` : ""}
                      </div>
                      {item.notes && (
                        <p style={{ fontSize: 13, color: "#7A7A7A", margin: "8px 0 0", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{item.notes}</p>
                      )}
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
                          style={{ display: "block", marginTop: 12, maxWidth: "100%", maxHeight: 280, borderRadius: 12, border: "1px solid #EFEFEF" }}
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
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeItem(item.id)}
                      style={{
                        border: "1px solid #FECACA",
                        background: "#FFF",
                        color: "#DC2626",
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
