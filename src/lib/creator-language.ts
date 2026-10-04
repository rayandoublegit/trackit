// Language and country of a creator, from what the platforms actually say:
// TikTok tags every video with the language it detected (desc_language) and the
// account's region (author.region). Text analysis of captions and bio is the
// fallback when a source gives neither.

export type ContentLanguage = "fr" | "en" | "es" | "de" | "it" | "pt";
export const CONTENT_LANGUAGES: readonly ContentLanguage[] = ["fr", "en", "es", "de", "it", "pt"];

// Short, frequent function words: distinctive per language, rare in the others.
const STOPWORDS: Record<ContentLanguage, string[]> = {
  fr: ["le", "la", "les", "des", "est", "et", "une", "du", "pour", "pas", "que", "qui", "dans", "sur", "avec", "mon", "ma", "mes", "je", "tu", "nous", "vous", "ce", "cette", "mais", "tout", "plus", "aussi", "comme", "sont", "au", "aux", "quand", "trop", "très", "c'est", "j'ai", "ça"],
  en: ["the", "and", "is", "are", "you", "your", "this", "that", "with", "for", "of", "to", "my", "it", "was", "what", "how", "when", "just", "not", "be", "have", "can", "will", "all", "so", "don't", "i'm", "it's", "these", "they", "who", "out", "about"],
  es: ["el", "los", "las", "es", "y", "una", "del", "para", "con", "por", "que", "como", "pero", "más", "muy", "esto", "esta", "este", "mi", "tu", "yo", "lo", "hoy", "cuando", "también", "porque", "aquí"],
  de: ["der", "die", "das", "und", "ist", "nicht", "ein", "eine", "mit", "für", "auf", "ich", "du", "wir", "sie", "es", "zu", "von", "den", "dem", "auch", "wie", "aber", "mein", "heute", "noch", "nur"],
  it: ["il", "lo", "gli", "di", "che", "è", "per", "con", "non", "una", "uno", "del", "della", "sono", "mi", "ti", "questo", "questa", "come", "anche", "ma", "più", "oggi", "molto", "tutto"],
  pt: ["o", "os", "as", "é", "e", "um", "uma", "do", "da", "dos", "para", "com", "não", "que", "como", "mas", "mais", "muito", "meu", "minha", "você", "eu", "isso", "hoje", "também", "está"],
};
const STOPWORD_SETS = Object.fromEntries(CONTENT_LANGUAGES.map((l) => [l, new Set(STOPWORDS[l])])) as Record<ContentLanguage, Set<string>>;

/** Language of a piece of text by function-word counts; null when too short or unclear. */
export function detectTextLanguage(text: string): { lang: ContentLanguage; confidence: number } | null {
  const words = text
    .toLowerCase()
    .replace(/https?:\/\/\S+|[#@][\p{L}\p{N}_.]+/gu, " ")
    .split(/[^\p{L}'’]+/u)
    .map((w) => w.replace(/’/g, "'"))
    .filter(Boolean);
  if (words.length < 4) return null;
  const scores = CONTENT_LANGUAGES.map((lang) => ({ lang, hits: words.filter((w) => STOPWORD_SETS[lang].has(w)).length }));
  scores.sort((a, b) => b.hits - a.hits);
  const [best, second] = scores;
  if (best.hits < 3) return null;
  const confidence = best.hits / (best.hits + second.hits);
  return confidence >= 0.62 ? { lang: best.lang, confidence } : null;
}

function normalizeLang(raw: string | null | undefined): ContentLanguage | null {
  const code = (raw || "").trim().toLowerCase().slice(0, 2);
  return (CONTENT_LANGUAGES as readonly string[]).includes(code) ? (code as ContentLanguage) : null;
}

/** The value most entries agree on, when enough of them do. */
function majority<T extends string>(values: T[], minVotes: number, minShare: number): T | null {
  if (!values.length) return null;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const [top, votes] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return votes >= minVotes && votes / values.length >= minShare ? top : null;
}

/**
 * The language a creator posts in. Platform-detected video languages vote first
 * (other languages than the six we filter on still count as votes, so an Arabic
 * account never becomes "fr" by default); then the captions and bio as text.
 */
export function creatorLanguage(input: { videoLanguages?: (string | null | undefined)[]; captions?: string[]; bio?: string | null }): string | null {
  const tagged = (input.videoLanguages ?? [])
    .map((l) => (l || "").trim().toLowerCase().slice(0, 2))
    .filter((l) => l && l !== "un");
  const voted = majority(tagged, 2, 0.5);
  if (voted) return normalizeLang(voted) ?? voted;

  const captions = (input.captions ?? []).filter((c) => c && c.trim());
  const perCaption = captions.map((c) => detectTextLanguage(c)?.lang).filter((l): l is ContentLanguage => Boolean(l));
  const fromCaptions = majority(perCaption, 2, 0.6);
  if (fromCaptions) return fromCaptions;
  return detectTextLanguage([input.bio ?? "", ...captions].join(" \n "))?.lang ?? null;
}

/** ISO country of a creator from the account regions the videos carry; null when they don't say. */
export function creatorCountry(input: { regions?: (string | null | undefined)[]; profileRegion?: string | null }): string | null {
  const profile = (input.profileRegion || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(profile)) return profile;
  const regions = (input.regions ?? []).map((r) => (r || "").trim().toUpperCase()).filter((r) => /^[A-Z]{2}$/.test(r));
  return majority(regions, 1, 0.5);
}
