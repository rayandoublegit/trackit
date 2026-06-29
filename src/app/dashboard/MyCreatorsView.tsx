"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlanTier } from "@/lib/plan-limits";
import type { FeedCreator } from "@/lib/discovery-feed";
import { pipelineStages, stageColor } from "@/lib/pipeline";
import {
  listSaved, listFolders, createFolder, deleteFolder, setStage as apiSetStage,
  type SavedRow, type FolderRow, type FolderItem,
} from "@/lib/workspace-client";
import { CreatorDetailDrawer } from "./CreatorDetailDrawer";
import { CreatorAvatar } from "./CreatorAvatar";
import { avatarFromDiscoverySavedRow } from "@/lib/creator-avatar";
import { useLang } from "@/lib/useLang";
import { discoveryCopy } from "@/lib/discovery-copy";
import { useDashboardNavigation } from "./DashboardNavigationProvider";

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 100_000 ? 0 : 1) + "K";
  return String(Math.round(n));
}

function rowToCreator(r: SavedRow): FeedCreator {
  if (r.snapshot && typeof r.snapshot === "object" && (r.snapshot as Record<string, unknown>).username) {
    return r.snapshot as unknown as FeedCreator;
  }
  return {
    username: r.creator_username, displayName: r.display_name, avatarUrl: r.avatar_url,
    followersCount: r.followers, engagementRate: r.engagement_rate, avgViews: 0,
    primaryNiche: r.primary_niche, niche: r.primary_niche, countryCode: r.country_code,
    valueScore: r.value_score, estCpm: 0, estCostPerPost: 0, valueTier: "micro",
    engagementByFollower: 0, postFrequency: 0, lastPostAt: null, authenticityScore: 0,
    qualityStatus: "ok", platform: "tiktok", bio: "", email: null, language: "unknown",
    location: null, videoThumbnails: [],
  } as unknown as FeedCreator;
}

