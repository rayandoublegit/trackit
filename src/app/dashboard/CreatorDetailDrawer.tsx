"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { PlanTier } from "@/lib/plan-limits";
import type { FeedCreator } from "@/lib/discovery-feed";
import { videoEmbedUrl } from "@/lib/creator-video";

type TopVideo = {
  id: string; cover: string; shareUrl: string;
  playCount: number; likeCount: number; commentCount: number; shareCount: number;
  createTime: number; desc: string;
};

export type CreatorDetail = FeedCreator & {
  avgLikes?: number; avgComments?: number; avgShares?: number;
  viewsPerFollower?: number; postsAnalyzed?: number;
  niches?: string[]; topVideos?: TopVideo[];
};

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 100_000 ? 0 : 1) + "K";
  return String(Math.round(n));
}

function daysAgoLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "actif aujourd'hui";
  if (d === 1) return "actif hier";
  if (d < 30) return `actif il y a ${d} j`;
  return `actif il y a ${Math.floor(d / 30)} mois`;
}

const proxied = (u?: string) =>
  !u ? "" : u.includes("/api/img-proxy") ? u : `/api/img-proxy?url=${encodeURIComponent(u)}`;

function authNote(d: CreatorDetail): string {
  const vpf = Math.round((d.viewsPerFollower ?? 0) * 100);
  const reach = vpf > 0 ? `~${vpf}% de reach sur ses abonnés` : "reach modéré";
  if (d.authenticityScore >= 80) return `Audience saine — engagement régulier, ${reach}, pas de pics suspects.`;
  if (d.authenticityScore >= 50) return `Audience correcte — ${reach}, engagement un peu variable.`;
  return `Signaux à surveiller — ${reach}, ratio vues/engagement faible (possibles faux abonnés).`;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: "#F7F7F8", borderRadius: 10, padding: "9px 11px" }}>
      <div style={{ fontSize: 11, color: "#9A9A9A", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: accent ? "#0047FF" : "#1A1A1A" }}>{value}</div>
    </div>
  );
}

function Locked({ children, onUpgrade, label }: { children: ReactNode; onUpgrade: () => void; label: string }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ filter: "blur(6px)", opacity: 0.5, pointerEvents: "none", userSelect: "none" }}>{children}</div>
      <button type="button" onClick={onUpgrade}
        style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          background: "rgba(255,255,255,0.35)", border: "none", borderRadius: 10, cursor: "pointer", color: "#0047FF", fontSize: 13, fontWeight: 600 }}>
        🔒 {label}
      </button>
    </div>
  );
}

function Bars({ videos }: { videos: { views: number }[] }) {
  const vals = videos.slice(0, 8).map((v) => v.views);
  const max = Math.max(1, ...vals);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 54 }}>
      {vals.map((v, i) => (
        <div key={i} title={`${fmt(v)} vues`} style={{ flex: 1, height: `${Math.max(8, (v / max) * 100)}%`, background: i === vals.indexOf(max) ? "#0F6E56" : "#5DCAA5", borderRadius: "3px 3px 0 0" }} />
      ))}
    </div>
  );
}

