"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CountUp } from "@/app/dashboard/sample-motion";

// ── Formatting ───────────────────────────────────────────────────────────────

export function eur(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(n);
}

export function num(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n < 10_000) return new Intl.NumberFormat("en-US").format(Math.round(n));
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function pct(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(value)}%`;
}

export function dateFr(value: string | number | null | undefined, withTime = false): string {
  if (value === null || value === undefined || value === "") return "—";
  const d = typeof value === "number" ? new Date(value < 1e12 ? value * 1000 : value) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", withTime ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" });
}

export function ago(value: string | null | undefined): string {
  if (!value) return "—";
  const t = Date.parse(value);
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86_400 * 30) return `${Math.round(s / 86_400)} d ago`;
  return dateFr(value);
}

// ── Data fetching ────────────────────────────────────────────────────────────

export function useAdminData<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(res.status === 403 ? "Access denied." : body.error || `Error ${res.status}`);
          return;
        }
        setData(body as T);
      })
      .catch(() => {
        if (!cancelled) setError("Could not connect.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

// ── Building blocks ──────────────────────────────────────────────────────────

export function PageHead({ title, lead, actions }: { title: string; lead?: string; actions?: ReactNode }) {
  return (
    <header className="ad-head">
      <div>
        <h1>{title}</h1>
        {lead ? <p>{lead}</p> : null}
      </div>
      {actions ? <div className="ad-head__actions">{actions}</div> : null}
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
    <section className={`ad-card ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {title || aside ? (
        <div className="ad-card__head">
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
  format = num,
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
  return (
    <div className={`ad-kpi${tone ? ` is-${tone}` : ""}`} style={{ animationDelay: `${delay}ms` }}>
      <span className="ad-kpi__label">{label}</span>
      <strong className="ad-kpi__value">
        {value === null || value === undefined ? "—" : <CountUp value={value} format={format} delayMs={delay} />}
      </strong>
      <span className="ad-kpi__sub">
        {trend !== undefined && trend !== null ? (
          <em className={trend >= 0 ? "is-up" : "is-down"}>
            {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}%
          </em>
        ) : null}
        {sub}
      </span>
    </div>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "good" | "warn" | "bad" | "accent" }) {
  return <span className={`ad-pill is-${tone}`}>{children}</span>;
}

export function Warnings({ items }: { items: string[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="ad-warn" role="status">
      <strong>Incomplete reads</strong>
      <ul>
        {items.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

export function LoadState({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  if (error) {
    return (
      <div className="ad-error" role="alert">
        <strong>Could not load</strong>
        <p>{error}</p>
        <button type="button" className="ad-btn" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="ad-skeleton" aria-label="Loading">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    );
  }
  return null;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="ad-empty">{children}</p>;
}

export function RefreshButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <button type="button" className="ad-btn" onClick={onClick} disabled={loading}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className={loading ? "ad-spin" : ""}>
        <path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Refresh
    </button>
  );
}
