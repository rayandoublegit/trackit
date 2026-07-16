"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlanTier } from "@/lib/plan-limits";
import { canUseCreatorPortal, canUseScripts } from "@/lib/plan-limits";
import type { FeedCreator } from "@/lib/discovery-feed";
import { pipelineStages } from "@/lib/pipeline";
import {
  listSaved,
  listFolders,
  createFolder,
  deleteFolder,
  setStage as apiSetStage,
  setNotes as apiSetNotes,
  setCrm as apiSetCrm,
  unsave,
  removeFromFolder,
  type SavedRow,
  type FolderRow,
  type FolderItem,
} from "@/lib/workspace-client";
import { CreatorDetailDrawer } from "./CreatorDetailDrawer";
import { CreatorImportPanel } from "./CreatorImportPanel";
import { CreatorScriptPanel } from "./CreatorScriptPanel";
import { CreatorContentBrandPanel } from "./CreatorContentBrandPanel";
import { CreatorListTable } from "./CreatorListTable";
import { emailFromRow, type CreatorCrm, crmFromSnapshot } from "@/lib/creator-crm";
import { useLang } from "@/lib/useLang";
import { discoveryCopy } from "@/lib/discovery-copy";
import { useDashboardNavigation } from "./DashboardNavigationProvider";
import { supabase } from "@/lib/supabase";
import type { GateFeatureKey } from "@/lib/plan-marketing";
import { runGateUpgrade } from "@/lib/plan-marketing";
import { UpgradeModal } from "./UpgradeModal";

const ALL_LIST_ID = "__all__";

type ListSortKey = "name" | "count" | "lastUpdate" | "createdAt" | "createdBy";
type CreatorSortKey = "name" | "followers" | "status";

type CreatorListRow = {
  id: string;
  name: string;
  creatorCount: number;
  lastUpdate: string | null;
  createdAt: string | null;
  createdBy: string | null;
  isSystem?: boolean;
};

