import type { Lang } from "@/lib/useLang";
import {
  BASIC_MAX_CAMPAIGNS,
  BASIC_MAX_MANAGED_CREATORS,
  BASIC_MONTHLY_DISCOVERIES,
  BASIC_RESULTS_PER_SEARCH,
  FREE_LIFETIME_DISCOVERIES,
  FREE_MAX_MANAGED_CREATORS,
  FREE_RESULTS_PER_SEARCH,
  PRO_MAX_CAMPAIGNS,
  PRO_MAX_MANAGED_CREATORS,
  PRO_MAX_SHOPIFY_STORES,
  PRO_MONTHLY_DISCOVERIES,
  PRO_RESULTS_PER_SEARCH,
  SCALE_MAX_SHOPIFY_STORES,
  type PlanTier,
} from "@/lib/plan-limits";

export type PricingHighlight = {
  id: string;
  label: string;
  value: string;
};

export function formatPricingHighlightLine(item: PricingHighlight): string {
  return `${item.label} — ${item.value}`;
}

export function getPlanPricingHighlights(tier: PlanTier, lang: Lang): PricingHighlight[] {
  const fr = lang === "fr";

  if (tier === "free") {
    return [
      {
        id: "discoveries",
        label: fr ? "Découvertes" : "Discoveries",
        value: fr ? `${FREE_LIFETIME_DISCOVERIES} au total` : `${FREE_LIFETIME_DISCOVERIES} total`,
      },
      {
        id: "search",
        label: fr ? "Par recherche" : "Per search",
        value: fr ? `${FREE_RESULTS_PER_SEARCH} résultats` : `${FREE_RESULTS_PER_SEARCH} results`,
      },
      {
        id: "creators",
        label: fr ? "Créateurs" : "Creators",
        value: fr ? `${FREE_MAX_MANAGED_CREATORS} gérés` : `${FREE_MAX_MANAGED_CREATORS} managed`,
      },
      {
        id: "save",
        label: fr ? "Listes" : "Lists",
        value: fr ? "Sauvegarde" : "Save creators",
      },
    ];
  }

  if (tier === "basic") {
    return [
      {
        id: "discoveries",
        label: fr ? "Découvertes" : "Discoveries",
        value: fr ? `${BASIC_MONTHLY_DISCOVERIES} / mois` : `${BASIC_MONTHLY_DISCOVERIES} / mo`,
      },
      {
        id: "search",
        label: fr ? "Par recherche" : "Per search",
        value: fr ? `${BASIC_RESULTS_PER_SEARCH} résultats` : `${BASIC_RESULTS_PER_SEARCH} results`,
      },
      {
        id: "campaigns",
        label: fr ? "Campagnes" : "Campaigns",
        value: String(BASIC_MAX_CAMPAIGNS),
      },
      {
        id: "creators",
        label: fr ? "Créateurs" : "Creators",
        value: String(BASIC_MAX_MANAGED_CREATORS),
      },
      {
        id: "templates",
        label: fr ? "Outreach" : "Outreach",
        value: fr ? "Modèles + import" : "Templates + import",
      },
      {
        id: "commissions",
        label: fr ? "Commissions" : "Commissions",
        value: fr ? "Suivi ventes" : "Sale tracking",
      },
      {
        id: "payout",
        label: fr ? "Paiements" : "Payouts",
        value: fr ? "Manuels" : "Manual",
      },
      {
        id: "affiliate",
        label: fr ? "Affiliation" : "Affiliates",
        value: fr ? "Liens trackés" : "Tracked links",
      },
    ];
  }

  if (tier === "pro") {
    return [
      {
        id: "discoveries",
        label: fr ? "Découvertes" : "Discoveries",
        value: fr ? `${PRO_MONTHLY_DISCOVERIES} / mois` : `${PRO_MONTHLY_DISCOVERIES} / mo`,
      },
      {
        id: "search",
        label: fr ? "Par recherche" : "Per search",
        value: fr ? `${PRO_RESULTS_PER_SEARCH} résultats` : `${PRO_RESULTS_PER_SEARCH} results`,
      },
      {
        id: "campaigns",
        label: fr ? "Campagnes" : "Campaigns",
        value: String(PRO_MAX_CAMPAIGNS),
      },
      {
        id: "creators",
        label: fr ? "Créateurs" : "Creators",
        value: String(PRO_MAX_MANAGED_CREATORS),
      },
      {
        id: "creator-dashboard",
        label: fr ? "Dashboard créateur" : "Creator dashboard",
        value: fr ? "Portail dédié" : "Dedicated portal",
      },
      {
        id: "creator-content",
        label: fr ? "Contenu créateur" : "Creator content",
        value: fr ? "Upload & sync" : "Upload & sync",
      },
      {
        id: "shopify",
        label: "Shopify",
        value: fr ? `${PRO_MAX_SHOPIFY_STORES} boutique` : `${PRO_MAX_SHOPIFY_STORES} store`,
      },
      {
        id: "payout",
        label: fr ? "Paiements" : "Payouts",
        value: fr ? "Auto + manuel" : "Auto + manual",
      },
      {
        id: "automation",
        label: fr ? "Scripts & briefs" : "Scripts & briefs",
        value: fr ? "Inclus" : "Included",
      },
    ];
  }

  return [
    {
      id: "stack",
      label: "Pro",
      value: fr ? "Tout inclus" : "Everything",
    },
    {
      id: "discoveries",
      label: fr ? "Découvertes" : "Discoveries",
      value: fr ? "Illimitées" : "Unlimited",
    },
    {
      id: "campaigns",
      label: fr ? "Campagnes" : "Campaigns",
      value: fr ? "Illimitées" : "Unlimited",
    },
    {
      id: "creators",
      label: fr ? "Créateurs" : "Creators",
      value: fr ? "Illimités" : "Unlimited",
    },
    {
      id: "creator-dashboard",
      label: fr ? "Dashboard créateur" : "Creator dashboard",
      value: fr ? "Illimité" : "Unlimited",
    },
    {
      id: "creator-content",
      label: fr ? "Contenu créateur" : "Creator content",
      value: fr ? "Campagnes sync" : "Campaign sync",
    },
    {
      id: "shopify",
      label: "Shopify",
      value: fr ? `${SCALE_MAX_SHOPIFY_STORES} boutiques` : `${SCALE_MAX_SHOPIFY_STORES} stores`,
    },
    {
      id: "payout",
      label: "Stripe",
      value: fr ? "Connect + solde" : "Connect + balance",
    },
    {
      id: "automation",
      label: fr ? "Agent IA" : "AI agent",
      value: fr ? "Complet" : "Full access",
    },
    {
      id: "support",
      label: "Support",
      value: fr ? "Dédié" : "Dedicated",
    },
  ];
}

export function getPlanPricingFeatureLines(tier: PlanTier, lang: Lang): string[] {
  return getPlanPricingHighlights(tier, lang).map(formatPricingHighlightLine);
}
