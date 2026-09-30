import type { AppLang } from "@/lib/locale-preferences";
import { legalLinks } from "@/lib/legal-links";
import { LEGAL_ENTITY, LEGAL_HOST, type LegalEntity } from "@/lib/legal-entity";

export type LegalLinkRef = { href: string; label: string };

export type LegalSection = {
  title: string;
  paragraphs: string[];
  list?: string[];
  /** Simple table (e.g. the list of cookies). */
  table?: { headers: string[]; rows: string[][] };
  /** Links shown under the section. */
  links?: LegalLinkRef[];
  /** Show the "Manage cookies" button under the section. */
  manageCookies?: boolean;
};

export type LegalDocument = {
  title: string;
  lastUpdatedLabel: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
};

export type LegalDocumentType = "terms" | "privacy" | "legal" | "cookies";

const CONTACT = LEGAL_ENTITY.email;
const LAST_UPDATED = "September 30, 2026";
const LAST_UPDATED_FR = "30 septembre 2026";

function linkFor(lang: AppLang, key: "legal" | "terms" | "privacy" | "cookies"): LegalLinkRef {
  const link = legalLinks(lang).find((l) => l.key === key)!;
  return { href: link.href, label: link.label };
}

function pricingLink(lang: AppLang): LegalLinkRef {
  return lang === "fr"
    ? { href: "/fr/pricing", label: "Voir les offres et tarifs" }
    : { href: "/pricing", label: "See plans and pricing" };
}

export function getLegalContent(type: LegalDocumentType, lang: AppLang): LegalDocument {
  switch (type) {
    case "terms":
      return getTermsContent(lang);
    case "privacy":
      return getPrivacyContent(lang);
    case "legal":
      return getLegalNoticeContent(lang);
    case "cookies":
      return getCookiePolicyContent(lang);
  }
}

/* ------------------------------------------------------------------ */
/* Terms of use and sale (CGU / CGV)                                   */
/* ------------------------------------------------------------------ */

