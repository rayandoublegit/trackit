"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { analyticsPeriodLabel, formatTrendLabel, type AnalyticsDateRange, type PeriodTrend } from "@/lib/analytics-periods";
import { useLang } from "@/lib/useLang";
import { AnalyticsPeriodDropdown, HERO_PERIOD_OPTIONS } from "./AnalyticsPeriodDropdown";

export type ChartPoint = { date: string; value: number; /** Inclusive end of a range label. */ endDate?: string };

/** Bar sampling interval: shorter periods → denser bars (30d → every 7d, 7d → every 2d, 3d/today → daily). */
export function barChartStepDaysForPeriod(period: AnalyticsDateRange, totalDaysInSeries?: number): number {
  if (period === "today" || period === "3d") return 1;
  if (period === "7d") return 2;
  if (period === "custom" && totalDaysInSeries != null) {
    if (totalDaysInSeries <= 6) return 1;
    if (totalDaysInSeries <= 14) return 2;
    return 7;
  }
  return 7;
}

/**
 * Bar charts: keep previous period → current period, but only one stick every `stepDays` days.
 * Always keeps the first day (start of previous period) and the last day (end of current).
 * Example: 1 jan (prev) → 8 jan → 15 jan → 20 jan (current).
 */
export function sampleSeriesEveryNDays(points: ChartPoint[], stepDays = 7): ChartPoint[] {
  const dated = points
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (dated.length === 0) return points;
  if (dated.length <= 2) return dated.map((p) => ({ date: p.date, value: Number(p.value) || 0 }));

  const indices = new Set<number>([0, dated.length - 1]);
  for (let i = stepDays; i < dated.length - 1; i += stepDays) {
    indices.add(i);
  }

  return [...indices]
    .sort((a, b) => a - b)
    .map((i) => ({
      date: dated[i].date,
      value: Number(dated[i].value) || 0,
    }));
}

/** Running total — so bars show value progression from previous period into current. */
export function toCumulativeSeries(points: ChartPoint[]): ChartPoint[] {
  let sum = 0;
  return points.map((p) => {
    sum += Number(p.value) || 0;
    return { date: p.date, value: sum, endDate: p.endDate };
  });
}

export function trendColors(direction: PeriodTrend["direction"]) {
  if (direction === "up") return { fg: "#166534", bg: "#DCFCE7" };
  if (direction === "down") return { fg: "#991B1B", bg: "#FEE2E2" };
  return { fg: "#6B7280", bg: "#F3F4F6" };
}

export function trendToSeries(trend?: PeriodTrend): ChartPoint[] {
  if (!trend) return [];
  return [
    { date: "prev", value: Number(trend.previous) || 0 },
    { date: "curr", value: Number(trend.current) || 0 },
  ];
}

/** Simple rentable / non-rentable text pill (no logo). */
export function ProfitabilityPill({
  profitable,
  lang,
}: {
  profitable: boolean;
  lang: "en" | "fr";
}) {
  const { fg, bg } = profitable
    ? { fg: "#166534", bg: "#DCFCE7" }
    : { fg: "#991B1B", bg: "#FEE2E2" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 11,
        fontWeight: 600,
        color: fg,
        background: bg,
        padding: "3px 8px",
        borderRadius: 999,
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
      }}
    >
      {profitable
        ? lang === "fr"
          ? "Rentable"
          : "Profitable"
        : lang === "fr"
          ? "Non rentable"
          : "Not profitable"}
    </span>
  );
}

