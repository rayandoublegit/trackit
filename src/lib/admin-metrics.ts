import type Stripe from "stripe";

// Normalise un montant d'abonnement en MRR (centimes -> euros, annuel -> mensuel).
function toMonthlyAmount(
  unitAmount: number | null,
  interval: Stripe.Price.Recurring.Interval | undefined,
  intervalCount: number,
  quantity: number
): number {
  if (!unitAmount) return 0;
  const euros = (unitAmount / 100) * quantity;
  if (interval === "year") return euros / 12 / Math.max(1, intervalCount);
  if (interval === "week") return (euros * 52) / 12 / Math.max(1, intervalCount);
  if (interval === "day") return (euros * 365) / 12 / Math.max(1, intervalCount);
  // month par defaut
  return euros / Math.max(1, intervalCount);
}

export type AdminMetrics = {
  mrr: number;
  arr: number;
  activeSubscribers: number;
  trialing: number;
  pastDue: number;
  canceledThisMonth: number;
  newThisMonth: number;
  churnRatePct: number;
  mrrByPlan: Record<string, number>;
  countByPlan: Record<string, number>;
  currency: string;
};

/**
 * Calcule les metriques business depuis Stripe en direct (source de verite argent).
 * Parcourt tous les abonnements, somme le MRR des actifs, mesure le churn du mois.
 */
export async function computeMetrics(stripe: Stripe): Promise<AdminMetrics> {
  const now = new Date();
  const startOfMonth = Math.floor(
    new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000
  );

  let mrr = 0;
  let activeSubscribers = 0;
  let trialing = 0;
  let pastDue = 0;
  let canceledThisMonth = 0;
  let newThisMonth = 0;
  let currency = "eur";
  const mrrByPlan: Record<string, number> = {};
  const countByPlan: Record<string, number> = {};

  // On pagine tous les abonnements (status all) pour mesurer actifs + churn.
  for await (const sub of stripe.subscriptions.list({
    status: "all",
    limit: 100,
    expand: ["data.items.data.price"],
  })) {
    const status = sub.status;
    const item = sub.items.data[0];
    const price = item?.price;
    const planNick =
      (price?.nickname ||
        (price?.metadata && price.metadata.plan) ||
        (sub.metadata && sub.metadata.plan) ||
        "inconnu").toLowerCase();

    if (price?.currency) currency = price.currency;

    const monthly = toMonthlyAmount(
      price?.unit_amount ?? null,
      price?.recurring?.interval,
      price?.recurring?.interval_count ?? 1,
      item?.quantity ?? 1
    );

    // Nouveaux abonnements crees ce mois-ci
    if (sub.created >= startOfMonth) newThisMonth += 1;

    // Annulations ce mois-ci (churn)
    if (sub.canceled_at && sub.canceled_at >= startOfMonth) {
      canceledThisMonth += 1;
    }

    if (status === "active") {
      activeSubscribers += 1;
      mrr += monthly;
      mrrByPlan[planNick] = (mrrByPlan[planNick] ?? 0) + monthly;
      countByPlan[planNick] = (countByPlan[planNick] ?? 0) + 1;
    } else if (status === "trialing") {
      trialing += 1;
    } else if (status === "past_due" || status === "unpaid") {
      pastDue += 1;
    }
  }

  // Churn simple: annulations du mois / (actifs + annulations du mois).
  const denom = activeSubscribers + canceledThisMonth;
  const churnRatePct = denom > 0 ? (canceledThisMonth / denom) * 100 : 0;

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const roundedByPlan: Record<string, number> = {};
  for (const [k, v] of Object.entries(mrrByPlan)) roundedByPlan[k] = round2(v);

  return {
    mrr: round2(mrr),
    arr: round2(mrr * 12),
    activeSubscribers,
    trialing,
    pastDue,
    canceledThisMonth,
    newThisMonth,
    churnRatePct: round2(churnRatePct),
    mrrByPlan: roundedByPlan,
    countByPlan,
    currency,
  };
}