export function getTermsContent(lang: AppLang): LegalDocument {
  if (lang === "fr") {
    return {
      title: "Conditions générales d'utilisation et de vente",
      lastUpdatedLabel: "Dernière mise à jour",
      lastUpdated: LAST_UPDATED_FR,
      intro:
        "Les présentes conditions générales d'utilisation et de vente (les « Conditions ») régissent l'accès et l'utilisation de Trackit (thentrack.it), plateforme SaaS d'affiliation et de marketing créateurs pour les marques e-commerce, ainsi que la souscription d'abonnements payants. Le service est réservé aux professionnels. En créant un compte, en utilisant le service ou en souscrivant un abonnement, vous acceptez ces Conditions sans réserve.",
      sections: [
        {
          title: "1. Éditeur",
          paragraphs: [
            `Trackit (« Trackit », « nous ») est édité par ${LEGAL_ENTITY.name}. Les informations légales complètes figurent dans les mentions légales. Pour toute question : ${CONTACT}.`,
          ],
          links: [linkFor("fr", "legal")],
        },
        {
          title: "2. Définitions",
          paragraphs: [],
          list: [
            "« Service » : la plateforme Trackit, son site, son application web, l'app créateur et leurs fonctionnalités.",
            "« Client » ou « Marque » : la personne morale ou le professionnel qui utilise le Service pour gérer ses programmes créateurs et, le cas échéant, souscrit un Abonnement.",
            "« Créateur » : la personne qui produit du contenu et collabore avec une Marque (gifting, affiliation, contenu sponsorisé) via le Service.",
            "« Utilisateur » : toute personne disposant d'un compte Trackit, Marque ou Créateur.",
            "« Abonnement » : la formule payante souscrite par le Client (Growth, Pro, Scale ou toute autre offre proposée).",
          ],
        },
        {
          title: "3. Accès au service et compte",
          paragraphs: [
            "Le Service est destiné exclusivement aux professionnels agissant dans le cadre de leur activité commerciale : Marques, agences et Créateurs exerçant une activité d'influence commerciale. Vous devez avoir au moins 18 ans et la capacité de contracter ; si vous agissez pour le compte d'une entreprise, vous déclarez être habilité à l'engager.",
            "Vous vous engagez à fournir des informations exactes et à jour, et à garder vos identifiants confidentiels. Vous êtes responsable de toute activité réalisée depuis votre compte et de l'usage qu'en font les membres de votre équipe.",
          ],
        },
        {
          title: "4. Description du service",
          paragraphs: [
            "Trackit permet notamment aux Marques de découvrir des Créateurs, de gérer des campagnes de gifting et d'affiliation, de générer des liens et codes de suivi, de suivre les ventes attribuées (notamment via Shopify) et d'organiser le calcul et le paiement des commissions. Les Créateurs peuvent recevoir des propositions, suivre leurs collaborations et leurs gains.",
            "Les fonctionnalités évoluent régulièrement ; certaines dépendent de la formule souscrite. Nous pouvons modifier ou retirer une fonctionnalité, sans supprimer une fonctionnalité essentielle d'un Abonnement en cours sans vous en informer au préalable.",
          ],
        },
        {
          title: "5. Offres et prix",
          paragraphs: [
            "Trackit propose une offre gratuite (Free) et des Abonnements payants (notamment Growth, Pro et Scale). Le contenu, les limites et le prix de chaque offre sont ceux affichés sur la page Tarifs au moment de la souscription ; cette page fait foi.",
            "Les prix sont indiqués hors taxes, en euros ou en dollars américains selon votre région. Les taxes applicables (dont la TVA) s'ajoutent selon votre situation et sont indiquées lors du paiement.",
            "Nous pouvons faire évoluer nos prix. Toute hausse applicable à un Abonnement en cours vous est notifiée au moins 30 jours à l'avance et ne s'applique qu'à la période de renouvellement suivante ; vous pouvez résilier avant son entrée en vigueur.",
          ],
          links: [pricingLink("fr")],
        },
        {
          title: "6. Commande, paiement et facturation",
          paragraphs: [
            "La souscription s'effectue en ligne depuis le Service. Le paiement est traité par nos prestataires de paiement, Whop et Stripe, selon leurs propres conditions ; Trackit n'a jamais accès à vos numéros de carte complets. Le prix est payable d'avance, à chaque début de période, par prélèvement automatique sur le moyen de paiement enregistré.",
            "Les factures sont émises par voie électronique et accessibles depuis votre espace de facturation ou le portail du prestataire de paiement.",
            "En cas d'échec de paiement, nous pouvons, après une relance restée sans effet, suspendre l'accès aux fonctionnalités payantes ou rétrograder le compte vers l'offre gratuite. Conformément à l'article L. 441-10 du Code de commerce, toute somme impayée à l'échéance porte intérêt au taux de trois fois le taux d'intérêt légal et donne lieu à une indemnité forfaitaire pour frais de recouvrement de 40 €.",
          ],
        },
        {
          title: "7. Durée, renouvellement et changement de formule",
          paragraphs: [
            "Les Abonnements sont souscrits pour une durée mensuelle ou annuelle, selon l'option choisie. Ils se renouvellent automatiquement pour une durée identique à chaque échéance, sauf résiliation avant la date de renouvellement.",
            "Le passage à une formule supérieure prend effet immédiatement ; le montant est ajusté au prorata par le prestataire de paiement. Le passage à une formule inférieure prend effet à la fin de la période en cours.",
          ],
        },
        {
          title: "8. Résiliation par le Client",
          paragraphs: [
            "Vous pouvez résilier votre Abonnement à tout moment depuis les paramètres de facturation ou en nous écrivant. La résiliation prend effet à la fin de la période en cours : l'accès aux fonctionnalités payantes est maintenu jusqu'à cette date, puis le compte passe à l'offre gratuite.",
            "Toute période commencée est due. Sauf disposition légale impérative ou manquement de notre part, les sommes versées ne sont pas remboursables, y compris pour un Abonnement annuel résilié en cours de période.",
            "Vous pouvez supprimer votre compte depuis les paramètres ou sur demande. Il vous appartient d'exporter au préalable les données dont vous avez besoin.",
          ],
        },
        {
          title: "9. Absence de droit de rétractation",
          paragraphs: [
            "Le Service étant souscrit par des professionnels pour les besoins de leur activité, le droit de rétractation prévu par le Code de la consommation au bénéfice des consommateurs ne s'applique pas.",
          ],
        },
        {
          title: "10. Relations entre Marques et Créateurs",
          paragraphs: [
            "Trackit est un outil technique de mise en relation, de gestion et de suivi. Trackit n'est pas partie aux accords conclus entre Marques et Créateurs, n'agit ni comme agent ni comme mandataire de l'une ou l'autre partie et ne garantit ni les résultats d'une collaboration ni le comportement des Utilisateurs.",
            "La Marque est seule responsable :",
          ],
          list: [
            "de la définition des conditions de collaboration (taux et règles de commission, durée, produits offerts, contreparties) et de leur communication claire au Créateur ;",
            "de l'envoi des produits offerts (gifting), de leur conformité, de leur sécurité et des frais d'expédition ;",
            "du paiement des commissions dues aux Créateurs, qui sont à la charge exclusive de la Marque, dans les délais convenus ;",
            "du respect des règles applicables à la publicité et aux pratiques commerciales, y compris l'encadrement de l'influence commerciale (loi n° 2023-451 du 9 juin 2023).",
          ],
        },
        {
          title: "11. Engagements des Créateurs",
          paragraphs: [
            "Le Créateur est seul responsable de ses contenus et de ses publications. Il s'engage notamment :",
          ],
          list: [
            "à signaler clairement le caractère commercial de ses contenus (mention « Publicité » ou « Collaboration commerciale », ou toute mention exigée par la réglementation et les plateformes) ;",
            "à ne pas promouvoir de produits interdits ou réglementés en violation de la loi, et à ne pas diffuser d'allégations trompeuses ;",
            "à respecter les conditions des plateformes sociales et les droits des tiers ;",
            "à déclarer ses revenus et à s'acquitter des obligations fiscales et sociales liées aux commissions et produits reçus.",
          ],
        },
        {
          title: "12. Suivi des ventes et commissions",
          paragraphs: [
            "Les ventes attribuées et les commissions sont calculées à partir des données de suivi disponibles (liens, codes promo, données de la boutique). Ces données peuvent être incomplètes ou décalées (bloqueurs, suppression de cookies, retours, annulations, indisponibilité d'une intégration). Elles sont fournies à titre indicatif ; la Marque reste responsable de la validation des commissions et du montant finalement versé.",
            "Lorsque les paiements aux Créateurs sont exécutés via un prestataire de paiement intégré (par exemple Stripe Connect), ils sont soumis aux conditions de ce prestataire. Tout différend relatif à une commission se règle entre la Marque et le Créateur ; nous pouvons, sur demande, fournir les données de suivi disponibles.",
          ],
        },
        {
          title: "13. Utilisation acceptable",
          list: [
            "Ne pas utiliser Trackit à des fins illégales, frauduleuses ou trompeuses (fausses ventes, auto-attribution de commissions, manipulation du suivi…).",
            "Ne pas harceler des Créateurs ni envoyer de messages non sollicités en violation des lois ou des conditions des plateformes tierces.",
            "Ne pas tenter d'accéder sans autorisation à nos systèmes ou aux données d'autres Utilisateurs, ni perturber le Service.",
            "Ne pas revendre, extraire (scraping) ou reproduire massivement les données du Service sans autorisation.",
          ],
          paragraphs: [],
        },
        {
          title: "14. Données et contenus",
          paragraphs: [
            "Vous conservez la propriété de vos contenus et données. Vous nous accordez une licence non exclusive, pour la durée d'utilisation du Service, pour les héberger, les traiter et les afficher dans le seul but de fournir le Service.",
            "Pour les données personnelles que vous importez ou traitez via le Service (Créateurs, clients de votre boutique), vous agissez en tant que responsable de traitement et Trackit en tant que sous-traitant, dans les conditions décrites dans la politique de confidentialité.",
          ],
          links: [linkFor("fr", "privacy")],
        },
        {
          title: "15. Propriété intellectuelle",
          paragraphs: [
            "Trackit, sa marque, son interface, ses bases de données et son code restent notre propriété exclusive ou celle de nos concédants. L'Abonnement vous confère un droit d'utilisation personnel, non exclusif et non transférable du Service, pour sa durée.",
          ],
        },
        {
          title: "16. Disponibilité et support",
          paragraphs: [
            "Nous nous efforçons d'assurer l'accès au Service 24 h/24 et 7 j/7, sans garantie d'absence d'interruption ou d'erreur. Des opérations de maintenance peuvent entraîner des interruptions, annoncées si possible à l'avance. Les intégrations tierces (Shopify, Stripe, Whop, réseaux sociaux…) sont soumises à leurs propres conditions et nous ne garantissons pas leur disponibilité.",
            `Le support est assuré par e-mail à ${CONTACT}.`,
          ],
        },
        {
          title: "17. Responsabilité",
          paragraphs: [
            "Le Service est fourni en l'état. Notre obligation est une obligation de moyens. Nous ne sommes pas responsables des dommages indirects (perte de chiffre d'affaires, de clientèle, de données ou d'image), ni des actes, contenus ou manquements des Marques, des Créateurs ou des plateformes tierces.",
            "Dans les limites autorisées par la loi, notre responsabilité totale, toutes causes confondues, est limitée au montant effectivement payé par le Client au titre du Service au cours des douze (12) mois précédant le fait générateur. Ces limites ne s'appliquent pas en cas de faute lourde ou dolosive.",
          ],
        },
        {
          title: "18. Suspension et résiliation par Trackit",
          paragraphs: [
            "Nous pouvons suspendre ou fermer un compte en cas de manquement aux présentes Conditions, de défaut de paiement, d'usage frauduleux ou présentant un risque pour le Service, les Utilisateurs ou des tiers, ou sur demande d'une autorité. Sauf urgence ou manquement grave, la suspension est précédée d'une notification vous laissant un délai raisonnable pour y remédier.",
            "En cas de résiliation pour manquement grave, aucune somme n'est remboursée. En cas de fermeture du Service sans manquement de votre part, la part prépayée de la période non consommée vous est remboursée.",
          ],
        },
        {
          title: "19. Force majeure",
          paragraphs: [
            "Aucune partie n'est responsable d'un manquement causé par un événement de force majeure au sens de l'article 1218 du Code civil, y compris la défaillance d'un hébergeur ou d'un prestataire essentiel indépendante de notre volonté.",
          ],
        },
        {
          title: "20. Modifications des Conditions",
          paragraphs: [
            "Nous pouvons modifier ces Conditions. Les modifications importantes sont notifiées par e-mail ou dans le Service au moins 30 jours avant leur entrée en vigueur. Si vous les refusez, vous pouvez résilier avant cette date ; la poursuite de l'utilisation vaut acceptation.",
          ],
        },
        {
          title: "21. Droit applicable et litiges",
          paragraphs: [
            "Les présentes Conditions sont régies par le droit français. Les parties rechercheront une solution amiable avant toute action. À défaut, tout litige relatif à leur formation, leur exécution ou leur interprétation relève de la compétence exclusive des tribunaux de Paris, y compris en cas de pluralité de défendeurs ou d'appel en garantie.",
          ],
        },
      ],
    };
  }

  return {
    title: "Terms of Service",
    lastUpdatedLabel: "Last updated",
    lastUpdated: LAST_UPDATED,
    intro:
      "These terms of use and sale (the \"Terms\") govern access to and use of Trackit (thentrack.it), a SaaS platform for creator marketing and affiliate programs for e-commerce brands, and the purchase of paid subscriptions. The service is for business use only. By creating an account, using the service, or subscribing to a plan, you agree to these Terms.",
    sections: [
      {
        title: "1. Who we are",
        paragraphs: [
          `Trackit ("Trackit", "we", "us") is operated by ${LEGAL_ENTITY.name}. Full company details are in the legal notice. Questions: ${CONTACT}.`,
        ],
        links: [linkFor("en", "legal")],
      },
      {
        title: "2. Definitions",
        paragraphs: [],
        list: [
          "\"Service\": the Trackit platform, website, web app, creator app, and their features.",
          "\"Customer\" or \"Brand\": the company or professional that uses the Service to run creator programs and, where applicable, buys a Subscription.",
          "\"Creator\": a person who produces content and works with a Brand (gifting, affiliate, sponsored content) through the Service.",
          "\"User\": anyone with a Trackit account, Brand or Creator.",
          "\"Subscription\": the paid plan purchased by the Customer (Growth, Pro, Scale, or any other plan offered).",
        ],
      },
      {
        title: "3. Access and accounts",
        paragraphs: [
          "The Service is intended solely for professionals acting for business purposes: Brands, agencies, and Creators carrying out commercial influencer activity. You must be at least 18 and able to enter a binding contract; if you act for a company, you confirm you are authorized to bind it.",
          "You agree to provide accurate, up-to-date information and to keep your credentials confidential. You are responsible for all activity under your account, including by your team members.",
        ],
      },
      {
        title: "4. The service",
        paragraphs: [
          "Trackit lets Brands discover Creators, run gifting and affiliate campaigns, generate tracking links and codes, track attributed sales (including via Shopify), and calculate and pay commissions. Creators can receive offers and follow their collaborations and earnings.",
          "Features evolve over time and some depend on your plan. We may change or remove features, but will not remove an essential feature of an active Subscription without telling you in advance.",
        ],
      },
      {
        title: "5. Plans and prices",
        paragraphs: [
          "Trackit offers a free plan (Free) and paid Subscriptions (including Growth, Pro, and Scale). The content, limits, and price of each plan are those shown on the Pricing page at the time of purchase; that page prevails.",
          "Prices are shown excluding taxes, in US dollars or euros depending on your region. Applicable taxes (including VAT or sales tax) are added based on your situation and shown at checkout.",
          "We may change our prices. Any increase affecting an active Subscription is notified at least 30 days in advance and applies only from the next renewal; you may cancel before it takes effect.",
        ],
        links: [pricingLink("en")],
      },
      {
        title: "6. Ordering, payment, and invoicing",
        paragraphs: [
          "Subscriptions are purchased online in the Service. Payments are processed by our payment providers, Whop and Stripe, under their own terms; Trackit never has access to your full card number. Fees are payable in advance at the start of each billing period and charged automatically to the payment method on file.",
          "Invoices are issued electronically and available from your billing area or the payment provider's portal.",
          "If a payment fails, we may, after a reminder that goes unanswered, suspend paid features or move the account to the free plan. Where French law applies, overdue amounts bear late-payment interest at three times the French legal interest rate plus a fixed collection fee of €40 (article L. 441-10 of the French Commercial Code).",
        ],
      },
      {
        title: "7. Term, renewal, and plan changes",
        paragraphs: [
          "Subscriptions are monthly or annual, as chosen at checkout. They renew automatically for the same term at each renewal date unless cancelled before it.",
          "Upgrades take effect immediately and are prorated by the payment provider. Downgrades take effect at the end of the current billing period.",
        ],
      },
      {
        title: "8. Cancellation by the Customer",
        paragraphs: [
          "You may cancel your Subscription at any time from billing settings or by emailing us. Cancellation takes effect at the end of the current billing period: paid features remain available until then, after which the account moves to the free plan.",
          "Any billing period that has started is due. Except where required by law or in case of our own breach, fees paid are non-refundable, including for an annual Subscription cancelled mid-term.",
          "You may delete your account from settings or on request. Please export any data you need beforehand.",
        ],
      },
      {
        title: "9. No right of withdrawal",
        paragraphs: [
          "Because the Service is purchased by professionals for business purposes, the statutory right of withdrawal available to consumers (such as the 14-day EU withdrawal right) does not apply.",
        ],
      },
      {
        title: "10. Relationship between Brands and Creators",
        paragraphs: [
          "Trackit is a technical tool for connecting, managing, and tracking. Trackit is not a party to agreements between Brands and Creators, does not act as agent for either party, and does not guarantee the results of any collaboration or the conduct of any User.",
          "The Brand is solely responsible for:",
        ],
        list: [
          "setting the terms of each collaboration (commission rates and rules, duration, gifted products, deliverables) and communicating them clearly to the Creator;",
          "shipping gifted products, their compliance and safety, and shipping costs;",
          "paying the commissions owed to Creators, which are borne exclusively by the Brand, on the agreed schedule;",
          "complying with advertising and commercial-practice rules, including influencer marketing laws (such as French law no. 2023-451 of June 9, 2023, and the FTC Endorsement Guides in the US).",
        ],
      },
      {
        title: "11. Creator commitments",
        paragraphs: ["Creators are solely responsible for their content and posts. In particular, they agree to:"],
        list: [
          "clearly disclose the commercial nature of their content (\"Ad\", \"Paid partnership\", or any disclosure required by law and platforms);",
          "not promote prohibited or regulated products unlawfully, and not make misleading claims;",
          "comply with social platforms' terms and third parties' rights;",
          "report their income and meet their tax and social obligations on commissions and products received.",
        ],
      },
      {
        title: "12. Sales tracking and commissions",
        paragraphs: [
          "Attributed sales and commissions are calculated from the tracking data available (links, discount codes, store data). This data may be incomplete or delayed (ad blockers, cleared cookies, returns, cancellations, integration outages). It is provided for information; the Brand remains responsible for approving commissions and the amount finally paid.",
          "When Creator payouts are executed through an integrated payment provider (for example Stripe Connect), they are subject to that provider's terms. Commission disputes are settled between the Brand and the Creator; on request, we can share the tracking data available.",
        ],
      },
      {
        title: "13. Acceptable use",
        list: [
          "Do not use Trackit for unlawful, fraudulent, or misleading purposes (fake sales, self-attributed commissions, tracking manipulation, etc.).",
          "Do not harass Creators or send unsolicited messages that violate laws or third-party platform rules.",
          "Do not attempt unauthorized access to our systems or other Users' data, or disrupt the Service.",
          "Do not resell, scrape, or bulk reproduce data from the Service without permission.",
        ],
        paragraphs: [],
      },
      {
        title: "14. Data and content",
        paragraphs: [
          "You keep ownership of your content and data. You grant us a non-exclusive license, for as long as you use the Service, to host, process, and display it solely to provide the Service.",
          "For personal data you import or process through the Service (Creators, your store's customers), you act as controller and Trackit as processor, as described in the Privacy Policy.",
        ],
        links: [linkFor("en", "privacy")],
      },
      {
        title: "15. Intellectual property",
        paragraphs: [
          "Trackit, its brand, interface, databases, and software remain our exclusive property or that of our licensors. A Subscription grants you a personal, non-exclusive, non-transferable right to use the Service for its term.",
        ],
      },
      {
        title: "16. Availability and support",
        paragraphs: [
          "We aim to keep the Service available 24/7 but do not guarantee uninterrupted or error-free operation. Maintenance may cause interruptions, announced in advance where possible. Third-party integrations (Shopify, Stripe, Whop, social platforms, etc.) are subject to their own terms and we do not guarantee their availability.",
          `Support is provided by email at ${CONTACT}.`,
        ],
      },
      {
        title: "17. Liability",
        paragraphs: [
          "The Service is provided \"as is\" and we act on a best-efforts basis. We are not liable for indirect losses (lost revenue, customers, data, or goodwill), nor for the acts, content, or failures of Brands, Creators, or third-party platforms.",
          "To the maximum extent permitted by law, our total liability for all claims is limited to the amount actually paid by the Customer for the Service in the twelve (12) months before the event giving rise to the claim. These limits do not apply in case of gross negligence or willful misconduct.",
        ],
      },
      {
        title: "18. Suspension and termination by Trackit",
        paragraphs: [
          "We may suspend or close an account for breach of these Terms, non-payment, fraudulent use or use that puts the Service, Users, or third parties at risk, or at the request of an authority. Except in urgent cases or serious breach, we notify you first and give you a reasonable time to fix the issue.",
          "If we terminate for serious breach, no refund is due. If we shut down the Service without any breach on your part, we refund the prepaid, unused part of the current period.",
        ],
      },
      {
        title: "19. Force majeure",
        paragraphs: [
          "Neither party is liable for a failure caused by force majeure (article 1218 of the French Civil Code), including the failure of a host or essential provider beyond our control.",
        ],
      },
      {
        title: "20. Changes to these Terms",
        paragraphs: [
          "We may update these Terms. Material changes are notified by email or in-product at least 30 days before they take effect. If you disagree, you may cancel before that date; continued use constitutes acceptance.",
        ],
      },
      {
        title: "21. Governing law and disputes",
        paragraphs: [
          "These Terms are governed by French law. The parties will first seek an amicable solution. Failing that, any dispute relating to their formation, performance, or interpretation falls under the exclusive jurisdiction of the courts of Paris, France, including in case of multiple defendants or third-party claims.",
        ],
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Privacy policy                                                      */
/* ------------------------------------------------------------------ */

export function getPrivacyContent(lang: AppLang): LegalDocument {
  if (lang === "fr") {
    return {
      title: "Politique de confidentialité",
      lastUpdatedLabel: "Dernière mise à jour",
      lastUpdated: LAST_UPDATED_FR,
      intro:
        "Cette politique explique quelles données Trackit collecte, comment nous les utilisons et quels sont vos droits. Elle s'applique au site thentrack.it et à l'application Trackit.",
      sections: [
        {
          title: "1. Responsable du traitement",
          paragraphs: [
            `${LEGAL_ENTITY.name} est responsable du traitement des données décrites ci-dessous. Contact : ${CONTACT}.`,
          ],
        },
        {
          title: "2. Données que nous collectons",
          list: [
            "Compte : nom, e-mail, mot de passe (hashé), préférences de langue et paramètres.",
            "Profil marque : nom de boutique, URL Shopify, secteur, avatar.",
            "Usage produit : créateurs sauvegardés, campagnes, messages, ventes et commissions.",
            "Paiements : identifiants client Whop ou Stripe, statut d'abonnement, factures (nous ne stockons pas les numéros de carte complets).",
            "Technique : adresse IP, type de navigateur, journaux d'erreur, cookies essentiels et, avec votre accord, cookies de mesure d'audience.",
          ],
          paragraphs: [],
        },
        {
          title: "3. Finalités et bases légales",
          paragraphs: [
            "Nous traitons vos données pour fournir et améliorer le service, gérer la facturation, sécuriser la plateforme, répondre au support et respecter nos obligations légales.",
            "Les bases légales incluent l'exécution du contrat (fourniture du service), nos intérêts légitimes (sécurité, amélioration produit) et, le cas échéant, votre consentement (cookies non essentiels).",
          ],
        },
        {
          title: "4. Partage avec des tiers",
          paragraphs: ["Nous faisons appel à des sous-traitants de confiance, notamment :"],
          list: [
            "Supabase — hébergement base de données et authentification.",
            "Whop et Stripe — paiements et abonnements.",
            "Shopify — connexion boutique et suivi des ventes (si activée).",
            "Vercel — hébergement du site et statistiques de fréquentation sans cookie (Vercel Analytics).",
            "Microsoft (Clarity) — mesure d'audience et enregistrement anonymisé des sessions, uniquement si vous l'acceptez.",
            "Fournisseurs d'e-mail, le cas échéant.",
          ],
        },
        {
          title: "5. Données créateurs",
          paragraphs: [
            "Les informations sur les créateurs (profils publics, métriques, handles) proviennent de sources publiques ou de services tiers et sont utilisées pour vous permettre de les rechercher et les contacter dans le cadre du service. Vous devez utiliser ces données conformément aux lois applicables et aux conditions des plateformes concernées.",
          ],
        },
        {
          title: "6. Durée de conservation",
          paragraphs: [
            "Nous conservons les données de compte tant que votre compte est actif, puis pendant la durée nécessaire aux obligations légales, litiges ou sauvegardes de sécurité (généralement jusqu'à 3 ans après suppression, sauf obligation contraire).",
          ],
        },
        {
          title: "7. Sécurité",
          paragraphs: [
            "Nous mettons en œuvre des mesures techniques et organisationnelles raisonnables (chiffrement en transit, accès restreint, sauvegardes). Aucune méthode n'étant infaillible, nous ne pouvons garantir une sécurité absolue.",
          ],
        },
        {
          title: "8. Vos droits (RGPD)",
          list: [
            "Accès, rectification, effacement.",
            "Limitation ou opposition au traitement.",
            "Portabilité des données que vous nous avez fournies.",
            "Retrait du consentement lorsque le traitement est fondé sur celui-ci.",
            "Réclamation auprès de la CNIL (cnil.fr).",
          ],
          paragraphs: [`Pour exercer vos droits, écrivez à ${CONTACT}. Nous répondrons dans un délai d'un mois.`],
        },
        {
          title: "9. Cookies",
          paragraphs: [
            "Nous utilisons des cookies et traceurs strictement nécessaires au fonctionnement du site et, uniquement avec votre consentement, des cookies de mesure d'audience (Microsoft Clarity). Vous pouvez modifier votre choix à tout moment. Le détail figure dans notre politique cookies.",
          ],
          links: [linkFor("fr", "cookies")],
          manageCookies: true,
        },
        {
          title: "10. Transferts internationaux",
          paragraphs: [
            "Certains prestataires peuvent traiter des données en dehors de l'Espace économique européen, notamment aux États-Unis. Lorsque c'est le cas, nous nous appuyons sur des garanties appropriées (Data Privacy Framework UE–États-Unis, clauses contractuelles types ou équivalent).",
          ],
        },
        {
          title: "11. Modifications",
          paragraphs: [
            "Nous pouvons mettre à jour cette politique. La date en tête de page sera révisée et, en cas de changement important, nous vous en informerons.",
          ],
        },
      ],
    };
  }

  return {
    title: "Privacy Policy",
    lastUpdatedLabel: "Last updated",
    lastUpdated: LAST_UPDATED,
    intro:
      "This policy explains what data Trackit collects, how we use it, and your rights. It applies to thentrack.it and the Trackit application.",
    sections: [
      {
        title: "1. Data controller",
        paragraphs: [`${LEGAL_ENTITY.name} is the controller for the processing described below. Contact: ${CONTACT}.`],
      },
      {
        title: "2. Data we collect",
        list: [
          "Account: name, email, password (hashed), language preferences, settings.",
          "Brand profile: store name, Shopify URL, niche, avatar.",
          "Product usage: saved creators, campaigns, messages, sales, and commissions.",
          "Billing: Whop or Stripe customer IDs, subscription status, invoices (we do not store full card numbers).",
          "Technical: IP address, browser type, error logs, essential cookies and, with your consent, audience measurement cookies.",
        ],
        paragraphs: [],
      },
      {
        title: "3. Purposes and legal bases",
        paragraphs: [
          "We process data to provide and improve the service, manage billing, secure the platform, respond to support, and comply with legal obligations.",
          "Legal bases include contract performance, legitimate interests (security, product improvement), and, where applicable, your consent (non-essential cookies).",
        ],
      },
      {
        title: "4. Sharing with third parties",
        paragraphs: ["We use trusted processors, including:"],
        list: [
          "Supabase — database hosting and authentication.",
          "Whop and Stripe — payments and subscriptions.",
          "Shopify — store connection and sales tracking (when enabled).",
          "Vercel — website hosting and cookieless traffic statistics (Vercel Analytics).",
          "Microsoft (Clarity) — audience measurement and anonymized session recordings, only if you accept them.",
          "Email providers where applicable.",
        ],
      },
      {
        title: "5. Creator data",
        paragraphs: [
          "Creator information (public profiles, metrics, handles) comes from public sources or third-party services and is used so you can search and contact creators through the product. You must use this data in compliance with applicable laws and platform terms.",
        ],
      },
      {
        title: "6. Retention",
        paragraphs: [
          "We keep account data while your account is active, then as long as needed for legal obligations, disputes, or security backups (typically up to 3 years after deletion unless a longer period is required).",
        ],
      },
      {
        title: "7. Security",
        paragraphs: [
          "We implement reasonable technical and organizational measures (encryption in transit, restricted access, backups). No method is perfectly secure; we cannot guarantee absolute security.",
        ],
      },
      {
        title: "8. Your rights (GDPR)",
        list: [
          "Access, rectification, erasure.",
          "Restriction or objection to processing.",
          "Data portability for information you provided.",
          "Withdraw consent where processing is consent-based.",
          "Lodge a complaint with your supervisory authority (e.g. CNIL in France).",
        ],
        paragraphs: [`To exercise your rights, email ${CONTACT}. We respond within one month.`],
      },
      {
        title: "9. Cookies",
        paragraphs: [
          "We use cookies and similar technologies that are strictly necessary for the site to work and, only with your consent, audience measurement cookies (Microsoft Clarity). You can change your choice at any time. Details are in our cookie policy.",
        ],
        links: [linkFor("en", "cookies")],
        manageCookies: true,
      },
      {
        title: "10. International transfers",
        paragraphs: [
          "Some providers may process data outside the European Economic Area, including in the United States. Where this occurs, we rely on appropriate safeguards (EU–US Data Privacy Framework, standard contractual clauses, or equivalent).",
        ],
      },
      {
        title: "11. Changes",
        paragraphs: [
          "We may update this policy. The date at the top will be revised and, for material changes, we will notify you.",
        ],
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Legal notice (mentions légales)                                     */
/* ------------------------------------------------------------------ */

function publisherLines(entity: LegalEntity, lang: AppLang): string[] {
  const fr = lang === "fr";
  const registration = [entity.registry, entity.registrationNumber].filter(Boolean).join(" — ");
  const rows: [string, string | null][] = [
    [fr ? "Dénomination" : "Company name", entity.name],
    [fr ? "Forme juridique" : "Legal form", entity.legalForm],
    [fr ? "Capital social" : "Share capital", entity.shareCapital],
    [fr ? "Siège social" : "Registered office", entity.registeredAddress],
    [fr ? "Immatriculation" : "Registration", registration || null],
    [fr ? "N° de TVA intracommunautaire" : "VAT number", entity.vatNumber],
    [fr ? "E-mail" : "Email", entity.email],
    [fr ? "Téléphone" : "Phone", entity.phone],
    [fr ? "Site" : "Website", entity.website.replace(/^https?:\/\//, "")],
  ];
  return rows
    .filter(([, value]) => value != null && value !== "")
    .map(([label, value]) => `${label}${fr ? " : " : ": "}${value}`);
}

export function getLegalNoticeContent(lang: AppLang, entity: LegalEntity = LEGAL_ENTITY): LegalDocument {
  if (lang === "fr") {
    return {
      title: "Mentions légales",
      lastUpdatedLabel: "Dernière mise à jour",
      lastUpdated: LAST_UPDATED_FR,
      intro:
        "Conformément à l'article 6 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN), voici les informations relatives à l'éditeur et à l'hébergeur du site thentrack.it et de l'application Trackit.",
      sections: [
        {
          title: "1. Éditeur du site",
          paragraphs: [],
          list: publisherLines(entity, "fr"),
        },
        {
          title: "2. Directeur de la publication",
          paragraphs: [
            entity.publicationDirector
              ? `Le directeur de la publication est ${entity.publicationDirector}, joignable à ${entity.email}.`
              : `Le directeur de la publication est le représentant légal de ${entity.name}, joignable à ${entity.email}.`,
          ],
        },
        {
          title: "3. Contact",
          paragraphs: [
            `Pour toute question, demande ou réclamation, ainsi que pour signaler un contenu illicite présent sur le site ou le service, écrivez-nous à ${entity.email}.`,
          ],
        },
        {
          title: "4. Hébergement",
          paragraphs: [
            `Le site est hébergé par ${LEGAL_HOST.name}, ${LEGAL_HOST.address} (${LEGAL_HOST.website.replace(/^https?:\/\//, "")}).`,
            "Les données de l'application (base de données et authentification) sont hébergées par Supabase Inc. (supabase.com).",
          ],
        },
        {
          title: "5. Propriété intellectuelle",
          paragraphs: [
            `L'ensemble des éléments du site et du service (marque Trackit, logo, textes, interfaces, graphismes, code, bases de données) est la propriété exclusive de ${entity.name} ou de ses concédants et est protégé par le droit de la propriété intellectuelle. Toute reproduction, représentation, adaptation ou extraction, totale ou partielle, sans autorisation écrite préalable est interdite.`,
            "Les marques et logos de tiers affichés sur le site (Shopify, TikTok, Instagram, Stripe, etc.) appartiennent à leurs titulaires respectifs et ne sont utilisés que pour désigner les services compatibles.",
          ],
        },
        {
          title: "6. Données personnelles",
          paragraphs: [
            "Le traitement de vos données personnelles et vos droits (accès, rectification, effacement, opposition, portabilité) sont décrits dans notre politique de confidentialité.",
          ],
          links: [linkFor("fr", "privacy")],
        },
        {
          title: "7. Cookies",
          paragraphs: [
            "Le site utilise des traceurs strictement nécessaires et, uniquement avec votre accord, des cookies de mesure d'audience. Vous pouvez modifier votre choix à tout moment.",
          ],
          links: [linkFor("fr", "cookies")],
          manageCookies: true,
        },
        {
          title: "8. Crédits",
          paragraphs: [],
          list: [
            "Photographies : Unsplash (unsplash.com), utilisées selon la licence Unsplash.",
            "Vidéos : Mixkit (mixkit.co), utilisées selon la licence Mixkit.",
            `Conception et développement : ${entity.name}.`,
          ],
        },
      ],
    };
  }

  return {
    title: "Legal notice",
    lastUpdatedLabel: "Last updated",
    lastUpdated: LAST_UPDATED,
    intro:
      "Information about the publisher and host of thentrack.it and the Trackit application, as required by French law (article 6 of law no. 2004-575 of June 21, 2004, \"LCEN\").",
    sections: [
      {
        title: "1. Publisher",
        paragraphs: [],
        list: publisherLines(entity, "en"),
      },
      {
        title: "2. Publication director",
        paragraphs: [
          entity.publicationDirector
            ? `The publication director is ${entity.publicationDirector}, reachable at ${entity.email}.`
            : `The publication director is the legal representative of ${entity.name}, reachable at ${entity.email}.`,
        ],
      },
      {
        title: "3. Contact",
        paragraphs: [
          `For any question, request, or complaint, or to report unlawful content on the site or service, email us at ${entity.email}.`,
        ],
      },
      {
        title: "4. Hosting",
        paragraphs: [
          `The site is hosted by ${LEGAL_HOST.name}, ${LEGAL_HOST.address} (${LEGAL_HOST.website.replace(/^https?:\/\//, "")}).`,
          "Application data (database and authentication) is hosted by Supabase Inc. (supabase.com).",
        ],
      },
      {
        title: "5. Intellectual property",
        paragraphs: [
          `All elements of the site and service (Trackit brand, logo, text, interfaces, graphics, code, databases) are the exclusive property of ${entity.name} or its licensors and are protected by intellectual property law. Any reproduction, representation, adaptation, or extraction, in whole or in part, without prior written permission is prohibited.`,
          "Third-party trademarks and logos shown on the site (Shopify, TikTok, Instagram, Stripe, etc.) belong to their respective owners and are used only to identify compatible services.",
        ],
      },
      {
        title: "6. Personal data",
        paragraphs: [
          "How we process your personal data and your rights (access, rectification, erasure, objection, portability) are described in our Privacy Policy.",
        ],
        links: [linkFor("en", "privacy")],
      },
      {
        title: "7. Cookies",
        paragraphs: [
          "The site uses strictly necessary technologies and, only with your consent, audience measurement cookies. You can change your choice at any time.",
        ],
        links: [linkFor("en", "cookies")],
        manageCookies: true,
      },
      {
        title: "8. Credits",
        paragraphs: [],
        list: [
          "Photos: Unsplash (unsplash.com), used under the Unsplash License.",
          "Videos: Mixkit (mixkit.co), used under the Mixkit License.",
          `Design and development: ${entity.name}.`,
        ],
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Cookie policy                                                       */
/* ------------------------------------------------------------------ */

export function getCookiePolicyContent(lang: AppLang): LegalDocument {
  if (lang === "fr") {
    const headers = ["Nom", "Fournisseur", "Finalité", "Durée"];
    return {
      title: "Politique cookies",
      lastUpdatedLabel: "Dernière mise à jour",
      lastUpdated: LAST_UPDATED_FR,
      intro:
        "Cette politique explique quels cookies et traceurs sont utilisés sur thentrack.it et dans l'application Trackit, à quoi ils servent, combien de temps ils sont conservés et comment accepter, refuser ou retirer votre consentement à tout moment.",
      sections: [
        {
          title: "1. Qu'est-ce qu'un cookie ?",
          paragraphs: [
            "Un cookie est un petit fichier déposé sur votre appareil lorsque vous consultez un site. Nous utilisons aussi le stockage local du navigateur (localStorage), qui fonctionne de façon similaire. Ces deux techniques sont appelées ici « traceurs ».",
            "Les traceurs strictement nécessaires au fonctionnement du site sont exemptés de consentement. Les autres, notamment de mesure d'audience, ne sont déposés qu'avec votre accord.",
          ],
        },
        {
          title: "2. Traceurs strictement nécessaires",
          paragraphs: [
            "Ils permettent au site de fonctionner et ne peuvent pas être désactivés depuis notre bandeau. Ils ne servent pas à vous suivre sur d'autres sites.",
          ],
          table: {
            headers,
            rows: [
              ["sb-…-auth-token (cookie, parfois découpé en .0, .1)", "Trackit (Supabase)", "Maintenir votre session connectée et sécuriser l'accès à votre compte", "Jusqu'à la déconnexion, 400 jours maximum"],
              ["shopify_state, stripe_connect_state (cookies)", "Trackit", "Sécuriser la connexion de votre boutique Shopify ou de votre compte Stripe (protection anti-falsification)", "10 minutes"],
              ["trackit_lang (localStorage)", "Trackit", "Mémoriser votre préférence de langue", "Jusqu'à suppression par vous"],
              ["trackit_cookie_consent (localStorage)", "Trackit", "Mémoriser votre choix sur les cookies", "6 mois"],
              ["Autres préférences d'interface (localStorage, préfixe trackit_)", "Trackit", "Mémoriser vos réglages d'affichage (thème, filtres…)", "Jusqu'à suppression par vous"],
            ],
          },
        },
        {
          title: "3. Mesure d'audience soumise à votre consentement",
          paragraphs: [
            "Avec votre accord, nous utilisons Microsoft Clarity, édité par Microsoft Corporation, pour comprendre comment le site est utilisé (pages vues, clics, défilement, enregistrements de sessions dont les saisies sensibles sont masquées) et l'améliorer. Le script Clarity n'est chargé qu'après que vous avez cliqué sur « Tout accepter ». Les données peuvent être traitées aux États-Unis ; Microsoft adhère au Data Privacy Framework UE–États-Unis.",
          ],
          table: {
            headers,
            rows: [
              ["_clck", "Microsoft Clarity", "Identifiant anonyme de visiteur, pour relier les visites d'un même navigateur", "1 an"],
              ["_clsk", "Microsoft Clarity", "Regrouper les pages vues d'une même session", "1 jour"],
              ["CLID", "Microsoft Clarity (clarity.ms)", "Identifier le navigateur lors des visites de sites utilisant Clarity", "1 an"],
              ["MUID", "Microsoft (bing.com)", "Identifier le navigateur auprès des services Microsoft", "1 an"],
              ["ANONCHK, SM, MR", "Microsoft (clarity.ms / bing.com)", "Cookies techniques de Clarity (vérification, session, rafraîchissement de MUID)", "De la session à 7 jours"],
            ],
          },
        },
        {
          title: "4. Statistiques sans cookie",
          paragraphs: [
            "Nous utilisons Vercel Analytics pour des statistiques de fréquentation agrégées (pages vues, pays, type d'appareil). Cet outil ne dépose aucun cookie et n'enregistre aucun identifiant sur votre appareil ; il ne nécessite donc pas votre consentement.",
          ],
        },
        {
          title: "5. Services tiers",
          paragraphs: [
            "Lorsque vous payez un abonnement, vous êtes redirigé vers les pages de paiement de Whop ou de Stripe, qui peuvent déposer leurs propres cookies (sécurité, prévention de la fraude) sur leurs domaines. Ces cookies sont régis par les politiques de ces prestataires.",
          ],
        },
        {
          title: "6. Vos choix et le retrait de votre consentement",
          paragraphs: [
            "Lors de votre première visite, un bandeau vous propose de « Tout accepter » ou de « Tout refuser », avec la même facilité. Refuser n'a aucune conséquence sur votre accès au site et au service.",
            "Votre choix est conservé 6 mois, puis vous est redemandé. Vous pouvez le modifier ou retirer votre consentement à tout moment, aussi simplement que vous l'avez donné, via le lien « Gérer les cookies » en bas de page ou le bouton ci-dessous. En cas de retrait, Clarity cesse d'être chargé et ses cookies déposés sur thentrack.it sont supprimés.",
            "Vous pouvez aussi bloquer ou supprimer les cookies depuis les réglages de votre navigateur ; bloquer les cookies strictement nécessaires peut empêcher la connexion à votre compte.",
          ],
          manageCookies: true,
        },
        {
          title: "7. Contact",
          paragraphs: [
            `Pour toute question sur les cookies ou vos données personnelles, écrivez à ${CONTACT}. Vous pouvez aussi introduire une réclamation auprès de la CNIL (cnil.fr).`,
          ],
          links: [linkFor("fr", "privacy")],
        },
      ],
    };
  }

  const headers = ["Name", "Provider", "Purpose", "Duration"];
  return {
    title: "Cookie Policy",
    lastUpdatedLabel: "Last updated",
    lastUpdated: LAST_UPDATED,
    intro:
      "This policy explains which cookies and similar technologies are used on thentrack.it and in the Trackit app, what they are for, how long they last, and how to accept, reject, or withdraw your consent at any time.",
    sections: [
      {
        title: "1. What is a cookie?",
        paragraphs: [
          "A cookie is a small file stored on your device when you visit a site. We also use the browser's local storage (localStorage), which works in a similar way. Both are called \"trackers\" here.",
          "Trackers that are strictly necessary for the site to work do not require consent. Others, including audience measurement, are only set with your agreement.",
        ],
      },
      {
        title: "2. Strictly necessary trackers",
        paragraphs: [
          "They make the site work and cannot be turned off from our banner. They are not used to follow you across other sites.",
        ],
        table: {
          headers,
          rows: [
            ["sb-…-auth-token (cookie, sometimes split into .0, .1)", "Trackit (Supabase)", "Keep you signed in and secure access to your account", "Until sign-out, 400 days maximum"],
            ["shopify_state, stripe_connect_state (cookies)", "Trackit", "Secure the connection of your Shopify store or Stripe account (anti-forgery protection)", "10 minutes"],
            ["trackit_lang (localStorage)", "Trackit", "Remember your language preference", "Until you delete it"],
            ["trackit_cookie_consent (localStorage)", "Trackit", "Remember your cookie choice", "6 months"],
            ["Other interface preferences (localStorage, trackit_ prefix)", "Trackit", "Remember your display settings (theme, filters, etc.)", "Until you delete them"],
          ],
        },
      },
      {
        title: "3. Audience measurement (requires your consent)",
        paragraphs: [
          "With your consent, we use Microsoft Clarity, provided by Microsoft Corporation, to understand how the site is used (page views, clicks, scrolling, session recordings with sensitive input masked) and improve it. The Clarity script only loads after you click \"Accept all\". Data may be processed in the United States; Microsoft participates in the EU–US Data Privacy Framework.",
        ],
        table: {
          headers,
          rows: [
            ["_clck", "Microsoft Clarity", "Anonymous visitor ID, to link visits from the same browser", "1 year"],
            ["_clsk", "Microsoft Clarity", "Group page views into a single session", "1 day"],
            ["CLID", "Microsoft Clarity (clarity.ms)", "Identify the browser across sites that use Clarity", "1 year"],
            ["MUID", "Microsoft (bing.com)", "Identify the browser for Microsoft services", "1 year"],
            ["ANONCHK, SM, MR", "Microsoft (clarity.ms / bing.com)", "Clarity technical cookies (checks, session, MUID refresh)", "Session to 7 days"],
          ],
        },
      },
      {
        title: "4. Cookieless statistics",
        paragraphs: [
          "We use Vercel Analytics for aggregated traffic statistics (page views, country, device type). It sets no cookies and stores no identifier on your device, so it does not require your consent.",
        ],
      },
      {
        title: "5. Third-party services",
        paragraphs: [
          "When you pay for a subscription, you are redirected to Whop or Stripe checkout pages, which may set their own cookies (security, fraud prevention) on their domains. Those cookies are governed by these providers' policies.",
        ],
      },
      {
        title: "6. Your choices and withdrawing consent",
        paragraphs: [
          "On your first visit, a banner lets you \"Accept all\" or \"Reject all\" with equal ease. Rejecting has no effect on your access to the site and service.",
          "Your choice is kept for 6 months, after which we ask again. You can change it or withdraw your consent at any time, as easily as you gave it, using the \"Manage cookies\" link in the footer or the button below. If you withdraw, Clarity stops loading and its cookies on thentrack.it are deleted.",
          "You can also block or delete cookies in your browser settings; blocking strictly necessary cookies may prevent you from signing in.",
        ],
        manageCookies: true,
      },
      {
        title: "7. Contact",
        paragraphs: [
          `For any question about cookies or your personal data, email ${CONTACT}. You can also lodge a complaint with your data protection authority (CNIL in France).`,
        ],
        links: [linkFor("en", "privacy")],
      },
    ],
  };
}
