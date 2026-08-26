"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import {
  formatCompactStat,
  formatContentBytes,
  isImageContentFile,
  isVideoContentFile,
  type ContentListItem,
} from "@/lib/content-shared";
import { getCampaigns } from "@/lib/db";
import { getClientBrandWorkspaceId } from "@/lib/workspaces";
import { AddBrandContentPanel } from "./AddBrandContentPanel";
import { ContentFileActions } from "./ContentFileActions";

type CampaignOption = { id: string; name: string };
type HookOption = { id: string; title: string };

function formatDate(iso: string, lang: "fr" | "en") {
  try {
    return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function ContentCard({ item, lang, brandId }: { item: ContentListItem; lang: "fr" | "en"; brandId?: string }) {
  const isImage = isImageContentFile(item);
  const isVideo = isVideoContentFile(item);

  return (
    <article className="bc-card">
      <div className="bc-card__media">
        {isImage ? (
          <img src={item.file_url} alt="" />
        ) : isVideo ? (
          <video src={item.file_url} controls />
        ) : (
          <div className="bc-card__file">{item.file_name}</div>
        )}
      </div>
      <div className="bc-card__body">
        <div className="bc-card__title">{item.title}</div>
        <div className="bc-card__meta">
          {item.creatorName || (item.creatorHandle ? `@${item.creatorHandle}` : "—")}
          {" · "}
          {formatDate(item.created_at, lang)}
          {item.file_size ? ` · ${formatContentBytes(item.file_size)}` : ""}
        </div>
        {item.hookTitle ? (
          <div className="bc-card__hook" style={{ fontFamily: "inherit" }}>
            Hook · {item.hookTitle}
          </div>
        ) : null}
        {item.notes ? <p className="bc-card__notes">{item.notes}</p> : null}
        <div className="bc-card__metrics">
          {(
            [
              { label: lang === "fr" ? "Vues" : "Views", value: item.views },
              { label: lang === "fr" ? "Likes" : "Likes", value: item.likes },
              { label: lang === "fr" ? "Comms" : "Comments", value: item.comments },
              { label: lang === "fr" ? "Shares" : "Shares", value: item.shares },
            ] as const
          ).map((m) => (
            <div key={m.label} className="bc-card__metric">
              <span>{m.label}</span>
              <strong>{formatCompactStat(m.value, lang)}</strong>
            </div>
          ))}
        </div>
        {item.campaignNames && item.campaignNames.length > 0 ? (
          <div className="bc-card__tags">
            {item.campaignNames.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        ) : null}
        <div className="bc-card__actions">
          <ContentFileActions
            lang={lang}
            brandId={brandId}
            contentId={item.id}
            fileUrl={item.file_url}
            fileName={item.file_name}
            openLabel={lang === "fr" ? "Télécharger" : "Download"}
          />
        </div>
      </div>
    </article>
  );
}

export function BrandContentView({ userId, isMobile }: { userId?: string; isMobile?: boolean }) {
  const lang = useLang();
  const fr = lang === "fr";
  const brandId = getClientBrandWorkspaceId() || userId || "";
  const [items, setItems] = useState<ContentListItem[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [hooks, setHooks] = useState<HookOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [selectedHookId, setSelectedHookId] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [quality, setQuality] = useState<"" | "top" | "with-stats">("");
  const [sort, setSort] = useState<"recent" | "views">("recent");
  const [loading, setLoading] = useState(true);
  const [addContentOpen, setAddContentOpen] = useState(false);
  const hasPaintedRef = useRef(false);
  const hasCampaigns = campaigns.length > 0;
  const hasHooks = hooks.length > 0;

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    if (!brandId) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (!hasPaintedRef.current) setLoading(true);
    try {
      const params = new URLSearchParams({ brandId });
      if (selectedCampaignId) params.set("campaignId", selectedCampaignId);
      if (selectedHookId) params.set("hookId", selectedHookId);
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (quality) params.set("quality", quality);
      if (sort && sort !== "recent") params.set("sort", sort);
      const { cachedJsonFetch } = await import("@/lib/dashboard-fetch-cache");
      const data = await cachedJsonFetch<{ ok?: boolean; items?: ContentListItem[] }>(
        `/api/content?${params.toString()}`,
        { credentials: "include" },
        { preferCache: false, ttlMs: 15_000 },
      );
      setItems(data?.ok ? (data.items ?? []) : []);
      hasPaintedRef.current = true;
    } catch {
      if (!hasPaintedRef.current) setItems([]);
    } finally {
      setLoading(false);
    }
  }, [brandId, selectedCampaignId, selectedHookId, debouncedSearch, quality, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) {
      setCampaigns([]);
      setHooks([]);
      return;
    }
    void (async () => {
      try {
        const rows = await getCampaigns(userId);
        setCampaigns(
          (rows || []).map((r) => ({
            id: String((r as { id: string }).id),
            name: String((r as { name?: string }).name || (fr ? "Campagne" : "Campaign")),
          })),
        );
      } catch {
        setCampaigns([]);
      }
    })();
    void (async () => {
      try {
        const res = await fetch("/api/hooks", { credentials: "include", cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setHooks([]);
          return;
        }
        setHooks(
          ((data.hooks || []) as { id: string; title: string }[]).map((h) => ({
            id: h.id,
            title: h.title,
          })),
        );
      } catch {
        setHooks([]);
      }
    })();
  }, [userId, fr]);

  useEffect(() => {
    if (!selectedCampaignId) return;
    if (!campaigns.some((c) => c.id === selectedCampaignId)) {
      setSelectedCampaignId("");
    }
  }, [campaigns, selectedCampaignId]);

  useEffect(() => {
    if (!selectedHookId) return;
    if (!hooks.some((h) => h.id === selectedHookId)) {
      setSelectedHookId("");
    }
  }, [hooks, selectedHookId]);

  useEffect(() => {
    const onUpdated = () => void load();
    window.addEventListener("trackit:content-updated", onUpdated);
    window.addEventListener("trackit:hooks-updated", onUpdated);
    return () => {
      window.removeEventListener("trackit:content-updated", onUpdated);
      window.removeEventListener("trackit:hooks-updated", onUpdated);
    };
  }, [load]);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (selectedCampaignId) {
      parts.push(campaigns.find((c) => c.id === selectedCampaignId)?.name || (fr ? "Campagne" : "Campaign"));
    }
    if (selectedHookId) {
      parts.push(hooks.find((h) => h.id === selectedHookId)?.title || "Hook");
    }
    if (quality === "top") parts.push(fr ? "Top perf." : "Top performing");
    if (quality === "with-stats") parts.push(fr ? "Avec stats" : "With stats");
    if (debouncedSearch) parts.push(`“${debouncedSearch}”`);
    return parts;
  }, [selectedCampaignId, selectedHookId, quality, debouncedSearch, campaigns, hooks, fr]);

  const clearFilters = () => {
    setSelectedCampaignId("");
    setSelectedHookId("");
    setSearch("");
    setDebouncedSearch("");
    setQuality("");
    setSort("recent");
  };

  const hasActiveFilters = Boolean(
    selectedCampaignId || selectedHookId || debouncedSearch || quality || sort !== "recent",
  );

  return (
    <div className={`bc-page${isMobile ? " is-mobile" : ""}`}>
      <div className="bc-topbar">
        <h1 className="bc-topbar__title">{fr ? "Contenu" : "Content"}</h1>
        <button type="button" className="bc-cta" onClick={() => setAddContentOpen(true)}>
          {fr ? "Ajouter" : "Add"}
        </button>
      </div>

      <div className="bc-rule" aria-hidden />

      <div className="bc-main">
        <div className="bc-hero-row">
          <h2 className="bc-hero-title">
            {fr ? "Vos clips. Vos campagnes." : "Your clips. Your campaigns."}
          </h2>
        </div>

        <div className="bc-filter-bar" role="search" aria-label={fr ? "Filtres contenu" : "Content filters"}>
          <label className="bc-filter-bar__search">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={fr ? "Rechercher titre, créateur, hook…" : "Search title, creator, hook…"}
              aria-label={fr ? "Rechercher" : "Search"}
              style={{ fontFamily: "inherit" }}
            />
          </label>

          <label className="bc-campaign-filter">
            <select
              className="bc-campaign-select"
              aria-label={fr ? "Filtrer par campagne" : "Filter by campaign"}
              value={hasCampaigns ? selectedCampaignId : ""}
              disabled={!hasCampaigns}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              style={{ fontFamily: "inherit" }}
            >
              {!hasCampaigns ? (
                <option value="">{fr ? "Aucune campagne" : "No campaigns"}</option>
              ) : (
                <>
                  <option value="">{fr ? "Toutes les campagnes" : "All campaigns"}</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </>
              )}
            </select>
          </label>

          <label className="bc-campaign-filter">
            <select
              className="bc-campaign-select"
              aria-label={fr ? "Filtrer par hook" : "Filter by hook"}
              value={hasHooks ? selectedHookId : ""}
              disabled={!hasHooks}
              onChange={(e) => setSelectedHookId(e.target.value)}
              style={{ fontFamily: "inherit" }}
            >
              {!hasHooks ? (
                <option value="">{fr ? "Aucun hook" : "No hooks"}</option>
              ) : (
                <>
                  <option value="">{fr ? "Tous les hooks" : "All hooks"}</option>
                  {hooks.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.title}
                    </option>
                  ))}
                </>
              )}
            </select>
          </label>

          <label className="bc-campaign-filter">
            <select
              className="bc-campaign-select"
              aria-label={fr ? "Qualité / perf." : "Quality / performance"}
              value={quality}
              onChange={(e) => setQuality(e.target.value as "" | "top" | "with-stats")}
              style={{ fontFamily: "inherit" }}
            >
              <option value="">{fr ? "Tout le contenu" : "All content"}</option>
              <option value="top">{fr ? "Top performances" : "Top performing"}</option>
              <option value="with-stats">{fr ? "Avec stats (vues)" : "With stats (views)"}</option>
            </select>
          </label>

          <label className="bc-campaign-filter">
            <select
              className="bc-campaign-select"
              aria-label={fr ? "Trier" : "Sort"}
              value={sort}
              onChange={(e) => setSort(e.target.value as "recent" | "views")}
              style={{ fontFamily: "inherit" }}
            >
              <option value="recent">{fr ? "Plus récents" : "Most recent"}</option>
              <option value="views">{fr ? "Plus de vues" : "Most views"}</option>
            </select>
          </label>

          {hasActiveFilters ? (
            <button type="button" className="bc-filter-bar__clear" onClick={clearFilters} style={{ fontFamily: "inherit" }}>
              {fr ? "Réinitialiser" : "Reset"}
            </button>
          ) : null}
        </div>

        {filterSummary.length > 0 ? (
          <p className="bc-filter-bar__summary" style={{ fontFamily: "inherit" }}>
            {fr ? "Filtres : " : "Filters: "}
            {filterSummary.join(" · ")}
            {!loading ? ` · ${items.length}` : ""}
          </p>
        ) : null}

        {loading ? (
          <p className="bc-empty">{fr ? "Chargement…" : "Loading…"}</p>
        ) : items.length === 0 ? (
          <div className="bc-empty-block">
            <p>
              {hasActiveFilters
                ? fr
                  ? "Aucun contenu pour ces filtres."
                  : "No content matches these filters."
                : fr
                  ? "Aucune vidéo pour l’instant. Ajoutez du contenu ou attendez les envois de vos affiliés."
                  : "No videos yet. Add content or wait for your affiliates to upload."}
            </p>
            {!hasActiveFilters ? (
              <button type="button" className="bc-cta" onClick={() => setAddContentOpen(true)}>
                {fr ? "Ajouter" : "Add"}
              </button>
            ) : (
              <button type="button" className="bc-cta" onClick={clearFilters}>
                {fr ? "Effacer les filtres" : "Clear filters"}
              </button>
            )}
          </div>
        ) : (
          <div className="bc-grid">
            {items.map((item) => (
              <ContentCard key={item.id} item={item} lang={lang} brandId={brandId} />
            ))}
          </div>
        )}
      </div>

      <AddBrandContentPanel
        open={addContentOpen}
        onClose={() => setAddContentOpen(false)}
        brandId={brandId || undefined}
        onSuccess={() => {
          setAddContentOpen(false);
          void load();
        }}
      />
    </div>
  );
}
