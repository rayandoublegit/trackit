import type { Lang } from "@/lib/useLang";
import { formatCurrency } from "@/lib/useCurrency";
import {
  BASIC_MAX_CAMPAIGNS,
  BASIC_MAX_MANAGED_CREATORS,
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
  PRO_MAX_SHOPIFY_STORES,
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
  canUseFullAnalytics,
  canUseManualPayouts,
  canUseScripts,
  canUseShopify,
  getMaxActiveCampaigns,
  getMaxManagedCreators,
  getDailyDiscoveryLimit,
  type PlanTier,
} from "@/lib/plan-limits";

/** Customer-facing plan names. Internal tiers: free | basic | pro | scale. */
export const PLAN_PRICES = {
  growthMonthly: 19,
  proMonthly: 39,
  scaleMonthly: 99,
  growthAnnual: 190,
  proAnnual: 390,
  scaleAnnual: 990,
} as const;

export function planDisplayName(tier: PlanTier, lang: Lang): string {
  if (tier === "scale") return "Scale";
  if (tier === "pro") return "Pro";
  if (tier === "basic") return "Growth";
  return lang === "fr" ? "Gratuit" : "Free";
}

export type MarketingVariant = "compact" | "pricing" | "full";

function growthFeatureList(lang: Lang): string[] {
  const fr = lang === "fr";
  return fr
    ? [
        `${BASIC_MONTHLY_DISCOVERIES} découvertes / mois`,
        `${BASIC_RESULTS_PER_SEARCH} résultats par recherche`,
        `${BASIC_MAX_CAMPAIGNS} campagnes actives`,
        `${BASIC_MAX_MANAGED_CREATORS} créateurs gérés`,
        `${BASIC_MONTHLY_AI_MESSAGES} messages IA / mois`,
        "Modèles d'outreach (sauvegarde & import)",
        "Paiements manuels",
        "Tableau de bord analytique",
        "Liens d'affiliation",
      ]
    : [
        `${BASIC_MONTHLY_DISCOVERIES} discoveries / month`,
        `${BASIC_RESULTS_PER_SEARCH} results per search`,
        `${BASIC_MAX_CAMPAIGNS} active campaigns`,
        `${BASIC_MAX_MANAGED_CREATORS} managed creators`,
        `${BASIC_MONTHLY_AI_MESSAGES} AI messages / month`,
        "Outreach templates (save & import)",
        "Manual payouts",
        "Full analytics dashboard",
        "Affiliate links & tracking",
      ];
}

function proFeatureList(lang: Lang): string[] {
  const fr = lang === "fr";
  return fr
    ? [
        `${PRO_MONTHLY_DISCOVERIES} découvertes / mois`,
        `${PRO_RESULTS_PER_SEARCH} résultats par recherche`,
        `${PRO_MAX_CAMPAIGNS} campagnes actives`,
        `${PRO_MAX_MANAGED_CREATORS} créateurs gérés`,
        "Messages IA illimités",
        "Import CSV en masse",
        "Paiements auto + manuels",
        "Analytiques avancées + ROI",
        `Shopify (${PRO_MAX_SHOPIFY_STORES} boutique) + suivi ventes`,
        "Portail créateur & invitations",
        "Scripts & briefs créateurs",
        "Workflows d'automatisation",
        "Support prioritaire",
      ]
    : [
        `${PRO_MONTHLY_DISCOVERIES} discoveries / month`,
        `${PRO_RESULTS_PER_SEARCH} results per search`,
        `${PRO_MAX_CAMPAIGNS} active campaigns`,
        `${PRO_MAX_MANAGED_CREATORS} managed creators`,
        "Unlimited AI outreach",
        "Bulk CSV import",
        "Auto + manual payouts",
        "Advanced analytics + ROI",
        `Shopify (${PRO_MAX_SHOPIFY_STORES} store) + sales tracking`,
        "Creator portal & invite links",
        "Scripts & briefs for creators",
        "Automation workflows",
        "Priority support",
      ];
}

