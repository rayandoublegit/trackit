"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatCompactStat } from "@/lib/content-shared";
import { getSavedCreators, saveCreator } from "@/lib/db";
import { DEMO_CREATOR_POOL, isDemoPresetSavedCreator } from "@/lib/demo-preset-data";
import {
  CAMPAIGNS_UPDATED_EVENT,
  dispatchPayoutsUpdated,
} from "@/lib/outreach-history-events";
import type { RpmAnalyticsSnapshot, RpmCampaignRow } from "@/lib/rpm";
import { formatCurrency, useDisplayCurrency } from "@/lib/useCurrency";
import { useLang } from "@/lib/useLang";
import { listSaved, type SavedRow } from "@/lib/workspace-client";
import { useDashboardNavigationOptional } from "./DashboardNavigationProvider";

type CreatorOption = {
  id: string;
  handle: string;
  fullName: string;
  avatarUrl: string | null;
  findIt?: SavedRow;
};

type Screen = "list" | "create" | "detail";

function money(amount: number, lang: "fr" | "en") {
  return formatCurrency(amount, lang);
}

function statusLabel(status: string, fr: boolean) {
  const s = String(status || "").toLowerCase();
  if (s === "active") return fr ? "Active" : "Active";
  if (s === "paused") return fr ? "En pause" : "Paused";
  if (s === "draft") return fr ? "Brouillon" : "Draft";
  if (s === "completed" || s === "ended") return fr ? "Terminée" : "Ended";
  return status;
}

const DEMO_HANDLES = new Set(
  DEMO_CREATOR_POOL.map((c) => c.handle.toLowerCase()),
);

function normalizeHandle(raw: string): string {
  return String(raw || "").trim().replace(/^@/, "").toLowerCase();
}

function isDemoCreator(row: { handle?: string; notes?: string | null; snapshot?: unknown }): boolean {
  if (isDemoPresetSavedCreator(row)) return true;
  const h = normalizeHandle(row.handle || "");
  return Boolean(h && DEMO_HANDLES.has(h));
}

function avatarFromSavedRow(row: SavedRow): string | null {
  if (row.avatar_url) return row.avatar_url;
  const snap = row.snapshot;
  if (snap && typeof snap === "object") {
    const url = (snap as { avatar_url?: string }).avatar_url;
    if (typeof url === "string" && url) return url;
  }
  return null;
}

