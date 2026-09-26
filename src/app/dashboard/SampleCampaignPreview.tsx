"use client";

import { useId, useMemo, useRef, useState } from "react";
import { PlatformBrandIcon } from "./PlatformBrandIcon";
import { CountUp, SampleAvatar, useLiveFeed } from "./sample-motion";
import {
  SAMPLE_GIFT_STAGES,
  creatorCommission,
  sampleCampaignTotals,
  sampleDailyRevenue,
  sampleWeekTrend,
  type SampleActivity,
  type SampleCampaignDetail,
  type SampleCreator,
  type SampleGiftStage,
} from "@/lib/sample-campaign-preview";
import "./sample-preview.css";

type Lang = "en" | "fr";
type Tab = "overview" | "creators" | "content" | "gifting" | "payouts";

export function formatMoney(n: number, lang: Lang, decimals = 0): string {
  return new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency: lang === "fr" ? "EUR" : "USD",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n);
}

export function formatCount(n: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US", {
    notation: n >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(Math.round(n));
}

export const GIFT_STAGE_LABELS: Record<SampleGiftStage, { en: string; fr: string }> = {
  invited: { en: "Invited", fr: "Invité" },
  signed: { en: "Contract signed", fr: "Contrat signé" },
  shipped: { en: "Shipped", fr: "Expédié" },
  delivered: { en: "Delivered", fr: "Reçu" },
  submitted: { en: "Video in review", fr: "Vidéo à valider" },
  approved: { en: "Approved", fr: "Validée" },
};

const STATUS_LABELS: Record<SampleCreator["status"], { en: string; fr: string }> = {
  live: { en: "Live", fr: "En ligne" },
  shipping: { en: "Parcel on its way", fr: "Colis en route" },
  invited: { en: "Invited", fr: "Invité" },
  shortlisted: { en: "Shortlisted", fr: "Présélectionné" },
};

export function SampleCampaignPreview({
  lang,
  detail,
  name,
  isDraft,
  isMobile,
  onBack,
  onCreate,
  onDismiss,
}: {
  lang: Lang;
  detail: SampleCampaignDetail;
  name: string;
  isDraft?: boolean;
  isMobile?: boolean;
  onBack: () => void;
  onCreate: () => void;
  onDismiss?: () => void;
}) {
  const fr = lang === "fr";
  const totals = useMemo(() => sampleCampaignTotals(detail), [detail]);
  const [tab, setTab] = useState<Tab>(isDraft ? "gifting" : "overview");
  const byId = useMemo(() => new Map(detail.creators.map((c) => [c.id, c])), [detail]);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: fr ? "Vue d’ensemble" : "Overview" },
    { id: "creators", label: fr ? "Créateurs" : "Creators", count: detail.creators.length },
    { id: "content", label: fr ? "Contenus" : "Content", count: detail.content.length },
    { id: "gifting", label: fr ? "Colis & contrats" : "Gifts & contracts", count: detail.gifts.length },
    { id: "payouts", label: fr ? "Paiements" : "Payouts" },
  ];

  return (
    <div className={`sp-page${isMobile ? " is-mobile" : ""}`}>
      <div className="sp-top">
        <button type="button" className="sp-back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {fr ? "Campagnes" : "Campaigns"}
        </button>
        <div className="sp-top__actions">
          {onDismiss ? (
            <button type="button" className="sample-clear" onClick={onDismiss}>
              {fr ? "Masquer les exemples" : "Hide samples"}
            </button>
          ) : null}
          <button type="button" className="es-primary" onClick={onCreate}>
            {fr ? "Créer ma campagne" : "Create my campaign"}
          </button>
        </div>
      </div>

      <div className="sp-banner" role="note">
        <span className="sp-banner__dot" aria-hidden />
        <p>
          {fr
            ? "Campagne d’exemple, avec des créateurs fictifs. Voici à quoi ressemble la vôtre une fois lancée : les chiffres se mettent à jour à chaque vente, vidéo et colis."
            : "Sample campaign with fictional creators. This is what yours looks like once it is live: numbers update with every sale, video and parcel."}
        </p>
      </div>

      <header className="sp-head">
        <div>
          <div className="sp-head__meta">
            <span className={`sp-status${isDraft ? " is-draft" : ""}`}>
              <i aria-hidden />
              {isDraft ? (fr ? "Brouillon" : "Draft") : fr ? "Active" : "Active"}
            </span>
            <span className="sp-kind">
              {detail.kind === "gifting" ? "Gifting" : `${fr ? "Affiliation" : "Affiliate"} · ${detail.commissionRate} %`}
            </span>
          </div>
          <h1>{name}</h1>
          <p className="sp-head__product">{detail.product[lang]}</p>
        </div>
        <div className="sp-stack" aria-hidden>
          {detail.creators.slice(0, 5).map((c, i) => (
            <span key={c.id} style={{ zIndex: 10 - i }}>
              <SampleAvatar name={c.name} hue={c.hue} size={34} />
            </span>
          ))}
          {detail.creators.length > 5 ? <span className="sp-stack__more">+{detail.creators.length - 5}</span> : null}
        </div>
      </header>

      <nav className="sp-tabs" aria-label={fr ? "Sections de la campagne" : "Campaign sections"}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "is-on" : ""}
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {typeof t.count === "number" ? <em>{t.count}</em> : null}
          </button>
        ))}
      </nav>

      <div className="sp-body" key={tab}>
        {tab === "overview" ? (
          isDraft ? (
            <DraftOverview lang={lang} detail={detail} onCreate={onCreate} />
          ) : (
            <Overview lang={lang} detail={detail} byId={byId} />
          )
        ) : null}
        {tab === "creators" ? <CreatorsTable lang={lang} detail={detail} /> : null}
        {tab === "content" ? <ContentGrid lang={lang} detail={detail} byId={byId} isDraft={isDraft} /> : null}
        {tab === "gifting" ? <GiftPipeline lang={lang} detail={detail} byId={byId} /> : null}
        {tab === "payouts" ? <Payouts lang={lang} detail={detail} totals={totals} /> : null}
      </div>
    </div>
  );
}

