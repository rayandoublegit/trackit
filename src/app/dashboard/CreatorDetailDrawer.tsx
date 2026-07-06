"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { PlanTier } from "@/lib/plan-limits";
import type { FeedCreator } from "@/lib/discovery-feed";
import { buildCreatorVideoPreviews } from "@/lib/creator-video-previews";
import {
  cacheCreatorVideoStreams,
  getCachedCreatorVideoStream,
  prefetchCreatorVideoStreams,
  resolveCreatorVideoStream,
  warmCreatorVideoStream,
} from "@/lib/creator-video-stream-cache";
import { pipelineStages } from "@/lib/pipeline";
import {
  listSaved, saveCreator, unsave, setStage as apiSetStage, setNotes as apiSetNotes,
  listFolders, createFolder, addToFolder, removeFromFolder, type FolderRow,
} from "@/lib/workspace-client";
import type { ContentAnalysis } from "@/lib/creator-content-analysis";
import { CreatorAvatar, mergeCreatorAvatarSrc } from "@/app/dashboard/CreatorAvatar";
import { ProxiedImage } from "@/app/dashboard/ProxiedImage";
import { PlatformBrandIcon } from "@/app/dashboard/PlatformBrandIcon";
import { discoveryCopy, daysAgoCopy, engagementInsightCopy } from "@/lib/discovery-copy";
import type { Lang } from "@/lib/useLang";

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

function daysAgoLabel(iso: string | null, lang: Lang): string | null {
  return daysAgoCopy(lang, iso);
}

const drawerFont = "'InterDisplay', 'Inter Display', sans-serif";

const drawerActionBase: React.CSSProperties = {
  fontFamily: drawerFont,
  letterSpacing: "-0.02em",
  fontSize: 13,
  borderRadius: 8,
};

const drawerBtnSecondary: React.CSSProperties = {
  ...drawerActionBase,
  fontWeight: 500,
  color: "#1A1A1A",
  background: "#FFF",
  border: "1px solid #E5E5E5",
  padding: "8px 12px",
  cursor: "pointer",
};

const drawerSelect: React.CSSProperties = {
  ...drawerActionBase,
  fontWeight: 500,
  padding: "8px 10px",
  border: "1px solid #E5E5E5",
  background: "#FFF",
  color: "#1A1A1A",
  cursor: "pointer",
};

const drawerTagStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#1A1A1A",
  background: "#F5F5F5",
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
      <circle cx="12" cy="12" r="10" fill="#0047FF" />
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
    <div style={{ background: "#F7F7F8", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: "#9A9A9A", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: accent ? "#0047FF" : "#1A1A1A", letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}

function DrawerSection({ title, children, first }: { title?: string; children: ReactNode; first?: boolean }) {
  return (
    <section
      style={{
        marginTop: first ? 0 : 32,
        paddingTop: first ? 0 : 28,
        borderTop: first ? "none" : "1px solid #EFEFEF",
      }}
    >
      {title ? (
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", margin: "0 0 16px", letterSpacing: "-0.02em" }}>{title}</h2>
      ) : null}
      {children}
    </section>
  );
}

function Locked({ children, onUpgrade, label }: { children: ReactNode; onUpgrade: () => void; label: string }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ filter: "blur(6px)", opacity: 0.5, pointerEvents: "none", userSelect: "none" }}>{children}</div>
      <button type="button" onClick={onUpgrade}
        style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(255,255,255,0.35)", border: "none", borderRadius: 10, cursor: "pointer",
          color: "#0047FF", fontSize: 13, fontWeight: 600, fontFamily: drawerFont, letterSpacing: "-0.025em" }}>
        {label}
      </button>
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
    <div style={{ display: "grid", gridTemplateColumns: "118px 1fr auto", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid #F0F0F0" }}>
      <span style={{ fontSize: 13, color: "#9A9A9A", letterSpacing: "-0.01em" }}>{label}</span>
      <div style={{ height: 8, background: "#EEF4FF", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(6, Math.min(100, pct))}%`, background: "#90C2FF", borderRadius: 999, transition: "width 0.2s ease" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 64, justifyContent: "flex-end" }}>
        {trend && <TrendUpIcon />}
        <span style={{ fontSize: 14, fontWeight: 600, color: trend ? "#15803D" : "#1A1A1A", letterSpacing: "-0.02em" }}>{value}</span>
      </div>
    </div>
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
      <div style={{ display: "grid", gridTemplateColumns: "118px 1fr", gap: 12, alignItems: "start", marginBottom: 6, paddingBottom: 14, borderBottom: "1px solid #EFEFEF" }}>
        <span style={{ fontSize: 13, color: "#9A9A9A", paddingTop: 6 }}>{t.engagementRate}</span>
        <div>
          <div style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", lineHeight: 1.1 }}>{d.engagementRate}%</div>
          <div style={{ fontSize: 12, color: "#9A9A9A", marginTop: 6, lineHeight: 1.45, letterSpacing: "-0.01em" }}>
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

function VideoTile({ v, playing, onPlay, username, lang }: {
  v: { key: string; cover: string; views: number; videoId: string | null; streamUrl: string | null };
  playing: boolean;
  onPlay: () => void;
  username: string;
  lang: Lang;
}) {
  const t = discoveryCopy(lang);
  const [resolvedStream, setResolvedStream] = useState<string | null>(() => {
    if (v.streamUrl) return v.streamUrl;
    if (v.videoId) return getCachedCreatorVideoStream(username, v.videoId);
    return null;
  });
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (v.streamUrl && v.videoId) {
      cacheCreatorVideoStreams(username, { [v.videoId]: v.streamUrl });
    }
  }, [username, v.streamUrl, v.videoId]);

  useEffect(() => {
    if (!v.videoId || v.streamUrl || getCachedCreatorVideoStream(username, v.videoId)) return;
    let cancelled = false;
    void resolveCreatorVideoStream(username, v.videoId).then((url) => {
      if (!cancelled && url) setResolvedStream((prev) => prev ?? url);
    });
    return () => { cancelled = true; };
  }, [username, v.videoId, v.streamUrl]);

  const warmStream = () => {
    const url =
      v.streamUrl ||
      (v.videoId ? getCachedCreatorVideoStream(username, v.videoId) : null) ||
      resolvedStream;
    if (url) warmCreatorVideoStream(url);
    else if (v.videoId) {
      void resolveCreatorVideoStream(username, v.videoId).then((next) => {
        if (next) warmCreatorVideoStream(next);
      });
    }
  };

  useEffect(() => {
    if (!playing) return;

    const cached =
      v.streamUrl ||
      (v.videoId ? getCachedCreatorVideoStream(username, v.videoId) : null);
    if (cached) {
      setResolvedStream(cached);
      setLoadError(false);
      warmCreatorVideoStream(cached);
      return;
    }

    if (!v.videoId) {
      setLoadError(true);
      return;
    }

    let cancelled = false;
    setLoadError(false);
    void resolveCreatorVideoStream(username, v.videoId).then((url) => {
      if (cancelled) return;
      if (url) {
        setResolvedStream(url);
        warmCreatorVideoStream(url);
      } else {
        setLoadError(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [playing, v.streamUrl, v.videoId, username]);

  if (playing && resolvedStream) {
    return (
      <video
        key={v.key}
        src={resolvedStream}
        controls
        autoPlay
        playsInline
        preload="auto"
        poster={v.cover || undefined}
        style={{ width: "100%", aspectRatio: "9 / 16", borderRadius: 10, background: "#000", objectFit: "cover" }}
      />
    );
  }

  if (playing && loadError) {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "9 / 16",
          borderRadius: 10,
          background: "#111",
          color: "#FFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          padding: 12,
          textAlign: "center",
          fontFamily: drawerFont,
          letterSpacing: "-0.025em",
        }}
      >
        {lang === "fr" ? "Vidéo indisponible" : "Video unavailable"}
      </div>
    );
  }

  const canPlay = Boolean(v.streamUrl || v.videoId);
  return (
    <button
      type="button"
      aria-label={t.playVideo}
      onPointerEnter={warmStream}
      onFocus={warmStream}
      onClick={() => { if (canPlay) onPlay(); }}
      disabled={!canPlay}
      style={{
        position: "relative",
        aspectRatio: "9 / 16",
        borderRadius: 10,
        border: "none",
        cursor: canPlay ? "pointer" : "default",
        padding: 0,
        background: "#EDEDED",
        display: "block",
        width: "100%",
        overflow: "hidden",
      }}
    >
      <VideoCover cover={v.cover} previewKey={v.key} />
      {canPlay && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFF",
            fontSize: 26,
            pointerEvents: "none",
          }}
        >
          {playing ? "…" : "▶"}
        </span>
      )}
      {v.views > 0 && (
        <span style={{ position: "absolute", left: 6, bottom: 6, fontSize: 10, fontWeight: 600, color: "#FFF", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>{fmt(v.views)} {t.views}</span>
      )}
    </button>
  );
}

export function CreatorDetailDrawer({ creator, plan, lang, onClose, onUpgrade, onWorkspaceChange, onReachOut }: {
  creator: FeedCreator | null;
  plan: PlanTier;
  lang: Lang;
  onClose: () => void;
  onUpgrade: () => void;
  onWorkspaceChange?: () => void;
  onReachOut?: (creator: FeedCreator) => void;
}) {
  const t = discoveryCopy(lang);
  const stages = pipelineStages(lang);
  const isPaid = plan !== "free";
  const [detail, setDetail] = useState<CreatorDetail | null>(creator);
  const [playing, setPlaying] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [analysis, setAnalysis] = useState<ContentAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stage, setStageState] = useState("saved");
  const [notesVal, setNotesVal] = useState("");
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [inFolders, setInFolders] = useState<Set<string>>(new Set());
  const [folderOpen, setFolderOpen] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  useEffect(() => {
    if (!creator) return;
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
      setFolderOpen(false);
    })();
    return () => { cancelled = true; };
  }, [creator]);

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

  useEffect(() => {
    setDetail(creator);
    setPlaying(null);
    if (!creator) return;
    setShown(false);
    const t = setTimeout(() => setShown(true), 10);
    let cancelled = false;
    const handle = creator.username;
    fetch(`/api/creator/${encodeURIComponent(handle)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.creator) return;
        const remote = d.creator as CreatorDetail;
        if (remote.username && remote.username !== handle) return;
        setDetail((prev) => {
          if (!prev || prev.username !== handle) return remote;
          const merged = { ...prev, ...remote } as CreatorDetail;
          merged.avatarUrl = mergeCreatorAvatarSrc(handle, remote.avatarUrl, prev.avatarUrl);
          // Keep feed previews only when the API row has none yet (same creator).
          if (!remote.topVideos?.length && prev.topVideos?.length) merged.topVideos = prev.topVideos;
          if (!remote.videoThumbnails?.length && prev.videoThumbnails?.length) merged.videoThumbnails = prev.videoThumbnails;
          return merged;
        });
      })
      .catch(() => {});
    return () => { cancelled = true; clearTimeout(t); };
  }, [creator]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // AI content analysis of the creator's video frames (paid; cached server-side).
  useEffect(() => {
    if (!creator || !isPaid) { setAnalysis(null); return; }
    let cancelled = false;
    setAnalysis(null);
    setAnalysisLoading(true);
    fetch(`/api/creator/${encodeURIComponent(creator.username)}/analyze`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setAnalysis(d?.analysis ?? null); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAnalysisLoading(false); });
    return () => { cancelled = true; };
  }, [creator, isPaid]);

  const videos = useMemo(() => {
    if (!detail) return [];
    return buildCreatorVideoPreviews(detail.username, {
      videoThumbnails: detail.videoThumbnails,
      topVideos: detail.topVideos,
      limit: 3,
    });
  }, [detail]);

  useEffect(() => {
    if (!detail?.username || videos.length === 0) return;
    const streams: Record<string, string> = {};
    const ids: string[] = [];
    for (const v of videos) {
      if (v.videoId && v.streamUrl) streams[v.videoId] = v.streamUrl;
      if (v.videoId) ids.push(v.videoId);
    }
    if (Object.keys(streams).length) cacheCreatorVideoStreams(detail.username, streams);
    void prefetchCreatorVideoStreams(detail.username, ids);
    const first = videos.find((v) => v.streamUrl || (v.videoId && getCachedCreatorVideoStream(detail.username, v.videoId)));
    const warmUrl = first?.streamUrl || (first?.videoId ? getCachedCreatorVideoStream(detail.username, first.videoId) : null);
    if (warmUrl) warmCreatorVideoStream(warmUrl);
  }, [detail?.username, videos]);

  if (!creator || !detail) return null;

  const d = detail;
  const active = daysAgoLabel(d.lastPostAt, lang);
  const isVerified = d.authenticityScore >= 60;
  const reachPct = Math.round((d.viewsPerFollower ?? 0) * 100);

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1100, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "min(560px, 100%)", height: "100%", background: "#FFF", overflowY: "auto",
          transform: shown ? "translateX(0)" : "translateX(40px)", opacity: shown ? 1 : 0, transition: "transform .18s ease, opacity .18s ease",
          padding: "24px 26px 48px", boxSizing: "border-box", fontFamily: drawerFont }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <button type="button" onClick={onClose} style={{ ...drawerActionBase, background: "none", border: "none", color: "#9A9A9A", fontWeight: 500, cursor: "pointer", padding: 0 }}>{t.back}</button>
          <a href={d.email ? `mailto:${d.email}` : undefined} aria-disabled={!d.email}
            style={{ ...drawerActionBase, fontWeight: 600, color: d.email ? "#FFF" : "#9A9A9A", background: d.email ? "#0047FF" : "transparent",
              padding: d.email ? "7px 13px" : 0, textDecoration: "none", cursor: d.email ? "pointer" : "default", border: "none" }}>
            {d.email ? t.contact : t.noEmail}
          </a>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 24 }}>
          <CreatorAvatar username={d.username} src={d.avatarUrl} displayName={d.displayName} size={62} alt={d.displayName} priority />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.displayName}</div>
              {isVerified && <VerifiedBadge label={t.verifiedAccount} />}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "#9A9A9A" }}>@{d.username}</span>
              <PlatformPill platform={d.platform} />
              <div style={{ position: "relative" }}>
                <button type="button" onClick={() => (isPaid ? setFolderOpen((o) => !o) : onUpgrade())}
                  style={drawerBtnSecondary}>
                  {t.folders}{inFolders.size ? ` (${inFolders.size})` : ""} ▾
                </button>
                {folderOpen && isPaid && (
                  <div style={{ position: "absolute", top: "110%", left: 0, zIndex: 10, background: "#FFF", border: "1px solid #E5E5E5", borderRadius: 10, padding: 10, width: 230, boxShadow: "0 8px 24px rgba(0,0,0,0.14)" }}>
                    {folders.length === 0 && <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: 8 }}>{t.noFoldersYet}</div>}
                    {folders.map((f) => (
                      <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={inFolders.has(f.id)} onChange={() => toggleFolder(f)} />
                        {f.name}
                      </label>
                    ))}
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onCreateFolder(); }}
                        placeholder={t.newFolder} style={{ flex: 1, fontSize: 12, padding: "6px 8px", border: "1px solid #E5E5E5", borderRadius: 8, fontFamily: "inherit", boxSizing: "border-box" }} />
                      <button type="button" onClick={onCreateFolder} style={{ fontSize: 14, cursor: "pointer", border: "1px solid #E5E5E5", borderRadius: 8, background: "#FFF", padding: "0 10px" }}>+</button>
                    </div>
                  </div>
                )}
              </div>
              {isPaid ? (
                <select value={stage} onChange={(e) => onStageChange(e.target.value)} aria-label={t.pipelineStageAria}
                  style={drawerSelect}>
                  {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              ) : (
                <button type="button" onClick={onUpgrade} style={drawerBtnSecondary}>{t.pipelineStage} ▾</button>
              )}
            </div>
            {(d.countryCode || (d.language && d.language !== "unknown")) && (
              <div style={{ fontSize: 12, color: "#9A9A9A", marginTop: 4, letterSpacing: "-0.01em" }}>
                {[d.countryCode, d.language && d.language !== "unknown" ? d.language : null].filter(Boolean).join(" · ")}
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {(d.niches && d.niches.length ? d.niches : [d.primaryNiche || d.niche]).filter(Boolean).slice(0, 4).map((n) => (
                <span key={n} style={{ ...drawerTagStyle, textTransform: "capitalize" }}>{n}</span>
              ))}
              {active && <span style={drawerTagStyle}>{active}</span>}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={() => void onSaveToggle()} disabled={saveBusy}
            style={{
              ...drawerActionBase,
              fontWeight: 600,
              cursor: saveBusy ? "wait" : "pointer",
              padding: "8px 14px",
              border: "1px solid #0047FF",
              color: saved ? "#FFFFFF" : "#0047FF",
              background: saved ? "#0047FF" : "#FFFFFF",
              opacity: saveBusy ? 0.7 : 1,
            }}>
            {saveBusy ? "…" : saved ? t.saved : t.save}
          </button>
          {onReachOut && (
            <button
              type="button"
              onClick={() => onReachOut(d)}
              style={drawerBtnSecondary}
            >
              {t.reachOut}
            </button>
          )}
          <a href={profileUrl(d.platform, d.username)} target="_blank" rel="noopener noreferrer"
            style={{ ...drawerBtnSecondary, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            {t.viewOn(platformLabel(d.platform))}
          </a>
        </div>

        {d.bio && <p style={{ fontSize: 13, color: "#5A5A5A", lineHeight: 1.55, margin: "0 0 8px" }}>{d.bio}</p>}

        <DrawerSection title={t.overview} first>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            <Stat label={t.followers} value={fmt(d.followersCount)} />
            <Stat label={t.engagement} value={`${d.engagementRate}%`} />
            <Stat label={t.avgViews} value={fmt(d.avgViews)} />
          </div>
        </DrawerSection>

        {isPaid ? (
          <DrawerSection title={t.performanceSection}>
            <ContentAnalyticsPanel d={d} lang={lang} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 20 }}>
              <Stat label={t.authenticity} value={`${d.authenticityScore}/100`} />
              <Stat label={t.reachPerFollower} value={`${reachPct > 0 ? reachPct : Math.round((d.viewsPerFollower ?? 0) * 100)}%`} />
              <Stat label={t.postsAnalyzed} value={String(d.postsAnalyzed ?? 0)} />
            </div>
          </DrawerSection>
        ) : (
          <DrawerSection title={t.performanceSection}>
            <Locked onUpgrade={onUpgrade} label={t.lockedAnalysis}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <Stat label={t.authenticity} value="92/100" />
                <Stat label={t.reachPerFollower} value="48%" />
                <Stat label={t.postsAnalyzed} value="12" />
              </div>
            </Locked>
          </DrawerSection>
        )}

        <DrawerSection title={t.popularPosts}>
          {videos.length === 0 ? (
            <div style={{ fontSize: 13, color: "#9A9A9A" }}>{t.noVideos}</div>
          ) : (
            <div key={d.username} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {videos.map((v) => (
                <VideoTile
                  key={v.key}
                  v={v}
                  playing={playing === v.key}
                  onPlay={() => setPlaying(v.key)}
                  username={d.username}
                  lang={lang}
                />
              ))}
            </div>
          )}
        </DrawerSection>

        {isPaid && (
          <DrawerSection title={t.aiAnalysis}>
            {analysisLoading && !analysis ? (
              <div style={{ fontSize: 13, color: "#9A9A9A", background: "#F7F7F8", borderRadius: 10, padding: 14 }}>{t.analyzingVideos}</div>
            ) : analysis ? (
              <div style={{ background: "#F7F7F8", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 13, color: "#1A1A1A", lineHeight: 1.55 }}>{analysis.summary}</div>
                {analysis.themes.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {analysis.themes.map((th) => <span key={th} style={{ fontSize: 11, color: "#534AB7", background: "#EEEDFE", padding: "2px 9px", borderRadius: 20 }}>{th}</span>)}
                  </div>
                )}
                {analysis.style && <div style={{ fontSize: 12.5, color: "#5A5A5A", lineHeight: 1.5 }}><span style={{ color: "#1A1A1A", fontWeight: 600 }}>{t.style}:</span> {analysis.style}</div>}
                {analysis.production && <div style={{ fontSize: 12.5, color: "#5A5A5A", lineHeight: 1.5 }}><span style={{ color: "#1A1A1A", fontWeight: 600 }}>{t.production}:</span> {analysis.production}</div>}
                {analysis.brandFit && <div style={{ fontSize: 12.5, color: "#0F6E56", background: "#E1F5EE", borderRadius: 8, padding: "8px 10px", lineHeight: 1.5 }}>🎯 <span style={{ fontWeight: 600 }}>{t.brandFit}:</span> {analysis.brandFit}</div>}
                {!analysis.brandSafe && <div style={{ fontSize: 12, color: "#9A1F1F", background: "#FEF2F2", borderRadius: 8, padding: "6px 10px" }}>⚠ {t.brandSensitive}</div>}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#9A9A9A" }}>{t.analysisUnavailable}</div>
            )}
          </DrawerSection>
        )}

        {isPaid && (
          <DrawerSection title={t.privateNote}>
            <textarea value={notesVal} onChange={(e) => setNotesVal(e.target.value)} onBlur={onNotesBlur}
              placeholder={saved ? t.notePlaceholder : t.noteSaveFirst}
              style={{ width: "100%", minHeight: 80, fontSize: 13, padding: 12, border: "1px solid #E5E5E5", borderRadius: 10, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
          </DrawerSection>
        )}
      </div>
    </div>
  );
}
