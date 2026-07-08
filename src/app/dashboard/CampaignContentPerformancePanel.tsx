"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lang } from "@/lib/useLang";
import { useAnalyticsAutoRefresh } from "@/lib/analytics-auto-refresh";
import { videoEmbedPlayUrl } from "@/lib/creator-video";
import { TikTokEmbedModal } from "@/app/dashboard/TikTokEmbedPlayer";
import {
  calcEngagementRate,
  formatCompactStat,
  isImageContentFile,
  isVideoContentFile,
  type ContentListItem,
} from "@/lib/content-shared";
import { AnalyticsSectionHeader } from "./analytics-metric-cards";

type PerfRow = ContentListItem;

function sortPerfRows(items: PerfRow[]): PerfRow[] {
  const withStats = items
    .filter((item) => item.post_url && item.stats_updated_at)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  const pending = items.filter((item) => item.post_url && !item.stats_updated_at);
  return [...withStats, ...pending];
}

function formatPostDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatEngagement(row: PerfRow): string {
  const rate = calcEngagementRate(row.views, row.likes, row.comments, row.shares);
  if (rate == null) return "—";
  return `${rate.toFixed(1)}%`;
}

function ContentThumb({ item }: { item: PerfRow }) {
  const isImage = isImageContentFile(item);
  const isVideo = isVideoContentFile(item);
  const boxStyle: React.CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: "hidden",
    flexShrink: 0,
    background: "#F3F4F6",
    border: "1px solid #EFEFEF",
  };

  if (isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item.file_url} alt="" style={{ ...boxStyle, objectFit: "cover", display: "block" }} />
    );
  }
  if (isVideo) {
    return <video src={item.file_url} style={{ ...boxStyle, objectFit: "cover", display: "block" }} muted />;
  }
  return (
    <div
      style={{
        ...boxStyle,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        color: "#9A9A9A",
        padding: 4,
        textAlign: "center",
        wordBreak: "break-word",
      }}
    >
      {item.file_name.slice(0, 8)}
    </div>
  );
}

function StatsToast({ message }: { message: string }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        background: "#1A1A1A",
        color: "#FFFFFF",
        padding: "12px 18px",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 500,
        zIndex: 1200,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        fontFamily: "inherit",
      }}
    >
      {message}
    </div>
  );
}

