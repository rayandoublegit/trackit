"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/useLang";
import { discoveryCopy } from "@/lib/discovery-copy";
import { CreatorAvatar } from "./CreatorAvatar";

const TRACKIT_LOGO = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";
const BLUE = "#0047FF";

type ContentItem = {
  id: string;
  title: string;
  notes: string | null;
  file_url: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
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

export function CreatorContentBrandPanel({
  lang,
  isMobile,
  brandId,
  creatorUsername,
  displayName,
  avatarUrl,
  onClose,
}: {
  lang: Lang;
  isMobile?: boolean;
  brandId: string;
  creatorUsername: string;
  displayName: string;
  avatarUrl?: string | null;
  onClose: () => void;
}) {
  const t = discoveryCopy(lang);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const handle = encodeURIComponent(creatorUsername.replace(/^@/, ""));
        const res = await fetch(`/api/content?brandId=${brandId}&targetHandle=${handle}`, { cache: "no-store" });
        const data = (await res.json()) as { ok?: boolean; items?: ContentItem[] };
        if (!cancelled && data?.ok) setItems(data.items ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const onUpdated = () => {
      void (async () => {
        const handle = encodeURIComponent(creatorUsername.replace(/^@/, ""));
        const res = await fetch(`/api/content?brandId=${brandId}&targetHandle=${handle}`, { cache: "no-store" });
        const data = (await res.json()) as { ok?: boolean; items?: ContentItem[] };
        if (data?.ok) setItems(data.items ?? []);
      })();
    };
    window.addEventListener("trackit:content-updated", onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("trackit:content-updated", onUpdated);
    };
  }, [brandId, creatorUsername]);

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div style={{ minHeight: "100%" }}>
      <img src={TRACKIT_LOGO} alt="Trackit" style={{ height: 40, width: "auto", display: "block", marginBottom: 20, opacity: 0.9 }} />
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
        {t.contentPanelBack}
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
            {t.contentPanelTitle}
          </h1>
          <p style={{ fontSize: 14, color: "#7A7A7A", margin: 0 }}>{t.contentPanelSubtitle(displayName)}</p>
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: 14, color: "#7A7A7A" }}>{t.loading}</p>
      ) : items.length === 0 ? (
        <div
          style={{
            border: "1px solid #EFEFEF",
            borderRadius: 16,
            padding: "48px 24px",
            textAlign: "center",
            background: "#FAFAFA",
          }}
        >
          <p style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px" }}>{t.contentEmptyTitle}</p>
          <p style={{ fontSize: 14, color: "#7A7A7A", margin: 0, lineHeight: 1.5 }}>{t.contentEmptySubtitle}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                border: "1px solid #EFEFEF",
                borderRadius: 14,
                padding: "18px 20px",
                background: "#FFFFFF",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 4 }}>
                {item.title}
              </div>
              <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: item.notes || item.file_url ? 10 : 0 }}>
                {fmtDate(item.created_at)}
                {item.file_size ? ` · ${formatBytes(item.file_size)}` : ""}
              </div>
              {item.notes && (
                <p style={{ fontSize: 14, color: "rgba(0,0,0,0.7)", lineHeight: 1.5, margin: "0 0 10px", whiteSpace: "pre-wrap" }}>
                  {item.notes}
                </p>
              )}
              {isVideoFile(item) && (
                <video
                  src={item.file_url}
                  controls
                  style={{
                    display: "block",
                    width: "100%",
                    maxHeight: 360,
                    borderRadius: 12,
                    background: "#000",
                    marginBottom: 10,
                  }}
                />
              )}
              {isImageFile(item) && !isVideoFile(item) && (
                <img
                  src={item.file_url}
                  alt=""
                  style={{
                    display: "block",
                    maxWidth: "100%",
                    maxHeight: 360,
                    borderRadius: 12,
                    border: "1px solid #EFEFEF",
                    marginBottom: 10,
                  }}
                />
              )}
              <a
                href={item.file_url}
                target="_blank"
                rel="noreferrer"
                download={item.file_name}
                style={{ fontSize: 14, color: BLUE, fontWeight: 500, textDecoration: "none" }}
              >
                {item.file_name} →
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
