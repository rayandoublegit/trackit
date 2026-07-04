"use client";

import { useEffect, useRef, useState } from "react";
import { formatTrendLabel, type PeriodTrend } from "@/lib/analytics-periods";
import { useLang } from "@/lib/useLang";

export type ChartPoint = { date: string; value: number };

export function trendColors(direction: PeriodTrend["direction"]) {
  if (direction === "up") return { fg: "#1FB567", bg: "rgba(31,181,103,0.12)" };
  if (direction === "down") return { fg: "#E53935", bg: "rgba(229,57,53,0.12)" };
  return { fg: "#9A9A9A", bg: "#F5F5F5" };
}

export function trendToSeries(trend?: PeriodTrend): ChartPoint[] {
  if (!trend) return [];
  return [
    { date: "prev", value: Number(trend.previous) || 0 },
    { date: "curr", value: Number(trend.current) || 0 },
  ];
}

export function ProfitabilityMark({ profitable, size = 12 }: { profitable: boolean; size?: number }) {
  const color = profitable ? "#166534" : "#991B1B";
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size * 0.93,
        flexShrink: 0,
        backgroundColor: color,
        WebkitMaskImage: "url(/images/trackit-mark.svg)",
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskImage: "url(/images/trackit-mark.svg)",
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
      }}
    />
  );
}

export function InfoTip({ text, lang }: { text: string; lang: "en" | "fr" }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={lang === "fr" ? "En savoir plus" : "Learn more"}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: "1px solid #D0D0D0",
          background: "#FFF",
          color: "#9A9A9A",
          fontSize: 10,
          fontWeight: 600,
          fontFamily: "inherit",
          lineHeight: 1,
          padding: 0,
          cursor: "help",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        i
      </button>
      {open ? (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            left: "50%",
            bottom: "calc(100% + 8px)",
            transform: "translateX(-50%)",
            width: 220,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #EFEFEF",
            background: "#FFF",
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            color: "#5A5A5A",
            fontSize: 12,
            fontWeight: 400,
            lineHeight: 1.45,
            letterSpacing: "-0.01em",
            zIndex: 20,
            pointerEvents: "none",
          }}
        >
          <span style={{ display: "block", fontWeight: 600, color: "#1A1A1A", marginBottom: 4 }}>
            {lang === "fr" ? "En savoir plus" : "Learn more"}
          </span>
          {text}
        </span>
      ) : null}
    </span>
  );
}

export function TrendPill({ trend, lang }: { trend: PeriodTrend; lang: "en" | "fr" }) {
  const { fg, bg } = trendColors(trend.direction);
  const sign = trend.direction === "up" ? "+" : trend.direction === "down" ? "−" : "";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12,
        fontWeight: 600,
        color: fg,
        background: bg,
        padding: "4px 8px",
        borderRadius: 999,
        letterSpacing: "-0.02em",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <span aria-hidden>{trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"}</span>
      {sign}
      {formatTrendLabel(trend.changePct, lang)}
    </span>
  );
}

