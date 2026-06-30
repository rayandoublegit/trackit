import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

export type FailedPayment = {
  customerId: string;
  email: string | null;
  amountDue: number;
  currency: string;
  status: string | null;
  created: number;
  hostedUrl: string | null;
};

export type AcquisitionSource = { source: string; count: number };

export type OpsData = {
  failedPayments: FailedPayment[];
  acquisition: AcquisitionSource[];
};

export async function computeOps(stripe: Stripe, db: SupabaseClient): Promise<OpsData> {
  // 1) Impayes a relancer: factures open + past_due / uncollectible
  const failedPayments: FailedPayment[] = [];
  try {
    const open = await stripe.invoices.list({ status: "open", limit: 50 });
    for (const inv of open.data) {
      // On ne garde que celles reellement dues (montant restant > 0)
      if ((inv.amount_remaining ?? 0) <= 0) continue;
      failedPayments.push({
        customerId: typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? "",
        email: inv.customer_email ?? null,
        amountDue: (inv.amount_remaining ?? 0) / 100,
        currency: inv.currency ?? "eur",
        status: inv.status ?? null,
        created: inv.created,
        hostedUrl: inv.hosted_invoice_url ?? null,
      });
    }
  } catch (e) {
    console.error("computeOps invoices:", e);
  }

  // 2) Sources d'acquisition: repartition de referral_source
  const acquisition: AcquisitionSource[] = [];
  try {
    const { data: rows } = await db.from("profiles").select("referral_source");
    const counts: Record<string, number> = {};
    for (const r of rows ?? []) {
      const raw = (r as { referral_source: string | null }).referral_source;
      const key = raw && String(raw).trim() ? String(raw).trim() : "(non renseigne)";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    for (const [source, count] of Object.entries(counts)) acquisition.push({ source, count });
    acquisition.sort((a, b) => b.count - a.count);
  } catch (e) {
    console.error("computeOps acquisition:", e);
  }

  return { failedPayments, acquisition };
}
