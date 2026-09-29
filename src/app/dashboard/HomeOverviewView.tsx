"use client";

import { useLang } from "@/lib/useLang";
import { formatCurrency, useDisplayCurrency } from "@/lib/useCurrency";
import { useCreatorStats } from "@/lib/useCreatorStats";
import type { DashboardView } from "@/lib/dashboard-view-storage";
import { SAMPLE_CAMPAIGN_DETAILS, sampleDailyRevenue } from "@/lib/sample-campaign-preview";
import { ActivityFeed, RevenueChart } from "./SampleCampaignPreview";
import { CountUp } from "./sample-motion";
import { samplesHidden } from "@/lib/sample-workspace";
import { HOME_STEP_ORDER, homeStepById, homeStepDone, nextHomeStep, type HomeStep } from "@/lib/home-next-step";
import { MinoHomeHero } from "./MinoHomeHero";

const BLUE = "#0047FF";

type GettingStarted = {
  shopify: boolean;
  creators: boolean;
  outreach: boolean;
  sales: boolean;
  creatorsCount: number;
  outreachCount: number;
  salesCount: number;
  countsLoaded?: boolean;
};


function OverviewHeader({
  isMobile,
  title,
  subtitle,
}: {
  isMobile?: boolean;
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      style={{
        paddingTop: isMobile ? 16 : subtitle ? 40 : 28,
        paddingRight: isMobile ? 16 : 40,
        paddingBottom: isMobile ? 16 : subtitle ? 28 : 16,
        paddingLeft: isMobile ? 16 : 40,
        borderBottom: "1px solid var(--ws-border)",
        background: "var(--ws-surface)",
      }}
    >
      <h1 style={{ fontSize: isMobile ? 26 : 30, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.04em", margin: 0, marginBottom: subtitle ? 8 : 0 }}>
        {title}
      </h1>
      {subtitle ? (
        <p style={{ fontSize: 15, color: "var(--ws-text-muted)", letterSpacing: "-0.02em", margin: 0, maxWidth: 560, lineHeight: 1.5 }}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  const lang = useLang();
  return (
    <div
      className="sp-list-in"
      style={{
        background: accent ? BLUE : "var(--ws-surface)",
        border: accent ? "none" : "1px solid var(--ws-border)",
        borderRadius: 16,
        padding: "22px 24px",
        boxShadow: accent ? "0 8px 24px rgba(0,71,255,0.15)" : "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 500, color: accent ? "rgba(255,255,255,0.8)" : "var(--ws-text-dim)", marginBottom: 10, letterSpacing: "-0.01em" }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, color: accent ? "#FFFFFF" : "var(--ws-text)", letterSpacing: "-0.04em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
        {typeof value === "number" ? <CountUp value={value} format={(n) => Math.round(n).toLocaleString(lang === "fr" ? "fr-FR" : "en-US")} /> : value}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: accent ? "rgba(255,255,255,0.65)" : "var(--ws-text-dim)", marginTop: 8, letterSpacing: "-0.01em" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function QuickAction({
  label,
  description,
  onClick,
}: {
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 4,
        textAlign: "left",
        padding: "16px 18px",
        borderRadius: 14,
        border: "1px solid var(--ws-border)",
        background: "var(--ws-surface)",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "border-color 0.15s ease, box-shadow 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#D6E4FF";
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,71,255,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--ws-border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em" }}>{label}</span>
      <span style={{ fontSize: 13, color: "var(--ws-text-muted)", letterSpacing: "-0.01em", lineHeight: 1.45 }}>{description}</span>
    </button>
  );
}

function Glyph({ d }: { d: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const GLYPH = {
  creators: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  outreach: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  sales: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0",
  campaigns: "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
  find: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
  gift: "M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z",
  payouts: "M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5M16 14h.01",
};

function HomeMetric({
  label,
  value,
  hint,
  icon,
  index,
  accent,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: string;
  index: number;
  accent?: boolean;
}) {
  return (
    <div className={`hm-metric${accent ? " is-accent" : ""}`} style={{ ["--i" as string]: index }}>
      <div className="hm-metric__top">
        <span className="hm-metric__label">{label}</span>
        <span className="hm-metric__icon">
          <Glyph d={icon} />
        </span>
      </div>
      <div className="hm-metric__value">
        <CountUp value={value} format={(n) => Math.round(n).toLocaleString("en-US")} />
      </div>
      {hint ? <div className="hm-metric__hint">{hint}</div> : null}
    </div>
  );
}

function HomeAction({
  label,
  description,
  icon,
  index,
  onClick,
}: {
  label: string;
  description: string;
  icon: string;
  index: number;
  onClick: () => void;
}) {
  return (
    <button type="button" className="hm-action" style={{ ["--i" as string]: index }} onClick={onClick}>
      <span className="hm-action__icon">
        <Glyph d={icon} />
      </span>
      <span className="hm-action__copy">
        <strong>{label}</strong>
        <span>{description}</span>
      </span>
    </button>
  );
}

function BrandHomeOverview({
  lang,
  userId,
  isMobile,
  displayName,
  businessName,
  gettingStarted,
  activeCampaigns,
  onNavigate,
}: {
  lang: "en" | "fr";
  userId?: string;
  isMobile?: boolean;
  displayName: string;
  businessName: string | null;
  gettingStarted: GettingStarted;
  activeCampaigns: number;
  onNavigate: (view: DashboardView) => void;
}) {
  const progress = {
    shopify: gettingStarted.shopify,
    creatorsCount: gettingStarted.creatorsCount,
    salesCount: gettingStarted.salesCount,
    activeCampaigns,
  };
  const nextStep = nextHomeStep(progress);
  const setupDone = HOME_STEP_ORDER.filter((id) => homeStepDone(id, progress)).length;
  const programEmpty =
    gettingStarted.countsLoaded === true &&
    !samplesHidden(userId) &&
    gettingStarted.creatorsCount === 0 &&
    gettingStarted.salesCount === 0 &&
    activeCampaigns === 0;
  const setupTotal = HOME_STEP_ORDER.length;

  const firstName = (displayName || "").trim().split(/\s+/)[0] || "";

  return (
    <>
      <MinoHomeHero firstName={firstName} userId={userId} isMobile={isMobile} onNavigate={onNavigate} />
      <div style={{ padding: isMobile ? 16 : 40, paddingTop: isMobile ? 20 : 32 }}>
        <div className="hm-section-title">
          <h2>Your program</h2>
          <span>{businessName ? businessName : "Creators, campaigns and sales"}</span>
        </div>
        <div className="hm-metrics">
          <HomeMetric index={0} label="Creators" value={gettingStarted.creatorsCount} hint="Managed" icon={GLYPH.creators} />
          <HomeMetric index={1} label="Outreach" value={gettingStarted.outreachCount} hint="Messages sent" icon={GLYPH.outreach} />
          <HomeMetric index={2} label="Sales" value={gettingStarted.salesCount} hint="Tracked orders" icon={GLYPH.sales} />
          <HomeMetric
            index={3}
            label="Active campaigns"
            value={activeCampaigns}
            hint={activeCampaigns > 0 ? "Running now" : "None running yet"}
            icon={GLYPH.campaigns}
            accent={activeCampaigns > 0}
          />
        </div>

        {gettingStarted.countsLoaded ? (
          <NextStepCard lang={lang} step={nextStep} done={setupDone} total={setupTotal} onGo={() => onNavigate(nextStep.view)} />
        ) : null}

        <div className="hm-section-title">
          <h2>Jump back in</h2>
        </div>
        <div className="hm-actions">
          <HomeAction index={0} label="Find creators" description="Search the catalog and save profiles." icon={GLYPH.find} onClick={() => onNavigate("discovery")} />
          <HomeAction index={1} label="Launch a campaign" description="Codes, links and commissions." icon={GLYPH.campaigns} onClick={() => onNavigate("campaigns")} />
          <HomeAction index={2} label="Send a gift" description="Contract, parcel and a video back." icon={GLYPH.gift} onClick={() => onNavigate("gifting")} />
          <HomeAction index={3} label="Pay creators" description="Commissions ready to pay." icon={GLYPH.payouts} onClick={() => onNavigate("payouts")} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile || !programEmpty ? "1fr" : "minmax(0,1fr) minmax(0,1.25fr)", gap: 16, alignItems: "start" }}>
        {setupDone < setupTotal && (
          <div style={{ background: "var(--ws-surface)", border: "1px solid var(--ws-border)", borderRadius: 16, padding: isMobile ? 20 : 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em", margin: 0 }}>
                {lang === "fr" ? "Mise en route" : "Getting started"}
              </h2>
              <span style={{ fontSize: 12, color: "var(--ws-text-dim)", letterSpacing: "-0.01em" }}>
                {setupDone}/{setupTotal}
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 999, background: "var(--ws-border)", marginBottom: 18, overflow: "hidden" }}>
              <div style={{ width: `${(setupDone / setupTotal) * 100}%`, height: "100%", background: BLUE, borderRadius: 999, transition: "width 0.3s ease" }} />
            </div>
            {[
              ...HOME_STEP_ORDER.map((id) => {
                const step = homeStepById(id);
                return { done: homeStepDone(id, progress), label: step.title[lang], view: step.view };
              }),
            ].map((step) => (
              <button
                key={step.label}
                type="button"
                onClick={() => !step.done && onNavigate(step.view)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: "12px 0",
                  border: "none",
                  borderBottom: "1px solid var(--ws-border)",
                  background: "transparent",
                  cursor: step.done ? "default" : "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: step.done ? BLUE : "transparent",
                    border: step.done ? "none" : "2px solid var(--ws-border-strong)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {step.done && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span style={{ fontSize: 14, color: step.done ? "var(--ws-text-dim)" : "var(--ws-text)", textDecoration: step.done ? "line-through" : "none", opacity: step.done ? 0.65 : 1 }}>
                  {step.label}
                </span>
              </button>
            ))}
          </div>
        )}
        {programEmpty ? <ProgramPreview lang={lang} onOpen={() => onNavigate("campaigns")} /> : null}
        </div>
      </div>
    </>
  );
}

function NextStepCard({
  lang,
  step,
  done,
  total,
  onGo,
}: {
  lang: "en" | "fr";
  step: HomeStep;
  done: number;
  total: number;
  onGo: () => void;
}) {
  const fr = lang === "fr";
  const pct = total > 0 ? done / total : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <section className="hs-card" key={step.id}>
      <div className="hs-ring" aria-label={fr ? `${done} étapes sur ${total}` : `${done} of ${total} steps`}>
        <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
          <circle cx="32" cy="32" r={r} className="hs-ring__track" />
          <circle
            cx="32"
            cy="32"
            r={r}
            className="hs-ring__fill"
            strokeDasharray={c}
            style={{ ["--hs-off" as string]: `${c * (1 - pct)}`, ["--hs-full" as string]: `${c}` }}
          />
        </svg>
        <span>
          {done}/{total}
        </span>
      </div>
      <div className="hs-copy">
        <p className="hs-kicker">{step.id === "grow" ? (fr ? "Et maintenant" : "What next") : fr ? "Prochaine étape" : "Next step"}</p>
        <h2>{step.title[lang]}</h2>
        <p>{step.body[lang]}</p>
      </div>
      <button type="button" className="es-primary hs-cta" onClick={onGo}>
        {step.cta[lang]}
        <span aria-hidden>→</span>
      </button>
    </section>
  );
}

function ProgramPreview({ lang, onOpen }: { lang: "en" | "fr"; onOpen: () => void }) {
  const fr = lang === "fr";
  const sample = SAMPLE_CAMPAIGN_DETAILS["sample-summer"];
  const byId = new Map(sample.creators.map((c) => [c.id, c]));
  return (
    <section className="sp-card" style={{ padding: 20 }}>
      <div className="sp-card__head">
        <div>
          <span className="sp-sample-tag" style={{ marginLeft: 0 }}>{fr ? "Exemple" : "Sample"}</span>
          <h2 style={{ marginTop: 8 }}>{fr ? "Ce que vous verrez ici, une fois lancé" : "What you will see here once live"}</h2>
        </div>
        <button type="button" className="sample-clear" onClick={onOpen}>
          {fr ? "Ouvrir l’exemple" : "Open the sample"}
        </button>
      </div>
      <RevenueChart lang={lang} days={sampleDailyRevenue(sample)} />
      <div style={{ marginTop: 14 }}>
        <ActivityFeed lang={lang} detail={sample} byId={byId} />
      </div>
    </section>
  );
}

function CreatorHomeOverview({
  lang,
  isMobile,
  userId,
  onNavigate,
}: {
  lang: "en" | "fr";
  isMobile?: boolean;
  userId?: string;
  onNavigate: (view: DashboardView) => void;
}) {
  useDisplayCurrency();
  const { stats, loading, error } = useCreatorStats(userId);

  const firstName = stats?.creatorName?.replace(/^@/, "").split(" ")[0] ?? "";
  const allSales = stats?.sales ?? [];

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  const saleStatusLabel = (status: string | null | undefined) => {
    const s = String(status || "pending").toLowerCase();
    if (s === "paid") return lang === "fr" ? "Payée" : "Paid";
    return lang === "fr" ? "En attente" : "Pending";
  };

  const saleStatusStyle = (status: string | null | undefined) => {
    const s = String(status || "pending").toLowerCase();
    if (s === "paid") return { bg: "#ECFDF3", color: "#1FB567" };
    return { bg: "#FFF7ED", color: "#D97706" };
  };

  if (loading) {
    return (
      <>
        <OverviewHeader isMobile={isMobile} title={lang === "fr" ? "Accueil" : "Home"} subtitle={lang === "fr" ? "Chargement…" : "Loading…"} />
        <div style={{ padding: isMobile ? 16 : 40, color: "var(--ws-text-dim)", fontSize: 14 }}>{lang === "fr" ? "Chargement de votre overview…" : "Loading your overview…"}</div>
      </>
    );
  }

  return (
    <>
      <OverviewHeader
        isMobile={isMobile}
        title={firstName ? (lang === "fr" ? `Bonjour, ${firstName}` : `Hi, ${firstName}`) : lang === "fr" ? "Accueil" : "Home"}
      />
      <div style={{ padding: isMobile ? 16 : 40, paddingTop: isMobile ? 16 : 24 }}>
        {error && (
          <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 12, background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)", fontSize: 13, color: "var(--ws-danger)" }}>
            {error}
          </div>
        )}
        {!stats?.linked && !error && (
          <div style={{ marginBottom: 20, padding: "12px 14px", borderRadius: 12, background: "var(--ws-surface-2)", border: "1px solid var(--ws-border)", fontSize: 13, color: "var(--ws-text-muted)", lineHeight: 1.5 }}>
            {lang === "fr"
              ? "Votre compte n'est pas encore relié à une fiche créateur. Acceptez l'invitation de la marque ou vérifiez que votre pseudo correspond."
              : "Your account isn't linked to a creator profile yet. Accept the brand invite or make sure your handle matches."}
          </div>
        )}
        {stats?.discountCode && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 20,
              padding: "8px 14px",
              borderRadius: 999,
              background: "rgba(0,71,255,0.06)",
              border: "1px solid rgba(0,71,255,0.12)",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--ws-text-muted)" }}>{lang === "fr" ? "Code promo" : "Promo code"}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ws-accent)" }}>{stats.discountCode}</span>
            {stats.commissionRate != null && <span style={{ fontSize: 13, color: "var(--ws-text-dim)" }}>· {stats.commissionRate}%</span>}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
          <MetricCard
            label={lang === "fr" ? "Ventes générées" : "Sales driven"}
            value={formatCurrency(stats?.totalSales ?? 0, lang)}
            hint={lang === "fr" ? `${stats?.salesCount ?? 0} commande(s) via votre code` : `${stats?.salesCount ?? 0} order(s) via your code`}
          />
          <MetricCard
            label={lang === "fr" ? "Commissions" : "Commissions"}
            value={formatCurrency(stats?.totalCommissions ?? 0, lang)}
            hint={lang === "fr" ? "Total cumulé" : "All-time total"}
          />
          <MetricCard
            label={lang === "fr" ? "Solde à recevoir" : "Balance due"}
            value={formatCurrency(stats?.balance ?? 0, lang)}
            hint={lang === "fr" ? "Après paiements déjà versés" : "After completed payouts"}
            accent={(stats?.balance ?? 0) > 0}
          />
        </div>

        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em", margin: "0 0 12px" }}>
            {lang === "fr" ? "Actions rapides" : "Quick actions"}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 12 }}>
            <QuickAction
              label={lang === "fr" ? "Mes paiements" : "My payouts"}
              description={lang === "fr" ? "Solde, IBAN et historique de versements." : "Balance, payout method, and history."}
              onClick={() => onNavigate("payouts")}
            />
            <QuickAction
              label="Scripts"
              description={lang === "fr" ? "Briefs et scripts envoyés par la marque." : "Briefs and scripts from the brand."}
              onClick={() => onNavigate("scripts")}
            />
            <QuickAction
              label="Content"
              description={lang === "fr" ? "Envoyez vos vidéos et fichiers à la marque." : "Upload your videos and files to the brand."}
              onClick={() => onNavigate("content")}
            />
          </div>
        </div>

        <div style={{ background: "var(--ws-surface)", border: "1px solid var(--ws-border)", borderRadius: 16, overflow: "hidden" }}>
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--ws-border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ws-text)", letterSpacing: "-0.02em" }}>
              {lang === "fr" ? "Mes ventes" : "My sales"}
            </div>
            {allSales.length > 0 && (
              <span style={{ fontSize: 12, color: "var(--ws-text-dim)", letterSpacing: "-0.01em" }}>
                {allSales.length} {lang === "fr" ? "vente(s)" : "sale(s)"}
              </span>
            )}
          </div>
          {allSales.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", fontSize: 14, color: "var(--ws-text-muted)", lineHeight: 1.5 }}>
              {lang === "fr"
                ? "Vos ventes apparaîtront ici dès qu'une commande passe avec votre code promo."
                : "Your sales will show here once an order comes in with your promo code."}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: isMobile ? 520 : undefined }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--ws-border)" }}>
                    <th style={{ textAlign: "left", padding: "12px 20px", color: "var(--ws-text-dim)", fontWeight: 500 }}>
                      {lang === "fr" ? "Date" : "Date"}
                    </th>
                    {!isMobile && (
                      <th style={{ textAlign: "left", padding: "12px 20px", color: "var(--ws-text-dim)", fontWeight: 500 }}>
                        {lang === "fr" ? "Marque" : "Brand"}
                      </th>
                    )}
                    <th style={{ textAlign: "left", padding: "12px 20px", color: "var(--ws-text-dim)", fontWeight: 500 }}>
                      {lang === "fr" ? "Code" : "Code"}
                    </th>
                    <th style={{ textAlign: "right", padding: "12px 20px", color: "var(--ws-text-dim)", fontWeight: 500 }}>
                      {lang === "fr" ? "Vente" : "Sale"}
                    </th>
                    <th style={{ textAlign: "right", padding: "12px 20px", color: "var(--ws-text-dim)", fontWeight: 500 }}>
                      {lang === "fr" ? "Commission" : "Commission"}
                    </th>
                    <th style={{ textAlign: "right", padding: "12px 20px", color: "var(--ws-text-dim)", fontWeight: 500 }}>
                      {lang === "fr" ? "Statut" : "Status"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allSales.map((sale) => {
                    const statusStyle = saleStatusStyle(sale.status);
                    return (
                      <tr key={sale.id} style={{ borderBottom: "1px solid var(--ws-border)" }}>
                        <td style={{ padding: "14px 20px", color: "var(--ws-text)", whiteSpace: "nowrap" }}>{fmtDate(sale.date)}</td>
                        {!isMobile && (
                          <td style={{ padding: "14px 20px", color: "var(--ws-text-muted)" }}>{sale.brandName || "—"}</td>
                        )}
                        <td style={{ padding: "14px 20px", color: "var(--ws-text-muted)", fontFamily: "monospace", fontSize: 13 }}>
                          {sale.discountCode || "—"}
                        </td>
                        <td style={{ padding: "14px 20px", textAlign: "right", color: "var(--ws-text)" }}>
                          {formatCurrency(sale.orderAmount, lang)}
                        </td>
                        <td style={{ padding: "14px 20px", textAlign: "right", color: "var(--ws-accent)", fontWeight: 600 }}>
                          {formatCurrency(sale.commissionAmount, lang)}
                        </td>
                        <td style={{ padding: "14px 20px", textAlign: "right" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 8px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 600,
                              background: statusStyle.bg,
                              color: statusStyle.color,
                            }}
                          >
                            {saleStatusLabel(sale.status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function HomeOverviewView({
  isMobile,
  isCreator,
  fullName,
  username,
  businessName,
  userId,
  gettingStarted,
  activeCampaigns,
  onNavigate,
}: {
  isMobile?: boolean;
  isCreator?: boolean;
  fullName: string | null;
  username: string | null;
  businessName: string | null;
  userId?: string;
  gettingStarted: GettingStarted;
  activeCampaigns: number;
  onNavigate: (view: DashboardView) => void;
}) {
  const lang = useLang();
  const displayName = fullName?.split(" ")[0] || (username ? username.replace(/^@/, "") : "");

  if (isCreator) {
    return <CreatorHomeOverview lang={lang} isMobile={isMobile} userId={userId} onNavigate={onNavigate} />;
  }

  return (
    <BrandHomeOverview
      lang={lang}
      userId={userId}
      isMobile={isMobile}
      displayName={displayName}
      businessName={businessName}
      gettingStarted={gettingStarted}
      activeCampaigns={activeCampaigns}
      onNavigate={onNavigate}
    />
  );
}
