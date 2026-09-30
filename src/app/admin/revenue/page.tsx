"use client";

import { useMemo } from "react";
import { billingOf, type BillingSource } from "@/lib/admin-billing";
import type { DayPoint } from "@/lib/admin-aggregate";
import { useLang, type Lang } from "@/lib/useLang";
import { BarList, Bars, Donut, Funnel } from "../_components/charts";
import type { ConsoleData } from "../_components/console-types";
import { billingLabels, invoiceStatus, planLabels } from "../_components/labels";
import { Card, Empty, Kpi, LoadState, PageHead, Pill, RefreshButton, useAdminData, useAdminFormat, useT } from "../_components/ui";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function monthLabel(key: string, lang: Lang): string {
  const [y, m] = key.split("-");
  return `${(lang === "fr" ? MONTHS_FR : MONTHS)[Number(m) - 1] ?? m} '${y?.slice(2)}`;
}

// Acquisition sources are free text; only the server's placeholder is translated.
function sourceLabel(key: string, lang: Lang): string {
  return lang === "fr" && key === "(not specified)" ? "(non renseignée)" : key;
}

export default function AdminRevenuePage() {
  const { data, error, loading, reload } = useAdminData<ConsoleData>("/api/admin/console");
  const { dateFr, eur, num, pct } = useAdminFormat();
  const t = useT();
  const lang = useLang();
  const PLAN_LABELS = planLabels(lang);
  const BILLING_LABELS = billingLabels(lang);

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
        title={t("Revenue", "Revenus")}
        lead={
          data
            ? data.stripeMode === "off"
              ? t("Stripe is not connected: MRR is estimated from the plans in the database.", "Stripe n’est pas connecté : le MRR est estimé à partir des offres en base.")
              : t(
                  `Source: live Stripe (${data.stripeMode} mode). Whop subscriptions and comped access are counted separately.`,
                  `Source : Stripe en direct (mode ${data.stripeMode}). Les abonnements Whop et les accès offerts sont comptés à part.`,
                )
            : t("MRR, growth, unpaid invoices and acquisition.", "MRR, croissance, factures impayées et acquisition.")
        }
        actions={<RefreshButton onClick={reload} loading={loading} />}
      />
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data && m ? (
        <>
          <div className="ad-grid ad-grid--kpi">
            <Kpi label="MRR" value={m.mrr} format={(n) => eur(n)} tone="accent" sub={<>ARR {eur(m.arr)}</>} />
            <Kpi label={t("Active subscribers", "Abonnés actifs")} value={m.activeSubscribers} delay={60} sub={<>{num(m.trialing)} {t("trialing", "en essai")}</>} />
            <Kpi label={t("New this month", "Nouveaux ce mois-ci")} value={m.newThisMonth} delay={120} tone="good" />
            <Kpi label={t("Cancellations this month", "Résiliations ce mois-ci")} value={m.canceledThisMonth} delay={180} sub={<>churn {pct(m.churnRatePct)}</>} />
            <Kpi
              label={t("Past due", "En retard de paiement")}
              value={m.pastDue}
              delay={240}
              tone={m.pastDue > 0 ? "warn" : undefined}
              sub={<>{num(data.ops.failedPayments.length)} {t("open invoices", "factures ouvertes")}</>}
            />
            <Kpi label="ARPU" value={g?.arpu ?? null} format={(n) => eur(n, 2)} delay={300} sub={t("per subscriber per month", "par abonné et par mois")} />
            <Kpi label={t("Estimated LTV", "LTV estimée")} value={g?.ltv ?? null} format={(n) => eur(n)} delay={360} sub="ARPU ÷ churn" />
          </div>

          <div className="ad-grid ad-grid--3">
            <Card title={t("MRR by plan", "MRR par offre")} delay={80}>
              {Object.keys(m.mrrByPlan).length === 0 ? (
                <Empty>{t("No recurring revenue.", "Aucun revenu récurrent.")}</Empty>
              ) : (
                <BarList
                  items={Object.entries(m.mrrByPlan)
                    .map(([key, value]) => ({ key, value, hint: `${num(m.countByPlan[key] ?? 0)} ${t("subscribers", "abonnés")}` }))
                    .sort((a, b) => b.value - a.value)}
                  format={(n) => eur(n)}
                  labelOf={(k) => PLAN_LABELS[k as keyof typeof PLAN_LABELS] ?? k}
                />
              )}
            </Card>
            <Card title={t("Who pays how", "Qui paie comment")} delay={120}>
              <Donut
                parts={(Object.keys(sources) as BillingSource[]).filter((k) => sources[k] > 0).map((k) => ({ key: k, value: sources[k] }))}
                labelOf={(k) => BILLING_LABELS[k as BillingSource] ?? k}
                center={{ value: num(sources.stripe + sources.whop), label: t("paying", "payants") }}
              />
            </Card>
            <Card title={t("Funnel", "Entonnoir")} delay={160}>
              {g ? (
                <Funnel
                  steps={[
                    { label: t("Signups", "Inscriptions"), value: g.funnel.signups },
                    { label: t("Onboarding done", "Onboarding terminé"), value: g.funnel.onboarded },
                    { label: t("Paying", "Payants"), value: g.funnel.paying },
                  ]}
                />
              ) : (
                <Empty>{t("Available once Stripe is connected.", "Disponible une fois Stripe connecté.")}</Empty>
              )}
            </Card>
          </div>

          <div className="ad-grid ad-grid--wide">
            <Card title={t("MRR added per month", "MRR ajouté par mois")} delay={200}>
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
                        <th>{t("Month", "Mois")}</th>
                        <th className="ad-num">{t("New", "Nouveaux")}</th>
                        <th className="ad-num">{t("Canceled", "Résiliés")}</th>
                        <th className="ad-num">{t("MRR added", "MRR ajouté")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.monthly.map((p) => (
                        <tr key={p.month}>
                          <td>{monthLabel(p.month, lang)}</td>
                          <td className="ad-num">{num(p.newSubs)}</td>
                          <td className="ad-num">{num(p.canceledSubs)}</td>
                          <td className="ad-num">{eur(p.netMrrAdded)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <Empty>{t("Available once Stripe is connected.", "Disponible une fois Stripe connecté.")}</Empty>
              )}
            </Card>
            <Card title={t("Acquisition sources", "Sources d’acquisition")} delay={240}>
              {data.ops.acquisition.length === 0 ? (
                <Empty>{t("No sources reported.", "Aucune source renseignée.")}</Empty>
              ) : (
                <BarList
                  items={data.ops.acquisition.slice(0, 8).map((a) => ({ key: a.source, value: a.count }))}
                  format={num}
                  labelOf={(k) => sourceLabel(k, lang)}
                />
              )}
            </Card>
          </div>

          <Card
            title={t("Unpaid invoices", "Factures impayées")}
            aside={<Pill tone={data.ops.failedPayments.length ? "warn" : "good"}>{num(data.ops.failedPayments.length)}</Pill>}
            className="ad-card--flush"
            delay={280}
          >
            {data.ops.failedPayments.length === 0 ? (
              <Empty>{t("No pending invoices.", "Aucune facture en attente.")}</Empty>
            ) : (
              <div className="ad-table-wrap">
                <table className="ad-table">
                  <thead>
                    <tr>
                      <th>{t("Customer", "Client")}</th>
                      <th>{t("Issued", "Émise le")}</th>
                      <th>{t("Status", "Statut")}</th>
                      <th className="ad-num">{t("Amount due", "Montant dû")}</th>
                      <th className="ad-num">{t("Link", "Lien")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ops.failedPayments.map((f) => (
                      <tr key={`${f.customerId}-${f.created}`}>
                        <td>{f.email ?? f.customerId}</td>
                        <td>{dateFr(f.created)}</td>
                        <td>
                          <Pill tone="warn">{invoiceStatus(f.status ?? "open", lang)}</Pill>
                        </td>
                        <td className="ad-num">{eur(f.amountDue, 2)}</td>
                        <td className="ad-num">
                          {f.hostedUrl ? (
                            <a href={f.hostedUrl} target="_blank" rel="noopener noreferrer">
                              {t("Open", "Ouvrir")}
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
