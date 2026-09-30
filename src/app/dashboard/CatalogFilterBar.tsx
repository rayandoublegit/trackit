"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { NICHE_TREE, nicheLabel } from "@/lib/niche-tree";
import { useLang, type Lang } from "@/lib/useLang";
import { PlatformLogo } from "@/components/PlatformLogo";
import type { VideoFilters } from "./VideoLibrary";
import "./catalog-bar.css";

// Creators > Search, laid out like a market-research tool: title and search,
// ready-made views (Weekly gems, Top scaling…), platform tabs, then every
// filter in one card, and the sort.

export type CatalogSortKey = "followers" | "engagement" | "views" | "reach" | "recent" | "growth";
export type CatalogMode = "creators" | "videos";

export type CatalogFilters = {
  preset: string;
  platform: string;
  search: string;
  niche: string;
  followersRange: string;
  viewsFrom: string;
  engagement: string;
  reach: string;
  likes: string;
  country: string;
  language: string;
  activity: string;
  hasEmail: boolean;
  verified: boolean;
  hideSaved: boolean;
  showHidden: boolean;
};

type Option = { value: string; label: string };

export type CatalogPreset = {
  id: string;
  label: string;
  hint: string;
  icon: ReactNode;
  patch: Partial<CatalogFilters>;
  sort: CatalogSortKey;
};

function Svg({ children, size = 15 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const CATALOG_PRESETS: CatalogPreset[] = [
  {
    id: "all",
    label: "All creators",
    hint: "The whole catalog",
    icon: (
      <Svg>
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20" />
      </Svg>
    ),
    patch: {},
    sort: "followers",
  },
  {
    id: "gems",
    label: "Weekly gems",
    hint: "10K–100K followers, 9%+ engagement, posted in the last 7 days",
    icon: (
      <Svg>
        <path d="M6 3h12l4 6-10 12L2 9z" />
        <path d="M2 9h20M12 21 8 9l4-6 4 6z" />
      </Svg>
    ),
    patch: { followersRange: "10-100k", engagement: "9+", activity: "7" },
    sort: "engagement",
  },
  {
    id: "scaling",
    label: "Top scaling",
    hint: "Fastest follower growth and views gained; reach decides until history builds up",
    icon: (
      <Svg>
        <path d="M22 7 13.5 15.5 8.5 10.5 2 17" />
        <path d="M16 7h6v6" />
      </Svg>
    ),
    patch: {},
    sort: "growth",
  },
  {
    id: "viral",
    label: "Viral videos",
    hint: "500K+ average views",
    icon: (
      <Svg>
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.2.1 1.6 1.2 2.7 2.5 2.7z" />
      </Svg>
    ),
    patch: { viewsFrom: "500k" },
    sort: "views",
  },
  {
    id: "leaders",
    label: "Market leaders",
    hint: "500K+ followers",
    icon: (
      <Svg>
        <path d="M2 20h20M5 20V9l7-5 7 5v11M9 20v-6h6v6" />
      </Svg>
    ),
    patch: { followersRange: "500k+" },
    sort: "followers",
  },
  {
    id: "contact",
    label: "Ready to contact",
    hint: "Creators with an email on file",
    icon: (
      <Svg>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </Svg>
    ),
    patch: { hasEmail: true },
    sort: "engagement",
  },
  {
    id: "fresh",
    label: "Posted this week",
    hint: "Active in the last 7 days, newest first",
    icon: (
      <Svg>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </Svg>
    ),
    patch: { activity: "7" },
    sort: "recent",
  },
];

const FOLLOWERS: Option[] = [
  { value: "1-10k", label: "1K – 10K" },
  { value: "10-100k", label: "10K – 100K" },
  { value: "100-500k", label: "100K – 500K" },
  { value: "500k+", label: "500K+" },
];
const VIEWS: Option[] = [
  { value: "10k", label: "10K+" },
  { value: "50k", label: "50K+" },
  { value: "100k", label: "100K+" },
  { value: "500k", label: "500K+" },
  { value: "1m", label: "1M+" },
];
const ENGAGEMENT: Option[] = [
  { value: "3+", label: "3%+" },
  { value: "6+", label: "6%+" },
  { value: "9+", label: "9%+" },
  { value: "12+", label: "12%+" },
];
const REACH: Option[] = [
  { value: "0.25", label: "25%+ of followers" },
  { value: "0.5", label: "50%+ of followers" },
  { value: "1", label: "100%+ of followers" },
  { value: "2", label: "200%+ of followers" },
];
const LIKES: Option[] = [
  { value: "1k", label: "1K+" },
  { value: "10k", label: "10K+" },
  { value: "100k", label: "100K+" },
];
const COUNTRIES: Option[] = [
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "FR", label: "France" },
  { value: "CA", label: "Canada" },
  { value: "DE", label: "Germany" },
  { value: "ES", label: "Spain" },
  { value: "IT", label: "Italy" },
  { value: "PT", label: "Portugal" },
  { value: "BR", label: "Brazil" },
];
const LANGUAGES: Option[] = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
];
const ACTIVITY: Option[] = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];
const SORTS: { value: CatalogSortKey; label: string }[] = [
  { value: "followers", label: "Most followers" },
  { value: "growth", label: "Fastest growing" },
  { value: "views", label: "Most average views" },
  { value: "engagement", label: "Best engagement" },
  { value: "reach", label: "Best reach" },
  { value: "recent", label: "Latest post" },
];

