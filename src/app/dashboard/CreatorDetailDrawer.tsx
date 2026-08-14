"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { PlanTier } from "@/lib/plan-limits";
import type { FeedCreator } from "@/lib/discovery-feed";
import { buildCreatorVideoPreviews } from "@/lib/creator-video-previews";
import { tiktokVideoWatchUrl } from "@/lib/creator-video";
import type { ValueTier } from "@/lib/creator-value";
import { pipelineStages } from "@/lib/pipeline";
import {
  listSaved, saveCreator, unsave, setStage as apiSetStage, setNotes as apiSetNotes,
  setCreatorAvatar,
  listFolders, createFolder, addToFolder, removeFromFolder, type FolderRow,
} from "@/lib/workspace-client";
import {
  getCampaigns,
  getCampaignCreatorLinks,
  getSavedCreators,
  saveCreator as saveManagedCreator,
  syncCampaignCreators,
} from "@/lib/db";
import type { ContentAnalysis } from "@/lib/creator-content-analysis";
import { CreatorAvatar, mergeCreatorAvatarSrc } from "@/app/dashboard/CreatorAvatar";
import { ProxiedImage } from "@/app/dashboard/ProxiedImage";
import { PlatformBrandIcon } from "@/app/dashboard/PlatformBrandIcon";
import { discoveryCopy, engagementInsightCopy } from "@/lib/discovery-copy";
import type { Lang } from "@/lib/useLang";
import { setCachedAvatarUrl } from "@/lib/avatar-url-cache";
import {
  fetchCreatorDetail,
  getCachedCreatorDetail,
  setCachedCreatorDetail,
} from "@/lib/creator-detail-cache";
import { hasReliableCreatorMetrics } from "@/lib/creator-metrics";
import { MIN_VIEWS_FOR_VALUE_METRICS } from "@/lib/creator-value";
import { supabase } from "@/lib/supabase";
import { hideCreator, isCreatorHidden, unhideCreator } from "@/lib/hidden-creators-storage";
import { dispatchCampaignsUpdated } from "@/lib/outreach-history-events";

type CampaignOption = { id: string; name: string; status: string };

export type CreatorDetail = FeedCreator & {
  avgLikes?: number; avgComments?: number; avgShares?: number;
  viewsPerFollower?: number; postsAnalyzed?: number;
  niches?: string[];
};

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 100_000 ? 0 : 1) + "K";
  return String(Math.round(n));
}

const drawerFont = "'InterDisplay', 'Inter Display', sans-serif";

const drawerActionBase: CSSProperties = {
  fontFamily: drawerFont,
  letterSpacing: "-0.02em",
  fontSize: 13,
  borderRadius: 8,
};

const drawerBtnSecondary: CSSProperties = {
  ...drawerActionBase,
  fontWeight: 500,
  color: "var(--ws-text)",
  background: "var(--ws-surface)",
  border: "1px solid var(--ws-border)",
  padding: "8px 12px",
  cursor: "pointer",
};

const drawerSelect: CSSProperties = {
  ...drawerActionBase,
  fontWeight: 500,
  padding: "8px 10px",
  border: "1px solid var(--ws-border)",
  background: "var(--ws-surface)",
  color: "var(--ws-text)",
  cursor: "pointer",
};

const drawerTagStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--ws-text)",
  background: "var(--ws-bg)",
  padding: "2px 8px",
  borderRadius: 20,
  letterSpacing: "-0.01em",
};

function platformLabel(platform: string) {
  const p = platform.toLowerCase();
  if (p === "instagram") return "Instagram";
  if (p === "youtube") return "YouTube";
  return "TikTok";
}

function profileUrl(platform: string, username: string) {
  const p = platform.toLowerCase();
  if (p === "instagram") return `https://instagram.com/${username}`;
  if (p === "youtube") return `https://youtube.com/@${username}`;
  return `https://tiktok.com/@${username}`;
}

function engagementInsight(rate: number, lang: Lang): string {
  return engagementInsightCopy(lang, rate);
}

