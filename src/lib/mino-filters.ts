import { NICHE_TREE, nicheLabel } from "@/lib/niche-tree";
import type { MinoCreatorSearch } from "@/lib/mino-search-parse";

// Mino's filters in the exact shape of Creators > Search (CatalogFilterBar),
// and the mapping between them, a Mino search and short labels. Pure and
// browser-safe.

export type FollowersRange = "1-10k" | "10-100k" | "100-500k" | "500k+";
export type EngagementOption = "3+" | "6+" | "9+" | "12+";

/** A patch of the catalog's filter state: only values the catalog bar offers. */
export type MinoCatalogFilters = {
  platform: "tiktok" | "instagram";
  niche?: string;
  followersRange?: FollowersRange;
  engagement?: EngagementOption;
  country?: string;
  language?: string;
  hasEmail?: boolean;
  viral?: boolean;
};

export const CATALOG_COUNTRIES = ["FR", "US", "GB", "DE", "BR", "ES", "IT", "PT", "CA"] as const;
export const CATALOG_LANGUAGES = ["fr", "en", "es", "de", "pt", "it"] as const;
export const NICHE_KEYS = Object.keys(NICHE_TREE);
const RANGES: Record<FollowersRange, { min: number; max?: number }> = {
  "1-10k": { min: 1_000, max: 10_000 },
  "10-100k": { min: 10_001, max: 100_000 },
  "100-500k": { min: 100_001, max: 500_000 },
  "500k+": { min: 500_001 },
};
export const TIER_RANGE: Record<"nano" | "micro" | "mid" | "macro", FollowersRange> = {
  nano: "1-10k",
  micro: "10-100k",
  mid: "100-500k",
  macro: "500k+",
};

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

// Everyday words (FR/EN) for the parent niches.
const NICHE_WORDS: Record<string, string> = {
  beaute: "beauty",
  cosmetique: "beauty",
  cosmetiques: "beauty",
  maquillage: "beauty",
  soin: "beauty",
  soins: "beauty",
  mode: "fashion",
  vetements: "fashion",
  clothing: "fashion",
  apparel: "fashion",
  cuisine: "food",
  recettes: "food",
  nourriture: "food",
  sport: "fitness",
  sports: "fitness",
  musculation: "fitness",
  gym: "fitness",
  voyage: "travel",
  voyages: "travel",
  animaux: "pets",
  chiens: "pets",
  chats: "pets",
  jeux: "gaming",
  "jeux video": "gaming",
  games: "gaming",
  maison: "home",
  deco: "home",
  decoration: "home",
  parentalite: "parenting",
  bebe: "parenting",
  maman: "parenting",
  "bien-etre": "wellness",
  "bien etre": "wellness",
  sante: "wellness",
  argent: "finance",
  bourse: "finance",
  ecommerce: "e-commerce",
  ecom: "e-commerce",
  "plein air": "outdoors",
  randonnee: "outdoors",
  voiture: "auto",
  voitures: "auto",
  cars: "auto",
  art: "art",
};

/** The catalog niche key for a word ("Beauté", "skincare", "mode"), or "" when none fits. */
export function nicheKeyFor(raw: string): string {
  const w = strip(raw);
  if (!w) return "";
  if (NICHE_TREE[w]) return w;
  if (NICHE_WORDS[w]) return NICHE_WORDS[w];
  for (const [key, subs] of Object.entries(NICHE_TREE)) {
    if (subs.some((s) => strip(s) === w)) return key;
    if (strip(nicheLabel(key, "fr")) === w) return key;
  }
  // Several words: the first that names a niche ("vegan food" -> food).
  const words = w.split(/\s+/);
  if (words.length > 1) {
    for (const part of words) {
      const k = nicheKeyFor(part);
      if (k) return k;
    }
  }
  return "";
}

/** The catalog follower range closest to a min/max pair. */
export function followersRangeFor(min?: number, max?: number): FollowersRange | undefined {
  if (min == null && max == null) return undefined;
  const lo = min ?? 0;
  const hi = max ?? Infinity;
  if (hi <= 10_000) return "1-10k";
  if (lo >= 500_000) return "500k+";
  if (hi <= 100_000) return lo >= 1_000 || hi > 10_000 ? "10-100k" : "1-10k";
  if (hi <= 500_000) return lo > 100_000 || hi > 250_000 ? "100-500k" : "10-100k";
  return lo >= 100_000 ? "500k+" : lo >= 10_000 ? "100-500k" : undefined;
}

