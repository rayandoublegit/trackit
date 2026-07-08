import type { Lang } from "@/lib/useLang";
import {
  BASIC_MAX_CAMPAIGNS,
  BASIC_MAX_MANAGED_CREATORS,
  BASIC_MAX_SHOPIFY_STORES,
  BASIC_MONTHLY_AI_MESSAGES,
  BASIC_MONTHLY_DISCOVERIES,
  BASIC_RESULTS_PER_SEARCH,
  FREE_LIFETIME_DISCOVERIES,
  FREE_MAX_MANAGED_CREATORS,
  FREE_RESULTS_PER_SEARCH,
  PRO_MAX_CAMPAIGNS,
  PRO_MAX_MANAGED_CREATORS,
  PRO_MONTHLY_DISCOVERIES,
  PRO_RESULTS_PER_SEARCH,
  SCALE_MAX_SHOPIFY_STORES,
  canUseAutoFollowUp,
  canBulkImportTemplatesCsv,
  canCreateTemplates,
  canImportTemplates,
  canInviteCreators,
  canPersistTemplates,
  canUseAffiliates,
  canUseAutomationWorkflows,
  canUseBalance,
  canUseCreatorPortal,
  canUseFullAnalytics,
  canUseManualPayouts,
  canUseScripts,
  canUseShopify,
  getMaxActiveCampaigns,
  getMaxManagedCreators,
  getDailyDiscoveryLimit,
  maxShopifyStores,
  type PlanTier,
} from "@/lib/plan-limits";
import { formatPricingHighlightLine, getPlanPricingFeatureLines, getPlanPricingHighlights } from "@/lib/plan-pricing-highlights";
import { checkoutPlanTier } from "@/lib/checkout";

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
  if (tier === "scale") return "Business";
  if (tier === "pro") return "Pro";
  if (tier === "basic") return "Starter";
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
    return fr ? "Commencez sans engagement." : "Get started with no commitment.";
  }
  if (tier === "basic") {
    return fr
      ? "Trackez vos premières ventes créateurs."
      : "Track your first creator sales.";
  }
  if (tier === "pro") {
    return fr
      ? "Opérez vos campagnes de bout en bout."
      : "Run your campaigns end to end.";
  }
  return fr
    ? "Tout, sans limites."
    : "Everything, without limits.";
}

/** Feature bullets for pricing grids, billing cards, and upgrade gates — from plan-pricing-highlights. */
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
  | "auto-follow-up";

export type LimitGateKind = "campaigns" | "creators" | "discoveries" | "shopify-stores";

type GateDefinition = {
  requiredTier: PlanTier;
  check: (plan: PlanTier) => boolean;
  title: Record<Lang, string>;
  description: Record<Lang, string>;
};

