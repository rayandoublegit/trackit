"use client";

import { useEffect, useMemo, useState } from "react";
import { saveCampaign, getCampaigns, getSavedCreators, updateCampaignStatus, updateCampaign, getCampaignCreatorCounts, syncCampaignCreators } from "@/lib/db";
import { CreatorAvatar } from "./CreatorAvatar";
import { notifyCampaignCreated } from "@/lib/notifications-storage";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import {
  getMaxActiveCampaigns,
  hasReachedCampaignLimit,
  type PlanTier,
} from "@/lib/plan-limits";
import { computeTrend, formatTrendLabel, isWithinPeriod, type PeriodTrend } from "@/lib/analytics-periods";
import { formatCurrency } from "@/lib/useCurrency";
import { UpgradeModal } from "./UpgradeModal";

type CampaignStatus = "Active" | "Paused" | "Completed" | "Draft";
type CampaignFilter = "all" | "active" | "paused" | "completed";
type DetailTab = "creators" | "outreach" | "sales" | "payouts" | "settings";

type Campaign = {
  id: string;
  name: string;
  creators: number;
  platform: string;
  sales: number;
  commission: number;
  status: CampaignStatus;
  start: string;
  end: string;
  startRaw?: string;
  endRaw?: string;
  description?: string;
  commissionType?: string;
  commissionRate?: number;
  autoPayout?: boolean;
  creatorIds?: string[];
};

type SavedCreatorOption = {
  id: string;
  handle: string;
  full_name?: string;
  avatar_url?: string;
  platform?: string;
};

type SaleRow = { order_amount?: number; commission_amount?: number; created_at?: string };
type CreatorBalanceRow = { balance?: number };

type CampaignKpiStats = {
  activeCount: number;
  endingThisMonth: number;
  totalCreators: number;
  totalCampaigns: number;
  totalSales: number;
  totalCommissionOwed: number;
  pendingPayouts: number;
  salesTrend: PeriodTrend;
};

function normalizeCampaignStatus(status: string): CampaignStatus {
  const s = (status || "").toLowerCase();
  if (s === "active") return "Active";
  if (s === "paused") return "Paused";
  if (s === "completed") return "Completed";
  return "Draft";
}

function formatCampaignDate(value: unknown): string {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function parseCampaignDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  return null;
}

function isEndingThisMonth(dateStr: string | undefined, now = new Date()): boolean {
  const d = parseCampaignDate(dateStr);
  if (!d) return false;
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function mapDbCampaign(row: Record<string, unknown>, creatorIds?: string[]): Campaign {
  const startRaw = row.start_date ? String(row.start_date) : undefined;
  const endRaw = row.end_date ? String(row.end_date) : undefined;
  const ids = creatorIds ?? (Array.isArray(row.creator_ids) ? row.creator_ids.map(String) : undefined);
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    creators: ids?.length ?? Number(row.creators ?? 0),
    platform: String(row.platform ?? ""),
    sales: Number(row.sales ?? 0),
    commission: Number(row.commission ?? 0),
    status: normalizeCampaignStatus(String(row.status ?? "draft")),
    start: formatCampaignDate(startRaw),
    end: formatCampaignDate(endRaw),
    startRaw,
    endRaw,
    description: typeof row.description === "string" ? row.description : undefined,
    commissionType: String(row.commission_type ?? "percentage"),
    commissionRate: Number(row.commission_rate ?? 10),
    autoPayout: Boolean(row.auto_payout ?? false),
    creatorIds: ids,
  };
}

// Clamp a commission rate string to a sane 0-100 range. Returns a number.
function clampRate(raw: string, fallback = 10): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

// Normalize a free-text date entry to an ISO date (YYYY-MM-DD), or undefined if unparseable.
// Accepts "May 1, 2026", "2026-05-01", "01/05/2026", etc. Rejects junk like "22" or "020".
function normalizeDate(raw: string | undefined): string | undefined {
  const s = (raw || "").trim();
  if (!s) return undefined;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return undefined;
  // Guard against partial inputs the Date constructor over-accepts (e.g. a bare "22").
  if (!/[a-zA-Z]/.test(s) && !/\d{4}/.test(s)) return undefined;
  return parsed.toISOString().split("T")[0];
}

function mapSavedCreator(row: Record<string, unknown>): SavedCreatorOption {
  return {
    id: String(row.id ?? ""),
    handle: String(row.handle ?? row.username ?? ""),
    full_name: typeof row.full_name === "string" ? row.full_name : undefined,
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : undefined,
    platform: typeof row.platform === "string" ? row.platform : undefined,
  };
}

function computeCampaignKpis(
  campaigns: Campaign[],
  sales: SaleRow[],
  creators: CreatorBalanceRow[],
  now = new Date(),
): CampaignKpiStats {
  const activeCampaigns = campaigns.filter((c) => c.status === "Active");
  const activeCount = activeCampaigns.length;
  const endingThisMonth = activeCampaigns.filter((c) => isEndingThisMonth(c.endRaw ?? c.end, now)).length;
  const totalCreators = creators.length;
  const totalCampaigns = campaigns.length;
  const totalSales = sales.reduce((sum, row) => sum + (Number(row.order_amount) || 0), 0);
  const totalCommissionOwed = creators.reduce((sum, row) => sum + (Number(row.balance) || 0), 0);
  const pendingPayouts = creators.filter((row) => (Number(row.balance) || 0) > 0).length;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const prevMonthEnd = new Date(monthStart);
  prevMonthEnd.setDate(0);
  prevMonthEnd.setHours(23, 59, 59, 999);
  const prevMonthStart = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), 1);

  const sumSalesInPeriod = (start: Date, end: Date) =>
    sales
      .filter((row) => isWithinPeriod(row.created_at, start, end))
      .reduce((sum, row) => sum + (Number(row.order_amount) || 0), 0);

  const salesTrend = computeTrend(sumSalesInPeriod(monthStart, monthEnd), sumSalesInPeriod(prevMonthStart, prevMonthEnd));

  return {
    activeCount,
    endingThisMonth,
    totalCreators,
    totalCampaigns,
    totalSales,
    totalCommissionOwed,
    pendingPayouts,
    salesTrend,
  };
}

function formatEndingSub(count: number, lang: "en" | "fr"): string {
  if (count === 0) return lang === "fr" ? "Aucune ne se termine ce mois" : "None ending this month";
  if (count === 1) return lang === "fr" ? "1 se termine ce mois" : "1 ending this month";
  return lang === "fr" ? `${count} se terminent ce mois` : `${count} ending this month`;
}

function formatCreatorsSub(campaignCount: number, lang: "en" | "fr"): string {
  if (campaignCount === 0) return lang === "fr" ? "Aucune campagne" : "No campaigns yet";
  if (campaignCount === 1) return lang === "fr" ? "sur 1 campagne" : "across 1 campaign";
  return lang === "fr" ? `sur ${campaignCount} campagnes` : `across ${campaignCount} campaigns`;
}

