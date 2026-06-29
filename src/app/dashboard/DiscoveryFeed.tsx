"use client";

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
import { creatorMatchesNicheFilter } from "@/lib/discovery-feed";
import { CreatorDetailDrawer } from "@/app/dashboard/CreatorDetailDrawer";
import { CreatorAvatar } from "@/app/dashboard/CreatorAvatar";
import { listSaved, listFolders, type FolderRow, type FolderItem } from "@/lib/workspace-client";
import { SaveCreatorDropdown } from "@/app/dashboard/SaveCreatorDropdown";
import { useLang } from "@/lib/useLang";
import { discoveryCopy } from "@/lib/discovery-copy";
import { logCreatorLookupRequest } from "@/lib/creator-lookup-requests";
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
  background: "#FFFFFF",
  border: "1px solid #E5E5E5",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: "inherit",
  color: "#1A1A1A",
  cursor: "pointer",
  letterSpacing: "-0.01em",
  boxSizing: "border-box",
};

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  background: "#FFFFFF",
  border: "1px solid #E5E5E5",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: "inherit",
  color: "#1A1A1A",
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
};

const EMPTY_FILTERS: FilterState = {
  niche: "",
  platform: "tiktok",
  followersRange: "",
  engagement: "",
  country: "FR",
  language: "fr",
  age: "",
  viewsFrom: "",
  viewsTo: "",
  search: "",
  hasEmail: false,
  hideSaved: false,
};

/** Catalogue sans niche choisie : pas de cap plan ni quota decouverte. */
function isAllNichesBrowse(f: FilterState): boolean {
  return !f.niche;
}

/** Performance / search filters (not niche or geo). Triggers refresh + discovery quota. */
function hasActiveSearchFilters(f: FilterState): boolean {
  if (f.followersRange || f.engagement || f.viewsFrom || f.viewsTo || f.age) return true;
  if (f.search.trim()) return true;
  if (f.hasEmail || f.hideSaved) return true;
  return false;
}

function languageFromCountry(country: string): string | null {
  if (country === "FR") return "fr";
  if (country === "US") return "en";
  return null;
}

const FOLLOWER_RANGES: Record<string, { min: number; max?: number }> = {
  "1-10k": { min: 0, max: 10_000 },
  "10-100k": { min: 10_001, max: 100_000 },
  "100-500k": { min: 100_001, max: 500_000 },
  "500k+": { min: 500_001 },
};

function followerRangeBounds(range: string): { min?: number; max?: number } {
  const b = FOLLOWER_RANGES[range];
  if (!b) return {};
  return { min: b.min, max: b.max };
}

const VIEWS_VAL: Record<string, number> = {
  "10k": 10_000,
  "50k": 50_000,
  "100k": 100_000,
  "500k": 500_000,
  "1m": 1_000_000,
};

function toParams(f: FilterState): Record<string, string> {
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
  const C: Record<string, string> = { FR: "FR", US: "US", GB: "GB", DE: "DE", BR: "BR", ES: "ES", CA: "CA" };
  if (C[f.country]) p.country = C[f.country];
  const L: Record<string, string> = { fr: "fr", en: "en", es: "es", de: "de", pt: "pt" };
  if (L[f.language]) p.language = L[f.language];
  return p;
}

