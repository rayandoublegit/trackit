"use client";

import { useEffect, useState } from "react";
import { saveCreator, getSavedCreators, removeCreator } from "@/lib/db";
import { notifyCreatorSaved } from "@/lib/notifications-storage";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import {
  setDiscoveryPrefs,
  type DiscoveryLanguage,
  type DiscoveryLocation,
} from "@/lib/locale-preferences";
import {
  formatCurrency,
} from "@/lib/useCurrency";
import {
  getCreatorCountryFlag,
  getCreatorCountryLabel,
  resolveCreatorCountryCode,
} from "@/lib/creator-country";
import {
  BASIC_MAX_MANAGED_CREATORS,
  PRO_MAX_MANAGED_CREATORS,
  getDailyDiscoveryLimit,
  getResultsPerSearchLimit,
  getVisibleDiscoveryResults,
  hasDiscoveryDailyCap,
  hasReachedManagedCreatorLimit,
  type PlanTier,
} from "@/lib/plan-limits";
import { UpgradeModal } from "./UpgradeModal";
import {
  DISCOVERY_RESULTS_CACHE_KEY,
  SAVED_CREATOR_SNAPSHOTS_KEY,
  SAVED_CREATORS_ORDER_KEY,
} from "@/lib/discovery-cache";

type DiscoveryTab = "discover" | "saved";

type VideoThumbnail = {
  views: number;
  thumbnail: string | null;
  url?: string | null;
};

type Creator = {
  username: string;
  displayName: string;
  avatarUrl: string;
  followersCount: number;
  engagementRate: number;
  avgViews: number;
  platform: string;
  bio: string;
  email?: string | null;
  niche: string;
  language?: string | null;
  location?: string | null;
  countryCode?: string | null;
  videoThumbnails?: VideoThumbnail[];
};

type OutreachModalTab = "generate" | "templates" | "send";
type OutreachTone = "Casual" | "Professional" | "Friendly" | "Direct";
type OutreachPlatform = "TikTok DM" | "Instagram DM" | "Email";

type OutreachTemplate = {
  id: string;
  name: string;
  body: string;
  platform: OutreachPlatform;
};

type OutreachContact = {
  username: string;
  displayName: string;
  status: "Contacted";
};

const INITIAL_OUTREACH_TEMPLATES: OutreachTemplate[] = [];

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #E5E5E5",
  fontSize: 14,
  fontFamily: "inherit",
  color: "#1A1A1A",
  letterSpacing: "-0.02em",
};

function enrichCreatorCountry(
  creator: Creator,
  fallbackLocation?: DiscoveryLocation,
  fallbackLanguage?: DiscoveryLanguage
): Creator {
  const countryCode =
    creator.countryCode || resolveCreatorCountryCode(creator.location, creator.language);
  if (countryCode) {
    return { ...creator, countryCode };
  }
  if (fallbackLocation === "FR" || fallbackLanguage === "french") {
    return {
      ...creator,
      countryCode: "FR",
      location: creator.location || "France",
      language: creator.language || "fr",
    };
  }
  if (fallbackLocation === "US" || fallbackLanguage === "english") {
    return {
      ...creator,
      countryCode: "US",
      location: creator.location || "United States",
      language: creator.language || "en",
    };
  }
  return creator;
}

function buildGeneratedMessage(creator: Creator, brand: string, userName: string) {
  const brandLabel = brand.trim() || "our brand";
  const firstName = creator.displayName.split(" ")[0];
  return `Hey ${firstName} 👋 

I've been following your content and I love how authentic your ${creator.niche} posts are. Your engagement rate is seriously impressive.

I run ${brandLabel} and I think your audience would genuinely love what we do. We're looking for creators like you for a paid partnership — no scripts, just honest content in your style.

Would you be open to a quick chat? Happy to send over details and a free product to try first.

— ${userName}`;
}

function newTemplateId() {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const VIDEO_GRADIENTS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
];

function usernameSeed(username: string) {
  let hash = 0;
  for (let i = 0; i < (username?.length ?? 0); i++) hash += username?.charCodeAt(i) ?? 0;
  return hash;
}

function gradientForVideo(username: string, thumbIndex: number) {
  return VIDEO_GRADIENTS[(usernameSeed(username) + thumbIndex) % VIDEO_GRADIENTS.length];
}

const btnPrimary: React.CSSProperties = {
  background: "#0047FF",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const btnSecondary: React.CSSProperties = {
  background: "#FFFFFF",
  color: "#1A1A1A",
  border: "1px solid #E5E5E5",
  borderRadius: 10,
  padding: "10px 16px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const btnBlack: React.CSSProperties = {
  background: "#1A1A1A",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const filterSelectStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6,
  background: "#FFFFFF",
  border: "1px solid #E5E5E5",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: "inherit",
  color: "#1A1A1A",
  cursor: "pointer",
  letterSpacing: "-0.01em",
  width: "100%",
  boxSizing: "border-box",
};

function formatCount(n: number) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0) return "0";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(Math.round(num));
}

function DiscoveryHeader({ lang, isMobile }: { lang: "en" | "fr"; isMobile?: boolean }) {
  return (
    <div style={{ paddingTop: isMobile ? 56 : 40, paddingRight: isMobile ? 16 : 40, paddingBottom: isMobile ? 16 : 0, paddingLeft: isMobile ? 16 : 40, background: "#FFFFFF" }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0, marginBottom: 6 }}>
        {lang === "fr" ? "Recherche" : "Discovery"}
      </h1>
      <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0 }}>
        {lang === "fr" ? "Recherchez parmi 250M+ créateurs sur toutes les grandes plateformes" : "Search 250M+ creators across every major platform"}
      </p>
    </div>
  );
}

function DiscoveryTabs({
  lang,
  activeTab,
  savedCount,
  onTabChange,
}: {
  lang: "en" | "fr";
  activeTab: DiscoveryTab;
  savedCount: number;
  onTabChange: (tab: DiscoveryTab) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: "20px 40px 0 40px",
        background: "#FFFFFF",
        borderBottom: "1px solid #EFEFEF",
      }}
    >
      {(
        [
          { id: "discover" as const, label: lang === "fr" ? "Découvrir" : "Discover" },
          { id: "saved" as const, label: lang === "fr" ? "Créateurs sauvegardés" : "Saved Creators", badge: savedCount },
        ] as const
      ).map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: active ? "2px solid #0047FF" : "2px solid transparent",
              padding: "10px 4px 14px",
              marginRight: 20,
              fontSize: 14,
              fontWeight: active ? 600 : 400,
              color: active ? "#1A1A1A" : "#7A7A7A",
              fontFamily: "inherit",
              cursor: "pointer",
              letterSpacing: "-0.02em",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {tab.label}
            {"badge" in tab && tab.badge > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: active ? "#0047FF" : "#7A7A7A",
                  background: active ? "rgba(0,71,255,0.1)" : "#F0F0F0",
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SaveToast({ message }: { message: string }) {
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
        letterSpacing: "-0.02em",
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        zIndex: 1100,
        fontFamily: "inherit",
      }}
    >
      {message}
    </div>
  );
}

type CreatorsIndexRow = {
  username?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  followers?: number | null;
  engagement_rate?: number | null;
  avg_views?: number | null;
  bio?: string | null;
  platform?: string | null;
  language?: string | null;
  location?: string | null;
  niches?: string[] | null;
  video_thumbnails?: unknown;
};

function normalizeVideoThumbnails(raw: unknown): VideoThumbnail[] {
  if (!Array.isArray(raw)) return [];
  const out: VideoThumbnail[] = [];
  for (const item of raw.slice(0, 3)) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const views = Number(v.views);
    const thumbnail = typeof v.thumbnail === "string" ? v.thumbnail : null;
    const url = typeof v.url === "string" ? v.url : null;
    if (!thumbnail && !url && (!Number.isFinite(views) || views <= 0)) continue;
    out.push({
      views: Number.isFinite(views) && views > 0 ? views : 0,
      thumbnail,
      ...(url ? { url } : {}),
    });
  }
  return out;
}

function estimateAvgViews(followers: number, avgViews?: number | null) {
  const avg = Number(avgViews);
  if (Number.isFinite(avg) && avg > 0) return avg;
  return followers > 0 ? Math.floor(followers * 0.1) : 0;
}

function readSavedCreatorOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_CREATORS_ORDER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map((u) => String(u).replace(/^@/, "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeSavedCreatorOrder(order: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SAVED_CREATORS_ORDER_KEY, JSON.stringify(order));
  } catch {
    /* storage unavailable */
  }
}

function addSavedCreatorToOrder(username: string) {
  const key = username.replace(/^@/, "").trim();
  if (!key) return;
  writeSavedCreatorOrder([key, ...readSavedCreatorOrder().filter((u) => u !== key)]);
}

function removeSavedCreatorFromOrder(username: string) {
  const key = username.replace(/^@/, "").trim();
  writeSavedCreatorOrder(readSavedCreatorOrder().filter((u) => u !== key));
}