export function InfoTip({ text, lang }: { text: string; lang: "en" | "fr" }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const width = 240;
    const left = Math.min(
      Math.max(12, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - 12,
    );
    const preferBelow = rect.top < 120;
    setPos({
      top: preferBelow ? rect.bottom + 8 : rect.top - 8,
      left,
    });
  }, [open]);

  const tooltip =
    open && pos && typeof document !== "undefined"
      ? createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: 240,
              transform: pos.top > (btnRef.current?.getBoundingClientRect().bottom ?? 0) ? "none" : "translateY(-100%)",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #E5E5E5",
              background: "#FFFFFF",
              boxShadow: "0 10px 28px rgba(0,0,0,0.12)",
              color: "#5A5A5A",
              fontSize: 12,
              fontWeight: 400,
              lineHeight: 1.45,
              letterSpacing: "-0.01em",
              zIndex: 10000,
              pointerEvents: "none",
            }}
          >
            <div style={{ fontWeight: 600, color: "#1A1A1A", marginBottom: 4 }}>
              {lang === "fr" ? "En savoir plus" : "Learn more"}
            </div>
            {text}
          </div>,
          document.body,
        )
      : null;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
      <button
        ref={btnRef}
        type="button"
        aria-label={lang === "fr" ? "En savoir plus" : "Learn more"}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          border: "1.5px solid #C4C4C4",
          background: "#FFFFFF",
          color: "#6B7280",
          fontSize: 11,
          fontWeight: 700,
          fontFamily: "Georgia, serif",
          fontStyle: "italic",
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
      {tooltip}
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
        padding: "4px 9px",
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

function TrendInline({ trend, lang }: { trend: PeriodTrend; lang: "en" | "fr" }) {
  const { fg } = trendColors(trend.direction);
  const sign = trend.direction === "up" ? "+" : trend.direction === "down" ? "−" : "";
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: fg, letterSpacing: "-0.02em" }}>
        {sign}
        {formatTrendLabel(trend.changePct, lang)}
      </span>
      <span style={{ fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em" }}>
        {lang === "fr" ? "vs période préc." : "vs prev. period"}
      </span>
    </span>
  );
}

/** Compact top-row summary card with mini sparkline (dashboard KPI style). */
export function SummaryMetricCard({
  title,
  info,
  value,
  trend,
  sparklineSeries,
  lang,
  profitability,
}: {
  title: string;
  info: string;
  value: string;
  trend?: PeriodTrend;
  sparklineSeries?: ChartPoint[];
  lang: "en" | "fr";
  profitability?: boolean;
}) {
  const sparkPoints = ensureChartSeries(sparklineSeries, trend, trend?.current ?? 0);
  const sparkColor =
    trend?.direction === "down" ? "#DC2626" : trend?.direction === "up" ? "#16A34A" : "#9CA3AF";

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #EFEFEF",
        borderRadius: 14,
        padding: "16px 16px 14px",
        minHeight: 118,
        minWidth: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "#6B7280", letterSpacing: "-0.01em" }}>{title}</span>
        <InfoTip text={info} lang={lang} />
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 26, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", lineHeight: 1.05 }}>
          {value}
        </div>
        <div style={{ width: 88, flexShrink: 0, marginBottom: 2 }}>
          <MiniSparkline points={sparkPoints} color={sparkColor} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: "auto", minWidth: 0 }}>
        {trend ? <TrendInline trend={trend} lang={lang} /> : null}
        {profitability != null ? <ProfitabilityPill profitable={profitability} lang={lang} /> : null}
      </div>
    </div>
  );
}

