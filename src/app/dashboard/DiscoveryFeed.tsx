"use client";

import "./sample-preview.css";
import "./gifting-view.css";
import "./discovery-motion.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlanTier } from "@/lib/plan-limits";
import {
  getDailyDiscoveryLimit,
  getResultsPerSearchLimit,
  hasDiscoveryDailyCap,
} from "@/lib/plan-limits";
import {
  discoveryResetRemainingMs,
  incrementDiscoveryQuota,
  syncDiscoveryQuota,
} from "@/lib/discovery-quota";
import type { FeedCreator } from "@/lib/discovery-feed";
import { creatorMatchesGeoFilter, creatorMatchesNicheFilter, isCuratedFeedCreator } from "@/lib/discovery-feed";
import {
  creatorMatchesFollowerRange,
  followerRangeBounds,
} from "@/lib/discovery-follower-ranges";
import { CreatorProfilePage } from "@/app/dashboard/CreatorProfilePage";
import { EMPTY_VIDEO_FILTERS, VideoLibrary, type VideoFilters } from "@/app/dashboard/VideoLibrary";
import { CreatorAvatar } from "@/app/dashboard/CreatorAvatar";
import { listSaved, listFolders, type FolderRow, type FolderItem } from "@/lib/workspace-client";
import { SaveCreatorDropdown } from "@/app/dashboard/SaveCreatorDropdown";
import { useLang } from "@/lib/useLang";
import { discoveryCopy } from "@/lib/discovery-copy";
import { logCreatorLookupRequest } from "@/lib/creator-lookup-requests";
import { submitNicheRequest } from "@/lib/niche-requests";
import { NICHE_TREE, nicheLabel } from "@/lib/niche-tree";
import { prefetchCreatorMedia } from "@/lib/avatar-url-cache";
import { prefetchCreatorDetail } from "@/lib/creator-detail-cache";
import {
  HIDDEN_CREATORS_EVENT,
  loadHiddenCreators,
} from "@/lib/hidden-creators-storage";
import { useDashboardNavigation } from "./DashboardNavigationProvider";
import { UpgradeModal } from "./UpgradeModal";
import { CatalogFilterBar, type CatalogMode, type CatalogPreset, type CatalogSortKey } from "./CatalogFilterBar";
import { COUNT_VAL, ENGAGEMENT_VAL, VIEWS_VAL, creatorFiltersToParams } from "@/lib/catalog-filter-params";
import { PlatformLogo, platformKey } from "@/components/PlatformLogo";
import { detectBrand } from "@/lib/brand-detect";
import { isStablePublicImageUrl } from "@/lib/client-image-url";

function fmt(n: number, lang: "en" | "fr" = "en"): string {
  if (lang === "fr") {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(".", ",") + " M";
    if (n >= 1_000) return (n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace(".", ",") + " k";
    return String(Math.round(n));
  }
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 100_000 ? 0 : 1) + "K";
  return String(Math.round(n));
}

function Lock({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  background: "var(--ws-input)",
  border: "1px solid var(--ws-border)",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: "inherit",
  color: "var(--ws-text)",
  letterSpacing: "-0.01em",
  boxSizing: "border-box",
};

type FilterState = {
  niche: string;
  platform: string;
  followersRange: string;
  engagement: string;
  country: string;
  language: string;
  age: string;
  viewsFrom: string;
  viewsTo: string;
  search: string;
  hasEmail: boolean;
  hideSaved: boolean;
  showHidden: boolean;
  activity: string;
  verified: boolean;
  preset: string;
  reach: string;
  likes: string;
  comments: string;
  shares: string;
  viral: boolean;
  /** Hide brand / company accounts (on by default). */
  excludeBrands: boolean;
};

const EMPTY_FILTERS: FilterState = {
  niche: "",
  platform: "tiktok",
  followersRange: "",
  engagement: "",
  country: "",
  language: "",
  age: "",
  viewsFrom: "",
  viewsTo: "",
  search: "",
  hasEmail: false,
  hideSaved: false,
  showHidden: false,
  activity: "",
  verified: false,
  preset: "",
  reach: "",
  likes: "",
  comments: "",
  shares: "",
  viral: false,
  excludeBrands: true,
};

/** Catalogue sans niche choisie : pas de cap plan ni quota decouverte. */
function isAllNichesBrowse(f: FilterState): boolean {
  return !f.niche;
}

/** Performance / search filters (not niche or geo). Triggers refresh + discovery quota. */
function hasActiveSearchFilters(f: FilterState): boolean {
  if (f.followersRange || f.engagement || f.viewsFrom || f.viewsTo || f.age || f.activity || f.verified) return true;
  if (f.search.trim()) return true;
  if (f.hasEmail || f.hideSaved || f.showHidden) return true;
  return false;
}

function languageFromCountry(country: string): string | null {
  const map: Record<string, string> = {
    FR: "fr",
    US: "en",
    GB: "en",
    ES: "es",
    IT: "it",
    DE: "de",
    PT: "pt",
    BR: "pt",
    CA: "en",
  };
  return map[country] ?? null;
}

function toParams(f: FilterState, debouncedSearch = "", sort: CatalogSortKey = "followers"): Record<string, string> {
  return creatorFiltersToParams(f, debouncedSearch, sort);
}

function applyClientFilters(
  list: FeedCreator[],
  f: FilterState,
  saved: Set<string>,
  hidden: Set<string>,
): FeedCreator[] {
  const curated = list.filter((c) => isCuratedFeedCreator(c));
  const regular = list.filter((c) => !isCuratedFeedCreator(c));
  const isGlobalSearch = f.search.trim().replace(/^@/, "").length >= 2;

  const applyRowFilters = (input: FeedCreator[]): FeedCreator[] => {
    let out = input;

    if (!isGlobalSearch && f.niche) {
      out = out.filter((c) => creatorMatchesNicheFilter(c, f.niche));
    }

    if (!isGlobalSearch && (f.country || f.language)) {
      out = out.filter((c) =>
        creatorMatchesGeoFilter(c, {
          country: f.country || undefined,
          language: f.language || undefined,
        })
      );
    }

    if (!isGlobalSearch && f.platform) {
      const want = f.platform.toLowerCase();
      out = out.filter((c) => (c.platform || "tiktok").toLowerCase().includes(want));
    }

    if (f.followersRange) {
      const followers = followerRangeBounds(f.followersRange);
      out = out.filter((c) => creatorMatchesFollowerRange(c.followersCount, followers));
    }

    // Same rules as the SQL (lib/catalog-query), for rows the server did not filter (live search).
    if (ENGAGEMENT_VAL[f.engagement]) out = out.filter((c) => c.engagementRate >= ENGAGEMENT_VAL[f.engagement]);

    if (!isGlobalSearch) {
      const q = f.search.trim().toLowerCase().replace(/^@/, "");
      if (q) {
        out = out.filter(
          (c) =>
            c.username.toLowerCase().includes(q) ||
            c.displayName.toLowerCase().includes(q) ||
            (c.email?.toLowerCase().includes(q) ?? false),
        );
      }
    }
    if (f.hasEmail) out = out.filter((c) => Boolean(c.email));
    if (f.verified) out = out.filter((c) => c.authenticityScore >= 60);
    if (f.excludeBrands) out = out.filter((c) => !detectBrand({ username: c.username, displayName: c.displayName, bio: c.bio }).isBrand);
    if (Number(f.reach) > 0) out = out.filter((c) => (c.viewsPerFollower ?? 0) >= Number(f.reach));
    if (COUNT_VAL[f.likes]) out = out.filter((c) => (c.avgLikes ?? 0) >= COUNT_VAL[f.likes]);
    if (COUNT_VAL[f.comments]) out = out.filter((c) => (c.avgComments ?? 0) >= COUNT_VAL[f.comments]);
    if (COUNT_VAL[f.shares]) out = out.filter((c) => (c.avgShares ?? 0) >= COUNT_VAL[f.shares]);
    if (f.viral) out = out.filter((c) => (c.videoStats?.viralVideos ?? 0) > 0);
    if (f.activity) {
      const since = Date.now() - Number(f.activity) * 86_400_000;
      out = out.filter((c) => Boolean(c.lastPostAt) && new Date(c.lastPostAt!).getTime() >= since);
    }
    if (f.hideSaved) out = out.filter((c) => !saved.has(c.username));
    if (f.showHidden) {
      out = out.filter((c) => hidden.has(c.username.toLowerCase()));
    } else {
      out = out.filter((c) => !hidden.has(c.username.toLowerCase()));
    }
    // Views filters read measured views only (posts analyzed), like the SQL.
    if (VIEWS_VAL[f.viewsFrom]) out = out.filter((c) => (c.postsAnalyzed ?? 0) > 0 && c.avgViews >= VIEWS_VAL[f.viewsFrom]);
    if (f.viewsTo && VIEWS_VAL[f.viewsTo]) out = out.filter((c) => (c.postsAnalyzed ?? 0) > 0 && c.avgViews <= VIEWS_VAL[f.viewsTo]);
    return out;
  };

  const curatedOut = applyRowFilters(curated);
  const regularOut = applyRowFilters(regular);
  const seen = new Set<string>();
  const merged: FeedCreator[] = [];
  for (const c of [...curatedOut, ...regularOut]) {
    if (!c.username || seen.has(c.username)) continue;
    seen.add(c.username);
    merged.push(c);
  }
  return merged;
}

function estimateEngagement(c: FeedCreator) {
  return Math.round((c.followersCount * c.engagementRate) / 100);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ws-text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10, marginTop: 4 }}>
      {children}
    </div>
  );
}

