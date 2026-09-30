"use client";

import Link from "next/link";
import { pctChange } from "@/lib/admin-aggregate";
import type { AttentionItem, OverviewData } from "@/lib/admin-types";
import { useLang } from "@/lib/useLang";
import { AcquisitionSection } from "./_components/acquisition";
import { AreaChart, Bars, Donut } from "./_components/charts";
import { Card, Empty, Kpi, LoadState, PageHead, RefreshButton, Warnings, useAdminData, useAdminFormat, useT } from "./_components/ui";

const PLAN_LABEL: Record<string, string> = { basic: "Growth", pro: "Pro", scale: "Scale" };

// Attention labels come from the API in English.
function attentionLabelFr(a: AttentionItem): string {
  if (a.kind === "billing") return "Factures impayées";
  if (a.kind === "requests") return "Niches demandées cette semaine";
  if (a.kind === "lookups") return "Créateurs introuvables cette semaine";
  if (a.kind === "error") return "Lectures en échec";
  if (a.label === "Demo data still in real accounts") return "Données de démo encore dans les comptes";
  const missing = /^(.+) table missing$/.exec(a.label);
  return missing ? `Table ${missing[1]} absente` : a.label;
}

export default function AdminOverviewPage() {
  const { data, error, loading, reload } = useAdminData<OverviewData>("/api/admin/overview");
  const { compact, dateFr, eur, num, pct } = useAdminFormat();
  const t = useT();
  const fr = useLang() === "fr";

  return (
    <>
      <PageHead
        title={t("Overview", "Vue d’ensemble")}
        lead={
          data
            ? t(`Updated ${dateFr(data.generatedAt, true)}. Signups, activity, money and things to handle.`, `Mis à jour le ${dateFr(data.generatedAt, true)}. Inscriptions, activité, argent et points à traiter.`)
            : t("Signups, activity, money and things to handle.", "Inscriptions, activité, argent et points à traiter.")
        }
        actions={<RefreshButton onClick={reload} loading={loading} />}
      />
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <Warnings items={data.warnings} />
          <div className="ad-grid ad-grid--kpi">
            <Kpi label={t("Estimated MRR", "MRR estimé")} value={data.paying.mrrEstimate} format={(n) => eur(n)} tone="accent" sub={<>{num(data.paying.count)} {t("paying", "payants")}</>} />
            <Kpi
              label={t("Users", "Utilisateurs")}
              value={data.users.total}
              delay={60}
              sub={<>{num(data.users.brands)} {t("brands", "marques")} · {num(data.users.creators)} {t("creators", "créateurs")}</>}
            />
            <Kpi
              label={t("Signups (7d)", "Inscriptions (7 j)")}
              value={data.users.new7d}
              delay={120}
              trend={data.users.new7d !== null && data.users.newPrev7d !== null ? pctChange(data.users.new7d, data.users.newPrev7d) : null}
              sub={t("vs previous 7d", "vs 7 j précédents")}
            />
            <Kpi
              label={t("Active (7d)", "Actifs (7 j)")}
              value={data.active.d7}
              delay={180}
              sub={<>{num(data.active.d1)} {t("today", "aujourd’hui")} · {num(data.active.d30)} {t("over 30d", "sur 30 j")}</>}
            />
            <Kpi
              label={t("Tracked revenue (30d)", "CA suivi (30 j)")}
              value={data.sales.revenue30d}
              format={(n) => eur(n)}
              delay={240}
              tone="good"
              trend={data.sales.revenue30d !== null && data.sales.revenuePrev30d !== null ? pctChange(data.sales.revenue30d, data.sales.revenuePrev30d) : null}
              sub={<>{num(data.sales.count30d)} {t("sales", "ventes")}</>}
            />
            <Kpi label={t("Active campaigns", "Campagnes actives")} value={data.campaigns.active} delay={300} sub={<>{num(data.campaigns.total)} {t("total", "au total")}</>} />
            <Kpi label={t("Creator catalog", "Catalogue créateurs")} value={data.catalog.total} format={compact} delay={360} sub={t("indexed profiles", "profils indexés")} />
            <Kpi label={t("Gifting missions", "Missions gifting")} value={data.gifting.missions} delay={420} sub={t("all stages", "toutes étapes")} />
          </div>

          <AcquisitionSection acquisition={data.acquisition} />

          <div className="ad-grid ad-grid--wide">
            <Card
              title={t("Tracked revenue, last 30 days", "CA suivi, 30 derniers jours")}
              aside={
                <Link className="ad-btn" href="/admin/activity">
                  {t("Details", "Détails")}
                </Link>
              }
              delay={100}
            >
              {data.sales.series ? (
                <AreaChart series={data.sales.series} format={(n) => eur(n)} height={210} />
              ) : (
                <Empty>{t("Sales could not be read.", "Les ventes n’ont pas pu être lues.")}</Empty>
              )}
            </Card>
            <Card title={t("Needs attention", "À traiter")} delay={160}>
              {data.attention.length === 0 ? (
                <Empty>{t("Nothing urgent. Everything read without errors.", "Rien d’urgent. Tout a été lu sans erreur.")}</Empty>
              ) : (
                <ul className="ad-attn">
                  {data.attention.map((a, i) => (
                    <li key={`${a.kind}-${a.label}`}>
                      <Link href={a.href} style={{ animationDelay: `${i * 60}ms` }}>
                        <i className={`is-${a.kind}`} />
                        <span>{fr ? attentionLabelFr(a) : a.label}</span>
                        <strong>{num(a.count)}</strong>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="ad-grid ad-grid--3">
            <Card title={t("Signups per day", "Inscriptions par jour")} delay={200}>
              {data.users.signups ? <Bars series={data.users.signups} format={(n) => `${num(n)} ${t("signups", "inscriptions")}`} height={130} /> : <Empty>—</Empty>}
            </Card>
            <Card
              title={t("Subscribers by plan", "Abonnés par offre")}
              aside={
                <Link className="ad-btn" href="/admin/revenue">
                  {t("Revenue", "Revenus")}
                </Link>
              }
              delay={240}
            >
              {data.paying.byPlan.length > 0 ? (
                <Donut
                  parts={data.paying.byPlan.map((p) => ({ key: p.key, value: p.count }))}
                  labelOf={(k) => PLAN_LABEL[k] ?? k}
                  center={{ value: num(data.paying.count), label: t("paying", "payants") }}
                />
              ) : (
                <Empty>{t("No paying subscribers.", "Aucun abonné payant.")}</Empty>
              )}
            </Card>
            <Card title={t("Comped accounts", "Comptes offerts")} delay={280}>
              <div className="ad-facts">
                <div className="ad-fact">
                  <span>{t("Active comped access", "Accès offerts actifs")}</span>
                  <strong>{num(data.paying.comped)}</strong>
                </div>
                <div className="ad-fact">
                  <span>{t("Paying share", "Part de payants")}</span>
                  <strong>
                    {data.users.total && data.paying.count !== null ? pct((data.paying.count / data.users.total) * 100) : "—"}
                  </strong>
                </div>
                <div className="ad-fact">
                  <span>{t("Active today", "Actifs aujourd’hui")}</span>
                  <strong>{num(data.active.d1)}</strong>
                </div>
                <div className="ad-fact">
                  <span>{t("Active 30d", "Actifs 30 j")}</span>
                  <strong>{num(data.active.d30)}</strong>
                </div>
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
