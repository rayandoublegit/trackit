"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { useLang } from "@/lib/useLang";
import { ChaoticWorkSection } from "@/components/ChaoticWorkSection";
import { MinoCompanion } from "@/components/MinoCompanion";
import { HeroPreviewShell } from "@/app/hero-preview/HeroPreviewShell";
import { annualBilledSubtitle, annualFreeMonthsBadge, checkoutCurrencyFromLang, formatPricingAmount, getPlanAnnualMonthlyEquivalent, getPlanAnnualTotal, planDisplayName, PLAN_PRICES } from "@/lib/plan-marketing";
import { getGrowthPriceId, getProPriceId, getScalePriceId, handleUpgrade } from "@/lib/checkout";
import { normalizePlan, type PlanTier } from "@/lib/plan-limits";
import { getPlanPricingHighlights, type PricingHighlight } from "@/lib/plan-pricing-highlights";
import { openStripeBillingPortal } from "@/lib/open-billing-portal";
import { HOME_FAQ_EN, HOME_FAQ_FR } from "@/lib/home-faq";
import { SocialFooterLinks } from "@/components/SocialFooterLinks";
import { planCtaAction, planCtaLabel, type PaidTier } from "@/lib/pricing-cta";
import type { BillingInterval } from "@/lib/stripe-billing";

export { HeroTrustedTicker } from "@/components/HeroTrustedTicker";

function highlightFeatureTerm(text: string, term: string) {
  const parts = text.split(term);
  if (parts.length === 1) return text;
  return parts.map((part, i) => (
    <span key={i}>
      {part}
      {i < parts.length - 1 && <span className="feature-desc-accent">{term}</span>}
    </span>
  ));
}

type LandingPaidTier = "growth" | "pro" | "scale";

const LANDING_TO_PAID: Record<LandingPaidTier, PaidTier> = {
  growth: "basic",
  pro: "pro",
  scale: "scale",
};

const disabledPricingCtaStyle: CSSProperties = {
  background: "#E8E8E8",
  color: "#8A8A8A",
  border: "none",
  boxShadow: "none",
  cursor: "default",
  transform: "none",
  transition: "none",
};

function formatBentoFeatureLine(item: PricingHighlight, lang: "en" | "fr"): string {
  const fr = lang === "fr";
  const leadingNumber = item.value.match(/^(\d+)/)?.[1];

  switch (item.id) {
    case "discoveries":
      if (/illimit/i.test(item.value)) return fr ? "Découvertes illimitées" : "Unlimited discoveries";
      if (leadingNumber) return fr ? `${leadingNumber} Découvertes / mois` : `${leadingNumber} Discoveries / month`;
      return item.label;
    case "campaigns":
      if (/illimit/i.test(item.value)) return fr ? "Campagnes illimitées" : "Unlimited campaigns";
      if (leadingNumber) return fr ? `${leadingNumber} campagnes actives` : `${leadingNumber} active campaigns`;
      return item.label;
    case "shopify":
      if (leadingNumber === "1") return fr ? "1 boutique Shopify connectée" : "1 connected Shopify store";
      if (leadingNumber) return fr ? `${leadingNumber} boutiques Shopify` : `${leadingNumber} Shopify stores`;
      return item.label;
    case "affiliate":
      return fr ? "Liens d'affiliation trackés (clics, ventes, CA)" : "Tracked affiliate links (clicks, sales, revenue)";
    case "commissions":
      return fr ? "Calcul automatique des commissions" : "Automatic commission calculation";
    case "templates":
      return fr ? "Modèles et historique d'outreach" : "Outreach templates and history";
    case "payout":
      if (/manuel|manual/i.test(item.value)) return fr ? "Paiements créateurs manuels" : "Manual creator payouts";
      return fr ? "Paiements créateurs automatiques via Stripe" : "Automatic creator payouts via Stripe";
    case "includes-starter":
      return fr ? "Tout Starter, plus" : "Everything in Starter, plus";
    case "includes-pro":
      return fr ? "Tout Pro, plus" : "Everything in Pro, plus";
    case "ai":
      return fr ? "Outreach IA illimité" : "Unlimited AI outreach";
    case "creator-dashboard":
      return fr ? "Dashboard dédié à vos créateurs" : "Dedicated dashboard for your creators";
    case "creator-content":
      return fr ? "Upload de contenus et stats de performance" : "Content upload and performance stats";
    case "automation":
      return fr ? "Scripts et briefs inclus" : "Scripts and briefs included";
    case "support":
      return fr ? "Support dédié, réponse prioritaire" : "Dedicated support, priority response";
    default:
      if (!item.value.trim()) return item.label;
      if (leadingNumber) return `${leadingNumber} ${item.label}`;
      return item.value;
  }
}