function scaleFeatureList(lang: Lang): string[] {
  const fr = lang === "fr";
  return fr
    ? [
        "Tout le plan Pro",
        "Découvertes illimitées",
        "Résultats illimités",
        "Campagnes & créateurs illimités",
        "Solde & Stripe Connect",
        `Shopify multi-boutiques (${SCALE_MAX_SHOPIFY_STORES})`,
        "Agent d'automatisation complet",
        "Support dédié",
      ]
    : [
        "Everything in Pro",
        "Unlimited discoveries",
        "Unlimited results",
        "Unlimited campaigns & creators",
        "Balance & Stripe Connect",
        `Multi-store Shopify (${SCALE_MAX_SHOPIFY_STORES})`,
        "Full automation agent",
        "Dedicated support",
      ];
}

function freeFeatureList(lang: Lang): string[] {
  const fr = lang === "fr";
  return fr
    ? [
        `${FREE_LIFETIME_DISCOVERIES} découvertes au total`,
        `${FREE_RESULTS_PER_SEARCH} résultats par recherche`,
        `${FREE_MAX_MANAGED_CREATORS} créateurs gérés`,
        "Sauvegarde de créateurs",
      ]
    : [
        `${FREE_LIFETIME_DISCOVERIES} discoveries total`,
        `${FREE_RESULTS_PER_SEARCH} results per search`,
        `${FREE_MAX_MANAGED_CREATORS} managed creators`,
        "Save creators",
      ];
}

/** Curated bullets for pricing cards — aligned with plan limits and gates. */
function pricingFeatureList(tier: PlanTier, lang: Lang): string[] {
  const fr = lang === "fr";
  if (tier === "free") return freeFeatureList(lang);
  if (tier === "basic") {
    return fr
      ? [
          `${BASIC_MONTHLY_DISCOVERIES} découvertes / mois`,
          `${BASIC_RESULTS_PER_SEARCH} résultats par recherche`,
          `${BASIC_MAX_CAMPAIGNS} campagnes actives`,
          `${BASIC_MAX_MANAGED_CREATORS} créateurs gérés`,
          `${BASIC_MONTHLY_AI_MESSAGES} messages IA / mois`,
          "Modèles d'outreach (sauvegarde & import)",
          "Paiements manuels & analytiques",
          "Liens d'affiliation",
        ]
      : [
          `${BASIC_MONTHLY_DISCOVERIES} discoveries / month`,
          `${BASIC_RESULTS_PER_SEARCH} results per search`,
          `${BASIC_MAX_CAMPAIGNS} active campaigns`,
          `${BASIC_MAX_MANAGED_CREATORS} managed creators`,
          `${BASIC_MONTHLY_AI_MESSAGES} AI messages / month`,
          "Outreach templates (save & import)",
          "Manual payouts & analytics",
          "Affiliate links & tracking",
        ];
  }
  if (tier === "pro") {
    return fr
      ? [
          `${PRO_MONTHLY_DISCOVERIES} découvertes / mois`,
          `${PRO_RESULTS_PER_SEARCH} résultats par recherche`,
          `${PRO_MAX_CAMPAIGNS} campagnes actives`,
          `${PRO_MAX_MANAGED_CREATORS} créateurs gérés`,
          "Messages IA illimités",
          `Shopify (${PRO_MAX_SHOPIFY_STORES} boutique) + suivi ventes`,
          "Paiements auto + manuels",
          "Portail créateur, invitations & scripts",
          "Automatisations & support prioritaire",
        ]
      : [
          `${PRO_MONTHLY_DISCOVERIES} discoveries / month`,
          `${PRO_RESULTS_PER_SEARCH} results per search`,
          `${PRO_MAX_CAMPAIGNS} active campaigns`,
          `${PRO_MAX_MANAGED_CREATORS} managed creators`,
          "Unlimited AI outreach",
          `Shopify (${PRO_MAX_SHOPIFY_STORES} store) + sales tracking`,
          "Auto + manual payouts",
          "Creator portal, invites & scripts",
          "Automation workflows & priority support",
        ];
  }
  return scaleFeatureList(lang);
}

