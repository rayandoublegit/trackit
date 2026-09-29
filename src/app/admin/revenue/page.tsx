"use client";

import { useMemo } from "react";
import { BILLING_LABELS, PLAN_LABELS, billingOf, type BillingSource } from "@/lib/admin-billing";
import type { DayPoint } from "@/lib/admin-aggregate";
import { BarList, Bars, Donut, Funnel } from "../_components/charts";
import type { ConsoleData } from "../_components/console-types";
import { Card, Empty, Kpi, LoadState, PageHead, Pill, RefreshButton, dateFr, eur, num, pct, useAdminData } from "../_components/ui";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} '${y?.slice(2)}`;
}

export default function AdminRevenuePage() {
  const { data, error, loading, reload } = useAdminData<ConsoleData>("/api/admin/console");

  const sources = useMemo(() => {
    const counts: Record<BillingSource, number> = { stripe: 0, whop: 0, comped: 0, gifted: 0, free: 0 };
    for (const u of data?.users ?? []) counts[billingOf(u).source] += 1;
    return counts;
  }, [data]);

  const m = data?.metrics;
  const g = data?.growth ?? null;

  return (
    <>
      <PageHead
        title="Revenue"
        lead={
          data
            ? data.stripeMode === "off"
              ? "Stripe is not connected: MRR is estimated from the plans in the database."
              : `Source: live Stripe (${data.stripeMode} mode). Whop subscriptions and comped access are counted separately.`
            : "MRR, growth, unpaid invoices and acquisition."
        }
        actions={<RefreshButton onClick={reload} loading={loading} />}
      />
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data && m ? (
        <>
          <div className="ad-grid ad-grid--kpi">
            <Kpi label="MRR" value={m.mrr} format={(n) => eur(n)} tone="accent" sub={<>ARR {eur(m.arr)}</>} />
            <Kpi label="Active subscribers" value={m.activeSubscribers} delay={60} sub={<>{num(m.trialing)} trialing</>} />
            <Kpi label="New this month" value={m.newThisMonth} delay={120} tone="good" />
            <Kpi label="Cancellations this month" value={m.canceledThisMonth} delay={180} sub={<>churn {pct(m.churnRatePct)}</>} />
            <Kpi label="Past due" value={m.pastDue} delay={240} tone={m.pastDue > 0 ? "warn" : undefined} sub={<>{num(data.ops.failedPayments.length)} open invoices</>} />
            <Kpi label="ARPU" value={g?.arpu ?? null} format={(n) => eur(n, 2)} delay={300} sub="per subscriber per month" />
            <Kpi label="Estimated LTV" value={g?.ltv ?? null} format={(n) => eur(n)} delay={360} sub="ARPU ÷ churn" />
          </div>

          <div className="ad-grid ad-grid--3">
            <Card title="MRR by plan" delay={80}>
              {Object.keys(m.mrrByPlan).length === 0 ? (
                <Empty>No recurring revenue.</Empty>
              ) : (
                <BarList
                  items={Object.entries(m.mrrByPlan)
                    .map(([key, value]) => ({ key, value, hint: `${num(m.countByPlan[key] ?? 0)} subscribers` }))
                    .sort((a, b) => b.value - a.value)}
                  format={(n) => eur(n)}
                  labelOf={(k) => PLAN_LABELS[k as keyof typeof PLAN_LABELS] ?? k}
                />
              )}
            </Card>
            <Card title="Who pays how" delay={120}>
              <Donut
                parts={(Object.keys(sources) as BillingSource[]).filter((k) => sources[k] > 0).map((k) => ({ key: k, value: sources[k] }))}
                labelOf={(k) => BILLING_LABELS[k as BillingSource] ?? k}
                center={{ value: num(sources.stripe + sources.whop), label: "paying" }}
              />
            </Card>
            <Card title="Funnel" delay={160}>
              {g ? (
                <Funnel
                  steps={[
                    { label: "Signups", value: g.funnel.signups },
                    { label: "Onboarding done", value: g.funnel.onboarded },
                    { label: "Paying", value: g.funnel.paying },
                  ]}
                />
              ) : (
                <Empty>Available once Stripe is connected.</Empty>
              )}
            </Card>
          </div>

          <div className="ad-grid ad-grid--wide">
            <Card title="MRR added per month" delay={200}>
              {g && g.monthly.length > 0 ? (
                <>
                  <Bars
                    series={g.monthly.map((p) => ({ day: `${p.month}-01`, value: p.netMrrAdded }) as DayPoint)}
                    format={(n) => eur(n)}
                    height={150}
                  />
                  <table className="ad-table" style={{ marginTop: 12 }}>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th className="ad-num">New</th>
                        <th className="ad-num">Canceled</th>
                        <th className="ad-num">MRR added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.monthly.map((p) => (
                        <tr key={p.month}>
                          <td>{monthLabel(p.month)}</td>
                          <td className="ad-num">{num(p.newSubs)}</td>
                          <td className="ad-num">{num(p.canceledSubs)}</td>
                          <td className="ad-num">{eur(p.netMrrAdded)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <Empty>Available once Stripe is connected.</Empty>
              )}
            </Card>
            <Card title="Acquisition sources" delay={240}>
              {data.ops.acquisition.length === 0 ? (
                <Empty>No sources reported.</Empty>
              ) : (
                <BarList items={data.ops.acquisition.slice(0, 8).map((a) => ({ key: a.source, value: a.count }))} format={num} />
              )}
            </Card>
          </div>

          <Card title="Unpaid invoices" aside={<Pill tone={data.ops.failedPayments.length ? "warn" : "good"}>{num(data.ops.failedPayments.length)}</Pill>} className="ad-card--flush" delay={280}>
            {data.ops.failedPayments.length === 0 ? (
              <Empty>No pending invoices.</Empty>
            ) : (
              <div className="ad-table-wrap">
                <table className="ad-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Issued</th>
                      <th>Status</th>
                      <th className="ad-num">Amount due</th>
                      <th className="ad-num">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ops.failedPayments.map((f) => (
                      <tr key={`${f.customerId}-${f.created}`}>
                        <td>{f.email ?? f.customerId}</td>
                        <td>{dateFr(f.created)}</td>
                        <td>
                          <Pill tone="warn">{f.status ?? "open"}</Pill>
                        </td>
                        <td className="ad-num">{eur(f.amountDue, 2)}</td>
                        <td className="ad-num">
                          {f.hostedUrl ? (
                            <a href={f.hostedUrl} target="_blank" rel="noopener noreferrer">
                              Open
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}
