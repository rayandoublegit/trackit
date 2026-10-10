import type { Lang } from "@/lib/useLang";
import {
  FREE_MAX_MANAGED_CREATORS,
  PRO_MAX_SHOPIFY_STORES,
  canBulkImportTemplatesCsv,
  canInviteCreators,
  canInviteTeamMembers,
  canPersistTemplates,
  canPublishGiftLinks,
  canSeeCreatorEmails,
  canUseAIOutreach,
  canUseAffiliates,
  canUseAutoFollowUp,
  canUseAutomationWorkflows,
  canUseBalance,
  canUseCreatorPortal,
  canUseFindItInbox,
  canUseFullAnalytics,
  canUseLiveLookup,
  canUseManualPayouts,
  canUseMinoAnalysis,
  canUseScripts,
  canUseShopify,
  canUseTrackit,
  getDailyDiscoveryLimit,
  getMaxManagedCreators,
  hasUnlimitedDiscoveries,
  isProOrAbove,
  lowestTierFor,
  type PlanTier,
} from "@/lib/plan-limits";
import { formatPricingHighlightLine, getPlanPricingFeatureLines, getPlanPricingHighlights } from "@/lib/plan-pricing-highlights";

/** Customer-facing plan names. Internal tiers: free | basic | pro | scale. */
export const PLAN_PRICES = {
  growthMonthly: 49,
  proMonthly: 99,
  scaleMonthly: 199,
  growthAnnual: 490,
  proAnnual: 990,
  scaleAnnual: 1990,
} as const;

/** Monthly equivalent shown on annual pricing cards (not the billed annual total). */
export const PLAN_ANNUAL_MONTHLY_EQUIVALENT = {
  growth: 41,
  pro: 82.5,
  scale: 166,
} as const;

export function checkoutCurrencyFromLang(lang: Lang): "usd" | "eur" {
  return lang === "fr" ? "eur" : "usd";
}

/** Pricing/checkout amounts follow site language (fr → EUR, en → USD). */
export function formatPricingAmount(amount: number, lang: Lang): string {
  const currency = lang === "fr" ? "EUR" : "USD";
  const locale = lang === "fr" ? "fr-FR" : "en-US";
  const hasFraction = amount % 1 !== 0;
  return amount.toLocaleString(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  });
}

export function getPlanAnnualMonthlyEquivalent(tier: Exclude<PlanTier, "free">): number {
  if (tier === "basic") return PLAN_ANNUAL_MONTHLY_EQUIVALENT.growth;
  if (tier === "pro") return PLAN_ANNUAL_MONTHLY_EQUIVALENT.pro;
  return PLAN_ANNUAL_MONTHLY_EQUIVALENT.scale;
}

export function getPlanAnnualTotal(tier: Exclude<PlanTier, "free">): number {
  if (tier === "basic") return PLAN_PRICES.growthAnnual;
  if (tier === "pro") return PLAN_PRICES.proAnnual;
  return PLAN_PRICES.scaleAnnual;
}

export function annualBilledSubtitle(annualTotal: number, lang: Lang): string {
  const amount = formatPricingAmount(annualTotal, lang);
  return lang === "fr" ? `facturé ${amount}/an` : `billed ${amount}/year`;
}

export function annualFreeMonthsBadge(lang: Lang): string {
  return lang === "fr" ? "2 mois offerts" : "2 months free";
}

export function planDisplayName(tier: PlanTier, lang: Lang): string {
  if (tier === "scale") return "Scale";
  if (tier === "pro") return "Pro";
  if (tier === "basic") return "Growth";
  return lang === "fr" ? "Gratuit" : "Free";
}

export type MarketingVariant = "compact" | "pricing" | "full";

/** Top feature lines for upgrade gates — skips empty “includes” rows. */
export function getGatePlanBullets(tier: PlanTier, lang: Lang, max = 5): string[] {
  return getPlanPricingHighlights(tier, lang)
    .filter((h) => h.value.trim().length > 0)
    .map(formatPricingHighlightLine)
    .slice(0, max);
}

/** Feature bullets for pricing grids, billing cards, and upgrade gates — from plan-pricing-highlights. */
export function getPlanMarketingFeatures(
  tier: PlanTier,
  lang: Lang,
  variant: MarketingVariant = "pricing",
): string[] {
  if (variant === "compact") return getGatePlanBullets(tier, lang, 5);
  return getPlanPricingFeatureLines(tier, lang);
}

