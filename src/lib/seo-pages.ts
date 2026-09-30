import type { FaqItem } from "@/lib/home-faq";
import type { AppLang } from "@/lib/locale-preferences";

export type SeoPage = {
  slug: string;
  title: string;
  description: string;
  headline: string;
  subheadline: string;
  keywords: string[];
  faqs: FaqItem[];
  sections: { heading: string; paragraphs: string[]; bullets?: string[] }[];
  relatedBlogSlugs: string[];
  ctaLabel: string;
  /** Slug of the same page in the other language. */
  alternateSlug?: string;
};

export const SEO_PAGES: SeoPage[] = [
  {
    slug: "creator-affiliate-platform",
    alternateSlug: "plateforme-affiliation-createurs",
    title: "Creator Affiliate Platform — Trackit",
    description:
      "Trackit is the creator affiliate platform for Shopify brands. Discover creators, track sales, manage campaigns, and pay commissions in one dashboard.",
    headline: "The creator affiliate platform built for Shopify brands",
    subheadline:
      "Trackit replaces spreadsheets and expensive enterprise tools with discovery, outreach, Shopify tracking, and commission payouts — all in one place.",
    keywords: ["creator affiliate platform", "Trackit", "creator marketing software", "affiliate tracking"],
    faqs: [
      {
        question: "What makes Trackit a creator affiliate platform?",
        answer:
          "Trackit combines creator discovery, outreach, campaign management, Shopify sales attribution, and commission payouts — the full affiliate workflow in one product.",
      },
      {
        question: "Can I use Trackit for TikTok creators?",
        answer:
          "Yes. Trackit is optimized for TikTok creator discovery and outreach, with Shopify integration for sales tracking.",
      },
      {
        question: "How much does Trackit cost?",
        answer:
          "Trackit offers a free plan to get started. Paid Growth, Pro and Scale plans unlock higher limits for growing programs. See trackit pricing at thentrack.it/pricing.",
      },
    ],
    sections: [
      {
        heading: "Everything you need in one platform",
        paragraphs: [
          "Running a creator affiliate program shouldn't require five different tools. Trackit centralizes the workflows that matter most for e-commerce brands.",
        ],
        bullets: [
          "TikTok creator discovery and saved lists",
          "AI-assisted outreach with full history",
          "Campaign and content management",
          "Shopify order sync and attribution",
          "Commission calculation and payouts",
          "Analytics and ROI reporting",
        ],
      },
      {
        heading: "Built for brands, not agencies",
        paragraphs: [
          "Trackit is designed for founders and lean teams who want professional creator programs without enterprise complexity. Start free and scale when your roster grows.",
        ],
      },
    ],
    relatedBlogSlugs: ["what-is-trackit-creator-affiliate-platform", "how-to-launch-creator-affiliate-program-trackit"],
    ctaLabel: "Start with Trackit free",
  },
  {
    slug: "tiktok-creator-marketing",
    alternateSlug: "marketing-createurs-tiktok",
    title: "TikTok Creator Marketing — Trackit",
    description:
      "Run TikTok creator marketing with Trackit: discover creators, send outreach, track Shopify sales, and pay commissions automatically.",
    headline: "TikTok creator marketing, managed in Trackit",
    subheadline:
      "Stop scrolling TikTok for hours. Trackit finds creators in your niche, helps you reach out, and proves which posts drive revenue.",
    keywords: ["TikTok creator marketing", "Trackit TikTok", "TikTok influencer platform"],
    faqs: [
      {
        question: "How does Trackit help with TikTok creator marketing?",
        answer:
          "Trackit provides a searchable catalog of TikTok creators, outreach tools with AI drafts, campaign tracking, and Shopify revenue attribution per creator.",
      },
      {
        question: "Can I track which TikTok creators drive sales?",
        answer:
          "Yes. Each creator gets tracked affiliate links in Trackit. When they promote your brand, Shopify orders sync and attribute revenue automatically.",
      },
      {
        question: "Is Trackit only for TikTok?",
        answer:
          "Trackit is optimized for TikTok but supports outreach across Instagram and email when creator contact info is available.",
      },
    ],
    sections: [
      {
        heading: "From discovery to revenue",
        paragraphs: ["Trackit covers the full TikTok creator marketing loop:"],
        bullets: [
          "Search creators by niche, language, and engagement",
          "Save profiles to organized lists and pipelines",
          "Generate personalized outreach messages",
          "Launch campaigns with tracked links",
          "Measure sales and ROI per creator",
        ],
      },
      {
        heading: "Why brands choose Trackit for TikTok",
        paragraphs: [
          "Manual TikTok research doesn't scale. Trackit gives you a repeatable system so every hour spent on creator marketing ties back to measurable Shopify revenue.",
        ],
      },
    ],
    relatedBlogSlugs: ["tiktok-creator-outreach-guide-trackit", "ugc-campaign-management-with-trackit"],
    ctaLabel: "Find TikTok creators on Trackit",
  },
  {
    slug: "shopify-creator-tracking",
    alternateSlug: "suivi-ventes-createurs-shopify",
    title: "Shopify Creator Tracking — Trackit",
    description:
      "Track Shopify sales from creator affiliate links with Trackit. Automatic order sync, commission tracking, and campaign analytics.",
    headline: "Shopify creator tracking that actually works",
    subheadline:
      "Connect your Shopify store to Trackit and see exactly which creators drive revenue — with accurate commission calculations built in.",
    keywords: ["Shopify creator tracking", "Trackit Shopify", "creator sales attribution"],
    faqs: [
      {
        question: "How does Trackit track Shopify creator sales?",
        answer:
          "Trackit syncs Shopify orders and attributes them to creator affiliate links and discount codes generated in your Trackit dashboard.",
      },
      {
        question: "Do I need to manually import orders?",
        answer:
          "No. Once Shopify is connected, orders sync automatically to Trackit in real time.",
      },
      {
        question: "Can Trackit handle different commission rates per creator?",
        answer:
          "Yes. Set commission rules per campaign or creator in Trackit. The platform calculates amounts owed automatically.",
      },
    ],
    sections: [
      {
        heading: "Accurate attribution for Shopify brands",
        paragraphs: [
          "Creator marketing only works if you can measure it. Trackit connects your Shopify data to every creator link and code in your program.",
        ],
        bullets: [
          "One-click Shopify integration",
          "Unique tracked links per creator",
          "Discount code support",
          "Real-time sales dashboard",
          "Commission balances and payout tracking",
        ],
      },
      {
        heading: "Replace your tracking spreadsheet",
        paragraphs: [
          "Spreadsheets can't sync with Shopify or handle returns and overlapping codes. Trackit keeps your creator revenue data accurate as you scale.",
        ],
      },
    ],
    relatedBlogSlugs: ["track-creator-sales-shopify-with-trackit", "trackit-for-shopify-brands-guide"],
    ctaLabel: "Connect Shopify to Trackit",
  },
];