export function CampaignContentPerformancePanel({
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
  const [rows, setRows] = useState<PerfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [playingPostUrl, setPlayingPostUrl] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    if (!brandId) return;
    const res = await fetch(
      `/api/content?brandId=${encodeURIComponent(brandId)}&campaignId=${encodeURIComponent(campaignId)}`,
      { cache: "no-store" },
    );
    const data = (await res.json()) as { ok?: boolean; items?: ContentListItem[] };
    const withPostUrl = (data.items ?? []).filter((item) => item.post_url);
    setRows(sortPerfRows(withPostUrl));
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
        await load();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brandId, load]);

  useAnalyticsAutoRefresh(load, { pollIntervalMs: 20_000, enabled: !!brandId });

  const refreshStats = async (contentId: string) => {
    setRefreshingId(contentId);
    try {
      const res = await fetch("/api/content/refresh-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        pending?: boolean;
        stats?: {
          views: number | null;
          likes: number | null;
          comments: number | null;
          shares: number | null;
          postedAt: string | null;
        };
      };

      if (data.ok && data.stats) {
        setRows((prev) =>
          sortPerfRows(
            prev.map((row) =>
              row.id === contentId
                ? {
                    ...row,
                    views: data.stats!.views,
                    likes: data.stats!.likes,
                    comments: data.stats!.comments,
                    shares: data.stats!.shares,
                    posted_at: data.stats!.postedAt,
                    stats_updated_at: new Date().toISOString(),
                  }
                : row,
            ),
          ),
        );
      } else if (data.pending) {
        showToast(lang === "fr" ? "Stats indisponibles pour le moment" : "Stats unavailable for now");
      }
    } finally {
      setRefreshingId(null);
    }
  };

  const thStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 12,
    fontWeight: 500,
    color: "#9A9A9A",
    letterSpacing: "-0.01em",
    textAlign: "left",
    borderBottom: "1px solid #EFEFEF",
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: "14px",
    fontSize: 13,
    color: "#1A1A1A",
    borderBottom: "1px solid #F5F5F5",
    verticalAlign: "middle",
  };

  const empty = !loading && rows.length === 0;

  return (
    <section style={{ marginTop: isMobile ? 28 : 36 }}>
      {toast ? <StatsToast message={toast} /> : null}
      {playingPostUrl ? (
        <TikTokEmbedModal
          shareUrl={playingPostUrl}
          title={lang === "fr" ? "Vidéo TikTok" : "TikTok video"}
          onClose={() => setPlayingPostUrl(null)}
        />
      ) : null}

      <AnalyticsSectionHeader
        title={lang === "fr" ? "Performance par contenu" : "Performance by content"}
        info={
          lang === "fr"
            ? "Statistiques TikTok des posts liés par les créateurs (vues, likes, engagement)."
            : "TikTok stats for posts linked by creators (views, likes, engagement)."
        }
        lang={lang}
      />

      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #EFEFEF",
          borderRadius: 16,
          padding: isMobile ? "18px 16px" : "22px 22px 20px",
          boxSizing: "border-box",
        }}
      >
        {loading ? (
          <p style={{ margin: 0, fontSize: 13, color: "#9A9A9A" }}>{lang === "fr" ? "Chargement…" : "Loading…"}</p>
        ) : empty ? (
          <p style={{ margin: 0, fontSize: 14, color: "#6B7280", lineHeight: 1.5 }}>
            {lang === "fr"
              ? "Aucun contenu avec URL TikTok pour l'instant. Ajoutez une URL lors de l'envoi de contenu ou demandez aux créateurs de le faire."
              : "No content with a TikTok URL yet. Add a URL when uploading content or ask creators to include one."}
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
              <thead>
                <tr>
                  <th style={thStyle}>{lang === "fr" ? "Contenu" : "Content"}</th>
                  <th style={thStyle}>{lang === "fr" ? "Vues" : "Views"}</th>
                  <th style={thStyle}>Likes</th>
                  <th style={thStyle}>{lang === "fr" ? "Engagement" : "Engagement"}</th>
                  <th style={thStyle}>{lang === "fr" ? "Date du post" : "Post date"}</th>
                  <th style={thStyle} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const pending = !row.stats_updated_at;
                  const title = row.title?.trim() || row.file_name || "—";
                  const refreshing = refreshingId === row.id;
                  const canPlayPost = Boolean(row.post_url && videoEmbedPlayUrl(row.post_url));

                  return (
                    <tr key={row.id}>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          onClick={() => { if (canPlayPost && row.post_url) setPlayingPostUrl(row.post_url); }}
                          disabled={!canPlayPost}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            minWidth: 0,
                            width: "100%",
                            padding: 0,
                            border: "none",
                            background: "transparent",
                            textAlign: "left",
                            cursor: canPlayPost ? "pointer" : "default",
                            fontFamily: "inherit",
                          }}
                        >
                          <ContentThumb item={row} />
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 500,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: isMobile ? 140 : 220,
                              }}
                              title={title}
                            >
                              {title}
                            </div>
                            {pending ? (
                              <span
                                style={{
                                  display: "inline-block",
                                  marginTop: 4,
                                  fontSize: 11,
                                  fontWeight: 500,
                                  color: "#6B7280",
                                  background: "#F3F4F6",
                                  borderRadius: 6,
                                  padding: "2px 7px",
                                }}
                              >
                                {lang === "fr" ? "En attente" : "Pending"}
                              </span>
                            ) : canPlayPost ? (
                              <span style={{ display: "inline-block", marginTop: 4, fontSize: 11, color: "#0047FF", fontWeight: 500 }}>
                                {lang === "fr" ? "▶ Lire la vidéo" : "▶ Play video"}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: pending ? 400 : 600 }}>
                        {pending ? "—" : formatCompactStat(row.views, lang)}
                      </td>
                      <td style={tdStyle}>{pending ? "—" : formatCompactStat(row.likes, lang)}</td>
                      <td style={tdStyle}>{pending ? "—" : formatEngagement(row)}</td>
                      <td style={tdStyle}>{pending ? "—" : formatPostDate(row.posted_at, lang)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={() => void refreshStats(row.id)}
                          disabled={refreshing}
                          style={{
                            border: "1px solid #E5E5E5",
                            background: "#FFF",
                            borderRadius: 8,
                            padding: "6px 12px",
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: refreshing ? "wait" : "pointer",
                            fontFamily: "inherit",
                            color: "#1A1A1A",
                            opacity: refreshing ? 0.6 : 1,
                            minWidth: 88,
                          }}
                        >
                          {refreshing ? "…" : lang === "fr" ? "Actualiser" : "Refresh"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
