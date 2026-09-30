"use client";

// Shared money formatting and the daily revenue chart (Mino widgets, marketing hero demo).
import { useId, useState } from "react";
import "./sample-preview.css";

type Lang = "en" | "fr";

export function formatMoney(n: number, lang: Lang, decimals = 0): string {
  return new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency: lang === "fr" ? "EUR" : "USD",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n);
}

export function RevenueChart({ lang, days }: { lang: Lang; days: number[] }) {
  // Several charts can be mounted at once: each needs its own gradient id.
  const gradientId = `sp-area-${useId().replace(/:/g, "")}`;
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const height = 200;
  const pad = 8;
  const max = Math.max(1, ...days);
  const step = days.length > 1 ? (width - pad * 2) / (days.length - 1) : 0;
  const points = days.map((v, i) => [pad + i * step, height - pad - (v / max) * (height - pad * 2 - 16)] as const);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${(pad + (days.length - 1) * step).toFixed(1)},${height - pad} L${pad},${height - pad} Z`;
  const active = hover !== null ? points[hover] : null;
  const dot = active ?? points[points.length - 1] ?? null;
  const dayLabel = (i: number) => {
    const d = new Date(Date.now() - (days.length - 1 - i) * 86_400_000);
    return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "short" });
  };

  return (
    <div className="sp-chart">
      <div className="sp-chart__plot">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={lang === "fr" ? "Courbe des ventes quotidiennes" : "Daily sales curve"}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * width;
          const i = Math.round((x - pad) / (step || 1));
          setHover(Math.max(0, Math.min(days.length - 1, i)));
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--ws-accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--ws-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={width} y1={height * f} y2={height * f} className="sp-chart__grid" />
        ))}
        <path d={area} fill={`url(#${gradientId})`} className="sp-chart__area" />
        <path d={line} fill="none" className="sp-chart__line" pathLength={1} />
        {active ? <line x1={active[0]} x2={active[0]} y1={0} y2={height} className="sp-chart__cursor" /> : null}
      </svg>
      {dot ? (
        <span
          className={`sp-chart__pt${active ? "" : " is-pulse"}`}
          aria-hidden
          style={{ left: `${(dot[0] / width) * 100}%`, top: `${(dot[1] / height) * 100}%` }}
        />
      ) : null}
      </div>
      {hover !== null ? (
        <div className="sp-chart__tip" style={{ left: `${(points[hover][0] / width) * 100}%` }}>
          <span>{dayLabel(hover)}</span>
          <strong>{formatMoney(days[hover], lang)}</strong>
        </div>
      ) : null}
      <div className="sp-chart__axis" aria-hidden>
        <span>{dayLabel(0)}</span>
        <span>{dayLabel(Math.floor(days.length / 2))}</span>
        <span>{lang === "fr" ? "Aujourd’hui" : "Today"}</span>
      </div>
    </div>
  );
}