export function getPlanCardDescription(tier: PlanTier, lang: Lang): string {
  const fr = lang === "fr";
  if (tier === "free") {
    return fr ? "Commencez sans engagement." : "Get started with no commitment.";
  }
  if (tier === "basic") {
    return fr
      ? "L'entrée idéale pour lancer votre programme créateurs."
      : "Your entry point — start fast without overcommitting.";
  }
  if (tier === "pro") {
    return fr
      ? "Le meilleur rapport qualité-prix. Le choix de la plupart des marques."
      : "Best value. The plan most brands choose.";
  }
  return fr
    ? "Tout Pro, plus multi-boutiques et automatisation complète."
    : "Everything in Pro, plus multi-store power and full automation.";
}

/** Feature bullets for pricing grids, billing cards, and upgrade gates — derived from plan-limits. */
export function getPlanMarketingFeatures(
  tier: PlanTier,
  lang: Lang,
  variant: MarketingVariant = "pricing",
): string[] {
  if (variant === "full") {
    if (tier === "free") return freeFeatureList(lang);
    if (tier === "basic") return growthFeatureList(lang);
    if (tier === "pro") return proFeatureList(lang);
    return scaleFeatureList(lang);
  }

  const pricing = pricingFeatureList(tier, lang);
  if (variant === "compact") return pricing.slice(0, 5);
  return pricing;
}

export type GateFeatureKey =
  | "affiliates"
  | "payouts"
  | "balance"
  | "transactions"
  | "invitations"
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
      fr: "Invitez des créateurs avec un portail dédié pour suivre leurs gains.",
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
    requiredTier: "pro",
    check: canUseShopify,
    title: { en: "Shopify", fr: "Shopify" },
    description: {
      en: "Connect Shopify to track sales and attribute commissions automatically.",
      fr: "Connectez Shopify pour suivre les ventes et attribuer les commissions.",
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
      en: "Unlock monthly creator discoveries and more results per search.",
      fr: "Débloquez des découvertes mensuelles et plus de résultats par recherche.",
    },
  },
  "ai-outreach": {
    requiredTier: "basic",
    check: (plan) => plan !== "free",
    title: { en: "AI outreach", fr: "Outreach IA" },
    description: {
      en: `Generate personalized outreach with ${BASIC_MONTHLY_AI_MESSAGES} AI messages per month on Growth, or unlimited on Pro.`,
      fr: `Générez des messages personnalisés avec ${BASIC_MONTHLY_AI_MESSAGES} messages IA/mois sur Growth, ou illimités sur Pro.`,
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
  if (plan === "pro") {
    return fr ? "jusqu'à 50 créateurs" : "up to 50 creators";
  }
  if (plan === "basic") {
    return fr ? "jusqu'à 15 créateurs" : "up to 15 creators";
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
  const bullets = getPlanMarketingFeatures(gate.requiredTier, lang, "compact").slice(0, 5);
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
    if (plan === "pro") return "scale";
    return "pro";
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
  const bullets = getPlanMarketingFeatures(nextTier, lang, "compact").slice(0, 5);
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
          ? "Passez à Scale pour des découvertes et résultats illimités."
          : "Upgrade to Scale for unlimited discoveries and results."
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
        ? `Pro inclut ${PRO_MAX_SHOPIFY_STORES} boutique Shopify. Passez à ${planName} pour jusqu'à ${SCALE_MAX_SHOPIFY_STORES} boutiques.`
        : `Pro includes ${PRO_MAX_SHOPIFY_STORES} Shopify store. Upgrade to ${planName} for up to ${SCALE_MAX_SHOPIFY_STORES} stores.`
      : fr
        ? `Shopify est disponible à partir du plan ${planName} (${PRO_MAX_SHOPIFY_STORES} boutique).`
        : `Shopify is available on the ${planName} plan (${PRO_MAX_SHOPIFY_STORES} store).`;
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
  const amount = formatCurrency(price, lang);
  return lang === "fr" ? `Passer à ${name} ${amount}/mois` : `Upgrade to ${name} ${amount}/mo`;
}

export function runGateUpgrade(
  key: GateFeatureKey,
  lang: Lang,
  handlers: {
    onUpgrade?: () => void;
    onUpgradePro?: () => void;
    onUpgradeScale?: () => void;
  },
): void {
  const props = getGateModalProps(key, lang);
  if (props.requiredTier === "scale") void handlers.onUpgradeScale?.();
  else if (props.requiredTier === "pro") void handlers.onUpgradePro?.();
  else void handlers.onUpgrade?.();
}
