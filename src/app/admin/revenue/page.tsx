"use client";

import { useMemo } from "react";
import { BILLING_LABELS, PLAN_LABELS, billingOf, type BillingSource } from "@/lib/admin-billing";
import type { DayPoint } from "@/lib/admin-aggregate";
import { BarList, Bars, Donut, Funnel } from "../_components/charts";
import type { ConsoleData } from "../_components/console-types";
import { Card, Empty, Kpi, LoadState, PageHead, Pill, RefreshButton, dateFr, eur, num, pct, useAdminData } from "../_components/ui";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y?.slice(2)}`;
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
        title="Revenus"
        lead={
          data
            ? data.stripeMode === "off"
              ? "Stripe n’est pas branché : le MRR est estimé à partir des plans en base."
              : `Source : Stripe en direct (mode ${data.stripeMode}). Les abonnements Whop et les accès offerts sont comptés à part.`
            : "MRR, croissance, impayés et acquisition."
        }
        actions={<RefreshButton onClick={reload} loading={loading} />}
      />
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data && m ? (
        <>
          <div className="ad-grid ad-grid--kpi">
            <Kpi label="MRR" value={m.mrr} format={(n) => eur(n)} tone="accent" sub={<>ARR {eur(m.arr)}</>} />
            <Kpi label="Abonnés actifs" value={m.activeSubscribers} delay={60} sub={<>{num(m.trialing)} en essai</>} />
            <Kpi label="Nouveaux ce mois" value={m.newThisMonth} delay={120} tone="good" />
            <Kpi label="Résiliations ce mois" value={m.canceledThisMonth} delay={180} sub={<>churn {pct(m.churnRatePct)}</>} />
            <Kpi label="Impayés" value={m.pastDue} delay={240} tone={m.pastDue > 0 ? "warn" : undefined} sub={<>{num(data.ops.failedPayments.length)} factures ouvertes</>} />
            <Kpi label="ARPU" value={g?.arpu ?? null} format={(n) => eur(n, 2)} delay={300} sub="par abonné et par mois" />
            <Kpi label="LTV estimée" value={g?.ltv ?? null} format={(n) => eur(n)} delay={360} sub="ARPU ÷ churn" />
          </div>

          <div className="ad-grid ad-grid--3">
            <Card title="MRR par plan" delay={80}>
              {Object.keys(m.mrrByPlan).length === 0 ? (
                <Empty>Aucun revenu récurrent.</Empty>
              ) : (
                <BarList
                  items={Object.entries(m.mrrByPlan)
                    .map(([key, value]) => ({ key, value, hint: `${num(m.countByPlan[key] ?? 0)} abonnés` }))
                    .sort((a, b) => b.value - a.value)}
                  format={(n) => eur(n)}
                  labelOf={(k) => PLAN_LABELS[k as keyof typeof PLAN_LABELS] ?? k}
                />
              )}
            </Card>
            <Card title="Qui paie comment" delay={120}>
              <Donut
                parts={(Object.keys(sources) as BillingSource[]).filter((k) => sources[k] > 0).map((k) => ({ key: k, value: sources[k] }))}
                labelOf={(k) => BILLING_LABELS[k as BillingSource] ?? k}
                center={{ value: num(sources.stripe + sources.whop), label: "payants" }}
              />
            </Card>
            <Card title="Entonnoir" delay={160}>
              {g ? (
                <Funnel
                  steps={[
                    { label: "Inscrits", value: g.funnel.signups },
                    { label: "Onboarding fini", value: g.funnel.onboarded },
                    { label: "Payants", value: g.funnel.paying },
                  ]}
                />
              ) : (
                <Empty>Disponible avec Stripe branché.</Empty>
              )}
            </Card>
          </div>

          <div className="ad-grid ad-grid--wide">
            <Card title="MRR ajouté par mois" delay={200}>
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
                        <th>Mois</th>
                        <th className="ad-num">Nouveaux</th>
                        <th className="ad-num">Résiliés</th>
                        <th className="ad-num">MRR ajouté</th>
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
                <Empty>Disponible avec Stripe branché.</Empty>
              )}
            </Card>
            <Card title="Sources d’acquisition" delay={240}>
              {data.ops.acquisition.length === 0 ? (
                <Empty>Aucune source renseignée.</Empty>
              ) : (
                <BarList items={data.ops.acquisition.slice(0, 8).map((a) => ({ key: a.source, value: a.count }))} format={num} />
              )}
            </Card>
          </div>

          <Card title="Factures impayées" aside={<Pill tone={data.ops.failedPayments.length ? "warn" : "good"}>{num(data.ops.failedPayments.length)}</Pill>} className="ad-card--flush" delay={280}>
            {data.ops.failedPayments.length === 0 ? (
              <Empty>Aucune facture en attente.</Empty>
            ) : (
              <div className="ad-table-wrap">
                <table className="ad-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Émise</th>
                      <th>Statut</th>
                      <th className="ad-num">Reste dû</th>
                      <th className="ad-num">Lien</th>
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
                              Ouvrir
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
