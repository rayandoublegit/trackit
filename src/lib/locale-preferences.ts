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

/** French lives under /fr; the unprefixed site is English. */
export function isFrPath(pathname: string): boolean {
  return pathname === "/fr" || pathname.startsWith("/fr/");
}

// The app (signed-in areas and auth hand-offs) has no /fr twin for every
// screen: it follows the language the visitor last chose on the site.
// /auth is included: sign-out, expired sessions and the middleware all land on
// /auth without the /fr prefix. Keep in sync with the boot script in app/layout.tsx.
export const APP_PATH_PREFIXES = ["/dashboard", "/onboarding", "/settings", "/admin", "/invite", "/auth", "/l/"];

export function isAppPath(pathname: string): boolean {
  const path = isFrPath(pathname) ? pathname.slice(3) || "/" : pathname;
  return APP_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`) || path.startsWith(`${prefix}?`));
}

/** Language implied by the address: /fr → French, public English pages → English, app → stored choice. */
export function detectAppLangFromLocation(): AppLang {
  if (typeof window === "undefined") return "en";
  const path = window.location.pathname;
  if (isFrPath(path)) return "fr";
  if (!isAppPath(path)) return "en";
  try {
    return localStorage.getItem(TRACKIT_LANG_KEY) === "fr" ? "fr" : "en";
  } catch {
    return "en";
  }
}

/**
 * Prefix an internal link with /fr for French pages. External links, anchors,
 * API routes and files are left alone.
 */
export function localizeHref(href: string, lang: AppLang): string {
  if (lang !== "fr" || !href.startsWith("/") || href.startsWith("//")) return href;
  if (isFrPath(href.split(/[?#]/)[0])) return href;
  if (/^\/(api|_next)(\/|$)/.test(href) || /\.[a-z0-9]+($|[?#])/i.test(href.split(/[?#]/)[0])) return href;
  return href === "/" ? "/fr" : href.startsWith("/?") || href.startsWith("/#") ? `/fr${href.slice(1)}` : `/fr${href}`;
}

/** The same page in the other language. */
export function alternateLangPath(pathname: string, target: AppLang): string {
  const bare = isFrPath(pathname) ? pathname.slice(3) || "/" : pathname;
  return target === "fr" ? localizeHref(bare, "fr") : bare;
}

function syncDocumentLang(lang: AppLang) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
}

/**
 * What to remember after showing `lang` on `pathname`. A /fr page is a clear
 * choice of French. An unprefixed public page is English only by default (the
 * app sends people to /auth, /pricing… without /fr), so it must not overwrite a
 * French choice: that reset is what turned the dashboard English after a sign-in.
 */
export function langToRemember(
  pathname: string,
  lang: AppLang,
  stored: string | null,
  explicit?: string | null,
): AppLang | null {
  // A language switch link (…?lang=en) is an explicit choice.
  if ((explicit === "en" || explicit === "fr") && explicit === lang) return stored === explicit ? null : explicit;
  if (isFrPath(pathname)) return stored === "fr" ? null : "fr";
  if (isAppPath(pathname)) return null;
  return stored === "fr" || stored === "en" ? null : lang;
}

/** Current app language; remembers it so the signed-in app keeps it. */
export function getAppLang(): AppLang {
  if (typeof window === "undefined") return "en";
  const lang = detectAppLangFromLocation();
  try {
    const explicit = new URLSearchParams(window.location.search).get("lang");
    const remember = langToRemember(window.location.pathname, lang, localStorage.getItem(TRACKIT_LANG_KEY), explicit);
    if (remember) localStorage.setItem(TRACKIT_LANG_KEY, remember);
  } catch {
    // storage blocked: the address still decides
  }
  syncDocumentLang(lang);
  return lang;
}

/** Explicit choice (settings, language switch): stored, and applied on app pages. */
export function setAppLang(lang: AppLang): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TRACKIT_LANG_KEY, lang);
  } catch {
    // storage blocked
  }
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
    // Cookie consent outlives the session (asked again after 6 months only).
    trackit_cookie_consent: localStorage.getItem("trackit_cookie_consent"),
  };
  localStorage.clear();
  sessionStorage.clear();
  for (const [key, value] of Object.entries(preserved)) {
    if (value) localStorage.setItem(key, value);
  }
}
