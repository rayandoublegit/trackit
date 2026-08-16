export type AppLang = "en" | "fr";
export type DiscoveryLocation = "" | "FR" | "US" | "GB" | "DE" | "ES" | "IT" | "PT" | "BR" | "CA";
export type DiscoveryLanguage = "" | "french" | "english" | "spanish" | "italian" | "german" | "portuguese";

export const TRACKIT_LANG_KEY = "trackit_lang";
export const TRACKIT_CURRENCY_KEY = "trackit_currency";
export const TRACKIT_TIMEZONE_KEY = "trackit_timezone";
export const TRACKIT_DISCOVERY_LOCATION_KEY = "trackit_discovery_location";
export const TRACKIT_DISCOVERY_LANGUAGE_KEY = "trackit_discovery_language";

export const LOCALE_UPDATED_EVENT = "trackit-locale-updated";
export const CURRENCY_UPDATED_EVENT = "trackit-currency-updated";
export const PROFILE_UPDATED_EVENT = "trackit-profile-updated";

export type ProfileUpdatedDetail = {
  full_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
};

export function dispatchProfileUpdated(detail?: ProfileUpdatedDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail }));
}

export type DisplayCurrency = "USD" | "EUR";

function notifyLocaleUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(LOCALE_UPDATED_EVENT));
}

function notifyCurrencyUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CURRENCY_UPDATED_EVENT));
}

export function defaultDisplayCurrency(lang?: AppLang): DisplayCurrency {
  return lang === "fr" ? "EUR" : "USD";
}

export function getDisplayCurrency(lang?: AppLang): DisplayCurrency {
  return defaultDisplayCurrency(lang ?? (typeof window !== "undefined" ? getAppLang() : "en"));
}

/** @deprecated Currency follows app language; kept for locale sync on language change. */
export function setDisplayCurrency(currency: DisplayCurrency): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TRACKIT_CURRENCY_KEY, currency);
  notifyCurrencyUpdated();
}

export function detectAppLangFromBrowser(): AppLang {
  return detectAppLangFromLocation();
}

const FRENCH_REGIONS = new Set([
  "FR",
  "BE",
  "LU",
  "MC",
  "MQ",
  "GP",
  "GF",
  "RE",
  "YT",
  "NC",
  "PF",
  "WF",
  "BL",
  "MF",
  "PM",
  "TF",
]);

const FRENCH_TIMEZONES = new Set([
  "Europe/Paris",
  "Europe/Brussels",
  "Europe/Luxembourg",
  "Europe/Monaco",
  "America/Martinique",
  "America/Guadeloupe",
  "America/Cayenne",
  "America/Miquelon",
  "America/Marigot",
  "Indian/Reunion",
  "Indian/Mayotte",
  "Pacific/Noumea",
  "Pacific/Tahiti",
  "Pacific/Wallis",
  "Pacific/Marquesas",
  "Pacific/Gambier",
]);

function localeRegions(): string[] {
  if (typeof navigator === "undefined") return [];
  const locales = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  const regions: string[] = [];
  for (const locale of locales) {
    try {
      const region = new Intl.Locale(locale).maximize().region;
      if (region) regions.push(region.toUpperCase());
    } catch {
      const match = locale.match(/[-_]([A-Za-z]{2})$/);
      if (match) regions.push(match[1].toUpperCase());
    }
  }
  return regions;
}

/** Infer UI language from timezone + locale region (location), not just browser UI language. */
export function detectAppLangFromLocation(): AppLang {
  if (typeof navigator === "undefined") return "en";

  let timeZone = "";
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    timeZone = "";
  }

  if (FRENCH_TIMEZONES.has(timeZone)) return "fr";

  const regions = localeRegions();
  if (regions.some((region) => FRENCH_REGIONS.has(region))) return "fr";

  const englishRegions = new Set(["US", "GB", "AU", "NZ", "IE"]);
  if (regions.some((region) => englishRegions.has(region))) return "en";
  if (
    /America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Adak|Boise|Detroit|Indiana|Kentucky|Menominee|Nome|Sitka|Yakutat|Honolulu)|Pacific\/Honolulu/.test(
      timeZone,
    )
  ) {
    return "en";
  }

  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

