"use client";

import { PlatformLogo } from "@/components/PlatformLogo";
import { nicheLabel } from "@/lib/niche-tree";
import { useLang } from "@/lib/useLang";
import type { MinoAnalysisMeta } from "@/lib/mino-analysis";
import { describeCatalogFilters, filtersToPrompt, widerFilters, type MinoCatalogFilters } from "@/lib/mino-filters";
import { GlobeIcon, ImageIcon } from "./MinoAttachments";
import "./mino-analysis.css";

// Mino's answer to a website or a photo: what it understood about the brand,
// the filters it suggests (open them in Creators > Search), searches to run.
// The creators themselves are rendered by MinoCreatorResults under it.

const TIER_LABEL = {
  nano: { en: "Nano creators (1K–10K)", fr: "Nano-créateurs (1K–10K)" },
  micro: { en: "Micro creators (10K–100K)", fr: "Micro-créateurs (10K–100K)" },
  mid: { en: "Mid-size creators (100K–500K)", fr: "Créateurs intermédiaires (100K–500K)" },
  macro: { en: "Macro creators (500K+)", fr: "Macro-créateurs (500K+)" },
} as const;

const DROP_LABEL: Record<string, { en: string; fr: string }> = {
  followersRange: { en: "Any size", fr: "Toutes tailles" },
  engagement: { en: "Any engagement", fr: "Tout engagement" },
  viral: { en: "Not only viral", fr: "Pas seulement viral" },
  language: { en: "Any language", fr: "Toutes langues" },
  country: { en: "Any country", fr: "Tous pays" },
  hasEmail: { en: "Without email too", fr: "Même sans email" },
  niche: { en: "Any niche", fr: "Toutes niches" },
};

/** "FR" -> "France", "fr" -> "français", falling back to the code. */
function displayName(code: string, type: "region" | "language", lang: "en" | "fr"): string {
  try {
    return new Intl.DisplayNames([lang], { type }).of(code) ?? code;
  } catch {
    return code;
  }
}

function FilterChips({ filters }: { filters: MinoCatalogFilters }) {
  const lang = useLang();
  return (
    <div className="mino-an__chips">
      {describeCatalogFilters(filters, lang).map((c) => (
        <span key={c.key} className={`mino-an__chip${c.key === "hasEmail" ? " is-mail" : ""}`}>
          {c.key === "platform" ? <PlatformLogo platform={filters.platform} size={13} /> : null}
          {c.label}
        </span>
      ))}
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16.2 16.2 20 20" />
    </svg>
  );
}