export function getPlanCardDescription(tier: PlanTier, lang: Lang): string {
  const fr = lang === "fr";
  if (tier === "free") {
    return fr ? "Découvrez le catalogue de créateurs." : "Get a feel for the creator catalog.";
  }
  if (tier === "basic") {
    return fr
      ? "Trouvez vos créateurs sans limite, e-mails inclus."
      : "Find creators without limits, emails included.";
  }
  if (tier === "pro") {
    return fr
      ? "Gérez vos campagnes de A à Z."
      : "Run your campaigns end to end.";
  }
  return fr
    ? "Tout Pro, avec votre équipe dans l’espace de marque."
    : "All of Pro, with your team in the brand workspace.";
}

/** Feature keys for upgrade gates and the upgrade modal (requiredTier comes from plan-limits checks). */
export type GateFeatureKey =
  | "affiliates"
  | "payouts"
  | "balance"
  | "transactions"
  | "invitations"
  | "creator-content"
  | "scripts"
  | "analytics"
  | "automation"
  | "campaigns"
  | "integrations"
  | "outreach"
  | "templates"
  | "discovery"
  | "ai-outreach"
  | "bulk-import"
  | "auto-follow-up"
  | "live-lookup"
  | "mino-analysis"
  | "creator-emails"
  | "gifting-links"
  | "findit"
  | "team-members";

export type LimitGateKind = "campaigns" | "creators" | "discoveries" | "shopify-stores";

type GateDefinition = {
  requiredTier: PlanTier;
  check: (plan: PlanTier) => boolean;
  title: Record<Lang, string>;
  description: Record<Lang, string>;
};

/** Gate whose required tier is derived from its check, so plan-limits stays the single source. */
function gate(check: (plan: PlanTier) => boolean, title: Record<Lang, string>, description: Record<Lang, string>): GateDefinition {
  return { requiredTier: lowestTierFor(check), check, title, description };
}