export function RpmView({
  userId,
  isMobile,
}: {
  userId?: string;
  isMobile?: boolean;
  plan?: string;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  const displayCurrency = useDisplayCurrency();
  const dashNav = useDashboardNavigationOptional();
  /** Owner id for /api/rpm + creators (not workspace space id). */
  const brandId = userId || "";

  const [screen, setScreen] = useState<Screen>("list");
  const [campaigns, setCampaigns] = useState<RpmCampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RpmAnalyticsSnapshot | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [settling, setSettling] = useState(false);
  const [refreshingContentId, setRefreshingContentId] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [name, setName] = useState("");
  const [rpmRate, setRpmRate] = useState("1");
  const [commissionRate, setCommissionRate] = useState("30");
  const [creators, setCreators] = useState<CreatorOption[]>([]);
  const [loadingCreators, setLoadingCreators] = useState(false);
  const [selectedHandles, setSelectedHandles] = useState<string[]>([]);
  const [creatorSearch, setCreatorSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const loadCampaigns = useCallback(async () => {
    if (!brandId) {
      setCampaigns([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { cachedJsonFetch } = await import("@/lib/dashboard-fetch-cache");
      const data = await cachedJsonFetch<{ ok?: boolean; campaigns?: RpmCampaignRow[]; error?: string }>(
        `/api/rpm?brandId=${encodeURIComponent(brandId)}`,
        { credentials: "include" },
        { preferCache: false, ttlMs: 5_000 },
      );
      if (data?.error) setError(data.error);
      setCampaigns(data?.campaigns ?? []);
    } catch (e) {
      setError((e as Error).message);
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  const loadDetail = useCallback(
    async (campaignId: string) => {
      if (!brandId || !campaignId) return;
      setDetailLoading(true);
      setError(null);
      try {
        const { cachedJsonFetch } = await import("@/lib/dashboard-fetch-cache");
        const data = await cachedJsonFetch<RpmAnalyticsSnapshot & { ok?: boolean; error?: string }>(
          `/api/rpm?brandId=${encodeURIComponent(brandId)}&campaignId=${encodeURIComponent(campaignId)}`,
          { credentials: "include" },
          { preferCache: false, ttlMs: 5_000 },
        );
        if (data?.error) {
          setError(data.error);
          setSnapshot(null);
        } else {
          setSnapshot(data as RpmAnalyticsSnapshot);
        }
      } catch (e) {
        setError((e as Error).message);
        setSnapshot(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [brandId],
  );

  const loadCreators = useCallback(async () => {
    if (!brandId) {
      setCreators([]);
      return;
    }
    setLoadingCreators(true);
    try {
      const [dbRows, findItRows] = await Promise.all([
        getSavedCreators(brandId),
        listSaved(),
      ]);

      const byHandle = new Map<string, CreatorOption>();

      for (const raw of dbRows as Record<string, unknown>[]) {
        const handle = String(raw.handle || raw.username || "").replace(/^@/, "");
        if (
          isDemoCreator({
            handle,
            notes: raw.notes as string | null,
            snapshot: raw.snapshot,
          })
        ) {
          continue;
        }
        const id = String(raw.id || "").trim();
        if (!handle || !id) continue;
        byHandle.set(normalizeHandle(handle), {
          id,
          handle,
          fullName: String(raw.full_name || raw.display_name || handle),
          avatarUrl: typeof raw.avatar_url === "string" && raw.avatar_url ? raw.avatar_url : null,
        });
      }

      for (const row of findItRows) {
        if (
          isDemoCreator({
            handle: row.creator_username,
            notes: row.notes,
            snapshot: row.snapshot,
          })
        ) {
          continue;
        }
        const handle = String(row.creator_username || "").replace(/^@/, "");
        const key = normalizeHandle(handle);
        if (!key) continue;
        const existing = byHandle.get(key);
        byHandle.set(key, {
          id: existing?.id || "",
          handle,
          fullName: row.display_name || existing?.fullName || handle,
          avatarUrl: avatarFromSavedRow(row) || existing?.avatarUrl || null,
          findIt: row,
        });
      }

      setCreators(
        [...byHandle.values()].sort((a, b) =>
          a.handle.localeCompare(b.handle, undefined, { sensitivity: "base" }),
        ),
      );
    } catch {
      setCreators([]);
    } finally {
      setLoadingCreators(false);
    }
  }, [brandId]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (screen !== "detail" || !selectedId) return;
    void loadDetail(selectedId);
  }, [screen, selectedId, loadDetail]);

  useEffect(() => {
    if (screen !== "create") return;
    void loadCreators();
  }, [screen, loadCreators]);

  const filteredCreators = useMemo(() => {
    const q = creatorSearch.trim().toLowerCase();
    if (!q) return creators;
    return creators.filter(
      (c) =>
        c.handle.toLowerCase().includes(q) ||
        c.fullName.toLowerCase().includes(q),
    );
  }, [creators, creatorSearch]);

  const previewAmount = useMemo(() => {
    const rate = Number(rpmRate) || 0;
    const pct = Number(commissionRate) || 0;
    return Math.round(((10000 / 1000) * rate * (pct / 100)) * 100) / 100;
  }, [rpmRate, commissionRate]);

  const openCreate = () => {
    setName("");
    setRpmRate("1");
    setCommissionRate("30");
    setSelectedHandles([]);
    setCreatorSearch("");
    setError(null);
    setScreen("create");
  };

  const openDetail = (id: string) => {
    setSelectedId(id);
    setSnapshot(null);
    setSyncNote(null);
    setScreen("detail");
  };

  const applySnapshotPayload = (data: Record<string, unknown>) => {
    if (data.campaign && data.totals && Array.isArray(data.creators) && Array.isArray(data.content)) {
      setSnapshot(data as unknown as RpmAnalyticsSnapshot);
    }
  };

  const resolveCreatorIds = async (selected: CreatorOption[]): Promise<string[]> => {
    const ids: string[] = [];
    for (const entry of selected) {
      if (entry.id) {
        ids.push(entry.id);
        continue;
      }
      const row = entry.findIt;
      if (!row) continue;
      const created = await saveCreator(brandId, {
        username: row.creator_username,
        display_name: row.display_name || entry.fullName,
        avatar_url: avatarFromSavedRow(row) || entry.avatarUrl || "",
        platform: row.platform ?? "TikTok",
        followers_count: row.followers ?? 0,
        engagement_rate: row.engagement_rate ?? 0,
        avg_views: 0,
        bio: "",
        niche: row.primary_niche ?? "",
      });
      if (created?.id) ids.push(String(created.id));
    }
    return [...new Set(ids)];
  };

  const handleCreate = async () => {
    if (!brandId || creating) return;
    const trimmed = name.trim();
    const rate = Number(rpmRate);
    const pct = Number(commissionRate);
    if (!trimmed) {
      setError(fr ? "Nom requis" : "Name required");
      return;
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      setError(fr ? "RPM doit être > 0" : "RPM must be > 0");
      return;
    }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError(fr ? "Commission entre 0 et 100 %" : "Commission must be 0–100%");
      return;
    }
    if (selectedHandles.length === 0) {
      setError(fr ? "Ajoutez au moins un créateur" : "Add at least one creator");
      return;
    }

    const selected = creators.filter((c) => selectedHandles.includes(normalizeHandle(c.handle)));
    setCreating(true);
    setError(null);
    try {
      const creatorIds = await resolveCreatorIds(selected);
      if (creatorIds.length === 0) {
        setError(fr ? "Impossible de lier les créateurs" : "Could not link creators");
        return;
      }
      const res = await fetch("/api/rpm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          name: trimmed,
          rpmRate: rate,
          commissionRate: pct,
          creatorIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || (fr ? "Création impossible" : "Could not create"));
        return;
      }
      window.dispatchEvent(new Event(CAMPAIGNS_UPDATED_EVENT));
      await loadCampaigns();
      if (data.campaign?.id) {
        openDetail(String(data.campaign.id));
      } else {
        setScreen("list");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleSyncAndSettle = async () => {
    if (!brandId || !selectedId || settling) return;
    setSettling(true);
    setError(null);
    setSyncNote(null);
    try {
      const res = await fetch("/api/rpm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync-campaign",
          brandId,
          campaignId: selectedId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError(String(data.error || (fr ? "Sync impossible" : "Sync failed")));
        return;
      }
      applySnapshotPayload(data);
      dispatchPayoutsUpdated();
      const amount = Number(data.amount ?? 0);
      const refreshed = Number(data.refreshed ?? 0);
      const failed = Number(data.refreshedFailed ?? 0);
      setSyncNote(
        fr
          ? `ScrapeCreators : ${refreshed} vidéo${refreshed > 1 ? "s" : ""} à jour` +
              (failed ? ` (${failed} échec${failed > 1 ? "s" : ""})` : "") +
              ` · ${money(amount, lang)} crédité(s) sur Pay it`
          : `ScrapeCreators: ${refreshed} video${refreshed === 1 ? "" : "s"} refreshed` +
              (failed ? ` (${failed} failed)` : "") +
              ` · ${money(amount, lang)} credited to Pay it`,
      );
      if (!data.campaign) await loadDetail(selectedId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSettling(false);
    }
  };

  const refreshOneContent = async (contentId: string) => {
    if (!selectedId || refreshingContentId) return;
    setRefreshingContentId(contentId);
    setError(null);
    try {
      const res = await fetch("/api/content/refresh-stats", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.pending || !data.ok) {
        setError(
          fr
            ? "Stats ScrapeCreators indisponibles pour ce post"
            : "ScrapeCreators stats unavailable for this post",
        );
        return;
      }
      dispatchPayoutsUpdated();
      await loadDetail(selectedId);
      setSyncNote(fr ? "Vues mises à jour · RPM recalculé" : "Views updated · RPM recalculated");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshingContentId(null);
    }
  };

  const toggleCreator = (handle: string) => {
    const key = normalizeHandle(handle);
    setSelectedHandles((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
    );
  };

  const cardStyle: CSSProperties = {
    background: "var(--ws-surface)",
    border: "1px solid var(--ws-border)",
    borderRadius: 12,
    padding: isMobile ? 14 : 18,
    fontFamily: "inherit",
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid var(--ws-border)",
    background: "var(--ws-input)",
    color: "var(--ws-text)",
    fontSize: 14,
    fontFamily: "inherit",
    fontWeight: 500,
    letterSpacing: "-0.02em",
    outline: "none",
  };

  const labelStyle: CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--ws-text-muted)",
    marginBottom: 6,
    letterSpacing: "-0.02em",
    fontFamily: "inherit",
  };

  const secondaryBtn: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "10px 16px",
    borderRadius: 12,
    border: "1px solid var(--ws-border)",
    background: "var(--ws-surface)",
    color: "var(--ws-text)",
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "inherit",
    letterSpacing: "-0.02em",
    lineHeight: 1,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  const bodyTextStyle: CSSProperties = {
    margin: "0 0 24px",
    color: "var(--ws-text-muted)",
    fontSize: 14,
    fontWeight: 500,
    letterSpacing: "-0.02em",
    fontFamily: "inherit",
    maxWidth: 560,
  };

  // ─── Create ───────────────────────────────────────────────
  if (screen === "create") {
    return (
      <div className={`bc-page${isMobile ? " is-mobile" : ""}`}>
        <div className="bc-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <button type="button" style={secondaryBtn} onClick={() => setScreen("list")}>
              ← {fr ? "Retour" : "Back"}
            </button>
            <h1 className="bc-topbar__title" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {fr ? "Nouvelle campagne RPM" : "New RPM campaign"}
            </h1>
          </div>
        </div>
        <div className="bc-rule" aria-hidden />
        <div className="bc-main">
        <p style={bodyTextStyle}>
          {fr
            ? "Payez les créateurs au nombre de vues. Définissez le tarif pour 1 000 vues et le % versé au créateur."
            : "Pay creators by views. Set the rate per 1,000 views and the % paid to the creator."}
        </p>

        <div style={{ display: "grid", gap: 20, maxWidth: 640 }}>
          <div>
            <label style={labelStyle}>{fr ? "Nom de la campagne" : "Campaign name"}</label>
            <input
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={fr ? "ex. Lancement été RPM" : "e.g. Summer launch RPM"}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>
                {fr ? `RPM (${displayCurrency === "EUR" ? "€" : "$"} / 1 000 vues)` : `RPM (${displayCurrency === "EUR" ? "€" : "$"} / 1,000 views)`}
              </label>
              <input
                style={inputStyle}
                type="number"
                min={0.01}
                step={0.01}
                value={rpmRate}
                onChange={(e) => setRpmRate(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>{fr ? "Commission créateur (%)" : "Creator commission (%)"}</label>
              <input
                style={inputStyle}
                type="number"
                min={0}
                max={100}
                step={1}
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
              />
            </div>
          </div>

          <div style={{ ...cardStyle, background: "var(--ws-bg)" }}>
            <div style={{ fontSize: 12, color: "var(--ws-text-muted)", marginBottom: 6 }}>
              {fr ? "Exemple · 10 000 vues" : "Example · 10,000 views"}
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.025em" }}>
              {money(previewAmount, lang)}{" "}
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ws-text-muted)" }}>
                {fr ? "dus au créateur" : "owed to creator"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--ws-text-dim)", marginTop: 6 }}>
              {fr
                ? `(10 000 / 1 000) × ${rpmRate || 0} × ${commissionRate || 0}%`
                : `(10,000 / 1,000) × ${rpmRate || 0} × ${commissionRate || 0}%`}
            </div>
          </div>

          <div>
            <label style={labelStyle}>
              {fr ? "Créateurs" : "Creators"}{" "}
              <span style={{ fontWeight: 500 }}>
                ({selectedHandles.length})
              </span>
            </label>
            <input
              style={{ ...inputStyle, marginBottom: 10 }}
              value={creatorSearch}
              onChange={(e) => setCreatorSearch(e.target.value)}
              placeholder={fr ? "Rechercher…" : "Search…"}
            />
            <div
              style={{
                ...cardStyle,
                maxHeight: 280,
                overflow: "auto",
                padding: 8,
                display: "grid",
                gap: 4,
              }}
            >
              {loadingCreators ? (
                <div style={{ padding: 12, color: "var(--ws-text-muted)", fontSize: 13 }}>
                  {fr ? "Chargement des créateurs…" : "Loading creators…"}
                </div>
              ) : filteredCreators.length === 0 ? (
                <div style={{ padding: 12, color: "var(--ws-text-muted)", fontSize: 13 }}>
                  {creators.length === 0
                    ? fr
                      ? "Aucun créateur dans votre compte. Ajoutez-en depuis Find it / Créateurs."
                      : "No creators in your account yet. Add some from Find it / Creators."
                    : fr
                      ? "Aucun résultat pour cette recherche."
                      : "No results for this search."}
                </div>
              ) : (
                filteredCreators.map((c) => {
                  const key = normalizeHandle(c.handle);
                  const on = selectedHandles.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleCreator(c.handle)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: on ? "1px solid var(--ws-text)" : "1px solid transparent",
                        background: on ? "var(--ws-bg)" : "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                        color: "var(--ws-text)",
                        fontFamily: "inherit",
                      }}
                    >
                      {c.avatarUrl ? (
                        <img
                          src={c.avatarUrl}
                          alt=""
                          width={28}
                          height={28}
                          style={{ borderRadius: "50%", objectFit: "cover" }}
                        />
                      ) : (
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: "var(--ws-border)",
                            display: "inline-flex",
                          }}
                        />
                      )}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>@{c.handle}</div>
                        <div style={{ fontSize: 11, color: "var(--ws-text-muted)" }}>{c.fullName}</div>
                      </span>
                      <span style={{ fontSize: 12, color: on ? "var(--ws-text)" : "var(--ws-text-dim)" }}>
                        {on ? "✓" : "+"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {error ? (
            <div style={{ color: "var(--ws-danger)", fontSize: 13 }}>{error}</div>
          ) : null}

          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="bc-cta" disabled={creating} onClick={() => void handleCreate()}>
              {creating
                ? fr
                  ? "Création…"
                  : "Creating…"
                : fr
                  ? "Créer la campagne"
                  : "Create campaign"}
            </button>
            <button type="button" style={secondaryBtn} onClick={() => setScreen("list")}>
              {fr ? "Annuler" : "Cancel"}
            </button>
          </div>
        </div>
        </div>
      </div>
    );
  }

  // ─── Detail / analytics ───────────────────────────────────
  if (screen === "detail" && selectedId) {
    const totals = snapshot?.totals;
    const camp = snapshot?.campaign;

    return (
      <div className={`bc-page${isMobile ? " is-mobile" : ""}`}>
        <div className="bc-topbar" style={{ flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
            <button type="button" style={secondaryBtn} onClick={() => setScreen("list")}>
              ← {fr ? "Retour" : "Back"}
            </button>
            <div style={{ minWidth: 0 }}>
              <h1 className="bc-topbar__title">
                {camp?.name || (fr ? "Campagne RPM" : "RPM campaign")}
              </h1>
              {camp ? (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--ws-text-muted)",
                    marginTop: 4,
                    fontFamily: "inherit",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {statusLabel(camp.status, fr)}
                  {" · "}
                  {money(Number(camp.rpm_rate ?? 0), lang)}
                  {fr ? " / 1 000 vues" : " / 1,000 views"}
                  {" · "}
                  {Number(camp.commission_rate ?? 0)}% {fr ? "créateur" : "creator"}
                </div>
              ) : null}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className="bc-cta"
              disabled={settling || detailLoading}
              onClick={() => void handleSyncAndSettle()}
            >
              {settling
                ? fr
                  ? "Sync ScrapeCreators…"
                  : "Syncing ScrapeCreators…"
                : fr
                  ? "Sync vues & calculer RPM"
                  : "Sync views & calculate RPM"}
            </button>
            <button
              type="button"
              style={secondaryBtn}
              onClick={() => dashNav?.navigate({ view: "payouts" })}
            >
              {fr ? "Payer (Pay it)" : "Pay it"}
            </button>
          </div>
        </div>
        <div className="bc-rule" aria-hidden />
        <div className="bc-main">

        {error ? (
          <div style={{ color: "var(--ws-danger)", fontSize: 13, marginBottom: 12, fontFamily: "inherit" }}>{error}</div>
        ) : null}
        {syncNote ? (
          <div style={{ color: "var(--ws-text)", fontSize: 13, marginBottom: 12, fontFamily: "inherit", letterSpacing: "-0.02em" }}>{syncNote}</div>
        ) : null}

        {detailLoading && !snapshot ? (
          <div style={{ color: "var(--ws-text-muted)", padding: 24 }}>
            {fr ? "Chargement…" : "Loading…"}
          </div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
                gap: 12,
                marginBottom: 24,
              }}
            >
              {(
                [
                  {
                    label: fr ? "Vues" : "Views",
                    value: formatCompactStat(totals?.views ?? 0, lang),
                  },
                  {
                    label: fr ? "Likes" : "Likes",
                    value: formatCompactStat(totals?.likes ?? 0, lang),
                  },
                  {
                    label: fr ? "Engagement" : "Engagement",
                    value: `${(totals?.engagementRate ?? 0).toFixed(2)}%`,
                  },
                  {
                    label: fr ? "Dû (accrued)" : "Accrued owed",
                    value: money(totals?.accrued ?? 0, lang),
                  },
                ] as const
              ).map((kpi) => (
                <div key={kpi.label} style={cardStyle}>
                  <div style={{ fontSize: 12, color: "var(--ws-text-muted)", marginBottom: 6 }}>
                    {kpi.label}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.025em" }}>
                    {kpi.value}
                  </div>
                </div>
              ))}
            </div>

            {(totals?.pending ?? 0) > 0 || (totals?.accrued ?? 0) > 0 ? (
              <div
                style={{
                  ...cardStyle,
                  marginBottom: 20,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: "var(--ws-text-muted)" }}>
                    {(totals?.pending ?? 0) > 0
                      ? fr
                        ? "Nouvelles vues non encore créditées"
                        : "New views not yet credited"
                      : fr
                        ? "Déjà crédité sur Pay it"
                        : "Already credited to Pay it"}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>
                    {money((totals?.pending ?? 0) > 0 ? (totals?.pending ?? 0) : (totals?.accrued ?? 0), lang)}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--ws-text-dim)", maxWidth: 320, textAlign: "right" }}>
                  {fr
                    ? "Sync tire les vues via ScrapeCreators, calcule le RPM, crédite le solde. Paiement final dans Pay it."
                    : "Sync pulls views via ScrapeCreators, calculates RPM, credits balance. Final payment in Pay it."}
                </div>
              </div>
            ) : null}

            <h2 className="bc-hero-title" style={{ fontSize: 16, marginBottom: 12 }}>
              {fr ? "Par créateur" : "By creator"}
            </h2>
            <div style={{ ...cardStyle, padding: 0, overflow: "auto", marginBottom: 28 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "inherit" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--ws-border)", textAlign: "left" }}>
                    <th style={{ padding: "12px 14px", fontWeight: 600, fontFamily: "inherit", letterSpacing: "-0.02em" }}>{fr ? "Créateur" : "Creator"}</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600, fontFamily: "inherit", letterSpacing: "-0.02em" }}>{fr ? "Contenus" : "Posts"}</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600, fontFamily: "inherit", letterSpacing: "-0.02em" }}>{fr ? "Vues" : "Views"}</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600, fontFamily: "inherit", letterSpacing: "-0.02em" }}>{fr ? "Likes" : "Likes"}</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600, fontFamily: "inherit", letterSpacing: "-0.02em" }}>ER</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600, fontFamily: "inherit", letterSpacing: "-0.02em" }}>{fr ? "Accru" : "Accrued"}</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600, fontFamily: "inherit", letterSpacing: "-0.02em" }}>{fr ? "Pending" : "Pending"}</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600 }} />
                  </tr>
                </thead>
                <tbody>
                  {(snapshot?.creators || []).length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 20, color: "var(--ws-text-muted)" }}>
                        {fr
                          ? "Aucun contenu tracké pour l’instant. Les uploads des créateurs de la campagne apparaîtront ici."
                          : "No tracked content yet. Uploads from campaign creators will show here."}
                      </td>
                    </tr>
                  ) : (
                    (snapshot?.creators || []).map((c) => (
                      <tr key={c.creatorId} style={{ borderBottom: "1px solid var(--ws-border)" }}>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {c.avatarUrl ? (
                              <img
                                src={c.avatarUrl}
                                alt=""
                                width={28}
                                height={28}
                                style={{ borderRadius: "50%", objectFit: "cover" }}
                              />
                            ) : null}
                            <div>
                              <div style={{ fontWeight: 600 }}>@{c.handle}</div>
                              <div style={{ fontSize: 11, color: "var(--ws-text-muted)" }}>{c.fullName}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px" }}>{c.contentCount}</td>
                        <td style={{ padding: "12px 14px" }}>{formatCompactStat(c.views, lang)}</td>
                        <td style={{ padding: "12px 14px" }}>{formatCompactStat(c.likes, lang)}</td>
                        <td style={{ padding: "12px 14px" }}>{c.engagementRate.toFixed(2)}%</td>
                        <td style={{ padding: "12px 14px" }}>{money(c.accrued, lang)}</td>
                        <td style={{ padding: "12px 14px" }}>{money(c.pending, lang)}</td>
                        <td style={{ padding: "12px 14px" }}>
                          {c.accrued > 0 || c.pending > 0 ? (
                            <button
                              type="button"
                              style={{ ...secondaryBtn, padding: "6px 10px", fontSize: 12 }}
                              onClick={() =>
                                dashNav?.navigate({
                                  view: "payouts",
                                  payout: { type: "creator", id: c.creatorId },
                                })
                              }
                            >
                              {fr ? "Payer" : "Pay"}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <h2 className="bc-hero-title" style={{ fontSize: 16, marginBottom: 12 }}>
              {fr ? "Contenu" : "Content"}
            </h2>
            <div style={{ ...cardStyle, padding: 0, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "inherit" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--ws-border)", textAlign: "left" }}>
                    <th style={{ padding: "12px 14px", fontWeight: 600, fontFamily: "inherit", letterSpacing: "-0.02em" }}>{fr ? "Titre" : "Title"}</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600, fontFamily: "inherit", letterSpacing: "-0.02em" }}>{fr ? "Créateur" : "Creator"}</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600, fontFamily: "inherit", letterSpacing: "-0.02em" }}>{fr ? "Vues" : "Views"}</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600, fontFamily: "inherit", letterSpacing: "-0.02em" }}>{fr ? "Likes" : "Likes"}</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600, fontFamily: "inherit", letterSpacing: "-0.02em" }}>{fr ? "Accru" : "Accrued"}</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600, fontFamily: "inherit", letterSpacing: "-0.02em" }}>{fr ? "Pending" : "Pending"}</th>
                    <th style={{ padding: "12px 14px", fontWeight: 600 }} />
                  </tr>
                </thead>
                <tbody>
                  {(snapshot?.content || []).length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: 20, color: "var(--ws-text-muted)" }}>
                        {fr
                          ? "Pas encore de contenu. Les uploads créateur (avec URL TikTok) de cette campagne apparaîtront ici."
                          : "No content yet. Creator uploads (with TikTok URL) in this campaign will show here."}
                      </td>
                    </tr>
                  ) : (
                    (snapshot?.content || []).map((row) => (
                      <tr key={row.id} style={{ borderBottom: "1px solid var(--ws-border)" }}>
                        <td style={{ padding: "12px 14px", maxWidth: 220 }}>
                          {row.postUrl ? (
                            <a
                              href={row.postUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "var(--ws-text)", fontWeight: 500 }}
                            >
                              {row.title}
                            </a>
                          ) : (
                            row.title
                          )}
                        </td>
                        <td style={{ padding: "12px 14px" }}>@{row.creatorHandle}</td>
                        <td style={{ padding: "12px 14px" }}>{formatCompactStat(row.views, lang)}</td>
                        <td style={{ padding: "12px 14px" }}>{formatCompactStat(row.likes, lang)}</td>
                        <td style={{ padding: "12px 14px" }}>{money(row.rpmAccrued, lang)}</td>
                        <td style={{ padding: "12px 14px" }}>{money(row.pending, lang)}</td>
                        <td style={{ padding: "12px 14px" }}>
                          {row.postUrl ? (
                            <button
                              type="button"
                              style={{
                                ...secondaryBtn,
                                padding: "6px 10px",
                                fontSize: 12,
                                opacity: refreshingContentId === row.id ? 0.6 : 1,
                              }}
                              disabled={Boolean(refreshingContentId) || settling}
                              onClick={() => void refreshOneContent(row.id)}
                            >
                              {refreshingContentId === row.id
                                ? "…"
                                : fr
                                  ? "Refresh"
                                  : "Refresh"}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
        </div>
      </div>
    );
  }

  // ─── List ─────────────────────────────────────────────────
  return (
    <div className={`bc-page${isMobile ? " is-mobile" : ""}`}>
      <div className="bc-topbar">
        <h1 className="bc-topbar__title">RPM</h1>
        <button type="button" className="bc-cta" onClick={openCreate}>
          {fr ? "Créer" : "Create"}
        </button>
      </div>
      <div className="bc-rule" aria-hidden />
      <div className="bc-main">
      <p style={bodyTextStyle}>
        {fr
          ? "Payez au RPM : les vues sont lues via ScrapeCreators sur le contenu tracké, le dû est crédité, le paiement se fait dans Pay it."
          : "Pay by RPM: views are read via ScrapeCreators on tracked content, amounts are credited, payout happens in Pay it."}
      </p>

      {error ? (
        <div style={{ color: "var(--ws-danger)", fontSize: 13, marginBottom: 12, fontFamily: "inherit" }}>{error}</div>
      ) : null}

      {loading ? (
        <div style={{ color: "var(--ws-text-muted)", padding: 24, fontFamily: "inherit" }}>
          {fr ? "Chargement…" : "Loading…"}
        </div>
      ) : campaigns.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, fontFamily: "inherit", letterSpacing: "-0.025em" }}>
            {fr ? "Aucune campagne RPM" : "No RPM campaigns yet"}
          </div>
          <p style={{ margin: "0 0 16px", color: "var(--ws-text-muted)", fontSize: 14, fontFamily: "inherit", letterSpacing: "-0.02em" }}>
            {fr
              ? "Créez une campagne, fixez le prix pour 1 000 vues, invitez des créateurs."
              : "Create a campaign, set the rate per 1,000 views, add creators."}
          </p>
          <button type="button" className="bc-cta" onClick={openCreate}>
            {fr ? "Créer une campagne RPM" : "Create RPM campaign"}
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {campaigns.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => openDetail(c.id)}
              style={{
                ...cardStyle,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                cursor: "pointer",
                textAlign: "left",
                color: "inherit",
                width: "100%",
                fontFamily: "inherit",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.025em", fontFamily: "inherit" }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "var(--ws-text-muted)", marginTop: 4, fontFamily: "inherit", letterSpacing: "-0.02em" }}>
                  {statusLabel(c.status, fr)}
                  {" · "}
                  {money(Number(c.rpm_rate ?? 0), lang)}
                  {fr ? " / 1k vues" : " / 1k views"}
                  {" · "}
                  {Number(c.commission_rate ?? 0)}%
                </div>
              </div>
              <span style={{ color: "var(--ws-text-muted)", fontSize: 18 }}>→</span>
            </button>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
