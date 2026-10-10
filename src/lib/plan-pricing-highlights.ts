import type { Lang } from "@/lib/useLang";
import {
  FREE_RESULTS_PER_SEARCH,
  PRO_MAX_SHOPIFY_STORES,
  type PlanTier,
} from "@/lib/plan-limits";

// What each plan includes, as shown on the pricing page, the landing bento,
// billing cards and upgrade modals. Must match the matrix in lib/plan-limits.ts:
//   Free   teaser (first results per search), no emails, no live lookup / Mino analysis
//   Growth unlimited creator search, live lookup, Mino analysis, emails
//   Pro    Growth + Find It, Trackit, payouts, AI drafts, gifting links, portal, scripts, templates
//   Scale  Pro + team members

export type PricingHighlight = {
  id: string;
  label: string;
  value: string;
  /** One natural sentence for the pricing bento (falls back to "label — value"). */
  bento?: string;
};

export function formatPricingHighlightLine(item: PricingHighlight): string {
  if (!item.value.trim()) return item.label;
  if (!item.label.trim()) return item.value;
  return `${item.label} — ${item.value}`;
}

/** Line shown on the pricing bento cards. */
export function formatBentoHighlightLine(item: PricingHighlight): string {
  return item.bento ?? formatPricingHighlightLine(item);
}

export function getPlanPricingHighlights(tier: PlanTier, lang: Lang): PricingHighlight[] {
  const fr = lang === "fr";

  if (tier === "free") {
    return [
      {
        id: "search",
        label: fr ? "Recherche de créateurs" : "Creator search",
        value: fr
          ? `${FREE_RESULTS_PER_SEARCH} premiers résultats par recherche`
          : `First ${FREE_RESULTS_PER_SEARCH} results per search`,
      },
      {
        id: "blocked-emails",
        label: fr ? "E-mails des créateurs" : "Creator emails",
        value: fr ? "Masqués (Growth+)" : "Hidden (Growth+)",
      },
      {
        id: "blocked-live",
        label: fr ? "Recherche en direct et analyse Mino" : "Live lookup and Mino analysis",
        value: fr ? "Bloquées (Growth+)" : "Locked (Growth+)",
      },
      {
        id: "blocked-trackit",
        label: fr ? "Campagnes, suivi et paiements" : "Campaigns, tracking and payouts",
        value: fr ? "Bloqués (Pro+)" : "Locked (Pro+)",
      },
    ];
  }

  if (tier === "basic") {
    return [
      {
        id: "search",
        label: fr ? "Recherche de créateurs" : "Creator search",
        value: fr ? "Illimitée (TikTok, Instagram, YouTube, vidéos)" : "Unlimited (TikTok, Instagram, YouTube, videos)",
        bento: fr ? "Recherche de créateurs illimitée" : "Unlimited creator search",
      },
      {
        id: "live-lookup",
        label: fr ? "Recherche en direct" : "Live creator lookup",
        value: fr ? "Illimitée" : "Unlimited",
        bento: fr ? "Recherche en direct illimitée" : "Unlimited live creator lookup",
      },
      {
        id: "mino-analysis",
        label: fr ? "Analyse de site et de photo par Mino" : "Mino site and photo analysis",
        value: fr ? "Illimitée" : "Unlimited",
        bento: fr ? "Analyses Mino illimitées (site et photo)" : "Unlimited Mino analyses (site and photo)",
      },
      {
        id: "emails",
        label: fr ? "E-mails des créateurs" : "Creator emails",
        value: fr ? "Visibles" : "Visible",
        bento: fr ? "E-mails des créateurs visibles" : "Creator emails visible",
      },
      {
        id: "outreach",
        label: fr ? "Contact des créateurs" : "Creator outreach",
        value: fr ? "Par e-mail depuis Trackit" : "By email from Trackit",
        bento: fr ? "Contactez les créateurs par e-mail" : "Email creators from Trackit",
      },
    ];
  }

  if (tier === "pro") {
    return [
      {
        id: "includes-growth",
        label: fr ? "Tout Growth, et en plus :" : "Everything in Growth, plus",
        value: "",
      },
      {
        id: "findit",
        label: "Find It",
        value: fr ? "Réception des contenus de vos créateurs" : "Inbox for your creators’ content",
        bento: fr ? "Find It : réception des contenus créateurs" : "Find It: creator content inbox",
      },
      {
        id: "trackit",
        label: "Trackit",
        value: fr ? "Campagnes illimitées, liens et codes suivis" : "Unlimited campaigns, tracked links and codes",
        bento: fr ? "Campagnes illimitées, liens et codes suivis" : "Unlimited campaigns, tracked links and codes",
      },
      {
        id: "shopify",
        label: "Shopify",
        value: fr
          ? `Ventes suivies, jusqu’à ${PRO_MAX_SHOPIFY_STORES} boutiques, analytiques`
          : `Tracked sales, up to ${PRO_MAX_SHOPIFY_STORES} stores, analytics`,
        bento: fr
          ? `Ventes Shopify suivies (${PRO_MAX_SHOPIFY_STORES} boutiques) et analytiques`
          : `Shopify sales tracking (${PRO_MAX_SHOPIFY_STORES} stores) and analytics`,
      },
      {
        id: "payout",
        label: fr ? "Paiements créateurs" : "Creator payouts",
        value: fr ? "Manuels, automatiques via Stripe, solde" : "Manual, automatic via Stripe, balance",
        bento: fr ? "Paiements créateurs manuels et automatiques" : "Manual and automatic creator payouts",
      },
      {
        id: "ai",
        label: fr ? "Brouillons d’e-mails par l’IA" : "AI email drafts",
        value: fr ? "Illimités" : "Unlimited",
        bento: fr ? "Brouillons d’e-mails écrits par l’IA" : "AI-written email drafts",
      },
      {
        id: "gifting",
        label: "Gifting",
        value: fr ? "Liens de candidature, campagnes illimitées" : "Share links, unlimited campaigns",
        bento: fr ? "Campagnes de gifting avec lien, illimitées" : "Unlimited gifting campaigns with share links",
      },
      {
        id: "creator-portal",
        label: fr ? "Portail créateur" : "Creator portal",
        value: fr ? "Invitations et tableau de bord créateur" : "Invitations and creator dashboard",
        bento: fr ? "Portail et invitations créateurs" : "Creator portal and invitations",
      },
      {
        id: "scripts",
        label: fr ? "Scripts, modèles et automatisations" : "Scripts, templates and automations",
        value: fr ? "Inclus" : "Included",
        bento: fr ? "Scripts, modèles et automatisations" : "Scripts, templates and automations",
      },
    ];
  }

  return [
    {
      id: "includes-pro",
      label: fr ? "Tout Pro, et en plus :" : "Everything in Pro, plus",
      value: "",
    },
    {
      id: "team",
      label: fr ? "Membres de l’équipe" : "Team members",
      value: fr ? "Invitez vos collègues dans votre espace" : "Invite colleagues into your workspace",
      bento: fr ? "Invitez votre équipe dans votre espace de marque" : "Invite your team into your brand workspace",
    },
  ];
}

export function getPlanPricingFeatureLines(tier: PlanTier, lang: Lang): string[] {
  return getPlanPricingHighlights(tier, lang).map(formatPricingHighlightLine);
}
