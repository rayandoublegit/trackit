"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useDisplayCurrency } from "@/lib/useCurrency";
import { supabase } from "@/lib/supabase";
import { CreatorAvatar } from "./CreatorAvatar";
import { useDashboardNavigation } from "./DashboardNavigationProvider";
import {
  COMMISSION_NOT_CONFIGURED_CODE,
  commissionNotConfiguredMessage,
  commissionRateFromDiscoverySnapshot,
  normalizeCreatorHandle,
} from "@/lib/managed-creator-commission";
import { parseCommissionRate } from "@/lib/creator-crm";
import { avatarFromDiscoverySavedRow, buildAvatarByHandleFromSavedRows } from "@/lib/creator-avatar";
import { enrichCreatorsWithAvatars } from "@/lib/enrich-creator-avatars";
import { prefetchCreatorAvatars } from "@/lib/avatar-url-cache";
import { notifySaleRecorded } from "@/lib/notifications-storage";
import { primeNotificationSound } from "@/lib/notification-sound";
import { toDayKey } from "@/lib/analytics-periods";
import { FREE_MAX_MANUAL_SALES } from "@/lib/plan-limits";
import {
  selectionAccentText,
  selectionCardStyle,
  selectionTextPrimary,
  selectionTextSecondary,
} from "@/lib/selection-card-styles";

type SaleCreator = {
  id: string;
  handle: string;
  full_name?: string;
  avatar_url?: string;
  commission_rate?: number | null;
};

type AddSaleCampaignOption = { id: string; name: string };

type AddSaleCampaignScope = {
  id: string;
  name: string;
  creatorIds?: string[];
  commissionRate?: string | number;
};

const drawerFont = "'InterDisplay', 'Inter Display', sans-serif";

const fieldInput: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "14px 16px",
  borderRadius: 10,
  border: "1px solid #D1D5DB",
  fontSize: 15,
  fontFamily: "inherit",
  color: "#1A1A1A",
  letterSpacing: "-0.02em",
  background: "#FFF",
  outline: "none",
};

const dateInput: React.CSSProperties = {
  ...fieldInput,
  minHeight: 48,
  cursor: "pointer",
};

const drawerBtnPrimary: React.CSSProperties = {
  fontFamily: drawerFont,
  letterSpacing: "-0.02em",
  fontSize: 14,
  borderRadius: 8,
  fontWeight: 600,
  color: "#FFF",
  background: "#1A1A1A",
  border: "none",
  padding: "11px 16px",
  cursor: "pointer",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: "#1A1A1A",
  marginBottom: 14,
  letterSpacing: "-0.02em",
};

