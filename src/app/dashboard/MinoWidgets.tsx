"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DashboardNavState } from "@/lib/dashboard-navigation";
import type { DashboardView } from "@/lib/dashboard-view-storage";
import { revenuePeriodLabel } from "@/lib/mino-revenue-parse";
import type { MinoActionCard, MinoCreatorRef, MinoRevenueSnapshot } from "@/lib/mino-widgets";
import { useLang, type Lang } from "@/lib/useLang";
import { PlatformLogo } from "@/components/PlatformLogo";
import { CreatorAvatar } from "./CreatorAvatar";
import { RevenueChart, formatMoney } from "./SampleCampaignPreview";
import { CountUp } from "./sample-motion";
import "./mino-widgets.css";

// The UI Mino builds in the chat: a live revenue dashboard, a card for each
// action it runs, and an error card with a retry. Numbers always come from the
// snapshot read from the brand's endpoints; nothing here invents a figure.

type Go = (state: DashboardNavState) => void;

function money(n: number, lang: Lang): string {
  return formatMoney(n, lang, Math.abs(n) < 100 && n % 1 !== 0 ? 2 : 0);
}

function Glyph({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const ICONS = {
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-4 3 3 6-7" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </>
  ),
  shop: (
    <>
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9h18v1.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" />
      <path d="M5 13v7h14v-7M10 20v-4h4v4" />
    </>
  ),
  megaphone: (
    <>
      <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    </>
  ),
  wallet: (
    <>
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
      <circle cx="16.5" cy="14" r="1.2" fill="currentColor" />
    </>
  ),
  task: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8.5 12.5l2.5 2.5 5-5.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16.2 16.2 20 20" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5v.01" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5" />
      <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18.5 14.8c1.7.8 2.8 2.6 3 5.2" />
    </>
  ),
};

const VIEW_LABELS: Partial<Record<DashboardView, { en: string; fr: string }>> = {
  dashboard: { en: "Home", fr: "l’accueil" },
  analytics: { en: "Analytics", fr: "les analytics" },
  payouts: { en: "Payouts", fr: "les paiements" },
  balance: { en: "Balance", fr: "le solde" },
  campaigns: { en: "Campaigns", fr: "les campagnes" },
  creators: { en: "Creators", fr: "les créateurs" },
  "my-creators": { en: "Saved creators", fr: "les créateurs enregistrés" },
  discovery: { en: "Discovery", fr: "la découverte" },
  outreach: { en: "Outreach", fr: "l’outreach" },
  notifications: { en: "Inbox", fr: "l’inbox" },
  tasks: { en: "Tasks", fr: "les tâches" },
  planner: { en: "Planner", fr: "le planning" },
  "planner-notes": { en: "Notes", fr: "les notes" },
  whiteboard: { en: "Whiteboard", fr: "le whiteboard" },
  "brand-content": { en: "Content", fr: "le contenu" },
  content: { en: "Content", fr: "le contenu" },
  integrations: { en: "Integrations", fr: "les intégrations" },
  settings: { en: "Settings", fr: "les réglages" },
  billing: { en: "Billing", fr: "la facturation" },
  help: { en: "Help", fr: "l’aide" },
  rpm: { en: "RPM", fr: "le RPM" },
  hooks: { en: "Hooks", fr: "les hooks" },
  community: { en: "Community", fr: "la communauté" },
  invitations: { en: "Invitations", fr: "les invitations" },
  infos: { en: "Brand infos", fr: "les infos de la marque" },
};

export function viewLabel(view: DashboardView | undefined, lang: Lang): string {
  const l = view ? VIEW_LABELS[view] : undefined;
  if (!l) return lang === "fr" ? "la page" : "the page";
  return lang === "fr" ? l.fr : l.en;
}

function Avatar({ c, size }: { c: MinoCreatorRef; size: number }) {
  return (
    <span className="mw-avatar" style={{ width: size, height: size }}>
      <CreatorAvatar src={c.avatarUrl} username={c.handle} displayName={c.name} size={size} />
      <span className="mw-avatar__platform">
        <PlatformLogo platform={c.platform} size={Math.max(10, Math.round(size * 0.36))} />
      </span>
    </span>
  );
}