export function MetricInsightCard({
  title,
  info,
  value,
  trend,
  series,
  formatPoint,
  lang,
  profitability,
}: {
  title: string;
  info: string;
  value: string;
  trend?: PeriodTrend;
  series?: ChartPoint[];
  formatPoint: (value: number) => string;
  lang: "en" | "fr";
  profitability?: boolean;
}) {
  const points = series && series.length > 0 ? series : trendToSeries(trend);
  return (
    <div
      style={{
        flex: "0 0 280px",
        width: 280,
        minHeight: 280,
        scrollSnapAlign: "start",
        background: "#FFF",
        border: "1px solid #EFEFEF",
        borderRadius: 16,
        padding: "18px 18px 14px",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "#1A1A1A",
              letterSpacing: "-0.02em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </span>
          <InfoTip text={info} lang={lang} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {profitability != null ? <ProfitabilityMark profitable={profitability} size={13} /> : null}
          {trend ? <TrendPill trend={trend} lang={lang} /> : null}
        </div>
      </div>
      <div style={{ fontSize: 32, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", lineHeight: 1.1, marginBottom: 12 }}>
        {value}
      </div>
      <div style={{ marginTop: "auto" }}>
        {points.length >= 2 ? (
          <InteractiveLineChart lang={lang} points={points} formatValue={formatPoint} height={112} compact />
        ) : (
          <div style={{ height: 112, display: "flex", alignItems: "center", justifyContent: "center", color: "#C0C0C0", fontSize: 12 }}>
            {lang === "fr" ? "Pas encore de courbe" : "No chart yet"}
          </div>
        )}
      </div>
    </div>
  );
}

export function InteractiveLineChart({
  lang,
  points,
  formatValue,
  height = 160,
  compact = false,
}: {
  lang: "en" | "fr";
  points: ChartPoint[];
  formatValue: (value: number) => string;
  height?: number;
  compact?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gradId = useRef(`analyticsLineFill_${Math.random().toString(36).slice(2, 9)}`).current;
  const [width, setWidth] = useState(compact ? 244 : 320);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(120, el.clientWidth));
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const padX = compact ? 4 : 8;
  const padTop = compact ? 12 : 16;
  const padBottom = compact ? 22 : 28;
  const chartH = height - padTop - padBottom;
  const chartW = Math.max(1, width - padX * 2);
  const values = points.map((p) => p.value);
  const minV = Math.min(...values, 0);
  const maxV = Math.max(...values, 1);
  const span = Math.max(maxV - minV, 1);

  const coords = points.map((p, i) => {
    const x = padX + (points.length === 1 ? chartW / 2 : (i / (points.length - 1)) * chartW);
    const y = padTop + chartH - ((p.value - minV) / span) * chartH;
    return { x, y, ...p };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(" ");
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${(padTop + chartH).toFixed(2)} L ${coords[0].x.toFixed(2)} ${(padTop + chartH).toFixed(2)} Z`
      : "";

  const active = hover != null ? coords[hover] : null;
  const firstLabel = formatChartDate(points[0]?.date, lang, compact);
  const lastLabel = formatChartDate(points[points.length - 1]?.date, lang, compact);

  const onMove = (clientX: number) => {
    const el = wrapRef.current;
    if (!el || coords.length === 0) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    let best = 0;
    let bestDist = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c.x - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setHover(best);
  };

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", width: "100%", height, cursor: "crosshair", userSelect: "none" }}
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => onMove(e.clientX)}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (t) onMove(t.clientX);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        if (t) onMove(t.clientX);
      }}
    >
      <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1A1A1A" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#1A1A1A" stopOpacity="0" />
          </linearGradient>
        </defs>
        {areaPath ? <path d={areaPath} fill={`url(#${gradId})`} /> : null}
        {linePath ? (
          <path d={linePath} fill="none" stroke="#1A1A1A" strokeWidth={compact ? 1.6 : 2} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
        {active ? (
          <>
            <line x1={active.x} y1={padTop} x2={active.x} y2={padTop + chartH} stroke="#E5E5E5" strokeWidth={1} />
            <circle cx={active.x} cy={active.y} r={4} fill="#FFF" stroke="#1A1A1A" strokeWidth={2} />
          </>
        ) : null}
      </svg>
      <div
        style={{
          position: "absolute",
          left: padX,
          right: padX,
          bottom: 0,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "#9A9A9A",
          letterSpacing: "-0.01em",
          pointerEvents: "none",
        }}
      >
        <span>{firstLabel}</span>
        <span>{lastLabel}</span>
      </div>
      {active ? (
        <div
          style={{
            position: "absolute",
            left: Math.min(Math.max(active.x - 70, 0), Math.max(0, width - 140)),
            top: Math.max(0, active.y - 58),
            width: 140,
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #EFEFEF",
            background: "#FFF",
            boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 2 }}>
            {formatChartDate(active.date, lang, false)}
          </div>
          <div style={{ fontSize: 12, color: "#7A7A7A", letterSpacing: "-0.01em" }}>{formatValue(active.value)}</div>
        </div>
      ) : null}
    </div>
  );
}

export function formatChartDate(raw: string | undefined, lang: "en" | "fr", compact: boolean) {
  if (!raw) return "—";
  if (raw === "prev") return lang === "fr" ? "Période préc." : "Prev. period";
  if (raw === "curr") return lang === "fr" ? "Actuelle" : "Current";
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
    month: "short",
    day: "numeric",
    ...(compact ? {} : { year: "numeric" }),
  });
}

export function AnalyticsChartCard({
  title,
  info,
  children,
  style,
  lang: langProp,
}: {
  title: string;
  info?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  lang?: "en" | "fr";
}) {
  const langHook = useLang();
  const lang = langProp ?? langHook;
  return (
    <div style={{ background: "#FFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 24, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", margin: 0, letterSpacing: "-0.02em" }}>{title}</h3>
        {info ? <InfoTip text={info} lang={lang} /> : null}
      </div>
      {children}
    </div>
  );
}

export function MetricCardsScroller({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        overflowX: "auto",
        paddingBottom: 10,
        marginBottom: 24,
        scrollSnapType: "x mandatory",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {children}
    </div>
  );
}