export function AddSalePanel({
  open,
  onClose,
  lang,
  userId,
  campaign,
  campaigns,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  lang: "en" | "fr";
  userId?: string;
  /** When set, only campaign creators are listed and the sale is linked to this campaign. */
  campaign?: AddSaleCampaignScope;
  /** Optional campaign picker (brand analytics). Ignored when `campaign` is set. */
  campaigns?: AddSaleCampaignOption[];
  onSuccess?: (saleDate?: string) => void | Promise<void>;
}) {
  const { navigate } = useDashboardNavigation();
  const [shown, setShown] = useState(false);
  const [creators, setCreators] = useState<SaleCreator[]>([]);
  const [commissionByCreatorId, setCommissionByCreatorId] = useState<Record<string, number>>({});
  const [loadingCreators, setLoadingCreators] = useState(false);
  const [creatorId, setCreatorId] = useState("");
  const [amount, setAmount] = useState("");
  const [saleDate, setSaleDate] = useState(() => toDayKey(new Date()));
  const [campaignId, setCampaignId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [manualSalesUsed, setManualSalesUsed] = useState<number | null>(null);

  const amountCurrency = useDisplayCurrency();
  const selectedCommission = creatorId ? commissionByCreatorId[creatorId] : undefined;
  const hasSelectedCommission = selectedCommission != null;
  const canSubmit = Boolean(creatorId && amount && !submitting && hasSelectedCommission);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setSaleDate(new Date().toISOString().slice(0, 10));
    setCampaignId(campaign?.id ?? "");
    setMessage("");
    setMessageTone("error");
  }, [open, campaign?.id]);

  useEffect(() => {
    if (!open || !supabase) {
      setManualSalesUsed(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      let resolvedUserId = userId;
      if (!resolvedUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        resolvedUserId = user?.id;
      }
      if (!resolvedUserId || cancelled) return;
      const { data } = await supabase
        .from("sales")
        .select("shopify_order_id, shop_domain")
        .eq("user_id", resolvedUserId)
        .or("shop_domain.eq.manual,shopify_order_id.like.manual_%");
      if (cancelled) return;
      const used = (data ?? []).filter((row) => {
        const orderId = String(row.shopify_order_id || "");
        return !orderId.startsWith("manual_demo_") && !orderId.startsWith("demo_");
      }).length;
      setManualSalesUsed(used);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const load = async () => {
      setLoadingCreators(true);
      setCreators([]);
      setCommissionByCreatorId({});
      setCreatorId("");

      try {
        let resolvedUserId = userId;
        if (!resolvedUserId && supabase) {
          const { data: { user } } = await supabase.auth.getUser();
          resolvedUserId = user?.id;
        }
        if (!resolvedUserId) {
          if (!cancelled) setLoadingCreators(false);
          return;
        }

        const commissionByHandle = new Map<string, number>();
        let savedRows: { creator_username?: string; avatar_url?: string; snapshot?: unknown }[] = [];

        if (supabase) {
          const { data } = await supabase
            .from("discovery_saved")
            .select("creator_username, avatar_url, snapshot")
            .eq("user_id", resolvedUserId);
          savedRows = data ?? [];
        } else {
          const savedRes = await fetch("/api/saved", { cache: "no-store" });
          if (savedRes.ok) {
            const savedData = await savedRes.json();
            savedRows = savedData.rows ?? [];
          }
        }

        for (const row of savedRows) {
          const rate = commissionRateFromDiscoverySnapshot(row.snapshot);
          if (rate != null) {
            commissionByHandle.set(normalizeCreatorHandle(String(row.creator_username || "")), rate);
          }
        }

        let rows: SaleCreator[] = [];

        if (campaign?.creatorIds?.length) {
          if (!supabase) {
            if (!cancelled) setLoadingCreators(false);
            return;
          }
          const { data } = await supabase
            .from("creators")
            .select("id, handle, full_name, avatar_url, commission_rate")
            .eq("user_id", resolvedUserId)
            .in("id", campaign.creatorIds);
          rows = (data || []) as SaleCreator[];
          const avatarByHandle = buildAvatarByHandleFromSavedRows(savedRows);
          rows = enrichCreatorsWithAvatars(rows, avatarByHandle);
        } else {
          const creatorsRes = await fetch(`/api/creators-list?userId=${resolvedUserId}`);
          const data = await creatorsRes.json();
          rows = ((data.creators || data || []) as SaleCreator[]).map((c) => {
            const saved = savedRows.find(
              (row) =>
                normalizeCreatorHandle(String(row.creator_username || "")) ===
                normalizeCreatorHandle(String(c.handle || "")),
            );
            const avatar = saved ? avatarFromDiscoverySavedRow(saved) : c.avatar_url;
            return { ...c, avatar_url: avatar || c.avatar_url };
          });
        }

        if (cancelled) return;

        const commissionMap: Record<string, number> = {};
        const campaignDefaultRate = parseCommissionRate(campaign?.commissionRate) ?? 10;
        for (const creator of rows) {
          const fromCrm = commissionByHandle.get(normalizeCreatorHandle(creator.handle || ""));
          const fromCreator = parseCommissionRate(creator.commission_rate);
          commissionMap[creator.id] = fromCrm ?? fromCreator ?? campaignDefaultRate;
        }

        setCreators(rows);
        prefetchCreatorAvatars(rows.map((c) => ({ username: c.handle, avatarUrl: c.avatar_url })));
        setCommissionByCreatorId(commissionMap);
        if (rows[0]?.id) setCreatorId(rows[0].id);
      } catch {
        if (!cancelled) {
          setMessage(lang === "fr" ? "Impossible de charger vos créateurs" : "Could not load your creators");
          setMessageTone("error");
        }
      } finally {
        if (!cancelled) setLoadingCreators(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [campaign?.commissionRate, campaign?.creatorIds, lang, open, userId]);

  const submit = async () => {
    if (!creatorId || !amount || submitting) return;
    primeNotificationSound();
    setSubmitting(true);
    setMessage("");

    try {
      let resolvedUserId = userId;
      if (!resolvedUserId && supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        resolvedUserId = user?.id;
      }
      if (!resolvedUserId) {
        setMessageTone("error");
        setMessage(lang === "fr" ? "Session expirée." : "Session expired.");
        setSubmitting(false);
        return;
      }

      const resolvedCampaignId = campaign?.id || campaignId || undefined;

      const res = await fetch("/api/sales/manual", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: resolvedUserId,
          creatorId,
          amount,
          date: saleDate || undefined,
          campaignId: resolvedCampaignId,
          tzOffset: new Date().getTimezoneOffset(),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        errorFr?: string;
        code?: string;
        commissionAmount?: number;
      };

      if (data.ok) {
        const selectedCreator = creators.find((c) => c.id === creatorId);
        const creatorName =
          selectedCreator?.full_name?.trim() ||
          selectedCreator?.handle?.trim() ||
          (lang === "fr" ? "un créateur" : "a creator");
        const orderTotal = Number.parseFloat(amount) || 0;
        notifySaleRecorded(lang, creatorName, orderTotal, data.commissionAmount ?? 0, resolvedUserId);
        setSubmitting(false);
        await onSuccess?.(saleDate || undefined);
        onClose();
        return;
      }

      setMessageTone("error");
      setMessage(
        data.code === COMMISSION_NOT_CONFIGURED_CODE
          ? commissionNotConfiguredMessage(lang)
          : (lang === "fr" ? data.errorFr : undefined) || data.error || (lang === "fr" ? "Échec de l'ajout" : "Failed to add sale"),
      );
    } catch {
      setMessageTone("error");
      setMessage(lang === "fr" ? "Erreur réseau" : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  const salesCounter =
    manualSalesUsed != null
      ? lang === "fr"
        ? `Ventes manuelles : ${manualSalesUsed}/${FREE_MAX_MANUAL_SALES} lifetime`
        : `Manual sales: ${manualSalesUsed}/${FREE_MAX_MANUAL_SALES} lifetime`
      : lang === "fr"
        ? `Plan Free : ${FREE_MAX_MANUAL_SALES} ventes manuelles lifetime`
        : `Free plan: ${FREE_MAX_MANUAL_SALES} manual sales lifetime`;

  const subtitle = campaign
    ? lang === "fr"
      ? `Campagne « ${campaign.name} » — la commission est calculée automatiquement. ${salesCounter}.`
      : `Campaign "${campaign.name}" — commission is calculated automatically. ${salesCounter}.`
    : lang === "fr"
      ? `Enregistrez une vente générée par un créateur. La commission est calculée automatiquement. ${salesCounter}.`
      : `Record a sale driven by a creator. Commission is calculated automatically. ${salesCounter}.`;

  return createPortal(
    <div
      onClick={() => {
        if (!submitting) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 1200,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          height: "100%",
          background: "#FFF",
          overflowY: "auto",
          transform: shown ? "translateX(0)" : "translateX(40px)",
          opacity: shown ? 1 : 0,
          transition: "transform .18s ease, opacity .18s ease",
          padding: "28px 28px 56px",
          boxSizing: "border-box",
          fontFamily: drawerFont,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 12 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: "none",
              border: "none",
              color: "#9A9A9A",
              fontWeight: 500,
              fontSize: 14,
              cursor: submitting ? "default" : "pointer",
              padding: 0,
              fontFamily: "inherit",
              letterSpacing: "-0.02em",
            }}
          >
            {lang === "fr" ? "Retour" : "Back"}
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            style={{
              ...drawerBtnPrimary,
              opacity: canSubmit ? 1 : 0.45,
              cursor: canSubmit ? "pointer" : "default",
            }}
          >
            {submitting
              ? lang === "fr"
                ? "Ajout…"
                : "Adding…"
              : lang === "fr"
                ? "Ajouter la vente"
                : "Add sale"}
          </button>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px", letterSpacing: "-0.03em" }}>
          {lang === "fr" ? "Ajouter une vente" : "Add a sale"}
        </h2>
        <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 28px", lineHeight: 1.5, letterSpacing: "-0.02em" }}>
          {subtitle}
        </p>

        {loadingCreators ? (
          <p style={{ fontSize: 14, color: "#9A9A9A" }}>{lang === "fr" ? "Chargement des créateurs…" : "Loading creators…"}</p>
        ) : creators.length === 0 ? (
          <div>
            <p style={{ fontSize: 15, color: "#6B7280", margin: "0 0 20px", lineHeight: 1.5 }}>
              {campaign
                ? lang === "fr"
                  ? "Ajoutez d'abord des créateurs à cette campagne avant d'enregistrer une vente."
                  : "Add creators to this campaign before recording a sale."
                : lang === "fr"
                  ? "Ajoutez d'abord des créateurs dans Find it → Gérer."
                  : "Add creators in Find it → Manage first."}
            </p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 28 }}>
              <div style={sectionTitle}>{lang === "fr" ? "Créateur" : "Creator"}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {creators.map((creator) => {
                  const selected = creatorId === creator.id;
                  const commission = commissionByCreatorId[creator.id];
                  return (
                    <button
                      key={creator.id}
                      type="button"
                      onClick={() => setCreatorId(creator.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        width: "100%",
                        textAlign: "left",
                        padding: "12px 14px",
                        borderRadius: 10,
                        ...selectionCardStyle(selected),
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      <CreatorAvatar
                        src={creator.avatar_url}
                        username={creator.handle}
                        displayName={creator.full_name}
                        size={36}
                        alt={creator.full_name || creator.handle}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: selectionTextPrimary(selected) }}>
                          {creator.full_name || creator.handle || "—"}
                        </div>
                        {creator.handle ? (
                          <div style={{ fontSize: 13, color: selectionTextSecondary(selected) }}>
                            @{creator.handle.replace(/^@/, "")}
                          </div>
                        ) : null}
                      </div>
                      {commission != null ? (
                        <span style={{ fontSize: 13, fontWeight: 600, color: selected ? "#FFFFFF" : "#1A1A1A", whiteSpace: "nowrap" }}>
                          {commission}%
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: selectionAccentText(selected), whiteSpace: "nowrap" }}>
                          {lang === "fr" ? "Commission manquante" : "No commission"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {creatorId && !hasSelectedCommission ? (
              <div
                style={{
                  marginBottom: 24,
                  padding: "14px 16px",
                  borderRadius: 10,
                  border: "1px solid #EFEFEF",
                  background: "#FFFFFF",
                }}
              >
                <p style={{ fontSize: 14, color: "#1A1A1A", margin: "0 0 12px", lineHeight: 1.5 }}>
                  {commissionNotConfiguredMessage(lang)}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate({ view: "creators" });
                  }}
                  style={{
                    border: "none",
                    background: "#0047FF",
                    color: "#FFFFFF",
                    borderRadius: 8,
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {lang === "fr" ? "Ouvrir Find it → Gérer" : "Open Find it → Manage"}
                </button>
              </div>
            ) : null}

            {!campaign && campaigns && campaigns.length > 0 ? (
              <div style={{ marginBottom: 24 }}>
                <div style={sectionTitle}>{lang === "fr" ? "Campagne (optionnel)" : "Campaign (optional)"}</div>
                <select
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                  style={fieldInput}
                >
                  <option value="">{lang === "fr" ? "Aucune campagne" : "No campaign"}</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.id}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div style={{ marginBottom: 24 }}>
              <div style={sectionTitle}>
                {lang === "fr" ? `Montant de la commande (${amountCurrency})` : `Order amount (${amountCurrency})`}
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={lang === "fr" ? "149,90" : "149.90"}
                style={fieldInput}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={sectionTitle}>{lang === "fr" ? "Date de la vente" : "Sale date"}</div>
              <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} style={dateInput} />
            </div>

            {message ? (
              <p
                style={{
                  fontSize: 14,
                  color: messageTone === "success" ? "#1A1A1A" : "#C0392B",
                  margin: "0 0 20px",
                  lineHeight: 1.5,
                }}
              >
                {message}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
