"use client";

import { Instrument_Serif } from "next/font/google";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { formatCurrency } from "@/lib/useCurrency";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: "italic",
});

export default function TrackitLanding() {
  const heroDoodleRef = useRef<HTMLImageElement>(null);
  const heroCursorRef = useRef<HTMLImageElement>(null);
  const heroMoneyRef = useRef<HTMLImageElement>(null);
  const [basicAnnual, setBasicAnnual] = useState(false);
  const [trackitAnnual, setTrackitAnnual] = useState(false);
  const [proAnnual, setProAnnual] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const lang = useLang();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = {
  nav_features: lang === "fr" ? "Fonctionnalités" : "Features",
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
  hero_sub: lang === "fr" ? "Arrêtez de passer des heures à chercher manuellement sur TikTok. Trackit trouve les bons créateurs pour votre marque, suit chaque vente générée et paie les commissions automatiquement. Sans tableurs. Sans outils à 300€/mois." : `Stop spending hours searching TikTok manually. Trackit finds the right creators for your brand, tracks every sale they drive, and pays commissions automatically. No spreadsheets. No ${formatCurrency(300, lang)}/month enterprise tools.`,
  hero_cta: lang === "fr" ? "Commencer gratuitement" : "Get started for Free",
  hero_sub_cta: lang === "fr" ? "Sans carte bancaire" : "No credit card required",
  hero_commission: lang === "fr" ? "Suivi des Commissions" : "Commission Tracking",
  hero_automated: lang === "fr" ? "Automatisé" : "Automated",
  hero_bank: lang === "fr" ? "0€ de Virements Bancaires Manuels" : `${formatCurrency(0, lang)} Manual Bank Transfers`,
  hero_trusted: lang === "fr" ? "Fait confiance par plus de 2 000 boutiques Shopify" : "Trusted by over 2,000 of the best Shopify Stores",
  section_does_everything: lang === "fr" ? "Trackit fait tout." : "Trackit does everything.",
  section_in_one_place: lang === "fr" ? "Au même endroit" : "In one place",
  section_sub: lang === "fr" ? "De la recherche du créateur parfait au paiement automatique de ses commissions. Conçu pour les marques Shopify sérieuses." : "From finding the perfect creator to paying their commission automatically. Built for Shopify brands who are serious about creator marketing.",
  feat_1_title: lang === "fr" ? "Recherche Intelligente de Créateurs" : "Smart Creator Discovery",
  feat_1_desc: lang === "fr" ? "Recherchez parmi 250M+ créateurs sur TikTok, Instagram et YouTube. Filtrez par niche, taux d'engagement, abonnés et localisation." : "Search 250M+ creators across TikTok, Instagram, and YouTube. Filter by niche, engagement rate, follower count, and location. Find creators whose audience is exactly your customer.",
  feat_2_title: lang === "fr" ? "Génération de Messages IA" : "AI Outreach Generation",
  feat_2_desc: lang === "fr" ? "Arrêtez d'envoyer des DMs copiés-collés. Trackit génère un message personnalisé pour chaque créateur." : "Stop sending generic copy-paste DMs. Trackit generates a personalized outreach message for every creator based on their content style and your product. Higher response rates. Less work.",
  feat_3_title: lang === "fr" ? "Suivi Automatique des Ventes" : "Automatic Sale Tracking",
  feat_3_desc: lang === "fr" ? "Connectez votre boutique Shopify. Chaque créateur reçoit un lien de suivi unique. Chaque vente attribuée automatiquement." : "Connect your Shopify store. Every creator gets a unique tracking link or discount code. Every sale attributed automatically in real time. No manual tracking. No guessing.",
  feat_4_title: lang === "fr" ? "Paiement des Commissions en Un Clic" : "One Click Commission Payouts",
  feat_4_desc: lang === "fr" ? "Voyez exactement ce que chaque créateur a gagné. Cliquez. L'argent va directement sur leur compte." : "See exactly what every creator earned. Hit send. Money goes directly to their account. No bank transfers. No PayPal drama. No spreadsheet math.",
  pain_title: lang === "fr" ? "Vous faites ça" : "You've been doing",
  pain_title_2: lang === "fr" ? "à la dure." : "this the hard way.",
  pain_1_title: lang === "fr" ? "Scroll TikTok pendant des heures." : "TikTok scrolling",
  pain_1_desc: lang === "fr" ? "Vous faites défiler TikTok et Instagram pendant des heures pour trouver des créateurs. La plupart des outils vous donnent une base de données inutile." : "You scroll TikTok and Instagram for hours trying to find creators who actually fit your brand. Most tools give you a giant useless database.",
  pain_2_title: lang === "fr" ? "Commissions suivies dans des tableurs." : "Commissions tracked in spreadsheets.",
  pain_2_desc: lang === "fr" ? "Chaque mois vous calculez manuellement qui a gagné quoi et envoyez des virements PayPal individuels. Ça prend une journée entière." : "Every month you manually calculate who earned what and send individual PayPal transfers. It takes a full day and you still make mistakes.",
  pain_3_title: lang === "fr" ? "Outils enterprise inabordables." : "Enterprise tools you can't afford.",
  pain_3_desc: lang === "fr" ? "Modash est à 299€/mois. Aspire à 500€/mois. Vous avez juste besoin de quelque chose qui fonctionne sans ruiner votre budget." : `Modash is ${formatCurrency(299, lang)}/month. Aspire is ${formatCurrency(500, lang)}/month. You're a lean brand. You just need something that works without breaking the bank.`,
  process_title: lang === "fr" ? "⇄ Processus" : "⇄ Process",
  process_sub_line1: lang === "fr" ? "De zéro à votre première" : "From zero to first creator",
  process_sub_line2: lang === "fr" ? "campagne créateur en 10" : "campaign in 10 minutes",
  process_sub2: lang === "fr" ? "Quatre étapes simples. Pas d'agence. Pas de contrat enterprise." : "Four simple steps. No agency. No enterprise contract. No complexity.",
  process_1: lang === "fr" ? "Connectez votre boutique Shopify." : "Connect your Shopify store.",
  process_1_sub: lang === "fr" ? "60 secondes. Un clic. C'est fait." : "60 seconds. One click. Done.",
  process_2: lang === "fr" ? "⛶ Trouvez des créateurs dans votre niche." : "⛶ Find creators in your niche.",
  process_2_sub: lang === "fr" ? "Filtrez par plateforme, engagement et localisation." : "Filter by platform, engagement, location, and audience size.",
  process_3: lang === "fr" ? "Envoyez des messages IA personnalisés." : "Send AI personalized outreach.",
  process_3_sub: lang === "fr" ? "Un clic. Message généré. Prêt à envoyer." : "One click. Message generated. Ready to send.",
  process_4: lang === "fr" ? "Suivez les ventes et payez les commissions." : "Track sales and pay commissions.",
  process_4_sub: lang === "fr" ? "Chaque vente suivie. Chaque commission payée automatiquement." : "Every sale tracked. Every commission paid automatically.",
  why_title: lang === "fr" ? "Pourquoi Trackit" : "Why Trackit",
  why_sub: lang === "fr" ? "Conçu pour les marques comme la vôtre." : "Built for brands like yours.",
  why_sub2: lang === "fr" ? "Pas pour les entreprises" : "Not for enterprise",
  why_desc: lang === "fr" ? "Chaque autre outil a été conçu pour des agences avec 10 personnes et 500€/mois. Trackit a été conçu pour les marques Shopify agiles qui ont besoin de résultats." : `Every other tool was built for agencies with 10 people and ${formatCurrency(500, lang)}/month budgets. Trackit was built for lean Shopify brands who need results not complexity.`,
  pricing_title: lang === "fr" ? "Des tarifs simples. Sans surprises" : "Simple pricing. No surprises",
  pricing_sub: lang === "fr" ? "Commencez gratuitement. Résiliez à tout moment. Pas de frais cachés." : "Start free. Upgrade when you're ready. Cancel anytime. No hidden fees. No annual contracts forced on you.",
  pricing_save: lang === "fr" ? "−20% annuel" : "Save 20% annual",
  pricing_basic_desc: lang === "fr" ? "L'entrée idéale pour lancer votre programme créateurs." : "Your entry point — start fast without overcommitting.",
  pricing_pro_desc: lang === "fr" ? "Pour les agences et les équipes qui passent à l'échelle." : "Built for agencies and teams scaling creator programs.",
  pricing_scale_desc: lang === "fr" ? "Tout Pro, plus la puissance multi-boutiques et l'automatisation." : "Everything in Pro, plus multi-store power and full automation.",
  pricing_trackit_desc: lang === "fr" ? "Le meilleur rapport qualité-prix. Le choix de la plupart des marques." : "Best value. The plan most brands choose.",
  pricing_scale_pill: lang === "fr" ? "Pour les agences" : "For agencies",
  pricing_most_popular: lang === "fr" ? "Le plus populaire" : "Most Popular",
  pricing_free_desc: lang === "fr" ? "Commencez sans engagement." : "Get started with no commitment.",
  pricing_cta: lang === "fr" ? "Commencer" : "Get Started",
  pricing_free_cta: lang === "fr" ? "Démarrer gratuitement →" : "Start free →",
  pricing_month: lang === "fr" ? "/mois" : "/month",
  pricing_year: lang === "fr" ? "par an" : "/year",
  pricing_annually: lang === "fr" ? "Annuel" : "Annually",
  pricing_everything_in_pro: lang === "fr" ? "Tout le plan Pro" : "Everything in Pro",
  // Free
  feat_5_discoveries_day: lang === "fr" ? "5 découvertes de créateurs/jour" : "5 creator discoveries/day",
  feat_10_results_per_search: lang === "fr" ? "10 résultats par recherche" : "10 results per search",
  feat_1_active_campaign: lang === "fr" ? "1 campagne active" : "1 active campaign",
  feat_5_managed_creators: lang === "fr" ? "5 créateurs gérés" : "5 managed creators",
  feat_1_ai_outreach_day: lang === "fr" ? "1 message IA/jour" : "1 AI outreach/day",
  feat_manual_payouts_only: lang === "fr" ? "Paiements manuels uniquement" : "Manual payouts only",
  feat_basic_analytics: lang === "fr" ? "Analytiques de base" : "Basic analytics",
  // Growth
  feat_30_discoveries_day: lang === "fr" ? "30 découvertes/jour" : "30 discoveries/day",
  feat_50_results_per_search: lang === "fr" ? "50 résultats par recherche" : "50 results per search",
  feat_3_active_campaigns: lang === "fr" ? "3 campagnes actives" : "3 active campaigns",
  feat_25_managed_creators: lang === "fr" ? "25 créateurs gérés" : "25 managed creators",
  feat_unlimited_ai_outreach: lang === "fr" ? "Messages IA illimités" : "Unlimited AI outreach",
  feat_templates_save_import: lang === "fr" ? "Modèles d'outreach (sauvegarde & import)" : "Outreach templates (save & import)",
  feat_manual_payouts_methods: lang === "fr" ? "Paiements manuels (PayPal, Revolut, IBAN)" : "Manual payouts (PayPal, Revolut, IBAN)",
  feat_full_analytics: lang === "fr" ? "Tableau de bord analytique complet" : "Full analytics dashboard",
  feat_shopify_integration: lang === "fr" ? "Intégration Shopify" : "Shopify integration",
  feat_affiliate_links: lang === "fr" ? "Liens d'affiliation & suivi" : "Affiliate links & tracking",
  // Pro
  feat_unlimited_discoveries: lang === "fr" ? "Découvertes illimitées" : "Unlimited discoveries",
  feat_unlimited_results: lang === "fr" ? "Résultats illimités" : "Unlimited results",
  feat_10_active_campaigns: lang === "fr" ? "10 campagnes actives" : "10 active campaigns",
  feat_100_managed_creators: lang === "fr" ? "100 créateurs gérés" : "100 managed creators",
  feat_all_templates_csv: lang === "fr" ? "Tous les modèles + import CSV en masse" : "All templates + bulk import via CSV",
  feat_manual_auto_payouts: lang === "fr" ? "Paiements manuels + automatiques" : "Manual + auto payouts",
  feat_advanced_analytics_roi: lang === "fr" ? "Analytiques avancées + suivi ROI" : "Advanced analytics + ROI tracking",
  feat_automation_workflows: lang === "fr" ? "Workflows d'automatisation" : "Automation workflows",
  feat_priority_support: lang === "fr" ? "Support prioritaire" : "Priority support",
  // Scale
  feat_unlimited_campaigns: lang === "fr" ? "Campagnes illimitées" : "Unlimited campaigns",
  feat_unlimited_managed_creators: lang === "fr" ? "Créateurs gérés illimités" : "Unlimited managed creators",
  feat_bulk_csv_unlimited: lang === "fr" ? "Import CSV en masse (illimité)" : "Bulk CSV import (unlimited)",
  feat_auto_payouts_stripe: lang === "fr" ? "Paiements auto (Stripe Connect)" : "Auto payouts (Stripe Connect)",
  feat_full_automation_agent: lang === "fr" ? "Agent d'automatisation complet" : "Full automation agent",
  feat_white_label_outreach: lang === "fr" ? "Outreach en marque blanche" : "White-label outreach",
  feat_multi_store_shopify_3: lang === "fr" ? "Shopify multi-boutiques (3 boutiques)" : "Multi-store Shopify (3 stores)",
  feat_dedicated_support: lang === "fr" ? "Support dédié" : "Dedicated support",
  footer_tagline: lang === "fr" ? "Une plateforme créée par des fondateurs e-com pour des fondateurs e-com" : "A Platform made by e-com founders to e-com founders",
  footer_rights: lang === "fr" ? "Tous droits réservés." : "All rights reserved.",
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
  trackit_1: lang === "fr" ? "Suivi des profits en temps réel" : "Real-time profit mapping",
  trackit_2: lang === "fr" ? "Traitement illimité des événements" : "Unlimited event processing",
  trackit_3: lang === "fr" ? "IA transparente et explicable" : "Transparent AI reasoning",
  trackit_4: lang === "fr" ? "Segments auto-optimisés" : "Auto-optimized segments",
  trackit_5: lang === "fr" ? "Identité respectueuse de la vie privée" : "Privacy-first identity stitching",
  trackit_6: lang === "fr" ? "Analytiques collaboratives" : "Collaborative analytics playground",
  trackit_7: lang === "fr" ? "Filtrage des bots par IA" : "AI-powered bot filtering",
  trackit_8: lang === "fr" ? "Suivi des marges en direct" : "Live margin tracking",
  trackit_9: lang === "fr" ? "Évolutivité selon l'usage" : "Usage-based scaling",
  trackit_10: lang === "fr" ? "Entrepôt de données unifié" : "Unified data lakehouse",
};

  const pricingCheckIcon = (
    <svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke="#9A9A9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const freePricingFeatures = [
    t.feat_5_discoveries_day,
    t.feat_10_results_per_search,
    t.feat_1_active_campaign,
    t.feat_5_managed_creators,
    t.feat_1_ai_outreach_day,
    t.feat_manual_payouts_only,
    t.feat_basic_analytics,
  ];

  const growthPricingFeatures = [
    t.feat_30_discoveries_day,
    t.feat_50_results_per_search,
    t.feat_3_active_campaigns,
    t.feat_25_managed_creators,
    t.feat_unlimited_ai_outreach,
    t.feat_templates_save_import,
    t.feat_manual_payouts_methods,
    t.feat_full_analytics,
    t.feat_shopify_integration,
    t.feat_affiliate_links,
  ];

  const proPricingFeatures = [
    t.feat_unlimited_discoveries,
    t.feat_unlimited_results,
    t.feat_10_active_campaigns,
    t.feat_100_managed_creators,
    t.feat_unlimited_ai_outreach,
    t.feat_all_templates_csv,
    t.feat_manual_auto_payouts,
    t.feat_advanced_analytics_roi,
    t.feat_shopify_integration,
    t.feat_affiliate_links,
    t.feat_automation_workflows,
    t.feat_priority_support,
  ];

  const scalePricingFeatures = [
    t.pricing_everything_in_pro,
    t.feat_unlimited_campaigns,
    t.feat_unlimited_managed_creators,
    t.feat_bulk_csv_unlimited,
    t.feat_auto_payouts_stripe,
    t.feat_full_automation_agent,
    t.feat_white_label_outreach,
    t.feat_multi_store_shopify_3,
    t.feat_dedicated_support,
  ];

  const handleCheckout = async (plan: "growth" | "pro" | "scale", annual?: boolean) => {
    const isEur = (typeof window !== "undefined" && (localStorage.getItem("trackit_lang") || navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en")) === "fr";
    const monthlyIds: Record<string, string | undefined> = isEur ? {
      growth: process.env.NEXT_PUBLIC_STRIPE_GROWTH_EUR_PRICE_ID,
      pro: process.env.NEXT_PUBLIC_STRIPE_PRO2_EUR_PRICE_ID,
      scale: process.env.NEXT_PUBLIC_STRIPE_SCALE_EUR_PRICE_ID,
    } : {
      growth: process.env.NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID,
      pro: process.env.NEXT_PUBLIC_STRIPE_PRO2_PRICE_ID,
      scale: process.env.NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID,
    };
    const annualIds: Record<string, string | undefined> = isEur ? {
      growth: process.env.NEXT_PUBLIC_STRIPE_GROWTH_ANNUAL_EUR_PRICE_ID,
      pro: process.env.NEXT_PUBLIC_STRIPE_PRO2_ANNUAL_EUR_PRICE_ID,
      scale: process.env.NEXT_PUBLIC_STRIPE_SCALE_ANNUAL_EUR_PRICE_ID,
    } : {
      growth: process.env.NEXT_PUBLIC_STRIPE_GROWTH_ANNUAL_PRICE_ID,
      pro: process.env.NEXT_PUBLIC_STRIPE_PRO2_ANNUAL_PRICE_ID,
      scale: process.env.NEXT_PUBLIC_STRIPE_SCALE_ANNUAL_PRICE_ID,
    };
    const priceId = (annual ? annualIds[plan] : monthlyIds[plan]) ?? monthlyIds[plan];

    if (!priceId) {
      alert("Pricing not configured. Please contact support.");
      return;
    }

    // Get current user so Stripe session is linked to their account
    let userId: string | undefined;
    let email: string | undefined;
    try {
      const { supabase } = await import("@/lib/supabase");
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id;
        email = user?.email ?? undefined;
      }
    } catch {}

    const res = await fetch("/api/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        priceId,
        userId,
        email,
        cancelUrl: window.location.href,
      })
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else alert(data.error || "Could not start checkout");
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
      if (el.closest("#painContainer")) return;
      observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const revealHero = () => {
      document.querySelectorAll(".hero .fade-up").forEach((el) => {
        setTimeout(() => el.classList.add("visible"), 100);
      });
    };
    if (document.readyState === "complete") revealHero();
    else window.addEventListener("load", revealHero);
    return () => window.removeEventListener("load", revealHero);
  }, []);

  useEffect(() => {
    const heroDoodle = heroDoodleRef.current;
    const heroCursor = heroCursorRef.current;
    const heroMoney = heroMoneyRef.current;

    const onScroll = () => {
      const scrollY = window.scrollY;
      if (heroDoodle) {
        heroDoodle.style.transform = `rotate(-5deg) translateY(${-scrollY * 0.35}px)`;
      }
      if (heroCursor) {
        heroCursor.style.transform = `translateY(${-scrollY * 0.5}px)`;
      }
      if (heroMoney) {
        heroMoney.style.transform = `rotate(-10deg) translateY(${-scrollY * 0.45}px)`;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.features-dropdown-container')) {
        setFeaturesOpen(false);
      }
      if (!target.closest('.lang-dropdown-container')) {
        setLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <main className="relative min-h-screen w-full">
      {/* NAVBAR */}
      <nav className="navbar">
        <Link
          href="/"
          className="nav-logo"
          aria-label="Trackit home"
          onClick={(e) => {
            if (window.location.pathname === "/") {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
        >
          <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="Trackit" />
        </Link>
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          style={{
            display: "none",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 6,
            marginLeft: "auto",
          }}
          className="mobile-menu-btn"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round">
            {mobileMenuOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
        <div className="nav-links">
          <div className="features-dropdown-container" style={{ position: "relative" }}>
            <button
              type="button"
              className="features-nav-btn"
              onClick={() => setFeaturesOpen(v => !v)}
            >
              {t.nav_features}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            </button>

            {featuresOpen && (
              <div
                className="features-dropdown-panel"
                style={{
                position: "fixed",
                top: 72,
                left: "50%",
                transform: "translateX(-50%)",
                width: "min(720px, 97vw)",
                background: "#fff",
                borderRadius: 20,
                boxShadow: "0 8px 40px rgba(0,0,0,0.12)",
                border: "1px solid #EFEFEF",
                padding: 24,
                zIndex: 1000,
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 14,
                maxHeight: "min(70vh, 520px)",
                overflowX: "hidden",
                overflowY: "auto"
              }}
              >
                {[
                  {
                    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
                    title: lang === "fr" ? "Recherche de Créateurs" : "Creator Discovery",
                    desc: lang === "fr" ? "Recherchez parmi 250M+ créateurs par niche, engagement et localisation." : "Search 250M+ creators by niche, engagement, and location.",
                    visual: (
                      <div style={{ marginTop: 10, background: "#F8FAFF", borderRadius: 10, padding: 10 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {["@fashionwithemma · 245K", "@fitnessbysarah · 89K", "@travelwithleo · 312K"].map((c, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#555" }}>
                              <div style={{ width: 24, height: 24, borderRadius: "50%", background: ["#FFD6E7","#D6F5E7","#D6E7FF"][i] }} />
                              {c}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  },
                  {
                    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>,
                    title: lang === "fr" ? "Messages IA" : "AI Outreach",
                    desc: lang === "fr" ? "Messages personnalisés rédigés par IA pour chaque créateur." : "Personalized messages written by AI for every creator.",
                    visual: (
                      <div style={{ marginTop: 10, background: "#F8FAFF", borderRadius: 10, padding: 10 }}>
                        <div style={{ fontSize: 11, color: "#555", lineHeight: 1.5, fontStyle: "italic" }}>
                          &quot;Hey Emma, your sustainable fashion content is exactly what our brand stands for...&quot;
                        </div>
                        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                          <div style={{ background: "#0047FF", color: "#fff", borderRadius: 6, padding: "4px 8px", fontSize: 10, fontWeight: 600 }}>Copy</div>
                          <div style={{ background: "#F0F6FF", color: "#0047FF", borderRadius: 6, padding: "4px 8px", fontSize: 10, fontWeight: 600 }}>Regenerate</div>
                        </div>
                      </div>
                    )
                  },
                  {
                    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 11l16-6v14L3 13v-2z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M7 13v5l4 1v-5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>,
                    title: lang === "fr" ? "Suivi des Campagnes" : "Campaign Tracking",
                    desc: lang === "fr" ? "Chaque vente attribuée automatiquement via Shopify." : "Every sale attributed automatically via Shopify.",
                    visual: (
                      <div style={{ marginTop: 10, background: "#F8FAFF", borderRadius: 10, padding: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 10, color: "#9A9A9A" }}>This month</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1A1A" }}>{formatCurrency(4820, lang)}</span>
                        </div>
                        <div style={{ height: 4, background: "#E5E5E5", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: "68%", background: "#0047FF", borderRadius: 4 }} />
                        </div>
                        <div style={{ fontSize: 10, color: "#0047FF", marginTop: 6 }}>↑ 18% vs last month</div>
                      </div>
                    )
                  },
                  {
                    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="13" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M2 11h20" stroke="currentColor" strokeWidth="1.7"/><circle cx="17" cy="15" r="1.2" fill="currentColor"/></svg>,
                    title: lang === "fr" ? "Paiements Automatiques" : "Auto Payouts",
                    desc: lang === "fr" ? "Payez les commissions en un clic via Stripe." : "Pay creator commissions in one click via Stripe.",
                    visual: (
                      <div style={{ marginTop: 10, background: "#F8FAFF", borderRadius: 10, padding: 10 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {[["@emma", 482, "green"], ["@sarah", 124, "green"], ["@leo", 318, "orange"]].map(([name, amount, color], i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                              <span style={{ color: "#555" }}>{name}</span>
                              <span style={{ fontWeight: 600, color: "#1A1A1A" }}>{formatCurrency(amount as number, lang)}</span>
                              <div style={{ background: color === "green" ? "#D1FAE5" : "#FEF3C7", color: color === "green" ? "#065F46" : "#92400E", borderRadius: 4, padding: "2px 6px", fontSize: 10, fontWeight: 600 }}>
                                {color === "green" ? (lang === "fr" ? "Payé" : "Paid") : (lang === "fr" ? "En attente" : "Pending")}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  },
                  {
                    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 17l6-10M7 8a2 2 0 100-4 2 2 0 000 4zM17 20a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
                    title: lang === "fr" ? "Liens d'Affiliation" : "Affiliate Links",
                    desc: lang === "fr" ? "Générez des liens de suivi uniques pour chaque créateur." : "Auto-generate unique tracking links for every creator.",
                    visual: (
                      <div style={{ marginTop: 10, background: "#F8FAFF", borderRadius: 10, padding: 10 }}>
                        <div style={{ fontSize: 10, color: "#9A9A9A", marginBottom: 4 }}>Referral link</div>
                        <div style={{ fontSize: 10, color: "#0047FF", fontFamily: "monospace", wordBreak: "break-all" }}>trackit.app/r/emma_a3f9</div>
                        <div style={{ fontSize: 10, color: "#9A9A9A", marginTop: 6 }}>Discount code: <strong style={{ color: "#1A1A1A" }}>EMMA15</strong></div>
                      </div>
                    )
                  },
                  {
                    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7"/><path d="M12 3a9 9 0 019 9h-9V3z" fill="currentColor" opacity="0.25"/></svg>,
                    title: lang === "fr" ? "Analytiques" : "Analytics",
                    desc: lang === "fr" ? "Voyez quels créateurs génèrent le plus de revenus et pourquoi." : "See which creators drive the most revenue and why.",
                    visual: (
                      <div style={{ marginTop: 10, background: "#F8FAFF", borderRadius: 10, padding: 10 }}>
                        <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 40 }}>
                          {[30, 50, 35, 70, 45, 80, 60].map((h, i) => (
                            <div key={i} style={{ flex: 1, height: `${h}%`, background: i === 5 ? "#0047FF" : "#D6E7FF", borderRadius: "3px 3px 0 0" }} />
                          ))}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                          {["M","T","W","T","F","S","S"].map((d, i) => (
                            <span key={i} style={{ fontSize: 9, color: "#9A9A9A", flex: 1, textAlign: "center" }}>{d}</span>
                          ))}
                        </div>
                      </div>
                    )
                  },
                  {
                    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.7"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>,
                    title: lang === "fr" ? "CRM" : "CRM",
                    desc: lang === "fr" ? "Gérez toutes vos relations créateurs en un seul endroit." : "Manage all your creator relationships in one place.",
                    visual: (
                      <div style={{ marginTop: 10, background: "#F8FAFF", borderRadius: 10, padding: 10 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {[["Emma Laurent", lang === "fr" ? "Partenaire" : "Partnered", "#D1FAE5", "#065F46"], ["Marc Dubois", lang === "fr" ? "Contacté" : "Contacted", "#DBEAFE", "#1E40AF"], ["Julie Chen", lang === "fr" ? "En attente" : "Pending", "#FEF3C7", "#92400E"]].map(([name, status, bg, color], i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: "#1A1A1A" }}>{name}</span>
                              <div style={{ background: bg, color, borderRadius: 4, padding: "2px 6px", fontSize: 9, fontWeight: 600 }}>{status}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  },
                  {
                    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 3v6H3v6h6v6h6v-6h6V9h-6V3H9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>,
                    title: lang === "fr" ? "Intégration Shopify" : "Shopify Integration",
                    desc: lang === "fr" ? "Connectez votre boutique. Chaque vente suivie automatiquement." : "Connect your store. Every sale tracked automatically.",
                    visual: (
                      <div style={{ marginTop: 10, background: "#F8FAFF", borderRadius: 10, padding: 10, display: "flex", alignItems: "center", gap: 10 }}>
                        <img src="/shopify-logo.svg" alt="Shopify" style={{ width: 28, height: 28 }} />
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "#1A1A1A" }}>Store connected</div>
                          <div style={{ fontSize: 10, color: "#0047FF" }}>● Live tracking active</div>
                        </div>
                      </div>
                    )
                  }
                ].map((feature, i) => (
                  <div key={i} style={{ background: "#FAFAFA", border: "1px solid #F0F0F0", borderRadius: 14, padding: 12, cursor: "default" }}>
                    <span style={{ display: "flex", alignItems: "center", marginBottom: 8, color: "#9A9A9A", flexShrink: 0 }}>
                      {feature.icon}
                    </span>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 4 }}>{feature.title}</div>
                    <div style={{ fontSize: 11, color: "#7A7A7A", lineHeight: 1.5, letterSpacing: "-0.01em", fontWeight: 400 }}>{feature.desc}</div>
                    {feature.visual}
                  </div>
                ))}
              </div>
            )}
          </div>
          <a href="/affiliation">{t.nav_affiliation}</a>
          <a href="#pricing">{t.nav_pricing}</a>
          <a href="#process">{t.nav_process}</a>
          <a href="#features">Trackit</a>
        </div>
        <div className="nav-actions">
          <div className="lang-dropdown-container">
            <button
              type="button"
              onClick={() => setLangOpen(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #E5E5E5", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'InstrumentSans', sans-serif", color: "#1A1A1A" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              {lang === "fr" ? "FR" : "EN"}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            </button>

            {langOpen && (
              <div className="lang-dropdown-menu">
                <button
                  type="button"
                  onClick={() => { localStorage.setItem("trackit_lang", "en"); window.location.reload(); }}
                  style={{ width: "100%", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, background: lang === "en" ? "#F0F6FF" : "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: lang === "en" ? 600 : 400, color: lang === "en" ? "#0047FF" : "#1A1A1A", fontFamily: "'InstrumentSans', sans-serif", textAlign: "left" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20M8 4v16" stroke="currentColor" strokeWidth="1.5"/></svg>
                  English
                  {lang === "en" && <svg style={{ marginLeft: "auto" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0047FF" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>}
                </button>
                <button
                  type="button"
                  onClick={() => { localStorage.setItem("trackit_lang", "fr"); window.location.reload(); }}
                  style={{ width: "100%", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, background: lang === "fr" ? "#F0F6FF" : "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: lang === "fr" ? 600 : 400, color: lang === "fr" ? "#0047FF" : "#1A1A1A", fontFamily: "'InstrumentSans', sans-serif", textAlign: "left" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M8 4v16M14 4v16" stroke="currentColor" strokeWidth="1.5"/></svg>
                  Français
                  {lang === "fr" && <svg style={{ marginLeft: "auto" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0047FF" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>}
                </button>
              </div>
            )}
          </div>
          <a href="/auth" className="nav-cta">
            {t.nav_cta}
          </a>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div
          className="mobile-nav-menu"
          style={{
            position: "fixed",
            top: 70,
            left: 12,
            right: 12,
            background: "#fff",
            borderRadius: 16,
            boxShadow: "0 8px 40px rgba(0, 0, 0, 0.12)",
            border: "1px solid #EFEFEF",
            padding: 16,
            zIndex: 99,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <a href="#features" onClick={() => setMobileMenuOpen(false)}>
            {t.nav_features}
          </a>
          <a href="/affiliation" onClick={() => setMobileMenuOpen(false)}>
            {t.nav_affiliation}
          </a>
          <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>
            {t.nav_pricing}
          </a>
          <a href="#process" onClick={() => setMobileMenuOpen(false)}>
            {t.nav_process}
          </a>
          <a href="#features" onClick={() => setMobileMenuOpen(false)}>
            Trackit
          </a>
          <div className="mobile-nav-lang-row">
            <button
              type="button"
              className={`mobile-nav-lang${lang === "en" ? " is-active" : ""}`}
              onClick={() => {
                localStorage.setItem("trackit_lang", "en");
                window.location.reload();
              }}
            >
              EN
            </button>
            <button
              type="button"
              className={`mobile-nav-lang${lang === "fr" ? " is-active" : ""}`}
              onClick={() => {
                localStorage.setItem("trackit_lang", "fr");
                window.location.reload();
              }}
            >
              FR
            </button>
          </div>
          <a href="/auth" className="hero-cta mobile-nav-cta" onClick={() => setMobileMenuOpen(false)}>
            {t.nav_cta}
          </a>
        </div>
      )}

      {/* HERO */}
      <section className="hero">
        <img
          ref={heroDoodleRef}
          src="https://i.ibb.co/20jgns98/navbarlogotransparent.png"
          className={lang === "fr" ? "hero-doodle hero-doodle--fr" : "hero-doodle"}
          alt=""
        />
        <img
          ref={heroCursorRef}
          src="https://i.ibb.co/G4SvBCXp/cursortransparent.png"
          className={lang === "fr" ? "hero-cursor hero-cursor--fr" : "hero-cursor"}
          alt=""
        />
        <img
          ref={heroMoneyRef}
          src="https://i.ibb.co/ZznDLJMC/moneytransparent.png"
          className={lang === "fr" ? "hero-money hero-money--fr" : "hero-money"}
          alt=""
        />
        <h1 className="hero-headline">
          <span className="hero-line-wrap fade-up">{t.hero_title_1}</span>
          <span className="hero-line-wrap fade-up fade-up-delay-1">{t.hero_title_2}</span>
          <span className={`hero-line-wrap fade-up fade-up-delay-2${lang === "fr" ? " hero-line-wrap--fr" : ""}`}>{t.hero_title_3}</span>
          <span
            className={`hero-italic fade-up fade-up-delay-3 ${instrumentSerif.className}`}
          >
            {t.hero_italic}
          </span>
        </h1>

        <p className="hero-sub fade-up fade-up-delay-4">
          {t.hero_sub}
        </p>

        <a href="/auth" className="hero-cta fade-up fade-up-delay-5">
          {t.hero_cta}
        </a>

        <div className="hero-badges fade-up fade-up-delay-5">
          <div className="badge">
            <span className="badge-text">
              {t.hero_commission}
              <br />
              {t.hero_automated}
            </span>
          </div>
          <div className="badge">
            <span className="badge-text">
              {t.hero_bank}
            </span>
          </div>
        </div>
        <p className="hero-trusted fade-up fade-up-delay-5">
          {t.hero_trusted}
        </p>
      </section>

      {/* TRACKIT SECTION */}
      <section className="section" id="features">
        <div className="tagline fade-up">
          <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" /> Trackit
        </div>
        <h2 className="section-title fade-up fade-up-delay-1">
          <span className="section-title-line">{t.section_does_everything}</span>
          <span className="section-title-line section-title-line--tight">
            {t.section_in_one_place}
            <span className="section-title-dot">.</span>
          </span>
        </h2>
        <p className="section-sub fade-up fade-up-delay-2">
          {t.section_sub}
        </p>

        <div className="dashboard-wrap fade-up fade-up-delay-3">
          <video
            src="https://res.cloudinary.com/dasl7u0qw/video/upload/v1779393974/0521_2_t1qlql.mov"
            autoPlay
            loop
            muted
            playsInline
            aria-label="Trackit dashboard"
          />
        </div>

        <div className="features-grid">
          <div className="feature fade-up">
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
                  <circle cx="12" cy="12" r="9" stroke="black" strokeWidth="1.6" />
                  <ellipse cx="12" cy="12" rx="4" ry="9" stroke="black" strokeWidth="1.6" />
                  <line x1="3" y1="12" x2="21" y2="12" stroke="black" strokeWidth="1.6" />
                </svg>
              </span>
              {t.feat_1_title}
            </div>
            <div className="feature-desc">
              {t.feat_1_desc}
            </div>
          </div>
          <div className="feature fade-up fade-up-delay-1">
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
                    d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"
                    stroke="black"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              </span>
              {t.feat_2_title}
            </div>
            <div className="feature-desc">
              {t.feat_2_desc}
            </div>
          </div>
          <div className="feature fade-up fade-up-delay-2">
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
                  <line x1="12" y1="3" x2="12" y2="6" stroke="black" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="12" y1="18" x2="12" y2="21" stroke="black" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="3" y1="12" x2="6" y2="12" stroke="black" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="18" y1="12" x2="21" y2="12" stroke="black" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="5.6" y1="5.6" x2="7.7" y2="7.7" stroke="black" strokeWidth="1.8" strokeLinecap="round" />
                  <line
                    x1="16.3"
                    y1="16.3"
                    x2="18.4"
                    y2="18.4"
                    stroke="black"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <line
                    x1="5.6"
                    y1="18.4"
                    x2="7.7"
                    y2="16.3"
                    stroke="black"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <line
                    x1="16.3"
                    y1="7.7"
                    x2="18.4"
                    y2="5.6"
                    stroke="black"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              {t.feat_3_title}
            </div>
            <div className="feature-desc">
              {t.feat_3_desc}
            </div>
          </div>
          <div className="feature fade-up fade-up-delay-3">
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
                    stroke="black"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M16 20V4M16 4l-3 3M16 4l3 3"
                    stroke="black"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              {t.feat_4_title}
            </div>
            <div className="feature-desc">
              {t.feat_4_desc}
            </div>
          </div>
        </div>
      </section>
      {/* PAIN POINTS */}
      <section className="pain-points-stack" id="painContainer">
        <div className="pain-point-card" style={{ top: "0px" }}>
          <div className="pain-row">
            <div className="pain-text">
              <h2 className="pain-title">
                {t.pain_title}
                <br />
                {t.pain_title_2}
              </h2>
              <p className="pain-sub">
                {t.pain_1_desc}
              </p>
            </div>
            <div className="pain-image">
              <img src="https://i.ibb.co/Xf5f2ZMk/painimage2.jpg" alt="TikTok scrolling" />
            </div>
          </div>
        </div>
        <div className="pain-point-card" style={{ top: "0px" }}>
          <div className="pain-row">
            <div className="pain-text">
              <h2 className="pain-title">
                {t.pain_2_title}
              </h2>
              <p className="pain-sub">
                {t.pain_2_desc}
              </p>
            </div>
            <div className="pain-image">
              <img src="/images/spreadsheets.png" alt="Spreadsheets" />
            </div>
          </div>
        </div>
        <div className="pain-point-card" style={{ top: "0px" }}>
          <div className="pain-row">
            <div className="pain-text">
              <h2 className="pain-title">
                {t.pain_3_title}
              </h2>
              <p className="pain-sub">
                {t.pain_3_desc}
              </p>
            </div>
            <div className="pain-image" style={{ overflow: "visible", borderRadius: "16px" }}>
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "9px",
                  overflow: "hidden",
                  background: "#fafafa",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  padding: "20px 0 20px 20px",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    background: "#f0f0f0",
                    borderRadius: "10px",
                    padding: "18px",
                    width: "60%",
                    fontFamily: "InterDisplay, sans-serif",
                    flexShrink: 0,
                  }}
                >
                  <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>Essentials</div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#666",
                      lineHeight: 1.4,
                      marginBottom: "16px",
                    }}
                  >
                    Pour les campagnes avec jusqu&apos;à 100 créateurs.
                    <br />
                    Validez le marketing d&apos;influence avant de passer à l&apos;échelle.
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px" }}>
                    {formatCurrency(199, lang)} <span style={{ fontSize: "10px", fontWeight: 400, color: "#888" }}>Mensuel</span>
                  </div>
                  <button
                    type="button"
                    style={{
                      background: "#000",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      padding: "8px 12px",
                      fontSize: "10px",
                      width: "100%",
                      fontFamily: "InterDisplay, sans-serif",
                    }}
                  >
                    Essayez gratuitement
                  </button>
                </div>
                <div
                  style={{
                    background: "#f0f0f0",
                    borderRadius: "10px",
                    padding: "18px",
                    width: "50%",
                    fontFamily: "InterDisplay, sans-serif",
                    transform: "translateX(-10%)",
                  }}
                >
                  <div style={{ fontSize: "10px", color: "#999", marginBottom: "4px" }}>Recommended</div>
                  <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>Performance</div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#666",
                      lineHeight: 1.4,
                      marginBottom: "16px",
                    }}
                  >
                    For campaigns.
                    <br />
                    Scale your performance.
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 700 }}>{formatCurrency(499, lang)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROCESS */}
      <section className="section" id="process">
        <div className="tagline fade-up">{t.process_title}</div>
        <h2 className={`section-title fade-up fade-up-delay-1${lang === "en" ? " process-title--en" : " process-title--fr"}`}>
          {lang === "fr" ? (
            <>
              <span className="process-title-line">{t.process_sub_line1}</span>
              <span className="process-title-line process-title-line--tight">{t.process_sub_line2}</span>
              <span className="process-title-line process-title-line--minutes">minutes<span className="section-title-dot">.</span></span>
            </>
          ) : (
            <>
              <span className="process-title-line">{t.process_sub_line1}</span>
              <span className="process-title-line process-title-line--tight">
                {t.process_sub_line2}<span className="section-title-dot">.</span>
              </span>
            </>
          )}
        </h2>
        <p className="section-sub fade-up fade-up-delay-2">
          {t.process_sub2}
        </p>

        <div className="process-grid">
          <div className="process-card fade-up">
            <div className="process-mockup">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '14px',
                  marginBottom: '12px',
                  background: 'transparent'
                }}>
                  <div style={{
                    background: '#FFFFFF',
                    borderRadius: '999px',
                    padding: '6px 18px',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#000000',
                    fontFamily: "'InterDisplay', sans-serif",
                    letterSpacing: '-0.3px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                  }}>Desktop</div>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#9A9A9A',
                    fontFamily: "'InterDisplay', sans-serif",
                    letterSpacing: '-0.3px',
                    padding: '6px 4px'
                  }}>Tablet</div>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#9A9A9A',
                    fontFamily: "'InterDisplay', sans-serif",
                    letterSpacing: '-0.3px',
                    padding: '6px 4px'
                  }}>Mobile</div>
                </div>
                <div style={{
                  background: '#FFFFFF',
                  borderRadius: '14px',
                  border: '1px solid #E8E8E8',
                  overflow: 'hidden',
                  width: '100%',
                  margin: '0 auto',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                  maskImage: 'linear-gradient(to bottom, black 35%, transparent 100%)',
                  WebkitMaskImage: 'linear-gradient(to bottom, black 35%, transparent 100%)',
                  transform: 'scale(0.95)',
                  transformOrigin: 'top center',
                  marginTop: '40px'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderBottom: '1px solid #F0F0F0',
                    background: '#FAFAFA'
                  }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E0E0E0' }} />
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E0E0E0' }} />
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E0E0E0' }} />
                    </div>
                    <div style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#F5F5F5',
                      border: '1px solid #EEEEEE',
                      borderRadius: '8px',
                      padding: '3px 10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="12" height="12" viewBox="0 0 50 57" xmlns="http://www.w3.org/2000/svg">
                          <path d="M28.3 5.9c0 0-0.7 0.2-1.8 0.5c-0.1-0.4-0.3-0.9-0.6-1.4c-0.9-1.7-2.2-2.6-3.8-2.6c-0.1 0-0.2 0-0.4 0C21.5 2.1 21.2 1.8 20.8 1.6C19.4 0.6 17.7 1 16.3 2.1C12 5.5 10 13 9.4 17.1C7 17.8 5.3 18.4 5.2 18.4C3.8 18.8 3.8 18.9 3.6 20.2C3.5 21.1 0 47.5 0 47.5L33.9 53l7.3-1.8L28.3 5.9z" fill="#95BF47"/>
                          <path d="M35.1 10.7c-0.7 0-1.5 0.2-1.5 0.2s-0.8-2.5-2.3-3.5c-0.7-0.5-1.5-0.6-2.3-0.4l6.1 44.8l7.3-1.8c0 0-5.9-37.4-6-38.2C36.3 11.1 35.8 10.7 35.1 10.7z" fill="#5E8E3E"/>
                          <path d="M25.2 19.6l-1.5 5.7c0 0-1.7-0.8-3.7-0.7c-3 0.2-3 2.1-3 2.5c0.2 2.8 7.5 3.4 7.9 10c0.3 5.2-2.7 8.7-7.1 9c-5.3 0.3-7.9-2.8-7.9-2.8l1.1-4.6c0 0 2.7 2 4.8 1.9c1.4-0.1 1.9-1.2 1.9-2c-0.2-3.7-6.2-3.4-6.5-9.5C10.8 23.6 14.7 18 22 17.5C24.9 17.3 25.2 19.6 25.2 19.6z" fill="white"/>
                        </svg>
                        <span style={{
                          color: '#888',
                          fontWeight: 400,
                          fontSize: '11px',
                          lineHeight: '11px',
                          letterSpacing: '-0.4px',
                          fontFamily: "'InterDisplay', sans-serif"
                        }}>Shopify.com</span>
                      </div>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="9" stroke="#BBB" strokeWidth="1.6"/>
                        <ellipse cx="12" cy="12" rx="4" ry="9" stroke="#BBB" strokeWidth="1.6"/>
                        <line x1="3" y1="12" x2="21" y2="12" stroke="#BBB" strokeWidth="1.6"/>
                      </svg>
                    </div>
                  </div>
                  <div style={{ padding: '14px', background: '#FFFFFF' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1px', marginLeft: '36px' }}>
                        <svg width="18" height="18" viewBox="0 0 50 57" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '-2px' }}>
                          <path d="M28.3 5.9c0 0-0.7 0.2-1.8 0.5c-0.1-0.4-0.3-0.9-0.6-1.4c-0.9-1.7-2.2-2.6-3.8-2.6c-0.1 0-0.2 0-0.4 0C21.5 2.1 21.2 1.8 20.8 1.6C19.4 0.6 17.7 1 16.3 2.1C12 5.5 10 13 9.4 17.1C7 17.8 5.3 18.4 5.2 18.4C3.8 18.8 3.8 18.9 3.6 20.2C3.5 21.1 0 47.5 0 47.5L33.9 53l7.3-1.8L28.3 5.9z" fill="#95BF47"/>
                          <path d="M35.1 10.7c-0.7 0-1.5 0.2-1.5 0.2s-0.8-2.5-2.3-3.5c-0.7-0.5-1.5-0.6-2.3-0.4l6.1 44.8l7.3-1.8c0 0-5.9-37.4-6-38.2C36.3 11.1 35.8 10.7 35.1 10.7z" fill="#5E8E3E"/>
                          <path d="M25.2 19.6l-1.5 5.7c0 0-1.7-0.8-3.7-0.7c-3 0.2-3 2.1-3 2.5c0.2 2.8 7.5 3.4 7.9 10c0.3 5.2-2.7 8.7-7.1 9c-5.3 0.3-7.9-2.8-7.9-2.8l1.1-4.6c0 0 2.7 2 4.8 1.9c1.4-0.1 1.9-1.2 1.9-2c-0.2-3.7-6.2-3.4-6.5-9.5C10.8 23.6 14.7 18 22 17.5C24.9 17.3 25.2 19.6 25.2 19.6z" fill="white"/>
                        </svg>
                        <span style={{
                          fontWeight: 600,
                          fontSize: '10px',
                          lineHeight: '10px',
                          letterSpacing: '-0.04em',
                          color: '#1A1A1A',
                          fontFamily: "'InterDisplay', sans-serif"
                        }}>Shopify</span>
                      </div>
                      <div style={{ width: '40px', height: '14px', background: '#EEE', borderRadius: '20px', marginRight: '12px' }} />
                    </div>
                    <div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
                      <div style={{
                        fontWeight: 600,
                        fontSize: '13px',
                        color: '#000',
                        lineHeight: '11px',
                        letterSpacing: '-0.04em',
                        fontFamily: "'InterDisplay', sans-serif",
                        marginBottom: '14px'
                      }}>
                        Start an online<br />store for free
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '180px', height: '8px', background: '#EEE', borderRadius: '4px' }} />
                        <div style={{ width: '140px', height: '8px', background: '#EEE', borderRadius: '4px' }} />
                        <div style={{ width: '60px', height: '8px', background: '#EEE', borderRadius: '4px', marginTop: '4px' }} />
                      </div>
                    </div>
                    <div style={{ height: '80px', background: '#EEEEEE', borderRadius: '8px' }} />
                  </div>
                </div>
              </div>

            </div>
            <div className="process-card-footer">
              <div className="process-card-title">
                <span className="process-icon" aria-hidden="true">
                  ⊕
                </span>
                {t.process_1}
              </div>
              <div className="process-card-desc">{t.process_1_sub}</div>
            </div>
          </div>

          <div className="process-card fade-up fade-up-delay-1">
            <div className="process-mockup">
              <div className="inf-card">
                <div className="inf-header">
                  <div className="inf-title">Influencers found :</div>
                  <div className="inf-filters">
                    <div className="f">1d</div>
                    <div className="f">7d</div>
                    <div className="f">1m</div>
                    <div className="f">6m</div>
                    <div className="f active">All</div>
                    <div className="f">📅</div>
                  </div>
                </div>
                <div className="inf-count">
                  <div className="inf-num">24</div>
                  <div className="inf-avatars">
                    <div className="av" />
                    <div className="av" />
                    <div className="av" />
                  </div>
                </div>
                <div className="inf-btn">Reach out →</div>
                <br />
                <div className="inf-btn">See Profiles →</div>
              </div>
            </div>
            <div className="process-card-footer">
              <div className="process-card-title">{t.process_2}</div>
              <div className="process-card-desc">{t.process_2_sub}</div>
            </div>
          </div>

          <div className="process-card fade-up fade-up-delay-2">
            <div className="process-mockup">
              <div className="outreach-wrap">
                <div className="outreach-stack">
                  <div className="outreach-msg outreach-msg-3">
                    <div className="outreach-logo">
                      <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" />
                    </div>
                    <div className="outreach-text">&quot;Are you interested in a...&quot;</div>
                  </div>
                  <div className="outreach-msg outreach-msg-2">
                    <div className="outreach-logo">
                      <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" />
                    </div>
                    <div className="outreach-text">&quot;I reach to you because...&quot;</div>
                  </div>
                  <div className="outreach-msg outreach-msg-1">
                    <div className="outreach-logo">
                      <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" />
                    </div>
                    <div className="outreach-text">&quot;Hey seen your posts...&quot;</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="process-card-footer">
              <div className="process-card-title">
                <svg
                  className="process-icon"
                  width="14"
                  height="14"
                  viewBox="0 0 28 28"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="14" cy="14" r="14" fill="black" />
                  <path
                    d="M14 6C9.582 6 6 9.328 6 13.444c0 2.16.9 4.1 2.364 5.49V22l2.854-1.41C12.014 20.85 12.99 21 14 21c4.418 0 8-3.328 8-7.556C22 9.328 18.418 6 14 6z"
                    fill="black"
                  />
                  <path
                    d="M14 6C9.582 6 6 9.328 6 13.444c0 2.16.9 4.1 2.364 5.49V22l2.854-1.41C12.014 20.85 12.99 21 14 21c4.418 0 8-3.328 8-7.556C22 9.328 18.418 6 14 6z"
                    fill="white"
                    fillOpacity="0"
                  />
                  <path
                    d="M10 15.5l2.5-2.7 2.3 2.2 3.2-2.5"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {t.process_3}
              </div>
              <div className="process-card-desc">{t.process_3_sub}</div>
            </div>
          </div>

          <div className="process-card fade-up fade-up-delay-3">
            <div className="process-mockup">
              <div className="pay-grid">
                <div className="pay-cell e" />
                <div className="pay-cell e" />
                <div className="pay-cell">
                  <img
                    className="pay-logo"
                    src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg"
                    alt="PayPal"
                  />
                </div>
                <div className="pay-cell">
                  <img
                    className="pay-logo"
                    src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg"
                    alt="Mastercard"
                  />
                </div>
                <div className="pay-cell e" />
                <div className="pay-cell">
                  <img
                    className="pay-logo"
                    src="https://upload.wikimedia.org/wikipedia/commons/f/f2/Google_Pay_Logo.svg"
                    alt="Google Pay"
                  />
                </div>
                <div className="pay-cell e" />
                <div className="pay-cell d">
                  <img
                    className="pay-logo"
                    src="https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg"
                    alt="Stripe"
                  />
                </div>
                <div className="pay-cell e" />
                <div className="pay-cell e" />
                <div className="pay-cell e" />
                <div className="pay-cell d">
                  <img
                    className="pay-logo pay-logo-apple"
                    src="https://upload.wikimedia.org/wikipedia/commons/b/b0/Apple_Pay_logo.svg"
                    alt="Apple Pay"
                  />
                </div>
              </div>
            </div>
            <div className="process-card-footer">
              <div className="process-card-title">
                <svg
                  className="process-icon"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect x="2" y="2" width="20" height="20" rx="2" fill="black" />
                  <polyline
                    points="5,15 9,10 13,13 18,7"
                    stroke="white"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  <polyline
                    points="5,18 19,18"
                    stroke="white"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
                {t.process_4}
              </div>
              <div className="process-card-desc">{t.process_4_sub}</div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY TRACKIT */}
      <section className="section" id="why">
        <div className="why-intro">
          <div className="tagline fade-up">
            <span className="tagline-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 9a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1.2-1.5 2.4v.5" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <circle cx="12" cy="18" r="1.3" fill="white"/>
              </svg>
            </span>
            {t.why_title}
          </div>
          <h2 className="section-title fade-up fade-up-delay-1">
            {t.why_sub}
            <span className="why-title-line why-title-line--third">
              {t.why_sub2}<span className="section-title-dot">.</span>
            </span>
          </h2>
          <p className="section-sub fade-up fade-up-delay-2">
            {t.why_desc}
          </p>
        </div>

        <div className="why-grid">
          <div className="why-col fade-up fade-up-delay-3">
            <h3>{t.traditional_title}</h3>
            <ul className="why-list">
              {[
                t.trad_1,
                t.trad_2,
                t.trad_3,
                t.trad_4,
                t.trad_5,
                t.trad_6,
                t.trad_7,
                t.trad_8,
                t.trad_9,
                t.trad_10,
              ].map((item) => (
                <li key={String(item)}>
                  <span className="wcheck">
                    <svg viewBox="0 0 10 10">
                      <path d="M2 5 L4 7 L8 3" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="why-col right fade-up fade-up-delay-4">
            <h3>Trackit</h3>
            <ul className="why-list">
              {[
                t.trackit_1,
                t.trackit_2,
                t.trackit_3,
                t.trackit_4,
                t.trackit_5,
                t.trackit_6,
                t.trackit_7,
                t.trackit_8,
                t.trackit_9,
                t.trackit_10,
              ].map((item) => (
                <li key={String(item)}>
                  <span className="wcheck">
                    <svg viewBox="0 0 10 10">
                      <path d="M2 5 L4 7 L8 3" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="section" id="pricing">
        <div className="tagline fade-up">
          <span className="tagline-icon tagline-icon-jar">
            <svg width="18" height="20" viewBox="0 0 24 26" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="6" y1="2.5" x2="18" y2="2.5" stroke="#0047FF" strokeWidth="2.4" strokeLinecap="round"/>
              <line x1="6" y1="6.5" x2="18" y2="6.5" stroke="#0047FF" strokeWidth="2.4" strokeLinecap="round"/>
              <rect x="3" y="9" width="18" height="15" rx="2.5" fill="#0047FF"/>
            </svg>
          </span>
          {t.nav_pricing}
        </div>
        <h2 className="section-title fade-up fade-up-delay-1">{t.pricing_title}<span className="section-title-dot">.</span></h2>
        <p className="section-sub fade-up fade-up-delay-2">
          {t.pricing_sub}
        </p>

        <div className="pricing-grid">
          <div className="pricing-wrap fade-up fade-up-delay-3">
            <div className="pricing-toggle">
              <div className="pricing-toggle-left">
                <button
                  type="button"
                  className={`toggle-switch${basicAnnual ? " is-on" : ""}`}
                  aria-label="Toggle billing"
                  aria-pressed={basicAnnual}
                  onClick={() => setBasicAnnual((on) => !on)}
                >
                  <span className="toggle-thumb"></span>
                </button>
                <span className="toggle-label">{t.pricing_annually}</span>
              </div>
              <div className="pricing-toggle-pill">{t.pricing_save}</div>
            </div>
            <div className="pricing-card">
              <div className="pricing-card-top">
                <div className="pricing-logo"><img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" /></div>
                <div className="pricing-name">Growth</div>
                <div className="pricing-desc">{t.pricing_basic_desc}</div>
                <div className="pricing-price">
                  <span className="pricing-amount">{basicAnnual ? formatCurrency(190, lang) : formatCurrency(19, lang)}</span>
                  <span className="pricing-period">{basicAnnual ? t.pricing_year : t.pricing_month}</span>
                </div>
              </div>
              <div className="pricing-divider"></div>
              <div className="pricing-features">
                {growthPricingFeatures.map((label) => (
                  <div key={label} className="pricing-feature">{pricingCheckIcon}{label}</div>
                ))}
              </div>
              <button type="button" onClick={() => handleCheckout("growth", basicAnnual)} className="pricing-cta">{t.pricing_cta}</button>
            </div>
          </div>

          <div className="pricing-wrap pricing-wrap-hero fade-up fade-up-delay-4">
            <div className="pricing-toggle">
              <div className="pricing-toggle-left">
                <button
                  type="button"
                  className={`toggle-switch${trackitAnnual ? " is-on" : ""}`}
                  aria-label="Toggle billing"
                  aria-pressed={trackitAnnual}
                  onClick={() => setTrackitAnnual((on) => !on)}
                >
                  <span className="toggle-thumb"></span>
                </button>
                <span className="toggle-label">{t.pricing_annually}</span>
              </div>
            </div>
            <div className="pricing-card pricing-card-hero">
              <span className="pricing-badge-most-popular">{t.pricing_most_popular}</span>
              <div className="pricing-card-top">
                <div className="pricing-logo"><img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" /></div>
                <div className="pricing-name">Pro</div>
                <div className="pricing-desc">{t.pricing_trackit_desc}</div>
                <div className="pricing-price">
                  <span className="pricing-amount">{trackitAnnual ? formatCurrency(390, lang) : formatCurrency(39, lang)}</span>
                  <span className="pricing-period">{trackitAnnual ? t.pricing_year : t.pricing_month}</span>
                </div>
              </div>
              <div className="pricing-divider"></div>
              <div className="pricing-features">
                {proPricingFeatures.map((label) => (
                  <div key={label} className="pricing-feature">{pricingCheckIcon}{label}</div>
                ))}
              </div>
              <button type="button" onClick={() => handleCheckout("pro", trackitAnnual)} className="pricing-cta pricing-cta-hero">{t.pricing_cta}</button>
            </div>
          </div>

          <div className="pricing-wrap fade-up fade-up-delay-5">
            <div className="pricing-toggle">
              <div className="pricing-toggle-left">
                <button
                  type="button"
                  className={`toggle-switch${proAnnual ? " is-on" : ""}`}
                  aria-label="Toggle billing"
                  aria-pressed={proAnnual}
                  onClick={() => setProAnnual((on) => !on)}
                >
                  <span className="toggle-thumb"></span>
                </button>
                <span className="toggle-label">{t.pricing_annually}</span>
              </div>
              <div className="pricing-toggle-pill">{t.pricing_scale_pill}</div>
            </div>
            <div className="pricing-card">
              <div className="pricing-card-top">
                <div className="pricing-logo"><img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" /></div>
                <div className="pricing-name">Scale</div>
                <div className="pricing-desc">{t.pricing_scale_desc}</div>
                <div className="pricing-price">
                  <span className="pricing-amount">{proAnnual ? formatCurrency(990, lang) : formatCurrency(99, lang)}</span>
                  <span className="pricing-period">{proAnnual ? t.pricing_year : t.pricing_month}</span>
                </div>
              </div>
              <div className="pricing-divider"></div>
              <div className="pricing-features">
                {scalePricingFeatures.map((label) => (
                  <div key={label} className="pricing-feature">{pricingCheckIcon}{label}</div>
                ))}
              </div>
              <button type="button" onClick={() => handleCheckout("scale", proAnnual)} className="pricing-cta pricing-cta-dark">{t.pricing_cta}</button>
            </div>
          </div>

          <div className="pricing-wrap pricing-wrap-full fade-up fade-up-delay-6">
            <div className="pricing-card">
              <div className="pricing-card-top">
                <div className="pricing-logo"><img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" /></div>
                <div className="pricing-name">Free</div>
                <div className="pricing-desc">{t.pricing_free_desc}</div>
                <div className="pricing-price">
                  <span className="pricing-amount">{formatCurrency(0, lang)}</span>
                  <span className="pricing-period">{t.pricing_month}</span>
                </div>
              </div>
              <div className="pricing-divider"></div>
              <div className="pricing-features">
                {freePricingFeatures.map((label) => (
                  <div key={label} className="pricing-feature">{pricingCheckIcon}{label}</div>
                ))}
              </div>
              <a href="/auth" className="pricing-cta">{t.pricing_free_cta}</a>
            </div>
          </div>
        </div>

      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-top">
          <div>
            <div className="footer-brand">
              <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" />
              <span className="footer-name">Trackit.</span>
            </div>
            <div className="footer-tag">{t.footer_tagline}</div>
          </div>
          <div className="footer-socials">
            <a href="#" aria-label="LinkedIn">
              <svg viewBox="0 0 24 24">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
              </svg>
            </a>
            <a href="#" aria-label="X">
              <svg viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a href="#" aria-label="YouTube">
              <svg viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            </a>
            <a href="#" aria-label="Reddit">
              <svg viewBox="0 0 24 24">
                <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.32.143 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65z" />
              </svg>
            </a>
            <a href="#" aria-label="Facebook">
              <svg viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </a>
            <a href="#" aria-label="WhatsApp">
              <svg viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
              </svg>
            </a>
            <a href="#" aria-label="TikTok">
              <svg viewBox="0 0 24 24">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.1Z" />
              </svg>
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <div>Copyright © Trackit.Inc {t.footer_rights}</div>
          <div className="footer-links">
            <a href="#">Terms &amp; Conditions</a>
            <a href="#">Privacy Policy</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
