"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/useLang";
import {
  formatContentBytes,
  isImageContentFile,
  isVideoContentFile,
  type ContentListItem,
} from "@/lib/content-shared";
import { CreatorAvatar } from "./CreatorAvatar";

const BLUE = "#0047FF";

function formatDate(iso: string, lang: Lang) {
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

export function CampaignContentTab({
  lang,
  brandId,
  campaignId,
  isMobile,
}: {
  lang: Lang;
  brandId?: string;
  campaignId: string;
  isMobile?: boolean;
}) {
  const [items, setItems] = useState<ContentListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!brandId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/content?brandId=${encodeURIComponent(brandId)}&campaignId=${encodeURIComponent(campaignId)}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as { ok?: boolean; items?: ContentListItem[] };
        if (!cancelled && data?.ok) setItems(data.items ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const onUpdated = () => {
      void (async () => {
        const res = await fetch(
          `/api/content?brandId=${encodeURIComponent(brandId)}&campaignId=${encodeURIComponent(campaignId)}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as { ok?: boolean; items?: ContentListItem[] };
        if (data?.ok) setItems(data.items ?? []);
      })();
    };
    window.addEventListener("trackit:content-updated", onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("trackit:content-updated", onUpdated);
    };
  }, [brandId, campaignId]);

  if (loading) {
    return <p style={{ fontSize: 14, color: "#9A9A9A" }}>{lang === "fr" ? "Chargement…" : "Loading…"}</p>;
  }

  if (items.length === 0) {
    return (
      <p style={{ fontSize: 15, color: "#6B7280", lineHeight: 1.5, margin: 0 }}>
        {lang === "fr"
          ? "Aucun contenu pour cette campagne. Dès qu'un créateur membre envoie du contenu, il apparaîtra ici automatiquement."
          : "No content for this campaign yet. When a member creator uploads content, it will appear here automatically."}
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {items.map((item) => {
        const isImage = isImageContentFile(item);
        const isVideo = isVideoContentFile(item);
        return (
          <article
            key={item.id}
            style={{
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              gap: 16,
              border: "1px solid #EFEFEF",
              borderRadius: 14,
              padding: 16,
              background: "#FFFFFF",
            }}
          >
            <div
              style={{
                width: isMobile ? "100%" : 200,
                flexShrink: 0,
                aspectRatio: "16/10",
                borderRadius: 10,
                overflow: "hidden",
                background: "#F5F5F5",
              }}
            >
              {isImage ? (
                <img src={item.file_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : isVideo ? (
                <video src={item.file_url} controls style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    color: "#6B7280",
                    padding: 8,
                    textAlign: "center",
                  }}
                >
                  {item.file_name}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <CreatorAvatar
                  src={null}
                  username={item.creatorHandle || ""}
                  displayName={item.creatorName || item.creatorHandle || ""}
                  size={32}
                  alt={item.creatorName || ""}
                />
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>
                  {item.creatorName || (item.creatorHandle ? `@${item.creatorHandle}` : "—")}
                </div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontSize: 13, color: "#9A9A9A", marginBottom: 8 }}>
                {formatDate(item.created_at, lang)}
                {item.file_size ? ` · ${formatContentBytes(item.file_size)}` : ""}
              </div>
              {item.notes ? (
                <p style={{ fontSize: 13, color: "#4B5563", margin: "0 0 10px", lineHeight: 1.5 }}>{item.notes}</p>
              ) : null}
              <a
                href={item.file_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 13, fontWeight: 500, color: BLUE, textDecoration: "none" }}
              >
                {lang === "fr" ? "Ouvrir le fichier" : "Open file"} →
              </a>
            </div>
          </article>
        );
      })}
    </div>
  );
}
