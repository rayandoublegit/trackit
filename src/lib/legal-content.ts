export type LegalSection = {
  title: string;
  paragraphs: string[];
  list?: string[];
};

export type LegalDocument = {
  title: string;
  lastUpdatedLabel: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
};

const CONTACT = "hello@thentrack.it";
const LAST_UPDATED = "May 27, 2026";
const LAST_UPDATED_FR = "27 mai 2026";

export function getTermsContent(lang: "en" | "fr"): LegalDocument {
  if (lang === "fr") {
    return {
      title: "Conditions générales d'utilisation",
      lastUpdatedLabel: "Dernière mise à jour",
      lastUpdated: LAST_UPDATED_FR,
      intro:
        "Les présentes conditions régissent l'accès et l'utilisation de Trackit (thentrack.it), une plateforme SaaS d'affiliation et de marketing créateurs pour les marques e-commerce. En créant un compte ou en utilisant le service, vous acceptez ces conditions.",
      sections: [
        {
          title: "1. Qui sommes-nous",
          paragraphs: [
            `Trackit (« nous », « notre ») est édité par Trackit Inc. Pour toute question : ${CONTACT}.`,
          ],
        },
        {
          title: "2. Description du service",
          paragraphs: [
            "Trackit permet aux marques de découvrir des créateurs, gérer des campagnes, suivre les ventes attribuées (notamment via Shopify) et organiser le paiement de commissions. Les fonctionnalités peuvent évoluer ; certaines dépendent de votre formule d'abonnement.",
          ],
        },
        {
          title: "3. Compte et éligibilité",
          paragraphs: [
            "Vous devez avoir au moins 18 ans et la capacité juridique de contracter. Vous vous engagez à fournir des informations exactes et à maintenir la confidentialité de vos identifiants. Vous êtes responsable de toute activité réalisée depuis votre compte.",
          ],
        },
        {
          title: "4. Abonnements et facturation",
          paragraphs: [
            "Les offres payantes sont facturées via Stripe selon les tarifs affichés sur le site au moment de la souscription. Les renouvellements sont automatiques sauf résiliation avant la date d'échéance. Les taxes applicables peuvent s'ajouter selon votre localisation.",
            "Sauf disposition légale impérative, les sommes déjà versées ne sont pas remboursables pour une période entamée. Vous pouvez résilier à tout moment ; l'accès aux fonctionnalités payantes prend fin à la fin de la période en cours.",
          ],
        },
        {
          title: "5. Utilisation acceptable",
          list: [
            "Ne pas utiliser Trackit à des fins illégales, frauduleuses ou trompeuses.",
            "Ne pas harceler des créateurs ni envoyer de messages spam ou non sollicités en violation des lois ou des conditions des plateformes tierces.",
            "Ne pas tenter d'accéder de manière non autorisée à nos systèmes ou aux données d'autres utilisateurs.",
            "Ne pas revendre, scraper ou reproduire massivement les données créateurs sans autorisation.",
          ],
          paragraphs: [
            "Nous pouvons suspendre ou fermer un compte en cas de violation de ces règles ou de risque pour le service ou des tiers.",
          ],
        },
        {
          title: "6. Créateurs, marques et tiers",
          paragraphs: [
            "Trackit facilite la mise en relation et le suivi, mais n'est pas partie aux contrats entre marques et créateurs. Vous restez seul responsable de vos accords commerciaux, de vos messages, de vos campagnes et du respect des réglementations (publicité, consommation, protection des données, etc.).",
            "Les intégrations (Shopify, Stripe, réseaux sociaux, etc.) sont soumises à leurs propres conditions. Nous ne garantissons pas leur disponibilité permanente.",
          ],
        },
        {
          title: "7. Propriété intellectuelle",
          paragraphs: [
            "Trackit, sa marque, son interface et son code restent notre propriété ou celle de nos concédants. Vous conservez vos contenus ; vous nous accordez une licence limitée pour les héberger et les traiter afin de fournir le service.",
          ],
        },
        {
          title: "8. Disponibilité et responsabilité",
          paragraphs: [
            "Le service est fourni « en l'état ». Nous nous efforçons d'assurer une haute disponibilité, sans garantie d'absence d'interruption ou d'erreur.",
            "Dans les limites autorisées par la loi, notre responsabilité totale pour toute réclamation liée au service est limitée au montant que vous nous avez payé au cours des douze (12) mois précédant l'événement. Nous ne sommes pas responsables des pertes indirectes, manque à gagner ou dommages résultant de l'utilisation de créateurs ou de plateformes tierces.",
          ],
        },
        {
          title: "9. Résiliation",
          paragraphs: [
            "Vous pouvez cesser d'utiliser Trackit et supprimer votre compte depuis les paramètres ou en nous contactant. Nous pouvons résilier ou suspendre l'accès en cas de manquement grave ou pour des raisons légaires, avec préavis lorsque la loi l'exige.",
          ],
        },
        {
          title: "10. Droit applicable",
          paragraphs: [
            "Ces conditions sont régies par le droit français. En cas de litige, et à défaut de résolution amiable, les tribunaux compétents de Paris seront seuls compétents, sous réserve des règles impératives applicables aux consommateurs.",
          ],
        },
        {
          title: "11. Modifications",
          paragraphs: [
            "Nous pouvons mettre à jour ces conditions. En cas de changement important, nous vous en informerons par e-mail ou via le produit. La poursuite de l'utilisation après entrée en vigueur vaut acceptation.",
          ],
        },
      ],
    };
  }

  return {
    title: "Terms & Conditions",
    lastUpdatedLabel: "Last updated",
    lastUpdated: LAST_UPDATED,
    intro:
      "These Terms govern access to and use of Trackit (thentrack.it), a SaaS platform for creator marketing and affiliate workflows for e-commerce brands. By creating an account or using the service, you agree to these Terms.",
    sections: [
      {
        title: "1. Who we are",
        paragraphs: [
          `Trackit ("we", "us") is operated by Trackit Inc. Questions: ${CONTACT}.`,
        ],
      },
      {
        title: "2. The service",
        paragraphs: [
          "Trackit helps brands discover creators, manage campaigns, track attributed sales (including via Shopify), and pay commissions. Features may change over time and depend on your subscription plan.",
        ],
      },
      {
        title: "3. Accounts",
        paragraphs: [
          "You must be at least 18 and able to enter a binding contract. You agree to provide accurate information and keep credentials secure. You are responsible for activity under your account.",
        ],
      },
      {
        title: "4. Subscriptions and billing",
        paragraphs: [
          "Paid plans are billed through Stripe at the prices shown on the site at signup. Subscriptions renew automatically unless cancelled before the renewal date. Applicable taxes may apply based on your location.",
          "Except where required by law, fees already paid are non-refundable for the current billing period. You may cancel anytime; paid features remain available until the end of the period.",
        ],
      },
      {
        title: "5. Acceptable use",
        list: [
          "Do not use Trackit for unlawful, fraudulent, or misleading purposes.",
          "Do not spam creators or send unsolicited messages that violate laws or third-party platform rules.",
          "Do not attempt unauthorized access to our systems or other users' data.",
          "Do not resell, scrape, or bulk reproduce creator data without permission.",
        ],
        paragraphs: [
          "We may suspend or terminate accounts that violate these rules or pose risk to the service or third parties.",
        ],
      },
      {
        title: "6. Brands, creators, and third parties",
        paragraphs: [
          "Trackit facilitates discovery and tracking but is not a party to agreements between brands and creators. You remain solely responsible for commercial terms, outreach, campaigns, and compliance with applicable laws (advertising, consumer, privacy, etc.).",
          "Integrations (Shopify, Stripe, social platforms, etc.) are subject to their own terms. We do not guarantee their permanent availability.",
        ],
      },
      {
        title: "7. Intellectual property",
        paragraphs: [
          "Trackit, its brand, interface, and software remain our property or that of our licensors. You retain your content and grant us a limited license to host and process it to provide the service.",
        ],
      },
      {
        title: "8. Availability and liability",
        paragraphs: [
          "The service is provided \"as is.\" We aim for high availability but do not guarantee uninterrupted or error-free operation.",
          "To the maximum extent permitted by law, our total liability for claims relating to the service is limited to fees you paid us in the twelve (12) months before the event. We are not liable for indirect losses, lost profits, or damages arising from creators or third-party platforms.",
        ],
      },
      {
        title: "9. Termination",
        paragraphs: [
          "You may stop using Trackit and delete your account from settings or by contacting us. We may suspend or terminate access for material breach or legal reasons, with notice where required.",
        ],
      },
      {
        title: "10. Governing law",
        paragraphs: [
          "These Terms are governed by French law. Disputes shall be submitted to the courts of Paris, France, subject to mandatory consumer protection rules where applicable.",
        ],
      },
      {
        title: "11. Changes",
        paragraphs: [
          "We may update these Terms. For material changes, we will notify you by email or in-product. Continued use after the effective date constitutes acceptance.",
        ],
      },
    ],
  };
}

