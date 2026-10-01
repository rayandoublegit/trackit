"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CountUp } from "@/app/dashboard/sample-motion";
import { useLang, type Lang } from "@/lib/useLang";

// ── Formatting ───────────────────────────────────────────────────────────────

export type AdminFormat = {
  eur: (n: number | null | undefined, decimals?: number) => string;
  num: (n: number | null | undefined) => string;
  compact: (n: number | null | undefined) => string;
  pct: (value: number | null | undefined, decimals?: number) => string;
  dateFr: (value: string | number | null | undefined, withTime?: boolean) => string;
  ago: (value: string | null | undefined) => string;
};

/** Formatters in the console language (en-US or fr-FR). Amounts stay in EUR. */
export function adminFormat(lang: Lang): AdminFormat {
  const fr = lang === "fr";
  const locale = fr ? "fr-FR" : "en-US";

  const eur = (n: number | null | undefined, decimals = 0): string => {
    if (n === null || n === undefined || !Number.isFinite(n)) return "—";
    return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(n);
  };

  const num = (n: number | null | undefined): string => {
    if (n === null || n === undefined || !Number.isFinite(n)) return "—";
    return new Intl.NumberFormat(locale).format(Math.round(n));
  };

  const compact = (n: number | null | undefined): string => {
    if (n === null || n === undefined || !Number.isFinite(n)) return "—";
    if (n < 10_000) return new Intl.NumberFormat(locale).format(Math.round(n));
    return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);
  };

  const pct = (value: number | null | undefined, decimals = 1): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) return "—";
    const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(value);
    return fr ? `${formatted} %` : `${formatted}%`;
  };

  const dateFr = (value: string | number | null | undefined, withTime = false): string => {
    if (value === null || value === undefined || value === "") return "—";
    const d = typeof value === "number" ? new Date(value < 1e12 ? value * 1000 : value) : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(locale, withTime ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" });
  };

  const ago = (value: string | null | undefined): string => {
    if (!value) return "—";
    const t = Date.parse(value);
    if (Number.isNaN(t)) return "—";
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return fr ? "à l’instant" : "just now";
    if (s < 3600) return fr ? `il y a ${Math.round(s / 60)} min` : `${Math.round(s / 60)} min ago`;
    if (s < 86_400) return fr ? `il y a ${Math.round(s / 3600)} h` : `${Math.round(s / 3600)} h ago`;
    if (s < 86_400 * 30) return fr ? `il y a ${Math.round(s / 86_400)} j` : `${Math.round(s / 86_400)} d ago`;
    return dateFr(value);
  };

  return { eur, num, compact, pct, dateFr, ago };
}

const EN_FORMAT = adminFormat("en");
export const { eur, num, compact, pct, dateFr, ago } = EN_FORMAT;
const FR_FORMAT = adminFormat("fr");

export function useAdminFormat(): AdminFormat {
  return useLang() === "fr" ? FR_FORMAT : EN_FORMAT;
}

/** Pick the string for the console language. */
export function useT(): (en: string, fr: string) => string {
  const lang = useLang();
  return useCallback((en: string, fr: string) => (lang === "fr" ? fr : en), [lang]);
}

// ── Data fetching ────────────────────────────────────────────────────────────

export function useAdminData<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const lang = useLang();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailure(null);
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setFailure(res.status === 403 ? { kind: "denied" } : body.error ? { kind: "server", message: String(body.error) } : { kind: "status", status: res.status });
          return;
        }
        setData(body as T);
      })
      .catch(() => {
        if (!cancelled) setFailure({ kind: "network" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const error = failure ? failureMessage(failure, lang) : "";
  return { data, error, loading, reload };
}

type Failure = { kind: "denied" } | { kind: "network" } | { kind: "server"; message: string } | { kind: "status"; status: number };

function failureMessage(f: Failure, lang: Lang): string {
  const fr = lang === "fr";
  if (f.kind === "denied") return fr ? "Accès refusé." : "Access denied.";
  if (f.kind === "network") return fr ? "Connexion impossible." : "Could not connect.";
  if (f.kind === "server") return f.message;
  return fr ? `Erreur ${f.status}` : `Error ${f.status}`;
}

/** Server-side read warnings ("table: table missing") in the console language. */
export function translateWarning(w: string, lang: Lang): string {
  if (lang !== "fr") return w;
  if (w === "profiles: more than 50,000 rows, totals are truncated.") return "profiles : plus de 50 000 lignes, les totaux sont tronqués.";
  const missing = /^(.+): table missing$/.exec(w);
  if (missing) return `${missing[1]} : table absente`;
  return w;
}

// ── Building blocks ──────────────────────────────────────────────────────────

export function PageHead({ title, lead, actions }: { title: string; lead?: string; actions?: ReactNode }) {
  return (
    <header className="tc-head">
      <div>
        <h1>{title}</h1>
        {lead ? <p>{lead}</p> : null}
      </div>
      {actions ? <div className="tc-head__actions">{actions}</div> : null}
    </header>
  );
}

export function Card({
  title,
  aside,
  children,
  className = "",
  delay = 0,
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <section className={`tc-card ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {title || aside ? (
        <div className="tc-card__head">
          {title ? <h2>{title}</h2> : <span />}
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  format,
  sub,
  trend,
  tone,
  delay = 0,
}: {
  label: string;
  value: number | null | undefined;
  format?: (n: number) => string;
  sub?: ReactNode;
  trend?: number | null;
  tone?: "accent" | "good" | "warn";
  delay?: number;
}) {
  const f = useAdminFormat();
  const fr = useLang() === "fr";
  return (
    <div className={`tc-kpi${tone ? ` is-${tone}` : ""}`} style={{ animationDelay: `${delay}ms` }}>
      <span className="tc-kpi__label">{label}</span>
      <strong className="tc-kpi__value">
        {value === null || value === undefined ? "—" : <CountUp value={value} format={format ?? f.num} delayMs={delay} />}
      </strong>
      <span className="tc-kpi__sub">
        {trend !== undefined && trend !== null ? (
          <em className={trend >= 0 ? "is-up" : "is-down"}>
            {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}{fr ? " %" : "%"}
          </em>
        ) : null}
        {sub}
      </span>
    </div>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "good" | "warn" | "bad" | "accent" }) {
  return <span className={`tc-pill is-${tone}`}>{children}</span>;
}

export function Warnings({ items }: { items: string[] | undefined }) {
  const lang = useLang();
  if (!items || items.length === 0) return null;
  return (
    <div className="tc-warn" role="status">
      <strong>{lang === "fr" ? "Lectures incomplètes" : "Incomplete reads"}</strong>
      <ul>
        {items.map((w) => (
          <li key={w}>{translateWarning(w, lang)}</li>
        ))}
      </ul>
    </div>
  );
}

export function LoadState({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  const fr = useLang() === "fr";
  if (error) {
    return (
      <div className="tc-error" role="alert">
        <strong>{fr ? "Chargement impossible" : "Could not load"}</strong>
        <p>{error}</p>
        <button type="button" className="tc-btn" onClick={onRetry}>
          {fr ? "Réessayer" : "Retry"}
        </button>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="tc-skeleton" aria-label={fr ? "Chargement" : "Loading"}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    );
  }
  return null;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="tc-empty">{children}</p>;
}

export function RefreshButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  const fr = useLang() === "fr";
  return (
    <button type="button" className="tc-btn" onClick={onClick} disabled={loading}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className={loading ? "tc-spin" : ""}>
        <path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {fr ? "Actualiser" : "Refresh"}
    </button>
  );
}
