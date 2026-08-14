"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlanTier } from "@/lib/plan-limits";
import {
  getDailyDiscoveryLimit,
  getResultsPerSearchLimit,
  hasDiscoveryDailyCap,
  FREE_LIFETIME_DISCOVERIES,
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
import { CreatorDetailDrawer } from "@/app/dashboard/CreatorDetailDrawer";
import { CreatorAvatar } from "@/app/dashboard/CreatorAvatar";
import { listSaved, listFolders, type FolderRow, type FolderItem } from "@/lib/workspace-client";
import { SaveCreatorDropdown } from "@/app/dashboard/SaveCreatorDropdown";
import { useLang } from "@/lib/useLang";
import { discoveryCopy } from "@/lib/discovery-copy";
import { logCreatorLookupRequest } from "@/lib/creator-lookup-requests";
import { submitNicheRequest } from "@/lib/niche-requests";
import { prefetchCreatorMedia } from "@/lib/avatar-url-cache";
import { prefetchCreatorDetail } from "@/lib/creator-detail-cache";
import {
  HIDDEN_CREATORS_EVENT,
  loadHiddenCreators,
} from "@/lib/hidden-creators-storage";
import { useDashboardNavigation } from "./DashboardNavigationProvider";

function fmt(n: number): string {
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

const filterSelectStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  background: "var(--ws-input)",
  border: "1px solid var(--ws-border)",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: "inherit",
  color: "var(--ws-text)",
  cursor: "pointer",
  letterSpacing: "-0.01em",
  boxSizing: "border-box",
};

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
};

/** Catalogue sans niche choisie : pas de cap plan ni quota decouverte. */
function isAllNichesBrowse(f: FilterState): boolean {
  return !f.niche;
}

/** Performance / search filters (not niche or geo). Triggers refresh + discovery quota. */
function hasActiveSearchFilters(f: FilterState): boolean {
  if (f.followersRange || f.engagement || f.viewsFrom || f.viewsTo || f.age) return true;
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

const VIEWS_VAL: Record<string, number> = {
  "10k": 10_000,
  "50k": 50_000,
  "100k": 100_000,
  "500k": 500_000,
  "1m": 1_000_000,
};

function toParams(f: FilterState, debouncedSearch = ""): Record<string, string> {
  const q = debouncedSearch.trim().replace(/^@/, "");
  if (q.length >= 2) {
    return { search: q };
  }

  const p: Record<string, string> = {};
  if (f.niche) p.niche = f.niche;
  if (f.platform && f.platform !== "tiktok") p.platform = f.platform;
  const followers = followerRangeBounds(f.followersRange);
  if (followers.min != null) p.minFollowers = String(followers.min);
  if (followers.max != null) p.maxFollowers = String(followers.max);
  if (f.engagement === "3+") p.minEngagement = "3";
  else if (f.engagement === "12+") p.minEngagement = "12";
  else if (f.engagement === "6+") p.minEngagement = "6";
  else if (f.engagement === "9+") p.minEngagement = "9";
  const C: Record<string, string> = {
    FR: "FR", US: "US", GB: "GB", DE: "DE", BR: "BR", ES: "ES", IT: "IT", PT: "PT", CA: "CA",
  };
  if (C[f.country]) p.country = C[f.country];
  const L: Record<string, string> = { fr: "fr", en: "en", es: "es", de: "de", pt: "pt", it: "it" };
  if (L[f.language]) p.language = L[f.language];
  return p;
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

    if (f.engagement === "3+") out = out.filter((c) => c.engagementRate >= 3);
    else if (f.engagement === "6+") out = out.filter((c) => c.engagementRate >= 6);
    else if (f.engagement === "9+") out = out.filter((c) => c.engagementRate >= 9);
    else if (f.engagement === "12+") out = out.filter((c) => c.engagementRate >= 12);

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
    if (f.hideSaved) out = out.filter((c) => !saved.has(c.username));
    if (f.showHidden) {
      out = out.filter((c) => hidden.has(c.username.toLowerCase()));
    } else {
      out = out.filter((c) => !hidden.has(c.username.toLowerCase()));
    }
    if (f.viewsFrom && VIEWS_VAL[f.viewsFrom]) out = out.filter((c) => c.avgViews >= VIEWS_VAL[f.viewsFrom]);
    if (f.viewsTo && VIEWS_VAL[f.viewsTo]) out = out.filter((c) => c.avgViews <= VIEWS_VAL[f.viewsTo]);
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

function FilterSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  onLocked,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
  onLocked?: () => void;
}) {
  const guard = disabled ? (e: React.SyntheticEvent) => { e.preventDefault(); onLocked?.(); } : undefined;
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--ws-text-dim)", marginBottom: 4, letterSpacing: "-0.01em" }}>{label}</div>
      <select
        value={value}
        onChange={(e) => {
          if (disabled) { onLocked?.(); return; }
          onChange(e.target.value);
        }}
        onMouseDown={guard}
        onKeyDown={guard}
        style={{ ...filterSelectStyle, opacity: disabled ? 0.65 : 1 }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function FilterToggle({
  label,
  checked,
  onChange,
  disabled,
  onLocked,
  onLabel,
  offLabel,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  onLocked?: () => void;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--ws-text-dim)", marginBottom: 4, letterSpacing: "-0.01em" }}>{label}</div>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          ...filterSelectStyle,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.65 : 1,
        }}
        onClick={(e) => {
          if (disabled) { e.preventDefault(); onLocked?.(); }
        }}
      >
        <span style={{ fontSize: 13, color: "var(--ws-text)", flex: 1, marginRight: 8 }}>{checked ? onLabel : offLabel}</span>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => {
            if (disabled) { onLocked?.(); return; }
            onChange(e.target.checked);
          }}
          style={{ width: 15, height: 15, cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0, marginLeft: 4 }}
        />
      </label>
    </div>
  );
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