function MiniCard({ lang, r, onOpen, draggable }: { lang: "en" | "fr"; r: SavedRow; onOpen: () => void; draggable?: boolean }) {
  const t = discoveryCopy(lang);
  const sc = stageColor(r.pipeline_status);
  const stageLabel = pipelineStages(lang).find((s) => s.key === r.pipeline_status)?.label ?? r.pipeline_status;
  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? (e) => e.dataTransfer.setData("text/plain", r.creator_username) : undefined}
      onClick={onOpen}
      style={{ background: "#FFF", border: "0.5px solid #EFEFEF", borderRadius: 12, padding: 12, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <CreatorAvatar
          username={r.creator_username}
          src={avatarFromDiscoverySavedRow({ avatar_url: r.avatar_url, snapshot: r.snapshot })}
          displayName={r.display_name}
          size={36}
          alt={r.display_name}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.display_name}</div>
          <div style={{ fontSize: 11, color: "#9A9A9A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>@{r.creator_username}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: r.value_score >= 70 ? "#15803D" : r.value_score >= 40 ? "#B45309" : "#9A1F1F" }}>{t.valueScore} {r.value_score}</span>
        <span style={{ fontSize: 10, color: "#7A7A7A" }}>· {fmt(r.followers)} {t.followersAbbr}</span>
        {r.primary_niche && <span style={{ fontSize: 10, color: "#0047FF", background: "#E8EEFC", padding: "1px 7px", borderRadius: 20, textTransform: "capitalize" }}>{r.primary_niche}</span>}
      </div>
      <span style={{ alignSelf: "flex-start", fontSize: 10, fontWeight: 600, color: sc.color, background: sc.bg, padding: "2px 8px", borderRadius: 20 }}>
        {stageLabel}
      </span>
    </div>
  );
}

export function MyCreatorsView({ plan, isMobile, onUpgrade, onReachOut }: { plan: PlanTier; isMobile?: boolean; onUpgrade: () => void; onReachOut?: (creator: FeedCreator) => void }) {
  const lang = useLang();
  const { navState, navigate, goBack } = useDashboardNavigation();
  const t = discoveryCopy(lang);
  const stages = pipelineStages(lang);
  const isPaid = plan !== "free";
  const [rows, setRows] = useState<SavedRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [items, setItems] = useState<FolderItem[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [mode, setMode] = useState<"list" | "board">("board");
  const [selected, setSelected] = useState<FeedCreator | null>(null);
  const [loading, setLoading] = useState(true);
  const [newFolder, setNewFolder] = useState("");

  const openCreator = (creator: FeedCreator) => {
    setSelected(creator);
    navigate({ view: "my-creators", creator: creator.username });
  };

  const load = useCallback(async () => {
    const [r, f] = await Promise.all([listSaved(), listFolders()]);
    setRows(r); setFolders(f.folders); setItems(f.items); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visibleRows = useMemo(() => {
    if (!activeFolder) return rows;
    const set = new Set(items.filter((i) => i.folder_id === activeFolder).map((i) => i.creator_username));
    return rows.filter((r) => set.has(r.creator_username));
  }, [rows, items, activeFolder]);

  useEffect(() => {
    if (navState.view !== "my-creators") return;
    if (!navState.creator) {
      setSelected(null);
      return;
    }
    const handle = navState.creator.replace(/^@/, "").toLowerCase();
    const found = visibleRows.find((r) => r.creator_username.replace(/^@/, "").toLowerCase() === handle);
    if (found) setSelected(rowToCreator(found));
  }, [navState.view, navState.creator, visibleRows]);

  const onDrop = (stageKey: string) => async (e: React.DragEvent) => {
    e.preventDefault();
    const u = e.dataTransfer.getData("text/plain");
    if (!u) return;
    setRows((rs) => rs.map((r) => (r.creator_username === u ? { ...r, pipeline_status: stageKey } : r)));
    await apiSetStage(u, stageKey);
  };
  const onCreateFolder = async () => {
    const name = newFolder.trim(); if (!name) return;
    const f = await createFolder(name); setNewFolder("");
    if (f) setFolders((arr) => [...arr, f]);
  };
  const onDeleteFolder = async (id: string) => {
    await deleteFolder(id);
    setFolders((arr) => arr.filter((f) => f.id !== id));
    if (activeFolder === id) setActiveFolder(null);
  };

  const pad = isMobile ? "56px 16px 40px" : "40px";

  if (!isPaid) {
    return (
      <div style={{ padding: pad, background: "#FFF", minHeight: "100vh" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0 }}>{t.myCreators}</h1>
        <p style={{ fontSize: 14, color: "#7A7A7A", margin: "6px 0 24px" }}>{t.myCreatorsSubtitle}</p>
        <div style={{ border: "1px solid #EFEFEF", borderRadius: 16, padding: "32px 28px", textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", marginBottom: 8 }}>{t.paidOnly}</div>
          <div style={{ fontSize: 14, color: "#7A7A7A", marginBottom: 18, lineHeight: 1.5 }}>{t.paidOnlyBody}</div>
          <button type="button" onClick={onUpgrade} style={{ background: "#0047FF", color: "#FFF", border: "none", borderRadius: 12, padding: "12px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{t.upgradePlan}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: pad, background: "#FFF", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0 }}>{t.myCreators}</h1>
        <div style={{ display: "flex", gap: 6, background: "#F5F5F5", borderRadius: 10, padding: 3 }}>
          {(["board", "list"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              style={{ fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                background: mode === m ? "#FFF" : "transparent", color: mode === m ? "#1A1A1A" : "#7A7A7A", boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
              {m === "board" ? t.pipeline : t.list}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "18px 0 22px" }}>
        <button type="button" onClick={() => setActiveFolder(null)}
          style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 20, cursor: "pointer", border: "none",
            background: activeFolder === null ? "#E8EEFC" : "#F5F5F5", color: activeFolder === null ? "#0047FF" : "#7A7A7A" }}>
          {t.allCount(rows.length)}
        </button>
        {folders.map((f) => {
          const count = items.filter((i) => i.folder_id === f.id).length;
          const active = activeFolder === f.id;
          return (
            <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: active ? "#E8EEFC" : "#F5F5F5", borderRadius: 20, padding: "0 4px 0 0" }}>
              <button type="button" onClick={() => setActiveFolder(f.id)}
                style={{ fontSize: 12, fontWeight: 600, padding: "5px 6px 5px 12px", borderRadius: 20, cursor: "pointer", border: "none", background: "transparent", color: active ? "#0047FF" : "#7A7A7A" }}>
                {f.name} ({count})
              </button>
              <button type="button" aria-label={t.deleteFolder(f.name)} onClick={() => onDeleteFolder(f.id)}
                style={{ fontSize: 12, color: "#B0B0B0", border: "none", background: "transparent", cursor: "pointer", padding: "0 4px" }}>×</button>
            </span>
          );
        })}
        <span style={{ display: "inline-flex", gap: 4 }}>
          <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onCreateFolder(); }}
            placeholder={t.folderPlaceholder} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 20, border: "1px solid #E5E5E5", width: 110, fontFamily: "inherit" }} />
        </span>
      </div>

      {loading ? (
        <div style={{ color: "#9A9A9A", fontSize: 14 }}>{t.loading}</div>
      ) : rows.length === 0 ? (
        <div style={{ color: "#9A9A9A", fontSize: 14 }}>{t.emptySaved}</div>
      ) : mode === "list" ? (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {visibleRows.map((r) => <MiniCard key={r.creator_username} lang={lang} r={r} onOpen={() => openCreator(rowToCreator(r))} />)}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12 }}>
          {stages.map((s) => {
            const colRows = visibleRows.filter((r) => r.pipeline_status === s.key);
            return (
              <div key={s.key} onDragOver={(e) => e.preventDefault()} onDrop={onDrop(s.key)}
                style={{ flex: "0 0 240px", background: "#FAFAFA", borderRadius: 12, padding: 10, minHeight: 120 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "0 2px" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: s.color }}>{s.label}</span>
                  <span style={{ fontSize: 12, color: "#B0B0B0" }}>{colRows.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {colRows.map((r) => <MiniCard key={r.creator_username} lang={lang} r={r} draggable onOpen={() => openCreator(rowToCreator(r))} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreatorDetailDrawer creator={selected} plan={plan} lang={lang} onClose={goBack} onUpgrade={onUpgrade} onWorkspaceChange={load} onReachOut={onReachOut} />
    </div>
  );
}
