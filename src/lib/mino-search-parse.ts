import type { CatalogPlatform } from "@/lib/catalog-query";

// Pure parsing of a plain-language creator search, safe for the browser.

export type MinoCreatorSearch = {
  niche: string;
  platform?: CatalogPlatform;
  minFollowers?: number;
  maxFollowers?: number;
  country?: string;
  hasEmail?: boolean;
};

const INTENT = /\b(influenc\w*|cr[ée]at\w*|creators?|ugc|tiktokers?|instagrammers?|youtubers?|cherche\w*|trouve\w*|recherche\w*|profils?|find|search|look(?:ing)? for|list|liste|niche)\b/i;

const COUNTRIES: [RegExp, string][] = [
  [/\b(france|french|fran[cç]ais\w*|fr)\b/i, "FR"],
  [/\b(usa?|united states|america\w*|am[ée]ricain\w*|us-based)\b|[ée]tats[- ]unis/i, "US"],
  [/\b(uk|united kingdom|british|england|angleterre|anglais\w*|royaume[- ]uni|britanni\w*)\b/i, "GB"],
  [/\b(spain|spanish|espagne|espagnol\w*)\b/i, "ES"],
  [/\b(germany|german|allemagne|allemand\w*)\b/i, "DE"],
  [/\b(italy|italian|italie|italien\w*)\b/i, "IT"],
  [/\b(portugal|portuguese|portugais\w*)\b/i, "PT"],
  [/\b(canada|canadian|canadien\w*)\b/i, "CA"],
  [/\b(brazil|brazilian|br[ée]sil\w*)\b/i, "BR"],
];

const STOP = new Set(
  (
    "find search look looking for me some any all the a an of in on at with without from to and or who that " +
    "show list give get need want please creators creator influencers influencer ugc tiktokers instagrammers youtubers " +
    "tiktok instagram youtube insta ig yt followers follower subs subscribers audience niche niches micro nano macro mega " +
    "email emails contact k m plus over under above below less more than between around about best top good " +
    "cherche trouve moi des les une un de du la le en sur avec sans pour qui dans et ou abonnés createurs créateurs " +
    "influenceurs influenceuses french france fr usa us uk gb american british spain spanish es germany german de " +
    "italy italian portugal portuguese pt canada canadian ca brazil brazilian br based who are is " +
    // French
    "créateur créatrice créatrices createur creatrice creatrices influenceur influenceuse profil profils " +
    "trouver trouvez chercher cherchez recherche rechercher montre montrez donne donnez je veux voudrais " +
    "aimerais besoin il faut stp svp plait plaît vous nous me au aux ont ayant sont est basé basée basés " +
    "basées plus moins entre environ minimum maximum max min jusqu'à jusqu’à abonné abonnée abonnes abonnees abonnées mail mails " +
    "courriel courriels adresse joignable joignables français française francaise francaises françaises " +
    "américain américaine américains américaines anglais anglaise anglaises angleterre royaume-uni états-unis " +
    "etats-unis espagne espagnol espagnole espagnols espagnoles allemagne allemand allemande allemands allemandes " +
    "italie italien italienne italiens italiennes portugais portugaise canadien canadienne canadiens canadiennes " +
    "brésil brésilien brésilienne brésiliens brésiliennes sur tiktokeurs tiktokeuses instagrameurs youtubeurs youtubeuses " +
    "quel quelle quels quelles on aujourd’hui aujourd'hui mes mon ma nos notre ces cet cette ceux celles très " +
    "meilleur meilleure meilleurs meilleures bons bonnes comptes compte"
  ).split(" "),
);

const EN_ACTION = /^\s*(pay|create|open|send|add|follow\s+up|remind|contact|invite|manage|schedule)\s/i;
const FR_ACTION = /^\s*(pay(?:er|ez|e)|paie\w*|cr[ée]{2}[rz]?|ouvr\w*|envoie\w*|envoy\w*|ajout\w*|relanc\w*|contact(?:er|ez|e)|invit(?:er|ez)|g[ée]r(?:er|ez|e))\s/i;

// French phrases the catalog knows under another tag.
const FR_PHRASES: [RegExp, string][] = [
  [/\bsoins?\s+(?:de\s+la\s+)?peau\b/g, "skincare"],
  [/\bjeux?[\s-]+vid[ée]o\w*/g, "gaming"],
];