function FilterSidebar({
  lang,
  isPaid,
  isFree,
  filters,
  product,
  onProductChange,
  onProductBlur,
  onChange,
  onLocked,
  isMobile,
}: {
  lang: "en" | "fr";
  isPaid: boolean;
  isFree: boolean;
  filters: FilterState;
  product: string;
  onProductChange: (v: string) => void;
  onProductBlur: () => void;
  onChange: (patch: Partial<FilterState>) => void;
  onLocked: () => void;
  isMobile?: boolean;
}) {
  const t = discoveryCopy(lang);
  const searchLocked = !isPaid;
  const [platformNotice, setPlatformNotice] = useState<string | null>(null);
  const [platformNoticeBlocked, setPlatformNoticeBlocked] = useState(false);
  const platformNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (platformNoticeTimerRef.current) clearTimeout(platformNoticeTimerRef.current);
    };
  }, []);

  const showPlatformComingSoon = () => {
    setPlatformNoticeBlocked(false);
    setPlatformNotice(t.morePlatformsComing);
    if (platformNoticeTimerRef.current) clearTimeout(platformNoticeTimerRef.current);
    platformNoticeTimerRef.current = setTimeout(() => setPlatformNotice(null), 4000);
  };

  const showPlatformFreeBlocked = (label: string) => {
    setPlatformNoticeBlocked(true);
    setPlatformNotice(t.platformFreeBlocked(label));
    if (platformNoticeTimerRef.current) clearTimeout(platformNoticeTimerRef.current);
    platformNoticeTimerRef.current = setTimeout(() => setPlatformNotice(null), 5000);
  };

  const platforms = [
    { id: "instagram", label: "Instagram" },
    { id: "tiktok", label: "TikTok" },
    { id: "youtube", label: "YouTube" },
  ] as const;

  return (
    <aside
      style={{
        width: isMobile ? "100%" : 300,
        flexShrink: 0,
        alignSelf: "stretch",
        background: "var(--ws-surface)",
        borderRight: isMobile ? "none" : "1px solid var(--ws-border)",
        borderBottom: isMobile ? "1px solid var(--ws-border)" : "none",
        height: isMobile ? "auto" : "100%",
        maxHeight: isMobile ? undefined : "100%",
        minHeight: isMobile ? undefined : 0,
        overflowY: isMobile ? "visible" : "auto",
        overflowX: "hidden",
        padding: isMobile ? "12px 16px 20px 52px" : "24px 20px 48px",
        boxSizing: "border-box",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.04em", margin: "0 0 4px" }}>{t.findItTitle}</h1>
      <p style={{ fontSize: 12, color: "var(--ws-text-dim)", margin: "0 0 20px", lineHeight: 1.45, letterSpacing: "-0.01em" }}>
        {t.findItSubtitle}
      </p>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--ws-text-dim)", marginBottom: 4, letterSpacing: "-0.01em" }}>{t.yourProduct}</div>
        <input
          type="text"
          value={product}
          onChange={(e) => onProductChange(e.target.value)}
          onBlur={onProductBlur}
          placeholder={t.productPlaceholder}
          style={inputStyle}
        />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {platforms.map((p) => {
          const active = filters.platform === p.id;
          const paidOnly = p.id === "instagram" || p.id === "youtube";
          const freeBlocked = isFree && paidOnly;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                if (freeBlocked) {
                  showPlatformFreeBlocked(p.label);
                  return;
                }
                if (paidOnly) {
                  showPlatformComingSoon();
                  return;
                }
                setPlatformNotice(null);
                onChange({ platform: p.id });
              }}
              style={{
                padding: "7px 14px",
                borderRadius: 999,
                border: active ? "1px solid var(--ws-btn)" : "1px solid var(--ws-border)",
                background: active ? "var(--ws-btn)" : "var(--ws-surface)",
                color: active ? "var(--ws-btn-text)" : freeBlocked ? "var(--ws-text-dim)" : "var(--ws-text)",
                fontSize: 12,
                fontWeight: 500,
                fontFamily: "inherit",
                cursor: freeBlocked ? "not-allowed" : "pointer",
                opacity: freeBlocked ? 0.72 : 1,
                letterSpacing: "-0.01em",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {freeBlocked ? <Lock size={11} /> : null}
              {p.label}
            </button>
          );
        })}
      </div>
      {platformNotice && (
        <div
          style={{
            marginTop: -8,
            marginBottom: 16,
            padding: "4px 0",
            fontSize: 12,
            color: platformNoticeBlocked ? "#EAB308" : "var(--ws-accent)",
            letterSpacing: "-0.01em",
            lineHeight: 1.45,
          }}
        >
          {platformNotice}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--ws-text-dim)", marginBottom: 4, letterSpacing: "-0.01em" }}>{t.search}</div>
        <div style={{ position: "relative" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.45 }}>
            <circle cx="11" cy="11" r="7" stroke="var(--ws-text)" strokeWidth="1.8" />
            <path d="M21 21l-4.35-4.35" stroke="var(--ws-text)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={filters.search}
            readOnly={searchLocked}
            onChange={(e) => {
              if (searchLocked) { onLocked(); return; }
              onChange({ search: e.target.value });
            }}
            onClick={() => { if (searchLocked) onLocked(); }}
            placeholder={t.searchPlaceholder}
            style={{ ...inputStyle, paddingLeft: 34, cursor: searchLocked ? "not-allowed" : "text", opacity: searchLocked ? 0.65 : 1 }}
          />
        </div>
      </div>

      <NicheRequestSection lang={lang} product={product} />

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        <FilterToggle
          label={t.emailAvailable}
          checked={filters.hasEmail}
          onChange={(v) => onChange({ hasEmail: v })}
          onLabel={t.required}
          offLabel={t.all}
        />
        <FilterToggle
          label={t.hideSaved}
          checked={filters.hideSaved}
          onChange={(v) => onChange({ hideSaved: v })}
          onLabel={t.enabled}
          offLabel={t.disabled}
        />
        <FilterToggle
          label={t.hiddenCreators}
          checked={filters.showHidden}
          onChange={(v) => onChange({ showHidden: v })}
          onLabel={t.enabled}
          offLabel={t.disabled}
        />
      </div>

      <SectionTitle>{t.demographics}</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        <FilterSelect
          label={t.niche}
          value={filters.niche}
          onChange={(v) => onChange({ niche: v })}
          options={[
            { value: "", label: t.allNiches },
            { value: "lifestyle", label: t.nicheLifestyle },
            { value: "fitness", label: "Fitness" },
            { value: "food", label: "Food" },
            { value: "travel", label: t.nicheTravel },
            { value: "fashion", label: t.nicheFashion },
            { value: "beauty", label: t.nicheBeauty },
            { value: "tech", label: "Tech" },
            { value: "e-commerce", label: t.nicheEcom },
          ]}
        />
        <FilterSelect
          label={t.location}
          value={filters.country}
          onChange={(v) => {
            const language = languageFromCountry(v);
            onChange(language != null ? { country: v, language } : { country: v });
          }}
          options={[
            { value: "", label: t.all },
            { value: "FR", label: t.france },
            { value: "US", label: t.unitedStates },
            { value: "ES", label: t.spain },
            { value: "IT", label: t.italy },
            { value: "DE", label: t.germany },
            { value: "PT", label: t.portugal },
          ]}
        />
        <FilterSelect
          label={t.language}
          value={filters.language}
          onChange={(v) => onChange({ language: v })}
          options={[
            { value: "", label: t.allLanguages },
            { value: "fr", label: t.french },
            { value: "en", label: t.english },
            { value: "es", label: t.spanish },
            { value: "it", label: t.italian },
            { value: "de", label: t.german },
            { value: "pt", label: t.portuguese },
          ]}
        />
      </div>

      <SectionTitle>{t.performance}</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <FilterSelect
          label={t.followers}
          value={filters.followersRange}
          onChange={(v) => onChange({ followersRange: v })}
          options={[
            { value: "", label: t.all },
            { value: "1-10k", label: "1–10K" },
            { value: "10-100k", label: "10–100K" },
            { value: "100-500k", label: "100–500K" },
            { value: "500k+", label: "500K+" },
          ]}
        />
        <FilterSelect
          label={t.engagementRate}
          value={filters.engagement}
          onChange={(v) => onChange({ engagement: v })}
          options={[
            { value: "", label: t.all },
            { value: "3+", label: "≥ 3%" },
            { value: "6+", label: "≥ 6%" },
            { value: "9+", label: "≥ 9%" },
            { value: "12+", label: "≥ 12%" },
          ]}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <FilterSelect
            label={t.viewsFrom}
            value={filters.viewsFrom}
            onChange={(v) => onChange({ viewsFrom: v })}
            options={[
              { value: "", label: t.all },
              { value: "10k", label: "10K" },
              { value: "50k", label: "50K" },
              { value: "100k", label: "100K" },
              { value: "500k", label: "500K" },
            ]}
          />
          <FilterSelect
            label={t.viewsTo}
            value={filters.viewsTo}
            onChange={(v) => onChange({ viewsTo: v })}
            options={[
              { value: "", label: t.all },
              { value: "50k", label: "50K" },
              { value: "100k", label: "100K" },
              { value: "500k", label: "500K" },
              { value: "1m", label: "1M+" },
            ]}
          />
        </div>
      </div>
    </aside>
  );
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
  compact,
  avatarPriority,
  dimmed,
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
  compact?: boolean;
  avatarPriority?: boolean;
  dimmed?: boolean;
}) {
  const c = creator;
  const t = discoveryCopy(lang);
  const engagement = estimateEngagement(c);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: compact ? 10 : 16,
        padding: compact ? "12px 14px" : "14px 20px",
        background: "var(--ws-surface)",
        border: "1px solid var(--ws-border)",
        borderRadius: 12,
        transition: "box-shadow 0.15s ease, border-color 0.15s ease",
        opacity: dimmed ? 0.48 : 1,
        filter: dimmed ? "grayscale(0.85)" : "none",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "var(--ws-shadow)";
        e.currentTarget.style.borderColor = "var(--ws-border-strong)";
        prefetchCreatorDetail(c.username);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.borderColor = "var(--ws-border)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "1 1 200px", minWidth: 0 }}>
        <CreatorAvatar
          username={c.username}
          src={c.avatarUrl}
          displayName={c.displayName}
          size={44}
          alt={c.displayName}
          priority={avatarPriority}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.displayName}
            </span>
            {c.authenticityScore >= 60 && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-label={t.verified} style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" fill="var(--ws-accent)" />
                <path d="M8 12.5l2.5 2.5L16 9" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--ws-text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            @{c.username}
          </div>
        </div>
      </div>

      {!compact && (
        <>
          <div style={{ flex: "0 0 90px", textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em" }}>{fmt(c.followersCount)}</div>
            <div style={{ fontSize: 10, color: "var(--ws-text-dim)", marginTop: 2 }}>{t.followers}</div>
          </div>
          <div style={{ flex: "0 0 70px", textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em" }}>{c.engagementRate}%</div>
            <div style={{ fontSize: 10, color: "var(--ws-text-dim)", marginTop: 2 }}>ER</div>
          </div>
          <div style={{ flex: "0 0 80px", textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em" }}>{fmt(engagement)}</div>
            <div style={{ fontSize: 10, color: "var(--ws-text-dim)", marginTop: 2 }}>{t.engagementShort}</div>
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: compact ? 0 : "auto" }}>
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
        <button
          type="button"
          onClick={onOpen}
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--ws-text)",
            background: "var(--ws-surface)",
            border: "1px solid var(--ws-border)",
            borderRadius: 10,
            padding: "8px 14px",
            cursor: "pointer",
            fontFamily: "inherit",
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
          }}
        >
          {t.view}
        </button>
      </div>
    </div>
  );
}

function FreeDiscoveryBanner({
  lang,
  used,
  limit,
  allNichesBrowse,
  onUpgrade,
}: {
  lang: "en" | "fr";
  used: number;
  limit: number;
  allNichesBrowse: boolean;
  onUpgrade: () => void;
}) {
  const t = discoveryCopy(lang);
  const remaining = Math.max(0, limit - used);
  return (
    <div
      style={{
        marginBottom: 16,
        padding: "14px 16px",
        borderRadius: 14,
        border: "1px solid var(--ws-border)",
        background: "var(--ws-surface-2)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--ws-accent)",
              background: "var(--ws-accent-soft)",
              padding: "3px 8px",
              borderRadius: 999,
            }}
          >
            {t.discoveriesRemainingLifetime(used, limit)}
          </span>
          {remaining > 0 ? (
            <span style={{ fontSize: 11, color: "var(--ws-text-muted)", letterSpacing: "-0.01em" }}>
              {lang === "fr" ? `${remaining} restante${remaining > 1 ? "s" : ""}` : `${remaining} left`}
            </span>
          ) : null}
        </div>
        <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em", lineHeight: 1.35 }}>
          {t.freeDiscoveryBannerTitle}
        </p>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--ws-text-muted)", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
          {allNichesBrowse ? t.freeDiscoveryBannerBrowse : t.freeDiscoveryBannerBody}
        </p>
      </div>
      <button
        type="button"
        onClick={onUpgrade}
        style={{
          flexShrink: 0,
          border: "1px solid var(--ws-border)",
          background: "var(--ws-surface)",
          color: "var(--ws-accent)",
          borderRadius: 10,
          padding: "8px 12px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap",
        }}
      >
        {lang === "fr" ? "Voir les plans →" : "See plans →"}
      </button>
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
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterPaywall, setFilterPaywall] = useState(false);
  const [selected, setSelected] = useState<FeedCreator | null>(null);
  const [discoveriesResetAt, setDiscoveriesResetAt] = useState<Date | null>(null);
  const [discoveriesUsed, setDiscoveriesUsed] = useState(0);
  const [showDiscoveryGate, setShowDiscoveryGate] = useState(() => plan === "free" && readFreeDiscoveryGateLock());

  const openCreator = (creator: FeedCreator) => {
    setSelected(creator);
    navigate({ view: "discovery", creator: creator.username });
  };

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
  const [sort, setSort] = useState<"value" | "followers" | "engagement">("followers");
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

  const apiParams = useMemo(() => toParams(filters, debouncedSearch), [filters, debouncedSearch]);
  const isGlobalSearch = debouncedSearch.trim().replace(/^@/, "").length >= 2;
  const shouldShowAllNichesTeaser = !isPaid && allNichesBrowse;

  const discoverAndFetch = useCallback(async (
    batchIndex: number,
    mode: "replace" | "append" = "replace",
  ): Promise<{ count: number; blocked?: boolean }> => {
    const gen = fetchGenRef.current;
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
    if (shouldSyncQuota) {
      const { supabase } = await import("@/lib/supabase");
      if (!supabase) return { count: 0 };
      if (!workspaceUserId) return { count: 0 };
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

    const d = await fetch(`/api/catalog?${qs}`).then((r) => r.json());
    if (gen !== fetchGenRef.current) return { count: 0 };

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
  }, [discoverAndFetch, isMobile, plan]);

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

  const persistProduct = async () => {
    const trimmed = product.trim();
    const { supabase } = await import("@/lib/supabase");
    if (!supabase) return;
    if (!workspaceUserId) return;
    await supabase.from("profiles").update({ business_name: trimmed || null }).eq("id", workspaceUserId);
  };

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
    const curated = base.filter((c) => isCuratedFeedCreator(c));
    const regular = base.filter((c) => !isCuratedFeedCreator(c));
    const shouldPreserveBatchOrder = !isPaid && Boolean(filters.niche.trim()) && !isGlobalSearch;
    const sortedRegular = shouldPreserveBatchOrder
      ? regular
      : sort === "engagement"
        ? [...regular].sort((a, b) => b.engagementRate - a.engagementRate)
        : sort === "followers"
          ? [...regular].sort((a, b) => b.followersCount - a.followersCount)
          : regular;
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
        flexDirection: isMobile ? "column" : "row",
        flex: 1,
        height: "100%",
        minHeight: 0,
        overflow: isMobile ? "auto" : "hidden",
        WebkitOverflowScrolling: "touch",
        background: "var(--ws-bg)",
        alignItems: "stretch",
      }}
    >
      <FilterSidebar
        lang={lang}
        isPaid={isPaid}
        isFree={plan === "free"}
        filters={filters}
        product={product}
        onProductChange={setProduct}
        onProductBlur={() => void persistProduct()}
        onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
        onLocked={() => setFilterPaywall(true)}
        isMobile={isMobile}
      />

      <div
        ref={mainRef}
        style={{
          flex: isMobile ? "0 0 auto" : 1,
          minWidth: 0,
          minHeight: isMobile ? undefined : 0,
          height: isMobile ? "auto" : "100%",
          width: isMobile ? "100%" : undefined,
          overflow: isMobile ? "visible" : "auto",
        }}
      >
        <div style={{ padding: isMobile ? "8px 16px 32px 52px" : "20px 24px 40px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 0 }}>
              {loading && !discoveryGateActive ? (
                <p style={{ fontSize: 13, color: "var(--ws-text-muted)", margin: 0, letterSpacing: "-0.01em" }}>
                  {t.loading}
                </p>
              ) : null}
            </div>
          </div>

          {!isPaid && !discoveryGateActive && (
            <FreeDiscoveryBanner
              lang={lang}
              used={discoveriesUsed}
              limit={discoveryLimit ?? FREE_LIFETIME_DISCOVERIES}
              allNichesBrowse={allNichesBrowse}
              onUpgrade={onUpgrade}
            />
          )}

          {error && <div style={{ color: "#dc2626", fontSize: 14, marginBottom: 12 }}>{t.error} : {error}</div>}
          {!loading && !error && isCreatorSearchMiss && (
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
          {!loading && !error && filtered.length === 0 && !discoveryGateActive && !isCreatorSearchMiss && (
            <div style={{ background: "var(--ws-surface)", border: "1px dashed var(--ws-border)", borderRadius: 12, padding: 48, textAlign: "center", color: "var(--ws-text-dim)", fontSize: 14 }}>
              {t.noCreators}
            </div>
          )}

          <div style={{ position: "relative", minHeight: feedGateActive && items.length === 0 ? 320 : undefined }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
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
                      compact={isMobile}
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
              <FeedGateOverlay lang={lang} onUpgrade={onUpgrade} />
            )}
          </div>

          {loadingMore && (
            <div style={{ textAlign: "center", padding: "16px 0", fontSize: 13, color: "var(--ws-text-dim)" }}>
              {t.loading}
            </div>
          )}
        </div>
      </div>

      {filterPaywall && (
        <PaywallModal
          lang={lang}
          title={t.filterPaywallTitle}
          body={t.filterPaywallBody}
          onUpgrade={onUpgrade}
          onClose={() => setFilterPaywall(false)}
        />
      )}

      <CreatorDetailDrawer
        creator={selected}
        plan={plan}
        lang={lang}
        userId={workspaceUserId}
        onClose={goBack}
        onUpgrade={onUpgrade}
        onWorkspaceChange={() => void refreshWorkspace()}
        onHiddenChange={() => setHiddenUsernames(loadHiddenCreators())}
      />
    </div>
  );
}