/** French editions of SEO_PAGES, served under /fr/solutions. */
export const SEO_PAGES_FR: SeoPage[] = [
  {
    slug: "plateforme-affiliation-createurs",
    alternateSlug: "creator-affiliate-platform",
    title: "Plateforme d'affiliation créateurs — Trackit",
    description:
      "Trackit est la plateforme d'affiliation créateurs des marques Shopify : trouvez des créateurs, suivez les ventes, gérez vos campagnes et payez les commissions depuis un seul tableau de bord.",
    headline: "La plateforme d'affiliation créateurs pensée pour les marques Shopify",
    subheadline:
      "Trackit remplace les tableurs et les outils hors de prix par un seul espace : découverte, prospection, suivi Shopify et paiement des commissions.",
    keywords: [
      "plateforme d'affiliation créateurs",
      "Trackit",
      "logiciel marketing d'influence",
      "suivi affiliation",
      "programme d'affiliation influenceurs",
    ],
    faqs: [
      {
        question: "Qu'est-ce qui fait de Trackit une plateforme d'affiliation créateurs ?",
        answer:
          "Trackit réunit la découverte de créateurs, la prospection, la gestion de campagnes, l'attribution des ventes Shopify et le paiement des commissions : tout le cycle de l'affiliation dans un seul outil.",
      },
      {
        question: "Puis-je utiliser Trackit avec des créateurs TikTok ?",
        answer:
          "Oui. Trackit est optimisé pour trouver et contacter des créateurs TikTok, et se connecte à Shopify pour suivre les ventes qu'ils génèrent.",
      },
      {
        question: "Combien coûte Trackit ?",
        answer:
          "Trackit propose une offre gratuite pour démarrer. Les offres payantes Growth, Pro et Scale relèvent les limites à mesure que votre programme grandit. Tous les tarifs sont sur thentrack.it/fr/pricing.",
      },
    ],
    sections: [
      {
        heading: "Tout ce qu'il vous faut, sur une seule plateforme",
        paragraphs: [
          "Gérer un programme d'affiliation créateurs ne devrait pas demander cinq outils différents. Trackit rassemble les étapes qui comptent vraiment pour une marque e-commerce.",
        ],
        bullets: [
          "Découverte de créateurs TikTok et listes enregistrées",
          "Prospection assistée par IA, avec tout l'historique des échanges",
          "Gestion des campagnes et des contenus",
          "Synchronisation des commandes Shopify et attribution des ventes",
          "Calcul et paiement des commissions",
          "Analyses et suivi du ROI",
        ],
      },
      {
        heading: "Conçu pour les marques, pas pour les agences",
        paragraphs: [
          "Trackit s'adresse aux fondateurs et aux petites équipes qui veulent un programme créateurs professionnel sans la lourdeur des solutions pour grands comptes. Commencez gratuitement, puis passez à l'offre supérieure quand votre vivier de créateurs s'agrandit.",
        ],
      },
    ],
    relatedBlogSlugs: ["quest-ce-que-trackit-plateforme-affiliation-createurs", "lancer-programme-affiliation-createurs-trackit"],
    ctaLabel: "Commencez gratuitement avec Trackit",
  },
  {
    slug: "marketing-createurs-tiktok",
    alternateSlug: "tiktok-creator-marketing",
    title: "Marketing d'influence TikTok — Trackit",
    description:
      "Pilotez votre marketing d'influence TikTok avec Trackit : trouvez des créateurs, contactez-les, suivez les ventes Shopify et payez les commissions automatiquement.",
    headline: "Votre marketing d'influence TikTok, piloté depuis Trackit",
    subheadline:
      "Arrêtez de faire défiler TikTok pendant des heures. Trackit trouve les créateurs de votre niche, vous aide à les contacter et montre quelles vidéos rapportent du chiffre d'affaires.",
    keywords: [
      "marketing d'influence TikTok",
      "créateurs TikTok",
      "Trackit TikTok",
      "plateforme influenceurs TikTok",
      "trouver des créateurs TikTok",
    ],
    faqs: [
      {
        question: "Comment Trackit aide-t-il à faire du marketing d'influence sur TikTok ?",
        answer:
          "Trackit propose un catalogue de créateurs TikTok avec recherche et filtres, des outils de prospection avec des brouillons rédigés par IA, le suivi des campagnes et l'attribution du chiffre d'affaires Shopify par créateur.",
      },
      {
        question: "Puis-je savoir quels créateurs TikTok génèrent des ventes ?",
        answer:
          "Oui. Chaque créateur reçoit ses propres liens d'affiliation suivis dans Trackit. Quand il parle de votre marque, les commandes Shopify se synchronisent et le chiffre d'affaires lui est attribué automatiquement.",
      },
      {
        question: "Trackit fonctionne-t-il seulement avec TikTok ?",
        answer:
          "Trackit est optimisé pour TikTok, mais vous pouvez aussi contacter des créateurs sur Instagram ou par e-mail lorsque leurs coordonnées sont disponibles.",
      },
    ],
    sections: [
      {
        heading: "De la découverte au chiffre d'affaires",
        paragraphs: ["Trackit couvre tout le cycle du marketing d'influence sur TikTok :"],
        bullets: [
          "Recherchez des créateurs par niche, langue et engagement",
          "Classez les profils dans des listes et des pipelines",
          "Générez des messages de prospection personnalisés",
          "Lancez des campagnes avec des liens suivis",
          "Mesurez les ventes et le ROI de chaque créateur",
        ],
      },
      {
        heading: "Pourquoi les marques choisissent Trackit pour TikTok",
        paragraphs: [
          "Chercher des créateurs à la main sur TikTok ne tient pas la distance. Trackit vous donne une méthode reproductible : chaque heure passée sur votre marketing d'influence se traduit en chiffre d'affaires Shopify mesurable.",
        ],
      },
    ],
    relatedBlogSlugs: ["outreach-tiktok-createurs-avec-trackit", "gestion-campagnes-ugc-avec-trackit"],
    ctaLabel: "Trouvez des créateurs TikTok sur Trackit",
  },
  {
    slug: "suivi-ventes-createurs-shopify",
    alternateSlug: "shopify-creator-tracking",
    title: "Suivi des ventes créateurs sur Shopify — Trackit",
    description:
      "Suivez les ventes Shopify générées par les liens d'affiliation de vos créateurs avec Trackit : synchronisation automatique des commandes, suivi des commissions et analyses par campagne.",
    headline: "Un suivi des ventes créateurs sur Shopify qui tient ses promesses",
    subheadline:
      "Connectez votre boutique Shopify à Trackit et voyez précisément quels créateurs génèrent du chiffre d'affaires, avec le calcul des commissions intégré.",
    keywords: [
      "suivi ventes créateurs Shopify",
      "Trackit Shopify",
      "attribution des ventes créateurs",
      "affiliation Shopify",
      "tracking influenceurs Shopify",
    ],
    faqs: [
      {
        question: "Comment Trackit suit-il les ventes des créateurs sur Shopify ?",
        answer:
          "Trackit synchronise vos commandes Shopify et les attribue aux liens d'affiliation et aux codes promo des créateurs, générés depuis votre tableau de bord Trackit.",
      },
      {
        question: "Dois-je importer les commandes à la main ?",
        answer:
          "Non. Une fois Shopify connecté, les commandes remontent automatiquement dans Trackit, en temps réel.",
      },
      {
        question: "Trackit gère-t-il des taux de commission différents selon les créateurs ?",
        answer:
          "Oui. Définissez vos règles de commission par campagne ou par créateur dans Trackit : la plateforme calcule automatiquement les montants dus.",
      },
    ],
    sections: [
      {
        heading: "Une attribution fiable pour les marques Shopify",
        paragraphs: [
          "Le marketing créateurs ne fonctionne que si vous pouvez le mesurer. Trackit relie vos données Shopify à chaque lien et à chaque code de votre programme.",
        ],
        bullets: [
          "Intégration Shopify en un clic",
          "Un lien suivi unique par créateur",
          "Prise en charge des codes promo",
          "Tableau de bord des ventes en temps réel",
          "Soldes de commissions et suivi des paiements",
        ],
      },
      {
        heading: "Dites adieu à votre tableur de suivi",
        paragraphs: [
          "Un tableur ne se synchronise pas avec Shopify et ne sait gérer ni les retours ni les codes qui se chevauchent. Trackit garde vos données de ventes créateurs exactes, même quand votre programme prend de l'ampleur.",
        ],
      },
    ],
    relatedBlogSlugs: ["suivre-ventes-shopify-createurs-avec-trackit", "guide-trackit-marques-shopify"],
    ctaLabel: "Connectez Shopify à Trackit",
  },
];

export function getSeoPages(lang: AppLang = "en"): SeoPage[] {
  return lang === "fr" ? SEO_PAGES_FR : SEO_PAGES;
}

/** Solutions index path for a language: /solutions or /fr/solutions. */
export function solutionsBasePath(lang: AppLang = "en"): string {
  return lang === "fr" ? "/fr/solutions" : "/solutions";
}

export function getSeoPage(slug: string, lang: AppLang = "en"): SeoPage | undefined {
  return getSeoPages(lang).find((page) => page.slug === slug);
}

export function getAllSeoPageSlugs(lang: AppLang = "en"): string[] {
  return getSeoPages(lang).map((page) => page.slug);
}

/** Both language versions of a solutions page, when it has a twin. */
export function seoPageLanguages(page: SeoPage, lang: AppLang): { en: string; fr: string } | null {
  const other = page.alternateSlug ? getSeoPage(page.alternateSlug, lang === "fr" ? "en" : "fr") : undefined;
  if (!other) return null;
  const [en, fr] = lang === "fr" ? [other, page] : [page, other];
  return { en: `/solutions/${en.slug}`, fr: `/fr/solutions/${fr.slug}` };
}