export function MinoAnalysisResult({
  meta,
  onOpenCatalog,
  onSearch,
  busy,
}: {
  meta: MinoAnalysisMeta;
  onOpenCatalog: (filters: MinoCatalogFilters) => void;
  onSearch: (text: string) => void;
  busy?: boolean;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  const a = meta.analysis;
  const searches = [
    ...a.searches,
    // A search Mino's parser reads back exactly into the suggested filters.
    filtersToPrompt(meta.usedFilters, lang),
  ].filter((s, i, list) => s && list.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i);

  return (
    <section className="mino-an" aria-label={fr ? "Ce que Mino a compris" : "What Mino understood"}>
      <header className="mino-an__head">
        <span className="mino-an__eyebrow">{fr ? "Ce que j’ai compris" : "What I understood"}</span>
        <span className="mino-an__sources">
          {meta.source.site ? (
            <span className="mino-an__source">
              <GlobeIcon size={13} />
              {meta.source.site}
            </span>
          ) : null}
          {meta.source.image ? (
            <span className="mino-an__source">
              <ImageIcon size={13} />
              {fr ? "Photo" : "Photo"}
            </span>
          ) : null}
        </span>
      </header>

      {a.brand ? <h3 className="mino-an__brand">{a.brand}</h3> : null}
      {a.summary ? <p className="mino-an__summary">{a.summary}</p> : null}

      <dl className="mino-an__facts">
        {a.products.length ? (
          <div>
            <dt>{fr ? "Produits" : "Products"}</dt>
            <dd>{a.products.join(" · ")}</dd>
          </div>
        ) : null}
        {a.audience ? (
          <div>
            <dt>{fr ? "Audience" : "Audience"}</dt>
            <dd>{a.audience}</dd>
          </div>
        ) : null}
        {a.niches.length ? (
          <div>
            <dt>{fr ? "Niches" : "Niches"}</dt>
            <dd>{a.niches.map((n) => nicheLabel(n, lang)).join(" · ")}</dd>
          </div>
        ) : null}
        {a.countries.length || a.languages.length ? (
          <div>
            <dt>{fr ? "Marchés" : "Markets"}</dt>
            <dd>
              {a.countries.map((c) => displayName(c, "region", lang)).join(" · ")}
              {a.languages.length ? (
                <span className="mino-an__why">
                  {(fr ? "Langue : " : "Language: ") + a.languages.map((l) => displayName(l, "language", lang)).join(", ")}
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>{fr ? "Taille conseillée" : "Suggested size"}</dt>
          <dd>
            {TIER_LABEL[a.followerTier][lang]}
            {a.followerReason ? <span className="mino-an__why">{a.followerReason}</span> : null}
          </dd>
        </div>
        {a.platforms.length ? (
          <div>
            <dt>{fr ? "Plateformes" : "Platforms"}</dt>
            <dd className="mino-an__platforms">
              {a.platforms.map((p) => (
                <span key={p}>
                  <PlatformLogo platform={p} size={14} />
                  {p === "instagram" ? "Instagram" : "TikTok"}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
        {a.keywords.length ? (
          <div>
            <dt>{fr ? "Mots-clés" : "Keywords"}</dt>
            <dd>{a.keywords.join(" · ")}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mino-an__block">
        <span className="mino-an__label">{fr ? "Filtres suggérés" : "Suggested filters"}</span>
        <FilterChips filters={meta.usedFilters} />
        {meta.widened.length ? (
          <p className="mino-an__note">
            {fr ? "Élargi pour trouver des profils : " : "Widened to find profiles: "}
            {meta.widened.map((d) => DROP_LABEL[d]?.[lang] ?? d).join(", ")}
          </p>
        ) : null}
        <button type="button" className="mino-an__open" onClick={() => onOpenCatalog(meta.usedFilters)}>
          {fr ? "Ouvrir dans Créateurs avec ces filtres" : "Open in Creators with these filters"}
          <ArrowIcon />
        </button>
      </div>

      {searches.length ? (
        <div className="mino-an__block">
          <span className="mino-an__label">{fr ? "Recherches suggérées" : "Suggested searches"}</span>
          <div className="mino-an__searches">
            {searches.map((s) => (
              <button key={s} type="button" className="mino-an__search" disabled={busy} onClick={() => onSearch(s)}>
                <SearchIcon />
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** When nobody matched: the same search with one filter less, and the catalog with these filters. */
export function MinoWiderSearches({
  filters,
  keyword,
  onSearch,
  onOpenCatalog,
  busy,
}: {
  filters: MinoCatalogFilters;
  keyword?: string;
  onSearch: (text: string) => void;
  onOpenCatalog: (filters: MinoCatalogFilters) => void;
  busy?: boolean;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  const options = widerFilters(filters)
    .filter((w) => w.drop !== "niche" || !keyword)
    .slice(0, 4);
  return (
    <section className="mino-an is-empty" aria-label={fr ? "Élargir la recherche" : "Widen the search"}>
      <span className="mino-an__label">{fr ? "Aucun profil pour ces filtres" : "No profile for these filters"}</span>
      <FilterChips filters={filters} />
      {options.length ? (
        <>
          <span className="mino-an__label">{fr ? "Essayez plus large" : "Try wider"}</span>
          <div className="mino-an__searches">
            {options.map((w) => (
              <button key={w.drop} type="button" className="mino-an__search" disabled={busy} onClick={() => onSearch(filtersToPrompt(w.filters, lang, keyword))}>
                <SearchIcon />
                {DROP_LABEL[w.drop]?.[lang] ?? w.drop}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <button type="button" className="mino-an__open is-ghost" onClick={() => onOpenCatalog(filters)}>
        {fr ? "Ouvrir dans Créateurs avec ces filtres" : "Open in Creators with these filters"}
        <ArrowIcon />
      </button>
    </section>
  );
}
