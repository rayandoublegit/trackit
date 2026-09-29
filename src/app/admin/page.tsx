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
        title="Overview"
        lead={data ? `Updated ${dateFr(data.generatedAt, true)}. Signups, activity, money and things to handle.` : "Signups, activity, money and things to handle."}
        actions={<RefreshButton onClick={reload} loading={loading} />}
      />
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <Warnings items={data.warnings} />
          <div className="ad-grid ad-grid--kpi">
            <Kpi label="Estimated MRR" value={data.paying.mrrEstimate} format={(n) => eur(n)} tone="accent" sub={<>{num(data.paying.count)} paying</>} />
            <Kpi label="Users" value={data.users.total} delay={60} sub={<>{num(data.users.brands)} brands · {num(data.users.creators)} creators</>} />
            <Kpi
              label="Signups (7d)"
              value={data.users.new7d}
              delay={120}
              trend={data.users.new7d !== null && data.users.newPrev7d !== null ? pctChange(data.users.new7d, data.users.newPrev7d) : null}
              sub="vs previous 7d"
            />
            <Kpi label="Active (7d)" value={data.active.d7} delay={180} sub={<>{num(data.active.d1)} today · {num(data.active.d30)} over 30d</>} />
            <Kpi
              label="Tracked revenue (30d)"
              value={data.sales.revenue30d}
              format={(n) => eur(n)}
              delay={240}
              tone="good"
              trend={data.sales.revenue30d !== null && data.sales.revenuePrev30d !== null ? pctChange(data.sales.revenue30d, data.sales.revenuePrev30d) : null}
              sub={<>{num(data.sales.count30d)} sales</>}
            />
            <Kpi label="Active campaigns" value={data.campaigns.active} delay={300} sub={<>{num(data.campaigns.total)} total</>} />
            <Kpi label="Creator catalog" value={data.catalog.total} format={compact} delay={360} sub="indexed profiles" />
            <Kpi label="Gifting missions" value={data.gifting.missions} delay={420} sub="all stages" />
          </div>

          <div className="ad-grid ad-grid--wide">
            <Card title="Tracked revenue, last 30 days" aside={<Link className="ad-btn" href="/admin/activity">Details</Link>} delay={100}>
              {data.sales.series ? <AreaChart series={data.sales.series} format={(n) => eur(n)} height={210} /> : <Empty>Sales could not be read.</Empty>}
            </Card>
            <Card title="Needs attention" delay={160}>
              {data.attention.length === 0 ? (
                <Empty>Nothing urgent. Everything read without errors.</Empty>
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
            <Card title="Signups per day" delay={200}>
              {data.users.signups ? <Bars series={data.users.signups} format={(n) => `${num(n)} signups`} height={130} /> : <Empty>—</Empty>}
            </Card>
            <Card title="Subscribers by plan" aside={<Link className="ad-btn" href="/admin/revenue">Revenue</Link>} delay={240}>
              {data.paying.byPlan.length > 0 ? (
                <Donut
                  parts={data.paying.byPlan.map((p) => ({ key: p.key, value: p.count }))}
                  labelOf={(k) => PLAN_LABEL[k] ?? k}
                  center={{ value: num(data.paying.count), label: "paying" }}
                />
              ) : (
                <Empty>No paying subscribers.</Empty>
              )}
            </Card>
            <Card title="Comped accounts" delay={280}>
              <div className="ad-facts">
                <div className="ad-fact">
                  <span>Active comped access</span>
                  <strong>{num(data.paying.comped)}</strong>
                </div>
                <div className="ad-fact">
                  <span>Paying share</span>
                  <strong>
                    {data.users.total && data.paying.count !== null ? pct((data.paying.count / data.users.total) * 100) : "—"}
                  </strong>
                </div>
                <div className="ad-fact">
                  <span>Active today</span>
                  <strong>{num(data.active.d1)}</strong>
                </div>
                <div className="ad-fact">
                  <span>Active 30d</span>
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