function readSavedCreatorsFromStorage(): Creator[] {
  const snapshots = readSavedCreatorSnapshots();
  const order = readSavedCreatorOrder();
  if (order.length > 0) {
    const ordered = order
      .map((username) => snapshots[username])
      .filter((creator): creator is Creator => Boolean(creator?.username));
    if (ordered.length > 0) return ordered;
  }
  return Object.values(snapshots).filter((creator) => Boolean(creator?.username));
}

function readSavedCreatorSnapshots(): Record<string, Creator> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SAVED_CREATOR_SNAPSHOTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Creator>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSavedCreatorSnapshot(creator: Creator) {
  if (typeof window === "undefined" || !creator.username) return;
  try {
    const map = readSavedCreatorSnapshots();
    map[creator.username] = creator;
    localStorage.setItem(SAVED_CREATOR_SNAPSHOTS_KEY, JSON.stringify(map));
    addSavedCreatorToOrder(creator.username);
  } catch {
    /* storage unavailable */
  }
}

function removeSavedCreatorSnapshot(username: string) {
  if (typeof window === "undefined") return;
  try {
    const map = readSavedCreatorSnapshots();
    delete map[username.replace(/^@/, "")];
    localStorage.setItem(SAVED_CREATOR_SNAPSHOTS_KEY, JSON.stringify(map));
    removeSavedCreatorFromOrder(username);
  } catch {
    /* storage unavailable */
  }
}

function nicheFromRow(row: Record<string, unknown>, index?: CreatorsIndexRow | null) {
  const direct = String(row.niche ?? "").trim();
  if (direct) return direct;
  const niches = index?.niches;
  if (Array.isArray(niches) && niches.length > 0) {
    return niches.filter((n) => n !== "curated").join(", ") || niches[0];
  }
  return "Creator";
}

function mapSavedCreatorRow(
  row: Record<string, unknown>,
  index: CreatorsIndexRow | null | undefined,
  snapshot: Creator | null | undefined,
  fallbackLocation?: DiscoveryLocation,
  fallbackLanguage?: DiscoveryLanguage
): Creator {
  const username = String(row.handle ?? row.username ?? snapshot?.username ?? "")
    .replace(/^@/, "")
    .trim();

  const followersCount =
    Number(index?.followers ?? snapshot?.followersCount ?? row.followers ?? 0) || 0;
  const engagementRate =
    Number(index?.engagement_rate ?? snapshot?.engagementRate ?? row.engagement_rate ?? 0) || 0;
  const rowAvgViews = Number(row.avg_views);
  const avgViews = estimateAvgViews(
    followersCount,
    index?.avg_views ??
      snapshot?.avgViews ??
      (Number.isFinite(rowAvgViews) ? rowAvgViews : null)
  );

  const indexVideos = normalizeVideoThumbnails(index?.video_thumbnails);
  const snapshotVideos = normalizeVideoThumbnails(snapshot?.videoThumbnails);
  const videoThumbnails =
    indexVideos.length > 0 ? indexVideos : snapshotVideos.length > 0 ? snapshotVideos : snapshot?.videoThumbnails ?? [];

  const creator: Creator = {
    username,
    displayName: String(
      index?.display_name ??
        snapshot?.displayName ??
        row.full_name ??
        row.display_name ??
        username
    ),
    avatarUrl: String(
      index?.avatar_url ?? snapshot?.avatarUrl ?? row.avatar_url ?? ""
    ),
    followersCount,
    engagementRate,
    avgViews,
    platform: String(index?.platform ?? snapshot?.platform ?? row.platform ?? "TikTok"),
    bio: String(index?.bio ?? snapshot?.bio ?? row.bio ?? row.notes ?? ""),
    email: snapshot?.email ?? null,
    niche: nicheFromRow(row, index) || snapshot?.niche || "Creator",
    language: index?.language ?? snapshot?.language ?? null,
    location: index?.location ?? snapshot?.location ?? null,
    countryCode: snapshot?.countryCode ?? null,
    videoThumbnails,
  };

  return enrichCreatorCountry(creator, fallbackLocation, fallbackLanguage);
}

function getVideoThumbnails(creator: Creator): VideoThumbnail[] {
  const fromCreator = normalizeVideoThumbnails(creator.videoThumbnails);
  if (fromCreator.length > 0) return fromCreator;

  const avg = Number(creator.avgViews);
  if (!Number.isFinite(avg) || avg <= 0) return [];

  return [
    { views: Math.floor(avg * 0.8), thumbnail: null },
    { views: Math.floor(avg * 1.2), thumbnail: null },
    { views: Math.floor(avg * 0.9), thumbnail: null },
  ];
}

function VideoPreviews({ creator, size, lang }: { creator: Creator; size: "card" | "modal"; lang: "en" | "fr" }) {
  const videoThumbnails = getVideoThumbnails(creator);
  const isModal = size === "modal";

  return (
    <div style={{ display: "flex", gap: isModal ? 10 : 6 }}>
      {videoThumbnails.map((video, i) => {
        const Wrapper: any = video.url ? "a" : "div";
        const wrapperProps = video.url
          ? { href: video.url, target: "_blank", rel: "noopener noreferrer" }
          : {};
        return (
        <Wrapper
          key={i}
          {...wrapperProps}
          style={{
            flex: isModal ? 1 : "0 0 30%",
            aspectRatio: "9 / 16",
            maxHeight: isModal ? 220 : undefined,
            borderRadius: isModal ? 10 : 8,
            overflow: "hidden",
            position: "relative",
            display: "block",
            cursor: video.url ? "pointer" : "default",
            textDecoration: "none",
            background: video.thumbnail
              ? `url(${video.thumbnail}) center / cover no-repeat`
              : gradientForVideo(creator.username ?? "", i),
          }}
        >
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div
              style={{
                width: isModal ? 40 : 28,
                height: isModal ? 40 : 28,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width={isModal ? 16 : 12} height={isModal ? 16 : 12} viewBox="0 0 24 24" fill="none">
                <path d="M8 5v14l11-7L8 5z" fill="#FFFFFF" />
              </svg>
            </div>
          </div>
          {video.views != null && video.views > 0 && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: isModal ? "8px 8px 7px" : "6px 6px 5px",
              background: "linear-gradient(transparent, rgba(0,0,0,0.65))",
              fontSize: isModal ? 11 : 10,
              fontWeight: 600,
              color: "#FFFFFF",
              letterSpacing: "-0.01em",
            }}
          >
            {formatCount(video.views)} {lang === "fr" ? "vues" : "views"}
          </div>
          )}
        </Wrapper>
        );
      })}
    </div>
  );
}