function applyClientFilters(list: FeedCreator[], f: FilterState, saved: Set<string>): FeedCreator[] {
  let out = list;

  if (f.niche) {
    // Niche deja filtree server-side (tag strict). Pas de re-filtre client qui rognerait la liste.
  }

  if (f.platform) {
    const want = f.platform.toLowerCase();
    out = out.filter((c) => (c.platform || "tiktok").toLowerCase().includes(want));
  }

  if (f.country) {
    // Pays gere server-side par /api/catalog (filtre niche+langue uniquement).
    // Pas de re-filtre client: il ejectait les country_code vides.
  }

  if (f.language) {
    out = out.filter((c) => (c.language || "").toLowerCase() === f.language);
  }

  const followers = followerRangeBounds(f.followersRange);
  if (followers.min != null) {
    out = out.filter((c) => c.followersCount >= followers.min!);
  }
  if (followers.max != null) {
    out = out.filter((c) => c.followersCount <= followers.max!);
  }

  if (f.engagement === "3+") out = out.filter((c) => c.engagementRate >= 3);
  else if (f.engagement === "6+") out = out.filter((c) => c.engagementRate >= 6);
  else if (f.engagement === "9+") out = out.filter((c) => c.engagementRate >= 9);

  const q = f.search.trim().toLowerCase().replace(/^@/, "");
  if (q) {
    out = out.filter(
      (c) =>
        c.username.toLowerCase().includes(q) ||
        c.displayName.toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false)
    );
  }
  if (f.hasEmail) out = out.filter((c) => Boolean(c.email));
  if (f.hideSaved) out = out.filter((c) => !saved.has(c.username));
  if (f.viewsFrom && VIEWS_VAL[f.viewsFrom]) out = out.filter((c) => c.avgViews >= VIEWS_VAL[f.viewsFrom]);
  if (f.viewsTo && VIEWS_VAL[f.viewsTo]) out = out.filter((c) => c.avgViews <= VIEWS_VAL[f.viewsTo]);
  return out;
}

function shuffleFeedCreators<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
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
      <div style={{ fontSize: 11, color: "#9A9A9A", marginBottom: 4, letterSpacing: "-0.01em" }}>{label}</div>
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
      <div style={{ fontSize: 11, color: "#9A9A9A", marginBottom: 4, letterSpacing: "-0.01em" }}>{label}</div>
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
        <span style={{ fontSize: 13, color: "#1A1A1A", flex: 1, marginRight: 8 }}>{checked ? onLabel : offLabel}</span>
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
    <div style={{ fontSize: 11, fontWeight: 600, color: "#9A9A9A", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10, marginTop: 4 }}>
      {children}
    </div>
  );
}