function NicheRequestSection({ lang, product }: { lang: "en" | "fr"; product: string }) {
  const t = discoveryCopy(lang);
  const [niche, setNiche] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async () => {
    const trimmed = niche.trim();
    if (trimmed.length < 2 || status === "submitting") return;
    setStatus("submitting");
    setErrorMsg("");
    const result = await submitNicheRequest(trimmed, product);
    if (result.ok) {
      setNiche("");
      setStatus("success");
      return;
    }
    setStatus("error");
    if (result.error === "Not signed in") {
      setErrorMsg(t.requestSignIn);
    } else {
      setErrorMsg(t.requestError);
    }
  };

  return (
    <div
      style={{
        marginBottom: 16,
        paddingTop: 16,
        borderTop: "1px solid var(--ws-border)",
      }}
    >
      <SectionTitle>{t.requestSection}</SectionTitle>
      <p style={{ fontSize: 12, color: "var(--ws-text-muted)", margin: "0 0 10px", lineHeight: 1.45, letterSpacing: "-0.01em" }}>
        {t.requestSectionHint}
      </p>
      <input
        type="text"
        value={niche}
        onChange={(e) => {
          setNiche(e.target.value);
          if (status === "success" || status === "error") setStatus("idle");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void handleSubmit();
        }}
        placeholder={t.requestNichePlaceholder}
        style={inputStyle}
      />
      <button
        type="button"
        className="hero-cta-shopify-light hero-cta-compact-sm"
        disabled={niche.trim().length < 2 || status === "submitting"}
        onClick={() => void handleSubmit()}
        style={{ width: "100%", marginTop: 10 }}
      >
        {status === "submitting" ? t.requestSubmitting : t.requestSubmit}
      </button>
      {status === "success" ? (
        <p style={{ fontSize: 12, color: "#15803D", margin: "10px 0 0", lineHeight: 1.45 }}>{t.requestSuccess}</p>
      ) : null}
      {status === "error" && errorMsg ? (
        <p style={{ fontSize: 12, color: "#C0392B", margin: "10px 0 0", lineHeight: 1.45 }}>{errorMsg}</p>
      ) : null}
    </div>
  );
}