type VideoPreset = { id: string; label: string; hint: string; patch: Partial<VideoFilters> };
const VIDEO_PRESETS: VideoPreset[] = [
  { id: "all", label: "All videos", hint: "Every tracked video", patch: { sort: "views" } },
  { id: "trending", label: "Trending now", hint: "Most views gained over the last 7 days", patch: { sort: "gained" } },
  { id: "viral-week", label: "Viral this week", hint: "Posted in the last 7 days, most viewed", patch: { postedWithin: "7", sort: "views" } },
  { id: "newest", label: "Newest", hint: "Latest posts first", patch: { sort: "recent" } },
  { id: "product", label: "With product link", hint: "Videos that link a product", patch: { hasProduct: true, sort: "views" } },
  { id: "engaging", label: "Most engaging", hint: "Best likes, comments and shares per view", patch: { sort: "engagement", minViews: "10k" } },
];
const VIDEO_VIEWS: Option[] = [
  { value: "10k", label: "10K+" },
  { value: "100k", label: "100K+" },
  { value: "500k", label: "500K+" },
  { value: "1m", label: "1M+" },
  { value: "10m", label: "10M+" },
];
const VIDEO_POSTED: Option[] = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];
const VIDEO_FORMAT: Option[] = [
  { value: "video", label: "Video" },
  { value: "photo", label: "Photo post" },
];
const VIDEO_LENGTH: Option[] = [
  { value: "short", label: "Under 15s" },
  { value: "medium", label: "15s – 60s" },
  { value: "long", label: "Over 60s" },
];
const VIDEO_SORTS: Option[] = [
  { value: "views", label: "Most viewed" },
  { value: "gained", label: "Fastest growing this week" },
  { value: "recent", label: "Newest" },
  { value: "engagement", label: "Best engagement" },
];