function FilterSidebar({
  lang,
  isPaid,
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
  const platformNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (platformNoticeTimerRef.current) clearTimeout(platformNoticeTimerRef.current);
    };
  }, []);

  const showPlatformComingSoon = () => {
    setPlatformNotice(t.morePlatformsComing);
    if (platformNoticeTimerRef.current) clearTimeout(platformNoticeTimerRef.current);
    platformNoticeTimerRef.current = setTimeout(() => setPlatformNotice(null), 4000);
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
        background: "#FFFFFF",
        borderRight: isMobile ? "none" : "1px solid #EFEFEF",
        borderBottom: isMobile ? "1px solid #EFEFEF" : "none",
        height: isMobile ? "auto" : "100%",
        maxHeight: isMobile ? undefined : "100%",
        minHeight: isMobile ? undefined : 0,
        overflowY: isMobile ? "visible" : "auto",
        overflowX: "hidden",
        padding: isMobile ? "56px 16px 20px" : "24px 20px 48px",
        boxSizing: "border-box",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: "0 0 4px" }}>{t.findItTitle}</h1>
      <p style={{ fontSize: 12, color: "#9A9A9A", margin: "0 0 20px", lineHeight: 1.45, letterSpacing: "-0.01em" }}>
        {t.findItSubtitle}
      </p>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#9A9A9A", marginBottom: 4, letterSpacing: "-0.01em" }}>{t.yourProduct}</div>
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
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
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
                border: active ? "1px solid #1A1A1A" : "1px solid #E5E5E5",
                background: active ? "#1A1A1A" : "#FFFFFF",
                color: active ? "#FFFFFF" : "#1A1A1A",
                fontSize: 12,
                fontWeight: 500,
                fontFamily: "inherit",
                cursor: "pointer",
                opacity: 1,
                letterSpacing: "-0.01em",
              }}
            >
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
            color: "#0047FF",
            letterSpacing: "-0.01em",
            lineHeight: 1.45,
          }}
        >
          {platformNotice}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#9A9A9A", marginBottom: 4, letterSpacing: "-0.01em" }}>{t.search}</div>
        <div style={{ position: "relative" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.45 }}>
            <circle cx="11" cy="11" r="7" stroke="#1A1A1A" strokeWidth="1.8" />
            <path d="M21 21l-4.35-4.35" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
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
        background: "#FFFFFF",
        border: "1px solid #EFEFEF",
        borderRadius: 12,
        transition: "box-shadow 0.15s ease, border-color 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.06)";
        e.currentTarget.style.borderColor = "#E0E0E0";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.borderColor = "#EFEFEF";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "1 1 200px", minWidth: 0 }}>
        <CreatorAvatar username={c.username} src={c.avatarUrl} displayName={c.displayName} size={44} alt={c.displayName} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.displayName}
            </span>
            {c.authenticityScore >= 60 && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-label={t.verified} style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" fill="#0047FF" />
                <path d="M8 12.5l2.5 2.5L16 9" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#9A9A9A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            @{c.username}
          </div>
        </div>
      </div>

      {!compact && (
        <>
          <div style={{ flex: "0 0 90px", textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{fmt(c.followersCount)}</div>
            <div style={{ fontSize: 10, color: "#9A9A9A", marginTop: 2 }}>{t.followers}</div>
          </div>
          <div style={{ flex: "0 0 70px", textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{c.engagementRate}%</div>
            <div style={{ fontSize: 10, color: "#9A9A9A", marginTop: 2 }}>ER</div>
          </div>
          <div style={{ flex: "0 0 80px", textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{fmt(engagement)}</div>
            <div style={{ fontSize: 10, color: "#9A9A9A", marginTop: 2 }}>{t.engagementShort}</div>
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
            color: "#1A1A1A",
            background: "#FFFFFF",
            border: "1px solid #E5E5E5",
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
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#FFF", borderRadius: 18, padding: "30px 34px", textAlign: "center", maxWidth: 380, boxShadow: "0 24px 48px rgba(0,0,0,0.18)" }}>
        <img
          src={TRACKIT_LOGO_URL}
          alt="Trackit"
          style={{ height: 64, width: "auto", display: "block", objectFit: "contain", margin: "0 auto 14px" }}
        />
        <div style={{ fontSize: 19, fontWeight: 600, color: "#1A1A1A", marginBottom: 7 }}>{title}</div>
        <div style={{ fontSize: 13, color: "#7A7A7A", marginBottom: 18, lineHeight: 1.5 }}>{body}</div>
        <UpgradeCtaButton lang={lang} onClick={onUpgrade} fullWidth />
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#9A9A9A", fontSize: 13, marginTop: 12, cursor: "pointer", fontFamily: "inherit" }}>{t.later}</button>
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
        background: "linear-gradient(rgba(245,245,245,0) 0%, #F5F5F5 48%)",
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
          background: "#FFF",
          border: "1px solid #EFEFEF",
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
        <div style={{ fontSize: 19, fontWeight: 600, color: "#1A1A1A", marginBottom: 6, letterSpacing: "-0.03em" }}>{t.paywallTitle}</div>
        <div style={{ fontSize: 13, color: "#7A7A7A", marginBottom: 18, lineHeight: 1.55 }}>{t.paywallBody}</div>
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

const FREE_VISIBLE = 6;
const SCALE_PAGE_LIMIT = 48;
const ALL_NICHES_CHUNK = 1000;
const TRACKIT_LOGO_URL = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

export function DiscoveryFeed({ plan, isMobile, onUpgrade, onReachOut }: { plan: PlanTier; isMobile?: boolean; onUpgrade: () => void; onReachOut?: (creator: FeedCreator) => void }) {
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
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [folderItems, setFolderItems] = useState<FolderItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterPaywall, setFilterPaywall] = useState(false);
  const [selected, setSelected] = useState<FeedCreator | null>(null);
  const [discoveriesResetAt, setDiscoveriesResetAt] = useState<Date | null>(null);
  const [showDiscoveryGate, setShowDiscoveryGate] = useState(false);

  const openCreator = (creator: FeedCreator) => {
    setSelected(creator);
    navigate({ view: "discovery", creator: creator.username });
  };

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
  const mainRef = useRef<HTMLDivElement>(null);
  const fetchGenRef = useRef(0);
  const batchIndexRef = useRef(0);
  const poolHasMoreRef = useRef(true);
  const scrolledRef = useRef(false);
  const loadingNextRef = useRef(false);

  const isCatalogMode = useMemo(() => !hasActiveSearchFilters(filters), [filters]);
  const allNichesBrowse = useMemo(() => isAllNichesBrowse(filters), [filters]);
  const planResultCap = resultsPerSearch;
  const batchSize = allNichesBrowse ? ALL_NICHES_CHUNK : (planResultCap ?? SCALE_PAGE_LIMIT);

  const apiParams = useMemo(() => ({ ...toParams(filters), sort }), [filters, sort]);

  const discoverAndFetch = useCallback(async (
    batchIndex: number,
    mode: "replace" | "append" = "replace",
  ): Promise<{ count: number; blocked?: boolean }> => {
    const gen = fetchGenRef.current;
    const countsTowardQuota = hasDiscoveryCap && discoveryLimit != null && !allNichesBrowse;

    if (countsTowardQuota) {
      const { supabase } = await import("@/lib/supabase");
      if (!supabase) return { count: 0 };
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { count: 0 };
      const quota = await syncDiscoveryQuota(supabase, user.id, plan);
      if (!quota) return { count: 0 };
      setDiscoveriesResetAt(quota.resetAt);
      if (quota.blocked) {
        setShowDiscoveryGate(true);
        setHasMore(false);
        return { count: 0, blocked: true };
      }
      setShowDiscoveryGate(false);
    } else if (allNichesBrowse) {
      setShowDiscoveryGate(false);
    }

    const off = batchIndex * batchSize;
    const qs = new URLSearchParams({ ...apiParams, offset: String(off), limit: String(batchSize) }).toString();
    const r = await fetch(`/api/catalog?${qs}`);
    const d = await r.json();
    if (gen !== fetchGenRef.current) return { count: 0 };
    const list: FeedCreator[] = Array.isArray(d.creators) ? d.creators : [];
    const rows = !isCatalogMode ? shuffleFeedCreators(list) : list;
    const apiHasMore = !!d.hasMore;
    poolHasMoreRef.current = apiHasMore;
    setError(d.error || null);
    const seen = new Set<string>();
    const deduped = rows.filter((c) => {
      if (!c.username || seen.has(c.username)) return false;
      seen.add(c.username);
      return true;
    });

    if (mode === "append") {
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

    if (countsTowardQuota) {
      const { supabase } = await import("@/lib/supabase");
      if (!supabase) return { count: deduped.length };
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { count: deduped.length };
      const latestQuota = await syncDiscoveryQuota(supabase, user.id, plan);
      const usedBefore = latestQuota?.used ?? 0;
      const next = await incrementDiscoveryQuota(supabase, user.id, plan, usedBefore);
      if (next >= discoveryLimit!) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
    } else {
      setHasMore(poolHasMoreRef.current);
    }

    return { count: deduped.length };
  }, [apiParams, plan, discoveryLimit, hasDiscoveryCap, isCatalogMode, batchSize, allNichesBrowse]);

  useEffect(() => {
    fetchGenRef.current += 1;
    batchIndexRef.current = 0;
    poolHasMoreRef.current = true;
    let cancelled = false;
    setCreators([]);
    setHasMore(true);
    setLoading(true);
    setError(null);
    scrolledRef.current = false;
    discoverAndFetch(0, "replace")
      .catch(() => { if (!cancelled) setError("network"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [discoverAndFetch]);

  useEffect(() => {
    if (!hasDiscoveryCap) return;
    void (async () => {
      const { supabase } = await import("@/lib/supabase");
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const quota = await syncDiscoveryQuota(supabase, user.id, plan);
      if (!quota) return;
      setDiscoveriesResetAt(quota.resetAt);
      setShowDiscoveryGate(!isAllNichesBrowse(filters) && quota.blocked);
    })();
  }, [plan, hasDiscoveryCap, filters.niche]);

  useEffect(() => {
    if (!hasDiscoveryCap || !showDiscoveryGate) return;
    const tick = async () => {
      const ms = discoveryResetRemainingMs(discoveriesResetAt, plan);
      if (ms == null || ms > 0) return;
      const { supabase } = await import("@/lib/supabase");
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const quota = await syncDiscoveryQuota(supabase, user.id, plan);
      if (quota) {
        setDiscoveriesResetAt(quota.resetAt);
        setShowDiscoveryGate(quota.blocked);
      }
    };
    void tick();
    const id = setInterval(() => { void tick(); }, 60_000);
    return () => clearInterval(id);
  }, [showDiscoveryGate, discoveriesResetAt, plan, hasDiscoveryCap]);

  useEffect(() => {
    const loadProduct = async () => {
      const { supabase } = await import("@/lib/supabase");
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("business_name").eq("id", user.id).maybeSingle();
      if (data?.business_name) setProduct(data.business_name);
    };
    void loadProduct();
  }, []);

  const persistProduct = async () => {
    const trimmed = product.trim();
    const { supabase } = await import("@/lib/supabase");
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").update({ business_name: trimmed || null }).eq("id", user.id);
  };

  const loadNextBatch = useCallback(async () => {
    if (loadingNextRef.current || loadingMore || loading) return;
    if (showDiscoveryGate) return;
    if (allNichesBrowse && !hasMore) return;

    if (!hasMore && hasDiscoveryCap && !allNichesBrowse) {
      setShowDiscoveryGate(true);
      return;
    }

    loadingNextRef.current = true;
    setLoadingMore(true);
    try {
      let nextBatch = batchIndexRef.current + 1;
      let result = await discoverAndFetch(nextBatch, "append");
      if (result.blocked) return;
      if (result.count === 0 && (allNichesBrowse || !hasDiscoveryCap)) {
        nextBatch = 0;
        result = await discoverAndFetch(0, "append");
        if (result.blocked) return;
      }
      batchIndexRef.current = nextBatch;
    } catch {
      setError("network");
    } finally {
      loadingNextRef.current = false;
      setLoadingMore(false);
    }
  }, [loadingMore, loading, hasMore, showDiscoveryGate, hasDiscoveryCap, allNichesBrowse, discoverAndFetch]);

  useEffect(() => {
    if (loading || loadingMore) return;
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop > 80) scrolledRef.current = true;
      if (!scrolledRef.current) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 600;
      if (!nearBottom) return;
      void loadNextBatch();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [loading, loadingMore, loadNextBatch]);

  const filtered = useMemo(() => applyClientFilters(creators, filters, savedUsernames), [creators, filters, savedUsernames]);
  const visibleCreators = filtered;
  const items = isPaid ? visibleCreators : visibleCreators.slice(0, FREE_VISIBLE + 2);
  const hasMoreFree = !isPaid && visibleCreators.length > FREE_VISIBLE;
  const displayCount = filtered.length;
  const batchNote = allNichesBrowse ? "" : (planResultCap != null ? t.resultsCappedAt(planResultCap) : "");
  const discoveryGateActive = showDiscoveryGate;
  const feedGateActive = discoveryGateActive || hasMoreFree;
  const searchQuery = filters.search.trim();
  const isCreatorSearchMiss =
    !loading && !error && !discoveryGateActive && searchQuery.length > 0 && filtered.length === 0;

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
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        flex: 1,
        height: isMobile ? "auto" : "100%",
        minHeight: isMobile ? "100vh" : 0,
        overflow: "hidden",
        background: "#F5F5F5",
        alignItems: "stretch",
      }}
    >
      <FilterSidebar
        lang={lang}
        isPaid={isPaid}
        filters={filters}
        product={product}
        onProductChange={setProduct}
        onProductBlur={() => void persistProduct()}
        onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
        onLocked={() => setFilterPaywall(true)}
        isMobile={isMobile}
      />

      <div ref={mainRef} style={{ flex: 1, minWidth: 0, minHeight: 0, height: isMobile ? "auto" : "100%", overflow: isMobile ? "visible" : "auto" }}>
        <div style={{ padding: isMobile ? "16px" : "20px 24px 40px" }}>
          {!isMobile && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 13, color: "#9A9A9A", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>Powered by</span>
                <img
                  src={TRACKIT_LOGO_URL}
                  alt="Trackit"
                  style={{ height: 56, width: "auto", display: "block", objectFit: "contain" }}
                />
              </div>
            </div>
          )}
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
              {!allNichesBrowse && (
                <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0, letterSpacing: "-0.01em" }}>
                  {loading ? t.loading : `${t.creatorCount(displayCount)}${batchNote}`}
                </p>
              )}
              {allNichesBrowse && loading && (
                <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0, letterSpacing: "-0.01em" }}>
                  {t.loading}
                </p>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {!isMobile && (
                <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 11, color: "#9A9A9A", letterSpacing: "-0.01em" }}>
                  {(["followers", "engagement"] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        if (!isPaid) { setFilterPaywall(true); return; }
                        setSort(key);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        fontFamily: "inherit",
                        cursor: "pointer",
                        color: sort === key ? "#1A1A1A" : "#9A9A9A",
                        fontWeight: sort === key ? 600 : 400,
                        fontSize: 11,
                        padding: 0,
                      }}
                    >
                      {key === "followers" ? t.followers : "ER%"}
                      {sort === key ? " ↓" : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && <div style={{ color: "#dc2626", fontSize: 14, marginBottom: 12 }}>{t.error} : {error}</div>}
          {!loading && !error && filtered.length === 0 && discoveryGateActive && (
            <div style={{ position: "relative", minHeight: 320 }}>
              <FeedGateOverlay lang={lang} onUpgrade={onUpgrade} />
            </div>
          )}
          {!loading && !error && isCreatorSearchMiss && (
            <div
              style={{
                background: "#FFF",
                border: "1px solid #EFEFEF",
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
                  background: "#F5F5F5",
                  color: "#7A7A7A",
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
              <p style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px", letterSpacing: "-0.02em", lineHeight: 1.4 }}>
                {t.creatorNotInDatabaseTitle}
              </p>
              <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 12px", lineHeight: 1.55 }}>
                {t.creatorNotInDatabaseBody}
              </p>
              <p style={{ fontSize: 12, color: "#9A9A9A", margin: 0, letterSpacing: "-0.01em" }}>
                {t.creatorNotInDatabaseQuery(searchQuery)}
              </p>
            </div>
          )}
          {!loading && !error && filtered.length === 0 && !discoveryGateActive && !isCreatorSearchMiss && (
            <div style={{ background: "#FFF", border: "1px dashed #E5E5E5", borderRadius: 12, padding: 48, textAlign: "center", color: "#9A9A9A", fontSize: 14 }}>
              {t.noCreators}
            </div>
          )}

          <div style={{ position: "relative" }}>
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
                      onOpen={() => openCreator(c)}
                      onWorkspaceChange={() => void refreshWorkspace()}
                      onSavedOptimistic={onSavedOptimistic}
                      onFoldersOptimistic={onFoldersOptimistic}
                      onUpgrade={onUpgrade}
                    />
                  </div>
                );
              })}
            </div>

            {feedGateActive && items.length > 0 && (
              <FeedGateOverlay lang={lang} onUpgrade={onUpgrade} />
            )}
          </div>

          {loadingMore && (
            <div style={{ textAlign: "center", padding: "16px 0", fontSize: 13, color: "#9A9A9A" }}>
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

      <CreatorDetailDrawer creator={selected} plan={plan} lang={lang} onClose={goBack} onUpgrade={onUpgrade} onWorkspaceChange={() => void refreshWorkspace()} onReachOut={onReachOut} />
    </div>
  );
}
