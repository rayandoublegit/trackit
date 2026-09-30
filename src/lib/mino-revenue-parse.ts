// Pure parsing of a plain-language revenue / performance ask, safe for the browser.
// "combien j'ai généré avec @luna cette semaine", "how much did I make this month",
// "ventes des 30 derniers jours", "top creators this month", "new creators".

export type MinoRevenueRange = "today" | "3d" | "7d" | "30d" | "90d";

export type MinoRevenueAsk = {
  /** Period the analytics endpoint supports, snapped up from what was asked. */
  range: MinoRevenueRange;
  days: 1 | 3 | 7 | 30 | 90;
  /** Handle or name of one creator, without "@". */
  creator?: string;
  /** What the answer leads with. */
  focus: "revenue" | "top" | "new";
};

// Words that are about money on their own.
// (JS \b does not see accented letters as letters: "généré" ends with a lookahead instead.)
const STRONG =
  /\b(revenues?|sales|sold|orders?|earn(?:ed|ings)?|made|generated|brought in|roi|gmv|commissions?|turnover|chiffre d['’]affaires|ventes?|vendu\w*|g[ée]n[ée]r[ée]e?s?|gagn[ée]e?s?|rapport[ée]e?s?|commandes?|revenus?|encaiss[ée]\w*)(?![\wÀ-ÿ])/i;
// "How much / combien" is about money only when it is about the brand or a period, not a price.
const HOW_MUCH = /\b(how much|combien)\b/i;
const PRICE = /\b(cost|costs|price|pricing|plan|subscription|co[uû]t\w*|prix|tarifs?|abonnement)(?![\wÀ-ÿ])/i;
// Words that are about performance, only with a period or "my".
const WEAK = /\b(performance|performances|perf|results?|r[ée]sultats?|stats|statistiques|dashboard|tableau de bord|bilan)\b/i;
const TOP = /\b(top\s*\d*|best(?:[- ]performing)?|meilleur[es]*|plus rentables?)\s+(?:\d+\s+)?(creators?|affiliates?|cr[ée]ateurs?|cr[ée]atrices?|influenc\w*|ambassad\w*)\b/i;
const NEW =
  /\b(new|newest|nouveaux|nouvelles?|nouveau|derniers? arriv[ée]\w*)\s+(creators?|affiliates?|cr[ée]ateurs?|cr[ée]atrices?|influenc\w*|ambassad\w*)\b|\b(who|qui)\s+(?:have\s+|ont\s+)?(joined|rejoint)\b|\bjoined\b|\brecrues?\b/i;
const MINE = /\b(my|our|mes|mon|ma|nos|notre|i|we|j['’]ai|on a|nous avons|vous avez)\b|\bj['’]/i;
const SEARCH_VERB = /^\s*(find|search|look(?:ing)? for|discover|trouve\w*|cherche\w*|recherche\w*|d[ée]couvr\w*)\b/i;
const EN_ACTION = /^\s*(pay|create|open|send|add|follow\s+up|remind|contact|invite|manage|schedule)\s/i;
const FR_ACTION =
  /^\s*(pay(?:er|ez|e)|paie\w*|cr[ée]{2}[rz]?|ouvr\w*|envoie\w*|envoy\w*|ajout\w*|relanc\w*|contact(?:er|ez|e)|invit(?:er|ez)|g[ée]r(?:er|ez|e))\s/i;

const RANGES: { max: number; range: MinoRevenueRange; days: MinoRevenueAsk["days"] }[] = [
  { max: 1, range: "today", days: 1 },
  { max: 3, range: "3d", days: 3 },
  { max: 7, range: "7d", days: 7 },
  { max: 30, range: "30d", days: 30 },
  { max: Infinity, range: "90d", days: 90 },
];

function snap(days: number): Pick<MinoRevenueAsk, "range" | "days"> {
  const hit = RANGES.find((r) => days <= r.max) ?? RANGES[RANGES.length - 1];
  return { range: hit.range, days: hit.days };
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10, fourteen: 14, thirty: 30, ninety: 90,
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, dix: 10, quinze: 15, trente: 30,
};

/** Number of days the text asks about, or null when it names no period. */
export function parsePeriodDays(text: string): number | null {
  const t = text.toLowerCase();
  const n = (raw: string) => (/^\d+$/.test(raw) ? Number(raw) : WORD_NUMBERS[raw] ?? NaN);
  const count = t.match(/\b(\d+|[a-zé]+)\s+(?:derniers?\s+|dernières?\s+|last\s+|past\s+)?(days?|jours?|weeks?|semaines?|months?|mois)\b/);
  if (count) {
    const v = n(count[1]);
    if (Number.isFinite(v) && v > 0) {
      const unit = count[2];
      if (/^(weeks?|semaines?)$/.test(unit)) return v * 7;
      if (/^(months?|mois)$/.test(unit)) return v * 30;
      return v;
    }
  }
  if (/\b(today|aujourd['’]hui|ce jour)\b/.test(t)) return 1;
  if (/\b(yesterday|hier)\b/.test(t)) return 3;
  if (/\b(quarter|trimestre)\b/.test(t)) return 90;
  if (/\b(week|weekly|semaine|hebdo\w*)\b/.test(t)) return 7;
  if (/\b(month|monthly|mois|mensuel\w*)\b/.test(t)) return 30;
  return null;
}

const CREATOR_STOP = new Set(
  (
    "this that last past the a an my our your me us over in on for since during today yesterday week weeks month months " +
    "day days quarter so far overall total all ce cet cette ces les le la l mes mon ma nos notre vos votre depuis sur en " +
    "pendant aujourd hui hier semaine semaines mois jour jours trimestre dernier derniers dernière dernières du de des au aux " +
    "campaign campaigns campagne campagnes creators creator créateurs créateur créatrices créatrice affiliates shopify tiktok instagram " +
    "et and or ou combien how much"
  ).split(" "),
);

/** The creator named in the ask ("@luna", "avec Luna Beauty"), without "@". */
export function parseCreatorMention(text: string): string | undefined {
  const at = text.match(/@([\w.]{2,40})/);
  if (at) return at[1].replace(/\.+$/, "");
  const after = text.match(/\b(?:with|from|via|through|thanks to|by|avec|gr[âa]ce [àa]|par|pour|for)\s+([^?!.,;:]+)/i);
  if (!after) return undefined;
  const words: string[] = [];
  for (const raw of after[1].trim().split(/\s+/)) {
    const w = raw.replace(/[«»"“”']/g, "");
    if (!w || CREATOR_STOP.has(w.toLowerCase()) || /^\d/.test(w)) break;
    words.push(w);
    if (words.length === 3) break;
  }
  const name = words.join(" ").trim();
  return name.length >= 2 ? name : undefined;
}

/** Asks that start with a verb Mino executes ("Pay…", "Ouvre…", "Go to…"): they go to Mino's actions. */
export function looksLikeAction(text: string): boolean {
  return EN_ACTION.test(text) || FR_ACTION.test(text) || /^\s*(go to|take me to|va (?:sur|dans|à)|emm[èe]ne[- ]moi)(?![\wÀ-ÿ])/i.test(text);
}

/** Null when the text is not a revenue / performance ask. */
export function parseRevenueAsk(text: string): MinoRevenueAsk | null {
  const t = text.trim();
  if (!t) return null;
  // "Pay @luna her commissions", "Open analytics": Mino's actions.
  if (EN_ACTION.test(t) || FR_ACTION.test(t)) return null;

  const periodDays = parsePeriodDays(t);
  const scoped = periodDays !== null || MINE.test(t);
  const strong = STRONG.test(t) || /\bCA\b/.test(t) || (HOW_MUCH.test(t) && scoped && !PRICE.test(t));
  const top = TOP.test(t);
  const isNew = NEW.test(t);
  const weak = WEAK.test(t);

  // "Find the best beauty creators", "find creators who drive sales": creator searches.
  if (SEARCH_VERB.test(t) && !/\b(my|our|mes|mon|ma|nos|notre)\b/i.test(t)) return null;
  // "New creators" stands alone; "top creators" and "stats" need "my" or a period.
  if (!strong && !isNew && !((top || weak) && scoped)) return null;

  const focus: MinoRevenueAsk["focus"] = isNew && !strong ? "new" : top ? "top" : "revenue";
  const creator = focus === "revenue" ? parseCreatorMention(t) : undefined;
  return { ...snap(periodDays ?? 30), focus, ...(creator ? { creator } : {}) };
}

/** Short label of the period, e.g. "Last 7 days" / "7 derniers jours". */
export function revenuePeriodLabel(ask: Pick<MinoRevenueAsk, "range">, lang: "en" | "fr" = "en"): string {
  const fr = lang === "fr";
  switch (ask.range) {
    case "today":
      return fr ? "Aujourd’hui" : "Today";
    case "3d":
      return fr ? "3 derniers jours" : "Last 3 days";
    case "7d":
      return fr ? "7 derniers jours" : "Last 7 days";
    case "90d":
      return fr ? "90 derniers jours" : "Last 90 days";
    default:
      return fr ? "30 derniers jours" : "Last 30 days";
  }
}

/** One-line label, e.g. "Last 7 days · @luna". */
export function describeRevenueAsk(ask: MinoRevenueAsk, lang: "en" | "fr" = "en"): string {
  const parts = [revenuePeriodLabel(ask, lang)];
  if (ask.creator) parts.push(/\s/.test(ask.creator) ? ask.creator : `@${ask.creator}`);
  return parts.join(" · ");
}