export const FEATURE_GATES: Record<GateFeatureKey, GateDefinition> = {
  affiliates: {
    requiredTier: "basic",
    check: canUseAffiliates,
    title: { en: "Affiliates", fr: "Affiliés" },
    description: {
      en: "Track affiliate links and attribute sales to your creators.",
      fr: "Suivez les liens d'affiliation et attribuez les ventes à vos créateurs.",
    },
  },
  payouts: {
    requiredTier: "basic",
    check: canUseManualPayouts,
    title: { en: "Payouts", fr: "Paiements" },
    description: {
      en: "Pay creators manually via PayPal, Revolut, or bank transfer.",
      fr: "Payez vos créateurs manuellement via PayPal, Revolut ou virement.",
    },
  },
  balance: {
    requiredTier: "scale",
    check: canUseBalance,
    title: { en: "Balance", fr: "Solde" },
    description: {
      en: "Fund your account and pay creators automatically via Stripe Connect.",
      fr: "Alimentez votre compte et payez vos créateurs automatiquement via Stripe Connect.",
    },
  },
  transactions: {
    requiredTier: "basic",
    check: canUseManualPayouts,
    title: { en: "Payments", fr: "Historique" },
    description: {
      en: "View your full payment history and transaction details.",
      fr: "Consultez l'historique complet de vos paiements et transactions.",
    },
  },
  invitations: {
    requiredTier: "pro",
    check: canInviteCreators,
    title: { en: "Invitations", fr: "Invitations" },
    description: {
      en: "Invite creators to your program with dedicated portal access.",
      fr: "Invitez des créateurs avec un portail dédié pour suivre leurs gains et leur contenu.",
    },
  },
  "creator-content": {
    requiredTier: "pro",
    check: canUseCreatorPortal,
    title: { en: "Creator content", fr: "Contenu créateur" },
    description: {
      en: "Upload creator content and track performance stats (views, engagement).",
      fr: "Importez le contenu de vos créateurs et suivez les performances (vues, engagement).",
    },
  },
  scripts: {
    requiredTier: "pro",
    check: canUseScripts,
    title: { en: "Scripts", fr: "Scripts" },
    description: {
      en: "Create scripts and briefs for your creators to follow.",
      fr: "Créez des scripts et briefs pour guider vos créateurs.",
    },
  },
  analytics: {
    requiredTier: "basic",
    check: canUseFullAnalytics,
    title: { en: "Analytics", fr: "Analytiques" },
    description: {
      en: "Full analytics dashboard with campaign and creator performance.",
      fr: "Tableau de bord analytique complet : campagnes et performances créateurs.",
    },
  },
  automation: {
    requiredTier: "pro",
    check: canUseAutomationWorkflows,
    title: { en: "Automation", fr: "Automatisation" },
    description: {
      en: "Build workflows that run your creator marketing on autopilot.",
      fr: "Créez des workflows qui automatisent votre marketing créateur.",
    },
  },
  campaigns: {
    requiredTier: "basic",
    check: (plan) => plan !== "free",
    title: { en: "Campaigns", fr: "Campagnes" },
    description: {
      en: "Launch and manage creator campaigns with tracking and commissions.",
      fr: "Lancez et gérez des campagnes créateurs avec suivi et commissions.",
    },
  },
  integrations: {
    requiredTier: "basic",
    check: canUseShopify,
    title: { en: "Shopify", fr: "Shopify" },
    description: {
      en: `Connect up to ${BASIC_MAX_SHOPIFY_STORES} Shopify store on Starter to track sales and attribute commissions.`,
      fr: `Connectez ${BASIC_MAX_SHOPIFY_STORES} boutique Shopify sur Starter pour suivre les ventes et attribuer les commissions.`,
    },
  },
  outreach: {
    requiredTier: "basic",
    check: (plan) => plan !== "free",
    title: { en: "Outreach", fr: "Messages" },
    description: {
      en: "AI-powered outreach with templates, follow-ups, and tracking.",
      fr: "Messages IA avec modèles, relances et suivi.",
    },
  },
  templates: {
    requiredTier: "basic",
    check: canPersistTemplates,
    title: { en: "Templates", fr: "Modèles" },
    description: {
      en: "Save, import, and reuse your best-performing outreach templates.",
      fr: "Sauvegardez, importez et réutilisez vos meilleurs modèles d'outreach.",
    },
  },
  discovery: {
    requiredTier: "basic",
    check: (plan) => plan !== "free",
    title: { en: "Discovery", fr: "Découverte" },
    description: {
      en: `Unlock ${BASIC_MONTHLY_DISCOVERIES} discoveries/month and ${BASIC_RESULTS_PER_SEARCH} results per search on Starter.`,
      fr: `Débloquez ${BASIC_MONTHLY_DISCOVERIES} recherches/mois et ${BASIC_RESULTS_PER_SEARCH} créateurs par recherche sur Starter.`,
    },
  },
  "ai-outreach": {
    requiredTier: "basic",
    check: (plan) => plan !== "free",
    title: { en: "AI outreach", fr: "Outreach IA" },
    description: {
      en: `Generate personalized outreach with ${BASIC_MONTHLY_AI_MESSAGES} AI messages per month on Starter, or unlimited on Pro.`,
      fr: `Générez des messages personnalisés avec ${BASIC_MONTHLY_AI_MESSAGES} messages IA/mois sur Starter, ou illimités sur Pro.`,
    },
  },
  "bulk-import": {
    requiredTier: "pro",
    check: canBulkImportTemplatesCsv,
    title: { en: "Bulk CSV import", fr: "Import CSV en masse" },
    description: {
      en: "Import all your outreach templates and creators from CSV in one click.",
      fr: "Importez tous vos modèles et créateurs depuis un CSV en un clic.",
    },
  },
  "auto-follow-up": {
    requiredTier: "pro",
    check: canUseAutoFollowUp,
    title: { en: "Auto follow-ups", fr: "Relances automatiques" },
    description: {
      en: "Schedule automatic follow-ups and convert more creators.",
      fr: "Programmez des relances automatiques et convertissez plus de créateurs.",
    },
  },
};

