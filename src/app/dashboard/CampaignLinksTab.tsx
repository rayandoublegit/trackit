"use client";

import { useEffect, useMemo, useState } from "react";
import type { Lang } from "@/lib/useLang";
import { supabase } from "@/lib/supabase";
import { buildTrackitShortLink, createAffiliateShortLink } from "@/lib/affiliate-short-link";
import { canUseAffiliates, type PlanTier } from "@/lib/plan-limits";
import { CreatorAvatar } from "./CreatorAvatar";

type LinkMetrics = {
  clicks: number;
  uniques: number;
  byDay: Record<string, number>;
  devices: Record<string, number>;
  countries: Record<string, number>;
  sources: Record<string, number>;
};

type AffiliateLinkRow = {
  id: string;
  slug: string;
  creator_username: string;
  campaign_id: string | null;
  destination_url: string;
  active: boolean;
  created_at: string;
  metrics: LinkMetrics;
};

type CampaignCreator = {
  id: string;
  handle: string;
  full_name?: string;
  avatar_url?: string;
};

const fieldInput: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid var(--ws-border)",
  fontSize: 14,
  fontFamily: "inherit",
  color: "var(--ws-text)",
  letterSpacing: "-0.02em",
  background: "var(--ws-input)",
};

const externFont = "'InterDisplay', 'Inter Display', sans-serif";
const EMPTY_CREATOR_IDS: string[] = [];

function sortedDayEntries(byDay: Record<string, number>) {
  return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
}

function topSources(sources: Record<string, number>, limit = 5) {
  return Object.entries(sources)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit);
}

