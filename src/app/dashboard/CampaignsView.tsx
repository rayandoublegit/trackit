"use client";

import { useEffect, useMemo, useState } from "react";
import { saveCampaign, getCampaigns } from "@/lib/db";
import { notifyCampaignCreated } from "@/lib/notifications-storage";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import { formatCurrency } from "@/lib/useCurrency";

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
  description?: string;
};

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

type PlanTier = "free" | "basic" | "pro";

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
  isMobile,
}: {
  plan: PlanTier;
  onUpgrade: () => void;
  isMobile?: boolean;
}) {
  const lang = useLang();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [filter, setFilter] = useState<CampaignFilter>("all");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  const tryOpenNewCampaign = () => {
    if (plan === "free") {
      alert(lang === "fr" ? "Les campagnes sont disponibles à partir du plan Basic." : "Campaigns are available on Basic plan and above.");
      return;
    }
    setModalOpen(true);
  };

  useEffect(() => {
    const load = async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const data = await getCampaigns(user.id);
      if (data.length > 0) setCampaigns(data);
    };
    void load();
  }, []);

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
      setCampaigns((prev) => [saved, ...prev]);
      notifyCampaignCreated(lang, campaignData.name || (lang === "fr" ? "Nouvelle campagne" : "New campaign"));
    }
    setModalOpen(false);
  };

  const selected = campaigns.find((c) => c.id === detailId) ?? null;

  if (selected) {
    return <CampaignDetail isMobile={isMobile} lang={lang} campaign={selected} onBack={() => setDetailId(null)} onUpdate={(c) => setCampaigns((list) => list.map((x) => (x.id === c.id ? c : x)))} />;
  }

  if (campaigns.length === 0) {
    return (
      <>
        <CampaignsHeader isMobile={isMobile} lang={lang} onNew={tryOpenNewCampaign} showFilters={false} />
        <div style={{ padding: 80, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px" }}>{lang === "fr" ? "Aucune campagne pour l'instant." : "No campaigns yet."}</h2>
          <p style={{ fontSize: 14, color: "#7A7A7A", margin: "0 0 24px", maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>
            {lang === "fr" ? "Créez votre première campagne pour commencer à suivre les performances et les commissions." : "Create your first campaign to start tracking creator performance and commissions."}
          </p>
          <button type="button" style={btnPrimary} onClick={tryOpenNewCampaign}>{lang === "fr" ? "+ Créer votre première campagne →" : "+ Create your first campaign →"}</button>
        </div>
        {modalOpen && <NewCampaignModal lang={lang} onClose={() => setModalOpen(false)} onCreate={(data) => void handleCreateCampaign(data)} />}
        {upgradeModalOpen && (
          <CampaignUpgradeModal onClose={() => setUpgradeModalOpen(false)} onUpgrade={onUpgrade} />
        )}
      </>
    );
  }

  return (
    <>
      <CampaignsHeader isMobile={isMobile} lang={lang} onNew={tryOpenNewCampaign} showFilters />
      <CampaignsList isMobile={isMobile} lang={lang} campaigns={campaigns} filter={filter} setFilter={setFilter} search={search} setSearch={setSearch} onView={setDetailId} onDelete={(id) => setCampaigns((l) => l.filter((c) => c.id !== id))} />
      {modalOpen && <NewCampaignModal lang={lang} onClose={() => setModalOpen(false)} onCreate={(data) => void handleCreateCampaign(data)} />}
      {upgradeModalOpen && (
        <CampaignUpgradeModal onClose={() => setUpgradeModalOpen(false)} onUpgrade={onUpgrade} />
      )}
    </>
  );
}

function CampaignUpgradeModal({ onClose, onUpgrade }: { onClose: () => void; onUpgrade: () => void }) {
  const lang = useLang();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 16,
          padding: 32,
          maxWidth: 420,
          width: "100%",
          boxShadow: "0 24px 48px rgba(0,0,0,0.12)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", margin: "0 0 12px", letterSpacing: "-0.03em" }}>
          Upgrade to create more campaigns
        </h3>
        <p style={{ fontSize: 14, color: "#7A7A7A", margin: "0 0 24px", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
          Free plan includes 1 campaign. Upgrade to Basic for unlimited campaigns.
        </p>
        <button type="button" onClick={() => void onUpgrade()} style={{ ...btnPrimary, width: "100%" }}>
          {lang === "fr" ? `Passer à Basic ${formatCurrency(49, lang)}/mois →` : `Upgrade to Basic ${formatCurrency(49, lang)}/mo →`}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{ ...btnSecondary, width: "100%", marginTop: 10, background: "#FFFFFF" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function CampaignsHeader({ lang, onNew, showFilters, isMobile }: { lang: "en" | "fr"; onNew: () => void; showFilters?: boolean; isMobile?: boolean }) {
  return (
    <div style={{ paddingTop: isMobile ? 56 : 40, paddingRight: isMobile ? 16 : 40, paddingBottom: isMobile ? 16 : 20, paddingLeft: isMobile ? 16 : 40, borderBottom: "1px solid #EFEFEF", background: "#FFF" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", margin: 0, letterSpacing: "-0.04em" }}>{lang === "fr" ? "Campagnes" : "Campaigns"}</h1>
        <button type="button" className="hero-cta-shopify hero-cta-compact" onClick={onNew}>{lang === "fr" ? "+ Nouvelle campagne" : "+ New Campaign"}</button>
      </div>
    </div>
  );
}

function CampaignsList({ lang, campaigns, filter, setFilter, search, setSearch, onView, onDelete, isMobile }: {
  lang: "en" | "fr";
  campaigns: Campaign[]; filter: CampaignFilter; setFilter: (f: CampaignFilter) => void;
  search: string; setSearch: (s: string) => void; onView: (id: string) => void; onDelete: (id: string) => void;
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

  const active = campaigns.filter((c) => c.status === "Active").length;
  const totalCreators = campaigns.reduce((s, c) => s + (c.creators ?? 0), 0);
  const totalSales = campaigns.reduce((s, c) => s + (c.sales ?? 0), 0);
  const totalCommission = campaigns.reduce((s, c) => s + (c.commission ?? 0), 0);

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
        <Kpi title={lang === "fr" ? "Campagnes actives" : "Active Campaigns"} value={String(active)} sub={lang === "fr" ? "2 se terminent ce mois" : "2 ending this month"} />
        <Kpi title={lang === "fr" ? "Créateurs total" : "Total Creators"} value={String(totalCreators)} sub={lang === "fr" ? "sur toutes les campagnes" : "across all campaigns"} />
        <Kpi title={lang === "fr" ? "Ventes totales générées" : "Total Sales Driven"} value={formatCurrency(totalSales, lang)} sub={lang === "fr" ? "vs mois dernier +18% ↑" : "vs last month +18% ↑"} subColor="#2E7D32" />
        <Kpi title={lang === "fr" ? "Commissions dues" : "Total Commissions Owed"} value={formatCurrency(totalCommission, lang)} sub={lang === "fr" ? "12 paiements en attente" : "12 pending payouts"} />
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
              {filtered.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid #F5F5F5" }}>
                  <td style={{ padding: "14px", fontWeight: 500, color: "#1A1A1A" }}>{c.name}</td>
                  <td style={{ padding: "14px" }}>{(c.creators ?? 0)} {lang === "fr" ? "créateurs" : "creators"}</td>
                  <td style={{ padding: "14px", color: "#7A7A7A" }}>{c.platform}</td>
                  <td style={{ padding: "14px" }}>{formatCurrency(c.sales ?? 0, lang)}</td>
                  <td style={{ padding: "14px" }}>{formatCurrency(c.commission ?? 0, lang)}</td>
                  <td style={{ padding: "14px" }}><CampaignBadge lang={lang} status={c.status} /></td>
                  <td style={{ padding: "14px", color: "#7A7A7A" }}>{c.start}</td>
                  <td style={{ padding: "14px", color: "#7A7A7A" }}>{c.end}</td>
                  <td style={{ padding: "14px" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => onView(c.id)} style={{ ...btnSecondary, padding: "6px 10px", fontSize: 12 }}>{lang === "fr" ? "Voir →" : "View →"}</button>
                      <button type="button" style={{ ...btnSecondary, padding: "6px 10px", fontSize: 12 }}>{lang === "fr" ? "Modifier" : "Edit"}</button>
                      {c.status === "Active" && <button type="button" style={{ ...btnSecondary, padding: "6px 10px", fontSize: 12 }}>Pause</button>}
                      <button type="button" onClick={() => onDelete(c.id)} style={{ ...btnSecondary, padding: "6px 10px", fontSize: 12, color: "#DC2626", borderColor: "#FECACA" }}>{lang === "fr" ? "Supprimer" : "Delete"}</button>
                    </div>
                  </td>
                </tr>
              ))}
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

function CampaignBadge({ lang, status }: { lang: "en" | "fr"; status: CampaignStatus }) {
  const map: Record<CampaignStatus, { bg: string; c: string }> = {
    Active: { bg: "#E8F5E9", c: "#2E7D32" },
    Paused: { bg: "#FFF8E1", c: "#F57F17" },
    Completed: { bg: "#F5F5F5", c: "#9A9A9A" },
    Draft: { bg: "#E3F2FD", c: "#1565C0" },
  };
  const s = map[status] ?? { bg: "#F5F5F5", c: "#7A7A7A" };
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 6, background: s.bg, color: s.c }}>{campaignStatusLabel(status, lang)}</span>
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

function CampaignDetail({ lang, campaign, onBack, onUpdate, isMobile }: { lang: "en" | "fr"; campaign: Campaign; onBack: () => void; onUpdate: (c: Campaign) => void; isMobile?: boolean }) {
  const [tab, setTab] = useState<DetailTab>("creators");
  const detailTabs: { id: DetailTab; label: string }[] = [
    { id: "creators", label: lang === "fr" ? "Créateurs" : "Creators" },
    { id: "outreach", label: lang === "fr" ? "Messages" : "Outreach" },
    { id: "sales", label: lang === "fr" ? "Ventes" : "Sales" },
    { id: "payouts", label: lang === "fr" ? "Paiements" : "Payouts" },
    { id: "settings", label: lang === "fr" ? "Paramètres" : "Settings" },
  ];

  return (
  <>
    <div style={{ padding: isMobile ? "16px" : "32px 40px 0", paddingTop: isMobile ? 56 : undefined, borderBottom: "1px solid #EFEFEF", background: "#FFF" }}>
      <button type="button" onClick={onBack} style={{ ...btnSecondary, marginBottom: 16, padding: "8px 12px", fontSize: 12 }}>{lang === "fr" ? "← Retour aux campagnes" : "← Back to campaigns"}</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px", letterSpacing: "-0.04em" }}>{campaign.name}</h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 13, color: "#7A7A7A" }}>
            <CampaignBadge lang={lang} status={campaign.status} />
            <span>{campaign.platform}</span>
            <span>{campaign.start} – {campaign.end}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {campaign.status === "Active" && <BtnSm onClick={() => onUpdate({ ...campaign, status: "Paused" })}>Pause</BtnSm>}
          {campaign.status === "Paused" && <BtnSm onClick={() => onUpdate({ ...campaign, status: "Active" })}>Resume</BtnSm>}
          <BtnSm>{lang === "fr" ? "Modifier" : "Edit"}</BtnSm>
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
      startDate: start,
      endDate: end,
      commissionType: commissionType === "percent" ? "percentage" : "flat",
      commissionRate: parseFloat(commissionRate) || 10,
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