function formatListDate(iso: string | null | undefined, lang: "en" | "fr"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function trackitCreatorIdFromRow(row: SavedRow): string | undefined {
  const snap = row.snapshot as Record<string, unknown> | null;
  const id = snap?.trackitCreatorId;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

async function mergeContentIntoRows(rows: SavedRow[], brandId: string): Promise<SavedRow[]> {
  try {
    const contentRes = await fetch(`/api/content?brandId=${encodeURIComponent(brandId)}`, { cache: "no-store" });
    const contentData = await contentRes.json();
    const brandContent = Array.isArray(contentData?.items) ? contentData.items : [];
    if (!brandContent.length) return rows;

    type CreatorMeta = {
      id: string;
      handle: string;
      full_name: string | null;
      avatar_url: string | null;
      platform: string | null;
      followers: number | null;
      engagement_rate: number | null;
      niche: string | null;
    };

    const creatorById = new Map<string, CreatorMeta>();
    const handleById = new Map<string, string>();
    if (supabase) {
      const { data: creatorRows } = await supabase
        .from("creators")
        .select("id, handle, full_name, avatar_url, platform, followers, engagement_rate, niche")
        .eq("user_id", brandId);
      for (const c of creatorRows ?? []) {
        if (!c?.id || !c?.handle) continue;
        const username = String(c.handle).replace(/^@+/, "").toLowerCase();
        handleById.set(c.id, username);
        creatorById.set(c.id, c as CreatorMeta);
      }
    }

    const contentByUsername = new Map<string, { id: string; title: string }[]>();
    for (const item of brandContent) {
      const creatorId = item.creator_row_id as string | null;
      if (!creatorId) continue;
      const username = handleById.get(creatorId);
      if (!username) continue;
      const list = contentByUsername.get(username) ?? [];
      if (!list.some((entry) => entry.id === item.id)) {
        list.push({ id: item.id, title: String(item.title) });
      }
      contentByUsername.set(username, list);
    }

    if (contentByUsername.size === 0) return rows;

    const merged = rows.map((row) => {
      const dbContent = contentByUsername.get(row.creator_username);
      if (!dbContent?.length) return row;
      const snap =
        row.snapshot && typeof row.snapshot === "object"
          ? (row.snapshot as Record<string, unknown>)
          : {};
      const crm = crmFromSnapshot(snap);
      const mergedContent = [...(crm.content ?? [])];
      for (const entry of dbContent) {
        if (!mergedContent.some((item) => item.id === entry.id)) mergedContent.push(entry);
      }
      return { ...row, snapshot: { ...snap, crm: { ...crm, content: mergedContent } } };
    });

    const known = new Set(merged.map((row) => row.creator_username));
    const extra: SavedRow[] = [];
    for (const [username, dbContent] of contentByUsername) {
      if (known.has(username)) continue;
      const creatorId = [...handleById.entries()].find(([, handle]) => handle === username)?.[0];
      const meta = creatorId ? creatorById.get(creatorId) : null;
      if (!meta) continue;
      extra.push({
        creator_username: username,
        display_name: meta.full_name?.trim() || username,
        avatar_url: meta.avatar_url ?? "",
        followers: Number(meta.followers ?? 0) || 0,
        engagement_rate: Number(meta.engagement_rate ?? 0) || 0,
        primary_niche: meta.niche ?? "",
        country_code: null,
        value_score: 0,
        pipeline_status: "signed",
        notes: "",
        platform: meta.platform ?? "tiktok",
        snapshot: {
          username,
          displayName: meta.full_name?.trim() || username,
          trackitCreatorId: meta.id,
          crm: { content: dbContent },
        },
      });
    }

    return extra.length ? [...merged, ...extra] : merged;
  } catch {
    return rows;
  }
}

async function mergeScriptsIntoRows(rows: SavedRow[], brandId: string): Promise<SavedRow[]> {
  try {
    const scriptsRes = await fetch(`/api/scripts?brandId=${encodeURIComponent(brandId)}`, { cache: "no-store" });
    const scriptsData = await scriptsRes.json();
    const brandScripts = Array.isArray(scriptsData?.scripts) ? scriptsData.scripts : [];
    if (!brandScripts.length) return rows;

    const handleById = new Map<string, string>();
    if (supabase) {
      const { data: creatorRows } = await supabase.from("creators").select("id, handle").eq("user_id", brandId);
      for (const c of creatorRows ?? []) {
        if (c?.id && c?.handle) {
          handleById.set(c.id, String(c.handle).replace(/^@+/, "").toLowerCase());
        }
      }
    }

    const scriptsByUsername = new Map<string, { id: string; title: string }[]>();
    for (const s of brandScripts) {
      const creatorId = s.target_creator_id as string | null;
      if (!creatorId) continue;
      const username = handleById.get(creatorId);
      if (!username) continue;
      const list = scriptsByUsername.get(username) ?? [];
      if (!list.some((item) => item.id === s.id)) {
        list.push({ id: s.id, title: String(s.title) });
      }
      scriptsByUsername.set(username, list);
    }

    if (scriptsByUsername.size === 0) return rows;

    return rows.map((row) => {
      const dbScripts = scriptsByUsername.get(row.creator_username);
      if (!dbScripts?.length) return row;
      const snap =
        row.snapshot && typeof row.snapshot === "object"
          ? (row.snapshot as Record<string, unknown>)
          : {};
      const crm = crmFromSnapshot(snap);
      const merged = [...(crm.scripts ?? [])];
      for (const script of dbScripts) {
        if (!merged.some((item) => item.id === script.id)) merged.push(script);
      }
      return { ...row, snapshot: { ...snap, crm: { ...crm, scripts: merged } } };
    });
  } catch {
    return rows;
  }
}

function rowToCreator(r: SavedRow): FeedCreator {
  if (r.snapshot && typeof r.snapshot === "object" && (r.snapshot as Record<string, unknown>).username) {
    return r.snapshot as unknown as FeedCreator;
  }
  return {
    username: r.creator_username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    followersCount: r.followers,
    engagementRate: r.engagement_rate,
    avgViews: 0,
    primaryNiche: r.primary_niche,
    niche: r.primary_niche,
    countryCode: r.country_code,
    valueScore: r.value_score,
    estCpm: 0,
    estCostPerPost: 0,
    valueTier: "micro",
    engagementByFollower: 0,
    postFrequency: 0,
    lastPostAt: null,
    authenticityScore: 0,
    qualityStatus: "ok",
    platform: r.platform ?? "tiktok",
    bio: "",
    email: typeof (r.snapshot as Record<string, unknown> | null)?.email === "string"
      ? String((r.snapshot as Record<string, unknown>).email)
      : null,
    language: "unknown",
    location: null,
    videoThumbnails: [],
  } as unknown as FeedCreator;
}

function emailForRow(r: SavedRow): string {
  const snap = r.snapshot as Record<string, unknown> | null;
  return emailFromRow(snap);
}

function platformLabel(platform: string): string {
  const p = platform.toLowerCase();
  if (p === "instagram") return "Instagram";
  if (p === "youtube") return "YouTube";
  return "TikTok";
}

function SortArrows({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", marginLeft: 4, verticalAlign: "middle" }} aria-hidden>
      <svg width="8" height="5" viewBox="0 0 8 5" style={{ opacity: active && dir === "asc" ? 1 : 0.35 }}>
        <path d="M4 0L7.5 4.5H0.5L4 0z" fill="currentColor" />
      </svg>
      <svg width="8" height="5" viewBox="0 0 8 5" style={{ opacity: active && dir === "desc" ? 1 : 0.35, marginTop: 1 }}>
        <path d="M4 5L0.5 0.5H7.5L4 5z" fill="currentColor" />
      </svg>
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 12,
  border: "1px solid #E5E5E5",
  fontSize: 15,
  fontFamily: "inherit",
  color: "#1A1A1A",
  background: "#FFFFFF",
};

export function CreatorManageLists({
  isMobile,
  plan = "free",
  onUpgrade,
  onUpgradePro,
  onReachOut,
}: {
  isMobile?: boolean;
  plan?: PlanTier;
  onUpgrade?: () => void;
  onUpgradePro?: () => void;
  onReachOut?: (creator: FeedCreator) => void;
}) {
  const lang = useLang();
  const { navState, navigate, goBack } = useDashboardNavigation();
  const t = discoveryCopy(lang);
  const stages = pipelineStages(lang);

  const [rows, setRows] = useState<SavedRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [items, setItems] = useState<FolderItem[]>([]);
  const [createdByName, setCreatedByName] = useState("");
  const [loading, setLoading] = useState(true);

  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [listSort, setListSort] = useState<{ key: ListSortKey; dir: "asc" | "desc" }>({
    key: "lastUpdate",
    dir: "desc",
  });
  const [newListName, setNewListName] = useState("");
  const [showNewList, setShowNewList] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [scriptTarget, setScriptTarget] = useState<SavedRow | null>(null);
  const [contentTarget, setContentTarget] = useState<SavedRow | null>(null);
  const [upgradeFeature, setUpgradeFeature] = useState<GateFeatureKey | null>(null);

  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [creatorSort, setCreatorSort] = useState<{ key: CreatorSortKey; dir: "asc" | "desc" }>({
    key: "followers",
    dir: "desc",
  });
  const [selected, setSelected] = useState<FeedCreator | null>(null);

  const load = useCallback(async () => {
    const [r, f] = await Promise.all([listSaved(), listFolders()]);
    const mergedScripts = brandId ? await mergeScriptsIntoRows(r, brandId) : r;
    const merged = brandId ? await mergeContentIntoRows(mergedScripts, brandId) : mergedScripts;
    setRows(merged);
    setFolders(f.folders);
    setItems(f.items);
    setLoading(false);
  }, [brandId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onSaved = () => { void load(); };
    window.addEventListener("trackit:creators-saved", onSaved);
    window.addEventListener("trackit:scripts-updated", onSaved);
    window.addEventListener("trackit:content-updated", onSaved);
    return () => {
      window.removeEventListener("trackit:creators-saved", onSaved);
      window.removeEventListener("trackit:scripts-updated", onSaved);
      window.removeEventListener("trackit:content-updated", onSaved);
    };
  }, [load]);

  useEffect(() => {
    void (async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setBrandId(user.id);
      const meta = user.user_metadata as Record<string, unknown> | undefined;
      const name =
        (typeof meta?.full_name === "string" && meta.full_name) ||
        (typeof meta?.name === "string" && meta.name) ||
        user.email ||
        "";
      setCreatedByName(name);
    })();
  }, []);

  const listRows = useMemo((): CreatorListRow[] => {
    const allLastUpdate = rows.reduce<string | null>((max, r) => {
      const d = r.updated_at ?? r.saved_at ?? null;
      if (!d) return max;
      if (!max || d > max) return d;
      return max;
    }, null);

    const allRow: CreatorListRow = {
      id: ALL_LIST_ID,
      name: t.allCreatorsList,
      creatorCount: rows.length,
      lastUpdate: allLastUpdate,
      createdAt: null,
      createdBy: null,
      isSystem: true,
    };

    const folderRows: CreatorListRow[] = folders.map((f) => {
      const folderItems = items.filter((i) => i.folder_id === f.id);
      const usernames = new Set(folderItems.map((i) => i.creator_username));
      const lastFromItems = folderItems.reduce<string | null>((max, i) => {
        if (!i.added_at) return max;
        if (!max || i.added_at > max) return i.added_at;
        return max;
      }, null);
      const lastFromSaved = rows
        .filter((r) => usernames.has(r.creator_username))
        .reduce<string | null>((max, r) => {
          const d = r.updated_at ?? r.saved_at ?? null;
          if (!d) return max;
          if (!max || d > max) return d;
          return max;
        }, null);
      const lastUpdate = [lastFromItems, lastFromSaved, f.created_at ?? null]
        .filter(Boolean)
        .sort()
        .pop() ?? null;

      return {
        id: f.id,
        name: f.name,
        creatorCount: folderItems.length,
        lastUpdate,
        createdAt: f.created_at ?? null,
        createdBy: createdByName || null,
        isSystem: false,
      };
    });

    return [allRow, ...folderRows];
  }, [rows, folders, items, createdByName, t.allCreatorsList]);

  const sortedListRows = useMemo(() => {
    const list = [...listRows];
    const dir = listSort.dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (listSort.key) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "count":
          return (a.creatorCount - b.creatorCount) * dir;
        case "createdAt": {
          const av = a.createdAt ?? "";
          const bv = b.createdAt ?? "";
          return av.localeCompare(bv) * dir;
        }
        case "createdBy": {
          const av = a.createdBy ?? "";
          const bv = b.createdBy ?? "";
          return av.localeCompare(bv) * dir;
        }
        case "lastUpdate":
        default: {
          const av = a.lastUpdate ?? "";
          const bv = b.lastUpdate ?? "";
          return av.localeCompare(bv) * dir;
        }
      }
    });
    return list;
  }, [listRows, listSort]);

  const selectedList = useMemo(
    () => listRows.find((l) => l.id === selectedListId) ?? null,
    [listRows, selectedListId]
  );

  const listCreators = useMemo(() => {
    if (!selectedListId) return [];
    if (selectedListId === ALL_LIST_ID) return rows;
    const set = new Set(items.filter((i) => i.folder_id === selectedListId).map((i) => i.creator_username));
    return rows.filter((r) => set.has(r.creator_username));
  }, [rows, items, selectedListId]);

  const filteredCreators = useMemo(() => {
    let list = [...listCreators];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.display_name.toLowerCase().includes(q) ||
          r.creator_username.toLowerCase().includes(q) ||
          r.primary_niche.toLowerCase().includes(q) ||
          emailForRow(r).toLowerCase().includes(q)
      );
    }
    if (platformFilter !== "all") {
      list = list.filter((r) => (r.platform ?? "tiktok").toLowerCase() === platformFilter);
    }
    if (statusFilter !== "all") {
      list = list.filter((r) => r.pipeline_status === statusFilter);
    }
    const dir = creatorSort.dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (creatorSort.key === "name") {
        return a.display_name.localeCompare(b.display_name) * dir;
      }
      if (creatorSort.key === "status") {
        return a.pipeline_status.localeCompare(b.pipeline_status) * dir;
      }
      return (a.followers - b.followers) * dir;
    });
    return list;
  }, [listCreators, search, platformFilter, statusFilter, creatorSort]);

  const openCreatorProfile = (creator: FeedCreator) => {
    setSelected(creator);
    navigate({
      view: "creators",
      list: selectedListId ?? undefined,
      creator: creator.username,
    });
  };

  useEffect(() => {
    if (navState.view !== "creators") return;
    if (navState.list) setSelectedListId(navState.list);
    else if (!navState.creator) setSelectedListId(null);
    if (!navState.creator) {
      setSelected(null);
      return;
    }
    const handle = navState.creator.replace(/^@/, "").toLowerCase();
    const row = rows.find((r) => r.creator_username.replace(/^@/, "").toLowerCase() === handle);
    if (row) setSelected(rowToCreator(row));
    else setSelected(null);
  }, [navState.view, navState.list, navState.creator, rows]);

  const toggleListSort = (key: ListSortKey) => {
    setListSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
  };

  const onCreateList = async () => {
    const name = newListName.trim();
    if (!name) return;
    const f = await createFolder(name);
    setNewListName("");
    setShowNewList(false);
    if (f) {
      setFolders((arr) => [...arr, f]);
    } else {
      void load();
    }
  };

  const onDeleteList = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteFolder(id);
    setFolders((arr) => arr.filter((f) => f.id !== id));
    setItems((arr) => arr.filter((i) => i.folder_id !== id));
    if (selectedListId === id) navigate({ view: "creators" }, { replace: true });
  };

  const onStatusChange = async (username: string, status: string) => {
    setRows((rs) => rs.map((r) => (r.creator_username === username ? { ...r, pipeline_status: status } : r)));
    await apiSetStage(username, status);
  };

  const onNotesChange = async (username: string, notes: string) => {
    setRows((rs) => rs.map((r) => (r.creator_username === username ? { ...r, notes } : r)));
    await apiSetNotes(username, notes);
  };

  const onCrmChange = async (username: string, patch: Partial<CreatorCrm>) => {
    setRows((rs) =>
      rs.map((r) => {
        if (r.creator_username !== username) return r;
        const snap =
          r.snapshot && typeof r.snapshot === "object"
            ? (r.snapshot as Record<string, unknown>)
            : {};
        const crm = crmFromSnapshot(snap);
        return { ...r, snapshot: { ...snap, crm: { ...crm, ...patch } } };
      })
    );
    await apiSetCrm(username, patch);
  };

  const onDeleteCreator = async (username: string) => {
    const label = rows.find((r) => r.creator_username === username)?.display_name || `@${username}`;
    const confirmed = window.confirm(
      lang === "fr"
        ? `Supprimer ${label} de vos créateurs gérés ?`
        : `Remove ${label} from your managed creators?`,
    );
    if (!confirmed) return;

    const folderIds = items.filter((i) => i.creator_username === username).map((i) => i.folder_id);
    for (const folderId of folderIds) {
      await removeFromFolder(folderId, username);
    }
    const res = await unsave(username);
    if (res.error) return;

    setRows((rs) => rs.filter((r) => r.creator_username !== username));
    setItems((arr) => arr.filter((i) => i.creator_username !== username));
    if (selected?.username === username) setSelected(null);
  };

  const pad = isMobile ? "56px 16px 16px" : "28px 32px 32px";

  const listThStyle: React.CSSProperties = {
    padding: "18px 20px",
    fontSize: 14,
    fontWeight: 600,
    color: "#1A1A1A",
    textAlign: "left",
    borderBottom: "1px solid #EFEFEF",
    background: "#FFFFFF",
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
  };

  const listTdStyle: React.CSSProperties = {
    padding: "18px 20px",
    fontSize: 15,
    color: "#1A1A1A",
    borderBottom: "1px solid #F5F5F5",
    verticalAlign: "middle",
  };

  const ctaSize = { padding: "15px 24px", fontSize: 17 } as const;

  const importFolderId =
    selectedListId && selectedListId !== ALL_LIST_ID ? selectedListId : null;

  const tryOpenContent = (row: SavedRow) => {
    if (!canUseCreatorPortal(plan)) {
      setUpgradeFeature("creator-content");
      return;
    }
    setContentTarget(row);
  };

  const tryOpenScript = (row: SavedRow) => {
    if (!canUseScripts(plan)) {
      setUpgradeFeature("scripts");
      return;
    }
    setScriptTarget(row);
  };

  const upgradeModal = upgradeFeature ? (
    <UpgradeModal
      lang={lang}
      featureKey={upgradeFeature}
      currentPlan={plan}
      onClose={() => setUpgradeFeature(null)}
      onPrimary={() => {
        setUpgradeFeature(null);
        if (upgradeFeature) runGateUpgrade(upgradeFeature, lang);
      }}
    />
  ) : null;

  if (importOpen) {
    return (
      <div style={{ padding: pad, background: "#FFFFFF", minHeight: "100%" }}>
        <CreatorImportPanel
          lang={lang}
          isMobile={isMobile}
          folderId={importFolderId}
          onClose={() => setImportOpen(false)}
          onImported={() => void load()}
        />
      </div>
    );
  }

  if (contentTarget && brandId && canUseCreatorPortal(plan)) {
    return (
      <div style={{ padding: pad, background: "#FFFFFF", minHeight: "100%" }}>
        {upgradeModal}
        <CreatorContentBrandPanel
          lang={lang}
          isMobile={isMobile}
          brandId={brandId}
          creatorUsername={contentTarget.creator_username}
          displayName={contentTarget.display_name}
          avatarUrl={contentTarget.avatar_url}
          onClose={() => setContentTarget(null)}
        />
      </div>
    );
  }

  if (scriptTarget && brandId && canUseScripts(plan)) {
    return (
      <div style={{ padding: pad, background: "#FFFFFF", minHeight: "100%" }}>
        {upgradeModal}
        <CreatorScriptPanel
          lang={lang}
          isMobile={isMobile}
          brandId={brandId}
          creatorUsername={scriptTarget.creator_username}
          displayName={scriptTarget.display_name}
          platform={scriptTarget.platform ?? undefined}
          followers={scriptTarget.followers}
          avatarUrl={scriptTarget.avatar_url}
          targetCreatorId={trackitCreatorIdFromRow(scriptTarget)}
          onClose={() => setScriptTarget(null)}
          onSaved={(script) => {
            const snap =
              scriptTarget.snapshot && typeof scriptTarget.snapshot === "object"
                ? (scriptTarget.snapshot as Record<string, unknown>)
                : {};
            const crm = crmFromSnapshot(snap);
            const scripts = crm.scripts ?? [];
            if (!scripts.some((s) => s.id === script.id)) {
              void onCrmChange(scriptTarget.creator_username, { scripts: [...scripts, script] });
            }
          }}
        />
      </div>
    );
  }

  if (selectedListId && selectedList) {
    return (
      <div style={{ padding: pad, background: "#FFFFFF", minHeight: "100%" }}>
        {upgradeModal}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <button
              type="button"
              onClick={() => {
                goBack();
                setSearch("");
                setPlatformFilter("all");
                setStatusFilter("all");
                setShowFilters(false);
              }}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 15,
                color: "#7A7A7A",
                fontFamily: "inherit",
                padding: 0,
                flexShrink: 0,
              }}
            >
              {t.backToLists}
            </button>
            <h1
              style={{
                fontSize: isMobile ? 26 : 30,
                fontWeight: 600,
                color: "#1A1A1A",
                margin: 0,
                letterSpacing: "-0.04em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {selectedList.name}
            </h1>
          </div>
          <button type="button" onClick={() => setImportOpen(true)} className="hero-cta-raised-light" style={ctaSize}>
            {t.importBtn}
          </button>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div
            style={{
              flex: 1,
              minWidth: 200,
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "#FFFFFF",
              border: "1px solid #EFEFEF",
              borderRadius: 12,
              padding: "12px 16px",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="11" cy="11" r="7" stroke="#9A9A9A" strokeWidth="2" />
              <path d="M21 21l-4.35-4.35" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.listSearchPlaceholder}
              style={{ border: "none", outline: "none", flex: 1, fontSize: 15, fontFamily: "inherit" }}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            style={{
              ...inputStyle,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 6h16M7 12h10M10 18h4" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            {t.filterBtn}
          </button>
        </div>

        {showFilters && (
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} style={inputStyle}>
              <option value="all">{t.allPlatforms}</option>
              <option value="tiktok">TikTok</option>
              <option value="instagram">Instagram</option>
              <option value="youtube">YouTube</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle}>
              <option value="all">{t.allStatuses}</option>
              {stages.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div
          style={{
            border: "1px solid #EFEFEF",
            borderRadius: 14,
            overflow: isMobile ? "auto" : undefined,
            WebkitOverflowScrolling: isMobile ? "touch" : undefined,
          }}
        >
          {loading ? (
            <div style={{ padding: 48, textAlign: "center", color: "#9A9A9A", fontSize: 16 }}>{t.loading}</div>
          ) : filteredCreators.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "#7A7A7A", fontSize: 16 }}>{t.emptyListCreators}</div>
          ) : (
            <CreatorListTable
              rows={filteredCreators}
              stages={stages}
              t={t}
              onRowClick={(r) => openCreatorProfile(rowToCreator(r))}
              onStatusChange={(username, status) => void onStatusChange(username, status)}
              onNotesChange={(username, notes) => void onNotesChange(username, notes)}
              onCrmChange={(username, patch) => void onCrmChange(username, patch)}
              onOpenScript={(row) => tryOpenScript(row)}
              onOpenContent={(row) => tryOpenContent(row)}
              onDelete={(username) => void onDeleteCreator(username)}
            />
          )}
        </div>

        <CreatorDetailDrawer
          creator={selected}
          plan={plan}
          lang={lang}
          onClose={goBack}
          onUpgrade={onUpgrade ?? (() => {})}
          onWorkspaceChange={load}
          onReachOut={onReachOut}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: pad, background: "#FFFFFF", minHeight: "100%" }}>
        {upgradeModal}
        <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <h1
          style={{
            fontSize: isMobile ? 26 : 34,
            fontWeight: 600,
            color: "#1A1A1A",
            margin: 0,
            letterSpacing: "-0.04em",
          }}
        >
          {t.managePageTitle}
        </h1>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginLeft: "auto" }}>
        {showNewList ? (
          <>
            <input
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onCreateList();
                if (e.key === "Escape") setShowNewList(false);
              }}
              placeholder={t.listNamePlaceholder}
              autoFocus
              style={{ ...inputStyle, width: isMobile ? "100%" : 200 }}
            />
            <button type="button" onClick={() => void onCreateList()} className="hero-cta-raised-dark" style={ctaSize}>
              {t.createList}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="hero-cta-raised-light"
              style={ctaSize}
            >
              {t.importBtn}
            </button>
            <button
              type="button"
              onClick={() => setShowNewList(true)}
              className="hero-cta-raised-dark"
              style={ctaSize}
            >
              + {t.newList}
            </button>
          </>
        )}
        </div>
      </div>

      <div
        style={{
          border: "1px solid #EFEFEF",
          borderRadius: 14,
          overflow: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "#9A9A9A", fontSize: 16 }}>{t.loading}</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 640 : undefined }}>
            <thead>
              <tr>
                {(
                  [
                    { key: "name" as const, label: t.listNameCol },
                    { key: "count" as const, label: t.noCreatorsCol },
                    { key: "lastUpdate" as const, label: t.lastUpdateCol },
                    { key: "createdAt" as const, label: t.createdAtCol },
                    { key: "createdBy" as const, label: t.createdByCol },
                  ] as const
                ).map((col) => (
                  <th key={col.key} style={listThStyle} onClick={() => toggleListSort(col.key)}>
                    {col.label}
                    <SortArrows active={listSort.key === col.key} dir={listSort.dir} />
                  </th>
                ))}
                <th style={{ ...listThStyle, cursor: "default", width: 56 }}>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {sortedListRows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => navigate({ view: "creators", list: row.id })}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#FAFAFA";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#FFFFFF";
                  }}
                >
                  <td style={{ ...listTdStyle, fontWeight: 500 }}>{row.name}</td>
                  <td style={listTdStyle}>{row.creatorCount}</td>
                  <td style={listTdStyle}>{formatListDate(row.lastUpdate, lang)}</td>
                  <td style={listTdStyle}>{formatListDate(row.createdAt, lang)}</td>
                  <td style={listTdStyle}>{row.createdBy ?? ""}</td>
                  <td style={{ ...listTdStyle, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                    {!row.isSystem && (
                      <button
                        type="button"
                        aria-label={t.deleteFolder(row.name)}
                        onClick={(e) => void onDeleteList(e, row.id)}
                        style={{
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          padding: 6,
                          color: "#1A1A1A",
                        }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M10 11v6M14 11v6M6 7l1 12a1 1 0 001 1h8a1 1 0 001-1l1-12"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreatorDetailDrawer
        creator={selected}
        plan={plan}
        lang={lang}
        onClose={goBack}
        onUpgrade={onUpgrade ?? (() => {})}
        onWorkspaceChange={load}
        onReachOut={onReachOut}
      />
        </>
    </div>
  );
}