function MiniSparkline({ points, color }: { points: ChartPoint[]; color: string }) {
  const width = 88;
  const height = 44;
  const padX = 2;
  const padY = 4;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const values = points.map((p) => p.value);
  const minV = Math.min(...values, 0);
  const maxV = Math.max(...values, 1);
  const span = Math.max(maxV - minV, 1e-9);

  const coords = points.map((p, i) => {
    const x = padX + (points.length === 1 ? chartW / 2 : (i / (points.length - 1)) * chartW);
    const y = padY + chartH - ((p.value - minV) / span) * chartH;
    return { x, y };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(padY + chartH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padY + chartH).toFixed(1)} Z`
      : "";

  return (
    <svg width={width} height={height} aria-hidden style={{ display: "block" }}>
      {areaPath ? <path d={areaPath} fill={color} fillOpacity={0.12} /> : null}
      {linePath ? (
        <path d={linePath} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

/** Always produce at least 2 points so a chart can render. */
export function ensureChartSeries(
  series: ChartPoint[] | undefined,
  trend?: PeriodTrend,
  fallbackValue = 0,
): ChartPoint[] {
  const points = series?.filter((p) => Number.isFinite(p.value)) ?? [];
  if (points.length >= 2) return points;
  if (points.length === 1) {
    return [{ date: "prev", value: Number(trend?.previous) || 0 }, points[0]];
  }
  if (trend) return trendToSeries(trend);
  return [
    { date: "prev", value: 0 },
    { date: "curr", value: fallbackValue },
  ];
}

/** Nice axis ticks (e.g. 0, 1000, 2000, 3000). */
function niceAxisTicks(min: number, max: number, targetCount = 5): number[] {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max, lo + 1);
  const range = hi - lo;
  const rough = range / Math.max(1, targetCount - 1);
  const power = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1e-9))));
  const err = rough / power;
  const step = err >= 5 ? 5 * power : err >= 2 ? 2 * power : power;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step * 0.001; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  if (ticks.length < 2) return [0, hi];
  return ticks;
}

/** Compact axis labels: 1000 → 1k, 1_000_000 → 1M */
function formatAxisTick(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) {
    const v = n / 1_000_000_000;
    return `${Number.isInteger(v) ? v : v.toFixed(1)}B`;
  }
  if (abs >= 1_000_000) {
    const v = n / 1_000_000;
    return `${Number.isInteger(v) ? v : v.toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    const v = n / 1_000;
    return `${Number.isInteger(v) ? v : v.toFixed(1)}k`;
  }
  return String(Math.round(n));
}

function pickXLabelIndices(count: number, maxLabels = 7): number[] {
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);
  const indices = new Set<number>([0, count - 1]);
  const inner = maxLabels - 2;
  for (let i = 1; i <= inner; i++) {
    indices.add(Math.round((i / (inner + 1)) * (count - 1)));
  }
  return [...indices].sort((a, b) => a - b);
}

/** Prefer month labels (févr., mars…) when the series spans multiple months. */
function pickAxisLabels(
  points: ChartPoint[],
  lang: "en" | "fr",
): Array<{ index: number; label: string }> {
  const dated = points
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => /^\d{4}-\d{2}-\d{2}$/.test(p.date));

  if (dated.length === 0) {
    return pickXLabelIndices(points.length, 6).map((index) => ({
      index,
      label: formatChartDate(points[index]?.date, lang, true),
    }));
  }

  const months = new Set(dated.map(({ p }) => p.date.slice(0, 7)));
  if (months.size >= 2) {
    const seen = new Set<string>();
    const labels: Array<{ index: number; label: string }> = [];
    for (const { p, index } of dated) {
      const monthKey = p.date.slice(0, 7);
      if (seen.has(monthKey)) continue;
      seen.add(monthKey);
      labels.push({ index, label: formatMonthLabel(p.date, lang) });
    }
    return labels;
  }

  // Single month: show day labels across the period.
  return pickXLabelIndices(points.length, 7).map((index) => ({
    index,
    label: formatChartDate(points[index]?.date, lang, true),
  }));
}

function formatMonthLabel(raw: string, lang: "en" | "fr"): string {
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { month: "short" });
}

/**
 * Full-width frameless metric + interactive chart (Leadwave / Total Revenue style).
 * Straight segments, Y-axis ticks, hover crosshair + dark tooltip.
 */
