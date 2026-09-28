import type { DashboardView } from "@/lib/dashboard-view-storage";

export type HomeProgress = {
  shopify: boolean;
  creatorsCount: number;
  salesCount: number;
  activeCampaigns: number;
};

export type HomeStepId = "connect" | "creators" | "campaign" | "sale" | "grow";

export type HomeStep = {
  id: HomeStepId;
  view: DashboardView;
  title: { en: string; fr: string };
  body: { en: string; fr: string };
  cta: { en: string; fr: string };
};

const STEPS: Record<HomeStepId, HomeStep> = {
  connect: {
    id: "connect",
    view: "integrations",
    title: { en: "Connect your store", fr: "Connectez votre boutique" },
    body: {
      en: "Orders come in on their own, so every sale can be tied to the creator who drove it.",
      fr: "Les commandes remontent toutes seules : chaque vente peut être rattachée au créateur qui l’a générée.",
    },
    cta: { en: "Connect Shopify", fr: "Connecter Shopify" },
  },
  creators: {
    id: "creators",
    view: "discovery",
    title: { en: "Find your first creators", fr: "Trouvez vos premiers créateurs" },
    body: {
      en: "Search by niche, size and views, then save the profiles that fit your brand.",
      fr: "Cherchez par niche, taille et vues, puis sauvegardez les profils qui collent à votre marque.",
    },
    cta: { en: "Find creators", fr: "Trouver des créateurs" },
  },
  campaign: {
    id: "campaign",
    view: "campaigns",
    title: { en: "Launch your first campaign", fr: "Lancez votre première campagne" },
    body: {
      en: "Affiliation, gifting or RPM: pick one, add your saved creators and share their codes.",
      fr: "Affiliation, cadeau ou RPM : choisissez, ajoutez vos créateurs sauvegardés et partagez leurs codes.",
    },
    cta: { en: "Create a campaign", fr: "Créer une campagne" },
  },
  sale: {
    id: "sale",
    view: "analytics",
    title: { en: "Track your first sale", fr: "Suivez votre première vente" },
    body: {
      en: "Your campaign is live. The first order through a creator code shows up here with its commission.",
      fr: "Votre campagne est lancée. La première commande passée avec un code créateur s’affiche ici, avec sa commission.",
    },
    cta: { en: "Open tracking", fr: "Voir le suivi" },
  },
  grow: {
    id: "grow",
    view: "campaigns",
    title: { en: "Your program is running", fr: "Votre programme tourne" },
    body: {
      en: "See which creators sell the most and give them more room, or add new ones.",
      fr: "Regardez quels créateurs vendent le plus et donnez-leur plus de place, ou ajoutez-en de nouveaux.",
    },
    cta: { en: "Open campaigns", fr: "Voir les campagnes" },
  },
};

/** The one thing a brand should do next, in the order the product works. */
export function nextHomeStep(progress: HomeProgress): HomeStep {
  if (!progress.shopify && progress.salesCount === 0) return STEPS.connect;
  if (progress.creatorsCount === 0) return STEPS.creators;
  if (progress.activeCampaigns === 0) return STEPS.campaign;
  if (progress.salesCount === 0) return STEPS.sale;
  return STEPS.grow;
}

export const HOME_STEP_ORDER: HomeStepId[] = ["connect", "creators", "campaign", "sale"];

export function homeStepDone(id: HomeStepId, progress: HomeProgress): boolean {
  switch (id) {
    case "connect":
      return progress.shopify || progress.salesCount > 0;
    case "creators":
      return progress.creatorsCount > 0;
    case "campaign":
      return progress.activeCampaigns > 0;
    case "sale":
      return progress.salesCount > 0;
    default:
      return false;
  }
}

export function homeStepById(id: HomeStepId): HomeStep {
  return STEPS[id];
}
