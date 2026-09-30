"use client";

import { GIFT_STATUS_LABELS } from "@/lib/gifting-board";
import type { ActivityData } from "@/lib/admin-types";
import { useLang } from "@/lib/useLang";
import { AreaChart, BarList, Bars, Donut } from "../_components/charts";
import { Card, Empty, Kpi, LoadState, PageHead, RefreshButton, Warnings, useAdminData, useAdminFormat, useT } from "../_components/ui";

const CAMPAIGN_STATUS: Record<string, string> = { active: "Active", draft: "Drafts", completed: "Completed", paused: "Paused" };
const CAMPAIGN_STATUS_FR: Record<string, string> = { active: "Actives", draft: "Brouillons", completed: "Terminées", paused: "En pause" };
const PAYOUT_STATUS: Record<string, string> = { paid: "Paid", pending: "Pending", failed: "Failed", processing: "Processing" };
const PAYOUT_STATUS_FR: Record<string, string> = { paid: "Payés", pending: "En attente", failed: "Échoués", processing: "En cours" };

export default function AdminActivityPage() {
  const { data, error, loading, reload } = useAdminData<ActivityData>("/api/admin/activity");
  const giftTotal = data?.gifting?.byStatus.reduce((s, b) => s + b.count, 0) ?? 0;
  const { eur, num } = useAdminFormat();
  const t = useT();
  const lang = useLang();
  const fr = lang === "fr";

  return (
    <>
      <PageHead
        title={t("Activity", "Activité")}
        lead={t("What brands actually do in the product over the last 30 days.", "Ce que les marques font vraiment dans le produit sur les 30 derniers jours.")}
        actions={<RefreshButton onClick={reload} loading={loading} />}
      />
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <Warnings items={data.warnings} />
          <div className="ad-grid ad-grid--kpi">
            <Kpi
              label={t("Tracked revenue (30d)", "CA suivi (30 j)")}
              value={data.sales?.revenue ?? null}
              format={(n) => eur(n)}
              tone="accent"
              sub={<>{num(data.sales?.count)} {t("sales", "ventes")}</>}
            />
            <Kpi label={t("Commissions (30d)", "Commissions (30 j)")} value={data.sales?.commission ?? null} format={(n) => eur(n)} delay={60} />
            <Kpi label={t("Messages sent (30d)", "Messages envoyés (30 j)")} value={data.outreach?.sent30d ?? null} delay={120} />
            <Kpi label={t("Content uploaded (30d)", "Contenus importés (30 j)")} value={data.content?.uploads30d ?? null} delay={180} />
            <Kpi label={t("Gifting missions", "Missions gifting")} value={data.gifting ? giftTotal : null} delay={240} />
          </div>

          <div className="ad-grid ad-grid--wide">
            <Card title={t("Tracked sales per day", "Ventes suivies par jour")} delay={80}>
              {data.sales ? (
                <AreaChart series={data.sales.series} format={(n) => eur(n)} height={210} />
              ) : (
                <Empty>{t("Sales could not be read.", "Les ventes n’ont pas pu être lues.")}</Empty>
              )}
            </Card>
            <Card title={t("Top brands (30d)", "Top marques (30 j)")} delay={120}>
              {data.topBrands && data.topBrands.length > 0 ? (
                <BarList
                  items={data.topBrands.map((b) => ({ key: b.label, value: b.revenue, hint: `${num(b.orders)} ${t("orders", "commandes")}` }))}
                  format={(n) => eur(n)}
                />
              ) : (
                <Empty>{t("No sales in this period.", "Aucune vente sur cette période.")}</Empty>
              )}
            </Card>
          </div>

          <div className="ad-grid ad-grid--3">
            <Card title={t("Campaigns by status", "Campagnes par statut")} delay={160}>
              {data.campaigns && data.campaigns.byStatus.length > 0 ? (
                <Donut
                  parts={data.campaigns.byStatus.map((b) => ({ key: b.key, value: b.count }))}
                  labelOf={(k) => (fr ? CAMPAIGN_STATUS_FR : CAMPAIGN_STATUS)[k] ?? k}
                  center={{ value: num(data.campaigns.byStatus.reduce((s, b) => s + b.count, 0)), label: t("campaigns", "campagnes") }}
                />
              ) : (
                <Empty>—</Empty>
              )}
            </Card>
            <Card title={t("Gifting missions by stage", "Missions gifting par étape")} delay={200}>
              {data.gifting && data.gifting.byStatus.length > 0 ? (
                <BarList
                  items={data.gifting.byStatus.map((b) => ({ key: b.key, value: b.count }))}
                  format={num}
                  labelOf={(k) => GIFT_STATUS_LABELS[k as keyof typeof GIFT_STATUS_LABELS]?.[lang] ?? k}
                />
              ) : (
                <Empty>{data.gifting ? t("No missions.", "Aucune mission.") : t("Gifting table could not be read.", "La table gifting n’a pas pu être lue.")}</Empty>
              )}
            </Card>
            <Card title={t("Creator payouts", "Paiements créateurs")} delay={240}>
              {data.payouts && data.payouts.byStatus.length > 0 ? (
                <BarList
                  items={data.payouts.byStatus.map((p) => ({ key: p.key, value: p.amount, hint: `${num(p.count)} ${t("payouts", "paiements")}` }))}
                  format={(n) => eur(n)}
                  labelOf={(k) => (fr ? PAYOUT_STATUS_FR : PAYOUT_STATUS)[k] ?? k}
                />
              ) : (
                <Empty>{t("No payouts.", "Aucun paiement.")}</Empty>
              )}
            </Card>
          </div>

          <div className="ad-grid ad-grid--3">
            <Card title={t("Campaigns created per day", "Campagnes créées par jour")} delay={280}>
              {data.campaigns ? <Bars series={data.campaigns.created} format={(n) => `${num(n)} ${t("campaigns", "campagnes")}`} /> : <Empty>—</Empty>}
            </Card>
            <Card title={t("Messages sent per day", "Messages envoyés par jour")} delay={320}>
              {data.outreach ? <Bars series={data.outreach.series} format={(n) => `${num(n)} messages`} /> : <Empty>—</Empty>}
            </Card>
            <Card title={t("Content uploaded per day", "Contenus importés par jour")} delay={360}>
              {data.content ? <Bars series={data.content.series} format={(n) => `${num(n)} ${t("uploads", "imports")}`} /> : <Empty>—</Empty>}
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