function syncDocumentLang(lang: AppLang) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
}

export function getAppLang(): AppLang {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(TRACKIT_LANG_KEY);
  if (stored === "en" || stored === "fr") {
    syncDocumentLang(stored);
    return stored;
  }
  const detected = detectAppLangFromLocation();
  localStorage.setItem(TRACKIT_LANG_KEY, detected);
  syncDocumentLang(detected);
  return detected;
}

export function setAppLang(lang: AppLang): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TRACKIT_LANG_KEY, lang);
  syncDocumentLang(lang);
  notifyLocaleUpdated();
}

const DEFAULT_TIMEZONE = "Europe/Paris";
const VALID_TIMEZONES = [
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
] as const;

export type AppTimezone = (typeof VALID_TIMEZONES)[number];

export function getAppTimezone(): AppTimezone {
  if (typeof window === "undefined") return DEFAULT_TIMEZONE;
  const stored = localStorage.getItem(TRACKIT_TIMEZONE_KEY);
  if (stored && (VALID_TIMEZONES as readonly string[]).includes(stored)) {
    return stored as AppTimezone;
  }
  return DEFAULT_TIMEZONE;
}

export function setAppTimezone(timezone: AppTimezone): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TRACKIT_TIMEZONE_KEY, timezone);
}

export function getDiscoveryLocation(): DiscoveryLocation {
  if (typeof window === "undefined") return "";
  const stored = localStorage.getItem(TRACKIT_DISCOVERY_LOCATION_KEY);
  const valid: DiscoveryLocation[] = ["", "FR", "US", "GB", "DE", "ES", "IT", "PT", "BR", "CA"];
  if (stored !== null && valid.includes(stored as DiscoveryLocation)) return stored as DiscoveryLocation;
  return "";
}

export function getDiscoveryLanguage(): DiscoveryLanguage {
  if (typeof window === "undefined") return "";
  const stored = localStorage.getItem(TRACKIT_DISCOVERY_LANGUAGE_KEY);
  const valid: DiscoveryLanguage[] = ["", "french", "english", "spanish", "italian", "german", "portuguese"];
  if (stored !== null && valid.includes(stored as DiscoveryLanguage)) return stored as DiscoveryLanguage;
  return "";
}

export function setDiscoveryPrefs(location: DiscoveryLocation, language: DiscoveryLanguage): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TRACKIT_DISCOVERY_LOCATION_KEY, location);
  localStorage.setItem(TRACKIT_DISCOVERY_LANGUAGE_KEY, language);
  notifyLocaleUpdated();
}

export function applyAppLocale(lang: AppLang): void {
  setAppLang(lang);
  setDisplayCurrency(defaultDisplayCurrency(lang));
  if (lang === "fr") {
    setDiscoveryPrefs("FR", "french");
    return;
  }
  setDiscoveryPrefs("", "");
}

/** Keep language / discovery filters when signing out. */
export function clearUserSessionStorage(): void {
  if (typeof window === "undefined") return;
  const preserved: Record<string, string | null> = {
    [TRACKIT_LANG_KEY]: localStorage.getItem(TRACKIT_LANG_KEY),
    [TRACKIT_CURRENCY_KEY]: localStorage.getItem(TRACKIT_CURRENCY_KEY),
    [TRACKIT_DISCOVERY_LOCATION_KEY]: localStorage.getItem(TRACKIT_DISCOVERY_LOCATION_KEY),
    [TRACKIT_DISCOVERY_LANGUAGE_KEY]: localStorage.getItem(TRACKIT_DISCOVERY_LANGUAGE_KEY),
  };
  localStorage.clear();
  sessionStorage.clear();
  for (const [key, value] of Object.entries(preserved)) {
    if (value) localStorage.setItem(key, value);
  }
}