export function engagementOptionFor(pct?: number): EngagementOption | undefined {
  if (!pct || pct <= 0) return undefined;
  if (pct >= 12) return "12+";
  if (pct >= 9) return "9+";
  if (pct >= 6) return "6+";
  return "3+";
}

const asCountry = (c?: string) => {
  const cc = (c || "").toUpperCase();
  return (CATALOG_COUNTRIES as readonly string[]).includes(cc) ? cc : undefined;
};
const asLanguage = (l?: string) => {
  const v = (l || "").toLowerCase().slice(0, 2);
  return (CATALOG_LANGUAGES as readonly string[]).includes(v) ? v : undefined;
};

/** Catalog filters for a plain-language Mino search. */
export function searchToCatalogFilters(s: MinoCreatorSearch): MinoCatalogFilters {
  const f: MinoCatalogFilters = { platform: s.platform === "Instagram" ? "instagram" : "tiktok" };
  const niche = nicheKeyFor(s.niche);
  if (niche) f.niche = niche;
  const range = followersRangeFor(s.minFollowers, s.maxFollowers);
  if (range) f.followersRange = range;
  const eng = engagementOptionFor(s.minEngagement);
  if (eng) f.engagement = eng;
  const country = asCountry(s.country);
  if (country) f.country = country;
  const language = asLanguage(s.language);
  if (language) f.language = language;
  if (s.hasEmail) f.hasEmail = true;
  if (s.viral) f.viral = true;
  return f;
}

/** The Mino search (catalog query + live top-up) for catalog filters. */
export function catalogFiltersToSearch(f: MinoCatalogFilters, keyword = ""): MinoCreatorSearch {
  const range = f.followersRange ? RANGES[f.followersRange] : undefined;
  const engagement = f.engagement ? Number(f.engagement.replace("+", "")) : undefined;
  return {
    niche: f.niche || keyword,
    platform: f.platform === "instagram" ? "Instagram" : "TikTok",
    minFollowers: range?.min,
    maxFollowers: range?.max,
    country: f.country,
    language: f.language,
    hasEmail: f.hasEmail || undefined,
    minEngagement: engagement,
    viral: f.viral || undefined,
  };
}

const RANGE_LABEL: Record<FollowersRange, { en: string; fr: string }> = {
  "1-10k": { en: "1K–10K followers", fr: "1K–10K abonnés" },
  "10-100k": { en: "10K–100K followers", fr: "10K–100K abonnés" },
  "100-500k": { en: "100K–500K followers", fr: "100K–500K abonnés" },
  "500k+": { en: "500K+ followers", fr: "500K+ abonnés" },
};

const COUNTRY_NAMES: Record<string, { en: string; fr: string }> = {
  FR: { en: "France", fr: "France" },
  US: { en: "United States", fr: "États-Unis" },
  GB: { en: "United Kingdom", fr: "Royaume-Uni" },
  DE: { en: "Germany", fr: "Allemagne" },
  BR: { en: "Brazil", fr: "Brésil" },
  ES: { en: "Spain", fr: "Espagne" },
  IT: { en: "Italy", fr: "Italie" },
  PT: { en: "Portugal", fr: "Portugal" },
  CA: { en: "Canada", fr: "Canada" },
};
const LANGUAGE_NAMES: Record<string, { en: string; fr: string }> = {
  fr: { en: "French", fr: "Français" },
  en: { en: "English", fr: "Anglais" },
  es: { en: "Spanish", fr: "Espagnol" },
  de: { en: "German", fr: "Allemand" },
  pt: { en: "Portuguese", fr: "Portugais" },
  it: { en: "Italian", fr: "Italien" },
};

export type FilterChip = { key: keyof MinoCatalogFilters; label: string };