function amount(raw: string, unit?: string): number {
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  const u = (unit || "").toLowerCase();
  return Math.round(u === "m" ? n * 1_000_000 : u === "k" ? n * 1_000 : n);
}

/** Null when the text is not a creator search. */
export function parseCreatorSearch(text: string): MinoCreatorSearch | null {
  if (!INTENT.test(text)) return null;
  // Asks that start with an action ("Pay a creator", "Payer un créateur") go to Mino's actions.
  if (EN_ACTION.test(text) || FR_ACTION.test(text)) return null;
  let t = text.toLowerCase().replace(/\b(?:d|l|j|qu|s)['’]/g, " ");
  for (const [re, tag] of FR_PHRASES) t = t.replace(re, tag);
  // "micro-créateurs", "nano-influenceuses": the tier and the noun are two words.
  t = t.replace(/\b(nano|micro|macro|mega)-(?=cr|infl)/g, "$1 ");

  let platform: CatalogPlatform | undefined;
  if (/\b(instagram|insta|ig|reels?)\b/.test(t)) platform = "Instagram";
  else if (/\b(youtube|yt|youtubers?)\b/.test(t)) platform = "YouTube";
  else if (/\b(tiktok|tiktokers?)\b/.test(t)) platform = "TikTok";

  let minFollowers: number | undefined;
  let maxFollowers: number | undefined;
  const between = t.match(/(\d+(?:[.,]\d+)?)\s*(k|m)?\s*(?:-|to|à|a|and|et)\s*(\d+(?:[.,]\d+)?)\s*(k|m)\b/);
  const over = t.match(/(?:over|above|more than|plus de|au moins|\+|at least|min(?:imum)?)\s*(\d+(?:[.,]\d+)?)\s*(k|m)\b|(\d+(?:[.,]\d+)?)\s*(k|m)\s*\+/);
  const under = t.match(/(?:under|below|less than|moins de|max(?:imum)?|up to|jusqu['’] ?[àa])\s*(\d+(?:[.,]\d+)?)\s*(k|m)\b/);
  if (between) {
    minFollowers = amount(between[1], between[2] || between[4]);
    maxFollowers = amount(between[3], between[4]);
  } else {
    if (over) minFollowers = over[1] ? amount(over[1], over[2]) : amount(over[3], over[4]);
    if (under) maxFollowers = amount(under[1], under[2]);
    if (!over && !under) {
      if (/\bnano\b/.test(t)) [minFollowers, maxFollowers] = [1_000, 10_000];
      else if (/\bmicro\b/.test(t)) [minFollowers, maxFollowers] = [10_000, 100_000];
      else if (/\bmacro\b/.test(t)) [minFollowers, maxFollowers] = [100_000, 1_000_000];
      else if (/\bmega\b/.test(t)) minFollowers = 1_000_000;
    }
  }

  const country = COUNTRIES.find(([re]) => re.test(t))?.[1];
  const hasEmail = /\b(e-?mails?|contact|mails?|courriels?|joignables?)\b/.test(t) || undefined;

  const niche = t
    .replace(/[?.!,;:()"“”«»]/g, " ")
    .replace(/\d+(?:[.,]\d+)?\s*(k|m)?\+?/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .join(" ")
    .trim()
    .slice(0, 48);

  return { niche, platform, minFollowers, maxFollowers, country, hasEmail };
}

/** Short human label of what was searched, e.g. "skincare · TikTok · 50K+ · FR". */
export function describeSearch(s: MinoCreatorSearch, lang: "en" | "fr" = "en"): string {
  const fr = lang === "fr";
  const k = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}K` : String(n));
  const parts = [s.niche || (fr ? "toutes niches" : "all niches")];
  if (s.platform) parts.push(s.platform);
  if (s.minFollowers && s.maxFollowers) parts.push(`${k(s.minFollowers)}–${k(s.maxFollowers)}`);
  else if (s.minFollowers) parts.push(`${k(s.minFollowers)}+`);
  else if (s.maxFollowers) parts.push(fr ? `moins de ${k(s.maxFollowers)}` : `under ${k(s.maxFollowers)}`);
  if (s.country) parts.push(s.country);
  if (s.hasEmail) parts.push(fr ? "avec email" : "with email");
  return parts.join(" · ");
}