function VerifiedBadge({ label }: { label: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-label={label} style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill="var(--ws-accent)" />
      <path d="M8 12.5l2.5 2.5L16 9" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function platformLogoSrc(platform: string): string | null {
  const p = platform.toLowerCase();
  if (p.includes("instagram")) return "/instagram-logo.svg";
  if (p.includes("youtube")) return null;
  return "/tiktok-logo.svg";
}

function PlatformPill({ platform }: { platform: string }) {
  const label = platformLabel(platform);
  const logoSrc = platformLogoSrc(platform);
  const outer = 20;
  const inner = 16;

  if (logoSrc) {
    return (
      <span
        style={{
          width: outer,
          height: outer,
          borderRadius: "50%",
          overflow: "hidden",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
        title={label}
      >
        <img
          src={logoSrc}
          alt={label}
          width={inner}
          height={inner}
          style={{ display: "block", objectFit: "contain" }}
        />
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }} title={label}>
      <PlatformBrandIcon platform={platform} size={inner} />
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: "var(--ws-hover)", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: "var(--ws-text-dim)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: accent ? "var(--ws-accent)" : "var(--ws-text)", letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}

function DrawerSection({ title, children, first, right }: { title?: string; children: ReactNode; first?: boolean; right?: ReactNode }) {
  return (
    <section
      style={{
        marginTop: first ? 0 : 32,
        paddingTop: first ? 0 : 28,
        borderTop: first ? "none" : "1px solid var(--ws-border)",
      }}
    >
      {(title || right) ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          {title ? (
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--ws-text)", margin: 0, letterSpacing: "-0.02em" }}>{title}</h2>
          ) : <span />}
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function SegmentedTabs({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; label: string }>;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        padding: 3,
        borderRadius: 10,
        background: "var(--ws-pill)",
        border: "1px solid var(--ws-border)",
        gap: 2,
      }}
    >
      {options.map((opt) => {
        const on = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            style={{
              border: "none",
              background: on ? "var(--ws-surface)" : "transparent",
              color: on ? "var(--ws-text)" : "var(--ws-text-muted)",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              padding: "5px 10px",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: on ? "0 1px 2px rgba(0,0,0,0.18)" : "none",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid var(--ws-border)",
        background: "var(--ws-surface-2)",
        borderRadius: 14,
        padding: "14px 14px 12px",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 650, color: "var(--ws-text-muted)", marginBottom: 12, letterSpacing: "-0.01em" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function VerticalMetricBars({
  items,
}: {
  items: Array<{ label: string; value: number; display: string }>;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 140, paddingTop: 8 }}>
      {items.map((item) => {
        const h = Math.max(8, Math.round((item.value / max) * 100));
        return (
          <div key={item.label} style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 650, color: "var(--ws-text)", letterSpacing: "-0.02em" }}>{item.display}</span>
            <div
              style={{
                width: "100%",
                maxWidth: 36,
                height: `${h}%`,
                minHeight: 8,
                borderRadius: "6px 6px 2px 2px",
                background: "linear-gradient(180deg, var(--ws-accent) 0%, rgba(91,140,255,0.45) 100%)",
              }}
              title={`${item.label}: ${item.display}`}
            />
            <span style={{ fontSize: 10, color: "var(--ws-text-dim)", textAlign: "center", lineHeight: 1.2, letterSpacing: "-0.01em" }}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function RateBars({ items }: { items: Array<{ label: string; pct: number; display: string }> }) {
  const max = Math.max(1, ...items.map((i) => i.pct));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((item) => (
        <div key={item.label}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "var(--ws-text-muted)" }}>{item.label}</span>
            <span style={{ fontSize: 12, fontWeight: 650, color: "var(--ws-text)" }}>{item.display}</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "var(--ws-hover)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.max(4, Math.min(100, (item.pct / max) * 100))}%`,
                borderRadius: 999,
                background: "var(--ws-accent)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ScoreRing({
  label,
  value,
  max = 100,
  display,
}: {
  label: string;
  value: number;
  max?: number;
  display: string;
}) {
  const pct = Math.max(0, Math.min(1, value / Math.max(1, max)));
  const size = 84;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ws-hover)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--ws-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="middle"
          textAnchor="middle"
          fill="var(--ws-text)"
          fontSize="13"
          fontWeight="700"
          fontFamily="InterDisplay, Inter Display, sans-serif"
        >
          {display}
        </text>
      </svg>
      <span style={{ fontSize: 11, color: "var(--ws-text-muted)", textAlign: "center", letterSpacing: "-0.01em" }}>{label}</span>
    </div>
  );
}

function AdvancedMetricsDiagrams({ d, lang }: { d: CreatorDetail; lang: Lang }) {
  const t = discoveryCopy(lang);
  const avgViews = d.avgViews || 0;
  const avgLikes = d.avgLikes ?? 0;
  const avgComments = d.avgComments ?? 0;
  const avgShares = d.avgShares ?? 0;
  const likeRate = avgViews > 0 ? (avgLikes / avgViews) * 100 : 0;
  const commentRate = avgViews > 0 ? (avgComments / avgViews) * 100 : 0;
  const shareRate = avgViews > 0 ? (avgShares / avgViews) * 100 : 0;
  const reachPct = Math.round((d.viewsPerFollower ?? 0) * 100);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ChartCard title={t.engagementBreakdown}>
        <VerticalMetricBars
          items={[
            { label: t.avgViewsLong, value: avgViews, display: fmt(avgViews) },
            { label: t.avgLikes, value: avgLikes, display: fmt(avgLikes) },
            { label: t.avgComments, value: avgComments, display: fmt(avgComments) },
            { label: t.avgShares, value: avgShares, display: fmt(avgShares) },
          ]}
        />
      </ChartCard>

      <ChartCard title={t.ratesDistribution}>
        <RateBars
          items={[
            { label: t.likeRate, pct: likeRate, display: `${likeRate.toFixed(2)}%` },
            { label: t.commentRate, pct: commentRate, display: `${commentRate.toFixed(2)}%` },
            { label: t.shareRate, pct: shareRate, display: `${shareRate.toFixed(2)}%` },
            { label: t.engagementRate, pct: d.engagementRate, display: `${d.engagementRate}%` },
          ]}
        />
      </ChartCard>

      <ChartCard title={t.qualityScores}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <ScoreRing label={t.authenticity} value={d.authenticityScore} max={100} display={`${d.authenticityScore}`} />
          <ScoreRing label={t.engagementRate} value={d.engagementRate} max={12} display={`${d.engagementRate}%`} />
          <ScoreRing label={t.reachPerFollower} value={reachPct} max={25} display={`${reachPct}%`} />
        </div>
      </ChartCard>
    </div>
  );
}

function TrendUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M7 17L17 7M17 7H10M17 7v7" stroke="#15803D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MetricBarRow({ label, value, pct, trend }: { label: string; value: string; pct: number; trend?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "118px 1fr auto", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--ws-border)" }}>
      <span style={{ fontSize: 13, color: "var(--ws-text-dim)", letterSpacing: "-0.01em" }}>{label}</span>
      <div style={{ height: 8, background: "var(--ws-accent-soft)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(6, Math.min(100, pct))}%`, background: "var(--ws-accent)", borderRadius: 999, transition: "width 0.2s ease" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 64, justifyContent: "flex-end" }}>
        {trend && <TrendUpIcon />}
        <span style={{ fontSize: 14, fontWeight: 600, color: trend ? "#15803D" : "var(--ws-text)", letterSpacing: "-0.02em" }}>{value}</span>
      </div>
    </div>
  );
}

function fmtRate(num: number, denom: number): string {
  if (!denom) return "—";
  return `${((num / denom) * 100).toFixed(2)}%`;
}

function valueTierLabel(tier: ValueTier, lang: Lang): string {
  const labels: Record<ValueTier, { fr: string; en: string }> = {
    nano: { fr: "Nano", en: "Nano" },
    micro: { fr: "Micro", en: "Micro" },
    mid: { fr: "Mid", en: "Mid" },
    macro: { fr: "Macro", en: "Macro" },
    mega: { fr: "Mega", en: "Mega" },
  };
  return lang === "fr" ? labels[tier].fr : labels[tier].en;
}

function BrandSignalsGrid({ d, lang }: { d: CreatorDetail; lang: Lang }) {
  const t = discoveryCopy(lang);
  const avgViews = d.avgViews || 0;
  const postsAnalyzed = d.postsAnalyzed ?? 0;
  const reliable = hasReliableCreatorMetrics(postsAnalyzed);
  const cpmReady = reliable && avgViews >= MIN_VIEWS_FOR_VALUE_METRICS && d.estCpm > 0;
  const frequency = postsAnalyzed >= 2 ? d.postFrequency : 0;

  return (
    <>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--ws-text)", margin: "24px 0 12px", letterSpacing: "-0.02em" }}>{t.brandSignals}</h3>
      {!reliable && postsAnalyzed > 0 ? (
        <p style={{ fontSize: 12, color: "var(--ws-text-dim)", margin: "0 0 12px", lineHeight: 1.45, letterSpacing: "-0.01em" }}>
          {t.lowSampleNote(postsAnalyzed)}
        </p>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <Stat label={t.likeRate} value={fmtRate(d.avgLikes ?? 0, avgViews)} />
        <Stat label={t.commentRate} value={fmtRate(d.avgComments ?? 0, avgViews)} />
        <Stat label={t.shareRate} value={fmtRate(d.avgShares ?? 0, avgViews)} />
        <Stat label={t.estCpm} value={cpmReady ? `$${d.estCpm}` : "—"} accent />
        <Stat label={t.estCostPerPost} value={d.estCostPerPost > 0 ? `$${d.estCostPerPost.toLocaleString()}` : "—"} />
        <Stat label={t.valueScore} value={reliable && d.valueScore > 0 ? `${d.valueScore}/100` : "—"} accent />
        <Stat label={t.postFrequency} value={frequency > 0 ? t.postsPerWeek(frequency) : "—"} />
        <Stat label={t.creatorTier} value={d.valueTier ? valueTierLabel(d.valueTier, lang) : "—"} />
        <Stat label={t.engagementByFollower} value={d.engagementByFollower > 0 ? `${d.engagementByFollower.toFixed(2)}%` : "—"} />
      </div>
    </>
  );
}

function ContentAnalyticsPanel({ d, lang }: { d: CreatorDetail; lang: Lang }) {
  const t = discoveryCopy(lang);
  const avgViews = d.avgViews || 0;
  const avgLikes = d.avgLikes ?? 0;
  const avgComments = d.avgComments ?? 0;
  const avgShares = d.avgShares ?? 0;
  const reachRatio = d.viewsPerFollower ?? 0;

  const metrics = [
    { label: t.avgViewsLong, value: fmt(avgViews), raw: avgViews, trend: avgViews > 0 && reachRatio >= 0.05 },
    { label: t.avgLikes, value: fmt(avgLikes), raw: avgLikes, trend: avgLikes > 0 && d.engagementRate >= 3 },
    { label: t.avgComments, value: fmt(avgComments), raw: avgComments, trend: avgComments > 0 && d.engagementRate >= 2 },
    { label: t.avgShares, value: fmt(avgShares), raw: avgShares, trend: avgShares > 0 },
  ];
  const max = Math.max(1, ...metrics.map((m) => m.raw));

  return (
    <div style={{ marginBottom: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "118px 1fr", gap: 12, alignItems: "start", marginBottom: 6, paddingBottom: 14, borderBottom: "1px solid var(--ws-border)" }}>
        <span style={{ fontSize: 13, color: "var(--ws-text-dim)", paddingTop: 6 }}>{t.engagementRate}</span>
        <div>
          <div style={{ fontSize: 28, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.04em", lineHeight: 1.1 }}>{d.engagementRate}%</div>
          <div style={{ fontSize: 12, color: "var(--ws-text-dim)", marginTop: 6, lineHeight: 1.45, letterSpacing: "-0.01em" }}>
            {engagementInsight(d.engagementRate, lang)}
          </div>
        </div>
      </div>

      {metrics.map((m) => (
        <MetricBarRow key={m.label} label={m.label} value={m.value} pct={(m.raw / max) * 100} trend={m.trend} />
      ))}
    </div>
  );
}

function VideoCover({ cover, previewKey }: { cover: string; previewKey: string }) {
  return (
    <ProxiedImage
      identity={previewKey}
      src={cover}
      alt=""
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}

function VideoTile({ v, username, lang }: {
  v: { key: string; cover: string; views: number; videoId: string | null; shareUrl: string | null; streamUrl: string | null };
  username: string;
  lang: Lang;
}) {
  const t = discoveryCopy(lang);
  const watchUrl = tiktokVideoWatchUrl({
    id: v.videoId,
    shareUrl: v.shareUrl,
    username,
  });

  return (
    <button
      type="button"
      aria-label={t.playVideo}
      onClick={() => {
        if (!watchUrl) return;
        window.open(watchUrl, "_blank", "noopener,noreferrer");
      }}
      disabled={!watchUrl}
      style={{
        position: "relative",
        aspectRatio: "9 / 16",
        borderRadius: 10,
        border: "none",
        cursor: watchUrl ? "pointer" : "default",
        padding: 0,
        background: "var(--ws-border)",
        display: "block",
        width: "100%",
        overflow: "hidden",
      }}
    >
      <VideoCover cover={v.cover} previewKey={v.key} />
      {watchUrl && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFFFFF",
            fontSize: 26,
            pointerEvents: "none",
          }}
        >
          ▶
        </span>
      )}
      {v.views > 0 && (
        <span style={{ position: "absolute", left: 6, bottom: 6, fontSize: 10, fontWeight: 600, color: "#FFFFFF", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>{fmt(v.views)} {t.views}</span>
      )}
    </button>
  );
}

export function CreatorDetailDrawer({ creator, plan, lang, onClose, onUpgrade, onWorkspaceChange, onHiddenChange, userId }: {
  creator: FeedCreator | null;
  plan: PlanTier;
  lang: Lang;
  onClose: () => void;
  onUpgrade: () => void;
  onWorkspaceChange?: () => void;
  onHiddenChange?: () => void;
  userId?: string;
}) {
  const t = discoveryCopy(lang);
  const stages = pipelineStages(lang);
  const isPaid = plan !== "free";
  const [detail, setDetail] = useState<CreatorDetail | null>(creator);
  const [shown, setShown] = useState(false);
  const [analysis, setAnalysis] = useState<ContentAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stage, setStageState] = useState("saved");
  const [notesVal, setNotesVal] = useState("");
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [inFolders, setInFolders] = useState<Set<string>>(new Set());
  const [folderOpen, setFolderOpen] = useState(false);
  const [campaignMenuOpen, setCampaignMenuOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [campaignIdsWithCreator, setCampaignIdsWithCreator] = useState<Set<string>>(new Set());
  const [managedCreatorId, setManagedCreatorId] = useState<string | null>(null);
  const [campaignBusyId, setCampaignBusyId] = useState<string | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState<string | undefined>(userId);
  const [newFolder, setNewFolder] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const aiSectionRef = useRef<HTMLDivElement>(null);
  const saveMenuRef = useRef<HTMLDivElement>(null);
  const campaignMenuRef = useRef<HTMLDivElement>(null);
  const [aiVisible, setAiVisible] = useState(false);
  const [perfMode, setPerfMode] = useState<"basic" | "advanced">("basic");

  useEffect(() => {
    setResolvedUserId(userId);
    if (userId || !supabase) return;
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user?.id) setResolvedUserId(data.user.id);
    });
  }, [userId]);

  useEffect(() => {
    if (!creator) return;
    setHidden(isCreatorHidden(creator.username));
    setFolderOpen(false);
    setCampaignMenuOpen(false);
    setPerfMode("basic");
    let cancelled = false;
    (async () => {
      const [rows, f] = await Promise.all([listSaved(), listFolders()]);
      if (cancelled) return;
      const mine = rows.find((r) => r.creator_username === creator.username);
      setSaved(!!mine);
      setStageState(mine?.pipeline_status || "saved");
      setNotesVal(mine?.notes || "");
      setFolders(f.folders);
      setInFolders(new Set(f.items.filter((i) => i.creator_username === creator.username).map((i) => i.folder_id)));
    })();
    return () => { cancelled = true; };
  }, [creator]);

  useEffect(() => {
    if (!creator || !resolvedUserId) {
      setCampaigns([]);
      setCampaignIdsWithCreator(new Set());
      setManagedCreatorId(null);
      return;
    }
    let cancelled = false;
    const handle = creator.username.replace(/^@/, "").toLowerCase();
    (async () => {
      const [rows, managed, links] = await Promise.all([
        getCampaigns(resolvedUserId),
        getSavedCreators(resolvedUserId),
        getCampaignCreatorLinks(resolvedUserId),
      ]);
      if (cancelled) return;
      const list = (rows || [])
        .map((r: { id?: string; name?: string; status?: string }) => ({
          id: String(r.id || ""),
          name: String(r.name || "Campaign"),
          status: String(r.status || ""),
        }))
        .filter((r) => r.id && r.status !== "Draft");
      setCampaigns(list);
      const managedRow = (managed as Array<{ id?: string; handle?: string; username?: string }>).find(
        (c) => String(c.handle || c.username || "").replace(/^@/, "").toLowerCase() === handle,
      );
      const creatorId = managedRow?.id ? String(managedRow.id) : null;
      setManagedCreatorId(creatorId);
      if (creatorId) {
        setCampaignIdsWithCreator(
          new Set(links.filter((l) => l.creator_id === creatorId).map((l) => l.campaign_id)),
        );
      } else {
        setCampaignIdsWithCreator(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [creator, resolvedUserId]);

  useEffect(() => {
    if (!folderOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (saveMenuRef.current && !saveMenuRef.current.contains(e.target as Node)) setFolderOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [folderOpen]);

  useEffect(() => {
    if (!campaignMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (campaignMenuRef.current && !campaignMenuRef.current.contains(e.target as Node)) {
        setCampaignMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [campaignMenuOpen]);

  const ensureManagedCreatorId = async (): Promise<string | null> => {
    if (!creator || !resolvedUserId) return null;
    if (managedCreatorId) return managedCreatorId;
    const savedRow = await saveManagedCreator(resolvedUserId, {
      username: creator.username,
      display_name: creator.displayName || creator.username,
      avatar_url: creator.avatarUrl || "",
      platform: creator.platform || "TikTok",
      followers_count: creator.followersCount || 0,
      engagement_rate: creator.engagementRate || 0,
      avg_views: creator.avgViews || 0,
      bio: creator.bio || "",
      niche: creator.primaryNiche || creator.niche || "",
    });
    const id = savedRow && typeof savedRow === "object" && "id" in savedRow
      ? String((savedRow as { id?: string }).id || "")
      : "";
    if (!id) return null;
    setManagedCreatorId(id);
    return id;
  };

  const toggleCampaignMembership = async (campaignId: string) => {
    if (!creator || !resolvedUserId || campaignBusyId) return;
    setCampaignBusyId(campaignId);
    try {
      const creatorId = await ensureManagedCreatorId();
      if (!creatorId) return;
      const links = await getCampaignCreatorLinks(resolvedUserId);
      const existing = links
        .filter((l) => l.campaign_id === campaignId)
        .map((l) => l.creator_id);
      const already = existing.includes(creatorId);
      const nextIds = already
        ? existing.filter((id) => id !== creatorId)
        : [...existing, creatorId];
      const ok = await syncCampaignCreators(resolvedUserId, campaignId, nextIds);
      if (!ok) return;
      setCampaignIdsWithCreator((prev) => {
        const n = new Set(prev);
        if (already) n.delete(campaignId);
        else n.add(campaignId);
        return n;
      });
      dispatchCampaignsUpdated();
      onWorkspaceChange?.();
    } finally {
      setCampaignBusyId(null);
    }
  };

  const onToggleHide = () => {
    if (!creator) return;
    if (hidden) {
      unhideCreator(creator.username);
      setHidden(false);
      onHiddenChange?.();
      return;
    }
    hideCreator(creator.username);
    setHidden(true);
    onHiddenChange?.();
    onClose();
  };

  const openSaveMenu = () => {
    setFolderOpen(true);
  };

  const ensureSaved = async () => {
    if (saved || !creator) return true;
    const res = await saveCreator(creator);
    if (res.error) { if (res.status === 402) onUpgrade(); return false; }
    setSaved(true);
    onWorkspaceChange?.();
    return true;
  };
  const onSaveToggle = async () => {
    if (!creator || saveBusy) return;
    setSaveBusy(true);
    try {
      if (saved) {
        const res = await unsave(creator.username);
        if (res.error) return;
        setSaved(false);
        setInFolders(new Set());
        setStageState("saved");
        setNotesVal("");
      } else {
        const res = await saveCreator(creator);
        if (res.error) {
          if (res.status === 402) onUpgrade();
          return;
        }
        setSaved(true);
      }
      onWorkspaceChange?.();
    } finally {
      setSaveBusy(false);
    }
  };
  const onStageChange = async (v: string) => {
    if (!creator) return;
    setStageState(v);
    if (!(await ensureSaved())) return;
    await apiSetStage(creator.username, v);
    onWorkspaceChange?.();
  };
  const toggleFolder = async (f: FolderRow) => {
    if (!creator) return;
    if (inFolders.has(f.id)) {
      await removeFromFolder(f.id, creator.username);
      setInFolders((s) => { const n = new Set(s); n.delete(f.id); return n; });
    } else {
      if (!(await ensureSaved())) return;
      await addToFolder(f.id, creator.username);
      setInFolders((s) => new Set(s).add(f.id));
    }
    onWorkspaceChange?.();
  };
  const onCreateFolder = async () => {
    const name = newFolder.trim();
    if (!name) return;
    const f = await createFolder(name);
    setNewFolder("");
    if (f) { setFolders((arr) => [...arr, f]); await toggleFolder(f); }
  };
  const onNotesBlur = async () => {
    if (!creator || !saved) return;
    await apiSetNotes(creator.username, notesVal);
    onWorkspaceChange?.();
  };

  const onAvatarFileChange = async (file: File | null) => {
    if (!file || !creator || !saved || avatarBusy) return;
    if (!file.type.startsWith("image/")) return;
    setAvatarBusy(true);
    try {
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
      const path = `${user.id}/creators/${creator.username.toLowerCase()}/avatar.${safeExt}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (upErr) return;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const avatarUrl = `${pub.publicUrl}?t=${Date.now()}`;
      const res = await setCreatorAvatar(creator.username, avatarUrl);
      if (res.error) return;
      setCachedAvatarUrl(creator.username, avatarUrl);
      setDetail((prev) => (prev ? { ...prev, avatarUrl } : prev));
      onWorkspaceChange?.();
    } finally {
      setAvatarBusy(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!creator) {
      setDetail(null);
      return;
    }
    // Paint Performance immediately from feed fields + any hover prefetch cache.
    const cached = getCachedCreatorDetail(creator.username);
    setDetail(cached ? ({ ...creator, ...(cached as unknown as CreatorDetail) } as CreatorDetail) : creator);
    setShown(false);
    const t = setTimeout(() => setShown(true), 10);
    setAiVisible(false);
    setAnalysis(null);
    setAnalysisLoading(false);
    let cancelled = false;
    const handle = creator.username;
    void fetchCreatorDetail(handle).then((remoteRaw) => {
      if (cancelled || !remoteRaw) return;
      const remote = remoteRaw as unknown as CreatorDetail;
      if (remote.username && remote.username !== handle) return;
      setCachedCreatorDetail(remoteRaw);
      setDetail((prev) => {
        if (!prev || prev.username !== handle) return remote;
        const merged = { ...prev, ...remote } as CreatorDetail;
        merged.avatarUrl = mergeCreatorAvatarSrc(handle, remote.avatarUrl, prev.avatarUrl);
        if (!remote.topVideos?.length && prev.topVideos?.length) merged.topVideos = prev.topVideos;
        if (!remote.videoThumbnails?.length && prev.videoThumbnails?.length) {
          merged.videoThumbnails = prev.videoThumbnails;
        }
        return merged;
      });
    });
    return () => { cancelled = true; clearTimeout(t); };
  }, [creator]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lazy AI: only fetch when the section scrolls into view (don't block Performance).
  useEffect(() => {
    if (!creator || !isPaid) return;
    const el = aiSectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setAiVisible(true);
      },
      { root: null, rootMargin: "120px", threshold: 0.05 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [creator, isPaid]);

  useEffect(() => {
    if (!creator || !isPaid || !aiVisible) return;
    let cancelled = false;
    setAnalysisLoading(true);
    fetch(`/api/creator/${encodeURIComponent(creator.username)}/analyze`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setAnalysis(d?.analysis ?? null); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAnalysisLoading(false); });
    return () => { cancelled = true; };
  }, [creator, isPaid, aiVisible]);

  const videos = useMemo(() => {
    if (!detail) return [];
    return buildCreatorVideoPreviews(detail.username, {
      videoThumbnails: detail.videoThumbnails,
      topVideos: detail.topVideos,
      limit: 8,
    });
  }, [detail]);

  if (!creator || !detail) return null;

  const d = detail;
  const isVerified = d.authenticityScore >= 60;
  const reachPct = Math.round((d.viewsPerFollower ?? 0) * 100);
  const platformName = platformLabel(d.platform);
  const externalUrl = profileUrl(d.platform, d.username);
  const leftSectionTitle: CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ws-text-muted)",
    letterSpacing: "-0.01em",
    margin: "0 0 10px",
    textTransform: "uppercase",
  };

  const listPicker = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        disabled={saveBusy}
        onClick={() => void onSaveToggle()}
        style={{
          ...drawerActionBase,
          fontWeight: 600,
          cursor: saveBusy ? "wait" : "pointer",
          padding: "8px 12px",
          border: "1px solid var(--ws-border)",
          background: saved ? "var(--ws-accent-soft)" : "var(--ws-surface)",
          color: "var(--ws-text)",
          textAlign: "left",
        }}
      >
        {saved ? t.saved : t.saveWithoutList}
      </button>
      {folders.length === 0 && <div style={{ fontSize: 12, color: "var(--ws-text-dim)" }}>{t.noListsYet}</div>}
      {folders.map((f) => (
        <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: "var(--ws-text)" }}>
          <input type="checkbox" checked={inFolders.has(f.id)} onChange={() => void toggleFolder(f)} />
          {f.name}
        </label>
      ))}
      {isPaid ? (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <input
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void onCreateFolder(); }}
            placeholder={t.listNamePlaceholder}
            style={{ flex: 1, fontSize: 12, padding: "6px 8px", border: "1px solid var(--ws-border)", borderRadius: 8, fontFamily: "inherit", boxSizing: "border-box", background: "var(--ws-input)", color: "var(--ws-text)" }}
          />
          <button type="button" onClick={() => void onCreateFolder()} style={{ ...drawerBtnSecondary, padding: "0 10px" }}>+</button>
        </div>
      ) : (
        <button type="button" onClick={onUpgrade} style={{ ...drawerBtnSecondary, width: "100%" }}>{t.listsPaidOnly}</button>
      )}
    </div>
  );

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "flex", justifyContent: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(780px, 100%)",
          height: "100%",
          display: "flex",
          background: "var(--ws-surface)",
          transform: shown ? "translateX(0)" : "translateX(36px)",
          opacity: shown ? 1 : 0,
          transition: "transform .18s ease, opacity .18s ease",
          boxSizing: "border-box",
          fontFamily: drawerFont,
          boxShadow: "var(--ws-shadow)",
        }}
      >
        {/* Left: Relationship */}
        <aside
          style={{
            width: 252,
            flexShrink: 0,
            borderRight: "1px solid var(--ws-border)",
            background: "var(--ws-surface-2)",
            overflowY: "auto",
            padding: "18px 16px 40px",
            boxSizing: "border-box",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 18 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 650, color: "var(--ws-text)", letterSpacing: "-0.02em" }}>{t.relationship}</h2>
            {isPaid ? (
              <select value={stage} onChange={(e) => void onStageChange(e.target.value)} aria-label={t.pipelineStageAria} style={{ ...drawerSelect, padding: "5px 8px", fontSize: 12 }}>
                {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            ) : (
              <button type="button" onClick={onUpgrade} style={{ ...drawerBtnSecondary, padding: "5px 8px", fontSize: 12 }}>{t.pipelineStage}</button>
            )}
          </div>

          <section style={{ marginBottom: 22 }}>
            <h3 style={leftSectionTitle}>{t.profiles}</h3>
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--ws-border)",
                background: "var(--ws-surface)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <PlatformPill platform={d.platform} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em" }}>{platformName}</div>
                <div style={{ fontSize: 12, color: "var(--ws-text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{d.username}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 650, color: "var(--ws-text)" }}>{fmt(d.followersCount)}</div>
                <div style={{ fontSize: 11, color: "var(--ws-text-dim)" }}>{d.engagementRate}% ER</div>
              </div>
            </a>
          </section>

          <section style={{ marginBottom: 22 }}>
            <h3 style={leftSectionTitle}>{t.emails}</h3>
            {d.email ? (
              <a
                href={`mailto:${d.email}`}
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--ws-accent)",
                  textDecoration: "none",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--ws-border)",
                  background: "var(--ws-surface)",
                  wordBreak: "break-all",
                }}
              >
                {d.email}
              </a>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--ws-text-dim)", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--ws-border)", background: "var(--ws-surface)" }}>
                {t.noEmailShort}
              </div>
            )}
          </section>

          <section style={{ marginBottom: 22 }}>
            <h3 style={leftSectionTitle}>{t.campaigns}</h3>
            <div ref={campaignMenuRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setCampaignMenuOpen((o) => !o)}
                style={{ ...drawerBtnSecondary, width: "100%" }}
              >
                {t.addShort} ▾
              </button>
              {campaignMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "110%",
                    left: 0,
                    right: 0,
                    zIndex: 14,
                    background: "var(--ws-surface)",
                    border: "1px solid var(--ws-border)",
                    borderRadius: 12,
                    padding: 10,
                    boxShadow: "var(--ws-shadow)",
                    maxHeight: 240,
                    overflowY: "auto",
                  }}
                >
                  {campaigns.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--ws-text-dim)", padding: "4px 2px" }}>{t.noCampaignsYet}</div>
                  ) : (
                    campaigns.map((c) => {
                      const on = campaignIdsWithCreator.has(c.id);
                      const busy = campaignBusyId === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          disabled={busy}
                          onClick={() => void toggleCampaignMembership(c.id)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            width: "100%",
                            textAlign: "left",
                            border: "none",
                            background: on ? "var(--ws-accent-soft)" : "transparent",
                            borderRadius: 8,
                            padding: "8px 8px",
                            cursor: busy ? "wait" : "pointer",
                            font: "inherit",
                            color: "var(--ws-text)",
                            opacity: busy ? 0.7 : 1,
                          }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 550, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.name}
                          </span>
                          {on ? (
                            <span style={{ fontSize: 11, fontWeight: 650, color: "var(--ws-accent)", flexShrink: 0 }}>{t.campaignAdded}</span>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </section>

          {isPaid && (
            <section>
              <h3 style={leftSectionTitle}>{t.privateNote}</h3>
              <textarea
                value={notesVal}
                onChange={(e) => setNotesVal(e.target.value)}
                onBlur={onNotesBlur}
                placeholder={saved ? t.notePlaceholder : t.noteSaveFirst}
                style={{ width: "100%", minHeight: 72, fontSize: 12.5, padding: 10, border: "1px solid var(--ws-border)", borderRadius: 10, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", background: "var(--ws-input)", color: "var(--ws-text)" }}
              />
            </section>
          )}
        </aside>

        {/* Right: Profile */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "18px 22px 48px", boxSizing: "border-box", background: "var(--ws-surface)" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{ ...drawerActionBase, width: 32, height: 32, borderRadius: 8, border: "1px solid var(--ws-border)", background: "var(--ws-surface)", color: "var(--ws-text-muted)", cursor: "pointer", lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 16 }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <CreatorAvatar username={d.username} src={d.avatarUrl} displayName={d.displayName} size={72} alt={d.displayName} priority />
              {saved && (
                <>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    style={{ display: "none" }}
                    onChange={(e) => void onAvatarFileChange(e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    disabled={avatarBusy}
                    onClick={() => avatarInputRef.current?.click()}
                    title={lang === "fr" ? "Changer la photo" : "Change photo"}
                    style={{
                      position: "absolute",
                      right: -4,
                      bottom: -4,
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      border: "1px solid var(--ws-border)",
                      background: "var(--ws-surface)",
                      color: "var(--ws-text)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: avatarBusy ? "wait" : "pointer",
                      padding: 0,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M4 16l4.5-4.5a2 2 0 012.8 0L16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M14 14l1.5-1.5a2 2 0 012.8 0L20 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
                      <circle cx="9" cy="9" r="1.4" fill="currentColor" />
                    </svg>
                  </button>
                </>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ws-text)", letterSpacing: "-0.035em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.displayName}
                </div>
                {isVerified && <VerifiedBadge label={t.verifiedAccount} />}
              </div>
              <div style={{ fontSize: 14, color: "var(--ws-text-dim)", marginTop: 2, letterSpacing: "-0.01em" }}>@{d.username}</div>
              {d.bio ? (
                <p style={{ fontSize: 13, color: "var(--ws-text-muted)", lineHeight: 1.5, margin: "10px 0 0", letterSpacing: "-0.01em" }}>{d.bio}</p>
              ) : null}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 10 }}>
                <span style={{ ...drawerTagStyle, background: "var(--ws-pill)" }}>{t.creatorAccount}</span>
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13, fontWeight: 600, color: "var(--ws-accent)", textDecoration: "none", letterSpacing: "-0.01em" }}
                >
                  {platformName}
                </a>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
            <div ref={saveMenuRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={openSaveMenu}
                disabled={saveBusy}
                style={{
                  ...drawerActionBase,
                  fontWeight: 650,
                  cursor: saveBusy ? "wait" : "pointer",
                  padding: "9px 16px",
                  border: "none",
                  color: "#fff",
                  background: "var(--ws-accent)",
                  opacity: saveBusy ? 0.7 : 1,
                }}
              >
                {t.saveShort}
              </button>
              {folderOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "110%",
                    left: 0,
                    zIndex: 12,
                    background: "var(--ws-surface)",
                    border: "1px solid var(--ws-border)",
                    borderRadius: 12,
                    padding: 12,
                    width: 260,
                    boxShadow: "var(--ws-shadow)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 650, color: "var(--ws-text-muted)", marginBottom: 8 }}>{t.addToList}</div>
                  {listPicker}
                </div>
              )}
            </div>
            <button type="button" onClick={onToggleHide} style={drawerBtnSecondary}>
              {hidden ? t.unhideCreator : t.hideCreator}
            </button>
          </div>

          {videos.length > 0 && (
            <div key={d.username} style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
              {videos.map((v) => (
                <VideoTile key={v.key} v={v} username={d.username} lang={lang} />
              ))}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
              marginBottom: 8,
              padding: 14,
              borderRadius: 14,
              background: "var(--ws-accent-soft)",
              border: "1px solid var(--ws-border)",
            }}
          >
            <Stat label={t.followers} value={fmt(d.followersCount)} />
            <Stat label={t.engagement} value={`${d.engagementRate}%`} />
            <Stat label={t.avgViews} value={fmt(d.avgViews)} />
          </div>

          <DrawerSection
            title={t.performanceSection}
            right={
              <SegmentedTabs
                value={perfMode}
                onChange={(v) => setPerfMode(v === "advanced" ? "advanced" : "basic")}
                options={[
                  { id: "basic", label: t.performanceBasic },
                  { id: "advanced", label: t.performanceAdvanced },
                ]}
              />
            }
          >
            {perfMode === "basic" ? (
              <>
                <ContentAnalyticsPanel d={d} lang={lang} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 20 }}>
                  <Stat label={t.authenticity} value={`${d.authenticityScore}/100`} />
                  <Stat label={t.reachPerFollower} value={`${reachPct > 0 ? reachPct : Math.round((d.viewsPerFollower ?? 0) * 100)}%`} />
                  <Stat label={t.postsAnalyzed} value={String(d.postsAnalyzed ?? 0)} />
                </div>
                <BrandSignalsGrid d={d} lang={lang} />
              </>
            ) : (
              <AdvancedMetricsDiagrams d={d} lang={lang} />
            )}
          </DrawerSection>

          {isPaid && (
            <div ref={aiSectionRef}>
              <DrawerSection title={t.aiAnalysis}>
                {!aiVisible || (analysisLoading && !analysis) ? (
                  <div style={{ fontSize: 13, color: "var(--ws-text-dim)", background: "var(--ws-hover)", borderRadius: 10, padding: 14 }}>{t.analyzingVideos}</div>
                ) : analysis ? (
                  <div style={{ background: "var(--ws-hover)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ fontSize: 13, color: "var(--ws-text)", lineHeight: 1.55 }}>{analysis.summary}</div>
                    {analysis.themes.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {analysis.themes.map((th) => (
                          <span key={th} style={{ fontSize: 11, color: "var(--ws-accent)", background: "var(--ws-accent-soft)", padding: "2px 9px", borderRadius: 20 }}>{th}</span>
                        ))}
                      </div>
                    )}
                    {analysis.style && <div style={{ fontSize: 12.5, color: "var(--ws-text-muted)", lineHeight: 1.5 }}><span style={{ color: "var(--ws-text)", fontWeight: 600 }}>{t.style}:</span> {analysis.style}</div>}
                    {analysis.production && <div style={{ fontSize: 12.5, color: "var(--ws-text-muted)", lineHeight: 1.5 }}><span style={{ color: "var(--ws-text)", fontWeight: 600 }}>{t.production}:</span> {analysis.production}</div>}
                    {analysis.brandFit && <div style={{ fontSize: 12.5, color: "var(--ws-text)", background: "var(--ws-accent-soft)", borderRadius: 8, padding: "8px 10px", lineHeight: 1.5 }}><span style={{ fontWeight: 600 }}>{t.brandFit}:</span> {analysis.brandFit}</div>}
                    {!analysis.brandSafe && <div style={{ fontSize: 12, color: "var(--ws-danger)", background: "var(--ws-hover)", borderRadius: 8, padding: "6px 10px" }}>⚠ {t.brandSensitive}</div>}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--ws-text-dim)" }}>{t.analysisUnavailable}</div>
                )}
              </DrawerSection>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
