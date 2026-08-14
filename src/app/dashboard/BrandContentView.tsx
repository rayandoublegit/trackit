"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [loading, setLoading] = useState(true);
  const [addContentOpen, setAddContentOpen] = useState(false);
  const hasPaintedRef = useRef(false);
  const hasCampaigns = campaigns.length > 0;

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
      const { cachedJsonFetch } = await import("@/lib/dashboard-fetch-cache");
      const data = await cachedJsonFetch<{ ok?: boolean; items?: ContentListItem[] }>(
        `/api/content?${params.toString()}`,
        { credentials: "include" },
        { preferCache: true, ttlMs: 30_000 },
      );
      setItems(data?.ok ? (data.items ?? []) : []);
      hasPaintedRef.current = true;
    } catch {
      if (!hasPaintedRef.current) setItems([]);
    } finally {
      setLoading(false);
    }
  }, [brandId, selectedCampaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) {
      setCampaigns([]);
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
  }, [userId, fr]);

  useEffect(() => {
    if (!selectedCampaignId) return;
    if (!campaigns.some((c) => c.id === selectedCampaignId)) {
      setSelectedCampaignId("");
    }
  }, [campaigns, selectedCampaignId]);

  useEffect(() => {
    const onUpdated = () => void load();
    window.addEventListener("trackit:content-updated", onUpdated);
    return () => window.removeEventListener("trackit:content-updated", onUpdated);
  }, [load]);

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
          <label className="bc-campaign-filter">
            <select
              className="bc-campaign-select"
              aria-label={fr ? "Filtrer par campagne" : "Filter by campaign"}
              value={hasCampaigns ? selectedCampaignId : ""}
              disabled={!hasCampaigns}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
            >
              {!hasCampaigns ? (
                <option value="">{fr ? "Aucune campagne en cours" : "No active campaigns"}</option>
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
        </div>

        {loading ? (
          <p className="bc-empty">{fr ? "Chargement…" : "Loading…"}</p>
        ) : items.length === 0 ? (
          <div className="bc-empty-block">
            <p>
              {selectedCampaignId
                ? fr
                  ? "Aucun contenu pour cette campagne."
                  : "No content for this campaign."
                : fr
                  ? "Aucune vidéo pour l’instant. Ajoutez du contenu ou attendez les envois de vos affiliés."
                  : "No videos yet. Add content or wait for your affiliates to upload."}
            </p>
            {!selectedCampaignId ? (
              <button type="button" className="bc-cta" onClick={() => setAddContentOpen(true)}>
                {fr ? "Ajouter" : "Add"}
              </button>
            ) : null}
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