function CreatorProfileModal({
  lang,
  creator,
  onClose,
  onGenerateOutreach,
}: {
  lang: "en" | "fr";
  creator: Creator;
  onClose: () => void;
  onGenerateOutreach: () => void;
}) {
  const totalLikes = creator.followersCount * 8;
  const nicheTags = creator.niche
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 16,
          padding: 32,
          maxWidth: 600,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          position: "relative",
          boxShadow: "0 24px 48px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "#FAFAFA",
            border: "1px solid #EFEFEF",
            borderRadius: 8,
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="#7A7A7A" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20, paddingRight: 32 }}>
          <img
            src={creator.avatarUrl}
            onError={(e) => { const img = e.currentTarget; if (!img.dataset.fb) { img.dataset.fb = "1"; img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(creator.displayName || creator.username || "?")}&background=e5e5e5&color=9a9a9a&size=200&bold=true&rounded=true`; } }}
            alt={creator.displayName}
            width={80}
            height={80}
            style={{ borderRadius: "50%", background: "#F0F0F0", flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: "0 0 4px 0" }}>
              {creator.displayName}
            </h2>
            <div style={{ fontSize: 15, color: "#0047FF", letterSpacing: "-0.02em", marginBottom: 8 }}>@{creator.username ?? ""}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <PlatformBadge platform={creator.platform} />
              <CountryBadge creator={creator} lang={lang} />
            </div>
          </div>
        </div>

        <p style={{ fontSize: 14, color: "#5A5A5A", lineHeight: 1.55, margin: "0 0 20px 0" }}>{creator.bio}</p>

        {creator.email && (
          <div style={{ marginBottom: 20 }}>
            <a
              href={`mailto:${creator.email}`}
              style={{
                fontSize: 13,
                color: "#0047FF",
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textDecoration: "none",
              }}
            >
              {creator.email}
            </a>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
          {[
            { label: lang === "fr" ? "Abonnés" : "Followers", value: formatCount(creator.followersCount) },
            { label: lang === "fr" ? "Taux d'engagement" : "Engagement Rate", value: `${creator.engagementRate}%` },
            { label: lang === "fr" ? "Vues moyennes" : "Avg Views", value: formatCount(creator.avgViews) },
            { label: lang === "fr" ? "Likes totaux" : "Total Likes", value: formatCount(totalLikes) },
          ].map((stat) => (
            <div key={stat.label} style={{ background: "#FAFAFA", borderRadius: 10, padding: "12px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A" }}>{stat.value}</div>
              <div style={{ fontSize: 10, color: "#9A9A9A", marginTop: 4 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
          {(nicheTags.length > 0 ? nicheTags : [creator.niche]).map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 11,
                color: "#5A5A5A",
                background: "#F0F0F0",
                padding: "5px 10px",
                borderRadius: 999,
                letterSpacing: "-0.01em",
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#9A9A9A", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            {lang === "fr" ? "APERÇUS VIDÉO" : "VIDEO PREVIEWS"}
          </div>
          <VideoPreviews creator={creator} size="modal" lang={lang} />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            style={{ ...btnSecondary, flex: 1 }}
            onClick={() => window.open(`https://tiktok.com/@${creator.username ?? ""}`, "_blank", "noopener,noreferrer")}
          >
            {creator.platform.toLowerCase() === "instagram"
              ? lang === "fr"
                ? "Voir sur Instagram →"
                : "View on Instagram →"
              : creator.platform.toLowerCase() === "youtube"
                ? lang === "fr"
                  ? "Voir sur YouTube →"
                  : "View on YouTube →"
                : lang === "fr"
                  ? "Voir sur TikTok →"
                  : "View on TikTok →"}
          </button>
          <button type="button" style={{ ...btnBlack, flex: 1 }} onClick={onGenerateOutreach}>
            {lang === "fr" ? "Générer un message →" : "Generate outreach →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreatorMiniCard({ creator }: { creator: Creator }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        background: "#FAFAFA",
        border: "1px solid #EFEFEF",
        borderRadius: 12,
        marginBottom: 20,
      }}
    >
      <img src={creator.avatarUrl} alt={creator.displayName} width={40} height={40} style={{ borderRadius: "50%", background: "#F0F0F0", flexShrink: 0 }} onError={(e) => { const img = e.currentTarget; if (!img.dataset.fb) { img.dataset.fb = "1"; img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(creator.displayName || creator.username || "?")}&background=e5e5e5&color=9a9a9a&size=200&bold=true&rounded=true`; } }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{creator.displayName}</div>
        <div style={{ fontSize: 12, color: "#0047FF" }}>@{creator.username ?? ""}</div>
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: "#1A1A1A",
          background: "#F0F0F0",
          padding: "4px 10px",
          borderRadius: 999,
          textTransform: "capitalize",
          flexShrink: 0,
        }}
      >
        {creator.platform}
      </span>
    </div>
  );
}

function OutreachModal({
  creator,
  onClose,
  templates,
  onSaveTemplate,
  onDeleteTemplate,
  onMarkSent,
  userName,
}: {
  creator: Creator;
  onClose: () => void;
  templates: OutreachTemplate[];
  onSaveTemplate: (t: OutreachTemplate) => void;
  onDeleteTemplate: (id: string) => void;
  onMarkSent: () => void;
  userName: string;
}) {
  const lang = useLang();
  const [tab, setTab] = useState<OutreachModalTab>("generate");
  const [product, setProduct] = useState("");
  const [tone, setTone] = useState<OutreachTone>("Casual");
  const [platform, setPlatform] = useState<OutreachPlatform>("TikTok DM");
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [creatorEmail, setCreatorEmail] = useState("");

  const handleGenerate = async () => {
    setGenerating(true);
    setMessage("");
    setGenerateError(null);
    try {
      const res = await fetch("/api/generate-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator,
          brand: product,
          tone: tone.toLowerCase(),
          platform,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error("Generation failed");
      setMessage(data.message);
    } catch {
      setGenerateError("Generation failed. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      /* ignore */
    }
  };

  const handleSaveAsTemplate = () => {
    if (!message.trim()) return;
    onSaveTemplate({
      id: newTemplateId(),
      name: `Outreach — ${creator.displayName}`,
      body: message,
      platform,
    });
    setTab("templates");
  };

  const tones: OutreachTone[] = ["Casual", "Professional", "Friendly", "Direct"];
  const platforms: OutreachPlatform[] = ["TikTok DM", "Instagram DM", "Email"];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1001,
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 16,
          padding: 32,
          maxWidth: 640,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          position: "relative",
          boxShadow: "0 24px 48px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "#FAFAFA",
            border: "1px solid #EFEFEF",
            borderRadius: 8,
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="#7A7A7A" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #EFEFEF", marginBottom: 24, paddingRight: 40 }}>
          {(
            [
              { id: "generate" as const, label: "Generate" },
              { id: "templates" as const, label: "Templates" },
              { id: "send" as const, label: "Send" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: tab === t.id ? "2px solid #0047FF" : "2px solid transparent",
                padding: "8px 12px 12px",
                fontSize: 14,
                fontWeight: tab === t.id ? 600 : 400,
                color: tab === t.id ? "#1A1A1A" : "#7A7A7A",
                fontFamily: "inherit",
                cursor: "pointer",
                letterSpacing: "-0.02em",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "generate" && (
          <>
            <CreatorMiniCard creator={creator} />
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", marginBottom: 16, letterSpacing: "-0.02em" }}>
              Generate with Trackit AI
            </div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 6 }}>What are you selling?</label>
            <input
              type="text"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="Your product or brand"
              style={{ ...inputStyle, marginBottom: 16 }}
            />
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 8 }}>Tone</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {tones.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTone(t)}
                  style={{
                    ...btnSecondary,
                    padding: "8px 14px",
                    fontSize: 12,
                    background: tone === t ? "#1A1A1A" : "#FFFFFF",
                    color: tone === t ? "#FFFFFF" : "#1A1A1A",
                    borderColor: tone === t ? "#1A1A1A" : "#E5E5E5",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#9A9A9A", marginBottom: 8 }}>Platform</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {platforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  style={{
                    ...btnSecondary,
                    padding: "8px 14px",
                    fontSize: 12,
                    background: platform === p ? "rgba(0,71,255,0.08)" : "#FFFFFF",
                    color: platform === p ? "#0047FF" : "#1A1A1A",
                    borderColor: platform === p ? "#0047FF" : "#E5E5E5",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
            <button type="button" onClick={handleGenerate} disabled={generating} style={{ ...btnBlack, width: "100%", marginBottom: 20, opacity: generating ? 0.7 : 1 }}>
              Generate outreach →
            </button>
            {generating && (
              <p style={{ fontSize: 14, color: "#7A7A7A", textAlign: "center", margin: "0 0 16px" }}>Generating personalized message...</p>
            )}
            {generateError && !generating && (
              <p style={{ fontSize: 14, color: "#DC2626", textAlign: "center", margin: "0 0 16px" }}>{generateError}</p>
            )}
            {message && !generating && (
              <>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={12}
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55, marginBottom: 8 }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#9A9A9A" }}>{message.length} characters</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => void handleCopy()} style={{ ...btnSecondary, fontSize: 12, padding: "8px 14px" }}>
                      Copy message
                    </button>
                    <button type="button" onClick={handleSaveAsTemplate} style={{ ...btnSecondary, fontSize: 12, padding: "8px 14px" }}>
                      Save as template
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {tab === "templates" && (
          <>
            {templates.length === 0 ? (
              <p style={{ fontSize: 14, color: "#7A7A7A", margin: 0 }}>
                {lang === "fr"
                  ? "Aucun modèle pour le moment. Générez un message et enregistrez-le comme modèle."
                  : "No templates yet. Generate a message and save it as a template."}
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {templates.map((tpl) => (
                  <div key={tpl.id} style={{ border: "1px solid #EFEFEF", borderRadius: 12, padding: 16, background: "#FAFAFA" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", marginBottom: 4 }}>{tpl.name}</div>
                        <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0, lineHeight: 1.45 }}>
                          {tpl.body.slice(0, 80)}
                          {tpl.body.length > 80 ? "…" : ""}
                        </p>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 500, background: "#F0F0F0", padding: "4px 8px", borderRadius: 999, flexShrink: 0 }}>
                        {tpl.platform}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <button
                        type="button"
                        style={{ ...btnPrimary, fontSize: 12, padding: "8px 14px" }}
                        onClick={() => {
                          setMessage(tpl.body);
                          setPlatform(tpl.platform);
                          setTab("generate");
                        }}
                      >
                        Use this template
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTemplate(tpl.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#DC2626",
                          fontSize: 12,
                          fontWeight: 500,
                          fontFamily: "inherit",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "send" && (
          <>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", margin: "0 0 6px", letterSpacing: "-0.03em" }}>How to send your message</h3>
            <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 20px", lineHeight: 1.5 }}>
              Direct sending requires creator login. For now copy your message and send manually.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              <div style={{ border: "1px solid #EFEFEF", borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>🎵</span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>Send on TikTok</div>
                </div>
                <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 12px" }}>Open TikTok DMs → copy your message and paste it</p>
                <button
                  type="button"
                  style={{ ...btnSecondary, fontSize: 12 }}
                  onClick={() => window.open("https://tiktok.com/messages", "_blank", "noopener,noreferrer")}
                >
                  Open TikTok →
                </button>
              </div>
              <div style={{ border: "1px solid #EFEFEF", borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>📷</span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>Send on Instagram</div>
                </div>
                <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 12px" }}>Open Instagram DMs → copy your message and paste it</p>
                <button
                  type="button"
                  style={{ ...btnSecondary, fontSize: 12 }}
                  onClick={() => window.open("https://instagram.com/direct/inbox", "_blank", "noopener,noreferrer")}
                >
                  Open Instagram →
                </button>
              </div>
              <div style={{ border: "1px solid #EFEFEF", borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>✉️</span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>Send via Email</div>
                </div>
                <label style={{ display: "block", fontSize: 12, color: "#9A9A9A", marginBottom: 6 }}>Creator email address</label>
                <input
                  type="email"
                  value={creatorEmail}
                  onChange={(e) => setCreatorEmail(e.target.value)}
                  placeholder="creator@email.com"
                  style={{ ...inputStyle, marginBottom: 12 }}
                />
                <button
                  type="button"
                  disabled
                  title="Coming soon"
                  style={{ ...btnSecondary, fontSize: 12, opacity: 0.45, cursor: "not-allowed" }}
                >
                  Send email →
                </button>
              </div>
            </div>
            <button type="button" onClick={onMarkSent} style={{ ...btnPrimary, width: "100%" }}>
              Mark as sent
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#9A9A9A", marginBottom: 4, letterSpacing: "-0.01em" }}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={filterSelectStyle}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function getCreatorProfileUrl(creator: Creator): string {
  const username = creator.username ?? "";
  const platform = creator.platform.toLowerCase();
  if (platform === "instagram") return `https://instagram.com/${username}`;
  if (platform === "youtube") return `https://youtube.com/@${username}`;
  return `https://tiktok.com/@${username}`;
}

function getNicheTags(creator: Creator): string[] {
  const tags = creator.niche
    .split(/[,;+/|&]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  return (tags.length > 0 ? tags : [creator.niche]).filter(Boolean).slice(0, 3);
}

function estimateReachPerPost(creator: Creator) {
  if (creator.avgViews > 0) return creator.avgViews;
  return Math.max(Math.round((creator.followersCount * creator.engagementRate) / 100), 0);
}

function PlatformBadge({ platform }: { platform: string }) {
  const normalized = platform.toLowerCase();
  const label = normalized === "instagram" ? "Instagram" : normalized === "youtube" ? "YouTube" : "TikTok";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 11,
        fontWeight: 600,
        color: "#1A1A1A",
        background: "#F5F5F5",
        border: "1px solid #EFEFEF",
        padding: "4px 9px",
        borderRadius: 999,
        letterSpacing: "-0.01em",
        textTransform: "capitalize",
      }}
    >
      {label}
    </span>
  );
}