export const FEATURE_GATES: Record<GateFeatureKey, GateDefinition> = {
  affiliates: gate(
    canUseAffiliates,
    { en: "Tracked links", fr: "Liens suivis" },
    {
      en: "Tracked affiliate links and codes come with Pro: clicks, sales and revenue attributed to each creator.",
      fr: "Les liens et codes d’affiliation suivis sont inclus dans Pro : clics, ventes et CA attribués à chaque créateur.",
    },
  ),
  payouts: gate(
    canUseManualPayouts,
    { en: "Payouts", fr: "Paiements" },
    {
      en: "Pay creators from Trackit (PayPal, Revolut, transfer or automatic Stripe payouts) with Pro.",
      fr: "Payez vos créateurs depuis Trackit (PayPal, Revolut, virement ou paiements Stripe automatiques) avec Pro.",
    },
  ),
  balance: gate(
    canUseBalance,
    { en: "Balance", fr: "Solde" },
    {
      en: "Fund your account and pay creators automatically via Stripe Connect.",
      fr: "Alimentez votre compte et payez vos créateurs automatiquement via Stripe Connect.",
    },
  ),
  transactions: gate(
    canUseManualPayouts,
    { en: "Payments", fr: "Historique" },
    {
      en: "View your full payment history and transaction details.",
      fr: "Consultez l'historique complet de vos paiements et transactions.",
    },
  ),
  invitations: gate(
    canInviteCreators,
    { en: "Invitations", fr: "Invitations" },
    {
      en: "Invite creators to your program with dedicated portal access.",
      fr: "Invitez des créateurs avec un portail dédié pour suivre leurs gains et leur contenu.",
    },
  ),
  "creator-content": gate(
    canUseCreatorPortal,
    { en: "Creator content", fr: "Contenu créateur" },
    {
      en: "Upload creator content and track performance stats (views, engagement).",
      fr: "Importez le contenu de vos créateurs et suivez les performances (vues, engagement).",
    },
  ),
  scripts: gate(
    canUseScripts,
    { en: "Scripts", fr: "Scripts" },
    {
      en: "Create scripts and briefs for your creators to follow.",
      fr: "Créez des scripts et briefs pour guider vos créateurs.",
    },
  ),
  analytics: gate(
    canUseFullAnalytics,
    { en: "Analytics", fr: "Analytiques" },
    {
      en: "Full analytics dashboard with campaign and creator performance.",
      fr: "Tableau de bord analytique complet : performances des campagnes et des créateurs.",
    },
  ),
  automation: gate(
    canUseAutomationWorkflows,
    { en: "Automation", fr: "Automatisation" },
    {
      en: "Build workflows that run your creator marketing on autopilot.",
      fr: "Créez des workflows qui automatisent votre marketing créateur.",
    },
  ),
  campaigns: gate(
    canUseTrackit,
    { en: "Campaigns", fr: "Campagnes" },
    {
      en: "Campaigns, affiliate links and codes, Shopify sales and commissions come with Pro, with unlimited campaigns.",
      fr: "Les campagnes, liens et codes d’affiliation, ventes Shopify et commissions sont inclus dans Pro, avec des campagnes illimitées.",
    },
  ),
  integrations: gate(
    canUseShopify,
    { en: "Shopify", fr: "Shopify" },
    {
      en: `Connect up to ${PRO_MAX_SHOPIFY_STORES} Shopify stores with Pro to sync sales and attribute commissions automatically.`,
      fr: `Connectez jusqu’à ${PRO_MAX_SHOPIFY_STORES} boutiques Shopify avec Pro pour synchroniser les ventes et attribuer les commissions automatiquement.`,
    },
  ),
  outreach: gate(
    (plan) => plan !== "free",
    { en: "Outreach", fr: "Messages" },
    {
      en: "Contact creators from Trackit with Growth. AI-written drafts, templates and follow-ups come with Pro.",
      fr: "Contactez les créateurs depuis Trackit avec Growth. Les brouillons écrits par l’IA, les modèles et les relances sont inclus dans Pro.",
    },
  ),
  templates: gate(
    canPersistTemplates,
    { en: "Outreach templates", fr: "Modèles d’outreach" },
    {
      en: "Save, import and reuse your best-performing messages with Pro.",
      fr: "Enregistrez, importez et réutilisez vos messages les plus performants avec Pro.",
    },
  ),
  discovery: gate(
    hasUnlimitedDiscoveries,
    { en: "Creator search", fr: "Recherche de créateurs" },
    {
      en: "Free shows the first results of each search. Growth unlocks unlimited creator search, live lookups and Mino analyses.",
      fr: "Le plan Gratuit affiche les premiers résultats de chaque recherche. Growth débloque la recherche de créateurs illimitée, les recherches en direct et les analyses Mino.",
    },
  ),
  "ai-outreach": gate(
    canUseAIOutreach,
    { en: "AI email drafts", fr: "Brouillons écrits par l’IA" },
    {
      en: "Mino writes each first email for the creator with Pro and Scale, with no monthly cap.",
      fr: "Mino rédige chaque premier e-mail pour le créateur avec Pro et Scale, sans limite mensuelle.",
    },
  ),
  "bulk-import": gate(
    canBulkImportTemplatesCsv,
    { en: "Bulk CSV import", fr: "Import CSV en masse" },
    {
      en: "Import all your outreach templates and creators from CSV in one click.",
      fr: "Importez tous vos modèles et créateurs depuis un CSV en un clic.",
    },
  ),
  "auto-follow-up": gate(
    canUseAutoFollowUp,
    { en: "Auto follow-ups", fr: "Relances automatiques" },
    {
      en: "Schedule automatic follow-ups and convert more creators.",
      fr: "Programmez des relances automatiques et convertissez plus de créateurs.",
    },
  ),
  "live-lookup": gate(
    canUseLiveLookup,
    { en: "Live creator lookup", fr: "Recherche en direct" },
    {
      en: "Look up any TikTok, Instagram or YouTube creator live, even when they are not in the catalog yet. Unlimited with Growth.",
      fr: "Recherchez en direct n’importe quel créateur TikTok, Instagram ou YouTube, même absent du catalogue. Illimité avec Growth.",
    },
  ),
  "mino-analysis": gate(
    canUseMinoAnalysis,
    { en: "Mino site and photo analysis", fr: "Analyse de site et de photo par Mino" },
    {
      en: "Share your website or a product photo: Mino works out your brand and finds the creators that fit. Unlimited with Growth.",
      fr: "Partagez votre site ou une photo produit : Mino analyse votre marque et trouve les créateurs qui lui correspondent. Illimité avec Growth.",
    },
  ),
  "creator-emails": gate(
    canSeeCreatorEmails,
    { en: "Creator emails", fr: "E-mails des créateurs" },
    {
      en: "See the contact email of every creator who has one, in the catalog, on creator pages and in Mino. Included from Growth.",
      fr: "Affichez l’e-mail de contact de chaque créateur qui en a un, dans le catalogue, sur les pages créateur et dans Mino. Inclus dès Growth.",
    },
  ),
  "gifting-links": gate(
    canPublishGiftLinks,
    { en: "Gifting share links", fr: "Liens de gifting" },
    {
      en: "Publish your gifting campaigns with a public link creators apply to. Unlimited campaigns and spots with Pro.",
      fr: "Publiez vos campagnes de gifting avec un lien public auquel les créateurs candidatent. Campagnes et places illimitées avec Pro.",
    },
  ),
  findit: gate(
    canUseFindItInbox,
    { en: "Find It inbox", fr: "Réception Find It" },
    {
      en: "Receive and review the content your creators send, linked to your campaigns. Included in Pro.",
      fr: "Recevez et validez les contenus envoyés par vos créateurs, reliés à vos campagnes. Inclus dans Pro.",
    },
  ),
  "team-members": gate(
    canInviteTeamMembers,
    { en: "Team members", fr: "Membres de l’équipe" },
    {
      en: "Invite your colleagues into your brand workspace. Scale is Pro plus team members.",
      fr: "Invitez vos collègues dans votre espace de marque. Scale, c’est Pro avec les membres de l’équipe en plus.",
    },
  ),
};

