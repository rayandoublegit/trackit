"use client";

import { useCallback, useEffect, useState } from "react";
import { useLang } from "@/lib/useLang";
import {
  listActiveDashboardCreatorsClient,
  type ActiveDashboardCreator,
} from "@/lib/active-dashboard-creators";
import { CreatorAvatar } from "./CreatorAvatar";
import { PlatformBrandIcon } from "./PlatformBrandIcon";

function platformLabel(platform: string | null): string {
  const p = (platform ?? "tiktok").toLowerCase();
  if (p === "instagram") return "Instagram";
  if (p === "youtube") return "YouTube";
  return "TikTok";
}

function formatJoinedDate(iso: string, lang: "fr" | "en"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ActiveDashboardCreatorsPanel({
  brandId,
  isMobile,
  compactTop,
}: {
  brandId?: string;
  isMobile?: boolean;
  compactTop?: boolean;
}) {
  const lang = useLang();
  const [creators, setCreators] = useState<ActiveDashboardCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [deactivateTarget, setDeactivateTarget] = useState<ActiveDashboardCreator | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const load = useCallback(async () => {
    if (!brandId) {
      setCreators([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listActiveDashboardCreatorsClient(brandId);
      setCreators(rows);
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener("trackit:creators-saved", onRefresh);
    return () => window.removeEventListener("trackit:creators-saved", onRefresh);
  }, [load]);

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      const res = await fetch("/api/creators/deactivate-dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId: deactivateTarget.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && data.ok) {
        setDeactivateTarget(null);
        void load();
        window.dispatchEvent(new CustomEvent("trackit:creators-saved"));
      }
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <section style={{ marginTop: compactTop ? 0 : isMobile ? 40 : 56 }}>
      <div style={{ marginBottom: 20 }}>
        <h2
          style={{
            fontSize: isMobile ? 20 : 22,
            fontWeight: 600,
            color: "var(--ws-text)",
            margin: "0 0 6px",
            letterSpacing: "-0.03em",
          }}
        >
          {lang === "fr" ? "Créateurs avec dashboard actif" : "Creators with active dashboards"}
        </h2>
        <p style={{ fontSize: 14, color: "var(--ws-text-muted)", margin: 0, lineHeight: 1.5, letterSpacing: "-0.01em" }}>
          {lang === "fr"
            ? "Créateurs ajoutés via « Ajouter le créateur » — ils ont un espace créateur et apparaissent aussi dans Gérer."
            : "Creators added via “Add creator” — they get a creator workspace and appear in Manage too."}
        </p>
      </div>

      <div
        style={{
          border: "1px solid var(--ws-border)",
          borderRadius: 16,
          overflow: "hidden",
          background: "var(--ws-surface)",
        }}
      >
        {loading ? (
          <div style={{ padding: "32px 24px", fontSize: 14, color: "var(--ws-text-dim)" }}>
            {lang === "fr" ? "Chargement..." : "Loading..."}
          </div>
        ) : creators.length === 0 ? (
          <div style={{ padding: "32px 24px", fontSize: 14, color: "var(--ws-text-dim)", lineHeight: 1.5 }}>
            {lang === "fr"
              ? "Aucun créateur pour le moment. Quand un créateur rejoint via votre lien, cliquez sur « Ajouter le créateur » dans le pop-up."
              : "No creators yet. When someone joins via your invite link, click “Add creator” in the popup."}
          </div>
        ) : (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
              <thead>
                <tr>
                  {(lang === "fr"
                    ? ["Créateur", "Plateforme", "Commission", "Code promo", "Rejoint le", "Action"]
                    : ["Creator", "Platform", "Commission", "Promo code", "Joined", "Action"]
                  ).map((label) => (
                    <th
                      key={label}
                      style={{
                        padding: "14px 20px",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--ws-text)",
                        textAlign: "left",
                        borderBottom: "1px solid var(--ws-border)",
                        background: "var(--ws-surface-2)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {creators.map((creator) => {
                  const displayName = creator.full_name?.trim() || `@${creator.handle}`;
                  return (
                    <tr key={creator.id}>
                      <td style={{ padding: "14px 20px", fontSize: 14, borderBottom: "1px solid var(--ws-border)", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 180 }}>
                          <CreatorAvatar
                            src={creator.avatar_url}
                            username={creator.handle}
                            displayName={displayName}
                            size={40}
                            alt={displayName}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 500, letterSpacing: "-0.01em", color: "var(--ws-text)" }}>{displayName}</div>
                            <div style={{ fontSize: 13, color: "var(--ws-text-dim)" }}>@{creator.handle}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "14px 20px", fontSize: 14, borderBottom: "1px solid var(--ws-border)", verticalAlign: "middle" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <PlatformBrandIcon platform={creator.platform ?? "tiktok"} size={20} />
                          {platformLabel(creator.platform)}
                        </span>
                      </td>
                      <td style={{ padding: "14px 20px", fontSize: 14, borderBottom: "1px solid var(--ws-border)", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                        {creator.commission_rate != null ? `${creator.commission_rate}%` : "—"}
                      </td>
                      <td style={{ padding: "14px 20px", fontSize: 14, borderBottom: "1px solid var(--ws-border)", verticalAlign: "middle" }}>
                        {creator.discount_code ? (
                          <span style={{ display: "inline-flex", background: "var(--ws-bg)", border: "1px solid var(--ws-border)", borderRadius: 8, padding: "5px 10px", fontSize: 13, fontWeight: 500 }}>
                            {creator.discount_code}
                          </span>
                        ) : (
                          <span style={{ color: "var(--ws-text-dim)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "14px 20px", fontSize: 14, color: "var(--ws-text-muted)", borderBottom: "1px solid var(--ws-border)", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                        {formatJoinedDate(creator.joined_at, lang)}
                      </td>
                      <td style={{ padding: "14px 20px", fontSize: 14, borderBottom: "1px solid var(--ws-border)", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          onClick={() => setDeactivateTarget(creator)}
                          style={{
                            background: "var(--ws-surface)",
                            color: "var(--ws-text)",
                            border: "1px solid var(--ws-btn)",
                            borderRadius: 8,
                            padding: "8px 14px",
                            fontSize: 13,
                            fontWeight: 500,
                            fontFamily: "inherit",
                            cursor: "pointer",
                            letterSpacing: "-0.01em",
                          }}
                        >
                          {lang === "fr" ? "Désactiver" : "Deactivate"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deactivateTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: 20,
          }}
          onClick={() => !deactivating && setDeactivateTarget(null)}
        >
          <div
            role="dialog"
            aria-modal
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--ws-surface)",
              borderRadius: 16,
              border: "1px solid var(--ws-border)",
              padding: "28px 28px 24px",
              maxWidth: 420,
              width: "100%",
              boxShadow: "0 24px 48px rgba(0,0,0,0.1)",
            }}
          >
            <h3 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.03em" }}>
              {lang === "fr" ? "Supprimer le compte créateur ?" : "Delete creator account?"}
            </h3>
            <p style={{ margin: "0 0 24px", fontSize: 14, color: "var(--ws-text-muted)", lineHeight: 1.5 }}>
              {lang === "fr" ? (
                <>
                  Le compte de{" "}
                  <strong style={{ color: "var(--ws-text)" }}>
                    {deactivateTarget.full_name?.trim() || `@${deactivateTarget.handle}`}
                  </strong>{" "}
                  sera définitivement supprimé. Il n&apos;aura plus accès à Trackit et sera retiré de Gérer et de cette liste.
                </>
              ) : (
                <>
                  <strong style={{ color: "var(--ws-text)" }}>
                    {deactivateTarget.full_name?.trim() || `@${deactivateTarget.handle}`}
                  </strong>
                  &apos;s account will be permanently deleted. They will lose access to Trackit and be removed from Manage and this list.
                </>
              )}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                disabled={deactivating}
                onClick={() => setDeactivateTarget(null)}
                style={{
                  background: "var(--ws-surface)",
                  color: "var(--ws-text)",
                  border: "1px solid var(--ws-border)",
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontSize: 14,
                  fontWeight: 500,
                  fontFamily: "inherit",
                  cursor: deactivating ? "default" : "pointer",
                }}
              >
                {lang === "fr" ? "Annuler" : "Cancel"}
              </button>
              <button
                type="button"
                disabled={deactivating}
                onClick={() => void confirmDeactivate()}
                style={{
                  background: "var(--ws-surface)",
                  color: "var(--ws-text)",
                  border: "1px solid var(--ws-btn)",
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: deactivating ? "wait" : "pointer",
                }}
              >
                {deactivating
                  ? lang === "fr"
                    ? "Suppression…"
                    : "Deleting…"
                  : lang === "fr"
                    ? "Supprimer"
                    : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