// French wording for the option lists above. Values stay the same; only the
// labels change. Anything missing here falls back to the English label.
const PRESET_FR: Record<string, { label: string; hint: string }> = {
  all: { label: "Tous les créateurs", hint: "Tout le catalogue" },
  gems: { label: "Pépites de la semaine", hint: "10k–100k abonnés, 9 %+ d'engagement, publication dans les 7 derniers jours" },
  scaling: { label: "En forte croissance", hint: "Croissance d'abonnés et vues gagnées les plus rapides ; la portée départage tant que l'historique se construit" },
  viral: { label: "Vidéos virales", hint: "500k+ vues en moyenne" },
  leaders: { label: "Leaders du marché", hint: "500k+ abonnés" },
  contact: { label: "Prêts à contacter", hint: "Créateurs avec un e-mail connu" },
  fresh: { label: "Publié cette semaine", hint: "Actifs dans les 7 derniers jours, les plus récents d'abord" },
};
const VIDEO_PRESET_FR: Record<string, { label: string; hint: string }> = {
  all: { label: "Toutes les vidéos", hint: "Toutes les vidéos suivies" },
  trending: { label: "Tendances", hint: "Le plus de vues gagnées sur les 7 derniers jours" },
  "viral-week": { label: "Virales cette semaine", hint: "Publiées dans les 7 derniers jours, les plus vues" },
  newest: { label: "Plus récentes", hint: "Les dernières publications d'abord" },
  product: { label: "Avec lien produit", hint: "Vidéos qui renvoient vers un produit" },
  engaging: { label: "Les plus engageantes", hint: "Meilleurs likes, commentaires et partages par vue" },
};
const OPTION_FR: Record<string, string> = {
  "1K – 10K": "1k – 10k",
  "10K – 100K": "10k – 100k",
  "100K – 500K": "100k – 500k",
  "500K+": "500k+",
  "1K+": "1k+",
  "10K+": "10k+",
  "50K+": "50k+",
  "100K+": "100k+",
  "1M+": "1 M+",
  "10M+": "10 M+",
  "3%+": "3 %+",
  "6%+": "6 %+",
  "9%+": "9 %+",
  "12%+": "12 %+",
  "25%+ of followers": "25 %+ des abonnés",
  "50%+ of followers": "50 %+ des abonnés",
  "100%+ of followers": "100 %+ des abonnés",
  "200%+ of followers": "200 %+ des abonnés",
  "United States": "États-Unis",
  "United Kingdom": "Royaume-Uni",
  France: "France",
  Canada: "Canada",
  Germany: "Allemagne",
  Spain: "Espagne",
  Italy: "Italie",
  Portugal: "Portugal",
  Brazil: "Brésil",
  English: "Anglais",
  French: "Français",
  Spanish: "Espagnol",
  German: "Allemand",
  Italian: "Italien",
  Portuguese: "Portugais",
  "Last 7 days": "7 derniers jours",
  "Last 30 days": "30 derniers jours",
  "Last 90 days": "90 derniers jours",
  "Last 12 months": "12 derniers mois",
  "Most followers": "Plus d'abonnés",
  "Fastest growing": "Croissance la plus rapide",
  "Most average views": "Plus de vues en moyenne",
  "Best engagement": "Meilleur engagement",
  "Best reach": "Meilleure portée",
  "Latest post": "Publication la plus récente",
  Video: "Vidéo",
  "Photo post": "Publication photo",
  "Under 15s": "Moins de 15 s",
  "15s – 60s": "15 s – 60 s",
  "Over 60s": "Plus de 60 s",
  "Most viewed": "Les plus vues",
  "Fastest growing this week": "Croissance la plus rapide cette semaine",
  Newest: "Plus récentes",
};

function localizeOptions<T extends { label: string }>(options: T[], lang: Lang): T[] {
  if (lang !== "fr") return options;
  return options.map((o) => ({ ...o, label: OPTION_FR[o.label] ?? o.label }));
}

/** Preset name and hint in the current language. */
export function catalogPresetText(preset: { id: string; label: string; hint: string }, lang: Lang): { label: string; hint: string } {
  return lang === "fr" ? PRESET_FR[preset.id] ?? preset : preset;
}

const ICONS: Record<string, ReactNode> = {
  niche: (
    <Svg>
      <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
    </Svg>
  ),
  followers: (
    <Svg>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  ),
  views: (
    <Svg>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  ),
  engagement: (
    <Svg>
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
    </Svg>
  ),
  reach: (
    <Svg>
      <path d="M22 7 13.5 15.5 8.5 10.5 2 17M16 7h6v6" />
    </Svg>
  ),
  likes: (
    <Svg>
      <path d="M7 10v12M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 7a2 2 0 0 1-1.9 1.4H7V10l4-8a2.5 2.5 0 0 1 4 3.9z" />
    </Svg>
  ),
  country: (
    <Svg>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Svg>
  ),
  language: (
    <Svg>
      <path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6" />
    </Svg>
  ),
  activity: (
    <Svg>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </Svg>
  ),
  format: (
    <Svg>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M10 8.5v7l5.5-3.5z" />
    </Svg>
  ),
  length: (
    <Svg>
      <path d="M5 22h14M5 2h14M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2" />
    </Svg>
  ),
};

