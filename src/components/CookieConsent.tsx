"use client";

import Link from "next/link";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { useLang } from "@/lib/useLang";
import { isAppPath, isFrPath, type AppLang } from "@/lib/locale-preferences";
import { legalLinks } from "@/lib/legal-links";
import "./cookie-consent.css";

/*
 * CNIL-compliant cookie consent.
 * - Nothing that needs consent (Microsoft Clarity) loads before "Accept all".
 * - "Reject all" and "Accept all" are equally prominent.
 * - The choice is stored for 6 months in localStorage, then asked again.
 * - The choice can be changed at any time: openCookieConsent() or <ManageCookiesLink />.
 */

export const COOKIE_CONSENT_KEY = "trackit_cookie_consent";
const CONSENT_VERSION = 1;
/** 6 months, as recommended by the CNIL for keeping a consent choice. */
const CONSENT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 182;
const CONSENT_CHANGED_EVENT = "trackit-cookie-consent-changed";
const CONSENT_OPEN_EVENT = "trackit-cookie-consent-open";

const CLARITY_PROJECT_ID = "wycxeotj7b";
const CLARITY_COOKIES = ["_clck", "_clsk", "CLID", "ANONCHK", "MR", "MUID", "SM"];

export type CookieConsentState = "unset" | "accepted" | "rejected";
type StoredConsent = { v: number; analytics: boolean; ts: number };

// Fallback when storage is blocked, so the banner can still be dismissed for this visit.
let memoryConsent: string | null = null;

function readRaw(): string | null {
  try {
    return localStorage.getItem(COOKIE_CONSENT_KEY) ?? memoryConsent;
  } catch {
    return memoryConsent;
  }
}

function parseConsent(raw: string | null): StoredConsent | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    if (parsed.v !== CONSENT_VERSION || typeof parsed.analytics !== "boolean" || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > CONSENT_MAX_AGE_MS) return null;
    return parsed as StoredConsent;
  } catch {
    return null;
  }
}

/** Current choice in this browser ("unset" when never given or older than 6 months). */
export function getCookieConsent(): CookieConsentState {
  if (typeof window === "undefined") return "unset";
  const consent = parseConsent(readRaw());
  if (!consent) return "unset";
  return consent.analytics ? "accepted" : "rejected";
}

export function hasAnalyticsConsent(): boolean {
  return getCookieConsent() === "accepted";
}

type ClarityFn = (...args: unknown[]) => void;

function clearClarityCookies() {
  const host = window.location.hostname;
  const parts = host.split(".");
  const domains: (string | null)[] = [null];
  for (let i = 0; i < parts.length - 1; i++) {
    const domain = parts.slice(i).join(".");
    domains.push(domain, `.${domain}`);
  }
  for (const name of CLARITY_COOKIES) {
    for (const domain of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain ? `; domain=${domain}` : ""}`;
    }
  }
}

/** Save the visitor's choice (true = accept audience measurement). */
export function setCookieConsent(analytics: boolean): void {
  if (typeof window === "undefined") return;
  const previous = getCookieConsent();
  const value = JSON.stringify({ v: CONSENT_VERSION, analytics, ts: Date.now() } satisfies StoredConsent);
  memoryConsent = value;
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, value);
  } catch {
    // storage blocked: the choice holds for this visit only
  }

  if (!analytics) {
    const clarity = (window as unknown as { clarity?: ClarityFn }).clarity;
    try {
      clarity?.("consentv2", { ad_Storage: "denied", analytics_Storage: "denied" });
      clarity?.("consent", false);
    } catch {
      // ignore
    }
    clearClarityCookies();
    // Clarity was already running on this page: reload so it stops for good.
    if (previous === "accepted" && clarity) {
      window.location.reload();
      return;
    }
  }
  window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
}

/** Reopen the cookie banner (e.g. from a "Manage cookies" link in a footer). */
export function openCookieConsent(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === COOKIE_CONSENT_KEY || e.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
  };
}

function useConsentState(): CookieConsentState | "pending" {
  return useSyncExternalStore(subscribe, getCookieConsent, () => "pending" as const);
}

function useBannerLang(): AppLang {
  const lang = useLang();
  const pathname = usePathname() ?? "/";
  if (isFrPath(pathname)) return "fr";
  if (!isAppPath(pathname)) return "en";
  return lang;
}

const COPY = {
  fr: {
    title: "Vos choix sur les cookies",
    body: "Avec votre accord, nous utilisons des cookies de mesure d'audience (Microsoft Clarity) pour comprendre l'usage du site et l'améliorer. Les traceurs indispensables au fonctionnement du site restent actifs. Vous pouvez changer d'avis à tout moment via « Gérer les cookies ».",
    more: "Politique cookies",
    reject: "Tout refuser",
    accept: "Tout accepter",
    close: "Fermer",
    current: { accepted: "Choix actuel : cookies acceptés.", rejected: "Choix actuel : cookies refusés." },
    manage: "Gérer les cookies",
  },
  en: {
    title: "Your cookie choices",
    body: "With your consent, we use audience measurement cookies (Microsoft Clarity) to understand how the site is used and improve it. Trackers needed for the site to work stay on. You can change your mind at any time via \"Manage cookies\".",
    more: "Cookie policy",
    reject: "Reject all",
    accept: "Accept all",
    close: "Close",
    current: { accepted: "Current choice: cookies accepted.", rejected: "Current choice: cookies rejected." },
    manage: "Manage cookies",
  },
} as const;

/** Banner + consent-gated Microsoft Clarity. Mounted once, in the root layout. */
export function CookieConsent() {
  const state = useConsentState();
  const lang = useBannerLang();
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    const onOpen = () => setReopened(true);
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
  }, []);

  const show = state === "unset" || (reopened && state !== "pending");
  const copy = COPY[lang];
  const cookiesHref = legalLinks(lang).find((l) => l.key === "cookies")!.href;

  const choose = (analytics: boolean) => {
    setReopened(false);
    setCookieConsent(analytics);
  };

  return (
    <>
      {state === "accepted" && (
        <Script
          id="microsoft-clarity"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");
    window.clarity("consentv2",{ad_Storage:"denied",analytics_Storage:"granted"});`,
          }}
        />
      )}
      {show && (
        <div className="cc-banner" role="dialog" aria-modal="false" aria-labelledby="cc-title" aria-describedby="cc-body" lang={lang}>
          <div className="cc-head">
            <p id="cc-title" className="cc-title">
              {copy.title}
            </p>
            {state !== "unset" && (
              <button type="button" className="cc-close" aria-label={copy.close} onClick={() => setReopened(false)}>
                ×
              </button>
            )}
          </div>
          <p id="cc-body" className="cc-body">
            {copy.body}{" "}
            <Link href={cookiesHref} className="cc-more">
              {copy.more}
            </Link>
          </p>
          {state === "accepted" || state === "rejected" ? <p className="cc-current">{copy.current[state]}</p> : null}
          <div className="cc-actions">
            <button type="button" className="cc-btn" onClick={() => choose(false)}>
              {copy.reject}
            </button>
            <button type="button" className="cc-btn" onClick={() => choose(true)}>
              {copy.accept}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * "Gérer les cookies / Manage cookies" link for footers. Renders a button that
 * looks like a link and reopens the consent banner.
 */
export function ManageCookiesLink({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const lang = useLang();
  return (
    <button
      type="button"
      className={className ? `cc-manage-link ${className}` : "cc-manage-link"}
      style={style}
      onClick={openCookieConsent}
    >
      {children ?? COPY[lang].manage}
    </button>
  );
}