export function getManagedCreatorLimitLabel(plan: PlanTier, lang: Lang): string {
  const fr = lang === "fr";
  if (plan === "free") {
    return fr
      ? `jusqu'à ${FREE_MAX_MANAGED_CREATORS} créateurs`
      : `up to ${FREE_MAX_MANAGED_CREATORS} creators`;
  }
  return fr ? "créateurs illimités" : "unlimited creators";
}

export function getNextTierForCreatorLimit(plan: PlanTier): PlanTier {
  // Free is the only capped plan — any paid tier unlocks unlimited creators.
  if (plan === "free") return "basic";
  return "scale";
}

export function isFeatureAllowed(featureKey: GateFeatureKey, plan: PlanTier): boolean {
  return FEATURE_GATES[featureKey].check(plan);
}

export function getPlanMonthlyPrice(tier: PlanTier): number | null {
  if (tier === "free") return 0;
  if (tier === "basic") return PLAN_PRICES.growthMonthly;
  if (tier === "pro") return PLAN_PRICES.proMonthly;
  return PLAN_PRICES.scaleMonthly;
}

export type GateModalProps = {
  title: string;
  description: string;
  bullets: string[];
  planBadge: string;
  primaryLabel: string;
  requiredTier: PlanTier;
};

/** Modal copy + pricing bullets for a page-level or soft gate. */
export function getGateModalProps(featureKey: GateFeatureKey, lang: Lang): GateModalProps {
  const gate = FEATURE_GATES[featureKey];
  const planName = planDisplayName(gate.requiredTier, lang);
  const bullets = getGatePlanBullets(gate.requiredTier, lang);
  const fr = lang === "fr";

  return {
    title: fr ? `${gate.title.fr} — plan ${planName}` : `${gate.title.en} — ${planName} plan`,
    description: gate.description[lang],
    bullets,
    planBadge: planName,
    primaryLabel: fr ? `Passer à ${planName}` : `Upgrade to ${planName}`,
    requiredTier: gate.requiredTier,
  };
}

export function getNextTierForLimit(kind: LimitGateKind, plan: PlanTier): PlanTier | null {
  if (kind === "campaigns" || kind === "shopify-stores") {
    // Trackit (campaigns, Shopify) is Pro; Pro and Scale have the same limits.
    return isProOrAbove(plan) ? null : lowestTierFor(canUseTrackit);
  }
  if (kind === "discoveries") return plan === "free" ? lowestTierFor(hasUnlimitedDiscoveries) : null;
  // creators: Free is the only capped plan.
  return plan === "free" ? "basic" : null;
}