export function HeroMetricChart({
  title,
  info,
  value,
  trend,
  series,
  formatPoint,
  lang,
  period,
  onPeriodChange,
  periodOptions = HERO_PERIOD_OPTIONS,
  accent = "#3B82F6",
}: {
  title: string;
  info: string;
  value: string;
  trend?: PeriodTrend;
  series?: ChartPoint[];
  formatPoint: (value: number) => string;
  lang: "en" | "fr";
  period: AnalyticsDateRange;
  onPeriodChange: (period: AnalyticsDateRange) => void;
  periodOptions?: AnalyticsDateRange[];
  accent?: string;
}) {
  const periodLabel = analyticsPeriodLabel(period, lang).toLowerCase();
  const points = ensureChartSeries(series, trend, trend?.current ?? 0);
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gradId = useId().replace(/:/g, "");
  const [width, setWidth] = useState(720);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(240, el.clientWidth));
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const height = 300;
  const padL = 52;
  const padR = 12;
  const padTop = 12;
  const padBottom = 32;
  const chartH = height - padTop - padBottom;
  const chartW = Math.max(1, width - padL - padR);

  const values = points.map((p) => p.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const ticks = niceAxisTicks(Math.min(0, dataMin), dataMax <= 0 ? 1 : dataMax, 5);
  const scaleMin = ticks[0];
  const scaleMax = ticks[ticks.length - 1];
  const useLog = scaleMax / Math.max(scaleMin, 1) >= 40 && dataMax > 0;

  const yFor = (v: number) => {
    if (useLog) {
      const minL = Math.log10(Math.max(scaleMin, 1));
      const maxL = Math.log10(Math.max(scaleMax, 10));
      const valL = Math.log10(Math.max(v, 1));
      const t = (valL - minL) / Math.max(maxL - minL, 1e-9);
      return padTop + chartH - t * chartH;
    }
    const span = Math.max(scaleMax - scaleMin, 1e-9);
    return padTop + chartH - ((v - scaleMin) / span) * chartH;
  };

  const logTicks = useLog
    ? (() => {
        const out: number[] = [];
        let p = Math.pow(10, Math.floor(Math.log10(Math.max(dataMax, 10))));
        while (p >= 1 && out.length < 6) {
          out.push(p);
          p /= 10;
        }
        if (!out.includes(1) && dataMax >= 1) out.push(1);
        return out.sort((a, b) => a - b);
      })()
    : ticks;

  const axisTicks = useLog ? logTicks : ticks;

  const coords = points.map((p, i) => {
    const x = padL + (points.length === 1 ? chartW / 2 : (i / (points.length - 1)) * chartW);
    const y = yFor(p.value);
    return { x, y, ...p };
  });

  // Straight segments only (no rounded joins).
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(" ");
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${(padTop + chartH).toFixed(2)} L ${coords[0].x.toFixed(2)} ${(padTop + chartH).toFixed(2)} Z`
      : "";

  const active = hover != null ? coords[hover] : null;
  const axisLabels = pickAxisLabels(points, lang);

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

  const trendLine = trend ? formatHeroTrendLine(trend, formatPoint, periodLabel, lang) : null;
  const trendColor =
    trend?.direction === "down" ? "#DC2626" : trend?.direction === "up" ? accent : "#6B7280";

  return (
    <div style={{ width: "100%", marginBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "#6B7280", letterSpacing: "-0.01em" }}>{title}</span>
          <InfoTip text={info} lang={lang} />
        </div>
        <AnalyticsPeriodDropdown
          value={period}
          onChange={onPeriodChange}
          lang={lang}
          options={periodOptions}
          align="right"
          variant="subtle"
        />
      </div>

      <div style={{ fontSize: 40, fontWeight: 600, color: "#0A0A0A", letterSpacing: "-0.05em", lineHeight: 1.05, marginBottom: 6 }}>
        {value}
      </div>
      {trendLine ? (
        <div style={{ fontSize: 13, fontWeight: 500, color: trendColor, letterSpacing: "-0.01em", marginBottom: 20 }}>
          {trendLine}
        </div>
      ) : (
        <div style={{ height: 20, marginBottom: 20 }} />
      )}

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
              <stop offset="0%" stopColor={accent} stopOpacity="0.18" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </linearGradient>
          </defs>

          {axisTicks.map((tick) => {
            const y = yFor(tick);
            return (
              <g key={`tick-${tick}`}>
                <line
                  x1={padL}
                  y1={y}
                  x2={padL + chartW}
                  y2={y}
                  stroke="#E5E7EB"
                  strokeWidth={1}
                  strokeDasharray="3 5"
                />
                <text
                  x={padL - 10}
                  y={y + 4}
                  textAnchor="end"
                  fill="#9CA3AF"
                  fontSize={11}
                  fontFamily="inherit"
                >
                  {formatAxisTick(tick)}
                </text>
              </g>
            );
          })}

          {areaPath ? <path d={areaPath} fill={`url(#${gradId})`} /> : null}
          {linePath ? (
            <path
              d={linePath}
              fill="none"
              stroke={accent}
              strokeWidth={2}
              strokeLinejoin="miter"
              strokeLinecap="butt"
            />
          ) : null}

          {active ? (
            <>
              <line
                x1={active.x}
                y1={padTop}
                x2={active.x}
                y2={padTop + chartH}
                stroke={accent}
                strokeWidth={1.5}
                strokeOpacity={0.4}
              />
              <circle cx={active.x} cy={active.y} r={8} fill={accent} fillOpacity={0.12} />
              <circle cx={active.x} cy={active.y} r={4} fill="#FFFFFF" stroke={accent} strokeWidth={2.5} />
            </>
          ) : null}

          {axisLabels.map(({ index, label }) => {
            const c = coords[index];
            if (!c) return null;
            return (
              <text
                key={`x-${index}-${label}`}
                x={c.x}
                y={height - 8}
                textAnchor="middle"
                fill="#9CA3AF"
                fontSize={11}
                fontFamily="inherit"
              >
                {label}
              </text>
            );
          })}
        </svg>

        {active ? (
          <div
            style={{
              position: "absolute",
              left: Math.min(Math.max(active.x - 72, 4), Math.max(4, width - 156)),
              top: Math.max(4, active.y - 68),
              minWidth: 136,
              padding: "9px 12px",
              borderRadius: 8,
              background: "#1F2937",
              color: "#FFFFFF",
              boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
              pointerEvents: "none",
              zIndex: 6,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 3 }}>
              {formatChartDate(active.date, lang, false)}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", letterSpacing: "-0.01em" }}>
              {formatPoint(active.value)}
            </div>
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: "50%",
                bottom: -5,
                width: 10,
                height: 10,
                marginLeft: -5,
                background: "#1F2937",
                transform: "rotate(45deg)",
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatHeroTrendLine(
  trend: PeriodTrend,
  formatPoint: (value: number) => string,
  periodLabel: string,
  lang: "en" | "fr",
) {
  const delta = trend.current - trend.previous;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const absFormatted = formatPoint(Math.abs(delta));
  const pctSign = trend.direction === "up" ? "+" : trend.direction === "down" ? "−" : "";
  const pct = formatTrendLabel(trend.changePct, lang);
  return `${sign}${absFormatted} (${pctSign}${pct}) · ${periodLabel}`;
}

/** Full-width analytics panel with chart (stacked layout). */
export function MetricPanelCard({
  title,
  info,
  value,
  trend,
  series,
  formatPoint,
  lang,
  profitability,
  chartVariant = "line",
}: {
  title: string;
  info: string;
  value: string;
  trend?: PeriodTrend;
  series?: ChartPoint[];
  formatPoint: (value: number) => string;
  lang: "en" | "fr";
  profitability?: boolean;
  chartVariant?: "line" | "bars";
}) {
  const rawPoints = ensureChartSeries(series, trend, trend?.current ?? 0);
  // Bars: previous period → current period, one stick every 7 days (first + last always kept).
  const points =
    chartVariant === "bars"
      ? sampleSeriesEveryNDays(toCumulativeSeries(rawPoints), 7)
      : rawPoints;
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #EFEFEF",
        borderRadius: 16,
        padding: "20px 22px 16px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{title}</span>
          <InfoTip text={info} lang={lang} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {profitability != null ? <ProfitabilityPill profitable={profitability} lang={lang} /> : null}
          {trend ? <TrendPill trend={trend} lang={lang} /> : null}
        </div>
      </div>
      <div style={{ fontSize: 34, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.045em", lineHeight: 1.1, marginBottom: 14 }}>
        {value}
      </div>
      {chartVariant === "bars" ? (
        <AnalyticsBarChart lang={lang} points={points} formatValue={formatPoint} height={140} />
      ) : (
        <InteractiveLineChart lang={lang} points={points} formatValue={formatPoint} height={140} />
      )}
    </div>
  );
}

/** @deprecated use MetricPanelCard — kept for gradual migration */
export function MetricInsightCard(props: Parameters<typeof MetricPanelCard>[0]) {
  return <MetricPanelCard {...props} />;
}

/** @deprecated Trackit logo mark removed — use ProfitabilityPill */
export function ProfitabilityMark({ profitable }: { profitable: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: profitable ? "#166534" : "#991B1B",
        display: "inline-block",
        flexShrink: 0,
      }}
    />
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
  const gradId = useId().replace(/:/g, "");
  const [width, setWidth] = useState(compact ? 244 : 480);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(120, el.clientWidth));
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const padX = 4;
  const padTop = 14;
  const padBottom = 24;
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
  const firstLabel = formatChartDate(points[0]?.date, lang, true);
  const lastLabel = formatChartDate(points[points.length - 1]?.date, lang, true);

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
          <path d={linePath} fill="none" stroke="#1A1A1A" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
        {active ? (
          <>
            <line x1={active.x} y1={padTop} x2={active.x} y2={padTop + chartH} stroke="#E5E5E5" strokeWidth={1} />
            <circle cx={active.x} cy={active.y} r={4.5} fill="#FFF" stroke="#1A1A1A" strokeWidth={2} />
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
        {points.length > 2 ? <span>{lastLabel}</span> : null}
      </div>
      {active ? (
        <div
          style={{
            position: "absolute",
            left: Math.min(Math.max(active.x - 72, 0), Math.max(0, width - 148)),
            top: Math.max(0, active.y - 56),
            minWidth: 132,
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #E5E5E5",
            background: "#FFF",
            boxShadow: "0 8px 20px rgba(0,0,0,0.1)",
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

function formatBarPointLabel(point: ChartPoint, lang: "en" | "fr", weekly?: boolean) {
  if (weekly && point.endDate && point.endDate !== point.date) {
    return `${formatChartDate(point.date, lang, true)} – ${formatChartDate(point.endDate, lang, true)}`;
  }
  return formatChartDate(point.date, lang, weekly ? true : false);
}

/** Large bar chart for hero analytics panels. */
export function HeroBarChartCard({
  title,
  info,
  value,
  trend,
  series,
  formatPoint,
  lang,
  period,
  onPeriodChange,
  periodOptions = HERO_PERIOD_OPTIONS,
}: {
  title: string;
  info: string;
  value: string;
  trend?: PeriodTrend;
  series?: ChartPoint[];
  formatPoint: (value: number) => string;
  lang: "en" | "fr";
  period: AnalyticsDateRange;
  onPeriodChange: (period: AnalyticsDateRange) => void;
  periodOptions?: AnalyticsDateRange[];
}) {
  const rawPoints = ensureChartSeries(series, trend, trend?.current ?? 0);
  const stepDays = barChartStepDaysForPeriod(period, rawPoints.length);
  const useIncremental = period === "today" || period === "3d" || period === "7d";
  const points = sampleSeriesEveryNDays(
    useIncremental ? rawPoints : toCumulativeSeries(rawPoints),
    stepDays,
  );
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #EFEFEF",
        borderRadius: 16,
        padding: "20px 22px 18px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "#6B7280", letterSpacing: "-0.02em" }}>{title}</span>
          <InfoTip text={info} lang={lang} />
        </div>
        <AnalyticsPeriodDropdown
          value={period}
          onChange={onPeriodChange}
          lang={lang}
          options={periodOptions}
          align="right"
          variant="subtle"
        />
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 36, fontWeight: 600, color: "#0A0A0A", letterSpacing: "-0.045em", lineHeight: 1.05 }}>
          {value}
        </div>
        {trend ? <TrendPill trend={trend} lang={lang} /> : null}
      </div>
      <AnalyticsBarChart lang={lang} points={points} formatValue={formatPoint} height={240} />
    </div>
  );
}

export function AnalyticsBarChart({
  lang,
  points,
  formatValue,
  height = 140,
  weekly = false,
}: {
  lang: "en" | "fr";
  points: ChartPoint[];
  formatValue: (value: number) => string;
  height?: number;
  weekly?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => p.value), 1);
  const active = hover != null ? points[hover] : null;
  const barMaxWidth = points.length <= 6 ? 40 : points.length <= 10 ? 32 : 24;
  const showAllLabels = points.length <= 8;

  return (
    <div style={{ position: "relative", height }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: points.length <= 6 ? 10 : 6, height: height - 28, paddingTop: 8 }}>
        {points.map((p, i) => {
          const h = Math.max(4, Math.round((p.value / max) * 100));
          const isActive = hover === i;
          const label = formatBarPointLabel(p, lang, weekly);
          return (
            <div
              key={`${p.date}-${p.endDate ?? ""}-${i}`}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                height: "100%",
                justifyContent: "flex-end",
                minWidth: 0,
              }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div
                title={`${label} · ${formatValue(p.value)}`}
                style={{
                  width: "100%",
                  maxWidth: barMaxWidth,
                  height: `${h}%`,
                  minHeight: 4,
                  background: isActive ? "#1A1A1A" : "#D4D4D4",
                  borderRadius: "4px 4px 0 0",
                  transition: "background 0.15s",
                  cursor: "pointer",
                }}
              />
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: showAllLabels ? "space-between" : "space-between",
          gap: 4,
          fontSize: 10,
          color: "#9A9A9A",
          marginTop: 6,
          letterSpacing: "-0.01em",
        }}
      >
        {showAllLabels
          ? points.map((p, i) => (
              <span key={`lbl-${i}`} style={{ flex: 1, textAlign: "center", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {formatChartDate(p.date, lang, true)}
              </span>
            ))
          : (
            <>
              <span>{formatChartDate(points[0]?.date, lang, true)}</span>
              <span>{formatChartDate(points[points.length - 1]?.endDate ?? points[points.length - 1]?.date, lang, true)}</span>
            </>
          )}
      </div>
      {active ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            transform: "translateX(-50%)",
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #E5E5E5",
            background: "#FFF",
            boxShadow: "0 8px 20px rgba(0,0,0,0.1)",
            pointerEvents: "none",
            zIndex: 5,
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A" }}>{formatBarPointLabel(active, lang, weekly)}</div>
          <div style={{ fontSize: 12, color: "#7A7A7A" }}>{formatValue(active.value)}</div>
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

export function AnalyticsSectionHeader({
  title,
  info,
  lang,
}: {
  title: string;
  info?: string;
  lang: "en" | "fr";
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", margin: 0, letterSpacing: "-0.03em" }}>{title}</h2>
      {info ? <InfoTip text={info} lang={lang} /> : null}
    </div>
  );
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
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", margin: 0, letterSpacing: "-0.02em" }}>{title}</h3>
        {info ? <InfoTip text={info} lang={lang} /> : null}
      </div>
      {children}
    </div>
  );
}