function BentoFeatures({ features, lang }: { features: PricingHighlight[]; lang: "en" | "fr" }) {
  return (
    <ul className="pb-features">
      {features.map((item) => (
        <li key={item.id}>{formatBentoFeatureLine(item, lang)}</li>
      ))}
    </ul>
  );
}

function PricingTitleSparkle({ lang }: { lang: "en" | "fr" }) {
  return (
    <>
      <span className="section-title-line">
        {lang === "fr" ? "Le prix d'un outil," : "The price of a tool,"}
      </span>
      <span className="section-title-line">
        {lang === "fr" ? (
          <>
            le résultat d'une <span className="pricing-ai-word">agence</span>.
          </>
        ) : (
          <>
            the output of an <span className="pricing-ai-word">agency</span>.
          </>
        )}
      </span>
    </>
  );
}

export default function TrackitLanding() {
  const [basicAnnual, setBasicAnnual] = useState(false);
  const [trackitAnnual, setTrackitAnnual] = useState(false);
  const [proAnnual, setProAnnual] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PlanTier>("free");
  const [subscriptionInterval, setSubscriptionInterval] = useState<BillingInterval | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [payingTier, setPayingTier] = useState<LandingPaidTier | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const lang = useLang();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = {
  nav_affiliation: lang === "fr" ? "Affiliation" : "Affiliation",
  nav_pricing: lang === "fr" ? "Tarifs" : "Pricing",
  nav_process: lang === "fr" ? "Processus" : "Process",
  nav_login: lang === "fr" ? "Se connecter" : "Log in",
  nav_cta: lang === "fr" ? "Ouvrir thentrack.it" : "Open thentrack.it",
  hero_badge: lang === "fr" ? "Marketing d'influence, automatisé" : "Influencer marketing, automated",
  hero_title_1: lang === "fr" ? "Trouver des influenceurs." : "Find creators.",
  hero_title_2: lang === "fr" ? "Suivez vos ventes." : "Track sales.",
  hero_title_3: lang === "fr" ? "Payez vos commissions" : "Pay commissions.",
  hero_italic: lang === "fr" ? "A un seul endroit." : "All in one place.",
  hero_sub: lang === "fr" ? "Arrêtez de passer des heures à chercher manuellement sur TikTok. Trackit trouve les bons créateurs pour votre marque, suit chaque vente générée et paie les commissions automatiquement. Sans tableurs. Sans outils à 300€/mois." : `Stop spending hours searching TikTok manually. Trackit finds the right creators for your brand, tracks every sale they drive, and pays commissions automatically. No spreadsheets. No ${formatPricingAmount(300, lang)}/month enterprise tools.`,
  hero_cta: lang === "fr" ? "Commencer" : "Get Started",
  hero_cta_hover: lang === "fr" ? "Gratuit !!" : "For Free!!",
  hero_sub_cta: lang === "fr" ? "Sans carte bancaire" : "No credit card required",
  hero_commission: lang === "fr" ? "Suivi des Commissions" : "Commission Tracking",
  hero_automated: lang === "fr" ? "Automatisé" : "Automated",
  hero_bank_line1: lang === "fr" ? "0€ de Virements" : `${formatPricingAmount(0, lang)} Manual Bank`,
  hero_bank_line2: lang === "fr" ? "Bancaires Manuels" : "Transfers",
  section_title_line1: lang === "fr" ? "Gérer tout votre" : "Manage all your",
  section_title_line2: lang === "fr" ? "affiliation à un seul endroit" : "affiliation in one place",
  section_sub: lang === "fr" ? "De la recherche du créateur parfait au paiement automatique de ses commissions. Conçu pour les marques Shopify sérieuses." : "From finding the perfect creator to paying their commission automatically. Built for Shopify brands who are serious about creator marketing.",
  feat_1_title: lang === "fr" ? "Découverte de Créateurs" : "Creator Discovery",
  feat_1_desc: lang === "fr" ? "Trouvez les bons créateurs, invitez-les, et gardez-les dans Trackit. Profils, listes et invitations restent dans le Workspace : plus de recherche éparpillée entre TikTok, Instagram et des tableurs. Un créateur trouvé est un affilié Trackit, pas un onglet de plus." : "Find the right creators, invite them, and keep them in Trackit. Profiles, lists, and invitations stay in the Workspace: no more searching across TikTok, Instagram, and spreadsheets. A creator you find becomes a Trackit affiliate, not another tab.",
  feat_2_title: lang === "fr" ? "Ask Mino" : "Ask Mino",
  feat_2_desc: lang === "fr" ? "Ask Mino est l'IA du Workspace Trackit. Posez une question en langage naturel : Mino retrouve un créateur, une campagne, un contenu, un script, un lien d'affiliation ou une conversation. Plus besoin de fouiller cinq outils pour savoir où en est une collab." : "Ask Mino is the AI inside the Trackit Workspace. Ask in plain language: Mino finds a creator, a campaign, a piece of content, a script, an affiliate link, or a conversation. No more digging through five tools to see where a collab stands.",
  feat_3_title: lang === "fr" ? "Affiliés et Campagnes" : "Affiliates & Campaigns",
  feat_3_desc: lang === "fr" ? "Campagnes, outreach, inbox, contenus et scripts : tout vit dans Trackit. Envoyez le brief, partagez les contenus de marque, suivez les conversations, et gardez chaque affilié au même endroit. Plus de Drive, plus de tableurs, plus de fils perdus." : "Campaigns, outreach, inbox, content, and scripts all live in Trackit. Send the brief, share brand content, follow conversations, and keep every affiliate in one place. No Drive. No spreadsheets. No lost threads.",
  feat_4_title: lang === "fr" ? "Suivi et Paiements" : "Track and Pay",
  feat_4_desc: lang === "fr" ? "Chaque affilié reçoit un lien d'affiliation Trackit. Chaque vente est attribuée automatiquement, en temps réel. Voyez ce qui est dû, payez les commissions, et gardez le suivi dans le Workspace — sans tableur, sans virement manuel." : "Every affiliate gets a Trackit affiliate link. Every sale is attributed automatically, in real time. See what's owed, pay commissions, and keep tracking in the Workspace — no spreadsheet, no manual bank transfer.",
  process_title: lang === "fr" ? "Processus" : "Process",
  process_sub_line1: lang === "fr" ? "De zéro à votre première" : "From zero to first creator",
  process_sub_line2: lang === "fr" ? "Campagne créateur" : "campaign in",
  process_sub_line3: lang === "fr" ? "en" : "",
  process_sub2: lang === "fr" ? "Quatre étapes simples. Pas d'agence. Pas de contrat enterprise." : "Four simple steps. No agency. No enterprise contract. No complexity.",
  process_1: lang === "fr" ? "Connectez votre boutique Shopify." : "Connect your Shopify store.",
  process_1_sub: lang === "fr" ? "60 secondes. Un clic. C'est fait." : "60 seconds. One click. Done.",
  process_2: lang === "fr" ? "⛶ Trouvez des créateurs dans votre niche." : "⛶ Find creators in your niche.",
  process_2_sub: lang === "fr" ? "Filtrez par plateforme, engagement et localisation." : "Filter by platform, engagement, location, and audience size.",
  process_3: lang === "fr" ? "Envoyez des messages IA personnalisés." : "Send AI personalized outreach.",
  process_3_sub: lang === "fr" ? "Un clic. Message généré. Prêt à envoyer." : "One click. Message generated. Ready to send.",
  process_4: lang === "fr" ? "Suivez les ventes et payez les commissions." : "Track sales and pay commissions.",
  process_4_sub: lang === "fr" ? "Chaque vente suivie. Chaque commission payée automatiquement." : "Every sale tracked. Every commission paid automatically.",
  process_mock_shopify_line1: lang === "fr" ? "Lancez une boutique" : "Start an online",
  process_mock_shopify_line2: lang === "fr" ? "en ligne gratuitement" : "store for free",
  process_mock_inf_title: lang === "fr" ? "Créateurs trouvés :" : "Influencers found :",
  process_mock_reach_out: lang === "fr" ? "Contacter →" : "Reach out →",
  process_mock_see_profiles: lang === "fr" ? "Voir les profils →" : "See Profiles →",
  process_mock_outreach_1: lang === "fr" ? "« Salut, j'ai vu tes posts... »" : "\"Hey seen your posts...\"",
  process_mock_outreach_2: lang === "fr" ? "« Je vous contacte car... »" : "\"I reach to you because...\"",
  process_mock_outreach_3: lang === "fr" ? "« Seriez-vous intéressé par... »" : "\"Are you interested in a...\"",
  why_title: lang === "fr" ? "Pourquoi Trackit ?" : "Why Trackit?",
  why_sub: lang === "fr" ? "Conçu pour les marques comme la vôtre" : "Built for brands like yours",
  why_sub_line1: lang === "fr" ? "Conçu pour les marques" : "",
  why_sub_line2: lang === "fr" ? "comme la vôtre" : "",
  why_sub2: lang === "fr" ? "Pas pour les entreprises." : "Not for enterprise",
  why_desc: lang === "fr" ? "Chaque autre outil a été conçu pour des agences avec 10 personnes et 500€/mois. Trackit a été conçu pour les marques Shopify agiles qui ont besoin de résultats." : "Every other tool was built for agencies with 10 people and $500/month budgets. Trackit was built for lean Shopify brands who need results not complexity.",
  pricing_sub: lang === "fr" ? "Commencez gratuitement. Résiliez à tout moment. Pas de frais cachés." : "Start free. Upgrade when you're ready. Cancel anytime. No hidden fees. No annual contracts forced on you.",
  pricing_save: annualFreeMonthsBadge(lang),
  pricing_scale_pill: lang === "fr" ? "Agences & multi-marques" : "Agencies & multi-brand",
  pricing_most_popular: lang === "fr" ? "Le plus populaire" : "Most Popular",
  pricing_cta: lang === "fr" ? "Commencer" : "Get Started",
  pricing_month: lang === "fr" ? "/mois" : "/month",
  pricing_year: lang === "fr" ? "par an" : "/year",
  pricing_annually: lang === "fr" ? "Annuel" : "Annually",
  pricing_everything_in_pro: lang === "fr" ? "Tout le plan Pro" : "Everything in Pro",
  footer_social: lang === "fr" ? "Réseaux" : "Social Media",
  footer_reach: lang === "fr" ? "Contactez-nous" : "Reach out to us",
  footer_contact_title: lang === "fr" ? "Écrivez-nous par e-mail" : "Contact us by email",
  footer_contact_sub: lang === "fr" ? "On vous répond sous 24h." : "Our team replies within 24h.",
  footer_col_features: lang === "fr" ? "Produit" : "Product",
  footer_col_explore: lang === "fr" ? "Explorer" : "Explore",
  footer_col_help: lang === "fr" ? "Aide" : "Help",
  footer_discovery: lang === "fr" ? "Découverte de créateurs" : "Creator Discovery",
  footer_mino: "Ask Mino",
  footer_campaigns: lang === "fr" ? "Affiliés et campagnes" : "Affiliates & Campaigns",
  footer_trackpay: lang === "fr" ? "Suivi et paiements" : "Track and Pay",
  footer_shopify: lang === "fr" ? "Suivi Shopify" : "Shopify tracking",
  footer_pricing: lang === "fr" ? "Tarifs" : "Pricing",
  footer_faq: "FAQ",
  footer_contact: "Contact",
  footer_blog: lang === "fr" ? "Blog" : "Blog",
  footer_solutions: lang === "fr" ? "Solutions" : "Solutions",
  footer_about: lang === "fr" ? "À propos" : "About",
  footer_rights: lang === "fr" ? "Tous droits réservés." : "All rights reserved.",
  footer_terms: lang === "fr" ? "Conditions générales" : "Terms of Service",
  footer_privacy: lang === "fr" ? "Politique de confidentialité" : "Privacy Policy",
  faq_title: lang === "fr" ? "Questions fréquentes sur Trackit" : "Frequently asked questions about Trackit",
  faq_title_line1: lang === "fr" ? "Encore une question ?" : "Still have a question?",
  faq_title_line2: lang === "fr" ? "Voici les réponses." : "Here are the answers.",
  faq_subtitle: lang === "fr"
    ? "Workspace, liens Trackit, Shopify, Ask Mino. Tout ce qu'il faut savoir avant de commencer."
    : "Workspace, Trackit links, Shopify, Ask Mino. Everything you need before you start.",
  traditional_title: lang === "fr" ? "Plateformes Traditionnelles" : "Traditional Platforms",
  trad_1: lang === "fr" ? "Découverte de créateurs" : "Creator discovery",
  trad_2: lang === "fr" ? "Génération de messages IA" : "AI outreach generation",
  trad_3: lang === "fr" ? "Intégration Shopify" : "Shopify integration",
  trad_4: lang === "fr" ? "Suivi automatique des ventes" : "Automatic sale tracking",
  trad_5: lang === "fr" ? "Paiements en un clic" : "One click payouts",
  trad_6: lang === "fr" ? "Prix juste" : "Fair price",
  trad_7: lang === "fr" ? "Conçu pour les petites marques" : "Built for small brands",
  trad_8: lang === "fr" ? "Délais de données de 8 heures" : "8-hour data delays",
  trad_9: lang === "fr" ? "Coûts qui explosent à l'échelle" : "Cost spikes at scale",
  trad_10: lang === "fr" ? "Données fragmentées" : "Fragmented data lakes",
  trackit_1: lang === "fr" ? "Suivi des ventes et commissions en temps réel" : "Real-time sales & commission tracking",
  trackit_2: lang === "fr" ? "Découverte de créateurs avec filtres avancés" : "Creator discovery with advanced filters",
  trackit_3: lang === "fr" ? "Outreach IA et relances automatiques" : "AI outreach and automatic follow-ups",
  trackit_4: lang === "fr" ? "Campagnes, scripts et portail créateur" : "Campaigns, scripts, and creator portal",
  trackit_5: lang === "fr" ? "Intégration Shopify et liens d'affiliation" : "Shopify integration and affiliate links",
  trackit_6: lang === "fr" ? "Paiements manuels et automatiques via Stripe" : "Manual and automatic payouts via Stripe",
  trackit_7: lang === "fr" ? "Analytiques campagnes et créateurs" : "Campaign and creator analytics",
  trackit_8: lang === "fr" ? "Import CSV et gestion de listes" : "CSV import and list management",
  trackit_9: lang === "fr" ? "Tarifs transparents, sans frais cachés" : "Transparent pricing, no hidden fees",
  trackit_10: lang === "fr" ? "Conçu pour les marques DTC et agences" : "Built for DTC brands and agencies",
};

  const growthPricingFeatures = getPlanPricingHighlights("basic", lang);
  const proPricingFeatures = getPlanPricingHighlights("pro", lang);
  const scalePricingFeatures = getPlanPricingHighlights("scale", lang);
  const plan = normalizePlan(currentPlan);
  const currency = checkoutCurrencyFromLang(lang);
  const starterName = planDisplayName("basic", lang);
  const proName = planDisplayName("pro", lang);
  const businessName = planDisplayName("scale", lang);
  const faqItems = lang === "fr" ? HOME_FAQ_FR : HOME_FAQ_EN;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/billing/plan", { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) {
            setCurrentPlan("free");
            setSubscriptionInterval(null);
          }
          return;
        }
        const payload = await res.json().catch(() => ({})) as {
          plan?: string;
          billingInterval?: BillingInterval | null;
        };
        if (cancelled) return;
        setCurrentPlan(normalizePlan(payload.plan));
        setSubscriptionInterval(payload.billingInterval ?? null);
      } catch {
        if (!cancelled) {
          setCurrentPlan("free");
          setSubscriptionInterval(null);
        }
      } finally {
        if (!cancelled) setPlanLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const growthAction = planCtaAction(plan, "basic", subscriptionInterval, basicAnnual);
  const proAction = planCtaAction(plan, "pro", subscriptionInterval, trackitAnnual);
  const scaleAction = planCtaAction(plan, "scale", subscriptionInterval, proAnnual);

  const growthCtaLabel = planCtaLabel(lang, growthAction, starterName, plan, "basic", subscriptionInterval, basicAnnual);
  const proCtaLabel = planCtaLabel(lang, proAction, proName, plan, "pro", subscriptionInterval, trackitAnnual);
  const scaleCtaLabel = planCtaLabel(lang, scaleAction, businessName, plan, "scale", subscriptionInterval, proAnnual);

  const payingLabel = lang === "fr" ? "Paiement…" : "Paying…";
  const portalLabel = lang === "fr" ? "Chargement…" : "Loading…";

  const startCheckout = async (tier: LandingPaidTier, annual: boolean) => {
    setPayingTier(tier);
    try {
      const paid = LANDING_TO_PAID[tier];
      const priceId =
        paid === "basic"
          ? getGrowthPriceId(currency, annual)
          : paid === "pro"
            ? getProPriceId(currency, annual)
            : getScalePriceId(currency, annual);
      if (!priceId?.trim()) {
        alert("Pricing not configured. Please contact support.");
        return;
      }
      await handleUpgrade(priceId, {
        cancelUrl: window.location.href,
        tier: paid === "basic" ? "growth" : paid,
        currency,
        annual,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not start checkout");
    } finally {
      setPayingTier(null);
    }
  };

  const onPaidPlanClick = async (tier: LandingPaidTier, annual: boolean) => {
    const action = planCtaAction(plan, LANDING_TO_PAID[tier], subscriptionInterval, annual);
    if (action === "current") return;
    if (action === "downgrade") {
      setPortalLoading(true);
      try {
        await openStripeBillingPortal();
      } finally {
        setPortalLoading(false);
      }
      return;
    }
    await startCheckout(tier, annual);
  };

  const handleCheckout = async (planKey: LandingPaidTier, annual?: boolean) => {
    await onPaidPlanClick(planKey, Boolean(annual));
  };

  const renderPaidCta = (
    tier: LandingPaidTier,
    annual: boolean,
    action: ReturnType<typeof planCtaAction>,
    label: string,
    className: string,
  ) => {
    const isCurrent = action === "current";
    const isLoading = payingTier === tier || (portalLoading && action === "downgrade");
    const text = planLoading
      ? lang === "fr"
        ? "Chargement…"
        : "Loading…"
      : isLoading
        ? payingTier === tier
          ? payingLabel
          : portalLabel
        : label;

    return (
      <button
        type="button"
        onClick={() => void handleCheckout(tier, annual)}
        className={className}
        disabled={isCurrent || isLoading || planLoading}
        style={isCurrent ? disabledPricingCtaStyle : undefined}
      >
        {text}
        {!isCurrent && !isLoading && !planLoading ? <span aria-hidden> →</span> : null}
      </button>
    );
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    document.querySelectorAll(".fade-up").forEach((el) => {
      observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden">
      <HeroPreviewShell />
      {/* TRACKIT SECTION */}
      <section className="section" id="features">
        <ChaoticWorkSection lang={lang} />

        <h2 className="section-title fade-up fade-up-delay-1">
          <span className="section-title-line">{t.section_title_line1}</span>
          <span className="section-title-line">
            {lang === "fr" ? (
              <>
                affiliation à un seul{" "}
                <span className="features-title-end">
                  endroit
                  <span className="features-icon-dock" aria-hidden>
                    <span className="features-icon-dock__card" />
                  </span>
                </span>
              </>
            ) : (
              <>
                affiliation in one{" "}
                <span className="features-title-end">
                  place
                  <span className="features-icon-dock" aria-hidden>
                    <span className="features-icon-dock__card" />
                  </span>
                </span>
              </>
            )}
          </span>
        </h2>
        <p className="section-sub fade-up fade-up-delay-2">
          {t.section_sub}
        </p>

        <div className="dashboard-wrap fade-up fade-up-delay-3">
          <video
            src="https://res.cloudinary.com/k40jzw77/video/upload/v1785269585/exporthatshi_q5mp9i.mp4"
            autoPlay
            loop
            muted
            playsInline
            aria-label="Trackit dashboard"
          />
        </div>

        <div className="features-grid">
          <div className="feature">
            <div className="feature-title">
              <span className="feature-icon-wrapper">
                <svg
                  className="feature-icon"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
                  <ellipse cx="12" cy="12" rx="4" ry="9" stroke="currentColor" strokeWidth="1.6" />
                  <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </span>
              {t.feat_1_title}
            </div>
            <div className="feature-desc">
              {highlightFeatureTerm(t.feat_1_desc, "Trackit")}
            </div>
          </div>
          <div className="feature">
            <div className="feature-title">
              <span className="feature-icon-wrapper feature-icon-wrapper--mino">
                <MinoCompanion />
              </span>
              {t.feat_2_title}
            </div>
            <div className="feature-desc">
              {highlightFeatureTerm(t.feat_2_desc, "Mino")}
            </div>
          </div>
          <div className="feature">
            <div className="feature-title">
              <span className="feature-icon-wrapper">
                <svg
                  className="feature-icon"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <line x1="12" y1="3" x2="12" y2="6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="12" y1="18" x2="12" y2="21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="3" y1="12" x2="6" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="18" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="5.6" y1="5.6" x2="7.7" y2="7.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <line
                    x1="16.3"
                    y1="16.3"
                    x2="18.4"
                    y2="18.4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <line
                    x1="5.6"
                    y1="18.4"
                    x2="7.7"
                    y2="16.3"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <line
                    x1="16.3"
                    y1="7.7"
                    x2="18.4"
                    y2="5.6"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              {t.feat_3_title}
            </div>
            <div className="feature-desc">
              {highlightFeatureTerm(t.feat_3_desc, lang === "fr" ? "contenus" : "content")}
            </div>
          </div>
          <div className="feature">
            <div className="feature-title">
              <span className="feature-icon-wrapper">
                <svg
                  className="feature-icon"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M8 4v16M8 20l-3-3M8 20l3-3"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M16 20V4M16 4l-3 3M16 4l3 3"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              {t.feat_4_title}
            </div>
            <div className="feature-desc">
              {highlightFeatureTerm(t.feat_4_desc, lang === "fr" ? "lien d'affiliation Trackit" : "Trackit affiliate link")}
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="section" id="pricing">
        <h2 className="section-title fade-up fade-up-delay-1">
          <PricingTitleSparkle lang={lang} />
        </h2>
        <p className="section-sub fade-up fade-up-delay-2">
          {t.pricing_sub}
        </p>

        <div className="pricing-grid pricing-bento">
          <article className="pb-card fade-up fade-up-delay-3">
            <div className="pb-card__head">
              <div className="pb-card__title-row">
                <h3 className="pb-card__name">{starterName}</h3>
                <span className={`pb-badge pb-badge--soft${basicAnnual ? " is-on" : ""}`}>
                  {basicAnnual ? t.pricing_save : t.pricing_annually}
                </span>
              </div>
              <button
                type="button"
                className={`pb-switch${basicAnnual ? " is-on" : ""}`}
                aria-label="Toggle billing"
                aria-pressed={basicAnnual}
                onClick={() => setBasicAnnual((on) => !on)}
              >
                <span />
              </button>
            </div>
            <p className="pb-card__headline">
              <span className="is-strong">{lang === "fr" ? "Vos premières ventes." : "Your first sales."}</span>
              <span className="is-mute">{lang === "fr" ? "Lancez vos affiliés Trackit." : "Launch your Trackit affiliates."}</span>
            </p>
            <div className="pb-card__buy">
              <div className="pb-price">
                <span className="pb-price__amount">
                  {formatPricingAmount(basicAnnual ? getPlanAnnualMonthlyEquivalent("basic") : PLAN_PRICES.growthMonthly, lang)}
                </span>
                <span className="pb-price__period">{t.pricing_month}</span>
              </div>
              {basicAnnual ? (
                <div className="pb-price__sub">{annualBilledSubtitle(getPlanAnnualTotal("basic"), lang)}</div>
              ) : null}
              {renderPaidCta("growth", basicAnnual, growthAction, growthCtaLabel, "pb-cta")}
            </div>
            <BentoFeatures features={growthPricingFeatures} lang={lang} />
          </article>

          <article className="pb-card pb-card--dark fade-up fade-up-delay-4">
            <div className="pb-card__head">
              <div className="pb-card__title-row">
                <h3 className="pb-card__name">{proName}</h3>
                <span className="pb-badge pb-badge--dark">{t.pricing_most_popular}</span>
              </div>
              <button
                type="button"
                className={`pb-switch${trackitAnnual ? " is-on" : ""}`}
                aria-label="Toggle billing"
                aria-pressed={trackitAnnual}
                onClick={() => setTrackitAnnual((on) => !on)}
              >
                <span />
              </button>
            </div>
            <p className="pb-card__headline">
              <span className="is-strong">{lang === "fr" ? "Pour les marques qui" : "For brands ready to"}</span>
              <span className="is-mute">{lang === "fr" ? "opèrent de bout en bout." : "run campaigns end to end."}</span>
            </p>
            <div className="pb-card__buy">
              <div className="pb-price">
                <span className="pb-price__amount">
                  {formatPricingAmount(trackitAnnual ? getPlanAnnualMonthlyEquivalent("pro") : PLAN_PRICES.proMonthly, lang)}
                </span>
                <span className="pb-price__period">{t.pricing_month}</span>
              </div>
              {trackitAnnual ? (
                <div className="pb-price__sub">{annualBilledSubtitle(getPlanAnnualTotal("pro"), lang)}</div>
              ) : null}
              {renderPaidCta("pro", trackitAnnual, proAction, proCtaLabel, "pb-cta pb-cta--light")}
            </div>
            <div className="pb-card__foot">
              <BentoFeatures features={proPricingFeatures} lang={lang} />
            </div>
          </article>

          <article className="pb-card pb-card--wide fade-up fade-up-delay-5">
            <div className="pb-card__head">
              <div className="pb-card__title-row">
                <h3 className="pb-card__name">{businessName}</h3>
                <span className="pb-badge pb-badge--green">{t.pricing_scale_pill}</span>
              </div>
              <button
                type="button"
                className={`pb-switch${proAnnual ? " is-on" : ""}`}
                aria-label="Toggle billing"
                aria-pressed={proAnnual}
                onClick={() => setProAnnual((on) => !on)}
              >
                <span />
              </button>
            </div>
            <div className="pb-card__wide-body">
              <p className="pb-card__headline">
                <span className="is-mute">{lang === "fr" ? "Pour les équipes qui" : "Great for those who"}</span>
                <span className="is-strong">{lang === "fr" ? "gèrent plusieurs marques." : "want quality + scale."}</span>
              </p>
              <div className="pb-card__buy">
                <div className="pb-price">
                  <span className="pb-price__amount">
                    {formatPricingAmount(proAnnual ? getPlanAnnualMonthlyEquivalent("scale") : PLAN_PRICES.scaleMonthly, lang)}
                  </span>
                  <span className="pb-price__period">{t.pricing_month}</span>
                </div>
                {proAnnual ? (
                  <div className="pb-price__sub">{annualBilledSubtitle(getPlanAnnualTotal("scale"), lang)}</div>
                ) : null}
                {renderPaidCta("scale", proAnnual, scaleAction, scaleCtaLabel, "pb-cta")}
              </div>
            </div>
            <BentoFeatures features={scalePricingFeatures} lang={lang} />
          </article>
        </div>

      </section>

      {/* FAQ — visible for users and search engines */}
      <section className="seo-faq" id="faq" aria-labelledby="trackit-faq-title">
        <div className="seo-faq-inner">
          <header className="seo-faq-intro">
            <h2 id="trackit-faq-title" className="seo-faq-title">
              <span className="seo-faq-title-line">{t.faq_title_line1}</span>
              <span className="seo-faq-title-line">{t.faq_title_line2}</span>
            </h2>
            <p className="seo-faq-subtitle">{t.faq_subtitle}</p>
            <div className="seo-faq-links">
              <Link href="/blog">{t.footer_blog}</Link>
              <Link href="/solutions/creator-affiliate-platform">{t.footer_solutions}</Link>
            </div>
          </header>
          <div className="seo-faq-list">
            {faqItems.map((item, i) => {
              const open = faqOpen === i;
              return (
                <div key={item.question} className={`seo-faq-item${open ? " seo-faq-item--open" : ""}`}>
                  <button
                    type="button"
                    className="seo-faq-question"
                    aria-expanded={open}
                    onClick={() => setFaqOpen(open ? null : i)}
                  >
                    <span className="seo-faq-index">{String(i + 1).padStart(2, "0")}</span>
                    <span className="seo-faq-q">{item.question}</span>
                    <span className="seo-faq-toggle" aria-hidden />
                  </button>
                  {open ? <div className="seo-faq-answer">{item.answer}</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="prefooter" aria-label={lang === "fr" ? "Lancer Trackit" : "Start Trackit"}>
        <div className="prefooter__card">
          <div className="prefooter__glow" aria-hidden />
          <div className="prefooter__copy">
            <h2 className="prefooter__title">
              <span>{lang === "fr" ? "Sortez du chaos." : "Leave the chaos."}</span>
              <span>{lang === "fr" ? "Lancez votre Workspace." : "Open your Workspace."}</span>
            </h2>
            <p className="prefooter__sub">
              {lang === "fr"
                ? "Découverte, outreach, contenus, liens Trackit et paiements. Enfin au même endroit."
                : "Discovery, outreach, content, Trackit links, and payouts. Finally in one place."}
            </p>
            <Link href="/auth" className="prefooter__cta">
              {lang === "fr" ? "Commencer" : "Get started"}
            </Link>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="footer__inner">
          <div className="footer-top">
            <span className="footer-name">
              Trackit<span>.</span>
            </span>
            <div className="footer-socials">
              <span className="footer-socials__label">{t.footer_social}</span>
              <SocialFooterLinks />
            </div>
          </div>

          <div className="footer-body">
            <div className="footer-reach">
              <h2 className="footer-reach__title">{t.footer_reach}</h2>
              <a className="footer-contact" href="mailto:hello@thentrack.it">
                <span className="footer-contact__icon" aria-hidden>
                  <svg viewBox="0 0 24 24" width="18" height="18">
                    <path
                      fill="currentColor"
                      d="M4.5 6.75A2.25 2.25 0 0 1 6.75 4.5h10.5A2.25 2.25 0 0 1 19.5 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25H6.75a2.25 2.25 0 0 1-2.25-2.25V6.75zm2.4.75 5.1 3.83L17.1 7.5H6.9zm11.1 1.72-5.28 3.96a1.5 1.5 0 0 1-1.74 0L5.7 9.97v7.28h12.3V9.97z"
                    />
                  </svg>
                </span>
                <span className="footer-contact__copy">
                  <strong>{t.footer_contact_title}</strong>
                  <span>{t.footer_contact_sub}</span>
                </span>
              </a>
            </div>

            <div className="footer-grid">
              <nav className="footer-col" aria-label={t.footer_col_features}>
                <p className="footer-col__title">{t.footer_col_features}</p>
                <Link href="/#features">{t.footer_discovery}</Link>
                <Link href="/#features">{t.footer_mino}</Link>
                <Link href="/#features">{t.footer_campaigns}</Link>
                <Link href="/#features">{t.footer_trackpay}</Link>
              </nav>
              <nav className="footer-col" aria-label={t.footer_col_explore}>
                <p className="footer-col__title">{t.footer_col_explore}</p>
                <Link href="/solutions">{t.footer_solutions}</Link>
                <Link href="/solutions/shopify-creator-tracking">{t.footer_shopify}</Link>
                <Link href="/blog">{t.footer_blog}</Link>
                <Link href="/#pricing">{t.footer_pricing}</Link>
              </nav>
              <nav className="footer-col" aria-label={t.footer_col_help}>
                <p className="footer-col__title">{t.footer_col_help}</p>
                <Link href="/#faq">{t.footer_faq}</Link>
                <Link href="/contact">{t.footer_contact}</Link>
                <Link href="/about">{t.footer_about}</Link>
              </nav>
            </div>
          </div>

          <div className="footer__mark" aria-hidden>
            Trackit.
          </div>

          <div className="footer-bottom">
            <div>©2026 Trackit. {t.footer_rights}</div>
            <div className="footer-legal">
              <Link href="/terms">{t.footer_terms}</Link>
              <Link href="/privacy">{t.footer_privacy}</Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