function Trend({ current, previous, lang }: { current: number; previous: number; lang: Lang }) {
  const fr = lang === "fr";
  if (previous <= 0 && current <= 0) return null;
  if (previous <= 0) return <span className="mw-trend is-up">{fr ? "Nouveau" : "New"}</span>;
  const pct = ((current - previous) / previous) * 100;
  const dir = pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat";
  const abs = Math.abs(pct);
  const shown = abs >= 100 ? Math.round(abs).toString() : abs.toFixed(1);
  return (
    <span className={`mw-trend is-${dir}`} title={fr ? "vs période précédente" : "vs previous period"}>
      {dir === "up" ? "↑" : dir === "down" ? "↓" : "→"} {fr ? `${shown.replace(".", ",")} %` : `${shown}%`}
    </span>
  );
}

function Kpi({ label, value, format, delay, hint }: { label: string; value: number | null; format: (n: number) => string; delay: number; hint?: string }) {
  return (
    <div className="mw-kpi" style={{ ["--d" as string]: `${delay}ms` }}>
      <span>{label}</span>
      <strong>{value === null ? "—" : <CountUp value={value} format={format} delayMs={delay} />}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function when(ts: number, lang: Lang): string {
  return new Date(ts).toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-US", { hour: "2-digit", minute: "2-digit" });
}

function shortDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "short" });
}