function FilterPill({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
}) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="cf-pill-wrap" ref={ref}>
      <button
        type="button"
        className={`cf-pill${current ? " is-set" : ""}${open ? " is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="cf-pill__icon">{ICONS[id]}</span>
        <span className="cf-pill__label">{current ? `${label}${lang === "fr" ? " : " : ": "}${current.label}` : label}</span>
        {current ? (
          <span
            className="cf-pill__clear"
            role="button"
            tabIndex={0}
            aria-label={lang === "fr" ? `Effacer ${label}` : `Clear ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                onChange("");
              }
            }}
          >
            ×
          </span>
        ) : (
          <svg className="cf-pill__chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>
      {open ? (
        <div className="cf-pop" role="listbox" aria-label={label}>
          <div className="cf-pop__title">{label}</div>
          <button type="button" role="option" aria-selected={!value} className={`cf-pop__opt${!value ? " is-on" : ""}`} onClick={() => { onChange(""); setOpen(false); }}>
            {lang === "fr" ? "Tous" : "Any"}
          </button>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`cf-pop__opt${o.value === value ? " is-on" : ""}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Toggle({ label, on, onClick, icon }: { label: string; on: boolean; onClick: () => void; icon: ReactNode }) {
  return (
    <button type="button" className={`cf-toggle${on ? " is-on" : ""}`} aria-pressed={on} onClick={onClick}>
      <span className="cf-toggle__box" aria-hidden>
        {on ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          icon
        )}
      </span>
      {label}
    </button>
  );
}

export function CatalogFilterBar({
  filters,
  sort,
  mode,
  count,
  loading,
  isPaid,
  isFree,
  isMobile,
  onChange,
  onSort,
  onMode,
  onPreset,
  onReset,
  onLocked,
  onOpenLists,
  onOpenOutreach,
  videoFilters,
  videoPreset,
  onVideoChange,
  videoCount,
  videoLoading,
}: {
  filters: CatalogFilters;
  sort: CatalogSortKey;
  mode: CatalogMode;
  count: number;
  loading: boolean;
  isPaid: boolean;
  isFree: boolean;
  isMobile?: boolean;
  onChange: (patch: Partial<CatalogFilters>) => void;
  onSort: (s: CatalogSortKey) => void;
  onMode: (m: CatalogMode) => void;
  onPreset: (preset: CatalogPreset) => void;
  onReset: () => void;
  onLocked: () => void;
  onOpenLists: () => void;
  onOpenOutreach: () => void;
  videoFilters: VideoFilters;
  videoPreset: string;
  onVideoChange: (patch: Partial<VideoFilters>, preset?: string) => void;
  videoCount: number;
  videoLoading: boolean;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  const L = <T extends { label: string }>(options: T[]) => localizeOptions(options, lang);
  const nicheOptions = Object.keys(NICHE_TREE).map((n) => ({ value: n, label: nicheLabel(n, lang) }));
  const [notice, setNotice] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const searchLocked = !isPaid;
  const activeCount =
    [filters.niche, filters.followersRange, filters.viewsFrom, filters.engagement, filters.reach, filters.likes, filters.country, filters.language, filters.activity].filter(Boolean).length +
    [filters.hasEmail, filters.verified, filters.hideSaved, filters.showHidden].filter(Boolean).length;
  const instagram = filters.platform === "instagram";
  const preset = CATALOG_PRESETS.find((p) => p.id === filters.preset) ?? CATALOG_PRESETS[0];

  // Any manual change leaves the ready-made view.
  const change = (patch: Partial<CatalogFilters>) => onChange({ preset: "", ...patch });

  const pickPlatform = (id: string) => {
    if (id === "youtube") {
      setNotice(fr ? "La recherche YouTube arrive bientôt. TikTok et Instagram sont disponibles." : "YouTube search is coming soon. TikTok and Instagram are live.");
      return;
    }
    if (id === "instagram" && isFree) {
      onLocked();
      return;
    }
    setNotice(null);
    onChange({ platform: id });
  };

  return (
    <div className={`cf-bar${isMobile ? " is-mobile" : ""}`}>
      <div className="cf-top">
        <div className="cf-top__title">
          <h1>{fr ? "Créateurs" : "Creators"}</h1>
          <span className="cf-count" aria-live="polite">
            {(mode === "videos" ? videoLoading : loading) ? <i className="cf-bar__dot" aria-hidden /> : null}
            {(mode === "videos" ? videoLoading : loading)
              ? fr
                ? "Recherche"
                : "Searching"
              : fr
                ? (() => {
                    const n = mode === "videos" ? videoCount : count;
                    const noun = mode === "videos" ? (n > 1 ? "vidéos" : "vidéo") : n > 1 ? "créateurs" : "créateur";
                    return `${n.toLocaleString("fr-FR")} ${noun}`;
                  })()
                : `${(mode === "videos" ? videoCount : count).toLocaleString("en-US")} ${mode === "videos" ? "videos" : "creators"}`}
          </span>
        </div>
        <label className={`cf-search${searchLocked ? " is-locked" : ""}`}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="text"
            value={filters.search}
            readOnly={searchLocked}
            onClick={() => {
              if (searchLocked) onLocked();
            }}
            onChange={(e) => {
              if (searchLocked) return onLocked();
              onChange({ search: e.target.value });
            }}
            placeholder={
              mode === "videos"
                ? fr
                  ? "Rechercher dans les légendes, hashtags…"
                  : "Search video captions, hashtags…"
                : instagram
                  ? fr
                    ? "Recherche Instagram en direct : une niche, un nom ou un @pseudo"
                    : "Search Instagram live: a niche, a name or @handle"
                  : fr
                    ? "Rechercher des créateurs, @pseudos, e-mails…"
                    : "Search creators, @handles, emails…"
            }
            aria-label={fr ? "Rechercher des créateurs" : "Search creators"}
          />
          {filters.search ? (
            <button type="button" className="cf-search__clear" onClick={() => onChange({ search: "" })} aria-label={fr ? "Effacer la recherche" : "Clear search"}>
              ×
            </button>
          ) : null}
        </label>
        <div className="cf-top__links">
          <button type="button" className="cf-link" onClick={onOpenLists}>
            <Svg>
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </Svg>
            {fr ? "Mes listes" : "My lists"}
          </button>
          <button type="button" className="cf-link" onClick={onOpenOutreach}>
            <Svg>
              <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
            </Svg>
            {fr ? "Prospection" : "Outreach"}
          </button>
        </div>
      </div>

      <div className="cf-presets-row">
        <div className="cf-presets" role="tablist" aria-label={fr ? "Vues prêtes à l’emploi" : "Ready-made views"}>
          {mode === "videos"
            ? VIDEO_PRESETS.map((p) => {
                const on = (videoPreset || "all") === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    title={fr ? VIDEO_PRESET_FR[p.id]?.hint ?? p.hint : p.hint}
                    className={`cf-preset${on ? " is-on" : ""}`}
                    onClick={() => onVideoChange(p.patch, p.id)}
                  >
                    {fr ? VIDEO_PRESET_FR[p.id]?.label ?? p.label : p.label}
                  </button>
                );
              })
            : CATALOG_PRESETS.map((p) => {
            const on = (filters.preset || "all") === p.id && (p.id !== "all" || !filters.preset);
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={on}
                title={catalogPresetText(p, lang).hint}
                className={`cf-preset${on ? " is-on" : ""}`}
                onClick={() => onPreset(p)}
              >
                <span className="cf-preset__icon">{p.icon}</span>
                {catalogPresetText(p, lang).label}
              </button>
            );
          })}
        </div>
        <div className="cf-tabs" role="tablist" aria-label={fr ? "Plateforme" : "Platform"}>
          {(["tiktok", "instagram", "youtube"] as const).map((id) => {
            const active = filters.platform === id;
            const soon = id === "youtube";
            const locked = id === "instagram" && isFree;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`cf-tab${active ? " is-on" : ""}${soon || locked ? " is-muted" : ""}`}
                onClick={() => pickPlatform(id)}
              >
                <PlatformLogo platform={id} size={16} />
                {id === "tiktok" ? "TikTok" : id === "instagram" ? "Instagram" : "YouTube"}
                {soon ? <span className="cf-tab__badge">{fr ? "Bientôt" : "Soon"}</span> : null}
                {locked ? <span className="cf-tab__badge">Pro</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      {mode === "creators" && filters.preset && filters.preset !== "all" ? <p className="cf-preset-hint">{catalogPresetText(preset, lang).hint}</p> : null}
      {mode === "videos" && videoPreset && videoPreset !== "all" ? (
        <p className="cf-preset-hint">{(fr ? VIDEO_PRESET_FR[videoPreset]?.hint : undefined) ?? VIDEO_PRESETS.find((p) => p.id === videoPreset)?.hint}</p>
      ) : null}

      <div className="cf-card">
        <div className="cf-card__head">
          <span className="cf-card__by">{fr ? "Filtrer par :" : "Filter by:"}</span>
          <div className="cf-mode" role="tablist" aria-label={fr ? "Afficher" : "Show"}>
            <button type="button" role="tab" aria-selected={mode === "creators"} className={`cf-mode__btn${mode === "creators" ? " is-on" : ""}`} onClick={() => onMode("creators")}>
              <Svg>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" />
              </Svg>
              {fr ? "Créateurs" : "Creators"}
            </button>
            <button type="button" role="tab" aria-selected={mode === "videos"} className={`cf-mode__btn${mode === "videos" ? " is-on" : ""}`} onClick={() => onMode("videos")}>
              <Svg>
                <rect x="2" y="4" width="20" height="16" rx="3" />
                <path d="M10 9v6l5-3z" fill="currentColor" />
              </Svg>
              {fr ? "Vidéos" : "Videos"}
            </button>
          </div>
          {mode === "creators" && activeCount > 0 ? (
            <button type="button" className="cf-reset" onClick={onReset}>
              {fr ? "Réinitialiser les filtres" : "Reset filters"} ({activeCount})
            </button>
          ) : null}
          <button
            type="button"
            className={`cf-card__fold${filtersOpen ? "" : " is-closed"}`}
            onClick={() => setFiltersOpen((v) => !v)}
            aria-label={filtersOpen ? (fr ? "Masquer les filtres" : "Hide filters") : fr ? "Afficher les filtres" : "Show filters"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
              <path d="M6 15l6-6 6 6" />
            </svg>
          </button>
        </div>
        {filtersOpen && mode === "videos" ? (
          <div className="cf-card__pills">
            <FilterPill id="niche" label="Niche" value={videoFilters.niche} options={nicheOptions} onChange={(v) => onVideoChange({ niche: v })} />
            <FilterPill id="views" label={fr ? "Vues" : "Views"} value={videoFilters.minViews} options={L(VIDEO_VIEWS)} onChange={(v) => onVideoChange({ minViews: v })} />
            <FilterPill id="activity" label={fr ? "Publiée" : "Posted"} value={videoFilters.postedWithin} options={L(VIDEO_POSTED)} onChange={(v) => onVideoChange({ postedWithin: v })} />
            <FilterPill id="format" label="Format" value={videoFilters.mediaType} options={L(VIDEO_FORMAT)} onChange={(v) => onVideoChange({ mediaType: v })} />
            <FilterPill id="length" label={fr ? "Durée" : "Length"} value={videoFilters.duration} options={L(VIDEO_LENGTH)} onChange={(v) => onVideoChange({ duration: v })} />
            <FilterPill id="country" label={fr ? "Pays du créateur" : "Creator country"} value={videoFilters.country} options={L(COUNTRIES)} onChange={(v) => onVideoChange({ country: v })} />
            <FilterPill id="language" label={fr ? "Langue" : "Language"} value={videoFilters.language} options={L(LANGUAGES)} onChange={(v) => onVideoChange({ language: v })} />
            <Toggle
              label={fr ? "Avec lien produit" : "With product link"}
              on={videoFilters.hasProduct}
              onClick={() => onVideoChange({ hasProduct: !videoFilters.hasProduct })}
              icon={
                <Svg size={11}>
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" />
                </Svg>
              }
            />
          </div>
        ) : null}
        {filtersOpen && mode === "creators" ? (
          <div className="cf-card__pills">
            <FilterPill id="niche" label="Niche" value={filters.niche} options={nicheOptions} onChange={(v) => change({ niche: v })} />
            <FilterPill id="followers" label={fr ? "Abonnés" : "Followers"} value={filters.followersRange} options={L(FOLLOWERS)} onChange={(v) => change({ followersRange: v })} />
            <FilterPill id="views" label={fr ? "Vues moy." : "Avg views"} value={filters.viewsFrom} options={L(VIEWS)} onChange={(v) => change({ viewsFrom: v })} />
            <FilterPill id="engagement" label="Engagement" value={filters.engagement} options={L(ENGAGEMENT)} onChange={(v) => change({ engagement: v })} />
            <FilterPill id="reach" label={fr ? "Portée" : "Reach"} value={filters.reach} options={L(REACH)} onChange={(v) => change({ reach: v })} />
            <FilterPill id="likes" label={fr ? "Likes moy." : "Avg likes"} value={filters.likes} options={L(LIKES)} onChange={(v) => change({ likes: v })} />
            <FilterPill id="country" label={fr ? "Pays" : "Country"} value={filters.country} options={L(COUNTRIES)} onChange={(v) => change({ country: v })} />
            <FilterPill id="language" label={fr ? "Langue" : "Language"} value={filters.language} options={L(LANGUAGES)} onChange={(v) => change({ language: v })} />
            <FilterPill id="activity" label={fr ? "Dernière publication" : "Last post"} value={filters.activity} options={L(ACTIVITY)} onChange={(v) => change({ activity: v })} />
            <Toggle
              label={fr ? "Avec e-mail" : "With email"}
              on={filters.hasEmail}
              onClick={() => change({ hasEmail: !filters.hasEmail })}
              icon={
                <Svg size={11}>
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 7l9 6 9-6" />
                </Svg>
              }
            />
            <Toggle
              label={fr ? "Vérifiés" : "Verified"}
              on={filters.verified}
              onClick={() => change({ verified: !filters.verified })}
              icon={
                <Svg size={11}>
                  <path d="M12 2l3 3h4v4l3 3-3 3v4h-4l-3 3-3-3H5v-4l-3-3 3-3V5h4z" />
                </Svg>
              }
            />
            <Toggle
              label={fr ? "Masquer les sauvegardés" : "Hide saved"}
              on={filters.hideSaved}
              onClick={() => change({ hideSaved: !filters.hideSaved })}
              icon={
                <Svg size={11}>
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </Svg>
              }
            />
            <Toggle
              label={fr ? "Masqués uniquement" : "Hidden only"}
              on={filters.showHidden}
              onClick={() => change({ showHidden: !filters.showHidden })}
              icon={
                <Svg size={11}>
                  <path d="M17.9 17.9A10 10 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A9 9 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2M1 1l22 22" />
                </Svg>
              }
            />
          </div>
        ) : null}
      </div>

      <div className="cf-sortrow">
        <label className="cf-sort">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
          {mode === "videos" ? (
            <select value={videoFilters.sort} onChange={(e) => onVideoChange({ sort: e.target.value })} aria-label={fr ? "Trier les vidéos" : "Sort videos"}>
              {L(VIDEO_SORTS).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          ) : (
            <select value={sort} onChange={(e) => onSort(e.target.value as CatalogSortKey)} aria-label={fr ? "Trier les créateurs" : "Sort creators"}>
              {L(SORTS).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </label>
        {notice ? <p className="cf-notice">{notice}</p> : null}
        {instagram && !filters.search.trim() && !filters.niche ? (
          <p className="cf-notice">{fr ? "Instagram est recherché en direct : choisissez une niche ou tapez un mot-clé pour commencer." : "Instagram is searched live: pick a niche or type a keyword to start."}</p>
        ) : null}
      </div>
    </div>
  );
}
