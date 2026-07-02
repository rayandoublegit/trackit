"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lang } from "@/lib/useLang";
import {
  formatContentBytes,
  isImageContentFile,
  isVideoContentFile,
  type ContentListItem,
} from "@/lib/content-shared";
import { CreatorAvatar } from "./CreatorAvatar";
import { AddBrandContentOnboarding } from "./AddBrandContentOnboarding";

const BLUE = "#0047FF";

const addContentBtn: React.CSSProperties = {
  background: "#1A1A1A",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  fontSize: 14,
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
  whiteSpace: "nowrap",
};

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
  campaignCreatorIds = [],
  isMobile,
}: {
  lang: Lang;
  brandId?: string;
  campaignId: string;
  campaignCreatorIds?: string[];
  isMobile?: boolean;
}) {
  const [items, setItems] = useState<ContentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddContent, setShowAddContent] = useState(false);

  const loadItems = useCallback(async () => {
    if (!brandId) return;
    const res = await fetch(
      `/api/content?brandId=${encodeURIComponent(brandId)}&campaignId=${encodeURIComponent(campaignId)}`,
      { cache: "no-store" },
    );
    const data = (await res.json()) as { ok?: boolean; items?: ContentListItem[] };
    if (data?.ok) setItems(data.items ?? []);
  }, [brandId, campaignId]);

  useEffect(() => {
    if (!brandId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        await loadItems();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const onUpdated = () => {
      void loadItems();
    };
    window.addEventListener("trackit:content-updated", onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("trackit:content-updated", onUpdated);
    };
  }, [brandId, campaignId, loadItems]);

  if (showAddContent) {
    return (
      <AddBrandContentOnboarding
        brandId={brandId}
        isMobile={isMobile}
        campaignCreatorIds={campaignCreatorIds}
        onClose={() => setShowAddContent(false)}
        onSuccess={() => {
          window.dispatchEvent(new CustomEvent("trackit:content-updated"));
          setShowAddContent(false);
        }}
      />
    );
  }

  const header = (
    <div
      style={{
        display: "flex",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: items.length > 0 || loading ? 20 : 0,
        flexWrap: "wrap",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>
        {lang === "fr" ? "Contenu de la campagne" : "Campaign content"}
      </div>
      <button type="button" style={addContentBtn} onClick={() => setShowAddContent(true)}>
        {lang === "fr" ? "+ Ajouter du contenu" : "+ Add content"}
      </button>
    </div>
  );

  if (loading) {
    return (
      <>
        {header}
        <p style={{ fontSize: 14, color: "#9A9A9A" }}>{lang === "fr" ? "Chargement…" : "Loading…"}</p>
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        {header}
        <div
          style={{
            border: "1px dashed #E5E5E5",
            borderRadius: 14,
            padding: "40px 24px",
            textAlign: "center",
            marginTop: 12,
          }}
        >
          <p style={{ fontSize: 15, color: "#6B7280", lineHeight: 1.5, margin: "0 0 16px" }}>
            {lang === "fr"
              ? "Aucun contenu pour cette campagne. Ajoutez-en ou attendez qu'un créateur membre en envoie depuis son dashboard."
              : "No content for this campaign yet. Add some yourself or wait for a member creator to upload from their dashboard."}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
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
    </>
  );
}