/** Modal copy when a numeric plan limit is reached (campaigns, creators, discoveries, stores). */
export function getLimitUpgradeModalProps(
  kind: LimitGateKind,
  currentPlan: PlanTier,
  lang: Lang,
): GateModalProps | null {
  const nextTier = getNextTierForLimit(kind, currentPlan);
  if (!nextTier) return null;

  const planName = planDisplayName(nextTier, lang);
  const bullets = getGatePlanBullets(nextTier, lang);
  const fr = lang === "fr";
  const base = {
    bullets,
    planBadge: planName,
    primaryLabel: fr ? `Passer à ${planName}` : `Upgrade to ${planName}`,
    requiredTier: nextTier,
  };

  if (kind === "campaigns") {
    return {
      ...base,
      title: fr ? "Créer des campagnes" : "Create campaigns",
      description: fr
        ? `Les campagnes, liens et codes d’affiliation, ventes Shopify et commissions sont inclus dans ${planName}, avec des campagnes illimitées.`
        : `Campaigns, affiliate links and codes, Shopify sales and commissions come with ${planName}, with unlimited campaigns.`,
    };
  }

  if (kind === "creators") {
    const max = getMaxManagedCreators(currentPlan) ?? FREE_MAX_MANAGED_CREATORS;
    return {
      ...base,
      title: fr ? "Limite de créateurs atteinte" : "Creator limit reached",
      description: fr
        ? `Le plan Gratuit inclut ${max} créateurs suivis. Passez à ${planName} pour des créateurs illimités.`
        : `Free includes ${max} tracked creators. Upgrade to ${planName} for unlimited creators.`,
    };
  }

  if (kind === "discoveries") {
    const currentLimit = getDailyDiscoveryLimit(currentPlan);
    return {
      ...base,
      title: fr ? `Vous avez utilisé vos ${currentLimit} découvertes` : `You've used your ${currentLimit} discoveries`,
      description: fr
        ? `Passez à ${planName} pour une recherche de créateurs illimitée.`
        : `Upgrade to ${planName} for unlimited creator search.`,
    };
  }

  // shopify-stores
  return {
    ...base,
    title: fr ? "Connecter Shopify" : "Connect Shopify",
    description: fr
      ? `Shopify est inclus dans ${planName} : jusqu’à ${PRO_MAX_SHOPIFY_STORES} boutiques connectées.`
      : `Shopify comes with ${planName}: up to ${PRO_MAX_SHOPIFY_STORES} connected stores.`,
  };
}

export function formatUpgradePrimaryLabel(tier: PlanTier, lang: Lang): string {
  const name = planDisplayName(tier, lang);
  const price = getPlanMonthlyPrice(tier);
  if (price == null || price === 0) {
    return lang === "fr" ? `Passer à ${name}` : `Upgrade to ${name}`;
  }
  const amount = formatPricingAmount(price, lang);
  return lang === "fr" ? `Passer à ${name} ${amount}/mois` : `Upgrade to ${name} ${amount}/mo`;
}

export function runGateUpgrade(
  key: GateFeatureKey,
  lang: Lang,
  handlers?: {
    onUpgrade?: () => void;
    onUpgradePro?: () => void;
    onUpgradeScale?: () => void;
  },
): void {
  const props = getGateModalProps(key, lang);
  const tier = props.requiredTier;
  if (tier === "free") return;
  void startTierCheckout(tier, lang).catch((err) => {
    if (handlers) {
      if (tier === "scale") void handlers.onUpgradeScale?.();
      else if (tier === "pro") void handlers.onUpgradePro?.();
      else void handlers.onUpgrade?.();
      return;
    }
    alert(err instanceof Error ? err.message : checkoutErrorMessage(lang));
  });
}

function checkoutErrorMessage(lang: Lang): string {
  return lang === "fr" ? "Impossible de démarrer le paiement." : "Could not start checkout";
}

// Checkout pulls in the Supabase client: load it when a checkout starts.
async function startTierCheckout(tier: Exclude<PlanTier, "free">, lang: Lang): Promise<void> {
  const { checkoutPlanTier } = await import("@/lib/checkout");
  await checkoutPlanTier(tier, lang);
}

export function runTierUpgrade(tier: PlanTier, lang: Lang): void {
  if (tier === "free") return;
  void startTierCheckout(tier, lang).catch((err) => {
    alert(err instanceof Error ? err.message : checkoutErrorMessage(lang));
  });
}