function formatSalesTrendSub(trend: PeriodTrend, lang: "en" | "fr"): { text: string; color: string } {
  if (trend.current === 0 && trend.previous === 0) {
    return { text: lang === "fr" ? "Aucune vente ce mois" : "No sales this month", color: "#7A7A7A" };
  }
  const label = formatTrendLabel(trend.changePct, lang);
  const arrow = trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→";
  const color = trend.direction === "up" ? "#2E7D32" : trend.direction === "down" ? "#E53935" : "#7A7A7A";
  return {
    text: lang === "fr" ? `vs mois dernier ${label} ${arrow}` : `vs last month ${label} ${arrow}`,
    color,
  };
}

function formatPendingPayoutsSub(count: number, lang: "en" | "fr"): string {
  if (count === 0) return lang === "fr" ? "Aucun paiement en attente" : "No pending payouts";
  if (count === 1) return lang === "fr" ? "1 paiement en attente" : "1 pending payout";
  return lang === "fr" ? `${count} paiements en attente` : `${count} pending payouts`;
}

function EmptyTableRow({ lang, colSpan }: { lang: "en" | "fr"; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: "32px 14px", textAlign: "center", color: "#9A9A9A", fontSize: 13 }}>
        {lang === "fr" ? "Aucune donnée pour le moment." : "No data yet."}
      </td>
    </tr>
  );
}

const btnPrimary: React.CSSProperties = {
  background: "#0047FF", color: "#FFF", border: "none", borderRadius: 10,
  padding: "10px 18px", fontSize: 13, fontWeight: 500, fontFamily: "inherit",
  cursor: "pointer", letterSpacing: "-0.02em",
};
const btnSecondary: React.CSSProperties = {
  background: "#FFF", color: "#1A1A1A", border: "1px solid #E5E5E5", borderRadius: 10,
  padding: "10px 16px", fontSize: 13, fontWeight: 500, fontFamily: "inherit",
  cursor: "pointer", letterSpacing: "-0.02em",
};
const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10,
  border: "1px solid #E5E5E5", fontSize: 14, fontFamily: "inherit", color: "#1A1A1A",
  letterSpacing: "-0.02em", background: "#FFF",
};

function campaignStatusLabel(status: string, lang: "en" | "fr"): string {
  const labels: Record<string, { en: string; fr: string }> = {
    Active: { en: "Active", fr: "Actif" },
    Paused: { en: "Paused", fr: "En pause" },
    Completed: { en: "Completed", fr: "Terminé" },
    Draft: { en: "Draft", fr: "Brouillon" },
  };
  return labels[status]?.[lang] ?? labels[status]?.en ?? status;
}

