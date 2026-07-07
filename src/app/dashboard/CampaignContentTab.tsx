"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lang } from "@/lib/useLang";
import {
  isImageContentFile,
  isVideoContentFile,
  type ContentListItem,
} from "@/lib/content-shared";
import { useAnalyticsAutoRefresh } from "@/lib/analytics-auto-refresh";
import { AddBrandContentPanel } from "./AddBrandContentPanel";
import { CampaignContentPerformancePanel } from "./CampaignContentPerformancePanel";
import { ContentFileActions } from "./ContentFileActions";
import { ContentPostStatsDisplay } from "./ContentPostStats";

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

  useAnalyticsAutoRefresh(loadItems, { enabled: !!brandId, pollIntervalMs: 20_000 });

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
        <CampaignContentPerformancePanel lang={lang} brandId={brandId} campaignId={campaignId} isMobile={isMobile} />
        <AddBrandContentPanel
          open={showAddContent}
          onClose={() => setShowAddContent(false)}
          brandId={brandId}
          campaignCreatorIds={campaignCreatorIds}
          onSuccess={() => setShowAddContent(false)}
        />
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
        <CampaignContentPerformancePanel lang={lang} brandId={brandId} campaignId={campaignId} isMobile={isMobile} />
        <AddBrandContentPanel
          open={showAddContent}
          onClose={() => setShowAddContent(false)}
          brandId={brandId}
          campaignCreatorIds={campaignCreatorIds}
          onSuccess={() => setShowAddContent(false)}
        />
      </>
    );
  }

  return (
    <>
      {header}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 14,
        }}
      >
        {items.map((item) => {
          const isImage = isImageContentFile(item);
          const isVideo = isVideoContentFile(item);
          const fileLabel = item.title?.trim() || item.file_name || "—";
          const creatorLabel =
            item.creatorName || (item.creatorHandle ? `@${item.creatorHandle}` : null);

          return (
            <article
              key={item.id}
              style={{
                display: "flex",
                flexDirection: "column",
                border: "1px solid #EFEFEF",
                borderRadius: 14,
                overflow: "hidden",
                background: "#FFFFFF",
                minHeight: 0,
              }}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "16/10",
                  background: "#F5F5F5",
                  flexShrink: 0,
                }}
              >
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.file_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : isVideo ? (
                  <video src={item.file_url} controls style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <div
                    style={{
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      color: "#6B7280",
                      padding: 12,
                      textAlign: "center",
                      wordBreak: "break-word",
                    }}
                  >
                    {item.file_name}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "12px 14px 14px",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#1A1A1A",
                        letterSpacing: "-0.02em",
                        lineHeight: 1.3,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={fileLabel}
                    >
                      {fileLabel}
                    </div>
                    {item.notes ? (
                      <p
                        style={{
                          fontSize: 13,
                          color: "#6B7280",
                          margin: "4px 0 0",
                          lineHeight: 1.4,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {item.notes}
                      </p>
                    ) : creatorLabel ? (
                      <div style={{ fontSize: 12, color: "#9A9A9A", marginTop: 4, letterSpacing: "-0.01em" }}>
                        {creatorLabel}
                      </div>
                    ) : null}
                    <ContentPostStatsDisplay item={item} lang={lang} />
                  </div>
                  <time
                    dateTime={item.created_at}
                    style={{
                      fontSize: 12,
                      color: "#9A9A9A",
                      letterSpacing: "-0.01em",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      paddingTop: 2,
                    }}
                  >
                    {formatDate(item.created_at, lang)}
                  </time>
                </div>

                <div style={{ marginTop: "auto", paddingTop: 4 }}>
                  <ContentFileActions
                    lang={lang}
                    brandId={brandId}
                    contentId={item.id}
                    fileUrl={item.file_url}
                    fileName={item.file_name}
                    openLabel={lang === "fr" ? "Ouvrir le fichier" : "Open file"}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <CampaignContentPerformancePanel lang={lang} brandId={brandId} campaignId={campaignId} isMobile={isMobile} />
      <AddBrandContentPanel
        open={showAddContent}
        onClose={() => setShowAddContent(false)}
        brandId={brandId}
        campaignCreatorIds={campaignCreatorIds}
        onSuccess={() => setShowAddContent(false)}
      />
    </>
  );
}