function CountryBadge({ creator, lang }: { creator: Creator; lang: "en" | "fr" }) {
  const countryCode =
    creator.countryCode || resolveCreatorCountryCode(creator.location, creator.language);
  const flag = getCreatorCountryFlag(creator.location, creator.language, countryCode);
  if (!flag || !countryCode) return null;

  return (
    <span
      title={getCreatorCountryLabel(countryCode, lang)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        color: "#1A1A1A",
        background: "#F5F5F5",
        border: "1px solid #EFEFEF",
        padding: "4px 9px",
        borderRadius: 999,
        letterSpacing: "-0.01em",
      }}
    >
      <span style={{ fontSize: 13, lineHeight: 1 }} aria-hidden>
        {flag}
      </span>
      {getCreatorCountryLabel(countryCode, lang)}
    </span>
  );
}

function engagementTrendDelta(rate: number) {
  return Math.max(0.8, Number((rate * 0.32 + 1.1).toFixed(1)));
}

function reachTrendDelta(reach: number, followers: number) {
  const ratio = reach / Math.max(followers, 1);
  return Math.max(1.2, Number((ratio * 100 + 2.4).toFixed(1)));
}

function GrowthTrendBadge({
  trend,
  color,
  background,
  title,
  rows,
}: {
  trend: number;
  color: string;
  background: string;
  title: string;
  rows: { label: string; value: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((value) => !value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-expanded={open}
        aria-label={title}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 2,
          fontSize: 9,
          fontWeight: 600,
          color,
          background,
          padding: "2px 6px",
          borderRadius: 999,
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 15l6-8 6 8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        +{trend}%
      </button>

      {open && (
        <div
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            right: 0,
            bottom: "calc(100% + 8px)",
            zIndex: 40,
            background: "#FFFFFF",
            border: "1px solid #EFEFEF",
            borderRadius: 14,
            padding: "14px 16px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
            minWidth: 220,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", marginBottom: 12, letterSpacing: "-0.02em" }}>
            {title}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((row) => (
              <div key={row.label}>
                <div style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
                  {row.value}
                </div>
                <div style={{ fontSize: 11, color: "#9A9A9A", marginTop: 3, letterSpacing: "-0.01em" }}>{row.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

function ReachStatPanel({
  reach,
  followers,
  avgViews,
  lang,
}: {
  reach: number;
  followers: number;
  avgViews?: number;
  lang: "en" | "fr";
}) {
  const trend = reachTrendDelta(reach, followers);
  const reachRatio = ((reach / Math.max(followers, 1)) * 100).toFixed(1);

  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: 10,
        padding: "10px 12px",
        border: "1px solid #EFEFEF",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>
          {formatCount(reach)}
        </span>
        <GrowthTrendBadge
          trend={trend}
          color="#0047FF"
          background="#EEF4FF"
          title={lang === "fr" ? "Détails portée" : "Reach details"}
          rows={[
            { label: lang === "fr" ? "Portée estimée" : "Estimated reach", value: formatCount(reach) },
            { label: lang === "fr" ? "Abonnés" : "Followers", value: formatCount(followers) },
            {
              label: lang === "fr" ? "Ratio portée / abonnés" : "Reach / followers ratio",
              value: `${reachRatio}%`,
            },
            { label: lang === "fr" ? "Croissance 30 j" : "30d growth", value: `+${trend}%` },
            ...(avgViews && avgViews > 0
              ? [{ label: lang === "fr" ? "Vues moyennes" : "Average views", value: formatCount(avgViews) }]
              : []),
          ]}
        />
      </div>

      <div style={{ fontSize: 10, color: "#9A9A9A", letterSpacing: "-0.01em" }}>
        {lang === "fr" ? "Portée est." : "Est. reach"}
      </div>
    </div>
  );
}

function EngagementStatPanel({
  rate,
  followers,
  lang,
}: {
  rate: number;
  followers: number;
  lang: "en" | "fr";
}) {
  const trend = engagementTrendDelta(rate);
  const estInteractions = Math.max(Math.round((followers * rate) / 100), 0);
  const estPerPost = Math.max(Math.round(estInteractions / 3), 0);

  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: 10,
        padding: "10px 12px",
        border: "1px solid #EFEFEF",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>
          {rate}%
        </span>
        <GrowthTrendBadge
          trend={trend}
          color="#059669"
          background="#ECFDF5"
          title={lang === "fr" ? "Détails engagement" : "Engagement details"}
          rows={[
            { label: lang === "fr" ? "Taux d'engagement" : "Engagement rate", value: `${rate}%` },
            {
              label: lang === "fr" ? "Interactions estimées" : "Estimated interactions",
              value: formatCount(estInteractions),
            },
            {
              label: lang === "fr" ? "Par publication (est.)" : "Per post (est.)",
              value: formatCount(estPerPost),
            },
            { label: lang === "fr" ? "Croissance 30 j" : "30d growth", value: `+${trend}%` },
          ]}
        />
      </div>

      <div style={{ fontSize: 10, color: "#9A9A9A", letterSpacing: "-0.01em" }}>
        {lang === "fr" ? "Engagement" : "Engagement"}
      </div>
    </div>
  );
}

function CreatorCardBody({ creator, lang }: { creator: Creator; lang: "en" | "fr" }) {
  const nicheTagList = getNicheTags(creator);
  const reachEstimate = estimateReachPerPost(creator);
  const profileUrl = getCreatorProfileUrl(creator);

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <img
            src={creator.avatarUrl}
            onError={(e) => {
              const img = e.currentTarget;
              if (!img.dataset.fb) {
                img.dataset.fb = "1";
                img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(creator.displayName || creator.username || "?")}&background=eef4ff&color=0047ff&size=200&bold=true&rounded=true`;
              }
            }}
            alt={creator.displayName}
            width={56}
            height={56}
            style={{ borderRadius: "50%", background: "#EEF4FF", border: "2px solid #FFFFFF", boxShadow: "0 0 0 1px #D4E2FF" }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", lineHeight: 1.2 }}>
              {creator.displayName}
            </div>
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "inline-block",
                fontSize: 13,
                color: "#0047FF",
                letterSpacing: "-0.01em",
                marginTop: 3,
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              @{creator.username ?? ""}
            </a>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            <PlatformBadge platform={creator.platform} />
            <CountryBadge creator={creator} lang={lang} />
            {nicheTagList.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "#0047FF",
                  background: "#EEF4FF",
                  border: "1px solid #D4E2FF",
                  padding: "4px 9px",
                  borderRadius: 999,
                  letterSpacing: "-0.01em",
                  textTransform: "capitalize",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {creator.bio && (
        <p
          style={{
            fontSize: 13,
            color: "#5A5A5A",
            lineHeight: 1.55,
            margin: 0,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {creator.bio}
        </p>
      )}

      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "#9A9A9A",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 8,
          }}
        >
          {lang === "fr" ? "Contenu récent" : "Recent content"}
        </div>
        <VideoPreviews creator={creator} size="card" lang={lang} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 8,
          background: "#FAFAFA",
          border: "1px solid #EFEFEF",
          borderRadius: 12,
          padding: 10,
        }}
      >
        {[
          { label: lang === "fr" ? "Abonnés" : "Followers", value: formatCount(creator.followersCount) },
          { label: lang === "fr" ? "Vues moy." : "Avg views", value: formatCount(creator.avgViews) },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: "#FFFFFF",
              borderRadius: 10,
              padding: "10px 12px",
              border: "1px solid #EFEFEF",
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "#1A1A1A",
                letterSpacing: "-0.02em",
              }}
            >
              {stat.value}
            </div>
            <div style={{ fontSize: 10, color: "#9A9A9A", marginTop: 3, letterSpacing: "-0.01em" }}>{stat.label}</div>
          </div>
        ))}
        <ReachStatPanel reach={reachEstimate} followers={creator.followersCount} avgViews={creator.avgViews} lang={lang} />
        <EngagementStatPanel rate={creator.engagementRate} followers={creator.followersCount} lang={lang} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {creator.email ? (
          <a
            href={`mailto:${creator.email}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 500,
              color: "#0047FF",
              background: "#EEF4FF",
              border: "1px solid #D4E2FF",
              borderRadius: 999,
              padding: "6px 10px",
              textDecoration: "none",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="1.6" />
              <path d="M4 8l8 5 8-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            {creator.email}
          </a>
        ) : (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "#9A9A9A",
              background: "#FAFAFA",
              border: "1px solid #EFEFEF",
              borderRadius: 999,
              padding: "6px 10px",
            }}
          >
            {lang === "fr" ? "Contact via DM" : "Contact via DM"}
          </span>
        )}
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            fontWeight: 500,
            color: "#1A1A1A",
            background: "#FFFFFF",
            border: "1px solid #E5E5E5",
            borderRadius: 999,
            padding: "6px 10px",
            textDecoration: "none",
          }}
        >
          {lang === "fr" ? "Voir le profil" : "Open profile"}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M7 17L17 7M17 7H9M17 7v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </a>
      </div>
    </>
  );
}

function CreatorCard({
  lang,
  creator,
  variant,
  isSaved,
  onToggleSave,
  onViewProfile,
  onGenerateOutreach,
  onRemove,
}: {
  lang: "en" | "fr";
  creator: Creator;
  variant: "discover" | "saved";
  isSaved?: boolean;
  onToggleSave?: () => void;
  onViewProfile: () => void;
  onGenerateOutreach?: () => void;
  onRemove?: () => void;
}) {
  const cardStyle: React.CSSProperties = {
    background: "#FFFFFF",
    border: "1px solid #EFEFEF",
    borderRadius: 16,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    transition: "box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease",
  };

  if (variant === "saved") {
    return (
      <div
        style={cardStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,71,255,0.08)";
          e.currentTarget.style.borderColor = "#D4E2FF";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)";
          e.currentTarget.style.borderColor = "#EFEFEF";
        }}
      >
        <CreatorCardBody creator={creator} lang={lang} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onViewProfile} className="hero-cta-shopify-light hero-cta-compact-sm" style={{ flex: 1 }}>
              {lang === "fr" ? "Voir le profil" : "View profile"}
            </button>
            <button type="button" onClick={onGenerateOutreach} className="hero-cta-shopify hero-cta-compact-sm" style={{ flex: 1 }}>
              {lang === "fr" ? "Générer un message →" : "Generate outreach →"}
            </button>
          </div>
          <button
            type="button"
            onClick={onRemove}
            style={{
              background: "none",
              border: "none",
              color: "#DC2626",
              fontSize: 12,
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
              padding: "4px 0",
              letterSpacing: "-0.01em",
            }}
          >
            {lang === "fr" ? "Supprimer" : "Remove"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={cardStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,71,255,0.08)";
        e.currentTarget.style.borderColor = "#D4E2FF";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)";
        e.currentTarget.style.borderColor = "#EFEFEF";
      }}
    >
      <CreatorCardBody creator={creator} lang={lang} />
      <div style={{ display: "flex", gap: 8, paddingTop: 4, borderTop: "1px solid #F5F5F5" }}>
        <button type="button" onClick={onViewProfile} className="hero-cta-shopify-light hero-cta-compact-sm" style={{ flex: 1 }}>
          {lang === "fr" ? "Détails" : "Details"}
        </button>
        <button
          type="button"
          onClick={onToggleSave}
          style={{
            flex: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            fontSize: 12,
            padding: "8px 12px",
            border: "none",
            borderRadius: 10,
            fontWeight: 500,
            fontFamily: "inherit",
            cursor: "pointer",
            letterSpacing: "-0.02em",
            background: isSaved ? "#F5F5F5" : "#0047FF",
            color: isSaved ? "#5A5A5A" : "#FFFFFF",
          }}
        >
          {isSaved ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M6 4h12v16l-6-4-6 4V4z" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 4h12v16l-6-4-6 4V4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          )}
          {isSaved ? (lang === "fr" ? "Sauvegardé" : "Saved") : lang === "fr" ? "Sauvegarder" : "Save creator"}
        </button>
      </div>
    </div>
  );
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function getDiscoverySearchCountToday(): number {
  const storedDate = localStorage.getItem("trackit_searches_date");
  if (storedDate !== todayDateKey()) return 0;
  return parseInt(localStorage.getItem("trackit_searches_today") || "0", 10);
}

