// French display labels for the billing vocabulary in @/lib/admin-billing.
import { BILLING_LABELS, PLAN_LABELS, type BillingSource } from "@/lib/admin-billing";
import type { AcqChannel } from "@/lib/admin-acquisition";
import type { PlanTier } from "@/lib/plan-limits";
import type { Lang } from "@/lib/useLang";

const PLAN_LABELS_FR: Record<PlanTier, string> = { free: "Gratuit", basic: "Growth", pro: "Pro", scale: "Scale" };

const BILLING_LABELS_FR: Record<BillingSource, string> = {
  stripe: "Stripe",
  whop: "Whop",
  comped: "Offert (permanent)",
  gifted: "Offert (temporaire)",
  free: "Gratuit",
};

export function planLabels(lang: Lang): Record<PlanTier, string> {
  return lang === "fr" ? PLAN_LABELS_FR : PLAN_LABELS;
}

export function billingLabels(lang: Lang): Record<BillingSource, string> {
  return lang === "fr" ? BILLING_LABELS_FR : BILLING_LABELS;
}

const INVOICE_STATUS_FR: Record<string, string> = {
  draft: "brouillon",
  open: "ouverte",
  paid: "payée",
  uncollectible: "irrécouvrable",
  void: "annulée",
};

/** Stripe invoice status as shown in the console (raw value in English). */
export function invoiceStatus(status: string, lang: Lang): string {
  return lang === "fr" ? (INVOICE_STATUS_FR[status] ?? status) : status;
}

const SUBSCRIPTION_STATUS_FR: Record<string, string> = {
  active: "active",
  trialing: "en essai",
  past_due: "en retard de paiement",
  canceled: "résiliée",
  unpaid: "impayée",
  incomplete: "incomplète",
  incomplete_expired: "incomplète (expirée)",
  paused: "en pause",
};

/** Stripe subscription status as shown in the console (raw value in English). */
export function subscriptionStatus(status: string, lang: Lang): string {
  return lang === "fr" ? (SUBSCRIPTION_STATUS_FR[status] ?? status) : status;
}

const CHANNEL_LABELS: Record<AcqChannel | "all", [string, string]> = {
  all: ["All sources", "Toutes sources"],
  tiktok: ["TikTok", "TikTok"],
  instagram: ["Instagram", "Instagram"],
  youtube: ["YouTube", "YouTube"],
  twitter: ["X (Twitter)", "X (Twitter)"],
  reddit: ["Reddit", "Reddit"],
  google: ["Google", "Google"],
  friend: ["A friend", "Un ami"],
  other: ["Other", "Autre"],
  unknown: ["Not specified", "Non renseignée"],
};

/** Acquisition channel as shown in the console. */
export function channelLabel(key: string, lang: Lang): string {
  const pair = CHANNEL_LABELS[key as AcqChannel | "all"];
  return pair ? pair[lang === "fr" ? 1 : 0] : key;
}
