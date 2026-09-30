import type { BlogPost } from "./types";

// French editions of the English posts (see posts-en.ts). Each one names its
// English twin in `alternateSlug` for hreflang and the language switch.
export const POSTS_FR: BlogPost[] = [
  {
    slug: "quest-ce-que-trackit-plateforme-affiliation-createurs",
    title: "Qu'est-ce que Trackit ? La plateforme d'affiliation créateurs pour les marques Shopify",
    description:
      "Trackit réunit la découverte de créateurs TikTok, la prospection, le suivi des ventes Shopify et le paiement des commissions dans un seul tableau de bord.",
    category: "Plateforme",
    locale: "fr",
    publishedAt: "2026-01-08T10:00:00.000Z",
    updatedAt: "2026-03-20T10:00:00.000Z",
    readMinutes: 8,
    keywords: ["Trackit", "qu'est-ce que Trackit", "plateforme Trackit", "plateforme d'affiliation créateurs"],
    relatedSlugs: ["guide-trackit-marques-shopify", "lancer-programme-affiliation-createurs-trackit"],
    alternateSlug: "what-is-trackit-creator-affiliate-platform",
    blocks: [
      {
        type: "p",
        text: "Si vous avez cherché Trackit, c'est sans doute que vous voulez une façon plus simple de gérer vos partenariats avec des créateurs. Trackit est une plateforme de marketing d'influence pensée pour les marques e-commerce — en particulier les boutiques Shopify — qui veulent découvrir des créateurs, les contacter, suivre les ventes et les payer au même endroit.",
      },
      {
        type: "p",
        text: "Au lieu de jongler entre recherches sur TikTok, Google Sheets, messages privés et calculs de commissions à la main, votre équipe dispose d'un seul espace de travail, du premier contact jusqu'au dernier paiement.",
      },
      { type: "h2", text: "Ce que fait Trackit" },
      {
        type: "ul",
        items: [
          "Découverte de créateurs — recherchez des créateurs TikTok par niche, engagement et affinité avec votre audience.",
          "Prospection — générez des messages personnalisés et gardez l'historique complet de chaque échange.",
          "Gestion de campagnes — organisez créateurs, contenus et liens d'affiliation campagne par campagne.",
          "Attribution Shopify — synchronisez les commandes et rattachez automatiquement le chiffre d'affaires à chaque créateur.",
          "Suivi des commissions — consultez les montants dus et payez vos créateurs sans erreurs de tableur.",
          "Analyses — mesurez le ROI, repérez vos meilleurs créateurs et suivez la performance de vos campagnes dans le temps.",
        ],
      },
      { type: "h2", text: "À qui s'adresse Trackit ?" },
      {
        type: "p",
        text: "Trackit est conçu pour les fondateurs de marques DTC, les marchands Shopify et les petites équipes growth. Nul besoin d'un budget d'agence ni d'une équipe influence de dix personnes pour mener un programme créateurs professionnel avec Trackit.",
      },
      { type: "h2", text: "Trackit face aux outils traditionnels" },
      {
        type: "p",
        text: "Les plateformes d'influence « entreprise » coûtent souvent plusieurs centaines d'euros par mois et partent du principe que vous avez déjà un large vivier de créateurs. Trackit fait d'autres choix, pensés pour les petites marques : une découverte rapide, une prospection concrète et un suivi natif sur Shopify, à un prix juste.",
      },
      {
        type: "p",
        text: "Envie de voir Trackit à l'œuvre ? Commencez gratuitement sur thentrack.it — sans carte bancaire.",
      },
    ],
  },
  {
    slug: "suivre-ventes-shopify-createurs-avec-trackit",
    title: "Comment suivre les ventes générées par vos créateurs sur Shopify avec Trackit",
    description:
      "Guide pas à pas : connecter Shopify, générer des liens suivis et mesurer le chiffre d'affaires de chaque créateur avec Trackit.",
    category: "Shopify",
    locale: "fr",
    publishedAt: "2026-01-12T10:00:00.000Z",
    updatedAt: "2026-03-20T10:00:00.000Z",
    readMinutes: 7,
    keywords: ["Trackit Shopify", "suivre les ventes des créateurs", "suivi affiliation Shopify"],
    relatedSlugs: ["quest-ce-que-trackit-plateforme-affiliation-createurs", "trackit-vs-tableurs-gestion-createurs"],
    alternateSlug: "track-creator-sales-shopify-with-trackit",
    blocks: [
      {
        type: "p",
        text: "Les créateurs font vendre — mais sans attribution, impossible de savoir ce qui marche et de le reproduire à plus grande échelle. Trackit relie votre boutique Shopify aux liens d'affiliation de vos créateurs, pour que chaque commande soit attribuée à la bonne personne.",
      },
      { type: "h2", text: "Étape 1 : connecter Shopify à Trackit" },
      {
        type: "p",
        text: "Depuis votre tableau de bord Trackit, connectez votre boutique Shopify. Les commandes se synchronisent automatiquement : plus jamais d'import manuel de fichiers CSV.",
      },
      { type: "h2", text: "Étape 2 : créer un lien suivi par créateur" },
      {
        type: "p",
        text: "Chaque créateur reçoit un lien d'affiliation Trackit unique (et, si vous le souhaitez, un code promo). Quand un client achète via ce lien, Trackit attribue la vente à ce créateur.",
      },
      { type: "h2", text: "Étape 3 : analyser le chiffre d'affaires et les commissions" },
      {
        type: "ul",
        items: [
          "Consultez les ventes totales par créateur et par campagne.",
          "Calculez les commissions dues selon les taux convenus.",
          "Repérez vos meilleurs créateurs et mettez tôt en pause ceux qui ne performent pas.",
          "Exportez ou payez directement depuis Trackit quand vous êtes prêt.",
        ],
      },
      { type: "h2", text: "Pourquoi Trackit fait mieux qu'un suivi manuel" },
      {
        type: "p",
        text: "Les tableurs cèdent dès que des codes promo se chevauchent, que des créateurs partagent leurs liens ou que des retours arrivent. Trackit gère l'attribution en arrière-plan : vos chiffres restent justes à mesure que votre programme grandit.",
      },
    ],
  },
  {
    slug: "outreach-tiktok-createurs-avec-trackit",
    title: "Prospection de créateurs TikTok : le guide pratique avec Trackit",
    description:
      "Trouvez des créateurs TikTok, rédigez des messages qui obtiennent des réponses et gérez vos relances — le tout dans Trackit.",
    category: "Prospection",
    locale: "fr",
    publishedAt: "2026-01-18T10:00:00.000Z",
    updatedAt: "2026-03-20T10:00:00.000Z",
    readMinutes: 9,
    keywords: ["Trackit prospection", "prospection créateurs TikTok", "message créateur TikTok", "outreach créateurs"],
    relatedSlugs: ["lancer-programme-affiliation-createurs-trackit", "gestion-campagnes-ugc-avec-trackit"],
    alternateSlug: "tiktok-creator-outreach-guide-trackit",
    blocks: [
      {
        type: "p",
        text: "La plupart des programmes créateurs échouent au moment de la prise de contact — non par manque de budget, mais parce que la marque perd le fil : qui a été contacté, avec quelle offre, et qui a répondu. Trackit remet de l'ordre dans ce processus, de bout en bout.",
      },
      { type: "h2", text: "Trouver des créateurs dans Trackit" },
      {
        type: "p",
        text: "Utilisez le catalogue de créateurs Trackit pour filtrer par niche, langue et engagement. Enregistrez les profils prometteurs dans des listes : votre pipeline reste organisé dès le premier jour.",
      },
      { type: "h2", text: "Écrire des messages qui obtiennent des réponses" },
      {
        type: "ul",
        items: [
          "Commencez par expliquer pourquoi leur contenu correspond à votre marque — soyez précis, pas générique.",
          "Présentez clairement l'offre : rémunération fixe, commission d'affiliation ou produit offert.",
          "Gardez un premier message court ; l'IA de Trackit peut en rédiger une version personnalisée.",
          "Proposez une prochaine étape claire : répondre, planifier un appel ou tester votre produit.",
        ],
      },
      { type: "h2", text: "Consigner chaque échange dans Trackit" },
      {
        type: "p",
        text: "Que vous écriviez sur TikTok, Instagram ou par e-mail, enregistrez la prise de contact dans Trackit. Toute l'équipe voit l'historique complet — fini les « quelqu'un a déjà contacté ce créateur ? ».",
      },
      { type: "h2", text: "Relancer et mesurer la conversion" },
      {
        type: "p",
        text: "Trackit rattache les créateurs qui acceptent à vos campagnes et au chiffre d'affaires Shopify. Vous savez quels messages et quels profils convertissent réellement — pas seulement lesquels répondent.",
      },
    ],
  },
  {
    slug: "lancer-programme-affiliation-createurs-trackit",
    title: "Comment lancer un programme d'affiliation créateurs avec Trackit",
    description:
      "La méthode complète pour lancer votre premier programme d'affiliation créateurs avec Trackit — de la stratégie au premier paiement.",
    category: "Guides",
    locale: "fr",
    publishedAt: "2026-01-25T10:00:00.000Z",
    updatedAt: "2026-03-20T10:00:00.000Z",
    readMinutes: 10,
    keywords: ["programme d'affiliation Trackit", "lancer un programme créateurs", "guide affiliation créateurs"],
    relatedSlugs: ["quest-ce-que-trackit-plateforme-affiliation-createurs", "tarifs-trackit-plans-expliques"],
    alternateSlug: "how-to-launch-creator-affiliate-program-trackit",
    blocks: [
      { type: "h2", text: "Définir la structure de votre programme" },
      {
        type: "p",
        text: "Avant d'ouvrir Trackit, fixez votre taux de commission, vos conditions de paiement et vos attentes en matière de contenu. La plupart des marques Shopify démarrent entre 10 et 20 % par vente, avec l'envoi gratuit de produits.",
      },
      { type: "h2", text: "Configurer Trackit et Shopify" },
      {
        type: "ol",
        items: [
          "Créez votre compte Trackit sur thentrack.it.",
          "Connectez Shopify pour synchroniser automatiquement les commandes.",
          "Créez votre première campagne et ses règles de commission.",
          "Générez un lien d'affiliation pour chaque créateur.",
        ],
      },
      { type: "h2", text: "Recruter vos 10 premiers créateurs" },
      {
        type: "p",
        text: "Utilisez la découverte Trackit pour trouver des créateurs dans votre niche. Privilégiez le taux d'engagement et la qualité du contenu plutôt que le seul nombre d'abonnés. Envoyez des messages personnalisés et suivez les réponses dans Trackit.",
      },
      { type: "h2", text: "Lancer, mesurer, optimiser" },
      {
        type: "p",
        text: "Une fois les contenus publiés, suivez l'attribution des ventes dans les analyses Trackit. Misez davantage sur vos meilleurs créateurs, affinez votre offre et élargissez votre vivier de façon méthodique.",
      },
    ],
  },
  {
    slug: "trackit-vs-tableurs-gestion-createurs",
    title: "Trackit ou tableur : pourquoi les marques passent à Trackit",
    description:
      "Un tableur ne suffit plus pour gérer un programme créateurs. Découvrez pourquoi les marques en croissance passent à Trackit pour la découverte, le suivi et les paiements.",
    category: "Comparatifs",
    locale: "fr",
    publishedAt: "2026-02-01T10:00:00.000Z",
    updatedAt: "2026-03-20T10:00:00.000Z",
    readMinutes: 6,
    keywords: ["Trackit vs tableur", "logiciel de gestion de créateurs", "alternative à Trackit"],
    relatedSlugs: ["suivre-ventes-shopify-createurs-avec-trackit", "quest-ce-que-trackit-plateforme-affiliation-createurs"],
    alternateSlug: "trackit-vs-spreadsheets-creator-management",
    blocks: [
      {
        type: "p",
        text: "Un tableur fonctionne pour 3 créateurs. Au-delà de 10, il devient un risque : commissions mal calculées, messages perdus, aucune synchronisation avec Shopify. Trackit remplace ce bricolage par une seule plateforme.",
      },
      { type: "h2", text: "Ce qu'un tableur ne sait pas faire" },
      {
        type: "ul",
        items: [
          "Synchroniser les commandes Shopify en temps réel.",
          "Découvrir de nouveaux créateurs TikTok dans votre niche.",
          "Conserver l'historique des échanges avec chaque créateur.",
          "Générer automatiquement des liens d'affiliation suivis.",
          "Calculer les commissions quand les taux diffèrent d'un créateur à l'autre.",
        ],
      },
      { type: "h2", text: "Ce que Trackit apporte" },
      {
        type: "p",
        text: "Trackit est conçu spécifiquement pour l'affiliation créateurs. Les marques font le saut quand le suivi manuel leur coûte plus de temps que Trackit ne leur coûte par mois — généralement après leur première campagne réussie.",
      },
    ],
  },
  {
    slug: "gestion-campagnes-ugc-avec-trackit",
    title: "Gérer vos campagnes UGC avec Trackit",
    description:
      "Planifiez vos campagnes UGC, collectez les contenus de vos créateurs et mesurez leur impact sur les ventes — le tout dans Trackit.",
    category: "Campagnes",
    locale: "fr",
    publishedAt: "2026-02-08T10:00:00.000Z",
    updatedAt: "2026-03-20T10:00:00.000Z",
    readMinutes: 7,
    keywords: ["Trackit UGC", "gestion de campagnes UGC", "suivi des contenus créateurs"],
    relatedSlugs: ["outreach-tiktok-createurs-avec-trackit", "guide-trackit-marques-shopify"],
    alternateSlug: "ugc-campaign-management-with-trackit",
    blocks: [
      {
        type: "p",
        text: "Une campagne UGC demande plus qu'un brief et un hashtag. Trackit vous aide à gérer vos créateurs, à collecter les liens de leurs contenus et à relier chaque publication au chiffre d'affaires Shopify.",
      },
      { type: "h2", text: "Organiser vos campagnes dans Trackit" },
      {
        type: "p",
        text: "Créez une campagne par lancement de produit ou par saison. Ajoutez vos créateurs, définissez les règles de commission et suivez les contenus qui génèrent le plus de ventes.",
      },
      { type: "h2", text: "Collecter et valider les contenus" },
      {
        type: "p",
        text: "Les créateurs déposent leurs contenus directement dans Trackit. La marque voit les liens des publications, leurs statistiques quand elles sont disponibles et un classement par performance — sans courir après des fichiers par e-mail.",
      },
      { type: "h2", text: "Mesurer le ROI de vos UGC" },
      {
        type: "p",
        text: "Trackit attribue les commandes Shopify à chaque contenu. Vous savez quels formats UGC et quels créateurs rapportent du chiffre d'affaires, pas seulement des vues.",
      },
    ],
  },
  {
    slug: "guide-trackit-marques-shopify",
    title: "Trackit pour les marques Shopify : le guide complet",
    description:
      "Tout ce que les marques Shopify doivent savoir pour mener leur programme créateurs sur Trackit — configuration, suivi et passage à l'échelle.",
    category: "Shopify",
    locale: "fr",
    publishedAt: "2026-02-15T10:00:00.000Z",
    updatedAt: "2026-03-20T10:00:00.000Z",
    readMinutes: 11,
    keywords: ["Trackit Shopify", "guide Trackit", "marketing d'influence Shopify"],
    relatedSlugs: ["suivre-ventes-shopify-createurs-avec-trackit", "lancer-programme-affiliation-createurs-trackit"],
    alternateSlug: "trackit-for-shopify-brands-guide",
    blocks: [
      {
        type: "p",
        text: "Pour une marque Shopify, un canal d'acquisition ne vaut que s'il est mesurable. Trackit fait du marketing créateurs un système suivi et reproductible — pas un pari.",
      },
      { type: "h2", text: "Pourquoi les marques Shopify choisissent Trackit" },
      {
        type: "ul",
        items: [
          "Synchronisation native des commandes Shopify — fini les imports manuels.",
          "Liens d'affiliation et codes promo réunis dans un seul outil.",
          "Découverte de créateurs sans passer par une agence coûteuse.",
          "Un suivi des commissions qui suit la croissance de votre vivier de créateurs.",
          "Des tarifs pensés pour les petites marques, pas pour les grands comptes.",
        ],
      },
      { type: "h2", text: "Bien démarrer sur Trackit" },
      {
        type: "ol",
        items: [
          "Inscrivez-vous gratuitement sur thentrack.it.",
          "Connectez votre boutique Shopify.",
          "Créez votre première campagne.",
          "Trouvez des créateurs et contactez-les.",
          "Partagez les liens suivis et surveillez les ventes.",
        ],
      },
      { type: "h2", text: "Passer à l'échelle avec les offres payantes" },
      {
        type: "p",
        text: "Quand votre vivier de créateurs s'agrandit, passez à une offre supérieure pour des limites plus élevées, des analyses avancées et le travail en équipe. Trackit grandit avec votre programme — de votre premier créateur à une véritable machine d'affiliation.",
      },
    ],
  },
  {
    slug: "tarifs-trackit-plans-expliques",
    title: "Tarifs Trackit : les offres Gratuit, Starter, Pro et Business expliquées",
    description:
      "Comparez les offres Trackit Gratuit, Starter, Pro et Business — fonctionnalités, limites et l'offre adaptée à votre programme créateurs.",
    category: "Plateforme",
    locale: "fr",
    publishedAt: "2026-02-22T10:00:00.000Z",
    updatedAt: "2026-03-20T10:00:00.000Z",
    readMinutes: 5,
    keywords: ["tarifs Trackit", "prix Trackit", "offres Trackit", "abonnement Trackit"],
    relatedSlugs: ["quest-ce-que-trackit-plateforme-affiliation-createurs", "lancer-programme-affiliation-createurs-trackit"],
    alternateSlug: "trackit-pricing-and-plans-guide",
    blocks: [
      {
        type: "p",
        text: "Trackit propose une offre gratuite pour démarrer, puis les offres Starter, Pro et Business pour les marques qui font tourner un programme créateurs actif. Toutes incluent la découverte et le suivi ; les offres payantes débloquent des limites plus élevées et des fonctionnalités avancées.",
      },
      { type: "h2", text: "Trackit Gratuit" },
      {
        type: "p",
        text: "Idéal pour tester le marketing créateurs. Explorez la découverte, lancez une petite campagne et validez le canal avant d'y consacrer un budget.",
      },
      { type: "h2", text: "Trackit Starter" },
      {
        type: "p",
        text: "Le point d'entrée pour lancer un vrai programme créateurs : découverte, modèles de messages, paiements manuels et liens d'affiliation suivis.",
      },
      { type: "h2", text: "Trackit Pro" },
      {
        type: "p",
        text: "Pour les marques qui gèrent déjà un vivier de créateurs actif : plus de créateurs, plus de prises de contact et des analyses pour piloter des partenariats dans la durée.",
      },
      { type: "h2", text: "Trackit Business" },
      {
        type: "p",
        text: "Pour les équipes qui mènent plusieurs campagnes de front : les limites les plus élevées et tout le contenu de l'offre Pro, pour les programmes à fort volume.",
      },
      {
        type: "p",
        text: "Retrouvez les tarifs à jour sur thentrack.it/fr/pricing — les offres évoluent à mesure que Trackit ajoute des fonctionnalités.",
      },
    ],
  },
];