export function getPrivacyContent(lang: "en" | "fr"): LegalDocument {
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
            `Trackit Inc. est responsable du traitement des données décrites ci-dessous. Contact : ${CONTACT}.`,
          ],
        },
        {
          title: "2. Données que nous collectons",
          list: [
            "Compte : nom, e-mail, mot de passe (hashé), préférences de langue et paramètres.",
            "Profil marque : nom de boutique, URL Shopify, secteur, avatar.",
            "Usage produit : créateurs sauvegardés, campagnes, messages, ventes et commissions.",
            "Paiements : identifiants Stripe, statut d'abonnement, factures (nous ne stockons pas les numéros de carte complets).",
            "Technique : adresse IP, type de navigateur, journaux d'erreur, cookies essentiels et analytiques.",
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
          paragraphs: [
            "Nous faisons appel à des sous-traitants de confiance, notamment :",
          ],
          list: [
            "Supabase — hébergement base de données et authentification.",
            "Stripe — paiements et abonnements.",
            "Shopify — connexion boutique et suivi des ventes (si activée).",
            "Vercel — hébergement et analytics produit.",
            "Fournisseurs d'e-mail ou d'analyse, le cas échéant.",
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
          paragraphs: [
            `Pour exercer vos droits, écrivez à ${CONTACT}. Nous répondrons dans un délai d'un mois.`,
          ],
        },
        {
          title: "9. Cookies",
          paragraphs: [
            "Nous utilisons des cookies essentiels au fonctionnement du site et, le cas échéant, des cookies analytiques pour comprendre l'usage du produit. Vous pouvez configurer votre navigateur pour refuser les cookies non essentiels.",
          ],
        },
        {
          title: "10. Transferts internationaux",
          paragraphs: [
            "Certains prestataires peuvent traiter des données en dehors de l'Espace économique européen. Lorsque c'est le cas, nous nous appuyons sur des garanties appropriées (clauses contractuelles types ou équivalent).",
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
        paragraphs: [
          `Trackit Inc. is the controller for the processing described below. Contact: ${CONTACT}.`,
        ],
      },
      {
        title: "2. Data we collect",
        list: [
          "Account: name, email, password (hashed), language preferences, settings.",
          "Brand profile: store name, Shopify URL, niche, avatar.",
          "Product usage: saved creators, campaigns, messages, sales, and commissions.",
          "Billing: Stripe customer IDs, subscription status, invoices (we do not store full card numbers).",
          "Technical: IP address, browser type, error logs, essential and analytics cookies.",
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
          "Stripe — payments and subscriptions.",
          "Shopify — store connection and sales tracking (when enabled).",
          "Vercel — hosting and product analytics.",
          "Email or analytics providers where applicable.",
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
        paragraphs: [
          `To exercise your rights, email ${CONTACT}. We respond within one month.`,
        ],
      },
      {
        title: "9. Cookies",
        paragraphs: [
          "We use essential cookies for site operation and, where applicable, analytics cookies to understand product usage. You can configure your browser to refuse non-essential cookies.",
        ],
      },
      {
        title: "10. International transfers",
        paragraphs: [
          "Some providers may process data outside the European Economic Area. Where this occurs, we rely on appropriate safeguards (standard contractual clauses or equivalent).",
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