function ago(iso: string | null, lang: "en" | "fr" = "en"): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return "";
  if (lang === "fr") {
    if (days === 0) return "aujourd'hui";
    if (days === 1) return "hier";
    if (days < 30) return `il y a ${days} jours`;
    const moisFr = Math.floor(days / 30);
    if (moisFr < 12) return `il y a ${moisFr} mois`;
    const ansFr = Math.floor(moisFr / 12);
    return `il y a ${ansFr} ${ansFr < 2 ? "an" : "ans"}`;
  }
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.floor(months / 12)} yr ago`;
}

/** Views of the videos we analyzed, as a small curve. */
function ViewsSpark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 100;
  const H = 30;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 2 - (v / max) * (H - 6)]);
  const line = pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg className="cf-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <path className="is-area" d={`${line} L${W},${H} L0,${H} Z`} />
      <path className="is-line" d={line} />
    </svg>
  );
}

type RowVideo = { cover: string; views: number; url: string };

/**
 * TikTok cover links expire. Stored covers are served as is; anything else goes
 * through /api/creator-video-thumbs, which refetches the video once and stores
 * the cover for good.
 */
function coverSrc(c: FeedCreator, cover: string, index: number): string {
  if (isStablePublicImageUrl(cover)) return cover;
  if (platformKey(c.platform) === "tiktok" && index < 3) {
    return `/api/creator-video-thumbs?username=${encodeURIComponent(c.username)}&i=${index}`;
  }
  return cover;
}

function rowVideos(c: FeedCreator): RowVideo[] {
  const top = (c.topVideos ?? [])
    .filter((v) => v.cover)
    .slice(0, 3)
    .map((v, i) => ({ cover: coverSrc(c, v.cover, i), views: v.playCount, url: v.shareUrl }));
  if (top.length) return top;
  return (c.videoThumbnails ?? [])
    .filter((v) => v.thumbnail)
    .slice(0, 3)
    .map((v) => ({ cover: v.thumbnail as string, views: v.views, url: v.url ?? "" }));
}

function FeedListRow({
  lang,
  creator,
  saved,
  inFolders,
  folders,
  isPaid,
  onOpen,
  onWorkspaceChange,
  onSavedOptimistic,
  onFoldersOptimistic,
  onUpgrade,
  avatarPriority,
  dimmed,
  index,
}: {
  lang: "en" | "fr";
  creator: FeedCreator;
  saved: boolean;
  inFolders: Set<string>;
  folders: FolderRow[];
  isPaid: boolean;
  onOpen: () => void;
  onWorkspaceChange: () => void;
  onSavedOptimistic: (username: string, saved: boolean) => void;
  onFoldersOptimistic: (username: string, folderId: string, inFolder: boolean) => void;
  onUpgrade?: () => void;
  avatarPriority?: boolean;
  dimmed?: boolean;
  index: number;
}) {
  const c = creator;
  const t = discoveryCopy(lang);
  const fr = lang === "fr";
  const instagram = platformKey(c.platform) === "instagram";
  const videos = rowVideos(c);
  const views = (c.videoThumbnails ?? []).map((v) => v.views).filter((v) => v > 0).slice(0, 10);
  const posted = ago(c.lastPostAt, lang);

  return (
    <div
      className={`cf-row${dimmed ? " is-dimmed" : ""}`}
      style={{ ["--i" as string]: index }}
      onMouseEnter={() => prefetchCreatorDetail(c.username)}
    >
      <div className="cf-row__who" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
        <span className="cf-row__face">
          {instagram && c.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.avatarUrl} alt={c.displayName} width={52} height={52} style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover" }} referrerPolicy="no-referrer" />
          ) : (
            <CreatorAvatar username={c.username} src={c.avatarUrl} displayName={c.displayName} size={52} alt={c.displayName} priority={avatarPriority} />
          )}
          <span className="cf-row__platform">
            <PlatformLogo platform={c.platform} size={13} />
          </span>
        </span>
        <span className="cf-row__name">
          <strong>
            {c.displayName || c.username}
            {c.authenticityScore >= 60 && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-label={t.verified} style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" fill="var(--ws-accent)" />
                <path d="M8 12.5l2.5 2.5L16 9" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </strong>
          <span>@{c.username}</span>
          <span className="cf-row__meta">
            {c.countryCode ? <span className="cf-geo">{c.countryCode}</span> : null}
            {posted ? <span>{fr ? "Publié" : "Posted"} {posted}</span> : null}
          </span>
        </span>
      </div>
      <div className="cf-vids">
        {videos.length ? (
          videos.map((v, k) => (
            <a key={`${v.cover}-${k}`} className="cf-vid" href={v.url || undefined} target="_blank" rel="noreferrer" onClick={(e) => { if (!v.url) e.preventDefault(); }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.cover} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
              <span className="cf-vid__play" aria-hidden>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z" /></svg>
              </span>
              <span className="cf-vid__views">{fmt(v.views, lang)}</span>
            </a>
          ))
        ) : (
          <span className="cf-vids__none">{fr ? "Pas encore de vidéos" : "No videos yet"}</span>
        )}
      </div>
      <div className="cf-row__tags">
        {c.primaryNiche ? <span className="cf-tag">{fr ? nicheLabel(c.primaryNiche, "fr") : c.primaryNiche}</span> : null}
        {c.email ? <span className="cf-tag is-mail">{fr ? "E-mail" : "Email"}</span> : null}
      </div>
      <div className="cf-stat">
        <b>
          {fmt(c.followersCount, lang)}
          {c.growth?.followersGrowthPct30d != null ? (
            <span className={`cf-growth${c.growth.followersGrowthPct30d >= 0 ? " is-up" : " is-down"}`} title={fr ? "Croissance des abonnés sur 30 jours" : "Follower growth over 30 days"}>
              {c.growth.followersGrowthPct30d >= 0 ? "+" : ""}
              {fr ? `${c.growth.followersGrowthPct30d.toFixed(1).replace(".", ",")} %` : `${c.growth.followersGrowthPct30d.toFixed(1)}%`}
            </span>
          ) : null}
        </b>
        <small className={c.engagementRate >= 6 ? "is-hot" : ""}>{c.engagementRate ? (fr ? `${c.engagementRate.toFixed(1).replace(".", ",")} % d'engagement` : `${c.engagementRate.toFixed(1)}% engagement`) : fr ? "abonnés" : "followers"}</small>
      </div>
      <div className="cf-stat is-views">
        <b>{c.avgViews ? fmt(c.avgViews, lang) : "—"}</b>
        <ViewsSpark values={views} />
      </div>
      <div className="cf-inter">
        <span>Likes</span>
        <b>{c.avgLikes ? fmt(c.avgLikes, lang) : "—"}</b>
        <span>{fr ? "Commentaires" : "Comments"}</span>
        <b>{c.avgComments ? fmt(c.avgComments, lang) : "—"}</b>
        <span>{fr ? "Partages" : "Shares"}</span>
        <b>{c.avgShares ? fmt(c.avgShares, lang) : "—"}</b>
      </div>
      <div className="cf-row__actions">
        <SaveCreatorDropdown
          lang={lang}
          creator={c}
          saved={saved}
          inFolders={inFolders}
          folders={folders}
          isPaid={isPaid}
          onUpgrade={onUpgrade}
          onWorkspaceChange={onWorkspaceChange}
          onSavedOptimistic={onSavedOptimistic}
          onFoldersOptimistic={onFoldersOptimistic}
        />
        <button type="button" className="cf-view" onClick={onOpen}>
          {t.view}
        </button>
      </div>
    </div>
  );
}

