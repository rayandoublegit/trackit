"use client";

import { GIFT_STATUS_LABELS } from "@/lib/gifting-board";
import type { ActivityData } from "@/lib/admin-types";
import { AreaChart, BarList, Bars, Donut } from "../_components/charts";
import { Card, Empty, Kpi, LoadState, PageHead, RefreshButton, Warnings, eur, num, useAdminData } from "../_components/ui";

const CAMPAIGN_STATUS: Record<string, string> = { active: "Active", draft: "Drafts", completed: "Completed", paused: "Paused" };
const PAYOUT_STATUS: Record<string, string> = { paid: "Paid", pending: "Pending", failed: "Failed", processing: "Processing" };

export default function AdminActivityPage() {
  const { data, error, loading, reload } = useAdminData<ActivityData>("/api/admin/activity");
  const giftTotal = data?.gifting?.byStatus.reduce((s, b) => s + b.count, 0) ?? 0;

  return (
    <>
      <PageHead
        title="Activity"
        lead="What brands actually do in the product over the last 30 days."
        actions={<RefreshButton onClick={reload} loading={loading} />}
      />
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <Warnings items={data.warnings} />
          <div className="ad-grid ad-grid--kpi">
            <Kpi label="Tracked revenue (30d)" value={data.sales?.revenue ?? null} format={(n) => eur(n)} tone="accent" sub={<>{num(data.sales?.count)} sales</>} />
            <Kpi label="Commissions (30d)" value={data.sales?.commission ?? null} format={(n) => eur(n)} delay={60} />
            <Kpi label="Messages sent (30d)" value={data.outreach?.sent30d ?? null} delay={120} />
            <Kpi label="Content uploaded (30d)" value={data.content?.uploads30d ?? null} delay={180} />
            <Kpi label="Gifting missions" value={data.gifting ? giftTotal : null} delay={240} />
          </div>

          <div className="ad-grid ad-grid--wide">
            <Card title="Tracked sales per day" delay={80}>
              {data.sales ? <AreaChart series={data.sales.series} format={(n) => eur(n)} height={210} /> : <Empty>Sales could not be read.</Empty>}
            </Card>
            <Card title="Top brands (30d)" delay={120}>
              {data.topBrands && data.topBrands.length > 0 ? (
                <BarList
                  items={data.topBrands.map((b) => ({ key: b.label, value: b.revenue, hint: `${num(b.orders)} orders` }))}
                  format={(n) => eur(n)}
                />
              ) : (
                <Empty>No sales in this period.</Empty>
              )}
            </Card>
          </div>

          <div className="ad-grid ad-grid--3">
            <Card title="Campaigns by status" delay={160}>
              {data.campaigns && data.campaigns.byStatus.length > 0 ? (
                <Donut
                  parts={data.campaigns.byStatus.map((b) => ({ key: b.key, value: b.count }))}
                  labelOf={(k) => CAMPAIGN_STATUS[k] ?? k}
                  center={{ value: num(data.campaigns.byStatus.reduce((s, b) => s + b.count, 0)), label: "campaigns" }}
                />
              ) : (
                <Empty>—</Empty>
              )}
            </Card>
            <Card title="Gifting missions by stage" delay={200}>
              {data.gifting && data.gifting.byStatus.length > 0 ? (
                <BarList
                  items={data.gifting.byStatus.map((b) => ({ key: b.key, value: b.count }))}
                  format={num}
                  labelOf={(k) => GIFT_STATUS_LABELS[k as keyof typeof GIFT_STATUS_LABELS]?.en ?? k}
                />
              ) : (
                <Empty>{data.gifting ? "No missions." : "Gifting table could not be read."}</Empty>
              )}
            </Card>
            <Card title="Creator payouts" delay={240}>
              {data.payouts && data.payouts.byStatus.length > 0 ? (
                <BarList
                  items={data.payouts.byStatus.map((p) => ({ key: p.key, value: p.amount, hint: `${num(p.count)} payouts` }))}
                  format={(n) => eur(n)}
                  labelOf={(k) => PAYOUT_STATUS[k] ?? k}
                />
              ) : (
                <Empty>No payouts.</Empty>
              )}
            </Card>
          </div>

          <div className="ad-grid ad-grid--3">
            <Card title="Campaigns created per day" delay={280}>
              {data.campaigns ? <Bars series={data.campaigns.created} format={(n) => `${num(n)} campaigns`} /> : <Empty>—</Empty>}
            </Card>
            <Card title="Messages sent per day" delay={320}>
              {data.outreach ? <Bars series={data.outreach.series} format={(n) => `${num(n)} messages`} /> : <Empty>—</Empty>}
            </Card>
            <Card title="Content uploaded per day" delay={360}>
              {data.content ? <Bars series={data.content.series} format={(n) => `${num(n)} uploads`} /> : <Empty>—</Empty>}
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