function Overview({
  lang,
  detail,
  byId,
}: {
  lang: Lang;
  detail: SampleCampaignDetail;
  byId: Map<string, SampleCreator>;
}) {
  const fr = lang === "fr";
  const totals = sampleCampaignTotals(detail);
  const trend = sampleWeekTrend(detail);
  const kpis = [
    {
      label: fr ? "Chiffre d’affaires" : "Revenue",
      value: totals.revenue,
      format: (n: number) => formatMoney(n, lang),
      sub:
        trend === null
          ? fr ? "Lancée cette semaine" : "Launched this week"
          : fr ? `${trend >= 0 ? "+" : ""}${trend} % sur 7 jours` : `${trend >= 0 ? "+" : ""}${trend}% over 7 days`,
      up: trend !== null && trend >= 0,
    },
    { label: fr ? "Commandes" : "Orders", value: totals.orders, format: (n: number) => formatCount(n, lang), sub: fr ? `${totals.creators} créateurs actifs` : `${totals.creators} active creators` },
    { label: fr ? "Vues cumulées" : "Total views", value: totals.views, format: (n: number) => formatCount(n, lang), sub: fr ? `${totals.videos} vidéos publiées` : `${totals.videos} videos published` },
    { label: fr ? "Retour sur commission" : "Return on commission", value: totals.roi ?? 0, format: (n: number) => `×${n.toFixed(1)}`, sub: fr ? `${formatMoney(totals.commission, lang)} de commissions` : `${formatMoney(totals.commission, lang)} in commissions` },
  ];
  const leaders = [...detail.creators].filter((c) => c.status !== "shortlisted").sort((a, b) => b.revenue - a.revenue);
  const best = leaders[0]?.revenue ?? 1;

  return (
    <div className="sp-overview">
      <div className="sp-kpis">
        {kpis.map((k, i) => (
          <div key={k.label} className="sp-kpi" style={{ animationDelay: `${i * 70}ms` }}>
            <span>{k.label}</span>
            <strong>
              <CountUp value={k.value} format={k.format} delayMs={i * 90} />
            </strong>
            <small className={k.up ? "is-up" : ""}>{k.sub}</small>
          </div>
        ))}
      </div>

      <div className="sp-grid">
        <section className="sp-card sp-card--chart">
          <div className="sp-card__head">
            <h2>{fr ? "Ventes des 30 derniers jours" : "Sales, last 30 days"}</h2>
            <span className="sp-live"><i aria-hidden />{fr ? "En direct" : "Live"}</span>
          </div>
          <RevenueChart lang={lang} days={sampleDailyRevenue(detail)} />
        </section>

        <section className="sp-card">
          <div className="sp-card__head">
            <h2>{fr ? "Activité" : "Activity"}</h2>
          </div>
          <ActivityFeed lang={lang} detail={detail} byId={byId} />
        </section>
      </div>

      <section className="sp-card">
        <div className="sp-card__head">
          <h2>{fr ? "Meilleurs créateurs" : "Top creators"}</h2>
          <span className="sp-muted">{fr ? "par chiffre d’affaires" : "by revenue"}</span>
        </div>
        <ol className="sp-leaders">
          {leaders.slice(0, 5).map((c, i) => (
            <li key={c.id} style={{ animationDelay: `${120 + i * 80}ms` }}>
              <span className="sp-rank">{i + 1}</span>
              <SampleAvatar name={c.name} hue={c.hue} size={30} />
              <div className="sp-leaders__who">
                <strong>{c.name}</strong>
                <span>
                  <PlatformBrandIcon platform={c.platform} size={12} /> @{c.handle}
                </span>
              </div>
              <div className="sp-leaders__bar" aria-hidden>
                <span style={{ ["--w" as string]: `${Math.max(6, (c.revenue / best) * 100)}%`, animationDelay: `${200 + i * 90}ms` }} />
              </div>
              <strong className="sp-num">{formatMoney(c.revenue, lang)}</strong>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export function RevenueChart({ lang, days }: { lang: Lang; days: number[] }) {
  // Home and the campaign preview can both be mounted: each chart needs its own gradient id.
  const gradientId = `sp-area-${useId().replace(/:/g, "")}`;
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const height = 200;
  const pad = 8;
  const max = Math.max(1, ...days);
  const step = days.length > 1 ? (width - pad * 2) / (days.length - 1) : 0;
  const points = days.map((v, i) => [pad + i * step, height - pad - (v / max) * (height - pad * 2 - 16)] as const);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${(pad + (days.length - 1) * step).toFixed(1)},${height - pad} L${pad},${height - pad} Z`;
  const active = hover !== null ? points[hover] : null;
  const dot = active ?? points[points.length - 1] ?? null;
  const dayLabel = (i: number) => {
    const d = new Date(Date.now() - (days.length - 1 - i) * 86_400_000);
    return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "short" });
  };

  return (
    <div className="sp-chart">
      <div className="sp-chart__plot">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={lang === "fr" ? "Courbe des ventes quotidiennes" : "Daily sales curve"}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * width;
          const i = Math.round((x - pad) / (step || 1));
          setHover(Math.max(0, Math.min(days.length - 1, i)));
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--ws-accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--ws-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={width} y1={height * f} y2={height * f} className="sp-chart__grid" />
        ))}
        <path d={area} fill={`url(#${gradientId})`} className="sp-chart__area" />
        <path d={line} fill="none" className="sp-chart__line" pathLength={1} />
        {active ? <line x1={active[0]} x2={active[0]} y1={0} y2={height} className="sp-chart__cursor" /> : null}
      </svg>
      {dot ? (
        <span
          className={`sp-chart__pt${active ? "" : " is-pulse"}`}
          aria-hidden
          style={{ left: `${(dot[0] / width) * 100}%`, top: `${(dot[1] / height) * 100}%` }}
        />
      ) : null}
      </div>
      {hover !== null ? (
        <div className="sp-chart__tip" style={{ left: `${(points[hover][0] / width) * 100}%` }}>
          <span>{dayLabel(hover)}</span>
          <strong>{formatMoney(days[hover], lang)}</strong>
        </div>
      ) : null}
      <div className="sp-chart__axis" aria-hidden>
        <span>{dayLabel(0)}</span>
        <span>{dayLabel(Math.floor(days.length / 2))}</span>
        <span>{lang === "fr" ? "Aujourd’hui" : "Today"}</span>
      </div>
    </div>
  );
}

function activityText(event: SampleActivity, who: string, lang: Lang): { text: string; tone: string; value?: string } {
  const fr = lang === "fr";
  switch (event.type) {
    case "sale":
      return { text: fr ? `${who} a généré une vente` : `${who} drove a sale`, tone: "sale", value: `+${formatMoney(event.amount, lang)}` };
    case "video":
      return { text: fr ? `${who} a publié une vidéo` : `${who} posted a video`, tone: "video", value: `${formatCount(event.views, lang)} ${fr ? "vues" : "views"}` };
    case "signed":
      return { text: fr ? `${who} a signé le contrat` : `${who} signed the contract`, tone: "signed" };
    case "delivered":
      return { text: fr ? `Colis reçu par ${who}` : `Parcel received by ${who}`, tone: "delivered" };
    case "approved":
      return { text: fr ? `Vidéo de ${who} validée` : `${who}’s video approved`, tone: "approved" };
  }
}

export function ActivityFeed({
  lang,
  detail,
  byId,
}: {
  lang: Lang;
  detail: SampleCampaignDetail;
  byId: Map<string, SampleCreator>;
}) {
  const host = useRef<HTMLUListElement>(null);
  const feed = useLiveFeed(detail.activity, 5, 2800, host);
  const fr = lang === "fr";
  return (
    <ul className="sp-feed" ref={host}>
      {feed.map(({ item, key }, i) => {
        const c = byId.get(item.creatorId);
        if (!c) return null;
        const t = activityText(item, c.name.split(" ")[0], lang);
        return (
          <li key={key} className={`sp-feed__item is-${t.tone}`}>
            <SampleAvatar name={c.name} hue={c.hue} size={28} />
            <div>
              <p>{t.text}</p>
              <small>{i === 0 ? (fr ? "à l’instant" : "just now") : fr ? `il y a ${i * 4} min` : `${i * 4} min ago`}</small>
            </div>
            {t.value ? <strong>{t.value}</strong> : null}
          </li>
        );
      })}
    </ul>
  );
}

function CreatorsTable({ lang, detail }: { lang: Lang; detail: SampleCampaignDetail }) {
  const fr = lang === "fr";
  return (
    <section className="sp-card sp-card--flush">
      <div className="sp-table" role="table" aria-label={fr ? "Créateurs de la campagne" : "Campaign creators"}>
        <div className="sp-table__row sp-table__row--head" role="row">
          <span role="columnheader">{fr ? "Créateur" : "Creator"}</span>
          <span role="columnheader">{fr ? "Abonnés" : "Followers"}</span>
          <span role="columnheader">{fr ? "Vues" : "Views"}</span>
          <span role="columnheader">{fr ? "Commandes" : "Orders"}</span>
          <span role="columnheader">{fr ? "CA" : "Revenue"}</span>
          <span role="columnheader">{fr ? "Statut" : "Status"}</span>
        </div>
        {detail.creators.map((c, i) => (
          <div key={c.id} className="sp-table__row" role="row" style={{ animationDelay: `${i * 60}ms` }}>
            <span role="cell" className="sp-who">
              <SampleAvatar name={c.name} hue={c.hue} size={32} />
              <span>
                <strong>{c.name}</strong>
                <small>
                  <PlatformBrandIcon platform={c.platform} size={12} /> @{c.handle}
                </small>
              </span>
            </span>
            <span role="cell" className="sp-num">{formatCount(c.followers, lang)}</span>
            <span role="cell" className="sp-num">{c.views ? formatCount(c.views, lang) : "—"}</span>
            <span role="cell" className="sp-num">{c.orders || "—"}</span>
            <span role="cell" className="sp-num">{c.revenue ? formatMoney(c.revenue, lang) : "—"}</span>
            <span role="cell">
              <span className={`sp-pill is-${c.status}`}>{STATUS_LABELS[c.status][lang]}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ContentGrid({
  lang,
  detail,
  byId,
  isDraft,
}: {
  lang: Lang;
  detail: SampleCampaignDetail;
  byId: Map<string, SampleCreator>;
  isDraft?: boolean;
}) {
  const fr = lang === "fr";
  if (detail.content.length === 0) {
    return (
      <div className="sp-empty">
        <div className="sp-empty__phones" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ animationDelay: `${i * 0.4}s` }}><i /></span>
          ))}
        </div>
        <p>
          {isDraft
            ? fr
              ? "Les vidéos arrivent ici dès qu’un créateur a reçu son colis et déposé son contenu. Vous validez ou demandez une modification, en un clic."
              : "Videos land here once a creator has received the parcel and uploaded. Approve or ask for changes in one click."
            : fr
              ? "Aucune vidéo pour l’instant."
              : "No videos yet."}
        </p>
      </div>
    );
  }
  return (
    <div className="sp-videos">
      {detail.content.map((item, i) => {
        const c = byId.get(item.creatorId);
        if (!c) return null;
        return (
          <article key={item.id} className="sp-video" style={{ animationDelay: `${i * 70}ms` }}>
            <div
              className="sp-video__frame"
              style={{
                background: `linear-gradient(160deg, hsl(${c.hue} 70% 62%), hsl(${(c.hue + 60) % 360} 60% 38%))`,
              }}
            >
              <span className="sp-video__blob" aria-hidden />
              <span className="sp-video__platform"><PlatformBrandIcon platform={c.platform} size={14} /></span>
              <span className="sp-video__play" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
              </span>
              <span className="sp-video__caption">{item.title[lang]}</span>
              <span className="sp-video__progress" aria-hidden style={{ animationDuration: `${item.durationSec / 3}s` }} />
            </div>
            <div className="sp-video__meta">
              <span className="sp-who sp-who--small">
                <SampleAvatar name={c.name} hue={c.hue} size={20} />@{c.handle}
              </span>
              <span className="sp-video__stats">
                <span>▶ {formatCount(item.views, lang)}</span>
                <span>♥ {formatCount(item.likes, lang)}</span>
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function GiftPipeline({
  lang,
  detail,
  byId,
}: {
  lang: Lang;
  detail: SampleCampaignDetail;
  byId: Map<string, SampleCreator>;
}) {
  const fr = lang === "fr";
  return (
    <div className="sp-gifts">
      <div className="sp-parcel" aria-hidden>
        <div className="sp-parcel__rail">
          {SAMPLE_GIFT_STAGES.map((stage) => (
            <span key={stage} className="sp-parcel__stop" />
          ))}
          <span className="sp-parcel__box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5v-9z" fill="var(--ws-surface)" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M3 7.5L12 12l9-4.5M12 12v9M7.5 5.2l9 4.6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>
      <div className="sp-board">
        {SAMPLE_GIFT_STAGES.map((stage, col) => {
          const cards = detail.gifts.filter((g) => g.stage === stage);
          return (
            <section key={stage} className="sp-board__col" style={{ animationDelay: `${col * 70}ms` }}>
              <header>
                <span>{GIFT_STAGE_LABELS[stage][lang]}</span>
                <em>{cards.length}</em>
              </header>
              {cards.length === 0 ? <div className="sp-board__empty" /> : null}
              {cards.map((g) => {
                const c = byId.get(g.creatorId);
                if (!c) return null;
                return (
                  <article key={g.creatorId} className="sp-board__card">
                    <span className="sp-who sp-who--small">
                      <SampleAvatar name={c.name} hue={c.hue} size={22} />
                      <strong>{c.name}</strong>
                    </span>
                    {g.carrier ? (
                      <small>
                        {g.carrier} · {g.tracking?.slice(-6)}
                      </small>
                    ) : (
                      <small>
                        {c.status === "shortlisted"
                          ? fr ? "Présélectionné · pas encore invité" : "Shortlisted · not invited yet"
                          : stage === "invited"
                            ? fr ? "Attend sa réponse" : "Waiting for a reply"
                            : fr ? "Adresse reçue" : "Address received"}
                      </small>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
      <div className="sp-contract">
        <div>
          <p className="gift-contract__kicker">{fr ? "Contrat figé" : "Frozen contract"}</p>
          <h3>{fr ? "Ce que chaque créateur signe" : "What every creator signs"}</h3>
          <p>{detail.brief[lang]}</p>
        </div>
        <ul>
          <li>
            <span>{fr ? "Produit offert" : "Gifted product"}</span>
            <strong>{detail.product[lang]}</strong>
          </li>
          <li>
            <span>{fr ? "Droits publicitaires" : "Ad rights"}</span>
            <strong>
              {detail.adRightsDays} {fr ? "jours" : "days"} · {detail.territories}
            </strong>
          </li>
          <li>
            <span>{fr ? "Départ des droits" : "Rights start"}</span>
            <strong>{fr ? "À la validation de la vidéo" : "When the video is approved"}</strong>
          </li>
        </ul>
      </div>
    </div>
  );
}

function Payouts({
  lang,
  detail,
  totals,
}: {
  lang: Lang;
  detail: SampleCampaignDetail;
  totals: ReturnType<typeof sampleCampaignTotals>;
}) {
  const fr = lang === "fr";
  const rows = detail.creators.filter((c) => c.status !== "shortlisted");
  if (rows.length === 0) {
    return (
      <div className="sp-empty">
        <p>
          {fr
            ? "Pas de commission sur un gifting pur : le produit offert est la contrepartie. Si vous ajoutez un code, les commissions dues apparaissent ici."
            : "A pure gifting campaign has no commission: the gifted product is the fee. Add a code and what each creator is owed shows up here."}
        </p>
      </div>
    );
  }
  return (
    <div className="sp-payouts">
      <div className="sp-kpis sp-kpis--three">
        <div className="sp-kpi">
          <span>{fr ? "Commissions générées" : "Commissions earned"}</span>
          <strong><CountUp value={totals.commission} format={(n) => formatMoney(n, lang)} /></strong>
        </div>
        <div className="sp-kpi">
          <span>{fr ? "Déjà payé" : "Paid"}</span>
          <strong><CountUp value={totals.paid} format={(n) => formatMoney(n, lang)} delayMs={90} /></strong>
        </div>
        <div className="sp-kpi">
          <span>{fr ? "Reste dû" : "Still owed"}</span>
          <strong><CountUp value={totals.owed} format={(n) => formatMoney(n, lang)} delayMs={180} /></strong>
        </div>
      </div>
      <section className="sp-card sp-card--flush">
        {rows.map((c, i) => {
          const earned = creatorCommission(detail, c);
          const pct = earned > 0 ? Math.min(100, (c.paid / earned) * 100) : 0;
          return (
            <div key={c.id} className="sp-payrow" style={{ animationDelay: `${i * 60}ms` }}>
              <span className="sp-who">
                <SampleAvatar name={c.name} hue={c.hue} size={30} />
                <span>
                  <strong>{c.name}</strong>
                  <small>{c.orders} {fr ? "ventes" : "sales"} · {detail.commissionRate} %</small>
                </span>
              </span>
              <div className="sp-payrow__meter" aria-hidden>
                <span style={{ ["--w" as string]: `${pct}%`, animationDelay: `${160 + i * 80}ms` }} />
              </div>
              <span className="sp-num">{formatMoney(c.paid, lang)} / {formatMoney(earned, lang)}</span>
              <span className={`sp-pill ${earned - c.paid <= 0.005 ? "is-live" : "is-shipping"}`}>
                {earned - c.paid <= 0.005 ? (fr ? "Soldé" : "Settled") : fr ? "À payer" : "To pay"}
              </span>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function DraftOverview({
  lang,
  detail,
  onCreate,
}: {
  lang: Lang;
  detail: SampleCampaignDetail;
  onCreate: () => void;
}) {
  const fr = lang === "fr";
  const steps = fr
    ? ["Brief et produit", "Présélection", "Invitations", "Contrats signés", "Colis", "Vidéos validées"]
    : ["Brief and product", "Shortlist", "Invites", "Signed contracts", "Parcels", "Approved videos"];
  return (
    <div className="sp-overview">
      <section className="sp-card sp-draft">
        <div>
          <h2>{fr ? "Prête à être lancée" : "Ready to launch"}</h2>
          <p>{detail.brief[lang]}</p>
          <button type="button" className="es-primary" onClick={onCreate}>
            {fr ? "Lancer une campagne de gifting" : "Launch a gifting campaign"}
          </button>
        </div>
        <ol className="sp-draft__steps">
          {steps.map((s, i) => (
            <li key={s} className={i < 2 ? "is-done" : ""} style={{ animationDelay: `${i * 90}ms` }}>
              <span>{i < 2 ? "✓" : i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