export function MinoRevenueWidget({
  snapshot: s,
  go,
  onAsk,
  onRefresh,
}: {
  snapshot: MinoRevenueSnapshot;
  go: Go;
  onAsk: (text: string) => void;
  onRefresh?: () => Promise<void>;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  const [refreshing, setRefreshing] = useState(false);
  const period = revenuePeriodLabel(s.ask, lang);
  const fmt = (n: number) => money(n, lang);
  const count = (n: number) => new Intl.NumberFormat(fr ? "fr-FR" : "en-US").format(Math.round(n));

  const refresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const title = s.creator
    ? fr
      ? `Vos ventes avec ${s.creator.name}`
      : `Your sales with ${s.creator.name}`
    : s.ask.focus === "top"
      ? fr
        ? "Vos meilleurs créateurs"
        : "Your top creators"
      : s.ask.focus === "new"
        ? fr
          ? "Nouveaux créateurs"
          : "New creators"
        : fr
          ? "Vos ventes"
          : "Your sales";

  const head = (
    <header className="mw-head">
      {s.creator ? (
        <Avatar c={s.creator} size={36} />
      ) : (
        <span className="mw-head__icon">
          <Glyph size={17}>{s.ask.focus === "new" ? ICONS.users : ICONS.chart}</Glyph>
        </span>
      )}
      <div className="mw-head__title">
        <strong>{title}</strong>
        <span>
          {period} · {fr ? `à ${when(s.fetchedAt, lang)}` : `as of ${when(s.fetchedAt, lang)}`}
        </span>
      </div>
      {onRefresh ? (
        <button
          type="button"
          className={`mw-icon-btn${refreshing ? " is-spinning" : ""}`}
          onClick={() => void refresh()}
          aria-label={fr ? "Actualiser" : "Refresh"}
          title={fr ? "Actualiser" : "Refresh"}
        >
          <Glyph size={15}>{ICONS.refresh}</Glyph>
        </button>
      ) : null}
    </header>
  );

  if (s.status === "unknown_creator") {
    const asked = s.ask.creator || "";
    return (
      <section className="mw-card mw-revenue">
        {head}
        <div className="mw-empty">
          <span className="mw-empty__icon">
            <Glyph size={20}>{ICONS.search}</Glyph>
          </span>
          <strong>
            {fr ? `Je ne trouve pas « ${asked} » parmi vos créateurs.` : `I can’t find “${asked}” among your creators.`}
          </strong>
          <p>
            {s.creatorCount === 0
              ? fr
                ? "Vous n’avez pas encore de créateurs dans Trackit : ajoutez-en pour suivre leurs ventes."
                : "You don’t have creators in Trackit yet: add some to track their sales."
              : fr
                ? "Choisissez un de vos créateurs :"
                : "Pick one of your creators:"}
          </p>
          {s.suggestions?.length ? (
            <div className="mw-chips">
              {s.suggestions.map((h) => (
                <button
                  key={h}
                  type="button"
                  className="mw-chip"
                  onClick={() => onAsk(fr ? `Combien j’ai généré avec @${h} ${periodPhrase(s.ask.days, true)}` : `How much did I make with @${h} ${periodPhrase(s.ask.days, false)}`)}
                >
                  @{h}
                </button>
              ))}
            </div>
          ) : null}
          <div className="mw-actions">
            <button type="button" className="mw-btn is-primary" onClick={() => go({ view: "creators" })}>
              {fr ? "Gérer mes créateurs" : "Manage my creators"}
              <Glyph size={14}>{ICONS.arrow}</Glyph>
            </button>
          </div>
        </div>
      </section>
    );
  }

  const ok = s.status === "ok";
  const avgOrder = s.orders > 0 ? s.revenue / s.orders : null;
  const maxTop = Math.max(1, ...s.top.map((t) => t.revenue));
  const chartDays = s.daily.map((d) => d.revenue);
  // With no sales and nobody new, the empty card says it all.
  const showJoined = !s.creator && s.joined !== null && (s.status === "ok" || s.ask.focus === "new" || s.joined.length > 0);
  const joined = s.joined ?? [];

  const emptyBlock =
    s.status === "empty" ? (
      s.ask.focus === "new" && joined.length ? (
        <p className="mw-note">
          {fr ? `Aucune vente enregistrée sur la période (${period.toLowerCase()}).` : `No sales recorded in this period (${period.toLowerCase()}).`}
        </p>
      ) : (
        <div className="mw-empty">
          <span className="mw-empty__icon">
            <Glyph size={20}>{!s.shopifyConnected ? ICONS.shop : ICONS.megaphone}</Glyph>
          </span>
          <strong>
            {s.creator
              ? fr
                ? `Pas encore de vente avec ${s.creator.name} (${period.toLowerCase()}).`
                : `No sales with ${s.creator.name} yet (${period.toLowerCase()}).`
              : fr
                ? `Pas encore de vente (${period.toLowerCase()}).`
                : `No sales yet (${period.toLowerCase()}).`}
          </strong>
          <p>
            {!s.shopifyConnected
              ? fr
                ? "Connectez Shopify : chaque commande passée avec le code d’un créateur apparaîtra ici."
                : "Connect Shopify: every order placed with a creator’s code will show up here."
              : !s.hasCampaigns
                ? fr
                  ? "Lancez une campagne pour donner un code ou un lien à vos créateurs."
                  : "Launch a campaign to give your creators a code or a link."
                : fr
                  ? "Vos créateurs n’ont pas encore généré de commande sur cette période."
                  : "Your creators haven’t driven an order in this period yet."}
          </p>
          <div className="mw-actions">
            {!s.shopifyConnected ? (
              <button type="button" className="mw-btn is-primary" onClick={() => go({ view: "integrations" })}>
                {fr ? "Connecter Shopify" : "Connect Shopify"}
                <Glyph size={14}>{ICONS.arrow}</Glyph>
              </button>
            ) : (
              <button type="button" className="mw-btn is-primary" onClick={() => go({ view: "campaigns", campaign: { type: "new" } })}>
                {fr ? "Lancer une campagne" : "Launch a campaign"}
                <Glyph size={14}>{ICONS.arrow}</Glyph>
              </button>
            )}
            {s.ask.days < 90 ? (
              <button
                type="button"
                className="mw-btn"
                onClick={() =>
                  onAsk(
                    s.creator
                      ? fr
                        ? `Combien j’ai généré avec @${s.creator.handle} sur 90 jours`
                        : `How much did I make with @${s.creator.handle} in the last 90 days`
                      : fr
                        ? "Mes ventes des 90 derniers jours"
                        : "My sales over the last 90 days",
                  )
                }
              >
                {fr ? "Voir sur 90 jours" : "See 90 days"}
              </button>
            ) : null}
          </div>
        </div>
      )
    ) : null;

  const kpis = ok ? (
    <div className="mw-kpis">
      <div className="mw-hero">
        <span>{fr ? "Chiffre d’affaires" : "Revenue"}</span>
        <strong>
          <CountUp value={s.revenue} format={fmt} />
        </strong>
        <Trend current={s.revenue} previous={s.previousRevenue} lang={lang} />
      </div>
      <div className="mw-kpi-grid">
        <Kpi label={fr ? "Commandes" : "Orders"} value={s.orders} format={count} delay={120} hint={avgOrder !== null ? `${fr ? "panier moy." : "avg"} ${fmt(avgOrder)}` : undefined} />
        <Kpi label={fr ? "Commissions dues" : "Commissions earned"} value={s.commissionsEarned} format={fmt} delay={200} />
        {s.commissionsPaid !== null ? <Kpi label={fr ? "Commissions payées" : "Commissions paid"} value={s.commissionsPaid} format={fmt} delay={280} /> : null}
        <Kpi label={fr ? "Reste à payer" : "Owed now"} value={s.owed} format={fmt} delay={360} />
      </div>
    </div>
  ) : null;

  const chart =
    ok && chartDays.length >= 3 ? (
      <div className="mw-chart">
        <RevenueChart lang={lang} days={chartDays} />
      </div>
    ) : null;

  const topBlock =
    ok && !s.creator ? (
      <div className="mw-list">
        <h4>{fr ? "Top créateurs" : "Top creators"}</h4>
        {s.top.length ? (
          <ol>
            {s.top.map((c, i) => (
              <li key={c.id || c.handle} style={{ ["--i" as string]: i }}>
                <button
                  type="button"
                  className="mw-row"
                  onClick={() =>
                    onAsk(
                      fr
                        ? `Combien j’ai généré avec @${c.handle || c.name} ${periodPhrase(s.ask.days, true)}`
                        : `How much did I make with @${c.handle || c.name} ${periodPhrase(s.ask.days, false)}`,
                    )
                  }
                  title={fr ? "Voir le détail" : "See the detail"}
                >
                  <Avatar c={c} size={30} />
                  <span className="mw-row__who">
                    <strong>{c.name}</strong>
                    <span>
                      {c.orders} {fr ? (c.orders > 1 ? "commandes" : "commande") : c.orders > 1 ? "orders" : "order"}
                    </span>
                  </span>
                  <span className="mw-row__bar" aria-hidden>
                    <i style={{ width: `${Math.max(6, (c.revenue / maxTop) * 100)}%` }} />
                  </span>
                  <strong className="mw-row__value">{fmt(c.revenue)}</strong>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mw-note">{fr ? "Ventes non rattachées à un créateur sur la période." : "Sales not tied to a creator in this period."}</p>
        )}
      </div>
    ) : null;

  const joinedBlock = showJoined ? (
    <div className={`mw-list${s.ask.focus === "new" ? " is-lead" : ""}`}>
      <h4>
        {fr ? "Nouveaux créateurs" : "New creators"}
        <span className="mw-count">{joined.length}</span>
      </h4>
      {joined.length ? (
        <ol>
          {joined.map((c, i) => (
            <li key={c.id || c.handle} style={{ ["--i" as string]: i }}>
              <div className="mw-row is-static">
                <Avatar c={c} size={30} />
                <span className="mw-row__who">
                  <strong>{c.name}</strong>
                  <span>{c.handle ? `@${c.handle}` : ""}</span>
                </span>
                <span className="mw-row__date">{shortDate(c.joinedAt, lang)}</span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mw-note">{fr ? "Aucun créateur n’a rejoint sur la période." : "No creator joined in this period."}</p>
      )}
    </div>
  ) : null;

  return (
    <section className="mw-card mw-revenue">
      {head}
      {s.ask.focus === "new" ? (
        <>
          {joinedBlock}
          {emptyBlock}
          {kpis}
          {chart}
          {topBlock}
        </>
      ) : (
        <>
          {kpis}
          {emptyBlock}
          {chart}
          {topBlock || joinedBlock ? (
            <div className="mw-lists">
              {topBlock}
              {joinedBlock}
            </div>
          ) : null}
        </>
      )}
      <footer className="mw-actions">
        <button type="button" className="mw-btn is-primary" onClick={() => go({ view: "analytics" })}>
          {fr ? "Ouvrir les analytics" : "Open analytics"}
          <Glyph size={14}>{ICONS.arrow}</Glyph>
        </button>
        <button
          type="button"
          className="mw-btn"
          onClick={() => go(s.creator?.id ? { view: "payouts", payout: { type: "creator", id: s.creator.id } } : { view: "payouts" })}
        >
          <Glyph size={14}>{ICONS.wallet}</Glyph>
          {s.creator ? (fr ? `Payer ${s.creator.name}` : `Pay ${s.creator.name}`) : fr ? "Paiements" : "Payouts"}
        </button>
      </footer>
    </section>
  );
}

function periodPhrase(days: number, fr: boolean): string {
  if (days === 1) return fr ? "aujourd’hui" : "today";
  return fr ? `sur ${days} jours` : `in the last ${days} days`;
}

/** While Mino fetches the numbers: the dashboard's shape, shimmering. */
export function MinoRevenueLoading({ label }: { label: string }) {
  const fr = useLang() === "fr";
  return (
    <section className="mw-card mw-revenue is-loading" role="status" aria-live="polite">
      <header className="mw-head">
        <span className="mw-head__icon is-busy">
          <Glyph size={17}>{ICONS.chart}</Glyph>
        </span>
        <div className="mw-head__title">
          <strong>{fr ? "Lecture de vos ventes" : "Reading your sales"}</strong>
          <span>{label}</span>
        </div>
      </header>
      <div className="mw-ghost-kpis" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <span key={i} style={{ ["--i" as string]: i }} />
        ))}
      </div>
      <div className="mw-ghost-chart" aria-hidden>
        <svg viewBox="0 0 300 60" preserveAspectRatio="none">
          <path d="M0 50 C 40 45, 60 20, 100 30 S 160 55, 200 25 S 260 10, 300 18" />
        </svg>
      </div>
    </section>
  );
}

const ACTION_ICON: Record<MinoActionCard["kind"], ReactNode> = {
  navigate: ICONS.arrow,
  pay: ICONS.wallet,
  campaign: ICONS.megaphone,
  task: ICONS.task,
  meeting: ICONS.calendar,
};

// Cards already opened (or cancelled) in this tab: a re-render never opens a page twice.
const settledCards = new Set<string>();
const AUTO_OPEN_MS = 1600;

export function MinoActionWidget({ action, go }: { action: MinoActionCard; go: Go }) {
  const lang = useLang();
  const fr = lang === "fr";
  const key = `${action.kind}:${action.at}`;
  const target: DashboardNavState | null = action.view
    ? action.kind === "pay" && action.payoutCreatorId
      ? { view: "payouts", payout: { type: "creator", id: action.payoutCreatorId } }
      : action.kind === "campaign"
        ? { view: "campaigns", campaign: { type: "new" } }
        : { view: action.view }
    : null;
  const fresh = Boolean(target) && action.autoOpen !== false && Date.now() - action.at < 4000 && !settledCards.has(key);
  const [counting, setCounting] = useState(fresh);
  const goRef = useRef(go);
  goRef.current = go;

  useEffect(() => {
    if (!counting || !target) return;
    const t = window.setTimeout(() => {
      settledCards.add(key);
      setCounting(false);
      goRef.current(target);
    }, AUTO_OPEN_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counting, key]);

  const cta = target
    ? action.kind === "pay"
      ? fr
        ? "Ouvrir le paiement"
        : "Open the payment"
      : action.kind === "campaign"
        ? fr
          ? "Créer la campagne"
          : "Create the campaign"
        : fr
          ? `Ouvrir ${viewLabel(action.view, lang)}`
          : `Open ${viewLabel(action.view, lang)}`
    : null;

  return (
    <section className={`mw-card mw-action is-${action.kind}`}>
      <span className="mw-action__icon">
        <Glyph size={18}>{ACTION_ICON[action.kind]}</Glyph>
      </span>
      <div className="mw-action__body">
        <strong>{action.title}</strong>
        {action.detail ? <span>{action.detail}</span> : null}
        {counting ? (
          <span className="mw-action__timer" aria-hidden>
            <i style={{ animationDuration: `${AUTO_OPEN_MS}ms` }} />
          </span>
        ) : null}
      </div>
      <div className="mw-action__btns">
        {counting ? (
          <button
            type="button"
            className="mw-btn"
            onClick={() => {
              settledCards.add(key);
              setCounting(false);
            }}
          >
            {fr ? "Rester ici" : "Stay here"}
          </button>
        ) : null}
        {target && cta ? (
          <button
            type="button"
            className="mw-btn is-primary"
            onClick={() => {
              settledCards.add(key);
              setCounting(false);
              go(target);
            }}
          >
            {cta}
            <Glyph size={14}>{ICONS.arrow}</Glyph>
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function MinoErrorWidget({ onRetry, busy }: { onRetry: () => void; busy?: boolean }) {
  const fr = useLang() === "fr";
  return (
    <section className="mw-card mw-error" role="alert">
      <span className="mw-action__icon">
        <Glyph size={18}>{ICONS.alert}</Glyph>
      </span>
      <div className="mw-action__body">
        <strong>{fr ? "Mino n’a pas pu répondre" : "Mino couldn’t answer"}</strong>
        <span>{fr ? "La connexion ou le service a échoué. Rien n’a été perdu." : "The connection or the service failed. Nothing was lost."}</span>
      </div>
      <div className="mw-action__btns">
        <button type="button" className="mw-btn is-primary" onClick={onRetry} disabled={busy}>
          <Glyph size={14}>{ICONS.refresh}</Glyph>
          {fr ? "Réessayer" : "Retry"}
        </button>
      </div>
    </section>
  );
}
