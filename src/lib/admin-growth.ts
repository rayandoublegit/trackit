import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

function monthKey(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthlyAmount(
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
  return euros / Math.max(1, intervalCount);
}

export type GrowthPoint = {
  month: string; // "2026-06"
  newSubs: number;
  canceledSubs: number;
  netMrrAdded: number; // MRR ajoute par les nouveaux abos du mois
};

export type FunnelData = {
  signups: number;
  onboarded: number;
  paying: number;
  onboardRatePct: number; // onboarded / signups
  payRatePct: number; // paying / signups
};

export type GrowthData = {
  monthly: GrowthPoint[]; // 6 derniers mois, ordre chronologique
  arpu: number; // MRR / abonnes actifs
  ltv: number; // arpu / churn mensuel (capé)
  funnel: FunnelData;
  currency: string;
};

/**
 * Donnees de croissance: serie mensuelle (nouveaux/annules/MRR ajoute),
 * ARPU, LTV estimee, et funnel signup -> onboarding -> payant.
 */
export async function computeGrowth(
  stripe: Stripe,
  db: SupabaseClient,
  churnRatePct: number,
  mrr: number,
  activeSubscribers: number
): Promise<GrowthData> {
  let currency = "eur";

  // 6 derniers mois (clefs chronologiques)
  const now = new Date();
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const bucket: Record<string, GrowthPoint> = {};
  for (const mth of months) bucket[mth] = { month: mth, newSubs: 0, canceledSubs: 0, netMrrAdded: 0 };

  // Parcours de tous les abonnements Stripe
  for await (const sub of stripe.subscriptions.list({
    status: "all",
    limit: 100,
    expand: ["data.items.data.price"],
  })) {
    const price = sub.items.data[0]?.price;
    if (price?.currency) currency = price.currency;
    const monthly = monthlyAmount(
      price?.unit_amount ?? null,
      price?.recurring?.interval,
      price?.recurring?.interval_count ?? 1,
      sub.items.data[0]?.quantity ?? 1
    );

    const createdKey = monthKey(sub.created);
    if (bucket[createdKey]) {
      bucket[createdKey].newSubs += 1;
      bucket[createdKey].netMrrAdded += monthly;
    }
    if (sub.canceled_at) {
      const cKey = monthKey(sub.canceled_at);
      if (bucket[cKey]) bucket[cKey].canceledSubs += 1;
    }
  }

  const monthly = months.map((mth) => {
    const b = bucket[mth];
    return { ...b, netMrrAdded: Math.round(b.netMrrAdded * 100) / 100 };
  });

  // ARPU et LTV
  const arpu = activeSubscribers > 0 ? mrr / activeSubscribers : 0;
  // LTV = ARPU / churn (en fraction). Capé pour eviter l'infini si churn ~ 0.
  const churnFraction = Math.max(churnRatePct / 100, 0.01);
  const ltv = arpu / churnFraction;

  // Funnel depuis profiles (etat applicatif)
  const { data: profs } = await db
    .from("profiles")
    .select("onboarding_completed, plan, subscription_active");
  const rows = profs ?? [];
  const signups = rows.length;
  const onboarded = rows.filter((r) => r.onboarding_completed === true).length;
  const paying = rows.filter(
    (r) => r.subscription_active === true || (r.plan && String(r.plan).toLowerCase() !== "free")
  ).length;

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const funnel: FunnelData = {
    signups,
    onboarded,
    paying,
    onboardRatePct: signups > 0 ? round2((onboarded / signups) * 100) : 0,
    payRatePct: signups > 0 ? round2((paying / signups) * 100) : 0,
  };

  return {
    monthly,
    arpu: round2(arpu),
    ltv: round2(ltv),
    funnel,
    currency,
  };
}
