"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { canUseDedicatedSupport, canUsePrioritySupport, type PlanTier } from "@/lib/plan-limits";

const SUPPORT_EMAIL = "support@trackit.app";

const btnBlack: React.CSSProperties = {
  background: "#1A1A1A",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const btnSecondary: React.CSSProperties = {
  background: "#FFFFFF",
  color: "#1A1A1A",
  border: "1px solid #E5E5E5",
  borderRadius: 10,
  padding: "10px 16px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const GUIDES = [
  {
    id: "shopify",
    icon: "🔗",
    title: "Connect your Shopify store",
    text: "Link your store in 60 seconds to start tracking creator sales automatically.",
    tag: "5 min read",
  },
  {
    id: "discovery",
    icon: "🔍",
    title: "Find your first creators",
    text: "Learn how to search and filter creators that match your brand perfectly.",
    tag: "3 min read",
  },
  {
    id: "outreach",
    icon: "✉️",
    title: "Send your first outreach",
    text: "Use Trackit AI to generate personalized messages that actually get replies.",
    tag: "4 min read",
  },
  {
    id: "commission",
    icon: "💸",
    title: "Set up commission tracking",
    text: "Automate commission calculation and payouts for every creator partner.",
    tag: "6 min read",
  },
  {
    id: "analytics",
    icon: "📊",
    title: "Read your analytics",
    text: "Understand which creators drive the most revenue and why.",
    tag: "4 min read",
  },
];

type GuideBlock =
  | { type: "intro"; text: string }
  | { type: "section"; title: string; text: string }
  | { type: "step"; number: number; title: string; text: string; tip?: string }
  | { type: "callout"; text: string; variant: "tip" | "pro" | "action" | "troubleshoot" };

const GUIDE_CONTENT: Record<string, { title: string; readTime: string; blocks: GuideBlock[] }> = {
  shopify: {
    title: "Connect your Shopify store",
    readTime: "5 min read",
    blocks: [
      {
        type: "intro",
        text: "Connecting your Shopify store is the foundation of Trackit. Once connected, every sale driven by your creators is tracked automatically — no spreadsheets, no manual work.",
      },
      {
        type: "step",
        number: 1,
        title: "Go to Integrations",
        text: "Navigate to Integrations in the left sidebar. You'll see the Shopify card at the top of the page.",
        tip: "💡 Tip: You can connect multiple Shopify stores on the Pro and Agency plans.",
      },
      {
        type: "step",
        number: 2,
        title: "Enter your store URL",
        text: "Click Connect Shopify. Enter your store URL in the format: yourstore.myshopify.com — do not include https://",
      },
      {
        type: "step",
        number: 3,
        title: "Authorize Trackit",
        text: "You'll be redirected to Shopify to approve the connection. Trackit only requests read access to orders and the ability to create discount codes. We never touch your products or customer data.",
      },
      {
        type: "step",
        number: 4,
        title: "Confirm connection",
        text: "Once authorized you'll be redirected back to Trackit. Your store will show as Connected with a green badge.",
      },
      {
        type: "section",
        title: "What happens next",
        text: "Trackit will now listen for new orders. When a customer checks out using a creator's discount code or referral link, the sale appears in your Payouts dashboard in real time.",
      },
      {
        type: "callout",
        variant: "troubleshoot",
        text: "Store not connecting? Make sure you're using the .myshopify.com format, not your custom domain. Still stuck? Chat with us.",
      },
    ],
  },
  discovery: {
    title: "Find your first creators",
    readTime: "3 min read",
    blocks: [
      {
        type: "intro",
        text: "Discovery is where you find creators whose audience perfectly matches your customers. The goal is not the biggest creators — it's the right creators.",
      },
      {
        type: "section",
        title: "What makes a good creator match",
        text: "Three things matter more than follower count: engagement rate above 3%, audience demographics that match your ICP, and content style that fits your brand naturally.",
      },
      { type: "step", number: 1, title: "Open Discovery", text: "Click Discovery in the left sidebar. You'll see the search bar and filters." },
      {
        type: "step",
        number: 2,
        title: "Choose your platform",
        text: "Start with TikTok for ecommerce brands. TikTok drives the highest purchase intent of any platform right now. Instagram is better for lifestyle and beauty. YouTube for high-ticket products that need explanation.",
      },
      {
        type: "step",
        number: 3,
        title: "Enter your niche",
        text: "Be specific. Don't search 'fashion' — search 'sustainable fashion France' or 'streetwear Paris'. Specific niches return creators whose audience is genuinely interested in what you sell.",
      },
      {
        type: "step",
        number: 4,
        title: "Filter by engagement",
        text: "Set minimum engagement rate to 3%. Ignore follower count for now. A creator with 10K followers and 8% engagement will drive more sales than one with 500K followers and 0.5% engagement.",
      },
      {
        type: "step",
        number: 5,
        title: "Save your best finds",
        text: "Click Save creator on any card to add them to your saved list. Build a shortlist of 10-20 before you start outreach.",
      },
      {
        type: "callout",
        variant: "pro",
        text: "💡 The best creators are often between 10K-100K followers. They're affordable, have highly engaged audiences, and are more likely to respond to outreach from smaller brands.",
      },
    ],
  },
  outreach: {
    title: "Send your first outreach",
    readTime: "4 min read",
    blocks: [
      {
        type: "intro",
        text: "Most creator outreach fails because it's generic. Trackit AI reads the creator's profile and writes a message that feels personal — because it is.",
      },
      {
        type: "section",
        title: "Why generic messages don't work",
        text: "Creators get hundreds of DMs every week. 'Hey I love your content, want to collab?' gets ignored every time. The messages that get replies are specific, short, and lead with value not ask.",
      },
      {
        type: "step", number: 1, title: "Select a creator", text: "Go to your saved creators or click Generate outreach on any creator card in Discovery.",
      },
      {
        type: "step",
        number: 2,
        title: "Describe your brand",
        text: "Enter what you sell in one sentence. Be specific: 'sustainable activewear for women in France' not just 'clothing brand'.",
      },
      {
        type: "step",
        number: 3,
        title: "Choose your tone",
        text: "Casual works best for TikTok creators under 100K followers. Professional for YouTube creators. Match the energy of their content.",
      },
      {
        type: "step",
        number: 4,
        title: "Generate and review",
        text: "Click Generate. Read the message carefully. Edit anything that doesn't sound like you. Add a specific reference to one of their recent posts for best results.",
      },
      {
        type: "step",
        number: 5,
        title: "Send and track",
        text: "Copy the message. Send it on the platform. Come back to Outreach and mark it as sent. Trackit will remind you to follow up in 3 days.",
      },
      {
        type: "callout",
        variant: "tip",
        text: "💡 Average response rate for cold creator outreach is 5-10%. With personalized messages it jumps to 20-30%. Don't get discouraged — volume and quality both matter.",
      },
    ],
  },
  commission: {
    title: "Set up commission tracking",
    readTime: "6 min read",
    blocks: [
      {
        type: "intro",
        text: "Commission tracking is what separates Trackit from every other creator tool. Instead of manually checking who sold what, every sale is attributed automatically the moment it happens.",
      },
      {
        type: "section",
        title: "How it works",
        text: "When you add a creator to a campaign, Trackit generates two things: a unique discount code (EMMA15) and a unique referral link (trackit.app/r/emma_abc123). When a customer uses either at checkout, the sale is instantly attributed to that creator.",
      },
      { type: "step", number: 1, title: "Create a campaign", text: "Go to Campaigns → New Campaign. Give it a name, set the dates, and choose your commission structure." },
      {
        type: "step",
        number: 2,
        title: "Set commission rate",
        text: "Percentage commission (8-15%) works best for most ecommerce brands. Fixed amount works better for high-ticket products. Start at 10% and adjust based on margins.",
      },
      {
        type: "step",
        number: 3,
        title: "Add creators",
        text: "Add creators to your campaign. Each creator automatically gets their unique code and link.",
      },
      {
        type: "step",
        number: 4,
        title: "Share assets with creators",
        text: "Send each creator their unique discount code and referral link. They add it to their bio, posts, and videos.",
      },
      {
        type: "step",
        number: 5,
        title: "Watch sales come in",
        text: "Every sale appears in your Payouts dashboard in real time with the creator attribution and commission amount calculated automatically.",
      },
      {
        type: "callout",
        variant: "pro",
        text: "💡 Turn on Auto payout in Payouts settings. When a creator reaches the minimum threshold (e.g. $50), Trackit pays them automatically. No manual transfers, no forgotten payments.",
      },
    ],
  },
  analytics: {
    title: "Read your analytics",
    readTime: "4 min read",
    blocks: [
      {
        type: "intro",
        text: "Analytics tells you which creators are actually making you money and which are just posting without driving sales. Use this data to double down on winners and cut underperformers.",
      },
      {
        type: "section",
        title: "The most important metrics",
        text: "Focus on three numbers: Revenue per creator (how much each partner actually drives), ROI (revenue divided by commission paid), and Conversion rate (clicks to purchases from their referral link).",
      },
      { type: "step", number: 1, title: "Open Analytics", text: "Click Analytics in the sidebar. Set the date range to Last 30 days for your first review." },
      {
        type: "step",
        number: 2,
        title: "Check top performers",
        text: "Scroll to Top Performing Creators. Sort by Revenue. Your top 3 creators likely drive 80% of your results. These are your VIPs — treat them accordingly.",
      },
      {
        type: "step",
        number: 3,
        title: "Check the funnel",
        text: "Look at the Outreach Performance chart. If you're sending lots of outreach but getting few partnerships, your message needs work. If partnerships are high but sales are low, your creators aren't the right fit.",
      },
      {
        type: "step",
        number: 4,
        title: "Platform breakdown",
        text: "Check which platform drives the most revenue for your brand. Double down on that platform in your next creator search.",
      },
      {
        type: "step",
        number: 5,
        title: "Monthly review habit",
        text: "Set a calendar reminder every first Monday of the month. Spend 20 minutes in Analytics. Identify your top 3 creators, cut or pause the bottom 3, and plan your next outreach batch.",
      },
      {
        type: "callout",
        variant: "action",
        text: "💡 Export your analytics to CSV every month. Over time you'll build a clear picture of which creator profile (niche, platform, follower range) converts best for your specific brand.",
      },
    ],
  },
};

const FAQ_ITEMS = [
  {
    q: "How does Trackit track creator sales?",
    a: "Trackit connects to your Shopify store via webhook. Every creator gets a unique discount code and referral link. When a customer uses either at checkout, Trackit automatically attributes the sale and calculates the commission.",
  },
  {
    q: "Can I use Trackit without a Shopify store?",
    a: "Yes. You can use Discovery, Outreach, and the CRM features without connecting Shopify. Shopify integration is required for automatic sale tracking and commission payouts.",
  },
  {
    q: "How do I pay my creators?",
    a: "Trackit handles payouts via Stripe Connect. Creators connect their bank account or card once. You top up your Trackit balance and hit pay. Money goes directly to the creator.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes. The free plan gives you 5 creator searches per day, basic outreach templates, and 1 Shopify store connection. Upgrade to Pro for 50 discoveries/month, 25 results per search, and 50 managed creators.",
  },
  {
    q: "How does the AI outreach work?",
    a: "You select a creator. Trackit AI reads their profile, content style, and niche, then generates a personalized message for your brand. You edit it if needed and send. Response rates are 3x higher than generic templates.",
  },
  {
    q: "Can I import my existing creators?",
    a: "Yes. Go to Creators → Import CSV. Download the template, fill in your creator data, and upload. All creators import in under 30 seconds.",
  },
  {
    q: "What platforms does Trackit support?",
    a: "TikTok, Instagram, and YouTube for discovery and outreach. Shopify for sale tracking. More platforms coming soon.",
  },
  {
    q: "How do referral links work?",
    a: "When you add a creator to a campaign, Trackit auto-generates a unique referral link like trackit.app/r/creatorname. Every click and purchase through that link is attributed to the creator automatically.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No contracts, no lock-ins. Cancel from Settings → Billing anytime. You keep access until the end of your billing period.",
  },
  {
    q: "How do I contact support?",
    a: "Chat with us using the button at the top of this page. We reply in under 5 minutes during business hours. For non-urgent questions email support@trackit.app.",
  },
];

const VIDEOS = [
  { title: "Connect Shopify in 60 seconds", duration: "3:24" },
  { title: "Find and contact your first creator", duration: "4:12" },
  { title: "Set up automated commission payouts", duration: "5:01" },
];

function GuideCallout({ text, variant }: { text: string; variant: "tip" | "pro" | "action" | "troubleshoot" }) {
  const styles: Record<string, { bg: string; border: string }> = {
    tip: { bg: "#F0F6FF", border: "#0047FF" },
    pro: { bg: "#FFFBEB", border: "#F59E0B" },
    action: { bg: "#F0F6FF", border: "#0047FF" },
    troubleshoot: { bg: "#F5F5F5", border: "#9A9A9A" },
  };
  const s = styles[variant];
  return (
    <div
      style={{
        background: s.bg,
        borderLeft: `4px solid ${s.border}`,
        borderRadius: 10,
        padding: "14px 16px",
        fontSize: 14,
        color: "#1A1A1A",
        lineHeight: 1.55,
        marginTop: 8,
        marginBottom: 8,
      }}
    >
      {text}
    </div>
  );
}

function GuideBlockRenderer({ block }: { block: GuideBlock }) {
  if (block.type === "intro") {
    return (
      <p style={{ fontSize: 16, color: "#1A1A1A", lineHeight: 1.65, margin: "0 0 32px", letterSpacing: "-0.02em" }}>{block.text}</p>
    );
  }
  if (block.type === "section") {
    return (
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1A1A1A", margin: "0 0 10px", letterSpacing: "-0.03em" }}>{block.title}</h2>
        <p style={{ fontSize: 15, color: "#4A4A4A", lineHeight: 1.65, margin: 0 }}>{block.text}</p>
      </div>
    );
  }
  if (block.type === "step") {
    return (
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: block.tip ? 10 : 0 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "#1A1A1A",
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {block.number}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1A1A1A", margin: "0 0 8px", letterSpacing: "-0.02em" }}>{block.title}</h3>
            <p style={{ fontSize: 15, color: "#4A4A4A", lineHeight: 1.65, margin: 0 }}>{block.text}</p>
          </div>
        </div>
        {block.tip && <GuideCallout text={block.tip} variant="tip" />}
      </div>
    );
  }
  return <GuideCallout text={block.text} variant={block.variant} />;
}

function getShopifyGuideContent(lang: "en" | "fr") {
  return {
    title: lang === "fr" ? "Connectez votre boutique Shopify" : "Connect your Shopify store",
    readTime: lang === "fr" ? "5 min de lecture" : "5 min read",
    blocks: [
      {
        type: "intro" as const,
        text:
          lang === "fr"
            ? "Connecter votre boutique Shopify est la base de Trackit. Une fois connectée, chaque vente générée par vos créateurs est suivie automatiquement — pas de tableurs, pas de travail manuel."
            : "Connecting your Shopify store is the foundation of Trackit. Once connected, every sale driven by your creators is tracked automatically — no spreadsheets, no manual work.",
      },
      {
        type: "step" as const,
        number: 1,
        title: lang === "fr" ? "Allez dans Intégrations" : "Go to Integrations",
        text:
          lang === "fr"
            ? "Naviguez vers Intégrations dans la barre latérale gauche. Vous verrez la carte Shopify en haut de la page."
            : "Navigate to Integrations in the left sidebar. You'll see the Shopify card at the top of the page.",
        tip:
          lang === "fr"
            ? "💡 Conseil : Vous pouvez connecter plusieurs boutiques Shopify avec les plans Pro et Agency."
            : "💡 Tip: You can connect multiple Shopify stores on the Pro and Agency plans.",
      },
      {
        type: "step" as const,
        number: 2,
        title: lang === "fr" ? "Entrez l'URL de votre boutique" : "Enter your store URL",
        text:
          lang === "fr"
            ? "Cliquez sur Connecter Shopify. Entrez l'URL de votre boutique au format : votreboutique.myshopify.com — n'incluez pas https://"
            : "Click Connect Shopify. Enter your store URL in the format: yourstore.myshopify.com — do not include https://",
      },
      {
        type: "step" as const,
        number: 3,
        title: lang === "fr" ? "Autorisez Trackit" : "Authorize Trackit",
        text:
          lang === "fr"
            ? "Vous serez redirigé vers Shopify pour approuver la connexion. Trackit demande uniquement un accès en lecture aux commandes et la capacité de créer des codes de réduction. Nous ne touchons jamais vos produits ou données clients."
            : "You'll be redirected to Shopify to approve the connection. Trackit only requests read access to orders and the ability to create discount codes. We never touch your products or customer data.",
      },
      {
        type: "step" as const,
        number: 4,
        title: lang === "fr" ? "Confirmez la connexion" : "Confirm connection",
        text:
          lang === "fr"
            ? "Une fois autorisé, vous serez redirigé vers Trackit. Votre boutique s'affichera comme Connectée avec un badge vert."
            : "Once authorized you'll be redirected back to Trackit. Your store will show as Connected with a green badge.",
      },
      {
        type: "section" as const,
        title: lang === "fr" ? "Que se passe-t-il ensuite" : "What happens next",
        text:
          lang === "fr"
            ? "Trackit va maintenant écouter les nouvelles commandes. Quand un client passe à la caisse avec le code de réduction ou le lien de parrainage d'un créateur, la vente apparaît dans votre tableau de bord Paiements en temps réel."
            : "Trackit will now listen for new orders. When a customer checks out using a creator's discount code or referral link, the sale appears in your Payouts dashboard in real time.",
      },
      {
        type: "callout" as const,
        variant: "troubleshoot" as const,
        text:
          lang === "fr"
            ? "Boutique qui ne se connecte pas ? Assurez-vous d'utiliser le format .myshopify.com, pas votre domaine personnalisé. Toujours bloqué ? Chattez avec nous."
            : "Store not connecting? Make sure you're using the .myshopify.com format, not your custom domain. Still stuck? Chat with us.",
      },
    ],
  };
}

function getDiscoveryGuideContent(lang: "en" | "fr") {
  return {
    title: lang === "fr" ? "Trouvez vos premiers créateurs" : "Find your first creators",
    readTime: lang === "fr" ? "3 min de lecture" : "3 min read",
    blocks: [
      {
        type: "intro" as const,
        text:
          lang === "fr"
            ? "Recherche est l'endroit où vous trouvez des créateurs dont l'audience correspond parfaitement à vos clients. L'objectif n'est pas les plus grands créateurs — ce sont les bons créateurs."
            : "Discovery is where you find creators whose audience perfectly matches your customers. The goal is not the biggest creators — it's the right creators.",
      },
      {
        type: "section" as const,
        title: lang === "fr" ? "Qu'est-ce qui fait un bon créateur ?" : "What makes a good creator match",
        text:
          lang === "fr"
            ? "Trois choses comptent plus que le nombre d'abonnés : un taux d'engagement supérieur à 3%, des données démographiques d'audience qui correspondent à votre ICP, et un style de contenu qui s'adapte naturellement à votre marque."
            : "Three things matter more than follower count: engagement rate above 3%, audience demographics that match your ICP, and content style that fits your brand naturally.",
      },
      {
        type: "step" as const,
        number: 1,
        title: lang === "fr" ? "Ouvrez Recherche" : "Open Discovery",
        text:
          lang === "fr"
            ? "Cliquez sur Recherche dans la barre latérale gauche. Vous verrez la barre de recherche et les filtres."
            : "Click Discovery in the left sidebar. You'll see the search bar and filters.",
      },
      {
        type: "step" as const,
        number: 2,
        title: lang === "fr" ? "Choisissez votre plateforme" : "Choose your platform",
        text:
          lang === "fr"
            ? "Commencez par TikTok pour les marques e-commerce. TikTok génère la plus haute intention d'achat de toutes les plateformes actuellement. Instagram est meilleur pour le lifestyle et la beauté. YouTube pour les produits haut de gamme qui nécessitent une explication."
            : "Start with TikTok for ecommerce brands. TikTok drives the highest purchase intent of any platform right now. Instagram is better for lifestyle and beauty. YouTube for high-ticket products that need explanation.",
      },
      {
        type: "step" as const,
        number: 3,
        title: lang === "fr" ? "Entrez votre niche" : "Enter your niche",
        text:
          lang === "fr"
            ? "Soyez spécifique. Ne cherchez pas 'mode' — cherchez 'mode durable France' ou 'streetwear Paris'. Les niches spécifiques retournent des créateurs dont l'audience est vraiment intéressée par ce que vous vendez."
            : "Be specific. Don't search 'fashion' — search 'sustainable fashion France' or 'streetwear Paris'. Specific niches return creators whose audience is genuinely interested in what you sell.",
      },
      {
        type: "step" as const,
        number: 4,
        title: lang === "fr" ? "Filtrez par engagement" : "Filter by engagement",
        text:
          lang === "fr"
            ? "Définissez un taux d'engagement minimum à 3%. Ignorez le nombre d'abonnés pour l'instant. Un créateur avec 10K abonnés et 8% d'engagement générera plus de ventes qu'un autre avec 500K abonnés et 0,5% d'engagement."
            : "Set minimum engagement rate to 3%. Ignore follower count for now. A creator with 10K followers and 8% engagement will drive more sales than one with 500K followers and 0.5% engagement.",
      },
      {
        type: "step" as const,
        number: 5,
        title: lang === "fr" ? "Sauvegardez vos meilleures trouvailles" : "Save your best finds",
        text:
          lang === "fr"
            ? "Cliquez sur Sauvegarder le créateur sur n'importe quelle carte pour l'ajouter à votre liste. Constituez une liste de 10 à 20 créateurs avant de commencer vos messages."
            : "Click Save creator on any card to add them to your saved list. Build a shortlist of 10-20 before you start outreach.",
      },
      {
        type: "callout" as const,
        variant: "pro" as const,
        text:
          lang === "fr"
            ? "💡 Les meilleurs créateurs ont souvent entre 10K et 100K abonnés. Ils sont abordables, ont des audiences très engagées, et sont plus susceptibles de répondre aux messages des petites marques."
            : "💡 The best creators are often between 10K-100K followers. They're affordable, have highly engaged audiences, and are more likely to respond to outreach from smaller brands.",
      },
    ],
  };
}

function getOutreachGuideContent(lang: "en" | "fr") {
  return {
    title: lang === "fr" ? "Envoyez votre premier message" : "Send your first outreach",
    readTime: lang === "fr" ? "4 min de lecture" : "4 min read",
    blocks: [
      {
        type: "intro" as const,
        text:
          lang === "fr"
            ? "La plupart des messages aux créateurs échouent parce qu'ils sont génériques. Trackit IA lit le profil du créateur et rédige un message qui semble personnel — parce qu'il l'est."
            : "Most creator outreach fails because it's generic. Trackit AI reads the creator's profile and writes a message that feels personal — because it is.",
      },
      {
        type: "section" as const,
        title: lang === "fr" ? "Pourquoi les messages génériques ne fonctionnent pas" : "Why generic messages don't work",
        text:
          lang === "fr"
            ? "Les créateurs reçoivent des centaines de DMs chaque semaine. 'Hey j'adore ton contenu, tu veux collaborer ?' est ignoré à chaque fois. Les messages qui obtiennent des réponses sont spécifiques, courts, et commencent par offrir de la valeur."
            : "Creators get hundreds of DMs every week. 'Hey I love your content, want to collab?' gets ignored every time. The messages that get replies are specific, short, and lead with value not ask.",
      },
      {
        type: "step" as const,
        number: 1,
        title: lang === "fr" ? "Sélectionnez un créateur" : "Select a creator",
        text:
          lang === "fr"
            ? "Allez dans vos créateurs sauvegardés ou cliquez sur Générer un message sur n'importe quelle carte créateur dans Recherche."
            : "Go to your saved creators or click Generate outreach on any creator card in Discovery.",
      },
      {
        type: "step" as const,
        number: 2,
        title: lang === "fr" ? "Décrivez votre marque" : "Describe your brand",
        text:
          lang === "fr"
            ? "Entrez ce que vous vendez en une phrase. Soyez spécifique : 'vêtements de sport durables pour femmes en France' pas juste 'marque de vêtements'."
            : "Enter what you sell in one sentence. Be specific: 'sustainable activewear for women in France' not just 'clothing brand'.",
      },
      {
        type: "step" as const,
        number: 3,
        title: lang === "fr" ? "Choisissez votre ton" : "Choose your tone",
        text:
          lang === "fr"
            ? "Décontracté fonctionne mieux pour les créateurs TikTok de moins de 100K abonnés. Professionnel pour les créateurs YouTube. Adaptez-vous à l'énergie de leur contenu."
            : "Casual works best for TikTok creators under 100K followers. Professional for YouTube creators. Match the energy of their content.",
      },
      {
        type: "step" as const,
        number: 4,
        title: lang === "fr" ? "Générez et vérifiez" : "Generate and review",
        text:
          lang === "fr"
            ? "Cliquez sur Générer. Lisez attentivement le message. Modifiez tout ce qui ne vous ressemble pas. Ajoutez une référence spécifique à l'un de leurs posts récents pour de meilleurs résultats."
            : "Click Generate. Read the message carefully. Edit anything that doesn't sound like you. Add a specific reference to one of their recent posts for best results.",
      },
      {
        type: "step" as const,
        number: 5,
        title: lang === "fr" ? "Envoyez et suivez" : "Send and track",
        text:
          lang === "fr"
            ? "Copiez le message. Envoyez-le sur la plateforme. Revenez dans Messages et marquez-le comme envoyé. Trackit vous rappellera de faire un suivi dans 3 jours."
            : "Copy the message. Send it on the platform. Come back to Outreach and mark it as sent. Trackit will remind you to follow up in 3 days.",
      },
      {
        type: "callout" as const,
        variant: "tip" as const,
        text:
          lang === "fr"
            ? "💡 Le taux de réponse moyen pour les messages froids est de 5-10%. Avec des messages personnalisés il monte à 20-30%. Ne vous découragez pas — le volume et la qualité comptent tous les deux."
            : "💡 Average response rate for cold creator outreach is 5-10%. With personalized messages it jumps to 20-30%. Don't get discouraged — volume and quality both matter.",
      },
    ],
  };
}

function getCommissionGuideContent(lang: "en" | "fr") {
  return {
    title: lang === "fr" ? "Configurez le suivi des commissions" : "Set up commission tracking",
    readTime: lang === "fr" ? "6 min de lecture" : "6 min read",
    blocks: [
      {
        type: "intro" as const,
        text:
          lang === "fr"
            ? "Le suivi des commissions est ce qui distingue Trackit de tous les autres outils créateurs. Au lieu de vérifier manuellement qui a vendu quoi, chaque vente est attribuée automatiquement au moment où elle se produit."
            : "Commission tracking is what separates Trackit from every other creator tool. Instead of manually checking who sold what, every sale is attributed automatically the moment it happens.",
      },
      {
        type: "section" as const,
        title: lang === "fr" ? "Comment ça marche" : "How it works",
        text:
          lang === "fr"
            ? "Quand vous ajoutez un créateur à une campagne, Trackit génère deux choses : un code de réduction unique (EMMA15) et un lien de parrainage unique (trackit.app/r/emma_abc123). Quand un client utilise l'un ou l'autre à la caisse, la vente est instantanément attribuée à ce créateur."
            : "When you add a creator to a campaign, Trackit generates two things: a unique discount code (EMMA15) and a unique referral link (trackit.app/r/emma_abc123). When a customer uses either at checkout, the sale is instantly attributed to that creator.",
      },
      {
        type: "step" as const,
        number: 1,
        title: lang === "fr" ? "Créez une campagne" : "Create a campaign",
        text:
          lang === "fr"
            ? "Allez dans Campagnes → Nouvelle campagne. Donnez-lui un nom, définissez les dates et choisissez votre structure de commission."
            : "Go to Campaigns → New Campaign. Give it a name, set the dates, and choose your commission structure.",
      },
      {
        type: "step" as const,
        number: 2,
        title: lang === "fr" ? "Définissez le taux de commission" : "Set commission rate",
        text:
          lang === "fr"
            ? "Une commission en pourcentage (8-15%) fonctionne mieux pour la plupart des marques e-commerce. Un montant fixe fonctionne mieux pour les produits haut de gamme. Commencez à 10% et ajustez selon les marges."
            : "Percentage commission (8-15%) works best for most ecommerce brands. Fixed amount works better for high-ticket products. Start at 10% and adjust based on margins.",
      },
      {
        type: "step" as const,
        number: 3,
        title: lang === "fr" ? "Ajoutez des créateurs" : "Add creators",
        text:
          lang === "fr"
            ? "Ajoutez des créateurs à votre campagne. Chaque créateur reçoit automatiquement son code et son lien uniques."
            : "Add creators to your campaign. Each creator automatically gets their unique code and link.",
      },
      {
        type: "step" as const,
        number: 4,
        title: lang === "fr" ? "Partagez les ressources avec les créateurs" : "Share assets with creators",
        text:
          lang === "fr"
            ? "Envoyez à chaque créateur son code de réduction unique et son lien de parrainage. Ils l'ajoutent à leur bio, leurs posts et leurs vidéos."
            : "Send each creator their unique discount code and referral link. They add it to their bio, posts, and videos.",
      },
      {
        type: "step" as const,
        number: 5,
        title: lang === "fr" ? "Regardez les ventes arriver" : "Watch sales come in",
        text:
          lang === "fr"
            ? "Chaque vente apparaît dans votre tableau de bord Paiements en temps réel avec l'attribution du créateur et le montant de la commission calculé automatiquement."
            : "Every sale appears in your Payouts dashboard in real time with the creator attribution and commission amount calculated automatically.",
      },
      {
        type: "callout" as const,
        variant: "pro" as const,
        text:
          lang === "fr"
            ? "💡 Activez le paiement automatique dans les paramètres Paiements. Quand un créateur atteint le seuil minimum (ex. 50 $), Trackit les paie automatiquement. Pas de virements manuels, pas de paiements oubliés."
            : "💡 Turn on Auto payout in Payouts settings. When a creator reaches the minimum threshold (e.g. $50), Trackit pays them automatically. No manual transfers, no forgotten payments.",
      },
    ],
  };
}

function getAnalyticsGuideContent(lang: "en" | "fr") {
  return {
    title: lang === "fr" ? "Lisez vos analytiques" : "Read your analytics",
    readTime: lang === "fr" ? "4 min de lecture" : "4 min read",
    blocks: [
      {
        type: "intro" as const,
        text:
          lang === "fr"
            ? "Les analytiques vous indiquent quels créateurs vous rapportent vraiment de l'argent et lesquels postent sans générer de ventes. Utilisez ces données pour miser sur les gagnants et couper les sous-performants."
            : "Analytics tells you which creators are actually making you money and which are just posting without driving sales. Use this data to double down on winners and cut underperformers.",
      },
      {
        type: "section" as const,
        title: lang === "fr" ? "Les métriques les plus importantes" : "The most important metrics",
        text:
          lang === "fr"
            ? "Concentrez-vous sur trois chiffres : Revenus par créateur (combien chaque partenaire génère réellement), ROI (revenus divisés par les commissions payées), et Taux de conversion (clics vers achats depuis leur lien de parrainage)."
            : "Focus on three numbers: Revenue per creator (how much each partner actually drives), ROI (revenue divided by commission paid), and Conversion rate (clicks to purchases from their referral link).",
      },
      {
        type: "step" as const,
        number: 1,
        title: lang === "fr" ? "Ouvrez Analytiques" : "Open Analytics",
        text:
          lang === "fr"
            ? "Cliquez sur Analytiques dans la barre latérale. Définissez la plage de dates sur les 30 derniers jours pour votre première revue."
            : "Click Analytics in the sidebar. Set the date range to Last 30 days for your first review.",
      },
      {
        type: "step" as const,
        number: 2,
        title: lang === "fr" ? "Vérifiez les meilleurs performeurs" : "Check top performers",
        text:
          lang === "fr"
            ? "Faites défiler jusqu'aux Meilleurs créateurs. Triez par Revenus. Vos 3 meilleurs créateurs génèrent probablement 80% de vos résultats. Ce sont vos VIPs — traitez-les en conséquence."
            : "Scroll to Top Performing Creators. Sort by Revenue. Your top 3 creators likely drive 80% of your results. These are your VIPs — treat them accordingly.",
      },
      {
        type: "step" as const,
        number: 3,
        title: lang === "fr" ? "Vérifiez l'entonnoir" : "Check the funnel",
        text:
          lang === "fr"
            ? "Regardez le graphique de Performance des messages. Si vous envoyez beaucoup de messages mais obtenez peu de partenariats, votre message a besoin d'amélioration. Si les partenariats sont élevés mais les ventes faibles, vos créateurs ne sont pas le bon choix."
            : "Look at the Outreach Performance chart. If you're sending lots of outreach but getting few partnerships, your message needs work. If partnerships are high but sales are low, your creators aren't the right fit.",
      },
      {
        type: "step" as const,
        number: 4,
        title: lang === "fr" ? "Répartition par plateforme" : "Platform breakdown",
        text:
          lang === "fr"
            ? "Vérifiez quelle plateforme génère le plus de revenus pour votre marque. Misez sur cette plateforme dans votre prochaine recherche de créateurs."
            : "Check which platform drives the most revenue for your brand. Double down on that platform in your next creator search.",
      },
      {
        type: "step" as const,
        number: 5,
        title: lang === "fr" ? "Habitude de révision mensuelle" : "Monthly review habit",
        text:
          lang === "fr"
            ? "Définissez un rappel calendrier chaque premier lundi du mois. Passez 20 minutes dans Analytiques. Identifiez vos 3 meilleurs créateurs, coupez ou mettez en pause les 3 derniers, et planifiez votre prochain lot de messages."
            : "Set a calendar reminder every first Monday of the month. Spend 20 minutes in Analytics. Identify your top 3 creators, cut or pause the bottom 3, and plan your next outreach batch.",
      },
      {
        type: "callout" as const,
        variant: "action" as const,
        text:
          lang === "fr"
            ? "💡 Exportez vos analytiques en CSV chaque mois. Avec le temps vous aurez une image claire du profil de créateur (niche, plateforme, tranche d'abonnés) qui convertit le mieux pour votre marque spécifique."
            : "💡 Export your analytics to CSV every month. Over time you'll build a clear picture of which creator profile (niche, platform, follower range) converts best for your specific brand.",
      },
    ],
  };
}

function GuideModal({ lang, guideId, onClose }: { lang: "en" | "fr"; guideId: string; onClose: () => void }) {
  const content =
    guideId === "shopify"
      ? getShopifyGuideContent(lang)
      : guideId === "discovery"
        ? getDiscoveryGuideContent(lang)
        : guideId === "outreach"
          ? getOutreachGuideContent(lang)
          : guideId === "commission"
            ? getCommissionGuideContent(lang)
            : guideId === "analytics"
              ? getAnalyticsGuideContent(lang)
              : GUIDE_CONTENT[guideId];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? (el.scrollTop / max) * 100 : 0);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [guideId]);

  if (!content) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
        fontFamily: "inherit",
      }}
    >
      <div style={{ height: 3, background: "#EFEFEF", flexShrink: 0 }}>
        <div style={{ height: "100%", width: `${progress}%`, background: "#0047FF", transition: "width 0.1s ease-out" }} />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "16px 24px",
          borderBottom: "1px solid #EFEFEF",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            fontSize: 14,
            fontWeight: 500,
            color: "#1A1A1A",
            cursor: "pointer",
            fontFamily: "inherit",
            padding: "8px 0",
            flexShrink: 0,
          }}
        >
          {lang === "fr" ? "← Retour au Centre d'aide" : "← Back to Help Center"}
        </button>
        <h1
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "#1A1A1A",
            margin: 0,
            textAlign: "center",
            flex: 1,
            letterSpacing: "-0.02em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {content.title}
        </h1>
        <span style={{ fontSize: 13, color: "#9A9A9A", flexShrink: 0, minWidth: 72, textAlign: "right" }}>{content.readTime}</span>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", scrollBehavior: "smooth" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px 80px" }}>
          {content.blocks.map((block, i) => (
            <GuideBlockRenderer key={i} block={block} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function HelpCenterView({ isMobile, plan = "free" }: { isMobile?: boolean; plan?: PlanTier }) {
  const lang = useLang();
  const isDedicated = canUseDedicatedSupport(plan);
  const isPriority = canUsePrioritySupport(plan);
  const [search, setSearch] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [openGuideId, setOpenGuideId] = useState<string | null>(null);

  const supportCards = useMemo(
    () => [
      {
        icon: isDedicated ? "🎯" : isPriority ? "⚡" : "💬",
        title: isDedicated
          ? lang === "fr" ? "Support dédié" : "Dedicated support"
          : isPriority
            ? lang === "fr" ? "Support prioritaire" : "Priority support"
            : lang === "fr" ? "Chattez avec nous" : "Chat with us",
        text: isDedicated
          ? (lang === "fr" ? "Gestionnaire dédié et réponse sous 1h — inclus sur Scale." : "Dedicated manager and replies within 1 hour — included on Scale.")
          : isPriority
            ? (lang === "fr" ? "Réponse prioritaire en moins de 2h — réservé au plan Pro." : "Priority replies in under 2 hours — included on Pro.")
            : (lang === "fr" ? "Obtenez une réponse en moins de 5 minutes de notre équipe." : "Get a reply in under 5 minutes from our team."),
        action: isDedicated
          ? lang === "fr" ? "Contacter votre gestionnaire →" : "Contact your manager →"
          : isPriority
            ? lang === "fr" ? "Contacter le support prioritaire →" : "Contact priority support →"
            : lang === "fr" ? "Démarrer le chat →" : "Start chat →",
        onClick: () =>
          window.alert(
            isDedicated
              ? "Dedicated support: email support@trackit.app with [Scale] in the subject for your account manager."
              : isPriority
                ? "Priority support: email support@trackit.app with [Pro] in the subject."
                : "Live chat coming soon — email us at support@trackit.app for now."
          ),
      },
      {
        icon: "📧",
        title: lang === "fr" ? "Support par email" : "Email support",
        text: isPriority
          ? lang === "fr" ? "Ligne directe email — réponse sous 24h." : "Direct email line — reply within 24h."
          : lang === "fr" ? "Envoyez-nous un message détaillé et nous répondrons sous 24h." : "Send us a detailed message and we'll get back within 24h.",
        action: lang === "fr" ? "Envoyer un email →" : "Send email →",
        href: `mailto:${SUPPORT_EMAIL}`,
      },
    ],
    [lang, isDedicated, isPriority]
  );

  const guides = useMemo(
    () => [
      {
        id: "shopify",
        icon: "🔗",
        title: lang === "fr" ? "Connectez votre boutique Shopify" : "Connect your Shopify store",
        text: lang === "fr" ? "Liez votre boutique en 60 secondes pour suivre automatiquement les ventes des créateurs." : "Link your store in 60 seconds to start tracking creator sales automatically.",
        tag: lang === "fr" ? "5 min de lecture" : "5 min read",
      },
      {
        id: "discovery",
        icon: "🔍",
        title: lang === "fr" ? "Trouvez vos premiers créateurs" : "Find your first creators",
        text: lang === "fr" ? "Apprenez à rechercher et filtrer des créateurs qui correspondent parfaitement à votre marque." : "Learn how to search and filter creators that match your brand perfectly.",
        tag: lang === "fr" ? "3 min de lecture" : "3 min read",
      },
      {
        id: "outreach",
        icon: "✉️",
        title: lang === "fr" ? "Envoyez votre premier message" : "Send your first outreach",
        text: lang === "fr" ? "Utilisez Trackit IA pour générer des messages personnalisés qui obtiennent vraiment des réponses." : "Use Trackit AI to generate personalized messages that actually get replies.",
        tag: lang === "fr" ? "4 min de lecture" : "4 min read",
      },
      {
        id: "commission",
        icon: "💸",
        title: lang === "fr" ? "Configurez le suivi des commissions" : "Set up commission tracking",
        text: lang === "fr" ? "Automatisez le calcul des commissions et les paiements pour chaque partenaire créateur." : "Automate commission calculation and payouts for every creator partner.",
        tag: lang === "fr" ? "6 min de lecture" : "6 min read",
      },
      {
        id: "analytics",
        icon: "📊",
        title: lang === "fr" ? "Lisez vos analytiques" : "Read your analytics",
        text: lang === "fr" ? "Comprenez quels créateurs génèrent le plus de revenus et pourquoi." : "Understand which creators drive the most revenue and why.",
        tag: lang === "fr" ? "4 min de lecture" : "4 min read",
      },
    ],
    [lang]
  );

  const faqItems = useMemo(
    () => [
      {
        q: lang === "fr" ? "Comment Trackit suit-il les ventes des créateurs ?" : "How does Trackit track creator sales?",
        a:
          lang === "fr"
            ? "Trackit se connecte à votre boutique Shopify via webhook. Chaque créateur reçoit un code de réduction unique et un lien de parrainage. Quand un client utilise l'un ou l'autre à la caisse, Trackit attribue automatiquement la vente et calcule la commission."
            : "Trackit connects to your Shopify store via webhook. Every creator gets a unique discount code and referral link. When a customer uses either at checkout, Trackit automatically attributes the sale and calculates the commission.",
      },
      {
        q: lang === "fr" ? "Puis-je utiliser Trackit sans boutique Shopify ?" : "Can I use Trackit without a Shopify store?",
        a:
          lang === "fr"
            ? "Oui. Vous pouvez utiliser Découverte, Messages et les fonctionnalités CRM sans connecter Shopify. L'intégration Shopify est requise pour le suivi automatique des ventes et les paiements de commissions."
            : "Yes. You can use Discovery, Outreach, and the CRM features without connecting Shopify. Shopify integration is required for automatic sale tracking and commission payouts.",
      },
      {
        q: lang === "fr" ? "Comment payer mes créateurs ?" : "How do I pay my creators?",
        a:
          lang === "fr"
            ? "Trackit gère les paiements via Stripe Connect. Les créateurs connectent leur compte bancaire ou carte une fois. Vous rechargez votre solde Trackit et cliquez sur payer. L'argent va directement au créateur."
            : "Trackit handles payouts via Stripe Connect. Creators connect their bank account or card once. You top up your Trackit balance and hit pay. Money goes directly to the creator.",
      },
      {
        q: lang === "fr" ? "Y a-t-il un plan gratuit ?" : "Is there a free plan?",
        a:
          lang === "fr"
            ? "Oui. Le plan gratuit vous donne 5 recherches de créateurs par jour, des modèles de messages de base et 1 connexion boutique Shopify. Passez à Pro pour 50 découvertes/mois, 25 résultats par recherche et 50 créateurs gérés."
            : "Yes. The free plan gives you 5 creator searches per day, basic outreach templates, and 1 Shopify store connection. Upgrade to Pro for 50 discoveries/month, 25 results per search, and 50 managed creators.",
      },
      {
        q: lang === "fr" ? "Comment fonctionne le message IA ?" : "How does the AI outreach work?",
        a:
          lang === "fr"
            ? "Vous sélectionnez un créateur. Trackit IA lit son profil, son style de contenu et sa niche, puis génère un message personnalisé pour votre marque. Vous le modifiez si besoin et l'envoyez. Les taux de réponse sont 3 fois plus élevés que les modèles génériques."
            : "You select a creator. Trackit AI reads their profile, content style, and niche, then generates a personalized message for your brand. You edit it if needed and send. Response rates are 3x higher than generic templates.",
      },
      {
        q: lang === "fr" ? "Puis-je importer mes créateurs existants ?" : "Can I import my existing creators?",
        a:
          lang === "fr"
            ? "Oui. Allez dans Créateurs → Importer CSV. Téléchargez le modèle, remplissez les données de vos créateurs et importez. Tous les créateurs sont importés en moins de 30 secondes."
            : "Yes. Go to Creators → Import CSV. Download the template, fill in your creator data, and upload. All creators import in under 30 seconds.",
      },
      {
        q: lang === "fr" ? "Quelles plateformes Trackit prend-il en charge ?" : "What platforms does Trackit support?",
        a:
          lang === "fr"
            ? "TikTok, Instagram et YouTube pour la découverte et les messages. Shopify pour le suivi des ventes. D'autres plateformes arrivent bientôt."
            : "TikTok, Instagram, and YouTube for discovery and outreach. Shopify for sale tracking. More platforms coming soon.",
      },
      {
        q: lang === "fr" ? "Comment fonctionnent les liens de parrainage ?" : "How do referral links work?",
        a:
          lang === "fr"
            ? "Quand vous ajoutez un créateur à une campagne, Trackit génère automatiquement un lien de parrainage unique comme trackit.app/r/nomcreateur. Chaque clic et achat via ce lien est attribué automatiquement au créateur."
            : "When you add a creator to a campaign, Trackit auto-generates a unique referral link like trackit.app/r/creatorname. Every click and purchase through that link is attributed to the creator automatically.",
      },
      {
        q: lang === "fr" ? "Puis-je annuler à tout moment ?" : "Can I cancel anytime?",
        a:
          lang === "fr"
            ? "Oui. Pas de contrat, pas d'engagement. Annulez depuis Paramètres → Facturation à tout moment. Vous gardez l'accès jusqu'à la fin de votre période de facturation."
            : "Yes. No contracts, no lock-ins. Cancel from Settings → Billing anytime. You keep access until the end of your billing period.",
      },
      {
        q: lang === "fr" ? "Comment contacter le support ?" : "How do I contact support?",
        a:
          lang === "fr"
            ? "Chattez avec nous via le bouton en haut de cette page. Nous répondons en moins de 5 minutes pendant les heures ouvrables. Pour les questions non urgentes, écrivez à support@trackit.app."
            : "Chat with us using the button at the top of this page. We reply in under 5 minutes during business hours. For non-urgent questions email support@trackit.app.",
      },
    ],
    [lang]
  );

  const videos = useMemo(
    () => [
      { title: lang === "fr" ? "Connecter Shopify en 60 secondes" : "Connect Shopify in 60 seconds", duration: "3:24" },
      { title: lang === "fr" ? "Trouver et contacter votre premier créateur" : "Find and contact your first creator", duration: "4:12" },
      { title: lang === "fr" ? "Configurer les paiements automatiques de commissions" : "Set up automated commission payouts", duration: "5:01" },
    ],
    [lang]
  );

  const q = search.trim().toLowerCase();
  const filteredFaq = useMemo(() => {
    if (!q) return faqItems.map((item, i) => ({ ...item, index: i }));
    return faqItems.map((item, i) => ({ ...item, index: i })).filter(
      (item) => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
    );
  }, [q, faqItems]);

  return (
    <div style={{ minHeight: "100%" }}>
      <div style={{ paddingTop: isMobile ? 56 : 40, paddingRight: isMobile ? 16 : 40, paddingBottom: isMobile ? 16 : 28, paddingLeft: isMobile ? 16 : 40, borderBottom: "1px solid #EFEFEF", background: "#FFFFFF" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", margin: "0 0 6px", letterSpacing: "-0.04em" }}>{lang === "fr" ? "Centre d'aide" : "Help Center"}</h1>
        <p style={{ fontSize: 14, color: "#7A7A7A", margin: "0 0 24px" }}>{lang === "fr" ? "Tout ce dont vous avez besoin pour tirer le meilleur de Trackit." : "Everything you need to get the most out of Trackit."}</p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "#FAFAFA",
            border: "1px solid #EFEFEF",
            borderRadius: 12,
            padding: "14px 18px",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" stroke="#9A9A9A" strokeWidth="2" />
            <path d="M21 21l-4.35-4.35" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search for help..."
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 16,
              fontFamily: "inherit",
              color: "#1A1A1A",
              letterSpacing: "-0.02em",
            }}
          />
        </div>
      </div>

      <div style={{ padding: isMobile ? "56px 16px 16px" : "40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 16, marginBottom: 48 }}>
          {supportCards.map((card) => (
            <div
              key={card.title}
              style={{
                background: "#FFFFFF",
                border: "1px solid #EFEFEF",
                borderRadius: 16,
                padding: 24,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <span style={{ fontSize: 28, marginBottom: 12 }} aria-hidden>
                {card.icon}
              </span>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px", letterSpacing: "-0.02em" }}>{card.title}</h3>
              <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 20px", lineHeight: 1.5, flex: 1 }}>{card.text}</p>
              {"href" in card && card.href ? (
                <a
                  href={card.href}
                  target={card.href.startsWith("http") ? "_blank" : undefined}
                  rel={card.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  style={{ ...btnBlack, textDecoration: "none", textAlign: "center", display: "inline-block" }}
                >
                  {card.action}
                </a>
              ) : (
                <button type="button" onClick={card.onClick} style={btnBlack}>
                  {card.action}
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", margin: 0, letterSpacing: "-0.03em" }}>{lang === "fr" ? "Pour commencer" : "Getting started"}</h2>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#0047FF",
                background: "rgba(0,71,255,0.1)",
                padding: "4px 10px",
                borderRadius: 999,
                letterSpacing: "0.04em",
              }}
            >
              {lang === "fr" ? "COMMENCEZ ICI" : "START HERE"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 16 }}>
            {guides.map((guide) => (
              <div
                key={guide.title}
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #EFEFEF",
                  borderRadius: 16,
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <span style={{ fontSize: 24, marginBottom: 10 }} aria-hidden>
                  {guide.icon}
                </span>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px", letterSpacing: "-0.02em" }}>{guide.title}</h3>
                <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 14px", lineHeight: 1.5, flex: 1 }}>{guide.text}</p>
                <span style={{ fontSize: 11, color: "#9A9A9A", marginBottom: 14 }}>{guide.tag}</span>
                <button type="button" onClick={() => setOpenGuideId(guide.id)} style={{ ...btnSecondary, alignSelf: "flex-start" }}>
                  {lang === "fr" ? "Lire le guide →" : "Read guide →"}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", margin: "0 0 20px", letterSpacing: "-0.03em" }}>{lang === "fr" ? "Questions fréquentes" : "Frequently asked questions"}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredFaq.length === 0 ? (
              <p style={{ fontSize: 14, color: "#7A7A7A", padding: 20, background: "#FFFFFF", borderRadius: 12, border: "1px solid #EFEFEF" }}>
                No questions match your search.
              </p>
            ) : (
              filteredFaq.map((item) => {
                const isOpen = openFaq === item.index;
                return (
                  <div
                    key={item.index}
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid #EFEFEF",
                      borderRadius: 12,
                      overflow: "hidden",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : item.index)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 16,
                        padding: "16px 20px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{item.q}</span>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        style={{ flexShrink: 0, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
                      >
                        <path d="M6 9l6 6 6-6" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div style={{ padding: "0 20px 16px", fontSize: 14, color: "#7A7A7A", lineHeight: 1.55, letterSpacing: "-0.01em" }}>
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "#1A1A1A", margin: "0 0 4px", letterSpacing: "-0.03em" }}>{lang === "fr" ? "Tutoriels vidéo" : "Video tutorials"}</h2>
          <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 20px" }}>{lang === "fr" ? "Regardez et apprenez en moins de 5 minutes." : "Watch and learn in under 5 minutes."}</p>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 16 }}>
            {videos.map((video) => (
              <div key={video.title} style={{ background: "#FFFFFF", border: "1px solid #EFEFEF", borderRadius: 16, overflow: "hidden" }}>
                <div
                  style={{
                    position: "relative",
                    aspectRatio: "16 / 9",
                    background: "#E5E5E5",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(0,0,0,0.45)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 1,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#FFFFFF", letterSpacing: "0.04em" }}>{lang === "fr" ? "BIENTÔT DISPONIBLE" : "COMING SOON"}</span>
                  </div>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.9)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 0,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M10 8l8 4-8 4V8z" fill="#1A1A1A" />
                    </svg>
                  </div>
                  <span
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 10,
                      zIndex: 2,
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#FFFFFF",
                      background: "rgba(0,0,0,0.6)",
                      padding: "4px 8px",
                      borderRadius: 6,
                    }}
                  >
                    {video.duration}
                  </span>
                </div>
                <div style={{ padding: "16px 18px 18px" }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", margin: "0 0 10px", letterSpacing: "-0.02em" }}>{video.title}</h3>
                  <button
                    type="button"
                    style={{
                      background: "none",
                      border: "none",
                      color: "#0047FF",
                      fontSize: 13,
                      fontWeight: 500,
                      fontFamily: "inherit",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {lang === "fr" ? "Regarder →" : "Watch now →"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            background: "#1A1A1A",
            borderRadius: 16,
            padding: "40px 36px",
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: 22, fontWeight: 600, color: "#FFFFFF", margin: "0 0 8px", letterSpacing: "-0.03em" }}>{lang === "fr" ? "Besoin d'aide ?" : "Still need help?"}</h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", margin: "0 0 24px", lineHeight: 1.5 }}>
            {lang === "fr" ? "Notre équipe est là pour vous. Temps de réponse moyen inférieur à 5 minutes." : "Our team is here for you. Average response time under 5 minutes."}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => window.alert("Live chat coming soon — email us at support@trackit.app for now.")}
              style={{
                background: "#FFFFFF",
                color: "#1A1A1A",
                border: "none",
                borderRadius: 10,
                padding: "12px 22px",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              {lang === "fr" ? "Chattez avec nous →" : "Chat with us →"}
            </button>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              style={{
                background: "transparent",
                color: "#FFFFFF",
                border: "1px solid rgba(255,255,255,0.4)",
                borderRadius: 10,
                padding: "12px 22px",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: "pointer",
                textDecoration: "none",
              }}
            >
              {lang === "fr" ? "Email support →" : "Email support →"}
            </a>
          </div>
        </div>
      </div>

      {openGuideId && <GuideModal lang={lang} guideId={openGuideId} onClose={() => setOpenGuideId(null)} />}
    </div>
  );
}
