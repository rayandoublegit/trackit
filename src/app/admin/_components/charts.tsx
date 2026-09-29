"use client";

import { useId, useState } from "react";
import type { DayPoint } from "@/lib/admin-aggregate";

// Small dependency-free SVG charts for the staff console.

function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function AreaChart({
  series,
  format,
  height = 180,
  color = "var(--ad-accent)",
}: {
  series: DayPoint[];
  format: (n: number) => string;
  height?: number;
  color?: string;
}) {
  const gid = `ad-area-${useId().replace(/:/g, "")}`;
  const [hover, setHover] = useState<number | null>(null);
  const w = 600;
  const h = height;
  const pad = 6;
  const max = Math.max(1, ...series.map((p) => p.value));
  const step = series.length > 1 ? (w - pad * 2) / (series.length - 1) : 0;
  const pts = series.map((p, i) => [pad + i * step, h - pad - (p.value / max) * (h - pad * 2 - 10)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = pts.length ? `${line} L${pts[pts.length - 1][0]},${h - pad} L${pad},${h - pad} Z` : "";
  const active = hover !== null ? pts[hover] : pts[pts.length - 1];

  if (series.length === 0) return null;
  return (
    <div className="ad-chart">
      <div className="ad-chart__plot" style={{ height }}>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * w;
            setHover(Math.max(0, Math.min(series.length - 1, Math.round((x - pad) / (step || 1)))));
          }}
          role="img"
          aria-label="Daily trend"
        >
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.26" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} x2={w} y1={h * f} y2={h * f} className="ad-chart__grid" />
          ))}
          <path d={area} fill={`url(#${gid})`} className="ad-chart__area" />
          <path d={line} fill="none" stroke={color} className="ad-chart__line" pathLength={1} />
          {hover !== null ? <line x1={pts[hover][0]} x2={pts[hover][0]} y1={0} y2={h} className="ad-chart__cursor" /> : null}
        </svg>
        {active ? (
          <span
            className={`ad-chart__dot${hover === null ? " is-pulse" : ""}`}
            style={{ left: `${(active[0] / w) * 100}%`, top: `${(active[1] / h) * 100}%`, borderColor: color }}
          />
        ) : null}
        {hover !== null ? (
          <div className="ad-chart__tip" style={{ left: `${(pts[hover][0] / w) * 100}%` }}>
            <span>{dayLabel(series[hover].day)}</span>
            <strong>{format(series[hover].value)}</strong>
          </div>
        ) : null}
      </div>
      <div className="ad-chart__axis">
        <span>{dayLabel(series[0].day)}</span>
        <span>{dayLabel(series[Math.floor(series.length / 2)].day)}</span>
        <span>{dayLabel(series[series.length - 1].day)}</span>
      </div>
    </div>
  );
}

export function Bars({ series, format, height = 120 }: { series: DayPoint[]; format: (n: number) => string; height?: number }) {
  const max = Math.max(1, ...series.map((p) => p.value));
  return (
    <div className="ad-bars" style={{ height }}>
      {series.map((p, i) => (
        <span
          key={p.day}
          title={`${dayLabel(p.day)} · ${format(p.value)}`}
          style={{ ["--h" as string]: `${Math.max(2, (p.value / max) * 100)}%`, animationDelay: `${i * 18}ms` }}
        />
      ))}
    </div>
  );
}

export function BarList({
  items,
  format,
  labelOf = (k) => k,
}: {
  items: { key: string; value: number; hint?: string }[];
  format: (n: number) => string;
  labelOf?: (key: string) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="ad-barlist">
      {items.map((item, i) => (
        <li key={item.key} style={{ animationDelay: `${i * 50}ms` }}>
          <div className="ad-barlist__row">
            <span>{labelOf(item.key)}</span>
            <strong>{format(item.value)}</strong>
          </div>
          <div className="ad-barlist__track">
            <span style={{ ["--w" as string]: `${(item.value / max) * 100}%`, animationDelay: `${100 + i * 60}ms` }} />
          </div>
          {item.hint ? <small>{item.hint}</small> : null}
        </li>
      ))}
    </ul>
  );
}

const DONUT_COLORS = ["var(--ad-accent)", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#64748b"];

export function Donut({
  parts,
  center,
  labelOf = (k) => k,
}: {
  parts: { key: string; value: number }[];
  center?: { value: string; label: string };
  labelOf?: (key: string) => string;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="ad-donut">
      <div className="ad-donut__ring">
        <svg viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r={r} className="ad-donut__track" />
          {total > 0
            ? parts.map((p, i) => {
                const len = (p.value / total) * c;
                const seg = (
                  <circle
                    key={p.key}
                    cx="50"
                    cy="50"
                    r={r}
                    stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                    strokeDasharray={`${len} ${c - len}`}
                    strokeDashoffset={-offset}
                    className="ad-donut__seg"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                );
                offset += len;
                return seg;
              })
            : null}
        </svg>
        {center ? (
          <div className="ad-donut__center">
            <strong>{center.value}</strong>
            <span>{center.label}</span>
          </div>
        ) : null}
      </div>
      <ul className="ad-legend">
        {parts.map((p, i) => (
          <li key={p.key}>
            <i style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span>{labelOf(p.key)}</span>
            <strong>{total > 0 ? `${Math.round((p.value / total) * 100)}%` : "—"}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const top = Math.max(1, steps[0]?.value ?? 1);
  return (
    <ol className="ad-funnel">
      {steps.map((s, i) => (
        <li key={s.label} style={{ animationDelay: `${i * 90}ms` }}>
          <div className="ad-funnel__bar" style={{ ["--w" as string]: `${Math.max(4, (s.value / top) * 100)}%` }}>
            <span>{s.label}</span>
            <strong>{new Intl.NumberFormat("en-US").format(s.value)}</strong>
          </div>
          {i > 0 ? <small>{steps[i - 1].value > 0 ? `${Math.round((s.value / steps[i - 1].value) * 100)}% of previous step` : "—"}</small> : null}
        </li>
      ))}
    </ol>
  );
}