function VideoTile({ v, playing, onPlay, isPaid, onUpgrade }: {
  v: { key: string; cover: string; views: number; embed: string | null };
  playing: boolean; onPlay: () => void; isPaid: boolean; onUpgrade: () => void;
}) {
  if (playing && v.embed) {
    return (
      <iframe src={v.embed} title="Vidéo TikTok"
        style={{ width: "100%", aspectRatio: "9 / 16", border: "none", borderRadius: 10, background: "#000" }}
        allow="autoplay; encrypted-media; fullscreen" referrerPolicy="strict-origin" />
    );
  }
  return (
    <button type="button" aria-label="Lire la vidéo"
      onClick={() => (isPaid ? onPlay() : onUpgrade())}
      style={{ position: "relative", aspectRatio: "9 / 16", borderRadius: 10, border: "none", cursor: "pointer", padding: 0,
        background: v.cover ? `#000 url("${v.cover}") center / cover no-repeat` : "#EDEDED", display: "block", width: "100%" }}>
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#FFF", fontSize: 26 }}>
        {v.embed ? (isPaid ? "▶" : "🔒") : ""}
      </span>
      {v.views > 0 && (
        <span style={{ position: "absolute", left: 6, bottom: 6, fontSize: 10, fontWeight: 600, color: "#FFF", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>{fmt(v.views)} vues</span>
      )}
    </button>
  );
}

export function CreatorDetailDrawer({ creator, plan, onClose, onUpgrade }: {
  creator: FeedCreator | null;
  plan: PlanTier;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const isPaid = plan !== "free";
  const [detail, setDetail] = useState<CreatorDetail | null>(creator);
  const [playing, setPlaying] = useState<string | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setDetail(creator);
    setPlaying(null);
    if (!creator) return;
    setShown(false);
    const t = setTimeout(() => setShown(true), 10);
    let cancelled = false;
    fetch(`/api/creator/${encodeURIComponent(creator.username)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.creator) return;
        setDetail((prev) => {
          const merged = { ...prev, ...d.creator } as CreatorDetail;
          // A DB row not yet re-enriched has no videos — keep the live ones rather than clobbering with [].
          if (!merged.topVideos?.length) merged.topVideos = prev?.topVideos ?? [];
          if (!merged.videoThumbnails?.length) merged.videoThumbnails = prev?.videoThumbnails ?? [];
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

  const videos = useMemo(() => {
    if (!detail) return [];
    const tv = detail.topVideos ?? [];
    const base = tv.length
      ? tv.map((v) => ({ id: v.id, cover: v.cover, shareUrl: v.shareUrl, views: v.playCount }))
      : (detail.videoThumbnails ?? []).map((t) => ({ id: "", cover: t.thumbnail ?? "", shareUrl: t.url ?? "", views: t.views }));
    return base.map((v, i) => ({
      key: v.id || `v${i}`,
      cover: proxied(v.cover),
      views: v.views,
      embed: videoEmbedUrl({ id: v.id, shareUrl: v.shareUrl }),
    }));
  }, [detail]);

  if (!creator || !detail) return null;

  const d = detail;
  const active = daysAgoLabel(d.lastPostAt);
  const rentaColor = d.valueScore >= 70 ? "#15803D" : d.valueScore >= 40 ? "#B45309" : "#9A1F1F";
  const rentaBg = d.valueScore >= 70 ? "#F0FDF4" : d.valueScore >= 40 ? "#FFFBEB" : "#FEF2F2";

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1100, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "min(560px, 100%)", height: "100%", background: "#FFF", overflowY: "auto",
          transform: shown ? "translateX(0)" : "translateX(40px)", opacity: shown ? 1 : 0, transition: "transform .18s ease, opacity .18s ease",
          padding: "20px 22px 40px", boxSizing: "border-box" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#9A9A9A", fontSize: 14, cursor: "pointer", padding: 0 }}>← Retour</button>
          <a href={d.email ? `mailto:${d.email}` : undefined} aria-disabled={!d.email}
            style={{ fontSize: 12, fontWeight: 600, color: d.email ? "#FFF" : "#9A9A9A", background: d.email ? "#0047FF" : "#F0F0F0",
              borderRadius: 8, padding: "7px 13px", textDecoration: "none", cursor: d.email ? "pointer" : "default" }}>
            {d.email ? "✉ Contacter" : "Pas d'email"}
          </a>
        </div>

        <div style={{ display: "flex", gap: 13, alignItems: "flex-start", marginBottom: 16 }}>
          <img src={d.avatarUrl} alt="" width={62} height={62} style={{ borderRadius: "50%", background: "#F0F0F0", objectFit: "cover", flexShrink: 0 }}
            onError={(e) => { const img = e.currentTarget; if (!img.dataset.fb) { img.dataset.fb = "1"; img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(d.displayName || d.username)}&background=e5e5e5&color=9a9a9a&size=200&bold=true&rounded=true`; } }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A" }}>{d.displayName}</div>
            <div style={{ fontSize: 13, color: "#9A9A9A" }}>@{d.username}{d.countryCode ? ` · ${d.countryCode}` : ""}{d.language && d.language !== "unknown" ? ` · ${d.language}` : ""}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {(d.niches && d.niches.length ? d.niches : [d.primaryNiche || d.niche]).filter(Boolean).slice(0, 4).map((n) => (
                <span key={n} style={{ fontSize: 11, color: "#0F6E56", background: "#E1F5EE", padding: "2px 8px", borderRadius: 20, textTransform: "capitalize" }}>{n}</span>
              ))}
              {active && <span style={{ fontSize: 11, color: "#15803D", background: "#F0FDF4", padding: "2px 8px", borderRadius: 20 }}>{active}</span>}
            </div>
          </div>
          <div style={{ textAlign: "center", background: rentaBg, borderRadius: 10, padding: "6px 11px" }}>
            <div style={{ fontSize: 11, color: rentaColor }}>Renta</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: rentaColor, lineHeight: 1.1 }}>{d.valueScore}</div>
          </div>
        </div>

        {d.bio && <p style={{ fontSize: 13, color: "#5A5A5A", lineHeight: 1.5, margin: "0 0 16px" }}>{d.bio}</p>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
          <Stat label="Abonnés" value={fmt(d.followersCount)} />
          <Stat label="Engagement" value={`${d.engagementRate}%`} />
          <Stat label="Vues moy." value={fmt(d.avgViews)} />
          <Stat label="CPM est." value={`$${d.estCpm}`} accent />
          <Stat label="Coût/post" value={`$${fmt(d.estCostPerPost)}`} />
          <Stat label="Posts/sem." value={d.postFrequency ? String(d.postFrequency) : "—"} />
        </div>

        <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", marginBottom: 10 }}>Analyse approfondie</div>
        {isPaid ? (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
              <Stat label="Authenticité" value={`${d.authenticityScore}/100`} />
              <Stat label="Vues / abonné" value={`${Math.round((d.viewsPerFollower ?? 0) * 100)}%`} />
              <Stat label="Posts analysés" value={String(d.postsAnalyzed ?? 0)} />
              <Stat label="Likes moy." value={fmt(d.avgLikes ?? 0)} />
              <Stat label="Comm. moy." value={fmt(d.avgComments ?? 0)} />
              <Stat label="Partages moy." value={fmt(d.avgShares ?? 0)} />
            </div>
            {videos.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: 6 }}>Vues des dernières vidéos</div>
                <Bars videos={videos} />
              </div>
            )}
            <div style={{ fontSize: 12.5, color: "#5A5A5A", lineHeight: 1.6, background: "#F7F7F8", borderRadius: 10, padding: "10px 12px" }}>
              {authNote(d)}
            </div>
          </div>
        ) : (
          <Locked onUpgrade={onUpgrade} label="Analyse réservée aux plans payants">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              <Stat label="Authenticité" value="92/100" /><Stat label="Vues / abonné" value="48%" /><Stat label="Posts analysés" value="12" />
            </div>
          </Locked>
        )}

        <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", margin: "4px 0 10px" }}>Vidéos — lecture intégrée</div>
        {videos.length === 0 ? (
          <div style={{ fontSize: 13, color: "#9A9A9A" }}>Pas encore de vidéos pour ce créateur.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {videos.map((v) => (
              <VideoTile key={v.key} v={v} playing={playing === v.key} onPlay={() => setPlaying(v.key)} isPaid={isPaid} onUpgrade={onUpgrade} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
