import type { Lang } from "@/lib/useLang";
import {
  BASIC_MAX_CAMPAIGNS,
  BASIC_MAX_MANAGED_CREATORS,
  BASIC_MAX_SHOPIFY_STORES,
  BASIC_MONTHLY_AI_MESSAGES,
  BASIC_MONTHLY_DISCOVERIES,
  BASIC_RESULTS_PER_SEARCH,
  FREE_LIFETIME_DISCOVERIES,
  FREE_MAX_CAMPAIGNS,
  FREE_MAX_MANUAL_SALES,
  FREE_MAX_MANAGED_CREATORS,
  FREE_RESULTS_PER_SEARCH,
  PRO_MAX_CAMPAIGNS,
  PRO_MAX_MANAGED_CREATORS,
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
  if (!item.value.trim()) return item.label;
  if (!item.label.trim()) return item.value;
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
        label: fr ? "Résultats" : "Results",
        value: fr
          ? `${FREE_RESULTS_PER_SEARCH} créateurs par recherche`
          : `${FREE_RESULTS_PER_SEARCH} creators per search`,
      },
      {
        id: "creators",
        label: fr ? "Créateurs suivis" : "Tracked creators",
        value: String(FREE_MAX_MANAGED_CREATORS),
      },
      {
        id: "campaigns",
        label: fr ? "Campagnes" : "Campaigns",
        value: String(FREE_MAX_CAMPAIGNS),
      },
      {
        id: "sales",
        label: fr ? "Ventes" : "Sales",
        value: fr ? `Ajout manuel, ${FREE_MAX_MANUAL_SALES} max` : `Manual entry, ${FREE_MAX_MANUAL_SALES} max`,
      },
      {
        id: "commissions",
        label: fr ? "Commissions" : "Commissions",
        value: fr ? "Calcul automatique inclus" : "Automatic calculation included",
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
        value: fr ? `${BASIC_MONTHLY_DISCOVERIES} / mois` : `${BASIC_MONTHLY_DISCOVERIES} / month`,
      },
      {
        id: "search",
        label: fr ? "Résultats" : "Results",
        value: fr
          ? `${BASIC_RESULTS_PER_SEARCH} créateurs par recherche`
          : `${BASIC_RESULTS_PER_SEARCH} creators per search`,
      },
      {
        id: "campaigns",
        label: fr ? "Campagnes" : "Campaigns",
        value: fr ? `${BASIC_MAX_CAMPAIGNS} actives` : `${BASIC_MAX_CAMPAIGNS} active`,
      },
      {
        id: "creators",
        label: fr ? "Créateurs suivis" : "Tracked creators",
        value: String(BASIC_MAX_MANAGED_CREATORS),
      },
      {
        id: "shopify",
        label: "Shopify",
        value: fr
          ? `${BASIC_MAX_SHOPIFY_STORES} boutique connectée`
          : `${BASIC_MAX_SHOPIFY_STORES} connected store`,
      },
      {
        id: "ai",
        label: fr ? "Outreach IA" : "AI outreach",
        value: fr ? `${BASIC_MONTHLY_AI_MESSAGES} messages / mois` : `${BASIC_MONTHLY_AI_MESSAGES} messages / month`,
      },
      {
        id: "affiliate",
        label: fr ? "Liens d'affiliation" : "Affiliate links",
        value: fr ? "Trackés (clics, ventes, CA)" : "Tracked (clicks, sales, revenue)",
      },
      {
        id: "commissions",
        label: fr ? "Commissions" : "Commissions",
        value: fr ? "Calcul automatique" : "Automatic calculation",
      },
      {
        id: "templates",
        label: "Outreach",
        value: fr ? "Modèles + historique" : "Templates + history",
      },
      {
        id: "payout",
        label: fr ? "Paiements créateurs" : "Creator payouts",
        value: fr ? "Manuels" : "Manual",
      },
    ];
  }

  if (tier === "pro") {
    return [
      {
        id: "includes-starter",
        label: fr ? "Tout Starter, plus" : "Everything in Starter, plus",
        value: "",
      },
      {
        id: "discoveries",
        label: fr ? "Découvertes" : "Discoveries",
        value: fr ? `${PRO_MONTHLY_DISCOVERIES} / mois` : `${PRO_MONTHLY_DISCOVERIES} / month`,
      },
      {
        id: "search",
        label: fr ? "Résultats" : "Results",
        value: fr
          ? `${PRO_RESULTS_PER_SEARCH} créateurs par recherche`
          : `${PRO_RESULTS_PER_SEARCH} creators per search`,
      },
      {
        id: "campaigns",
        label: fr ? "Campagnes" : "Campaigns",
        value: fr ? `${PRO_MAX_CAMPAIGNS} actives` : `${PRO_MAX_CAMPAIGNS} active`,
      },
      {
        id: "creators",
        label: fr ? "Créateurs suivis" : "Tracked creators",
        value: String(PRO_MAX_MANAGED_CREATORS),
      },
      {
        id: "ai",
        label: fr ? "Outreach IA" : "AI outreach",
        value: fr ? "Illimité" : "Unlimited",
      },
      {
        id: "creator-dashboard",
        label: fr ? "Portail créateur" : "Creator portal",
        value: fr ? "Dashboard dédié à vos créateurs" : "Dedicated dashboard for your creators",
      },
      {
        id: "creator-content",
        label: fr ? "Contenu" : "Content",
        value: fr
          ? "Upload + stats de performance (vues, engagement)"
          : "Upload + performance stats (views, engagement)",
      },
      {
        id: "payout",
        label: fr ? "Paiements créateurs" : "Creator payouts",
        value: fr ? "Automatiques via Stripe" : "Automatic via Stripe",
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
      id: "includes-pro",
      label: fr ? "Tout Pro, plus" : "Everything in Pro, plus",
      value: "",
    },
    {
      id: "discoveries",
      label: fr ? "Découvertes" : "Discoveries",
      value: fr ? "Illimitées" : "Unlimited",
    },
    {
      id: "search",
      label: fr ? "Résultats" : "Results",
      value: fr ? "Illimités" : "Unlimited",
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
      id: "shopify",
      label: "Shopify",
      value: fr ? `${SCALE_MAX_SHOPIFY_STORES} boutiques` : `${SCALE_MAX_SHOPIFY_STORES} stores`,
    },
    {
      id: "support",
      label: "Support",
      value: fr ? "Dédié, réponse prioritaire" : "Dedicated, priority response",
    },
  ];
}

export function getPlanPricingFeatureLines(tier: PlanTier, lang: Lang): string[] {
  return getPlanPricingHighlights(tier, lang).map(formatPricingHighlightLine);
}
