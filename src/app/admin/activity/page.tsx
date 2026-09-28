"use client";

import { GIFT_STATUS_LABELS } from "@/lib/gifting-board";
import type { ActivityData } from "@/lib/admin-types";
import { AreaChart, BarList, Bars, Donut } from "../_components/charts";
import { Card, Empty, Kpi, LoadState, PageHead, RefreshButton, Warnings, eur, num, useAdminData } from "../_components/ui";

const CAMPAIGN_STATUS: Record<string, string> = { active: "Actives", draft: "Brouillons", completed: "Terminées", paused: "En pause" };
const PAYOUT_STATUS: Record<string, string> = { paid: "Payés", pending: "En attente", failed: "Échoués", processing: "En cours" };

export default function AdminActivityPage() {
  const { data, error, loading, reload } = useAdminData<ActivityData>("/api/admin/activity");
  const giftTotal = data?.gifting?.byStatus.reduce((s, b) => s + b.count, 0) ?? 0;

  return (
    <>
      <PageHead
        title="Activité"
        lead="Ce que les marques font vraiment dans le produit sur les 30 derniers jours."
        actions={<RefreshButton onClick={reload} loading={loading} />}
      />
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <Warnings items={data.warnings} />
          <div className="ad-grid ad-grid--kpi">
            <Kpi label="CA suivi (30 j)" value={data.sales?.revenue ?? null} format={(n) => eur(n)} tone="accent" sub={<>{num(data.sales?.count)} ventes</>} />
            <Kpi label="Commissions (30 j)" value={data.sales?.commission ?? null} format={(n) => eur(n)} delay={60} />
            <Kpi label="Messages envoyés (30 j)" value={data.outreach?.sent30d ?? null} delay={120} />
            <Kpi label="Contenus déposés (30 j)" value={data.content?.uploads30d ?? null} delay={180} />
            <Kpi label="Missions gifting" value={data.gifting ? giftTotal : null} delay={240} />
          </div>

          <div className="ad-grid ad-grid--wide">
            <Card title="Ventes suivies par jour" delay={80}>
              {data.sales ? <AreaChart series={data.sales.series} format={(n) => eur(n)} height={210} /> : <Empty>Ventes illisibles.</Empty>}
            </Card>
            <Card title="Top marques (30 j)" delay={120}>
              {data.topBrands && data.topBrands.length > 0 ? (
                <BarList
                  items={data.topBrands.map((b) => ({ key: b.label, value: b.revenue, hint: `${num(b.orders)} commandes` }))}
                  format={(n) => eur(n)}
                />
              ) : (
                <Empty>Aucune vente sur la période.</Empty>
              )}
            </Card>
          </div>

          <div className="ad-grid ad-grid--3">
            <Card title="Campagnes par statut" delay={160}>
              {data.campaigns && data.campaigns.byStatus.length > 0 ? (
                <Donut
                  parts={data.campaigns.byStatus.map((b) => ({ key: b.key, value: b.count }))}
                  labelOf={(k) => CAMPAIGN_STATUS[k] ?? k}
                  center={{ value: num(data.campaigns.byStatus.reduce((s, b) => s + b.count, 0)), label: "campagnes" }}
                />
              ) : (
                <Empty>—</Empty>
              )}
            </Card>
            <Card title="Missions gifting par étape" delay={200}>
              {data.gifting && data.gifting.byStatus.length > 0 ? (
                <BarList
                  items={data.gifting.byStatus.map((b) => ({ key: b.key, value: b.count }))}
                  format={num}
                  labelOf={(k) => GIFT_STATUS_LABELS[k as keyof typeof GIFT_STATUS_LABELS]?.fr ?? k}
                />
              ) : (
                <Empty>{data.gifting ? "Aucune mission." : "Table gifting illisible."}</Empty>
              )}
            </Card>
            <Card title="Paiements créateurs" delay={240}>
              {data.payouts && data.payouts.byStatus.length > 0 ? (
                <BarList
                  items={data.payouts.byStatus.map((p) => ({ key: p.key, value: p.amount, hint: `${num(p.count)} versements` }))}
                  format={(n) => eur(n)}
                  labelOf={(k) => PAYOUT_STATUS[k] ?? k}
                />
              ) : (
                <Empty>Aucun versement.</Empty>
              )}
            </Card>
          </div>

          <div className="ad-grid ad-grid--3">
            <Card title="Campagnes créées par jour" delay={280}>
              {data.campaigns ? <Bars series={data.campaigns.created} format={(n) => `${num(n)} campagnes`} /> : <Empty>—</Empty>}
            </Card>
            <Card title="Messages envoyés par jour" delay={320}>
              {data.outreach ? <Bars series={data.outreach.series} format={(n) => `${num(n)} messages`} /> : <Empty>—</Empty>}
            </Card>
            <Card title="Contenus déposés par jour" delay={360}>
              {data.content ? <Bars series={data.content.series} format={(n) => `${num(n)} contenus`} /> : <Empty>—</Empty>}
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
