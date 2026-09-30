"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CountUp } from "./sample-motion";
import "./payouts-pulse.css";

// Payouts overview, dashboard style: one dark hero with the period's
// commissions, a glowing curve and a paid ring, then three tiles.

export type PulseBucket = { dateKey: string; earned: number; paid: number };

type PulseLang = "en" | "fr";

function shortDate(key: string, lang: PulseLang = "en"): string {
  const d = new Date(`${key.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  const locale = lang === "fr" ? "fr-FR" : "en-US";
  if (key.length > 10) return d.toLocaleTimeString(locale, { hour: "numeric" });
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

/** Smooth path through the points (Catmull-Rom converted to cubic Béziers). */
function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function AreaChart({
  buckets,
  format,
  lang,
}: {
  buckets: PulseBucket[];
  format: (n: number) => string;
  lang: PulseLang;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 170;
  const max = Math.max(1, ...buckets.map((b) => b.earned));
  const pts = useMemo<[number, number][]>(
    () =>
      buckets.map((b, i) => [
        buckets.length === 1 ? W / 2 : (i / (buckets.length - 1)) * W,
        H - 12 - (b.earned / max) * (H - 36),
      ]),
    [buckets, max],
  );
  const line = smoothPath(pts);
  const area = pts.length ? `${line} L${W},${H} L0,${H} Z` : "";
  const last = pts[pts.length - 1];
  const h = hover != null ? buckets[hover] : null;

  return (
    <div className="pp-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round((x / W) * (buckets.length - 1));
          setHover(Math.max(0, Math.min(buckets.length - 1, i)));
        }}
        aria-hidden
      >
        <defs>
          <linearGradient id="pp-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5b8cff" stopOpacity=".45" />
            <stop offset="100%" stopColor="#5b8cff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="pp-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="100%" stopColor="#5b8cff" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="pp-chart__grid" />
        ))}
        {area ? <path d={area} fill="url(#pp-fill)" className="pp-chart__area" /> : null}
        {line ? <path d={line} fill="none" stroke="url(#pp-stroke)" strokeWidth="3" strokeLinecap="round" pathLength={1} className="pp-chart__line" vectorEffect="non-scaling-stroke" /> : null}
        {hover != null && pts[hover] ? (
          <g>
            <line x1={pts[hover][0]} x2={pts[hover][0]} y1="0" y2={H} className="pp-chart__cursor" />
            <circle cx={pts[hover][0]} cy={pts[hover][1]} r="5" className="pp-chart__dot" />
          </g>
        ) : last ? (
          <circle cx={last[0]} cy={last[1]} r="5" className="pp-chart__dot is-live" />
        ) : null}
      </svg>
      {h ? (
        <div className="pp-chart__tip" style={{ left: `${(hover! / Math.max(1, buckets.length - 1)) * 100}%` }}>
          <b>{format(h.earned)}</b>
          <span>{shortDate(h.dateKey, lang)}</span>
          {h.paid ? <em>{format(h.paid)} {lang === "fr" ? "payé" : "paid"}</em> : null}
        </div>
      ) : null}
      {buckets.length > 1 ? (
        <div className="pp-chart__axis">
          <span>{shortDate(buckets[0].dateKey, lang)}</span>
          <span>{shortDate(buckets[Math.floor(buckets.length / 2)].dateKey, lang)}</span>
          <span>{shortDate(buckets[buckets.length - 1].dateKey, lang)}</span>
        </div>
      ) : null}
    </div>
  );
}

function Ring({ pct, lang }: { pct: number; lang: PulseLang }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, pct));
  return (
    <div className="pp-ring">
      <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden>
        <circle cx="60" cy="60" r={r} className="pp-ring__track" />
        <circle
          cx="60"
          cy="60"
          r={r}
          className="pp-ring__fill"
          strokeDasharray={c}
          style={{ ["--pp-off" as string]: `${c * (1 - v)}`, ["--pp-full" as string]: `${c}` }}
        />
      </svg>
      <div className="pp-ring__label">
        <b>{Math.round(v * 100)}%</b>
        <span>{lang === "fr" ? "versé" : "paid out"}</span>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  icon,
  tone,
  index,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  icon: ReactNode;
  tone: "blue" | "green" | "amber";
  index: number;
}) {
  return (
    <div className={`pp-tile is-${tone}`} style={{ ["--i" as string]: index }}>
      <div className="pp-tile__top">
        <span className="pp-tile__label">{label}</span>
        <span className="pp-tile__icon">{icon}</span>
      </div>
      <div className="pp-tile__value">{value}</div>
      <div className="pp-tile__hint">{hint}</div>
    </div>
  );
}

const Svg = ({ d }: { d: string }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

export function PayoutsPulse({
  title,
  amount,
  salesLine,
  periodControl,
  buckets,
  owed,
  owedHint,
  paid,
  paidLabel,
  paidHint,
  avgPerSale,
  salesCount,
  format,
  isMobile,
  lang = "en",
}: {
  title: string;
  amount: number;
  salesLine: string;
  periodControl: ReactNode;
  buckets: PulseBucket[];
  owed: number;
  owedHint: string;
  paid: number;
  paidLabel: string;
  paidHint: string;
  avgPerSale: number;
  salesCount: number;
  format: (n: number) => string;
  isMobile?: boolean;
  lang?: PulseLang;
}) {
  const fr = lang === "fr";
  const paidShare = paid + owed > 0 ? paid / (paid + owed) : 0;
  return (
    <section className={`pp${isMobile ? " is-mobile" : ""}`}>
      <div className="pp-hero">
        <div className="pp-hero__glow" aria-hidden />
        <div className="pp-hero__main">
          <div className="pp-hero__head">
            <span className="pp-hero__label">
              <i aria-hidden /> {title}
            </span>
            <div className="pp-hero__period">{periodControl}</div>
          </div>
          <div className="pp-hero__amount">
            <CountUp value={amount} format={format} />
          </div>
          <div className="pp-hero__sub">{salesLine}</div>
          <AreaChart buckets={buckets} format={format} lang={lang} />
        </div>
        <div className="pp-hero__side">
          <Ring pct={paidShare} lang={lang} />
          <div className="pp-hero__legend">
            <span>
              <i className="is-paid" /> {fr ? "Payé" : "Paid"} <b>{format(paid)}</b>
            </span>
            <span>
              <i className="is-owed" /> {fr ? "Dû" : "Owed"} <b>{format(owed)}</b>
            </span>
          </div>
        </div>
      </div>

      <div className="pp-tiles">
        <Tile
          index={0}
          tone="amber"
          label={fr ? "Montant dû" : "Amount owed"}
          value={<CountUp value={owed} format={format} />}
          hint={owedHint}
          icon={<Svg d="M12 8v4l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" />}
        />
        <Tile
          index={1}
          tone="green"
          label={paidLabel}
          value={<CountUp value={paid} format={format} />}
          hint={paidHint}
          icon={<Svg d="M20 6L9 17l-5-5" />}
        />
        <Tile
          index={2}
          tone="blue"
          label={fr ? "Commission moyenne par vente" : "Avg commission per sale"}
          value={<CountUp value={avgPerSale} format={format} />}
          hint={
            fr
              ? salesCount
                ? `${salesCount} vente${salesCount > 1 ? "s" : ""} sur la période`
                : "Aucune vente sur la période"
              : salesCount
                ? `${salesCount} sale${salesCount > 1 ? "s" : ""} in period`
                : "No sales in period"
          }
          icon={<Svg d="M3 3v18h18M7 14l4-4 4 4 5-6" />}
        />
      </div>
    </section>
  );
}