function UpgradeCtaButton({ lang, onClick, fullWidth }: { lang: "en" | "fr"; onClick: () => void; fullWidth?: boolean }) {
  const t = discoveryCopy(lang);
  return (
    <button
      type="button"
      onClick={onClick}
      className="hero-cta-shopify hero-cta-compact"
      style={{
        width: fullWidth ? "100%" : undefined,
        padding: "12px 16px",
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        justifyContent: "center",
        fontFamily: "inherit",
      }}
    >
      <span style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2L4 14h7v8l8-12h-7V2z" fill="#FFFFFF" />
        </svg>
      </span>
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "left", flex: fullWidth ? 1 : undefined }}>
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{t.unlockFeed}</span>
        <span style={{ fontSize: 11.5, fontWeight: 400, opacity: 0.88, letterSpacing: "-0.01em", marginTop: 2 }}>{t.unlockFeedSub}</span>
      </span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, opacity: 0.92 }}>
        <path d="M5 12h14M13 6l6 6-6 6" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function PaywallModal({ lang, title, body, onUpgrade, onClose }: { lang: "en" | "fr"; title: string; body: string; onUpgrade: () => void; onClose: () => void }) {
  const t = discoveryCopy(lang);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--ws-surface)", borderRadius: 18, padding: "30px 34px", textAlign: "center", maxWidth: 380, boxShadow: "0 24px 48px rgba(0,0,0,0.18)" }}>
        <img
          src={TRACKIT_LOGO_URL}
          alt="Trackit"
          style={{ height: 64, width: "auto", display: "block", objectFit: "contain", margin: "0 auto 14px" }}
        />
        <div style={{ fontSize: 19, fontWeight: 600, color: "var(--ws-text)", marginBottom: 7 }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--ws-text-muted)", marginBottom: 18, lineHeight: 1.5 }}>{body}</div>
        <UpgradeCtaButton lang={lang} onClick={onUpgrade} fullWidth />
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "var(--ws-text-dim)", fontSize: 13, marginTop: 12, cursor: "pointer", fontFamily: "inherit" }}>{t.later}</button>
      </div>
    </div>
  );
}

function FeedGateOverlay({ lang, onUpgrade }: { lang: "en" | "fr"; onUpgrade: () => void }) {
  const t = discoveryCopy(lang);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: "26%",
        bottom: 0,
        background: "linear-gradient(transparent 0%, var(--ws-bg) 48%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 20px 32px",
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      <div
        style={{
          background: "var(--ws-surface)",
          border: "1px solid var(--ws-border)",
          borderRadius: 16,
          padding: "28px 28px 24px",
          textAlign: "center",
          maxWidth: 420,
          width: "min(100%, 420px)",
          boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
          pointerEvents: "auto",
        }}
      >
        <img
          src={TRACKIT_LOGO_URL}
          alt="Trackit"
          style={{ height: 64, width: "auto", display: "block", objectFit: "contain", margin: "0 auto 16px" }}
        />
        <div style={{ fontSize: 19, fontWeight: 600, color: "var(--ws-text)", marginBottom: 6, letterSpacing: "-0.03em" }}>{t.paywallTitle}</div>
        <div style={{ fontSize: 13, color: "var(--ws-text-muted)", marginBottom: 18, lineHeight: 1.55 }}>{t.paywallBody}</div>
        <UpgradeCtaButton lang={lang} onClick={onUpgrade} fullWidth />
      </div>
    </div>
  );
}

function feedRowGateStyle(index: number, total: number, gateActive: boolean): React.CSSProperties | undefined {
  if (!gateActive || total <= 0) return undefined;
  const clearCount = Math.max(4, Math.ceil(total * 0.38));
  if (index < clearCount) return undefined;
  const t = (index - clearCount) / Math.max(1, total - clearCount - 1);
  const blurPx = 0.5 + t * 9.5;
  const opacity = 1 - t * 0.5;
  return {
    filter: `blur(${blurPx.toFixed(1)}px)`,
    opacity,
    pointerEvents: "none",
    userSelect: "none",
  };
}

/** Progressive teaser on Free — shows what's locked beyond the first results. */
const FREE_VISIBLE = 6;
const SCALE_PAGE_LIMIT = 48;
const ALL_NICHES_CHUNK = 1000;
const TRACKIT_LOGO_URL = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";
const FREE_DISCOVERY_GATE_LOCK_KEY = "trackit_free_discovery_gate_locked";

function readFreeDiscoveryGateLock(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(FREE_DISCOVERY_GATE_LOCK_KEY) === "1";
}

function writeFreeDiscoveryGateLock(locked: boolean) {
  if (typeof window === "undefined") return;
  if (locked) window.localStorage.setItem(FREE_DISCOVERY_GATE_LOCK_KEY, "1");
  else window.localStorage.removeItem(FREE_DISCOVERY_GATE_LOCK_KEY);
}

