export type AppLang = "en" | "fr";
export type DiscoveryLocation = "" | "FR" | "US" | "GB" | "DE" | "ES" | "IT" | "PT" | "BR" | "CA";
export type DiscoveryLanguage = "" | "french" | "english" | "spanish" | "italian" | "german" | "portuguese";

export const TRACKIT_LANG_KEY = "trackit_lang";
export const TRACKIT_CURRENCY_KEY = "trackit_currency";
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
  if (typeof navigator === "undefined") return "en";
  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function getAppLang(): AppLang {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(TRACKIT_LANG_KEY);
  if (stored === "en" || stored === "fr") return stored;
  const detected = detectAppLangFromBrowser();
  localStorage.setItem(TRACKIT_LANG_KEY, detected);
  return detected;
}

export function setAppLang(lang: AppLang): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TRACKIT_LANG_KEY, lang);
  notifyLocaleUpdated();
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
