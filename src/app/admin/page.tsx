"use client";

import Link from "next/link";
import { pctChange } from "@/lib/admin-aggregate";
import type { OverviewData } from "@/lib/admin-types";
import { AreaChart, Bars, Donut } from "./_components/charts";
import { Card, Empty, Kpi, LoadState, PageHead, RefreshButton, Warnings, compact, dateFr, eur, num, pct, useAdminData } from "./_components/ui";

const PLAN_LABEL: Record<string, string> = { basic: "Growth", pro: "Pro", scale: "Scale" };

export default function AdminOverviewPage() {
  const { data, error, loading, reload } = useAdminData<OverviewData>("/api/admin/overview");

  return (
    <>
      <PageHead
        title="Vue d’ensemble"
        lead={data ? `Mis à jour le ${dateFr(data.generatedAt, true)}. Inscriptions, activité, argent et points à traiter.` : "Inscriptions, activité, argent et points à traiter."}
        actions={<RefreshButton onClick={reload} loading={loading} />}
      />
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <Warnings items={data.warnings} />
          <div className="ad-grid ad-grid--kpi">
            <Kpi label="MRR estimé" value={data.paying.mrrEstimate} format={(n) => eur(n)} tone="accent" sub={<>{num(data.paying.count)} payants</>} />
            <Kpi label="Utilisateurs" value={data.users.total} delay={60} sub={<>{num(data.users.brands)} marques · {num(data.users.creators)} créateurs</>} />
            <Kpi
              label="Inscrits (7 j)"
              value={data.users.new7d}
              delay={120}
              trend={data.users.new7d !== null && data.users.newPrev7d !== null ? pctChange(data.users.new7d, data.users.newPrev7d) : null}
              sub="vs 7 j précédents"
            />
            <Kpi label="Actifs (7 j)" value={data.active.d7} delay={180} sub={<>{num(data.active.d1)} aujourd’hui · {num(data.active.d30)} sur 30 j</>} />
            <Kpi
              label="CA suivi (30 j)"
              value={data.sales.revenue30d}
              format={(n) => eur(n)}
              delay={240}
              tone="good"
              trend={data.sales.revenue30d !== null && data.sales.revenuePrev30d !== null ? pctChange(data.sales.revenue30d, data.sales.revenuePrev30d) : null}
              sub={<>{num(data.sales.count30d)} ventes</>}
            />
            <Kpi label="Campagnes actives" value={data.campaigns.active} delay={300} sub={<>{num(data.campaigns.total)} au total</>} />
            <Kpi label="Catalogue créateurs" value={data.catalog.total} format={compact} delay={360} sub="profils indexés" />
            <Kpi label="Missions gifting" value={data.gifting.missions} delay={420} sub="toutes étapes" />
          </div>

          <div className="ad-grid ad-grid--wide">
            <Card title="Chiffre d’affaires suivi, 30 jours" aside={<Link className="ad-btn" href="/admin/activity">Détail</Link>} delay={100}>
              {data.sales.series ? <AreaChart series={data.sales.series} format={(n) => eur(n)} height={210} /> : <Empty>Ventes illisibles.</Empty>}
            </Card>
            <Card title="À traiter" delay={160}>
              {data.attention.length === 0 ? (
                <Empty>Rien d’urgent. Tout est lu sans erreur.</Empty>
              ) : (
                <ul className="ad-attn">
                  {data.attention.map((a, i) => (
                    <li key={`${a.kind}-${a.label}`}>
                      <Link href={a.href} style={{ animationDelay: `${i * 60}ms` }}>
                        <i className={`is-${a.kind}`} />
                        <span>{a.label}</span>
                        <strong>{num(a.count)}</strong>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="ad-grid ad-grid--3">
            <Card title="Inscriptions par jour" delay={200}>
              {data.users.signups ? <Bars series={data.users.signups} format={(n) => `${num(n)} inscrits`} height={130} /> : <Empty>—</Empty>}
            </Card>
            <Card title="Abonnés par plan" aside={<Link className="ad-btn" href="/admin/revenue">Revenus</Link>} delay={240}>
              {data.paying.byPlan.length > 0 ? (
                <Donut
                  parts={data.paying.byPlan.map((p) => ({ key: p.key, value: p.count }))}
                  labelOf={(k) => PLAN_LABEL[k] ?? k}
                  center={{ value: num(data.paying.count), label: "payants" }}
                />
              ) : (
                <Empty>Aucun abonné payant.</Empty>
              )}
            </Card>
            <Card title="Comptes offerts" delay={280}>
              <div className="ad-facts">
                <div className="ad-fact">
                  <span>Accès offerts actifs</span>
                  <strong>{num(data.paying.comped)}</strong>
                </div>
                <div className="ad-fact">
                  <span>Part payante</span>
                  <strong>
                    {data.users.total && data.paying.count !== null ? pct((data.paying.count / data.users.total) * 100) : "—"}
                  </strong>
                </div>
                <div className="ad-fact">
                  <span>Actifs aujourd’hui</span>
                  <strong>{num(data.active.d1)}</strong>
                </div>
                <div className="ad-fact">
                  <span>Actifs 30 j</span>
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
