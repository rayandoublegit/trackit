"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import type { PlanTier } from "@/lib/plan-limits";
import { getCampaignCreatorLinks, getCampaigns } from "@/lib/db";
import { CampaignLinksTab } from "./CampaignLinksTab";

type CampaignOption = { id: string; name: string };

const ALL = "";

export function AffiliateLinksView({
  userId,
  isMobile,
  plan = "free",
  onUpgrade,
}: {
  userId?: string;
  isMobile?: boolean;
  plan?: PlanTier;
  onUpgrade?: () => void;
}) {
  const lang = useLang();
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [campaignId, setCampaignId] = useState(ALL);
  const [creatorIdsByCampaign, setCreatorIdsByCampaign] = useState<Record<string, string[]>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) {
      setCampaigns([]);
      setCreatorIdsByCampaign({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const [rows, links] = await Promise.all([
        getCampaigns(userId),
        getCampaignCreatorLinks(userId),
      ]);
      if (cancelled) return;
      const list = (rows || [])
        .map((r: { id?: string; name?: string }) => ({
          id: String(r.id || ""),
          name: String(r.name || "Campaign"),
        }))
        .filter((r) => r.id);
      setCampaigns(list);

      const byCampaign: Record<string, string[]> = {};
      for (const link of links) {
        const cid = String(link.campaign_id || "");
        const creatorId = String(link.creator_id || "");
        if (!cid || !creatorId) continue;
        if (!byCampaign[cid]) byCampaign[cid] = [];
        if (!byCampaign[cid].includes(creatorId)) byCampaign[cid].push(creatorId);
      }
      setCreatorIdsByCampaign(byCampaign);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  const selectedLabel = useMemo(() => {
    if (!campaignId) return lang === "fr" ? "Toutes les campagnes" : "All campaigns";
    return campaigns.find((c) => c.id === campaignId)?.name || (lang === "fr" ? "Campagne" : "Campaign");
  }, [campaignId, campaigns, lang]);

  const campaignCreatorIds = campaignId ? creatorIdsByCampaign[campaignId] ?? [] : [];

  return (
    <div
      style={{
        padding: isMobile ? "16px 16px 24px" : "40px 40px 48px",
        background: "var(--ws-bg)",
        minHeight: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          marginBottom: isMobile ? 20 : 28,
          display: "flex",
          alignItems: isMobile ? "stretch" : "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexDirection: isMobile ? "column" : "row",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1
            style={{
              margin: 0,
              fontSize: isMobile ? 24 : 28,
              fontWeight: 600,
              color: "var(--ws-text)",
              letterSpacing: "-0.03em",
            }}
          >
            {lang === "fr" ? "Liens" : "Links"}
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 14,
              color: "var(--ws-text-muted)",
              letterSpacing: "-0.01em",
              maxWidth: 520,
              lineHeight: 1.45,
            }}
          >
            {lang === "fr"
              ? "Générez et suivez vos liens d'affiliation : clics, visiteurs uniques et sources."
              : "Generate and track affiliate links — clicks, unique visitors, and sources."}
          </p>
        </div>

        <div ref={menuRef} style={{ position: "relative", flexShrink: 0, alignSelf: isMobile ? "stretch" : "center" }}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              width: isMobile ? "100%" : "auto",
              minWidth: isMobile ? undefined : 220,
              maxWidth: isMobile ? undefined : 280,
              background: "var(--ws-surface)",
              border: "1px solid var(--ws-border)",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--ws-text)",
              letterSpacing: "-0.01em",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selectedLabel}
            </span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              aria-hidden
              style={{
                flexShrink: 0,
                transform: menuOpen ? "rotate(180deg)" : "none",
                transition: "transform 0.15s ease",
                color: "var(--ws-text-muted)",
              }}
            >
              <path
                d="M2 3.5L5 6.5L8 3.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {menuOpen ? (
            <div
              role="listbox"
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                left: isMobile ? 0 : "auto",
                minWidth: isMobile ? undefined : 240,
                maxHeight: 320,
                overflowY: "auto",
                background: "var(--ws-surface)",
                border: "1px solid var(--ws-border)",
                borderRadius: 12,
                boxShadow: "var(--ws-shadow)",
                padding: 6,
                zIndex: 50,
              }}
            >
              <button
                type="button"
                role="option"
                aria-selected={!campaignId}
                onClick={() => {
                  setCampaignId(ALL);
                  setMenuOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: !campaignId ? "var(--ws-hover)" : "transparent",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 10px",
                  fontSize: 13,
                  color: "var(--ws-text)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {lang === "fr" ? "Toutes les campagnes" : "All campaigns"}
              </button>
              {campaigns.map((c) => {
                const active = c.id === campaignId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setCampaignId(c.id);
                      setMenuOpen(false);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      background: active ? "var(--ws-hover)" : "transparent",
                      border: "none",
                      borderRadius: 8,
                      padding: "9px 10px",
                      fontSize: 13,
                      color: "var(--ws-text)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <CampaignLinksTab
        key={campaignId || "all"}
        lang={lang}
        brandId={userId}
        campaignId={campaignId || undefined}
        campaignCreatorIds={campaignCreatorIds}
        isMobile={isMobile}
        plan={plan}
        onUpgrade={onUpgrade}
      />
    </div>
  );
}