export function CampaignsView({
  plan,
  onUpgrade,
  onUpgradePro,
  onUpgradeScale,
  isMobile,
  userId,
}: {
  plan: PlanTier;
  onUpgrade: () => void;
  onUpgradePro?: () => void;
  onUpgradeScale?: () => void;
  isMobile?: boolean;
  userId?: string;
}) {
  const lang = useLang();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [creators, setCreators] = useState<CreatorBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CampaignFilter>("all");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editCampaignId, setEditCampaignId] = useState<string | null>(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  const tryOpenNewCampaign = () => {
    if (plan === "free") {
      alert(lang === "fr" ? "Les campagnes sont disponibles à partir du plan Growth." : "Campaigns are available on the Growth plan and above.");
      return;
    }
    if (hasReachedCampaignLimit(plan, campaigns.length)) {
      setUpgradeModalOpen(true);
      return;
    }
    setModalOpen(true);
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      if (!supabase) {
        if (!cancelled) setLoading(false);
        return;
      }

      let resolvedUserId = userId;
      if (!resolvedUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoading(false);
          return;
        }
        resolvedUserId = user.id;
      }

      try {
        const [campaignData, salesResult, creatorsResult, creatorCounts] = await Promise.all([
          getCampaigns(resolvedUserId),
          supabase.from("sales").select("order_amount, commission_amount, created_at").eq("user_id", resolvedUserId),
          supabase.from("creators").select("balance").eq("user_id", resolvedUserId),
          getCampaignCreatorCounts(resolvedUserId),
        ]);
        if (cancelled) return;
        setCampaigns(
          campaignData.map((row) =>
            mapDbCampaign(row as Record<string, unknown>, creatorCounts[String(row.id)] ?? []),
          ),
        );
        setSales(salesResult.data || []);
        setCreators(creatorsResult.data || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const kpiStats = useMemo(
    () => computeCampaignKpis(campaigns, sales, creators),
    [campaigns, sales, creators],
  );

  const handleCreateCampaign = async (campaignData: any) => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const saved = await saveCampaign(user.id, {
      name: campaignData.name,
      description: campaignData.description,
      platform: campaignData.platform,
      start_date: campaignData.startDate,
      end_date: campaignData.endDate,
      commission_type: campaignData.commissionType || "percentage",
      commission_rate: campaignData.commissionRate || 10,
      auto_payout: campaignData.autoPayout || false,
      status: "active",
    });
    if (saved) {
      setCampaigns((prev) => [mapDbCampaign(saved as Record<string, unknown>, []), ...prev]);
      notifyCampaignCreated(lang, campaignData.name || (lang === "fr" ? "Nouvelle campagne" : "New campaign"));
    }
    setModalOpen(false);
  };

  const handleStatusChange = async (campaignId: string, status: CampaignStatus) => {
    await updateCampaignStatus(campaignId, status.toLowerCase());
    setCampaigns((list) => list.map((c) => (c.id === campaignId ? { ...c, status } : c)));
  };

  const handleUpdateCampaign = async (campaignId: string, campaignData: {
    name: string;
    description?: string;
    platform: string;
    startDate?: string;
    endDate?: string;
    commissionType: string;
    commissionRate: number;
    autoPayout: boolean;
    creatorIds: string[];
  }) => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const updated = await updateCampaign(campaignId, {
      name: campaignData.name,
      description: campaignData.description,
      platform: campaignData.platform,
      start_date: campaignData.startDate,
      end_date: campaignData.endDate,
      commission_type: campaignData.commissionType,
      commission_rate: campaignData.commissionRate,
      auto_payout: campaignData.autoPayout,
    });
    if (!updated) return;

    await syncCampaignCreators(user.id, campaignId, campaignData.creatorIds);
    setCampaigns((list) =>
      list.map((c) =>
        c.id === campaignId
          ? {
              ...mapDbCampaign(updated as Record<string, unknown>, campaignData.creatorIds),
            }
          : c,
      ),
    );
    setEditCampaignId(null);
  };

  const editingCampaign = editCampaignId ? campaigns.find((c) => c.id === editCampaignId) ?? null : null;

  const selected = campaigns.find((c) => c.id === detailId) ?? null;

  if (selected) {
    return (
      <>
        <CampaignDetail
          isMobile={isMobile}
          lang={lang}
          campaign={selected}
          onBack={() => setDetailId(null)}
          onUpdate={(c) => setCampaigns((list) => list.map((x) => (x.id === c.id ? c : x)))}
          onStatusChange={handleStatusChange}
          onEdit={setEditCampaignId}
        />
        {editingCampaign && (
          <EditCampaignModal
            lang={lang}
            campaign={editingCampaign}
            onClose={() => setEditCampaignId(null)}
            onSave={(data) => void handleUpdateCampaign(editingCampaign.id, data)}
          />
        )}
      </>
    );
  }

  if (loading) {
    return (
      <>
        <CampaignsHeader isMobile={isMobile} lang={lang} onNew={tryOpenNewCampaign} showFilters={false} showNewButton={false} />
        <CampaignsLoadingState isMobile={isMobile} lang={lang} />
      </>
    );
  }

  if (campaigns.length === 0) {
    return (
      <>
        <CampaignsHeader isMobile={isMobile} lang={lang} onNew={tryOpenNewCampaign} showFilters={false} showNewButton={false} />
        <div style={{ padding: 80, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px" }}>{lang === "fr" ? "Aucune campagne pour l'instant." : "No campaigns yet."}</h2>
          <p style={{ fontSize: 14, color: "#7A7A7A", margin: "0 0 24px", maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>
            {lang === "fr" ? "Créez votre première campagne pour commencer à suivre les performances et les commissions." : "Create your first campaign to start tracking creator performance and commissions."}
          </p>
          <button type="button" className="hero-cta-glass" onClick={tryOpenNewCampaign}>
            <span style={{ display: "inline-flex", alignItems: "baseline" }}>
              Track it
              <span className="brand-dot" aria-hidden />
            </span>
          </button>
        </div>
        {modalOpen && <NewCampaignModal lang={lang} onClose={() => setModalOpen(false)} onCreate={(data) => void handleCreateCampaign(data)} />}
        {upgradeModalOpen && (
          <CampaignUpgradeModal plan={plan} lang={lang} onClose={() => setUpgradeModalOpen(false)} onUpgrade={onUpgrade} onUpgradePro={onUpgradePro} onUpgradeScale={onUpgradeScale} />
        )}
      </>
    );
  }

  return (
    <>
      <CampaignsHeader isMobile={isMobile} lang={lang} onNew={tryOpenNewCampaign} showFilters />
      <CampaignsList
        isMobile={isMobile}
        lang={lang}
        campaigns={campaigns}
        kpiStats={kpiStats}
        filter={filter}
        setFilter={setFilter}
        search={search}
        setSearch={setSearch}
        onView={setDetailId}
        onDelete={(id) => setCampaigns((l) => l.filter((c) => c.id !== id))}
        onStatusChange={handleStatusChange}
        onEdit={setEditCampaignId}
      />
      {editingCampaign && (
        <EditCampaignModal
          lang={lang}
          campaign={editingCampaign}
          onClose={() => setEditCampaignId(null)}
          onSave={(data) => void handleUpdateCampaign(editingCampaign.id, data)}
        />
      )}
      {modalOpen && <NewCampaignModal lang={lang} onClose={() => setModalOpen(false)} onCreate={(data) => void handleCreateCampaign(data)} />}
      {upgradeModalOpen && (
        <CampaignUpgradeModal plan={plan} lang={lang} onClose={() => setUpgradeModalOpen(false)} onUpgrade={onUpgrade} onUpgradePro={onUpgradePro} onUpgradeScale={onUpgradeScale} />
      )}
    </>
  );
}

function CampaignUpgradeModal({
  plan,
  lang,
  onClose,
  onUpgrade,
  onUpgradePro,
  onUpgradeScale,
}: {
  plan: PlanTier;
  lang: "en" | "fr";
  onClose: () => void;
  onUpgrade: () => void;
  onUpgradePro?: () => void;
  onUpgradeScale?: () => void;
}) {
  const max = getMaxActiveCampaigns(plan);
  const isGrowth = plan === "basic";
  const isPro = plan === "pro";

  const title =
    isGrowth || isPro
      ? lang === "fr"
        ? "Limite de campagnes atteinte"
        : "Campaign limit reached"
      : lang === "fr"
        ? "Créer plus de campagnes"
        : "Upgrade to create more campaigns";

  const description = isPro
    ? lang === "fr"
      ? `Le plan Pro inclut ${max} campagnes actives. Passez à Scale pour des campagnes illimitées.`
      : `Pro includes ${max} active campaigns. Upgrade to Scale for unlimited campaigns.`
    : isGrowth
      ? lang === "fr"
        ? `Le plan Growth inclut ${max} campagnes actives. Passez à Pro pour jusqu'à 15 campagnes.`
        : `Growth includes ${max} active campaigns. Upgrade to Pro for up to 10 campaigns.`
      : lang === "fr"
        ? `Le plan gratuit inclut ${max} campagne. Passez à Growth pour jusqu'à 3 campagnes.`
        : `Free includes ${max} campaign. Upgrade to Growth for up to 3 campaigns.`;

  const planBadge = isPro ? "Scale" : isGrowth ? "Pro" : "Growth";

  const primaryLabel = isPro
    ? lang === "fr"
      ? `Passer à Scale ${formatCurrency(99, lang)}/mois`
      : `Upgrade to Scale ${formatCurrency(99, lang)}/mo`
    : isGrowth
      ? lang === "fr"
        ? `Passer à Pro ${formatCurrency(39, lang)}/mois`
        : `Upgrade to Pro ${formatCurrency(39, lang)}/mo`
      : lang === "fr"
        ? `Passer à Growth ${formatCurrency(19, lang)}/mois`
        : `Upgrade to Growth ${formatCurrency(19, lang)}/mo`;

  return (
    <UpgradeModal
      lang={lang}
      onClose={onClose}
      title={title}
      description={description}
      planBadge={planBadge}
      primaryLabel={primaryLabel}
      onPrimary={() => void (isPro && onUpgradeScale ? onUpgradeScale() : isGrowth && onUpgradePro ? onUpgradePro() : onUpgrade())}
      showAllPlansLink={false}
    />
  );
}

function CampaignsLoadingState({ lang, isMobile }: { lang: "en" | "fr"; isMobile?: boolean }) {
  return (
    <div style={{ padding: isMobile ? "56px 16px 16px" : "24px 40px 40px" }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            style={{
              background: "#FFF",
              border: "1px solid #EFEFEF",
              borderRadius: 16,
              padding: 20,
              minHeight: 108,
            }}
          >
            <div style={{ width: "55%", height: 10, borderRadius: 999, background: "#F0F0F0", marginBottom: 14 }} />
            <div style={{ width: "40%", height: 24, borderRadius: 8, background: "#ECECEC", marginBottom: 10 }} />
            <div style={{ width: "70%", height: 10, borderRadius: 999, background: "#F5F5F5" }} />
          </div>
        ))}
      </div>
      <div
        style={{
          background: "#FFF",
          border: "1px solid #EFEFEF",
          borderRadius: 16,
          padding: "48px 24px",
          textAlign: "center",
          color: "#9A9A9A",
          fontSize: 14,
        }}
      >
        {lang === "fr" ? "Chargement des campagnes…" : "Loading campaigns…"}
      </div>
    </div>
  );
}

function CampaignsHeader({ lang, onNew, showFilters, showNewButton = true, isMobile }: { lang: "en" | "fr"; onNew: () => void; showFilters?: boolean; showNewButton?: boolean; isMobile?: boolean }) {
  return (
    <div style={{ paddingTop: isMobile ? 56 : 40, paddingRight: isMobile ? 16 : 40, paddingBottom: isMobile ? 16 : 20, paddingLeft: isMobile ? 16 : 40, borderBottom: "1px solid #EFEFEF", background: "#FFF" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", margin: 0, letterSpacing: "-0.04em" }}>{lang === "fr" ? "Campagnes" : "Campaigns"}</h1>
        {showNewButton && (
          <button type="button" className="hero-cta-shopify hero-cta-compact" onClick={onNew}>{lang === "fr" ? "+ Nouvelle campagne" : "+ New Campaign"}</button>
        )}
      </div>
    </div>
  );
}

function CampaignsList({ lang, campaigns, kpiStats, filter, setFilter, search, setSearch, onView, onDelete, onStatusChange, onEdit, isMobile }: {
  lang: "en" | "fr";
  campaigns: Campaign[];
  kpiStats: CampaignKpiStats;
  filter: CampaignFilter; setFilter: (f: CampaignFilter) => void;
  search: string; setSearch: (s: string) => void;
  onView: (id: string) => void;
  onDelete: (id: string) => void;
  onStatusChange: (campaignId: string, status: CampaignStatus) => void | Promise<void>;
  onEdit: (id: string) => void;
  isMobile?: boolean;
}) {
  const filtered = useMemo(() => {
    let list = campaigns ?? [];
    if (filter !== "all") list = list.filter((c) => c.status.toLowerCase() === filter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
    return list;
  }, [campaigns, filter, search]);

  if (!campaigns || campaigns.length === 0) return <div>No campaigns yet.</div>;

  const salesTrendSub = formatSalesTrendSub(kpiStats.salesTrend, lang);

  return (
    <div style={{ padding: isMobile ? "56px 16px 16px" : "24px 40px 40px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 20 }}>
        <FilterPills lang={lang} filter={filter} setFilter={setFilter} />
        <div style={{ flex: 1, minWidth: 200, display: "flex", alignItems: "center", gap: 8, background: "#FAFAFA", border: "1px solid #EFEFEF", borderRadius: 10, padding: "8px 12px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#9A9A9A" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round"/></svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search campaigns..." style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, fontFamily: "inherit", flex: 1, color: "#1A1A1A" }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        <Kpi title={lang === "fr" ? "Campagnes actives" : "Active Campaigns"} value={String(kpiStats.activeCount)} sub={formatEndingSub(kpiStats.endingThisMonth, lang)} />
        <Kpi title={lang === "fr" ? "Créateurs total" : "Total Creators"} value={String(kpiStats.totalCreators)} sub={formatCreatorsSub(kpiStats.totalCampaigns, lang)} />
        <Kpi title={lang === "fr" ? "Ventes totales générées" : "Total Sales Driven"} value={formatCurrency(kpiStats.totalSales, lang)} sub={salesTrendSub.text} subColor={salesTrendSub.color} />
        <Kpi title={lang === "fr" ? "Commissions dues" : "Total Commissions Owed"} value={formatCurrency(kpiStats.totalCommissionOwed, lang)} sub={formatPendingPayoutsSub(kpiStats.pendingPayouts, lang)} />
      </div>

      <div style={{ background: "#FFF", border: "1px solid #EFEFEF", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: isMobile ? "touch" : undefined }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: isMobile ? 700 : undefined }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #EFEFEF", textAlign: "left", background: "#FAFAFA" }}>
                {[
                  lang === "fr" ? "Nom de la campagne" : "Campaign Name",
                  lang === "fr" ? "Créateurs" : "Creators",
                  lang === "fr" ? "Plateforme" : "Platform",
                  lang === "fr" ? "Ventes" : "Sales",
                  lang === "fr" ? "Commission" : "Commission",
                  lang === "fr" ? "Statut" : "Status",
                  lang === "fr" ? "Date de début" : "Start Date",
                  lang === "fr" ? "Date de fin" : "End Date",
                  lang === "fr" ? "Action" : "Action",
                ].map((h) => (
                  <th key={h} style={{ padding: "12px 14px", color: "#9A9A9A", fontWeight: 500, fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const isPaused = c.status === "Paused";
                return (
                <tr
                  key={c.id}
                  style={{
                    borderBottom: "1px solid #F5F5F5",
                    background: isPaused ? "#F7F7F7" : "#FFFFFF",
                  }}
                >
                  <td style={{ padding: "14px", fontWeight: 500, color: isPaused ? "#9A9A9A" : "#1A1A1A" }}>{c.name}</td>
                  <td style={{ padding: "14px", color: isPaused ? "#9A9A9A" : "#1A1A1A" }}>{(c.creators ?? 0)} {lang === "fr" ? "créateurs" : "creators"}</td>
                  <td style={{ padding: "14px", color: isPaused ? "#B0B0B0" : "#7A7A7A" }}>{c.platform}</td>
                  <td style={{ padding: "14px", color: isPaused ? "#9A9A9A" : "#1A1A1A" }}>{formatCurrency(c.sales ?? 0, lang)}</td>
                  <td style={{ padding: "14px", color: isPaused ? "#9A9A9A" : "#1A1A1A" }}>{formatCurrency(c.commission ?? 0, lang)}</td>
                  <td style={{ padding: "14px" }}><CampaignBadge lang={lang} status={c.status} /></td>
                  <td style={{ padding: "14px", color: isPaused ? "#B0B0B0" : "#7A7A7A" }}>{c.start}</td>
                  <td style={{ padding: "14px", color: isPaused ? "#B0B0B0" : "#7A7A7A" }}>{c.end}</td>
                  <td style={{ padding: "14px" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => onView(c.id)} style={{ ...btnSecondary, padding: "6px 10px", fontSize: 12 }}>{lang === "fr" ? "Voir →" : "View →"}</button>
                      <button type="button" onClick={() => onEdit(c.id)} style={{ ...btnSecondary, padding: "6px 10px", fontSize: 12 }}>{lang === "fr" ? "Modifier" : "Edit"}</button>
                      {c.status === "Active" && (
                        <button
                          type="button"
                          style={{ ...btnSecondary, padding: "6px 10px", fontSize: 12 }}
                          onClick={() => void onStatusChange(c.id, "Paused")}
                        >
                          {lang === "fr" ? "Pause" : "Pause"}
                        </button>
                      )}
                      {c.status === "Paused" && (
                        <button
                          type="button"
                          style={{ ...btnSecondary, padding: "6px 10px", fontSize: 12 }}
                          onClick={() => void onStatusChange(c.id, "Active")}
                        >
                          {lang === "fr" ? "Reprendre" : "Resume"}
                        </button>
                      )}
                      <button type="button" onClick={() => onDelete(c.id)} style={{ ...btnSecondary, padding: "6px 10px", fontSize: 12, color: "#DC2626", borderColor: "#FECACA" }}>{lang === "fr" ? "Supprimer" : "Delete"}</button>
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderTop: "1px solid #EFEFEF", fontSize: 13, color: "#7A7A7A" }}>
          <span>{lang === "fr" ? "Affichage" : "Showing"} {filtered.length} {lang === "fr" ? "sur" : "of"} {campaigns.length} {lang === "fr" ? "campagnes" : "campaigns"}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" style={{ ...btnSecondary, padding: "6px 12px", fontSize: 12 }} disabled>{lang === "fr" ? "Précédent" : "Previous"}</button>
            <button type="button" style={{ ...btnSecondary, padding: "6px 12px", fontSize: 12 }}>{lang === "fr" ? "Suivant" : "Next"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}


function FilterPills({ lang, filter, setFilter }: { lang: "en" | "fr"; filter: CampaignFilter; setFilter: (f: CampaignFilter) => void }) {
  const pills: { id: CampaignFilter; label: string }[] = [
    { id: "all", label: lang === "fr" ? "Tout" : "All" },
    { id: "active", label: lang === "fr" ? "Actif" : "Active" },
    { id: "paused", label: lang === "fr" ? "En pause" : "Paused" },
    { id: "completed", label: lang === "fr" ? "Terminé" : "Completed" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {pills.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => setFilter(p.id)}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: filter === p.id ? "1px solid #1A1A1A" : "1px solid #E5E5E5",
            background: filter === p.id ? "#1A1A1A" : "#FFF",
            color: filter === p.id ? "#FFF" : "#7A7A7A",
            fontSize: 13,
            fontFamily: "inherit",
            fontWeight: filter === p.id ? 500 : 400,
            cursor: "pointer",
            letterSpacing: "-0.02em",
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function Kpi({ title, value, sub, subColor }: { title: string; value: string; sub: string; subColor?: string }) {
  return (
    <div style={{ background: "#FFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: 8, letterSpacing: "-0.01em" }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", marginBottom: 6 }}>{value}</div>
      <div style={{ fontSize: 12, color: subColor ?? "#7A7A7A", letterSpacing: "-0.01em" }}>{sub}</div>
    </div>
  );
}

function campaignBadgeStyle(status: CampaignStatus): React.CSSProperties {
  if (status === "Paused") {
    return {
      display: "inline-block",
      fontSize: 11,
      fontWeight: 600,
      color: "#7A7A7A",
      background: "#ECECEC",
      border: "1px solid #D9D9D9",
      borderRadius: 6,
      padding: "4px 8px",
      letterSpacing: "-0.01em",
    };
  }
  if (status === "Active") {
    return {
      display: "inline-block",
      fontSize: 11,
      fontWeight: 600,
      color: "#1A1A1A",
      letterSpacing: "-0.01em",
    };
  }
  return {
    display: "inline-block",
    fontSize: 11,
    fontWeight: 600,
    color: "#9A9A9A",
    letterSpacing: "-0.01em",
  };
}

function CampaignBadge({ lang, status }: { lang: "en" | "fr"; status: CampaignStatus }) {
  return (
    <span style={campaignBadgeStyle(status)}>{campaignStatusLabel(status, lang)}</span>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#FFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: 24, marginBottom: 20 }}>
      {title && <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", margin: "0 0 18px 0" }}>{title}</h3>}
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12, color: "#9A9A9A", letterSpacing: "-0.01em", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #EFEFEF", textAlign: "left", background: "#FAFAFA" }}>
            {headers.map((h) => (
              <th key={h} style={{ padding: "12px 14px", color: "#9A9A9A", fontWeight: 500, fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function BtnSm({ children, onClick, variant }: { children: React.ReactNode; onClick?: () => void; variant?: "danger" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...btnSecondary,
        padding: "6px 10px",
        fontSize: 12,
        ...(variant === "danger" ? { color: "#DC2626", borderColor: "#FECACA" } : {}),
      }}
    >
      {children}
    </button>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        onClick={() => onChange(!on)}
        aria-pressed={on}
        style={{ position: "relative", width: 40, height: 22, background: on ? "#0047FF" : "#E5E5E5", borderRadius: 999, border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}
      >
        <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, background: "#FFF", borderRadius: "50%", transition: "left 0.2s" }} />
      </button>
      {label && <span style={{ fontSize: 13, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{label}</span>}
    </div>
  );
}

function CampaignDetail({ lang, campaign, onBack, onUpdate, onStatusChange, onEdit, isMobile }: { lang: "en" | "fr"; campaign: Campaign; onBack: () => void; onUpdate: (c: Campaign) => void; onStatusChange: (campaignId: string, status: CampaignStatus) => void | Promise<void>; onEdit: (id: string) => void; isMobile?: boolean }) {
  const [tab, setTab] = useState<DetailTab>("creators");
  const detailTabs: { id: DetailTab; label: string }[] = [
    { id: "creators", label: lang === "fr" ? "Créateurs" : "Creators" },
    { id: "outreach", label: lang === "fr" ? "Messages" : "Outreach" },
    { id: "sales", label: lang === "fr" ? "Ventes" : "Sales" },
    { id: "payouts", label: lang === "fr" ? "Paiements" : "Payouts" },
    { id: "settings", label: lang === "fr" ? "Paramètres" : "Settings" },
  ];

  const isPaused = campaign.status === "Paused";

  return (
  <>
    <div style={{ padding: isMobile ? "16px" : "32px 40px 0", paddingTop: isMobile ? 56 : undefined, borderBottom: "1px solid #EFEFEF", background: isPaused ? "#F7F7F7" : "#FFF" }}>
      <button type="button" onClick={onBack} style={{ ...btnSecondary, marginBottom: 16, padding: "8px 12px", fontSize: 12 }}>{lang === "fr" ? "← Retour aux campagnes" : "← Back to campaigns"}</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, color: isPaused ? "#9A9A9A" : "#1A1A1A", margin: "0 0 8px", letterSpacing: "-0.04em" }}>{campaign.name}</h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 13, color: "#7A7A7A" }}>
            <CampaignBadge lang={lang} status={campaign.status} />
            <span>{campaign.platform}</span>
            <span>{campaign.start} – {campaign.end}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {campaign.status === "Active" && (
            <BtnSm onClick={() => void onStatusChange(campaign.id, "Paused")}>
              {lang === "fr" ? "Pause" : "Pause"}
            </BtnSm>
          )}
          {campaign.status === "Paused" && (
            <BtnSm onClick={() => void onStatusChange(campaign.id, "Active")}>
              {lang === "fr" ? "Reprendre" : "Resume"}
            </BtnSm>
          )}
          <BtnSm onClick={() => onEdit(campaign.id)}>{lang === "fr" ? "Modifier" : "Edit"}</BtnSm>
        </div>
      </div>
      <div style={{ display: "flex", gap: 28, overflowX: "auto", marginTop: 20 }}>
        {detailTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              background: "none",
              border: "none",
              padding: "12px 0",
              fontSize: 14,
              fontFamily: "inherit",
              color: tab === t.id ? "#1A1A1A" : "#7A7A7A",
              fontWeight: tab === t.id ? 500 : 400,
              letterSpacing: "-0.02em",
              cursor: "pointer",
              borderBottom: tab === t.id ? "2px solid #1A1A1A" : "2px solid transparent",
              marginBottom: -1,
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
    <div style={{ padding: isMobile ? 16 : "24px 40px 40px", paddingTop: isMobile ? undefined : undefined }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <Kpi title={lang === "fr" ? "Créateurs" : "Creators"} value={String(campaign.creators ?? 0)} sub={lang === "fr" ? "dans cette campagne" : "in this campaign"} />
        <Kpi title={lang === "fr" ? "Ventes" : "Sales"} value={formatCurrency(campaign.sales ?? 0, lang)} sub={lang === "fr" ? "revenus attribués" : "attributed revenue"} />
        <Kpi title={lang === "fr" ? "Commission" : "Commission"} value={formatCurrency(campaign.commission ?? 0, lang)} sub={lang === "fr" ? "dû aux créateurs" : "owed to creators"} />
        <Kpi title="Avg per Creator" value={(campaign.creators ?? 0) ? formatCurrency(Math.round((campaign.sales ?? 0) / (campaign.creators ?? 0)), lang) : formatCurrency(0, lang)} sub={lang === "fr" ? "ventes générées" : "sales driven"} />
      </div>
      {tab === "creators" && <CreatorsTab lang={lang} />}
      {tab === "outreach" && <OutreachTab lang={lang} />}
      {tab === "sales" && <SalesTab lang={lang} />}
      {tab === "payouts" && <PayoutsTab lang={lang} />}
      {tab === "settings" && <SettingsTab lang={lang} campaign={campaign} onUpdate={onUpdate} />}
    </div>
  </>
  );
}

function CreatorsTab({ lang }: { lang: "en" | "fr" }) {
  return (
    <Card title={lang === "fr" ? "Créateurs de la campagne" : "Campaign creators"}>
      <Table headers={[lang === "fr" ? "Créateur" : "Creator", lang === "fr" ? "Pseudo" : "Handle", lang === "fr" ? "Plateforme" : "Platform", "Sales", lang === "fr" ? "Commission" : "Commission", lang === "fr" ? "Statut" : "Status", lang === "fr" ? "Action" : "Action"]}>
        <EmptyTableRow lang={lang} colSpan={7} />
      </Table>
      <div style={{ marginTop: 16 }}>
        <BtnSm>{lang === "fr" ? "+ Ajouter un créateur" : "+ Add creator"}</BtnSm>
      </div>
    </Card>
  );
}

function OutreachTab({ lang }: { lang: "en" | "fr" }) {
  return (
    <Card title={lang === "fr" ? "Messages envoyés" : "Outreach messages"}>
      <Table headers={[lang === "fr" ? "Créateur" : "Creator", lang === "fr" ? "Plateforme" : "Platform", lang === "fr" ? "Statut" : "Status", lang === "fr" ? "Envoyé" : "Sent", lang === "fr" ? "Aperçu" : "Preview", lang === "fr" ? "Action" : "Action"]}>
        <EmptyTableRow lang={lang} colSpan={6} />
      </Table>
    </Card>
  );
}

function SalesTab({ lang }: { lang: "en" | "fr" }) {
  return (
    <Card title={lang === "fr" ? "Ventes attribuées" : "Attributed sales"}>
      <Table headers={[lang === "fr" ? "N° commande" : "Order ID", lang === "fr" ? "Créateur" : "Creator", lang === "fr" ? "Produit" : "Product", lang === "fr" ? "Montant" : "Amount", lang === "fr" ? "Commission" : "Commission", lang === "fr" ? "Date" : "Date"]}>
        <EmptyTableRow lang={lang} colSpan={6} />
      </Table>
    </Card>
  );
}

function PayoutsTab({ lang }: { lang: "en" | "fr" }) {
  return (
    <Card title={lang === "fr" ? "Paiements créateurs" : "Creator payouts"}>
      <Table headers={[lang === "fr" ? "Créateur" : "Creator", lang === "fr" ? "Montant" : "Amount", lang === "fr" ? "Statut" : "Status", lang === "fr" ? "Date d'échéance" : "Due Date", lang === "fr" ? "Action" : "Action"]}>
        <EmptyTableRow lang={lang} colSpan={5} />
      </Table>
    </Card>
  );
}

function SettingsTab({ lang, campaign, onUpdate }: { lang: "en" | "fr"; campaign: Campaign; onUpdate: (c: Campaign) => void }) {
  const [autoPayout, setAutoPayout] = useState(true);
  const [trackClicks, setTrackClicks] = useState(true);

  return (
    <>
      <Card title={lang === "fr" ? "Détails de la campagne" : "Campaign details"}>
        <Field label={lang === "fr" ? "Nom de la campagne" : "Campaign name"}>
          <input type="text" defaultValue={campaign.name} style={inputStyle} onBlur={(e) => onUpdate({ ...campaign, name: e.target.value })} />
        </Field>
        <Field label="Platform">
          <input type="text" defaultValue={campaign.platform} style={inputStyle} onBlur={(e) => onUpdate({ ...campaign, platform: e.target.value })} />
        </Field>
        <Field label={lang === "fr" ? "Description" : "Description"}>
          <textarea defaultValue={campaign.description ?? ""} rows={3} style={{ ...inputStyle, resize: "vertical" }} onBlur={(e) => onUpdate({ ...campaign, description: e.target.value })} />
        </Field>
      </Card>
      <Card title="Commission & tracking">
        <Field label="Default commission rate">
          <input type="text" defaultValue="8%" style={inputStyle} readOnly />
        </Field>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Toggle on={autoPayout} onChange={setAutoPayout} label="Auto-pay commissions on the 1st and 15th" />
          <Toggle on={trackClicks} onChange={setTrackClicks} label="Track link clicks and UTM parameters" />
        </div>
      </Card>
      <Card title="Danger zone">
        <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 16px" }}>Mark this campaign as completed or delete it permanently.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <BtnSm onClick={() => onUpdate({ ...campaign, status: "Completed" })}>Mark completed</BtnSm>
          <BtnSm variant="danger">Delete campaign</BtnSm>
        </div>
      </Card>
    </>
  );
}

const MODAL_STEPS = ["Basics", "Commission", "Add creators", "Review & launch"] as const;

type EditCampaignPayload = {
  name: string;
  description?: string;
  platform: string;
  startDate?: string;
  endDate?: string;
  commissionType: string;
  commissionRate: number;
  autoPayout: boolean;
  creatorIds: string[];
};

function EditCampaignModal({
  lang,
  campaign,
  onClose,
  onSave,
}: {
  lang: "en" | "fr";
  campaign: Campaign;
  onClose: () => void;
  onSave: (data: EditCampaignPayload) => void | Promise<void>;
}) {
  const initialCommissionType = campaign.commissionType === "flat" ? "flat" : "percent";
  const [name, setName] = useState(campaign.name);
  const [platform, setPlatform] = useState(campaign.platform || "TikTok");
  const [start, setStart] = useState(campaign.startRaw ?? (campaign.start === "—" ? "" : campaign.start));
  const [end, setEnd] = useState(campaign.endRaw ?? (campaign.end === "—" ? "" : campaign.end));
  const [description, setDescription] = useState(campaign.description ?? "");
  const [commissionRate, setCommissionRate] = useState(String(campaign.commissionRate ?? 10));
  const [commissionType, setCommissionType] = useState<"percent" | "flat">(initialCommissionType);
  const [autoPayout, setAutoPayout] = useState(Boolean(campaign.autoPayout));
  const [assignedIds, setAssignedIds] = useState<string[]>(campaign.creatorIds ?? []);
  const [savedCreators, setSavedCreators] = useState<SavedCreatorOption[]>([]);
  const [loadingCreators, setLoadingCreators] = useState(true);
  const [pickerId, setPickerId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!supabase) {
        setLoadingCreators(false);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoadingCreators(false);
        return;
      }
      const data = await getSavedCreators(user.id);
      setSavedCreators(data.map((row) => mapSavedCreator(row as Record<string, unknown>)));
      setLoadingCreators(false);
    };
    void load();
  }, []);

  const savedById = useMemo(
    () => new Map(savedCreators.map((creator) => [creator.id, creator])),
    [savedCreators],
  );
  const availableCreators = savedCreators.filter((creator) => !assignedIds.includes(creator.id));

  const addCreator = () => {
    if (!pickerId || assignedIds.includes(pickerId)) return;
    setAssignedIds((prev) => [...prev, pickerId]);
    setPickerId("");
  };

  const removeCreator = (creatorId: string) => {
    setAssignedIds((prev) => prev.filter((id) => id !== creatorId));
  };

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        platform,
        startDate: normalizeDate(start),
        endDate: normalizeDate(end),
        commissionType: commissionType === "percent" ? "percentage" : "flat",
        commissionRate: clampRate(commissionRate),
        autoPayout,
        creatorIds: assignedIds,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#FFF", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 48px rgba(0,0,0,0.12)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "24px 24px 0", borderBottom: "1px solid #EFEFEF" }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px", letterSpacing: "-0.03em" }}>
            {lang === "fr" ? "Modifier la campagne" : "Edit campaign"}
          </h2>
          <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 20px" }}>
            {lang === "fr" ? "Mettez à jour les informations de votre campagne." : "Update your campaign details."}
          </p>
        </div>

        <div style={{ padding: 24 }}>
          <Field label={lang === "fr" ? "Nom de la campagne" : "Campaign name"}>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </Field>
          <Field label={lang === "fr" ? "Plateforme" : "Platform"}>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={inputStyle}>
              {["TikTok", "Instagram", "YouTube", "TikTok + Instagram", "All"].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={lang === "fr" ? "Date de début" : "Start date"}>
              <input type="text" value={start} onChange={(e) => setStart(e.target.value)} placeholder="May 1, 2026" style={inputStyle} />
            </Field>
            <Field label={lang === "fr" ? "Date de fin" : "End date"}>
              <input type="text" value={end} onChange={(e) => setEnd(e.target.value)} placeholder="Jun 30, 2026" style={inputStyle} />
            </Field>
          </div>
          <Field label={lang === "fr" ? "Description (optionnel)" : "Description (optional)"}>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </Field>
          <Field label={lang === "fr" ? "Type de commission" : "Commission type"}>
            <div style={{ display: "flex", gap: 8 }}>
              {(["percent", "flat"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setCommissionType(t)}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: commissionType === t ? "2px solid #0047FF" : "1px solid #E5E5E5",
                    background: commissionType === t ? "#E8EEFC" : "#FFF",
                    fontSize: 13,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    color: "#1A1A1A",
                  }}
                >
                  {t === "percent"
                    ? lang === "fr" ? "% de vente" : "% of sale"
                    : lang === "fr" ? "Montant fixe" : "Flat per sale"}
                </button>
              ))}
            </div>
          </Field>
          <Field label={commissionType === "percent" ? (lang === "fr" ? "Taux de commission (%)" : "Commission rate (%)") : lang === "fr" ? "Montant fixe" : "Flat amount"}>
            <input type="text" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} style={inputStyle} />
          </Field>
          <div style={{ marginTop: 4, marginBottom: 20 }}>
            <Toggle
              on={autoPayout}
              onChange={setAutoPayout}
              label={lang === "fr" ? "Paiement automatique des commissions" : "Auto-pay commissions"}
            />
          </div>

          <Field label={lang === "fr" ? `Créateurs (${assignedIds.length})` : `Creators (${assignedIds.length})`}>
            {assignedIds.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {assignedIds.map((creatorId) => {
                  const creator = savedById.get(creatorId);
                  const label = creator?.full_name || creator?.handle || creatorId;
                  const handle = creator?.handle ? `@${creator.handle.replace(/^@/, "")}` : "";
                  return (
                    <div
                      key={creatorId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        background: "#FAFAFA",
                        border: "1px solid #EFEFEF",
                        borderRadius: 10,
                      }}
                    >
                      <CreatorAvatar src={creator?.avatar_url} size={32} alt={label} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>{label}</div>
                        {handle && <div style={{ fontSize: 12, color: "#7A7A7A" }}>{handle}</div>}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCreator(creatorId)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#DC2626",
                          cursor: "pointer",
                          fontSize: 12,
                          fontFamily: "inherit",
                          fontWeight: 500,
                        }}
                      >
                        {lang === "fr" ? "Retirer" : "Remove"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "#9A9A9A", margin: "0 0 12px" }}>
                {lang === "fr" ? "Aucun créateur assigné à cette campagne." : "No creators assigned to this campaign yet."}
              </p>
            )}

            {loadingCreators ? (
              <p style={{ fontSize: 13, color: "#9A9A9A", margin: 0 }}>{lang === "fr" ? "Chargement des créateurs…" : "Loading creators…"}</p>
            ) : savedCreators.length === 0 ? (
              <p style={{ fontSize: 13, color: "#9A9A9A", margin: 0 }}>
                {lang === "fr" ? "Aucun créateur sauvegardé. Ajoutez-en depuis l’onglet Créateurs." : "No saved creators yet. Add creators from the Creators tab."}
              </p>
            ) : availableCreators.length === 0 ? (
              <p style={{ fontSize: 13, color: "#9A9A9A", margin: 0 }}>
                {lang === "fr" ? "Tous vos créateurs sont déjà dans cette campagne." : "All your saved creators are already in this campaign."}
              </p>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  value={pickerId}
                  onChange={(e) => setPickerId(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                >
                  <option value="">
                    {lang === "fr" ? "Choisir un créateur sauvegardé…" : "Select a saved creator…"}
                  </option>
                  {availableCreators.map((creator) => (
                    <option key={creator.id} value={creator.id}>
                      {(creator.full_name || creator.handle) + (creator.handle ? ` (@${creator.handle.replace(/^@/, "")})` : "")}
                    </option>
                  ))}
                </select>
                <button type="button" style={{ ...btnPrimary, flexShrink: 0 }} onClick={addCreator} disabled={!pickerId}>
                  {lang === "fr" ? "Ajouter" : "Add"}
                </button>
              </div>
            )}
          </Field>
        </div>

        <div style={{ padding: "16px 24px 24px", display: "flex", justifyContent: "flex-end", gap: 12, borderTop: "1px solid #EFEFEF" }}>
          <button type="button" style={btnSecondary} onClick={onClose} disabled={saving}>
            {lang === "fr" ? "Annuler" : "Cancel"}
          </button>
          <button type="button" style={btnPrimary} onClick={() => void submit()} disabled={!name.trim() || saving}>
            {saving ? (lang === "fr" ? "Enregistrement…" : "Saving…") : lang === "fr" ? "Enregistrer" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewCampaignModal({ lang, onClose, onCreate }: { lang: "en" | "fr"; onClose: () => void; onCreate: (campaignData: any) => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("TikTok");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [description, setDescription] = useState("");
  const [commissionRate, setCommissionRate] = useState("8");
  const [commissionType, setCommissionType] = useState<"percent" | "flat">("percent");
  const [creatorInput, setCreatorInput] = useState("");
  const [creators, setCreators] = useState<string[]>([]);

  const addCreator = () => {
    const v = creatorInput.trim();
    if (v && !creators.includes(v)) setCreators((list) => [...list, v]);
    setCreatorInput("");
  };

  const launch = () => {
    onCreate({
      name: name || "Untitled Campaign",
      description,
      platform,
      startDate: normalizeDate(start),
      endDate: normalizeDate(end),
      commissionType: commissionType === "percent" ? "percentage" : "flat",
      commissionRate: clampRate(commissionRate),
      autoPayout: false,
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }} onClick={onClose}>
      <div style={{ background: "#FFF", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 48px rgba(0,0,0,0.12)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "24px 24px 0", borderBottom: "1px solid #EFEFEF" }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", margin: "0 0 16px", letterSpacing: "-0.03em" }}>New Campaign</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {MODAL_STEPS.map((label, i) => (
              <div
                key={label}
                style={{
                  fontSize: 12,
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: i === step ? "#0047FF" : i < step ? "#E8EEFC" : "#F5F5F5",
                  color: i === step ? "#FFF" : i < step ? "#0047FF" : "#9A9A9A",
                  fontWeight: i === step ? 500 : 400,
                }}
              >
                {i + 1}. {label}
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: 24 }}>
          {step === 0 && (
            <>
              <Field label={lang === "fr" ? "Nom de la campagne" : "Campaign name"}>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={lang === "fr" ? "Nom de la campagne" : "Campaign name"} style={inputStyle} />
              </Field>
              <Field label="Platform">
                <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={inputStyle}>
                  {["TikTok", "Instagram", "YouTube", "TikTok + Instagram", "All"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Start date">
                  <input type="text" value={start} onChange={(e) => setStart(e.target.value)} placeholder="May 1, 2026" style={inputStyle} />
                </Field>
                <Field label="End date">
                  <input type="text" value={end} onChange={(e) => setEnd(e.target.value)} placeholder="Jun 30, 2026" style={inputStyle} />
                </Field>
              </div>
              <Field label={lang === "fr" ? "Description (optionnel)" : "Description (optional)"}>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="Campaign goals and notes..." />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <Field label="Commission type">
                <div style={{ display: "flex", gap: 8 }}>
                  {(["percent", "flat"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setCommissionType(t)}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: commissionType === t ? "2px solid #0047FF" : "1px solid #E5E5E5",
                        background: commissionType === t ? "#E8EEFC" : "#FFF",
                        fontSize: 13,
                        fontFamily: "inherit",
                        cursor: "pointer",
                        color: "#1A1A1A",
                      }}
                    >
                      {t === "percent" ? "% of sale" : "Flat per sale"}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={commissionType === "percent" ? (lang === "fr" ? "Taux de commission (%)" : "Commission rate (%)") : "Flat amount ($)"}>
                <input type="text" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} style={inputStyle} />
              </Field>
              <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0 }}>Creators earn {commissionType === "percent" ? `${commissionRate}%` : formatCurrency(Number(commissionRate) || 0, lang)} on each attributed sale.</p>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Add creators (handles or emails)">
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" value={creatorInput} onChange={(e) => setCreatorInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCreator())} placeholder="@creator or email" style={{ ...inputStyle, flex: 1 }} />
                  <button type="button" style={btnPrimary} onClick={addCreator}>Add</button>
                </div>
              </Field>
              {creators.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {creators.map((cr) => (
                    <div key={cr} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#FAFAFA", borderRadius: 10, border: "1px solid #EFEFEF", fontSize: 13 }}>
                      <span>{cr}</span>
                      <button type="button" onClick={() => setCreators((list) => list.filter((x) => x !== cr))} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Remove</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: "#9A9A9A", margin: 0 }}>No creators added yet. You can add them later from the campaign detail view.</p>
              )}
            </>
          )}

          {step === 3 && (
            <div style={{ fontSize: 14, color: "#1A1A1A", lineHeight: 1.6 }}>
              <p style={{ margin: "0 0 16px", fontWeight: 500 }}>Review your campaign</p>
              <div style={{ background: "#FAFAFA", borderRadius: 12, padding: 16, border: "1px solid #EFEFEF" }}>
                <div style={{ marginBottom: 8 }}><strong>Name:</strong> {name || "Untitled Campaign"}</div>
                <div style={{ marginBottom: 8 }}><strong>Platform:</strong> {platform}</div>
                <div style={{ marginBottom: 8 }}><strong>Dates:</strong> {start || "—"} – {end || "—"}</div>
                <div style={{ marginBottom: 8 }}><strong>Commission:</strong> {commissionType === "percent" ? `${commissionRate}%` : `${formatCurrency(Number(commissionRate) || 0, lang)} flat`}</div>
                <div><strong>Creators:</strong> {creators.length ? creators.join(", ") : "None yet"}</div>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "16px 24px 24px", display: "flex", justifyContent: "space-between", gap: 12, borderTop: "1px solid #EFEFEF" }}>
          <button type="button" style={btnSecondary} onClick={step === 0 ? onClose : () => setStep((s) => s - 1)}>
            {step === 0 ? (lang === "fr" ? "Annuler" : "Cancel") : "Back"}
          </button>
          {step < MODAL_STEPS.length - 1 ? (
            <button type="button" style={btnPrimary} onClick={() => setStep((s) => s + 1)} disabled={step === 0 && !name.trim()}>
              Continue →
            </button>
          ) : (
            <button type="button" style={btnPrimary} onClick={launch}>{lang === "fr" ? "Lancer la campagne →" : "Launch campaign →"}</button>
          )}
        </div>
      </div>
    </div>
  );
}
