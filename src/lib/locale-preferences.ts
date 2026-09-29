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

/** The whole product is English. */
export function detectAppLangFromLocation(): AppLang {
  return "en";
}

function syncDocumentLang(lang: AppLang) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
}

/**
 * The site is English only, everywhere (landing, auth, dashboard, admin).
 * A French choice stored by an older version is overwritten.
 */
export function getAppLang(): AppLang {
  if (typeof window === "undefined") return "en";
  try {
    if (localStorage.getItem(TRACKIT_LANG_KEY) !== "en") localStorage.setItem(TRACKIT_LANG_KEY, "en");
  } catch {
    // storage blocked: English anyway
  }
  syncDocumentLang("en");
  return "en";
}

export function setAppLang(_lang: AppLang): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TRACKIT_LANG_KEY, "en");
  } catch {
    // storage blocked
  }
  syncDocumentLang("en");
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