export function DiscoveryFeed({ plan, workspaceUserId, isMobile, onUpgrade, onReachOut }: { plan: PlanTier; workspaceUserId?: string; isMobile?: boolean; onUpgrade: () => void; onReachOut?: (creator: FeedCreator) => void }) {
  const lang = useLang();
  const { navState, navigate, goBack } = useDashboardNavigation();
  const t = discoveryCopy(lang);
  const isPaid = plan !== "free";
  const resultsPerSearch = getResultsPerSearchLimit(plan);
  const discoveryLimit = getDailyDiscoveryLimit(plan);
  const hasDiscoveryCap = hasDiscoveryDailyCap(plan);
  const [creators, setCreators] = useState<FeedCreator[]>([]);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [product, setProduct] = useState("");
  const [savedUsernames, setSavedUsernames] = useState<Set<string>>(new Set());
  const [hiddenUsernames, setHiddenUsernames] = useState<Set<string>>(() => loadHiddenCreators());
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [folderItems, setFolderItems] = useState<FolderItem[]>([]);
  const [hasMore, setHasMore] = useState(() => !(plan === "free" && readFreeDiscoveryGateLock()));
  /** Creators matching the filters in the whole database (null = not counted, e.g. live search). */
  const [catalogTotal, setCatalogTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [filterPaywall, setFilterPaywall] = useState(false);
  const [gatePaywall, setGatePaywall] = useState(false);
  const [selected, setSelected] = useState<FeedCreator | null>(null);
  const [discoveriesResetAt, setDiscoveriesResetAt] = useState<Date | null>(null);
  const [discoveriesUsed, setDiscoveriesUsed] = useState(0);
  const [showDiscoveryGate, setShowDiscoveryGate] = useState(() => plan === "free" && readFreeDiscoveryGateLock());

  const openCreator = (creator: FeedCreator) => {
    setSelected(creator);
    navigate({ view: "discovery", creator: creator.username });
  };
  // The creator page follows navigation, so Back (in-app or browser) closes it.
  const profileHandle = navState.view === "discovery" && navState.creator ? navState.creator.replace(/^@/, "") : null;

  useEffect(() => {
    const refreshHidden = () => setHiddenUsernames(loadHiddenCreators());
    refreshHidden();
    window.addEventListener(HIDDEN_CREATORS_EVENT, refreshHidden);
    return () => window.removeEventListener(HIDDEN_CREATORS_EVENT, refreshHidden);
  }, []);

  useEffect(() => {
    if (navState.view !== "discovery") return;
    if (!navState.creator) {
      setSelected(null);
      return;
    }
    const handle = navState.creator.replace(/^@/, "").toLowerCase();
    const found = creators.find((c) => c.username.replace(/^@/, "").toLowerCase() === handle);
    if (found) setSelected(found);
  }, [navState.view, navState.creator, creators]);
  const [sort, setSort] = useState<CatalogSortKey>("followers");
  const [mode, setMode] = useState<CatalogMode>("creators");
  const [videoFilters, setVideoFilters] = useState<VideoFilters>(EMPTY_VIDEO_FILTERS);
  const [videoPreset, setVideoPreset] = useState("all");
  const [videoCount, setVideoCount] = useState(0);
  const [videoLoading, setVideoLoading] = useState(true);
  const onVideoCount = useCallback((n: number, isLoading: boolean) => {
    setVideoCount(n);
    setVideoLoading(isLoading);
  }, []);
  const onVideoChange = (patch: Partial<VideoFilters>, preset?: string) => {
    if (preset) {
      setVideoFilters({ ...EMPTY_VIDEO_FILTERS, ...patch });
      setVideoPreset(preset);
      return;
    }
    setVideoFilters((prev) => ({ ...prev, ...patch }));
    setVideoPreset("");
  };
  const openCreatorByHandle = (username: string) => navigate({ view: "discovery", creator: username });
  const applyPreset = (p: CatalogPreset) => {
    setFilters((prev) => ({ ...EMPTY_FILTERS, platform: prev.platform, search: prev.search, preset: p.id === "all" ? "" : p.id, ...p.patch }));
    setSort(p.sort);
  };
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const fetchGenRef = useRef(0);
  const batchIndexRef = useRef(0);
  const poolHasMoreRef = useRef(true);
  const scrolledRef = useRef(false);
  const loadingNextRef = useRef(false);
  const loadMoreArmedRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const discoveryUsedRef = useRef(0);
  const freeGateLockedRef = useRef(plan === "free" && readFreeDiscoveryGateLock());
  const gatedTeaserRef = useRef<FeedCreator[]>([]);
  const SCROLL_ARM_PX = 80;
  const BOTTOM_RESET_PX = 48;

  const allNichesBrowse = useMemo(() => isAllNichesBrowse(filters), [filters]);
  const planResultCap = resultsPerSearch;
  const batchSize = allNichesBrowse ? ALL_NICHES_CHUNK : (planResultCap ?? SCALE_PAGE_LIMIT);

  const lockFreeDiscoveryGate = useCallback(() => {
    if (plan !== "free") return;
    freeGateLockedRef.current = true;
    writeFreeDiscoveryGateLock(true);
  }, [plan]);

  const unlockFreeDiscoveryGate = useCallback(() => {
    freeGateLockedRef.current = false;
    writeFreeDiscoveryGateLock(false);
  }, []);

  useEffect(() => {
    const q = filters.search.trim();
    const timer = setTimeout(() => setDebouncedSearch(q), 350);
    return () => clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    if (plan === "free") {
      freeGateLockedRef.current = readFreeDiscoveryGateLock();
      if (freeGateLockedRef.current) {
        setShowDiscoveryGate(true);
        setHasMore(false);
      }
      return;
    }
    unlockFreeDiscoveryGate();
  }, [plan, unlockFreeDiscoveryGate]);

  const apiParams = useMemo(() => toParams(filters, debouncedSearch, sort), [filters, debouncedSearch, sort]);
  const isGlobalSearch = debouncedSearch.trim().replace(/^@/, "").length >= 2;
  const shouldShowAllNichesTeaser = !isPaid && allNichesBrowse;

  const discoverAndFetch = useCallback(async (
    batchIndex: number,
    mode: "replace" | "append" = "replace",
  ): Promise<{ count: number; blocked?: boolean }> => {
    const gen = fetchGenRef.current;
    if (plan === "free" && isGlobalSearch) {
      setGatePaywall(true);
      setShowDiscoveryGate(true);
      setHasMore(false);
      return { count: 0, blocked: true };
    }
    const countsTowardQuota = hasDiscoveryCap && discoveryLimit != null && !allNichesBrowse && !isGlobalSearch;
    const shouldSyncQuota = hasDiscoveryCap && discoveryLimit != null;
    let quotaBlocked = false;
    let quotaUsedBefore = 0;
    const gateLockedTeaser = plan === "free" && freeGateLockedRef.current;

    if (gateLockedTeaser) {
      setShowDiscoveryGate(true);
      setHasMore(false);
    }

    const off = batchIndex * batchSize;
    const qs = new URLSearchParams({ ...apiParams, offset: String(off), limit: String(batchSize) }).toString();
    if (shouldSyncQuota && workspaceUserId) {
      const { supabase } = await import("@/lib/supabase");
      if (!supabase) {
        /* quota is optional; the catalog still loads */
      } else {
      const quota = await syncDiscoveryQuota(supabase, workspaceUserId, plan);
      if (!quota) return { count: 0 };
      setDiscoveriesResetAt(quota.resetAt);
      discoveryUsedRef.current = Math.max(discoveryUsedRef.current, quota.used ?? 0);
      setDiscoveriesUsed(discoveryUsedRef.current);
      if (quota.blocked) {
        lockFreeDiscoveryGate();
        setShowDiscoveryGate(true);
        setHasMore(false);
        quotaBlocked = true;
      } else {
        quotaUsedBefore = quota.used ?? 0;
      }
      }
    }

    const d = await fetch(`/api/catalog?${qs}`).then((r) => r.json());
    if (gen !== fetchGenRef.current) return { count: 0 };
    if (d.error) {
      // A failed catalog call returns no creators: keep what is already listed and never spend quota on it.
      setError(d.error);
      setHasMore(false);
      if (mode !== "append") {
        setCreators([]);
        setCatalogTotal(null);
      }
      return { count: 0 };
    }
    if (mode !== "append") setCatalogTotal(typeof d.total === "number" ? d.total : null);

    const list: FeedCreator[] = Array.isArray(d.creators) ? d.creators : [];
    const rows = list;
    const apiHasMore = !!d.hasMore;
    poolHasMoreRef.current = apiHasMore;
    setError(d.error || null);
    const seen = new Set<string>();
    const deduped = rows.filter((c) => {
      if (!c.username || seen.has(c.username)) return false;
      seen.add(c.username);
      return true;
    });

    const gateTeaserOnly = gateLockedTeaser || quotaBlocked;
    if (mode === "append" && !gateTeaserOnly) {
      setCreators((prev) => {
        const mergedSeen = new Set(prev.map((c) => c.username));
        const unique = deduped.filter((c) => {
          if (!c.username || mergedSeen.has(c.username)) return false;
          mergedSeen.add(c.username);
          return true;
        });
        return [...prev, ...unique];
      });
    } else {
      setCreators(deduped);
    }
    if (gateTeaserOnly) gatedTeaserRef.current = deduped;

    if (gateTeaserOnly) {
      setShowDiscoveryGate(true);
      setHasMore(false);
      return { count: deduped.length, blocked: true };
    }

    if (countsTowardQuota && !quotaBlocked) {
      const { supabase } = await import("@/lib/supabase");
      if (!supabase) return { count: deduped.length };
      if (!workspaceUserId) return { count: deduped.length };
      const currentUsed = Math.max(quotaUsedBefore, discoveryUsedRef.current);
      const next = await incrementDiscoveryQuota(supabase, workspaceUserId, plan, currentUsed);
      discoveryUsedRef.current = next;
      setDiscoveriesUsed(next);
      const exhausted = next >= discoveryLimit!;
      if (exhausted) lockFreeDiscoveryGate();
      setShowDiscoveryGate(exhausted);
      setHasMore(apiHasMore && !exhausted);
    } else if (quotaBlocked) {
      setHasMore(false);
    } else {
      setHasMore(poolHasMoreRef.current);
    }

    return { count: deduped.length, blocked: quotaBlocked };
  }, [apiParams, plan, discoveryLimit, hasDiscoveryCap, batchSize, allNichesBrowse, isGlobalSearch, lockFreeDiscoveryGate, workspaceUserId]);

  useEffect(() => {
    fetchGenRef.current += 1;
    batchIndexRef.current = 0;
    poolHasMoreRef.current = true;
    let cancelled = false;
    const gated = plan === "free" && freeGateLockedRef.current;
    setLoading(true);
    setHasMore(!gated);
    setError(null);
    if (gated) {
      setShowDiscoveryGate(true);
    }
    scrolledRef.current = false;
    loadMoreArmedRef.current = false;
    lastScrollTopRef.current = 0;
    const el = isMobile ? scrollRootRef.current : mainRef.current;
    if (el) el.scrollTo({ top: 0, behavior: "auto" });
    discoverAndFetch(0, "replace")
      .catch(() => { if (!cancelled) setError("network"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [discoverAndFetch, isMobile, plan, retryKey]);

  useEffect(() => {
    if (!hasDiscoveryCap) return;
    if (plan === "free" && freeGateLockedRef.current) {
      setShowDiscoveryGate(true);
      setHasMore(false);
      return;
    }
    void (async () => {
      const { supabase } = await import("@/lib/supabase");
      if (!supabase) return;
      if (!workspaceUserId) return;
      const quota = await syncDiscoveryQuota(supabase, workspaceUserId, plan);
      if (!quota) return;
      setDiscoveriesResetAt(quota.resetAt);
      discoveryUsedRef.current = quota.used ?? 0;
      setDiscoveriesUsed(quota.used ?? 0);
      if (plan === "free" && quota.blocked) lockFreeDiscoveryGate();
      setShowDiscoveryGate(quota.blocked);
      if (quota.blocked) setHasMore(false);
    })();
  }, [plan, hasDiscoveryCap, filters, lockFreeDiscoveryGate, workspaceUserId]);

  useEffect(() => {
    if (!hasDiscoveryCap || !showDiscoveryGate) return;
    const tick = async () => {
      const ms = discoveryResetRemainingMs(discoveriesResetAt, plan);
      if (ms == null || ms > 0) return;
      const { supabase } = await import("@/lib/supabase");
      if (!supabase) return;
      if (!workspaceUserId) return;
      const quota = await syncDiscoveryQuota(supabase, workspaceUserId, plan);
      if (quota) {
        setDiscoveriesResetAt(quota.resetAt);
        discoveryUsedRef.current = quota.used ?? 0;
        setDiscoveriesUsed(quota.used ?? 0);
        setShowDiscoveryGate(quota.blocked);
        if (quota.blocked) setHasMore(false);
      }
    };
    void tick();
    const id = setInterval(() => { void tick(); }, 60_000);
    return () => clearInterval(id);
  }, [showDiscoveryGate, discoveriesResetAt, plan, hasDiscoveryCap, workspaceUserId]);

  useEffect(() => {
    const loadProduct = async () => {
      const { supabase } = await import("@/lib/supabase");
      if (!supabase) return;
      if (!workspaceUserId) return;
      const { data } = await supabase.from("profiles").select("business_name").eq("id", workspaceUserId).maybeSingle();
      if (data?.business_name) setProduct(data.business_name);
    };
    void loadProduct();
  }, [workspaceUserId]);

  const loadNextBatch = useCallback(async () => {
    if (loadingNextRef.current || loadingMore || loading) return;
    if (showDiscoveryGate) return;
    if (!hasMore) return;

    loadingNextRef.current = true;
    loadMoreArmedRef.current = false;
    setLoadingMore(true);
    try {
      let nextBatch = batchIndexRef.current + 1;
      const result = await discoverAndFetch(nextBatch, "append");
      if (result.blocked) return;
      if (result.count === 0) {
        setHasMore(false);
        return;
      }
      batchIndexRef.current = nextBatch;
    } catch {
      setError("network");
    } finally {
      loadingNextRef.current = false;
      setLoadingMore(false);
    }
  }, [loadingMore, loading, hasMore, showDiscoveryGate, hasDiscoveryCap, allNichesBrowse, discoverAndFetch, isMobile]);

  useEffect(() => {
    if (loading || loadingMore) return;
    const el = isMobile ? scrollRootRef.current : mainRef.current;
    if (!el) return;
    const onScroll = () => {
      const isScrollingDown = el.scrollTop > lastScrollTopRef.current;
      lastScrollTopRef.current = el.scrollTop;

      if (el.scrollTop > SCROLL_ARM_PX) scrolledRef.current = true;
      if (!scrolledRef.current) return;

      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom > BOTTOM_RESET_PX) {
        loadMoreArmedRef.current = true;
      }

      if (!isScrollingDown) return;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [loading, loadingMore, loadNextBatch, isMobile]);

  useEffect(() => {
    if (loading || loadingMore || !hasMore || showDiscoveryGate) return;
    const root = isMobile ? scrollRootRef.current : mainRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (!root || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (entry.intersectionRatio < 1) return;
        if (!scrolledRef.current || !loadMoreArmedRef.current) return;
        loadMoreArmedRef.current = false;
        void loadNextBatch();
      },
      {
        root,
        threshold: 1,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, loadingMore, hasMore, showDiscoveryGate, loadNextBatch, isMobile, creators.length]);

  const filtered = useMemo(() => {
    const clientFiltered = applyClientFilters(creators, filters, savedUsernames, hiddenUsernames);
    const base =
      showDiscoveryGate && clientFiltered.length === 0
        ? (creators.length > 0 ? creators : gatedTeaserRef.current)
        : clientFiltered;
    // Hand-picked creators lead the default browse only; other sorts are pure rankings (as on the server).
    const curatedFirst = sort === "followers";
    const curated = curatedFirst ? base.filter((c) => isCuratedFeedCreator(c)) : [];
    const regular = curatedFirst ? base.filter((c) => !isCuratedFeedCreator(c)) : base;
    const shouldPreserveBatchOrder = !isPaid && Boolean(filters.niche.trim()) && !isGlobalSearch;
    const growthRank = (c: FeedCreator) => c.growth?.growthScore ?? Number.NEGATIVE_INFINITY;
    const sortedRegular = shouldPreserveBatchOrder
      ? regular
      : sort === "growth"
        ? [...regular].sort((a, b) => growthRank(b) - growthRank(a) || (b.viewsPerFollower ?? 0) - (a.viewsPerFollower ?? 0))
        : sort === "viral"
          ? [...regular].sort((a, b) => (b.videoStats?.maxViews ?? -1) - (a.videoStats?.maxViews ?? -1) || b.avgViews - a.avgViews)
          : sort === "engagement"
        ? [...regular].sort((a, b) => b.engagementRate - a.engagementRate)
        : sort === "views"
          ? [...regular].sort((a, b) => b.avgViews - a.avgViews)
          : sort === "reach"
            ? [...regular].sort((a, b) => (b.viewsPerFollower ?? 0) - (a.viewsPerFollower ?? 0))
            : sort === "recent"
              ? [...regular].sort((a, b) => (b.lastPostAt ?? "").localeCompare(a.lastPostAt ?? ""))
              : [...regular].sort((a, b) => b.followersCount - a.followersCount);
    const seen = new Set<string>();
    const out: FeedCreator[] = [];
    for (const c of [...curated, ...sortedRegular]) {
      if (!c.username || seen.has(c.username)) continue;
      seen.add(c.username);
      out.push(c);
    }
    return out;
  }, [creators, filters, savedUsernames, hiddenUsernames, sort, isPaid, isGlobalSearch, showDiscoveryGate]);
  const visibleCreators = filtered;
  const discoveryGateActive = showDiscoveryGate;
  const hasProgressiveFreeTeaser = !isPaid && (shouldShowAllNichesTeaser || discoveryGateActive);
  const items = hasProgressiveFreeTeaser ? visibleCreators.slice(0, FREE_VISIBLE + 2) : visibleCreators;
  const hasMoreFree = hasProgressiveFreeTeaser && visibleCreators.length > FREE_VISIBLE;
  const feedGateActive = hasProgressiveFreeTeaser && (hasMoreFree || discoveryGateActive);
  const searchQuery = debouncedSearch.trim();
  const isCreatorSearchMiss =
    !loading && !error && !discoveryGateActive && searchQuery.replace(/^@/, "").length >= 2 && filtered.length === 0;

  useEffect(() => {
    if (items.length === 0) return;
    prefetchCreatorMedia(
      items.slice(0, 48).map((c) => ({
        username: c.username,
        avatarUrl: c.avatarUrl,
        topVideos: c.topVideos,
        videoThumbnails: c.videoThumbnails,
      })),
    );
  }, [items]);

  const refreshWorkspace = useCallback(async () => {
    const [rows, f] = await Promise.all([listSaved(), listFolders()]);
    setSavedUsernames(new Set(rows.map((r) => r.creator_username)));
    setFolders(f.folders);
    setFolderItems(f.items);
  }, []);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  useEffect(() => {
    if (!isCreatorSearchMiss) return;
    const timer = setTimeout(() => {
      void logCreatorLookupRequest(searchQuery);
    }, 700);
    return () => clearTimeout(timer);
  }, [isCreatorSearchMiss, searchQuery]);

  const folderIdsFor = useCallback(
    (username: string) => new Set(folderItems.filter((i) => i.creator_username === username).map((i) => i.folder_id)),
    [folderItems]
  );

  const onSavedOptimistic = useCallback((username: string, saved: boolean) => {
    setSavedUsernames((prev) => {
      const next = new Set(prev);
      if (saved) next.add(username);
      else next.delete(username);
      return next;
    });
  }, []);

  const onFoldersOptimistic = useCallback((username: string, folderId: string, inFolder: boolean) => {
    setFolderItems((items) => {
      if (inFolder) {
        if (items.some((i) => i.folder_id === folderId && i.creator_username === username)) return items;
        return [...items, { folder_id: folderId, creator_username: username }];
      }
      return items.filter((i) => !(i.folder_id === folderId && i.creator_username === username));
    });
  }, []);

  return (
    <div
      ref={scrollRootRef}
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        height: "100%",
        minHeight: 0,
        overflow: isMobile ? "auto" : "hidden",
        WebkitOverflowScrolling: "touch",
        background: "var(--ws-bg)",
        alignItems: "stretch",
      }}
    >
      <div
        ref={mainRef}
        style={{
          display: profileHandle ? "none" : undefined,
          flex: isMobile ? "0 0 auto" : 1,
          minWidth: 0,
          minHeight: isMobile ? undefined : 0,
          height: isMobile ? "auto" : "100%",
          width: isMobile ? "100%" : undefined,
          overflow: isMobile ? "visible" : "auto",
        }}
      >
        <CatalogFilterBar
          filters={filters}
          sort={sort}
          mode={mode}
          count={filtered.length}
          // Client-only filters (saved / hidden) aren't in the database count.
          total={filters.hideSaved || filters.showHidden ? null : catalogTotal}
          loading={loading}
          isPaid={isPaid}
          isFree={plan === "free"}
          isMobile={isMobile}
          onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
          onSort={(next) => {
            setSort(next);
            setFilters((prev) => ({ ...prev, preset: "" }));
          }}
          onMode={setMode}
          onPreset={applyPreset}
          onReset={() => setFilters((prev) => ({ ...EMPTY_FILTERS, platform: prev.platform, search: prev.search }))}
          onLocked={() => setFilterPaywall(true)}
          onOpenLists={() => navigate({ view: "my-creators" })}
          onOpenOutreach={() => navigate({ view: "outreach" })}
          videoFilters={videoFilters}
          videoPreset={videoPreset}
          onVideoChange={onVideoChange}
          videoCount={videoCount}
          videoLoading={videoLoading}
        />
        <div style={{ padding: isMobile ? "12px 16px 32px 52px" : "14px 28px 40px" }}>

          {mode === "creators" && error && (
            <div className="gv-alert" role="alert" style={{ marginBottom: 12 }}>
              <div>
                <strong>{t.catalogDownTitle}</strong>
                <p>{error === "network" ? t.networkDownBody : t.catalogDownBody}</p>
              </div>
              <button type="button" className="sample-clear" onClick={() => setRetryKey((k) => k + 1)}>
                {t.retry}
              </button>
            </div>
          )}
          {mode === "creators" && loading && !discoveryGateActive && items.length === 0 && !error ? (
            <div className="df-skeleton" aria-hidden>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="df-skeleton__row" style={{ animationDelay: `${i * 0.08}s` }}>
                  <span className="df-skeleton__avatar" />
                  <span className="df-skeleton__lines">
                    <i style={{ width: `${48 + ((i * 17) % 30)}%` }} />
                    <i style={{ width: `${28 + ((i * 11) % 20)}%` }} />
                  </span>
                  <span className="df-skeleton__stat" />
                  <span className="df-skeleton__stat" />
                </div>
              ))}
            </div>
          ) : null}
          {mode === "creators" && !loading && !error && isCreatorSearchMiss && (
            <div
              style={{
                background: "var(--ws-surface)",
                border: "1px solid var(--ws-border)",
                borderRadius: 16,
                padding: "40px 32px",
                textAlign: "center",
                maxWidth: 480,
                margin: "0 auto 16px",
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "var(--ws-bg)",
                  color: "var(--ws-text-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                  fontSize: 22,
                }}
                aria-hidden
              >
                @
              </div>
              <p style={{ fontSize: 16, fontWeight: 600, color: "var(--ws-text)", margin: "0 0 8px", letterSpacing: "-0.02em", lineHeight: 1.4 }}>
                {t.creatorNotInDatabaseTitle}
              </p>
              <p style={{ fontSize: 13, color: "var(--ws-text-muted)", margin: "0 0 12px", lineHeight: 1.55 }}>
                {t.creatorNotInDatabaseBody}
              </p>
              <p style={{ fontSize: 12, color: "var(--ws-text-dim)", margin: 0, letterSpacing: "-0.01em" }}>
                {t.creatorNotInDatabaseQuery(searchQuery)}
              </p>
            </div>
          )}
          {mode === "creators" && !loading && !error && filtered.length === 0 && !discoveryGateActive && !isCreatorSearchMiss && (
            <div className="sp-empty">
              <div className="df-empty__orbit" aria-hidden>
                <span /><span /><span />
              </div>
              <p>
                <strong style={{ display: "block", color: "var(--ws-text)", marginBottom: 4 }}>{t.noCreators}</strong>
                {t.noCreatorsHint}
              </p>
              <div style={{ maxWidth: 360, margin: "8px auto 0", textAlign: "left" }}>
                <NicheRequestSection lang={lang} product={product} />
              </div>
            </div>
          )}

          {mode === "videos" ? (
            <VideoLibrary
              filters={videoFilters}
              search={filters.search}
              platform={filters.platform}
              onCount={onVideoCount}
              onOpenCreator={openCreatorByHandle}
            />
          ) : null}
          <div
            className="cf-results"
            style={{
              position: "relative",
              minHeight: feedGateActive && items.length === 0 ? 320 : undefined,
              display: mode === "videos" || (items.length === 0 && !feedGateActive) ? "none" : undefined,
            }}
          >
            {items.length > 0 ? (
              <div className="cf-head" aria-hidden>
                <span>{lang === "fr" ? "Créateur" : "Creator"}</span>
                <span>{lang === "fr" ? "Meilleures vidéos" : "Top videos"}</span>
                <span>Niche</span>
                <span>{lang === "fr" ? "Abonnés" : "Followers"}</span>
                <span>{lang === "fr" ? "Vues moy." : "Avg views"}</span>
                <span>Interactions</span>
                <span />
              </div>
            ) : null}
            <div className="cf-list">
              {items.map((c, i) => {
                const rowStyle = feedRowGateStyle(i, items.length, feedGateActive);
                return (
                  <div key={c.username} aria-hidden={rowStyle ? true : undefined} style={rowStyle}>
                    <FeedListRow
                      lang={lang}
                      creator={c}
                      saved={savedUsernames.has(c.username)}
                      inFolders={folderIdsFor(c.username)}
                      folders={folders}
                      isPaid={isPaid}
                      index={i}
                      avatarPriority={i < 10}
                      dimmed={filters.showHidden || hiddenUsernames.has(c.username.toLowerCase())}
                      onOpen={() => openCreator(c)}
                      onWorkspaceChange={() => void refreshWorkspace()}
                      onSavedOptimistic={onSavedOptimistic}
                      onFoldersOptimistic={onFoldersOptimistic}
                      onUpgrade={onUpgrade}
                    />
                  </div>
                );
              })}
              {!feedGateActive && hasMore && (
                <div
                  ref={loadMoreSentinelRef}
                  aria-hidden="true"
                  style={{ height: 1, width: "100%" }}
                />
              )}
            </div>

            {feedGateActive && (
              <FeedGateOverlay lang={lang} onUpgrade={() => setGatePaywall(true)} />
            )}
          </div>

          {loadingMore && (
            <div style={{ textAlign: "center", padding: "16px 0", fontSize: 13, color: "var(--ws-text-dim)" }}>
              {t.loading}
            </div>
          )}
        </div>
      </div>

      {profileHandle ? (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <CreatorProfilePage
            key={profileHandle}
            username={profileHandle}
            preview={selected && selected.username.toLowerCase() === profileHandle.toLowerCase() ? selected : null}
            onBack={goBack}
            onOpenCreator={openCreator}
            onReachOut={onReachOut}
            saveSlot={(c) => (
              <SaveCreatorDropdown
                lang={lang}
                creator={c}
                saved={savedUsernames.has(c.username)}
                inFolders={folderIdsFor(c.username)}
                folders={folders}
                isPaid={isPaid}
                onUpgrade={onUpgrade}
                onWorkspaceChange={() => void refreshWorkspace()}
                onSavedOptimistic={onSavedOptimistic}
                onFoldersOptimistic={onFoldersOptimistic}
              />
            )}
          />
        </div>
      ) : null}

      {filterPaywall && (
        <UpgradeModal
          lang={lang}
          currentPlan={plan}
          title={t.filterPaywallTitle}
          description={t.filterPaywallBody}
          onClose={() => setFilterPaywall(false)}
        />
      )}
      {gatePaywall && (
        <UpgradeModal
          lang={lang}
          currentPlan={plan}
          title={t.paywallTitle}
          description={t.paywallBody}
          onClose={() => setGatePaywall(false)}
        />
      )}
    </div>
  );
}
