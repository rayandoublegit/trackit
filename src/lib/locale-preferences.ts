export type AppLang = "en" | "fr";
export type DiscoveryLocation = "FR" | "US";
export type DiscoveryLanguage = "french" | "english";

export const TRACKIT_LANG_KEY = "trackit_lang";
export const TRACKIT_DISCOVERY_LOCATION_KEY = "trackit_discovery_location";
export const TRACKIT_DISCOVERY_LANGUAGE_KEY = "trackit_discovery_language";

export const LOCALE_UPDATED_EVENT = "trackit-locale-updated";

function notifyLocaleUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(LOCALE_UPDATED_EVENT));
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
  if (typeof window === "undefined") return "US";
  const stored = localStorage.getItem(TRACKIT_DISCOVERY_LOCATION_KEY);
  if (stored === "FR" || stored === "US") return stored;
  return getAppLang() === "fr" ? "FR" : "US";
}

export function getDiscoveryLanguage(): DiscoveryLanguage {
  if (typeof window === "undefined") return "english";
  const stored = localStorage.getItem(TRACKIT_DISCOVERY_LANGUAGE_KEY);
  if (stored === "french" || stored === "english") return stored;
  return getAppLang() === "fr" ? "french" : "english";
}

export function setDiscoveryPrefs(location: DiscoveryLocation, language: DiscoveryLanguage): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TRACKIT_DISCOVERY_LOCATION_KEY, location);
  localStorage.setItem(TRACKIT_DISCOVERY_LANGUAGE_KEY, language);
  if (location === "FR" || language === "french") {
    localStorage.setItem(TRACKIT_LANG_KEY, "fr");
  } else if (location === "US" && language === "english") {
    localStorage.setItem(TRACKIT_LANG_KEY, "en");
  }
  notifyLocaleUpdated();
}

export function applyAppLocale(lang: AppLang): void {
  if (lang === "fr") {
    setDiscoveryPrefs("FR", "french");
    return;
  }
  setDiscoveryPrefs("US", "english");
}

/** Keep language / discovery filters when signing out. */
export function clearUserSessionStorage(): void {
  if (typeof window === "undefined") return;
  const preserved: Record<string, string | null> = {
    [TRACKIT_LANG_KEY]: localStorage.getItem(TRACKIT_LANG_KEY),
    [TRACKIT_DISCOVERY_LOCATION_KEY]: localStorage.getItem(TRACKIT_DISCOVERY_LOCATION_KEY),
    [TRACKIT_DISCOVERY_LANGUAGE_KEY]: localStorage.getItem(TRACKIT_DISCOVERY_LANGUAGE_KEY),
  };
  localStorage.clear();
  sessionStorage.clear();
  for (const [key, value] of Object.entries(preserved)) {
    if (value) localStorage.setItem(key, value);
  }
}
