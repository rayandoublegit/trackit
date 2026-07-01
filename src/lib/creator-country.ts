const LOCATION_TO_CODE: Record<string, string> = {
  france: "FR",
  fr: "FR",
  germany: "DE",
  de: "DE",
  deutschland: "DE",
  "united states": "US",
  usa: "US",
  us: "US",
  uk: "GB",
  "united kingdom": "GB",
  gb: "GB",
  england: "GB",
  spain: "ES",
  es: "ES",
  italy: "IT",
  it: "IT",
  canada: "CA",
  ca: "CA",
  belgium: "BE",
  be: "BE",
  switzerland: "CH",
  ch: "CH",
  netherlands: "NL",
  nl: "NL",
  portugal: "PT",
  pt: "PT",
  austria: "AT",
  at: "AT",
  poland: "PL",
  pl: "PL",
};

const LANGUAGE_TO_CODE: Record<string, string> = {
  fr: "FR",
  french: "FR",
  francais: "FR",
  en: "GB",
  english: "GB",
  es: "ES",
  spanish: "ES",
  it: "IT",
  italian: "IT",
  de: "DE",
  german: "DE",
  pt: "PT",
  portuguese: "PT",
};

const COUNTRY_LABELS: Record<string, { en: string; fr: string }> = {
  FR: { en: "France", fr: "France" },
  DE: { en: "Germany", fr: "Allemagne" },
  US: { en: "United States", fr: "États-Unis" },
  GB: { en: "United Kingdom", fr: "Royaume-Uni" },
  ES: { en: "Spain", fr: "Espagne" },
  IT: { en: "Italy", fr: "Italie" },
  CA: { en: "Canada", fr: "Canada" },
  BE: { en: "Belgium", fr: "Belgique" },
  CH: { en: "Switzerland", fr: "Suisse" },
  NL: { en: "Netherlands", fr: "Pays-Bas" },
  PT: { en: "Portugal", fr: "Portugal" },
  AT: { en: "Austria", fr: "Autriche" },
  PL: { en: "Poland", fr: "Pologne" },
};

export function countryCodeToFlag(code: string): string {
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(...[...cc].map((char) => 127397 + char.charCodeAt(0)));
}

export function resolveCreatorCountryCode(
  location?: string | null,
  language?: string | null
): string | null {
  const loc = (location || "").trim().toLowerCase();
  const lang = (language || "").trim().toLowerCase();

  if (loc) {
    if (LOCATION_TO_CODE[loc]) return LOCATION_TO_CODE[loc];
    if (loc.length === 2 && LOCATION_TO_CODE[loc]) return LOCATION_TO_CODE[loc];
    for (const [key, code] of Object.entries(LOCATION_TO_CODE)) {
      if (loc.includes(key)) return code;
    }
  }

  if (lang && LANGUAGE_TO_CODE[lang]) return LANGUAGE_TO_CODE[lang];
  return null;
}

export function getCreatorCountryLabel(code: string, lang: "en" | "fr"): string {
  return COUNTRY_LABELS[code]?.[lang] ?? code;
}

export function getCreatorCountryFlag(
  location?: string | null,
  language?: string | null,
  countryCode?: string | null
): string | null {
  const code = countryCode || resolveCreatorCountryCode(location, language);
  if (!code) return null;
  const flag = countryCodeToFlag(code);
  return flag || null;
}

export function marketDefaultsFromSearch(location?: string, language?: string) {
  const locNorm = String(location || "").toLowerCase().trim();
  const langNorm = String(language || "").toLowerCase().trim();
  const isFrench =
    langNorm === "fr" ||
    langNorm === "french" ||
    locNorm === "fr" ||
    locNorm === "france";
  const isGerman =
    langNorm === "de" ||
    langNorm === "german" ||
    locNorm === "de" ||
    locNorm === "germany";

  if (isFrench) return { language: "fr", location: "France", countryCode: "FR" as const };
  if (isGerman) return { language: "de", location: "Germany", countryCode: "DE" as const };
  if (locNorm === "us" || locNorm === "usa") {
    return { language: "en", location: "United States", countryCode: "US" as const };
  }
  return { language: langNorm || null, location: location || null, countryCode: null as string | null };
}