export function CampaignLinksTab({
  lang,
  brandId,
  campaignId,
  campaignCreatorIds = EMPTY_CREATOR_IDS,
  isMobile,
  plan = "free",
  onUpgrade,
}: {
  lang: Lang;
  brandId?: string;
  /** When omitted, loads brand-wide affiliate links (dedicated Links page). */
  campaignId?: string;
  campaignCreatorIds?: string[];
  isMobile?: boolean;
  plan?: PlanTier;
  onUpgrade?: () => void;
}) {
  const [links, setLinks] = useState<AffiliateLinkRow[]>([]);
  const [totals, setTotals] = useState({ clicks: 0, uniques: 0 });
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [creators, setCreators] = useState<CampaignCreator[]>([]);
  const [selectedCreator, setSelectedCreator] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const creatorIdsKey = campaignCreatorIds.filter(Boolean).join("|");

  const refreshMetrics = async () => {
    if (!brandId) return;
    const params = new URLSearchParams({
      brand_id: brandId,
      days: String(days),
    });
    if (campaignId) params.set("campaign_id", campaignId);
    const res = await fetch(`/api/links/metrics?${params}`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as {
      links?: AffiliateLinkRow[];
      totals?: { clicks: number; uniques: number };
    };
    setLinks(Array.isArray(data.links) ? data.links : []);
    setTotals(data.totals ?? { clicks: 0, uniques: 0 });
  };

  useEffect(() => {
    if (!brandId) {
      setLoading(false);
      setLinks([]);
      setTotals({ clicks: 0, uniques: 0 });
      setCreators([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          brand_id: brandId,
          days: String(days),
        });
        if (campaignId) params.set("campaign_id", campaignId);
        const res = await fetch(`/api/links/metrics?${params}`, { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as {
          links?: AffiliateLinkRow[];
          totals?: { clicks: number; uniques: number };
        };
        if (cancelled) return;
        setLinks(Array.isArray(data.links) ? data.links : []);
        setTotals(data.totals ?? { clicks: 0, uniques: 0 });

        if (supabase) {
          const ids = creatorIdsKey ? creatorIdsKey.split("|") : [];
          if (ids.length > 0) {
            const { data: creatorRows } = await supabase
              .from("creators")
              .select("id, handle, full_name, avatar_url")
              .eq("user_id", brandId)
              .in("id", ids);
            if (!cancelled) setCreators((creatorRows || []) as CampaignCreator[]);
          } else if (!campaignId) {
            const { data: creatorRows } = await supabase
              .from("creators")
              .select("id, handle, full_name, avatar_url")
              .eq("user_id", brandId)
              .limit(200);
            if (!cancelled) setCreators((creatorRows || []) as CampaignCreator[]);
          } else if (!cancelled) {
            setCreators([]);
          }

          const { data: profile } = await supabase
            .from("profiles")
            .select("shopify_store_url")
            .eq("id", brandId)
            .maybeSingle();
          if (!cancelled && profile?.shopify_store_url) {
            setDestinationUrl(String(profile.shopify_store_url));
          }
        }
      } catch (err) {
        console.error("CampaignLinksTab load failed:", err);
        if (!cancelled) {
          setLinks([]);
          setTotals({ clicks: 0, uniques: 0 });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [brandId, campaignId, creatorIdsKey, days]);

  const aggregateByDay = useMemo(() => {
    const out: Record<string, number> = {};
    for (const link of links) {
      for (const [day, count] of Object.entries(link.metrics?.byDay ?? {})) {
        out[day] = (out[day] ?? 0) + count;
      }
    }
    return sortedDayEntries(out);
  }, [links]);

  const aggregateSources = useMemo(() => {
    const out: Record<string, number> = {};
    for (const link of links) {
      for (const [src, count] of Object.entries(link.metrics?.sources ?? {})) {
        out[src] = (out[src] ?? 0) + count;
      }
    }
    return topSources(out, 8);
  }, [links]);

  const linksAllowed = canUseAffiliates(plan);

  const handleGenerate = async () => {
    if (!linksAllowed) {
      onUpgrade?.();
      return;
    }
    if (!brandId || !selectedCreator || !destinationUrl.trim()) return;
    setGenerating(true);
    setGenError("");
    try {
      const creator = creators.find((c) => c.id === selectedCreator);
      if (!creator?.handle) {
        setGenError(lang === "fr" ? "Créateur invalide." : "Invalid creator.");
        return;
      }
      const created = await createAffiliateShortLink({
        brandId,
        creatorUsername: creator.handle,
        destinationUrl: destinationUrl.trim(),
        campaignId: campaignId || undefined,
      });
      if (!created.ok || !created.slug) {
        setGenError(
          (lang === "fr" ? created.errorFr : undefined) ||
            created.error ||
            (lang === "fr" ? "Impossible de créer le lien." : "Could not create link."),
        );
        return;
      }
      await fetch("/api/affiliates/set-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: brandId,
          creatorId: creator.id,
          handle: creator.handle,
          ref: created.slug,
        }),
      }).catch(() => null);
      setSelectedCreator("");
      await refreshMetrics();
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = async (slug: string, destinationUrl?: string) => {
    try {
      await navigator.clipboard.writeText(buildTrackitShortLink(slug, destinationUrl));
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async (linkId: string, slug: string, destinationUrl?: string) => {
    if (!brandId) return;
    const label = buildTrackitShortLink(slug, destinationUrl);
    const confirmed = window.confirm(
      lang === "fr"
        ? `Supprimer le lien ${label} ?\n\nCette action est définitive.`
        : `Delete link ${label}?\n\nThis action cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingId(linkId);
    try {
      const res = await fetch("/api/links/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, linkId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; errorFr?: string };
      if (!res.ok || !data.ok) {
        alert(
          (lang === "fr" ? data.errorFr : undefined) ||
            data.error ||
            (lang === "fr" ? "Impossible de supprimer le lien." : "Could not delete link."),
        );
        return;
      }
      await refreshMetrics();
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--ws-text-dim)", fontSize: 14 }}>
        {lang === "fr" ? "Chargement des liens…" : "Loading links…"}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          paddingBottom: 16,
          borderBottom: "1px solid var(--ws-border)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0, paddingRight: isMobile ? 12 : 20 }}>
          <div style={{ fontSize: 12, color: "var(--ws-text-dim)", marginBottom: 4, letterSpacing: "-0.025em" }}>
            {lang === "fr" ? "Clics" : "Clicks"}
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.03em" }}>{totals.clicks}</div>
        </div>
        <div style={{ width: 1, background: "var(--ws-border)", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, padding: isMobile ? "0 12px" : "0 20px" }}>
          <div style={{ fontSize: 12, color: "var(--ws-text-dim)", marginBottom: 4, letterSpacing: "-0.025em" }}>
            {lang === "fr" ? "Visiteurs uniques" : "Unique visitors"}
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.03em" }}>{totals.uniques}</div>
        </div>
        <div style={{ width: 1, background: "var(--ws-border)", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, paddingLeft: isMobile ? 12 : 20 }}>
          <div style={{ fontSize: 12, color: "var(--ws-text-dim)", marginBottom: 4, letterSpacing: "-0.025em" }}>
            {lang === "fr" ? "Liens actifs" : "Active links"}
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.03em" }}>{links.length}</div>
        </div>
      </div>

      <div style={{ border: "1px solid var(--ws-border)", borderRadius: 16, padding: isMobile ? "20px 16px" : "24px 22px", background: "var(--ws-surface)" }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em" }}>
          {lang === "fr" ? "Générer un lien d'affiliation" : "Generate affiliate link"}
        </h3>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--ws-text-muted)", lineHeight: 1.5 }}>
          {lang === "fr"
            ? "Le lien court est généré à partir de votre URL de destination (ex. myboost.com/abc1234), redirige vers la base de cette boutique et enregistre les clics."
            : "Short links are built from your destination URL (e.g. myboost.com/abc1234), redirect to that store’s base URL, and track clicks."}
        </p>

        {!linksAllowed ? (
          <div
            style={{
              border: "1px dashed var(--ws-border)",
              borderRadius: 12,
              padding: "20px 16px",
              background: "var(--ws-surface-2)",
            }}
          >
            <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--ws-text-muted)", lineHeight: 1.5 }}>
              {lang === "fr"
                ? "Les liens trackés (clics, ventes, CA) sont bloqués sur Free. Passez à Starter pour générer et mesurer vos liens d'affiliation."
                : "Tracked links (clicks, sales, revenue) are locked on Free. Upgrade to Starter to generate and measure affiliate links."}
            </p>
            {onUpgrade ? (
              <button
                type="button"
                onClick={onUpgrade}
                style={{
                  background: "var(--ws-btn)",
                  color: "var(--ws-btn-text)",
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                {lang === "fr" ? "Débloquer les liens trackés" : "Unlock tracked links"}
              </button>
            ) : null}
          </div>
        ) : creators.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ws-text-dim)", margin: 0 }}>
            {lang === "fr"
              ? campaignId
                ? "Ajoutez des créateurs à la campagne pour générer un lien."
                : "Ajoutez des créateurs pour générer un lien."
              : campaignId
                ? "Add creators to this campaign to generate a link."
                : "Add creators to generate a link."}
          </p>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ws-text-dim)", marginBottom: 8 }}>
                {lang === "fr" ? "Créateur" : "Creator"}
              </label>
              <select
                value={selectedCreator}
                onChange={(e) => setSelectedCreator(e.target.value)}
                style={{ ...fieldInput, cursor: "pointer" }}
              >
                <option value="">{lang === "fr" ? "Choisir…" : "Select…"}</option>
                {creators.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name || c.handle} (@{c.handle.replace(/^@/, "")})
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ws-text-dim)", marginBottom: 8 }}>
                {lang === "fr" ? "URL de destination" : "Destination URL"}
              </label>
              <input
                type="url"
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
                placeholder="https://votre-boutique.com"
                style={fieldInput}
              />
            </div>
            {genError ? <p style={{ color: "var(--ws-danger)", fontSize: 13, margin: "0 0 12px" }}>{genError}</p> : null}
            <button
              type="button"
              disabled={generating || !selectedCreator || !destinationUrl.trim()}
              onClick={() => void handleGenerate()}
              style={{
                border: "none",
                background: "var(--ws-btn)",
                color: "var(--ws-btn-text)",
                borderRadius: 10,
                padding: "11px 18px",
                fontSize: 14,
                fontWeight: 600,
                cursor: generating ? "default" : "pointer",
                opacity: generating || !selectedCreator || !destinationUrl.trim() ? 0.45 : 1,
                fontFamily: "inherit",
              }}
            >
              {generating
                ? lang === "fr"
                  ? "Génération…"
                  : "Generating…"
                : lang === "fr"
                  ? "Générer le lien"
                  : "Generate link"}
            </button>
          </>
        )}
      </div>

      {(aggregateByDay.length > 0 || aggregateSources.length > 0) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr",
            gap: 14,
          }}
        >
          <div style={{ border: "1px solid var(--ws-border)", borderRadius: 16, padding: "20px 18px", background: "var(--ws-surface)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--ws-text)" }}>
                {lang === "fr" ? "Clics par jour" : "Clicks by day"}
              </h4>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                style={{ ...fieldInput, width: "auto", padding: "6px 10px", fontSize: 12 }}
              >
                {[7, 30, 90].map((d) => (
                  <option key={d} value={d}>
                    {d}
                    {lang === "fr" ? " j" : " d"}
                  </option>
                ))}
              </select>
            </div>
            {aggregateByDay.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ws-text-dim)", margin: 0 }}>{lang === "fr" ? "Aucun clic." : "No clicks yet."}</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {aggregateByDay.slice(-14).map(([day, count]) => (
                  <div key={day} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 72, fontSize: 12, color: "var(--ws-text-dim)", flexShrink: 0 }}>{day.slice(5)}</span>
                    <div style={{ flex: 1, height: 8, background: "var(--ws-pill)", borderRadius: 999, overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.max(4, Math.round((count / Math.max(...aggregateByDay.map(([, c]) => c), 1)) * 100))}%`,
                          background: "var(--ws-text)",
                          borderRadius: 999,
                        }}
                      />
                    </div>
                    <span style={{ width: 28, textAlign: "right", fontSize: 12, fontWeight: 600, color: "var(--ws-text)" }}>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ border: "1px solid var(--ws-border)", borderRadius: 16, padding: "20px 18px", background: "var(--ws-surface)" }}>
            <h4 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "var(--ws-text)" }}>
              {lang === "fr" ? "Sources de trafic" : "Sources"}
            </h4>
            {aggregateSources.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ws-text-dim)", margin: 0 }}>{lang === "fr" ? "Aucune source." : "No sources yet."}</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {aggregateSources.map(([src, count]) => (
                  <div key={src} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
                    <span style={{ color: "var(--ws-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{src}</span>
                    <span style={{ fontWeight: 600, color: "var(--ws-text)", flexShrink: 0 }}>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ border: "1px solid var(--ws-border)", borderRadius: 16, overflow: "hidden", background: "var(--ws-surface)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--ws-border)" }}>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--ws-text)" }}>
            {lang === "fr"
              ? campaignId
                ? "Liens de la campagne"
                : "Tous les liens"
              : campaignId
                ? "Campaign links"
                : "All links"}
          </h4>
        </div>
        {links.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--ws-text-dim)", fontSize: 13 }}>
            {lang === "fr"
              ? campaignId
                ? "Aucun lien généré pour cette campagne."
                : "Aucun lien généré pour le moment."
              : campaignId
                ? "No links generated for this campaign yet."
                : "No links generated yet."}
          </div>
        ) : (
          links.map((link, index) => {
            const creator = creators.find(
              (c) => c.handle.replace(/^@/, "").toLowerCase() === link.creator_username.replace(/^@/, "").toLowerCase(),
            );
            const shortUrl = buildTrackitShortLink(link.slug, link.destination_url);
            return (
              <div
                key={link.id}
                style={{
                  padding: "18px 20px",
                  borderBottom: index < links.length - 1 ? "1px solid var(--ws-border)" : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                  {creator ? (
                    <CreatorAvatar src={creator.avatar_url} username={creator.handle} displayName={creator.full_name || creator.handle} size={36} alt={creator.handle} />
                  ) : null}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ws-text)" }}>
                      @{link.creator_username.replace(/^@/, "")}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--ws-text)",
                        fontFamily: externFont,
                        letterSpacing: "-0.02em",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {shortUrl}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyLink(link.slug, link.destination_url)}
                    style={{
                      border: "1px solid var(--ws-border)",
                      background: "var(--ws-surface)",
                      borderRadius: 8,
                      padding: "8px 12px",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {copiedSlug === link.slug
                      ? lang === "fr"
                        ? "Copié"
                        : "Copied"
                      : lang === "fr"
                        ? "Copier"
                        : "Copy"}
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === link.id}
                    onClick={() => void handleDelete(link.id, link.slug, link.destination_url)}
                    style={{
                      border: "1px solid var(--ws-border)",
                      background: "var(--ws-surface)",
                      borderRadius: 8,
                      padding: "8px 12px",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: deletingId === link.id ? "default" : "pointer",
                      fontFamily: "inherit",
                      color: "var(--ws-danger)",
                      opacity: deletingId === link.id ? 0.5 : 1,
                    }}
                  >
                    {deletingId === link.id
                      ? lang === "fr"
                        ? "Suppression…"
                        : "Deleting…"
                      : lang === "fr"
                        ? "Supprimer"
                        : "Delete"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "var(--ws-text-muted)" }}>
                  <span>
                    <strong style={{ color: "var(--ws-text)" }}>{link.metrics.clicks}</strong> {lang === "fr" ? "clics" : "clicks"}
                  </span>
                  <span>
                    <strong style={{ color: "var(--ws-text)" }}>{link.metrics.uniques}</strong> {lang === "fr" ? "uniques" : "uniques"}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