/** One readable chip per filter, in the user's language. */
export function describeCatalogFilters(f: MinoCatalogFilters, lang: "en" | "fr" = "en"): FilterChip[] {
  const fr = lang === "fr";
  const chips: FilterChip[] = [{ key: "platform", label: f.platform === "instagram" ? "Instagram" : "TikTok" }];
  if (f.niche) chips.push({ key: "niche", label: nicheLabel(f.niche, lang) });
  if (f.followersRange) chips.push({ key: "followersRange", label: RANGE_LABEL[f.followersRange][lang] });
  if (f.country) chips.push({ key: "country", label: COUNTRY_NAMES[f.country]?.[lang] ?? f.country });
  if (f.language) chips.push({ key: "language", label: LANGUAGE_NAMES[f.language]?.[lang] ?? f.language });
  if (f.engagement) chips.push({ key: "engagement", label: fr ? `Engagement ${f.engagement.replace("+", "")} %+` : `${f.engagement.replace("+", "")}%+ engagement` });
  if (f.hasEmail) chips.push({ key: "hasEmail", label: fr ? "Avec email" : "With email" });
  if (f.viral) chips.push({ key: "viral", label: fr ? "Vidéo virale" : "Viral video" });
  return chips;
}

/** The same filters with one removed, widest-impact first: what to try when nobody matched. */
export function widerFilters(f: MinoCatalogFilters): { drop: keyof MinoCatalogFilters; filters: MinoCatalogFilters }[] {
  const order: (keyof MinoCatalogFilters)[] = ["followersRange", "engagement", "viral", "language", "country", "hasEmail", "niche"];
  return order
    .filter((k) => f[k] !== undefined && f[k] !== false)
    .map((k) => {
      const next = { ...f };
      delete next[k];
      return { drop: k, filters: next };
    });
}

const PROMPT_COUNTRY: Record<string, { en: string; fr: string }> = {
  FR: { en: "in France", fr: "en France" },
  US: { en: "in the US", fr: "aux États-Unis" },
  GB: { en: "in the UK", fr: "au Royaume-Uni" },
  DE: { en: "in Germany", fr: "en Allemagne" },
  BR: { en: "in Brazil", fr: "au Brésil" },
  ES: { en: "in Spain", fr: "en Espagne" },
  IT: { en: "in Italy", fr: "en Italie" },
  PT: { en: "in Portugal", fr: "au Portugal" },
  CA: { en: "in Canada", fr: "au Canada" },
};
const PROMPT_RANGE: Record<FollowersRange, { en: string; fr: string }> = {
  "1-10k": { en: "nano", fr: "nano" },
  "10-100k": { en: "micro", fr: "micro" },
  "100-500k": { en: "between 100k and 500k followers", fr: "entre 100k et 500k abonnés" },
  "500k+": { en: "with 500k+ followers", fr: "avec plus de 500k abonnés" },
};

/**
 * A sentence Mino's own search parser reads back into these filters, for the
 * "try this search" chips: "Trouve des micro créateurs fitness sur Instagram en France avec un email".
 */
export function filtersToPrompt(f: MinoCatalogFilters, lang: "en" | "fr" = "en", keyword = ""): string {
  const fr = lang === "fr";
  // French reads better with the French niche name, when it maps back to the same key.
  const label = f.niche && fr ? nicheLabel(f.niche, "fr").toLowerCase() : "";
  const niche = f.niche ? (label && nicheKeyFor(label) === f.niche ? label : f.niche) : keyword;
  const tier = f.followersRange === "1-10k" || f.followersRange === "10-100k" ? PROMPT_RANGE[f.followersRange][lang] : "";
  const size = f.followersRange && !tier ? PROMPT_RANGE[f.followersRange][lang] : "";
  const parts = fr
    ? ["Trouve des", tier, "créateurs", niche, f.platform === "instagram" ? "sur Instagram" : "sur TikTok"]
    : ["Find", tier, niche, "creators", f.platform === "instagram" ? "on Instagram" : "on TikTok"];
  if (f.country) parts.push(PROMPT_COUNTRY[f.country]?.[lang] ?? "");
  if (size) parts.push(size);
  if (f.engagement) parts.push(fr ? `avec ${f.engagement.replace("+", "")} % d'engagement` : `with ${f.engagement.replace("+", "")}% engagement`);
  if (f.viral) parts.push(fr ? "avec des vidéos virales" : "with viral videos");
  if (f.hasEmail) parts.push(fr ? "avec un email" : "with an email");
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