function incrementDiscoverySearchCount() {
  const today = todayDateKey();
  const storedDate = localStorage.getItem("trackit_searches_date");
  if (storedDate !== today) {
    localStorage.setItem("trackit_searches_date", today);
    localStorage.setItem("trackit_searches_today", "1");
    return;
  }
  const count = getDiscoverySearchCountToday() + 1;
  localStorage.setItem("trackit_searches_today", String(count));
}

function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function DiscoveryView({
  plan,
  onUpgrade,
  onUpgradePro,
  onUpgradeScale,
  isMobile,
  onNavigateToOutreachSend,
}: {
  plan: PlanTier;
  onUpgrade: () => void;
  onUpgradePro?: () => void;
  onUpgradeScale?: () => void;
  isMobile?: boolean;
  onNavigateToOutreachSend?: (creator: Creator) => void;
}) {
  const lang = useLang();
  const [activeTab, setActiveTab] = useState<DiscoveryTab>("discover");
  const [productName, setProductName] = useState("");
  const [niche, setNiche] = useState("fitness");
  const [platform, setPlatform] = useState("tiktok");
  const [followers, setFollowers] = useState("");
  const [engagement, setEngagement] = useState("");
  const [location, setLocation] = useState<DiscoveryLocation>("FR");
  const [language, setLanguage] = useState<DiscoveryLanguage>("french");

  useEffect(() => {
    setFollowers("");
    setEngagement("");
  }, [lang]);

  useEffect(() => {
    if (location !== "FR" || language !== "french") {
      setLocation("FR");
      setLanguage("french");
      setDiscoveryPrefs("FR", "french");
    }
  }, [location, language]);

  const handleLocationChange = (_next: string) => {
    setLocation("FR");
    setLanguage("french");
    setDiscoveryPrefs("FR", "french");
  };

  const handleLanguageChange = (_next: string) => {
    setLocation("FR");
    setLanguage("french");
    setDiscoveryPrefs("FR", "french");
  };

  const [creators, setCreators] = useState<Creator[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followerFilterHint, setFollowerFilterHint] = useState<{
    filteredOut: number;
    followerRange: [number, number];
  } | null>(null);
  const [savedCreators, setSavedCreators] = useState<Creator[]>(() => readSavedCreatorsFromStorage());
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);
  const [outreachCreator, setOutreachCreator] = useState<Creator | null>(null);
  const [outreachTemplates, setOutreachTemplates] = useState<OutreachTemplate[]>(INITIAL_OUTREACH_TEMPLATES);
  const [outreachContacted, setOutreachContacted] = useState<OutreachContact[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [searchCount, setSearchCount] = useState(0);
  const [discoveriesUsed, setDiscoveriesUsed] = useState(0);
  const [discoveriesResetAt, setDiscoveriesResetAt] = useState<Date | null>(null);
  const [showBlur, setShowBlur] = useState(false);
  const [resetCountdown, setResetCountdown] = useState<string>("");

  const dailyDiscoveryLimit = getDailyDiscoveryLimit(plan);
  const handleDiscoveryUpgrade = () => {
    if (plan === "basic" && onUpgradePro) onUpgradePro();
    else onUpgrade();
  };

  const handleCreatorLimitUpgrade = () => {
    if (plan === "pro" && onUpgradeScale) onUpgradeScale();
    else if (plan === "basic" && onUpgradePro) onUpgradePro();
    else onUpgrade();
  };

  const creatorLimitTitle =
    plan === "pro"
      ? lang === "fr"
        ? `Limite de ${PRO_MAX_MANAGED_CREATORS} créateurs atteinte`
        : `${PRO_MAX_MANAGED_CREATORS} creator limit reached`
      : plan === "basic"
        ? lang === "fr"
          ? `Limite de ${BASIC_MAX_MANAGED_CREATORS} créateurs atteinte`
          : `${BASIC_MAX_MANAGED_CREATORS} creator limit reached`
        : lang === "fr"
          ? "Limite de créateurs atteinte"
          : "Creator limit reached";

  const creatorLimitDescription =
    plan === "pro"
      ? lang === "fr"
        ? "Passez à Scale pour gérer un nombre illimité de créateurs."
        : "Upgrade to Scale to manage unlimited creators."
      : plan === "basic"
        ? lang === "fr"
          ? "Passez à Pro pour gérer jusqu'à 50 créateurs."
          : "Upgrade to Pro to manage up to 50 creators."
        : lang === "fr"
          ? "Passez à Growth pour gérer jusqu'à 25 créateurs."
          : "Upgrade to Growth to manage up to 25 creators.";

  const creatorLimitPlanBadge = plan === "pro" ? "Scale" : plan === "basic" ? "Pro" : "Growth";

  const creatorLimitPrimaryLabel =
    plan === "pro"
      ? lang === "fr"
        ? `Passer à Scale ${formatCurrency(99, lang)}/mois`
        : `Upgrade to Scale ${formatCurrency(99, lang)}/mo`
      : plan === "basic"
        ? lang === "fr"
          ? `Passer à Pro ${formatCurrency(39, lang)}/mois`
          : `Upgrade to Pro ${formatCurrency(39, lang)}/mo`
        : lang === "fr"
          ? `Passer à Growth ${formatCurrency(19, lang)}/mois`
          : `Upgrade to Growth ${formatCurrency(19, lang)}/mo`;

  const discoveryLimitTitle =
    dailyDiscoveryLimit != null
      ? lang === "fr"
        ? `Vous avez utilisé vos ${dailyDiscoveryLimit} découvertes gratuites`
        : `You've used your ${dailyDiscoveryLimit} free discoveries`
      : "";

  const discoveryLimitSubtitle =
    plan === "basic"
      ? lang === "fr"
        ? "Passez à Pro pour 50 découvertes/mois et 25 résultats par recherche."
        : "Upgrade to Pro for 50 discoveries/month and 25 results per search."
      : lang === "fr"
        ? "Les marques qui passent à Growth trouvent 3x plus de créateurs rentables. 20 découvertes par mois, 10 résultats par recherche."
        : "Brands on Growth find 3x more profitable creators. 20 monthly discoveries, 10 results per search.";

  const discoveryLimitCta =
    plan === "basic"
      ? lang === "fr"
        ? "Passer à Pro →"
        : "Upgrade to Pro →"
      : lang === "fr"
        ? "Passer à Growth →"
        : "Upgrade to Growth →";

  const syncDiscoveryGateState = async (): Promise<number | null> => {
    if (!hasDiscoveryDailyCap(plan) || dailyDiscoveryLimit == null) return null;
    const { supabase } = await import("@/lib/supabase");
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("profiles")
      .select("discoveries_used, discoveries_reset_at")
      .eq("id", user.id)
      .maybeSingle();
    if (!data) return null;

    // free = lifetime pool (never refills). basic = monthly pool (resets 30 days
    // after discoveries_reset_at). Pro/Scale never reach this code (no cap).
    let used = data.discoveries_used || 0;
    if (plan === "basic") {
      const resetAt = data.discoveries_reset_at ? new Date(data.discoveries_reset_at).getTime() : 0;
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
      if (!resetAt || Date.now() - resetAt >= THIRTY_DAYS) {
        used = 0;
        await supabase.from("profiles").update({
          discoveries_used: 0,
          discoveries_reset_at: new Date().toISOString(),
        }).eq("id", user.id);
      }
    }
    setDiscoveriesUsed(used);
    setShowBlur(used >= dailyDiscoveryLimit);
    return used;
  };

  const persistProductName = async () => {
    const trimmed = productName.trim();
    const { supabase } = await import("@/lib/supabase");
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").update({ business_name: trimmed || null }).eq("id", user.id);
  };

  useEffect(() => {
    const loadProductName = async () => {
      const { supabase } = await import("@/lib/supabase");
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("business_name")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.business_name) setProductName(data.business_name);
    };
    void loadProductName();
  }, []);

  // Load discoveries from Supabase on mount
  useEffect(() => {
    if (!hasDiscoveryDailyCap(plan)) return;
    const loadDiscoveries = async () => {
      await syncDiscoveryGateState();
    };
    void loadDiscoveries();
  }, [plan, dailyDiscoveryLimit]);

  const incrementDiscoveries = async () => {
    if (!hasDiscoveryDailyCap(plan) || dailyDiscoveryLimit == null) return;
    const newCount = discoveriesUsed + 1;
    setDiscoveriesUsed(newCount);
    setShowBlur(newCount >= dailyDiscoveryLimit);
    const { supabase } = await import("@/lib/supabase");
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").update({
      discoveries_used: newCount,
    }).eq("id", user.id);
  };

  const openOutreach = (creator: Creator) => {
    if (onNavigateToOutreachSend) {
      setSelectedCreator(null);
      onNavigateToOutreachSend(creator);
      return;
    }
    setSelectedCreator(null);
    setOutreachCreator(creator);
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const saved = localStorage.getItem("trackit_search_" + new Date().toDateString());
    if (saved) setSearchCount(parseInt(saved));
  }, []);

  useEffect(() => {
    const cached = localStorage.getItem(DISCOVERY_RESULTS_CACHE_KEY);
    if (!cached) return;
    try {
      const parsed = JSON.parse(cached) as Creator[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setCreators(parsed.map((c) => enrichCreatorCountry(c, location, language)));
        setHasSearched(true);
      }
    } catch {
      /* ignore malformed cache */
    }
  }, [location, language]);

  useEffect(() => {
    const hydrateSavedCreators = async (userId: string) => {
      const rows = await getSavedCreators(userId);

      if (rows.length === 0) {
        const fromStorage = readSavedCreatorsFromStorage();
        if (fromStorage.length > 0) setSavedCreators(fromStorage);
        return;
      }

      const usernames = rows
        .map((row) => String(row.handle ?? row.username ?? "").replace(/^@/, "").trim())
        .filter(Boolean);

      writeSavedCreatorOrder(usernames);

      const snapshots = readSavedCreatorSnapshots();
      let discoveryCacheByUsername: Record<string, Creator> = {};
      try {
        const cached = localStorage.getItem(DISCOVERY_RESULTS_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as Creator[];
          if (Array.isArray(parsed)) {
            discoveryCacheByUsername = Object.fromEntries(
              parsed
                .filter((c) => c.username)
                .map((c) => [String(c.username).replace(/^@/, ""), c])
            );
          }
        }
      } catch {
        /* ignore malformed cache */
      }

      let indexMap: Record<string, CreatorsIndexRow> = {};
      try {
        const res = await fetch("/api/creators-index", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usernames }),
        });
        if (res.ok) {
          const payload = (await res.json()) as { creators?: Record<string, CreatorsIndexRow> };
          indexMap = payload.creators ?? {};
        }
      } catch {
        /* fallback to snapshots / discovery cache */
      }

      setSavedCreators(
        rows.map((row) => {
          const username = String(row.handle ?? row.username ?? "").replace(/^@/, "").trim();
          const index = indexMap[username] ?? null;
          const snapshot = snapshots[username] ?? discoveryCacheByUsername[username] ?? null;
          const mapped = mapSavedCreatorRow(
            row as Record<string, unknown>,
            index,
            snapshot,
            location,
            language
          );
          writeSavedCreatorSnapshot(mapped);
          return mapped;
        })
      );
    };

    if (!supabase) return;
    const client = supabase;

    const fromStorage = readSavedCreatorsFromStorage();
    if (fromStorage.length > 0) setSavedCreators(fromStorage);

    const loadSaved = async () => {
      const { data: { user } } = await client.auth.getUser();
      if (!user) return;
      await hydrateSavedCreators(user.id);
    };

    void loadSaved();

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void hydrateSavedCreators(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [location, language]);

  const isCreatorSaved = (username: string) => savedCreators.some((c) => (c.username  ?? "") === username);

  const handleSaveCreator = async (creator: Creator) => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (hasReachedManagedCreatorLimit(plan, savedCreators.length)) {
      setUpgradeModalOpen(true);
      return;
    }
    await saveCreator(user.id, {
      username: creator.username ?? "",
      display_name: creator.displayName,
      avatar_url: creator.avatarUrl,
      platform: creator.platform,
      followers_count: creator.followersCount,
      engagement_rate: creator.engagementRate,
      avg_views: creator.avgViews,
      bio: creator.bio,
      niche: creator.niche || ""
    });
    writeSavedCreatorSnapshot(creator);
    setSavedCreators(prev => [...prev.filter(c => (c.username  ?? "") !== (creator.username ?? "")), creator]);
    setToast("Creator saved ✓");
    notifyCreatorSaved(lang, creator.displayName || `@${creator.username ?? "creator"}`);
  };

  const handleRemoveCreator = async (username: string) => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await removeCreator(user.id, username);
    removeSavedCreatorSnapshot(username);
    setSavedCreators(prev => prev.filter(c => (c.username  ?? "") !== username));
  };

  const toggleSaveCreator = (creator: Creator) => {
    if (isCreatorSaved(creator.username ?? "")) {
      void handleRemoveCreator(creator.username ?? "");
    } else {
      void handleSaveCreator(creator);
    }
  };

  const resultsLimit = getResultsPerSearchLimit(plan);
  const visibleCreators = getVisibleDiscoveryResults(plan, creators);
  const resultsCountLabel =
    resultsLimit != null
      ? `${Math.min(creators.length, resultsLimit)}`
      : `${creators.length}`;
  const resultsCappedNote =
    resultsLimit != null && creators.length > resultsLimit
      ? lang === "fr"
        ? ` (limité à ${resultsLimit})`
        : ` (capped at ${resultsLimit})`
      : "";

  const search = async (followersOverride?: string) => {
    if (hasDiscoveryDailyCap(plan) && dailyDiscoveryLimit != null) {
      const latestUsed = await syncDiscoveryGateState();
      const used = latestUsed ?? discoveriesUsed;
      if (used >= dailyDiscoveryLimit) {
        setShowBlur(true);
        setHasSearched(true);
        return;
      }
      setShowBlur(false);
    }

    await persistProductName();
    const nicheTerm = niche;
    setLoading(true);
    setError(null);
    setFollowerFilterHint(null);
    setHasSearched(true);

    try {
      const followerBounds: Record<string, { min: number; max?: number }> = {
        "1-10k": { min: 1000, max: 10000 },
        "10-20k": { min: 10000, max: 20000 },
        "20-50k": { min: 20000, max: 50000 },
        "50-100k": { min: 50000, max: 100000 },
        "100k+": { min: 100000 },
      };
      const activeFollowers = followersOverride !== undefined ? followersOverride : followers;
      const { min: minFollowers, max: maxFollowers } = followerBounds[activeFollowers] ?? { min: 0 };
      const minEngagement = parseInt(engagement, 10) || 0;

      const res = await fetch("/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: nicheTerm,
          platform,
          minFollowers,
          maxFollowers,
          minEngagement,
          location,
          language,
        }),
      });

      if (!res.ok) {
        throw new Error("Search failed. Please try again.");
      }

      const data = (await res.json()) as {
        creators?: Creator[];
        filteredOut?: number;
        followerRange?: [number, number];
      };
      const creatorsList = data.creators ?? [];

      if (
        creatorsList.length === 0 &&
        (data.filteredOut ?? 0) > 0 &&
        Array.isArray(data.followerRange) &&
        data.followerRange.length === 2
      ) {
        setCreators([]);
        setFollowerFilterHint({
          filteredOut: data.filteredOut!,
          followerRange: [Number(data.followerRange[0]), Number(data.followerRange[1])],
        });
        return;
      }

      const seed = Date.now() + Math.floor(Math.random() * 999999);
      const shuffled = shuffleWithSeed(creatorsList, seed).map((c) =>
        enrichCreatorCountry(c, location, language)
      );
      setCreators(shuffled);
      localStorage.setItem(DISCOVERY_RESULTS_CACHE_KEY, JSON.stringify(shuffled));
      const newCount = searchCount + 1;
      void incrementDiscoveries();
      setSearchCount(newCount);
      localStorage.setItem("trackit_search_" + new Date().toDateString(), String(newCount));
    } catch (e) {
      setCreators([]);
      setFollowerFilterHint(null);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const widenFollowerFiltersAndSearch = () => {
    setFollowers("");
    void search("");
  };

  const creatorsGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
    gap: 16,
  };

  return (
    <>
      <DiscoveryHeader lang={lang} isMobile={isMobile} />
      <DiscoveryTabs lang={lang} activeTab={activeTab} savedCount={savedCreators.length} onTabChange={setActiveTab} />
      <div style={{ padding: isMobile ? "56px 16px 16px" : "40px" }}>
        {activeTab === "discover" && (
          <>
        <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 20, marginBottom: 24, marginTop: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "#9A9A9A",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 8,
              }}
            >
              {lang === "fr" ? "Votre produit ou marque" : "Your product or brand"}
            </label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              onBlur={() => void persistProductName()}
              onKeyDown={(e) => e.key === "Enter" && void search()}
              placeholder={
                lang === "fr"
                  ? "Ex. Trackit, compléments fitness, skincare…"
                  : "e.g. Trackit, fitness supplements, skincare…"
              }
              style={{ ...inputStyle, marginBottom: 8 }}
            />
            <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 12px", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
              {lang === "fr"
                ? "Enregistrez ici le nom du produit que vous proposez aux créateurs. Utilisez les filtres ci-dessous pour trouver des profils adaptés."
                : "Register the product you offer creators here. Use the filters below to find matching profiles."}
            </p>
            <button
              type="button"
              onClick={() => void search()}
              disabled={loading}
              className="hero-cta-glass"
              style={{
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.7 : 1,
                width: isMobile ? "100%" : undefined,
              }}
            >
              {loading ? (
                lang === "fr" ? "Recherche…" : "Searching..."
              ) : (
                <span style={{ display: "inline-flex", alignItems: "baseline" }}>
                  Find it
                  <span className="brand-dot" aria-hidden />
                </span>
              )}
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <FilterSelect
              label={lang === "fr" ? "Niche" : "Niche"}
              value={niche}
              onChange={setNiche}
              options={[
                { value: "fitness", label: lang === "fr" ? "Fitness" : "Fitness" },
                { value: "fashion", label: lang === "fr" ? "Mode" : "Fashion" },
                { value: "beauty", label: lang === "fr" ? "Beauté" : "Beauty" },
                { value: "tech", label: lang === "fr" ? "Tech" : "Tech" },
                { value: "food", label: lang === "fr" ? "Cuisine" : "Food" },
                { value: "travel", label: lang === "fr" ? "Voyage" : "Travel" },
              ]}
            />
            <FilterSelect
              label={lang === "fr" ? "Plateforme" : "Platform"}
              value={platform}
              onChange={setPlatform}
              options={[{ value: "tiktok", label: "TikTok" }]}
            />
            <FilterSelect
              label={lang === "fr" ? "Abonnés" : "Followers"}
              value={followers}
              onChange={setFollowers}
              options={[
                { value: "", label: lang === "fr" ? "Tous" : "All" },
                { value: "1-10k", label: "1–10K" },
                { value: "10-20k", label: "10–20K" },
                { value: "20-50k", label: "20–50K" },
                { value: "50-100k", label: "50–100K" },
                { value: "100k+", label: "100K+" },
              ]}
            />
            <FilterSelect
              label={lang === "fr" ? "Engagement" : "Engagement"}
              value={engagement}
              onChange={setEngagement}
              options={[
                { value: "", label: lang === "fr" ? "Tous" : "All" },
                { value: "1+", label: "1%+" },
                { value: "3+", label: "3%+" },
                { value: "5+", label: "5%+" },
                { value: "7+", label: "7%+" },
              ]}
            />
            <FilterSelect
              label={lang === "fr" ? "Localisation" : "Location"}
              value={location}
              onChange={handleLocationChange}
              options={[{ value: "FR", label: "France" }]}
            />
            <FilterSelect
              label={lang === "fr" ? "Langue" : "Language"}
              value={language}
              onChange={handleLanguageChange}
              options={[{ value: "french", label: lang === "fr" ? "Français" : "French" }]}
            />
          </div>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(220,38,38,0.06)",
              border: "1px solid rgba(220,38,38,0.2)",
              borderRadius: 12,
              padding: "12px 16px",
              marginBottom: 20,
              fontSize: 13,
              color: "#DC2626",
            }}
          >
            {error}
          </div>
        )}

        {loading && (
          <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 60, textAlign: "center" }}>
            <div
              style={{
                width: 40,
                height: 40,
                border: "3px solid #EFEFEF",
                borderTopColor: "#0047FF",
                borderRadius: "50%",
                margin: "0 auto 16px",
                animation: "discovery-spin 0.8s linear infinite",
              }}
            />
            <p style={{ fontSize: 14, color: "#7A7A7A", margin: 0 }}>{lang === "fr" ? "Chargement des créateurs..." : "Loading creators..."}</p>
            <style>{`@keyframes discovery-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {!loading && !hasSearched && (
          <div style={{ background: "#FFFFFF", border: "1px dashed #E5E5E5", borderRadius: 16, padding: 60, textAlign: "center" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: "#F5F5F5",
                margin: "0 auto 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="#9A9A9A" strokeWidth="1.8" />
                <path d="M21 21l-4.35-4.35" stroke="#9A9A9A" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0, marginBottom: 6 }}>
              {lang === "fr" ? "Aucune recherche" : "No search yet"}
            </h3>
            <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0 }}>
              {lang === "fr" ? "Entrez votre niche ci-dessus pour trouver des créateurs" : "Enter your niche above to find creators"}
            </p>
          </div>
        )}

        {!loading && hasSearched && creators.length === 0 && !error && (
          showBlur ? (
            <div style={{ position: "relative" }}>
              <div style={{ ...creatorsGridStyle, filter: "blur(6px)", pointerEvents: "none", userSelect: "none", transition: "filter 0.3s" }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 20, minHeight: 260 }} />
                ))}
              </div>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", zIndex: 10, padding: isMobile ? "100px 16px 60px" : "20px 20px 150px" }}>
                <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 20, padding: "32px 40px", textAlign: "center", maxWidth: 400, boxShadow: "0 8px 40px rgba(0,0,0,0.12)" }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(0,71,255,0.08)", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="10" rx="2" stroke="#0047FF" strokeWidth="1.8"/><path d="M8 11V8a4 4 0 018 0v3" stroke="#0047FF" strokeWidth="1.8" strokeLinecap="round"/></svg>
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0, marginBottom: 8 }}>
                    {discoveryLimitTitle}
                  </h3>
                  <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: 0, marginBottom: 6 }}>
                    {discoveryLimitSubtitle}
                  </p>
                  {resetCountdown && (
                    <p style={{ fontSize: 12, color: "#9A9A9A", margin: "0 0 18px" }}>
                      {lang === "fr" ? `Réinitialisation dans ${resetCountdown}` : `Resets in ${resetCountdown}`}
                    </p>
                  )}
                  {!resetCountdown && <div style={{ marginBottom: 18 }} />}
                  <button
                    type="button"
                    onClick={handleDiscoveryUpgrade}
                    style={{ background: "#0047FF", color: "#FFFFFF", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", letterSpacing: "-0.02em", width: "100%" }}
                  >
                    {discoveryLimitCta}
                  </button>
                </div>
              </div>
            </div>
          ) : followerFilterHint ? (
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #EFEFEF",
                borderRadius: 16,
                padding: "28px 24px",
                textAlign: "center",
                maxWidth: 560,
                margin: "0 auto",
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  color: "#7A7A7A",
                  letterSpacing: "-0.02em",
                  margin: "0 0 20px",
                  lineHeight: 1.55,
                }}
              >
                {lang === "fr"
                  ? `${followerFilterHint.filteredOut} créateurs disponibles dans cette niche, mais aucun dans votre fourchette d'abonnés. Les créateurs de cette niche vont de ${formatCount(followerFilterHint.followerRange[0]).replace(".", ",")} à ${formatCount(followerFilterHint.followerRange[1]).replace(".", ",")} abonnés.`
                  : `${followerFilterHint.filteredOut} creators available in this niche, but none in your follower range. Creators in this niche range from ${formatCount(followerFilterHint.followerRange[0])} to ${formatCount(followerFilterHint.followerRange[1])} followers.`}
              </p>
              <button
                type="button"
                onClick={widenFollowerFiltersAndSearch}
                style={{
                  background: "#1A1A1A",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: 10,
                  padding: "11px 20px",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  letterSpacing: "-0.02em",
                }}
              >
                {lang === "fr" ? "Élargir les filtres" : "Widen filters"}
              </button>
            </div>
          ) : (
            <div style={{ background: "#FFFFFF", border: "1px dashed #E5E5E5", borderRadius: 16, padding: 60, textAlign: "center" }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px" }}>{lang === "fr" ? "Aucun créateur trouvé" : "No creators found"}</h3>
              <p style={{ fontSize: 14, color: "#7A7A7A", margin: 0 }}>{lang === "fr" ? "Essayez d'ajuster vos filtres" : "Try adjusting your filters"}</p>
            </div>
          )
        )}

        {!loading && creators.length > 0 && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <p style={{ fontSize: 14, color: "#7A7A7A", margin: 0, letterSpacing: "-0.02em" }}>
                {lang === "fr"
                  ? `${resultsCountLabel} ${creators.length === 1 ? "créateur trouvé" : "créateurs trouvés"}${resultsCappedNote}`
                  : `${resultsCountLabel} ${creators.length === 1 ? "creator" : "creators"} found${resultsCappedNote}`}
              </p>
            </div>
            <div style={{ position: "relative" }}>
              <div style={{ ...creatorsGridStyle, filter: showBlur ? "blur(6px)" : "none", pointerEvents: showBlur ? "none" : "auto", userSelect: showBlur ? "none" : "auto", transition: "filter 0.3s" }}>
                {visibleCreators.map((c) => (
                  <CreatorCard
                    lang={lang}
                    key={c.username  ?? ""}
                    variant="discover"
                    creator={c}
                    isSaved={isCreatorSaved(c.username  ?? "")}
                    onToggleSave={() => toggleSaveCreator(c)}
                    onViewProfile={() => setSelectedCreator(c)}
                  />
                ))}
              </div>
              {showBlur && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", zIndex: 10, padding: isMobile ? "100px 16px 60px" : "20px 20px 150px" }}>
                  <div style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 20, padding: "32px 40px", textAlign: "center", maxWidth: 400, boxShadow: "0 8px 40px rgba(0,0,0,0.12)" }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(0,71,255,0.08)", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="10" rx="2" stroke="#0047FF" strokeWidth="1.8"/><path d="M8 11V8a4 4 0 018 0v3" stroke="#0047FF" strokeWidth="1.8" strokeLinecap="round"/></svg>
                    </div>
                    <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0, marginBottom: 8 }}>
                      {discoveryLimitTitle}
                    </h3>
                    <p style={{ fontSize: 13, color: "#7A7A7A", letterSpacing: "-0.01em", margin: 0, marginBottom: 6 }}>
                      {discoveryLimitSubtitle}
                    </p>
                    {resetCountdown && (
                      <p style={{ fontSize: 12, color: "#9A9A9A", margin: "0 0 18px" }}>
                        {lang === "fr" ? `Réinitialisation dans ${resetCountdown}` : `Resets in ${resetCountdown}`}
                      </p>
                    )}
                    {!resetCountdown && <div style={{ marginBottom: 18 }} />}
                    <button
                      type="button"
                      onClick={handleDiscoveryUpgrade}
                      style={{ background: "#0047FF", color: "#FFFFFF", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", letterSpacing: "-0.02em", width: "100%" }}
                    >
                      {discoveryLimitCta}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
          </>
        )}

        {activeTab === "saved" && (
          <>
            {savedCreators.length === 0 ? (
              <div style={{ background: "#FFFFFF", border: "1px dashed #E5E5E5", borderRadius: 16, padding: 60, textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🔖</div>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0, marginBottom: 6 }}>
                  {lang === "fr" ? "Aucun créateur sauvegardé" : "No saved creators yet"}
                </h3>
                <p style={{ fontSize: 14, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0 }}>
                  {lang === "fr" ? "Sauvegardez des créateurs depuis Recherche pour les voir ici" : "Save creators from Discovery to see them here"}
                </p>
              </div>
            ) : (
              <div style={creatorsGridStyle}>
                {savedCreators.map((c) => (
                  <CreatorCard
                    lang={lang}
                    key={c.username ?? Math.random().toString()}
                    variant="saved"
                    creator={c}
                    onViewProfile={() => setSelectedCreator(c)}
                    onGenerateOutreach={() => openOutreach(c)}
                    onRemove={() => void handleRemoveCreator(c.username  ?? "")}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {selectedCreator && (
        <CreatorProfileModal
          lang={lang}
          creator={selectedCreator}
          onClose={() => setSelectedCreator(null)}
          onGenerateOutreach={() => openOutreach(selectedCreator)}
        />
      )}
      {outreachCreator && (
        <OutreachModal
          creator={outreachCreator}
          onClose={() => setOutreachCreator(null)}
          templates={outreachTemplates}
          onSaveTemplate={(t) => setOutreachTemplates((list) => [...list, t])}
          onDeleteTemplate={(id) => setOutreachTemplates((list) => list.filter((t) => t.id !== id))}
          onMarkSent={() => {
            setOutreachContacted((list) => {
              if (list.some((c) => c.username === (outreachCreator.username))) return list;
              return [
                ...list,
                { username: outreachCreator.username, displayName: outreachCreator.displayName, status: "Contacted" },
              ];
            });
            setToast("Outreach marked as sent ✓");
            setOutreachCreator(null);
          }}
          userName="You"
        />
      )}
      {upgradeModalOpen && (
        <UpgradeModal
          lang={lang}
          onClose={() => setUpgradeModalOpen(false)}
          title={creatorLimitTitle}
          description={creatorLimitDescription}
          planBadge={creatorLimitPlanBadge}
          primaryLabel={creatorLimitPrimaryLabel}
          onPrimary={handleCreatorLimitUpgrade}
          showAllPlansLink={false}
        />
      )}
      {toast && <SaveToast message={toast} />}
    </>
  );
}