export function getManagedCreatorLimitLabel(plan: PlanTier, lang: Lang): string {
  const fr = lang === "fr";
  if (plan === "scale") {
    return fr ? "créateurs illimités" : "unlimited creators";
  }
  if (plan === "pro") {
    return fr ? "jusqu'à 100 créateurs" : "up to 100 creators";
  }
  if (plan === "basic") {
    return fr ? "jusqu'à 25 créateurs" : "up to 25 creators";
  }
  return fr ? "jusqu'à 3 créateurs" : "up to 3 creators";
}

export function getNextTierForCreatorLimit(plan: PlanTier): PlanTier {
  if (plan === "pro") return "scale";
  if (plan === "basic") return "pro";
  return "basic";
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
  if (plan === "scale") return null;
  if (kind === "shopify-stores") {
    if (plan === "pro" || plan === "basic") return "scale";
    return "basic";
  }
  if (plan === "free") return "basic";
  if (plan === "basic") return "pro";
  if (plan === "pro") return "scale";
  return null;
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

  if (kind === "campaigns") {
    const max = getMaxActiveCampaigns(currentPlan);
    const nextMax = getMaxActiveCampaigns(nextTier);
    const title =
      currentPlan === "free"
        ? fr
          ? "Créer des campagnes"
          : "Create campaigns"
        : fr
          ? "Limite de campagnes atteinte"
          : "Campaign limit reached";
    const description =
      currentPlan === "free"
        ? fr
          ? `Le plan gratuit n'inclut pas de campagnes actives. Passez à ${planName} pour jusqu'à ${BASIC_MAX_CAMPAIGNS} campagnes.`
          : `Free doesn't include active campaigns. Upgrade to ${planName} for up to ${BASIC_MAX_CAMPAIGNS} campaigns.`
        : nextMax == null
          ? fr
            ? `Votre plan inclut ${max} campagnes actives. Passez à ${planName} pour des campagnes illimitées.`
            : `Your plan includes ${max} active campaigns. Upgrade to ${planName} for unlimited campaigns.`
          : fr
            ? `Votre plan inclut ${max} campagnes actives. Passez à ${planName} pour jusqu'à ${nextMax} campagnes.`
            : `Your plan includes ${max} active campaigns. Upgrade to ${planName} for up to ${nextMax} campaigns.`;
    return {
      title,
      description,
      bullets,
      planBadge: planName,
      primaryLabel: fr ? `Passer à ${planName}` : `Upgrade to ${planName}`,
      requiredTier: nextTier,
    };
  }

  if (kind === "creators") {
    const max = getMaxManagedCreators(currentPlan);
    const title = fr ? "Limite de créateurs atteinte" : "Creator limit reached";
    const description =
      nextTier === "scale"
        ? fr
          ? `Votre plan inclut ${max} créateurs gérés. Passez à ${planName} pour un nombre illimité.`
          : `Your plan includes ${max} managed creators. Upgrade to ${planName} for unlimited creators.`
        : fr
          ? `Votre plan inclut ${max} créateurs gérés. Passez à ${planName} pour ${getManagedCreatorLimitLabel(nextTier, lang)}.`
          : `Your plan includes ${max} managed creators. Upgrade to ${planName} to manage ${getManagedCreatorLimitLabel(nextTier, lang)}.`;
    return {
      title,
      description,
      bullets,
      planBadge: planName,
      primaryLabel: fr ? `Passer à ${planName}` : `Upgrade to ${planName}`,
      requiredTier: nextTier,
    };
  }

  if (kind === "discoveries") {
    const currentLimit = getDailyDiscoveryLimit(currentPlan);
    const nextLimit = getDailyDiscoveryLimit(nextTier);
    const title =
      currentPlan === "free"
        ? fr
          ? `Vous avez utilisé vos ${currentLimit} découvertes`
          : `You've used your ${currentLimit} discoveries`
        : fr
          ? "Limite de découvertes atteinte"
          : "Discovery limit reached";
    const description =
      nextTier === "scale"
        ? fr
          ? `Passez à ${planName} pour des découvertes et résultats illimités.`
          : `Upgrade to ${planName} for unlimited discoveries and results.`
        : fr
          ? `Passez à ${planName} pour ${nextLimit} découvertes/mois et ${nextTier === "pro" ? PRO_RESULTS_PER_SEARCH : BASIC_RESULTS_PER_SEARCH} résultats par recherche.`
          : `Upgrade to ${planName} for ${nextLimit} discoveries/month and ${nextTier === "pro" ? PRO_RESULTS_PER_SEARCH : BASIC_RESULTS_PER_SEARCH} results per search.`;
    return {
      title,
      description,
      bullets,
      planBadge: planName,
      primaryLabel: fr ? `Passer à ${planName}` : `Upgrade to ${planName}`,
      requiredTier: nextTier,
    };
  }

  // shopify-stores
  const title = fr ? "Limite de boutiques atteinte" : "Store limit reached";
  const description =
    nextTier === "scale"
      ? fr
        ? `Votre plan inclut ${maxShopifyStores(currentPlan)} boutique${maxShopifyStores(currentPlan) > 1 ? "s" : ""} Shopify. Passez à ${planName} pour jusqu'à ${SCALE_MAX_SHOPIFY_STORES} boutiques.`
        : `Your plan includes ${maxShopifyStores(currentPlan)} Shopify store${maxShopifyStores(currentPlan) > 1 ? "s" : ""}. Upgrade to ${planName} for up to ${SCALE_MAX_SHOPIFY_STORES} stores.`
      : fr
        ? `Shopify est disponible à partir du plan ${planName} (${BASIC_MAX_SHOPIFY_STORES} boutique).`
        : `Shopify is available on the ${planName} plan (${BASIC_MAX_SHOPIFY_STORES} store).`;
  return {
    title,
    description,
    bullets,
    planBadge: planName,
    primaryLabel: fr ? `Passer à ${planName}` : `Upgrade to ${planName}`,
    requiredTier: nextTier,
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
  void checkoutPlanTier(tier, lang).catch((err) => {
    if (handlers) {
      if (tier === "scale") void handlers.onUpgradeScale?.();
      else if (tier === "pro") void handlers.onUpgradePro?.();
      else void handlers.onUpgrade?.();
      return;
    }
    alert(err instanceof Error ? err.message : "Could not start checkout");
  });
}

export function runTierUpgrade(tier: PlanTier, lang: Lang): void {
  if (tier === "free") return;
  void checkoutPlanTier(tier, lang).catch((err) => {
    alert(err instanceof Error ? err.message : "Could not start checkout");
  });
}
