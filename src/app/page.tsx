"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import type { User } from "@supabase/supabase-js";

import { handleUpgrade, getSparkPriceId } from "@/lib/checkout";
import {
  getPriceIdForUpgradeTarget,
  getPricingCta,
  type PlanTier,
} from "@/lib/pricing-cta";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const PROFILE_DROPDOWN_ITEM_STYLE: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "10px 16px",
  border: "none",
  background: "transparent",
  color: "rgba(255,255,255,1)",
  fontFamily: "'Inter', sans-serif",
  fontSize: 17,
  fontWeight: 600,
  letterSpacing: "-0.04em",
  lineHeight: 1.0,
  cursor: "pointer",
};

function profileInitials(user: User, profileUsername?: string | null): string {
  const fromProfile = profileUsername?.trim();
  if (fromProfile) return fromProfile.slice(0, 2).toUpperCase();
  const meta =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined);
  if (meta?.trim()) {
    const parts = meta.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  const email = user.email ?? "";
  const local = email.split("@")[0] ?? "";
  return local.slice(0, 2).toUpperCase() || "?";
}

const QUESTIONS = [
  {
    label: "01 →",
    question: "What's your idea in one sentence?",
    hint: "The problem, who has it, and how you solve it.",
    placeholder:
      "e.g. An AI tool that helps solo founders validate their SaaS idea before building anything...",
  },
  {
    label: "02 →",
    question: "Who is your exact target customer?",
    hint: "Not a category — a specific person. Job title, company size, daily frustration.",
    placeholder:
      "e.g. Solo SaaS founders aged 25-35 who keep building products nobody wants...",
  },
  {
    label: "03 →",
    question: "Why do you believe this is a real problem?",
    hint: "Did you experience it yourself or observe it in others?",
    placeholder:
      "e.g. I built 3 products in 12 months with zero paying customers because I never validated...",
  },
  {
    label: "04 →",
    question: "What existing solutions are people using right now?",
    hint: "Even bad ones. Spreadsheets, manual processes, expensive tools.",
    placeholder:
      "e.g. They ask ChatGPT, post on Reddit, or just wing it and hope for the best...",
  },
  {
    label: "05 →",
    question: "What's your unfair advantage?",
    hint: "Why you, why now?",
    placeholder:
      "e.g. I've lived this problem firsthand and know exactly what founders need...",
  },
  {
    label: "06 →",
    question: "Have you talked to anyone in your target market yet?",
    hint: "What did they say? Be specific.",
    placeholder:
      "e.g. I DMed 20 founders on Reddit. 8 responded. 3 said they'd pay for this today...",
  },
  {
    label: "07 →",
    question: "What's your email address?",
    hint: "We'll send your Kill or Build verdict here within 24 hours.",
    placeholder: "e.g. yourname@email.com",
  },
] as const;

type EmailJs = {
  send: (
    serviceId: string,
    templateId: string,
    templateParams: Record<string, string>,
    publicKey: string
  ) => Promise<unknown>;
};

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    const check = async () => {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) return;

      const { data: profile } = await client
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

    };
    void check();
  }, []);

  const [modalOpen, setModalOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() => Array(7).fill(""));
  const [inputValue, setInputValue] = useState("");
  const [showInputError, setShowInputError] = useState(false);
  const [nextLabel, setNextLabel] = useState("OK, NEXT →");
  const [nextBusy, setNextBusy] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const [user, setUser] = useState<User | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<"free" | "spark" | "build" | "scale">("free");
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [lang, setLang] = useState<"en" | "fr">("en");
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [userProjects, setUserProjects] = useState<
    Array<{ id: string; idea_name: string; status: string }>
  >([]);

  useEffect(() => {
    const saved = localStorage.getItem("klayan_lang") as "en" | "fr" | null;
    if (saved) {
      setLang(saved);
      return;
    }
    // Auto-detect browser language on first visit
    const browserLang = navigator.language || (navigator as any).userLanguage || "";
    if (browserLang.toLowerCase().startsWith("fr")) {
      setLang("fr");
      localStorage.setItem("klayan_lang", "fr");
    } else {
      setLang("en");
      localStorage.setItem("klayan_lang", "en");
    }
  }, []);

  useEffect(() => {
    if (!showLangDropdown) return;
    const handleClick = (e: MouseEvent) => {
      setShowLangDropdown(false);
    };
    const timer = setTimeout(() => {
      window.addEventListener("click", handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", handleClick);
    };
  }, [showLangDropdown]);

  const openWorkspacePicker = useCallback(async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/auth"); return; }
    const { data } = await supabase
      .from("projects")
      .select("id, idea_name, status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setUserProjects(data ?? []);
    setShowWorkspacePicker(true);
  }, [router]);

  const t = {
    en: {
      nav_services: "Services",
      nav_pricing: "Pricing",
      nav_analyze: "Analyze",
      nav_signin: "Sign In",
      hero_title: "From Idea to",
      hero_italic: "10K MRR.",
      hero_sub:
        "Drowning in ideas but no idea which one to build? Klayan pulls you out. Brutal verdict in 10 minutes — real competitors, real market data, real next steps. Then stays with you every week until you hit $10K MRR.",
      hero_cta: "Analyze my idea",
      hero_note: "Free to start · No credit card required",
      familiar_title: "Sounds familiar ?",
      pain1_title: "You built something nobody wanted",
      pain1_desc:
        "Spent 4 months coding. Launched to crickets. Found out the market didn't care.",
      pain2_title: "You asked ChatGPT. It said great idea.",
      pain2_desc:
        "Every idea is a great idea to ChatGPT. You need something that actually challenges you.",
      pain3_title: "You don't know where to start",
      pain3_desc:
        "ICP, pricing, distribution, competitors — it's overwhelming and nobody gives you a straight answer.",
      bubble1_reject: "Sorry but we're not interested",
      bubble2_chatgpt: "Great idea! This has huge potential! 🚀",
      bubble3_lost: "Where do I even start...",
      bubble3_icp: "ICP? CAC? TAM? 😵",
      tsxbubble1_reject2: "We already got a better option",
      bubble1_months: "4 months wasted",
      bubble2_build: "Okay let's build it!",
      how_title: "How it works ?",
      how_sub: "From raw idea to verdict in 10 minutes.",
      step1_pill: "Step 1",
      step1_title: "Validate",
      step1_desc:
        "Drop your idea. Klayan searches live competitors, real market data, and real customer complaints — and gives you a brutal verdict in minutes.",
      step2_pill: "Step 2",
      step2_title: "Decide",
      step2_desc:
        "Kill it. Flip it. Build it. Every verdict comes with full evidence, competitor breakdown, pricing analysis, and a recommended stack.",
      step3_pill: "Step 3",
      step3_title: "Track",
      step3_desc:
        "Open your workspace. Weekly check-ins, milestone engine, market watch — Klayan stays with you every step of the way.",
      step4_pill: "Step 4",
      step4_title: "Win",
      step4_desc:
        "Co-Founder Mode, Pivot Radar, and stage-specific playbooks. From raw idea to first paying customer — Klayan never lets you drift.",
      honest_title: "This is what honest AI looks like",
      honest_tagline: "Not a score. A verdict.",
      why_title: "6 reasons why Klayan is better than just asking ChatGPT.",
      why_sub:
        "ChatGPT is a tool. Klayan is a system built specifically for one thing — getting your idea to its first paying customer.",
      reason1_title: "It tells you the truth.",
      reason1_desc:
        'ChatGPT agrees with everything. Every idea is "a great opportunity with strong potential." Klayan is designed to say no — with evidence behind every verdict.',
      reason2_title: "It uses live data.",
      reason2_desc:
        "ChatGPT knows what it knew in 2023. Klayan searches the web right now — real competitors, real pricing, real customer complaints from Reddit and G2. Today. Not two years ago.",
      reason3_title: "It remembers your journey.",
      reason3_desc:
        "Every conversation with ChatGPT starts from zero. Klayan remembers every idea, every pivot, every signal. Day 47 is smarter than Day 1 because it knows your history.",
      reason4_title: "It asks the right questions.",
      reason4_desc:
        "With ChatGPT you need to know what to ask. Most founders don't. Klayan runs a structured process — the same questions a real investor would ask before writing a check.",
      reason5_title: "It executes, not just advises.",
      reason5_desc:
        "ChatGPT gives you text. Klayan gives you the 20 exact people to contact, the exact message to send, your landing page copy, your pricing, your 30-day launch plan.",
      reason6_title: "It stays with you.",
      reason6_desc:
        "ChatGPT is a one-time conversation. Klayan follows you from raw idea to first paying customer — adapting as your signals come in, never starting over.",
      pricing_label: "Simple. Honest. Revenue-led.",
      pricing_spark: "Spark",
      pricing_build: "Build",
      pricing_scale: "Scale",
      pricing_popular: "Most Popular!",
      pricing_get_started: "Get started",
      price_spark: "$19",
      price_build: "$69",
      price_scale: "$149",
      pricing_spark_f1: "3 analyses per month",
      pricing_spark_f2: "Kill or Build verdict",
      pricing_spark_f3: "Market research & competitor scan",
      pricing_spark_f4: "Hard Truths + Opportunity analysis",
      pricing_spark_f5: "Workspace + Notes",
      pricing_build_f1: "10 analyses per month",
      pricing_build_f2: "Everything in Spark",
      pricing_build_f3: "Weekly Check-in + AI report",
      pricing_build_f4: "Milestone Engine & Playbooks (Important Steps)",
      pricing_build_f5: "Market Watch (monthly)",
      pricing_build_f6: "Pivot Radar",
      pricing_build_f7: "Marketing Engine",
      pricing_build_f8: "Outreach Engine",
      pricing_build_f9: "Competitor Tracker",
      pricing_build_f10: "Pricing Strategy",
      pricing_scale_badge: "Get the best out of Klayan!",
      pricing_scale_f1: "Unlimited analyses",
      pricing_scale_f2: "Everything in Build",
      pricing_scale_f3: "Co-Founder Mode (unlimited sessions)",
      pricing_scale_f4: "Market Watch (unlimited)",
      pricing_scale_f5: "Revenue Roadmap",
      pricing_scale_f6: "Priority support",
      pricing_locked_signal: "Signal Sprint",
      pricing_locked_flip: "Flip Engine",
      pricing_locked_structure: "Business Structure",
      pricing_locked_roadmap: "Revenue Roadmap",
      pricing_locked_marketing: "Marketing Machine",
      story_quote:
        '"I spent months building products nobody wanted. Pivoting. Rebuilding. Pivoting again. One night I spent 3 hours with an AI that actually pushed back. Killed the bad ideas fast. Gave me a real plan. That conversation became Klayan. Every founder deserves that conversation."',
      story_author: "— Rayan, Founder of Klayan",
      faq_title: "Everything you need to know.",
      faq_q1: "Is Klayan just another AI chatbot?",
      faq_a1:
        "No. Klayan is a structured validation system. It searches the web in real time, analyzes real competitors, finds real customer complaints, and delivers a verdict — not a conversation. It's built specifically for one job: telling you if your idea is worth building.",
      faq_q2: "How is this different from asking ChatGPT?",
      faq_a2:
        "ChatGPT agrees with everything. Klayan is designed to challenge you. It uses live web data, follows a strict validation framework, and gives you a Kill/Flip/Build verdict with evidence. ChatGPT gives you encouragement. Klayan gives you the truth.",
      faq_q3: "What does the verdict actually include?",
      faq_a3:
        "A full verdict includes: the verdict (Kill/Flip/Build) with a brutal one-liner, 5 hard truths backed by real data, a competitor breakdown with pricing and weaknesses, the market opportunity, a recommended tech stack, your next 48-hour action plan, and the one question that will make or break your idea.",
      faq_q4: "Can I get a refund?",
      faq_a4:
        "If you run your first analysis and feel it wasn't worth it, email us within 48 hours and we'll refund you. No questions asked.",
      faq_q5: "What if my idea gets a KILL IT verdict?",
      faq_a5:
        "That's the most valuable verdict you can get. It saves you months of wasted time and thousands in development costs. Most failed startups wish someone had told them earlier. Klayan tells you on day one.",
      faq_q6: "Is my idea kept private?",
      faq_a6:
        "Yes. Your ideas are stored securely and never shared, sold, or used to train AI models. What you submit stays yours.",
      cta_title: "Your next idea deserves more than a gut feeling.",
      cta_sub: "Join founders who validate first and build second.",
      cta_btn: "Analyze my Idea",
      cta_note: "Free to start · No credit card · Cancel anytime",
      footer: "© 2026 Klayan — Built by founders, for founders.",
    },
    fr: {
      nav_services: "Services",
      nav_pricing: "Tarifs",
      nav_analyze: "Analyser",
      nav_signin: "Connexion",
      hero_title: "De l'Idée au",
      hero_italic: "10K MRR.",
      hero_sub:
        "Tu te noies sous les idées mais tu sais pas laquelle construire ? Klayan te sort la tête de l'eau. Verdict brutal en 10 minutes — vrais concurrents, vraies données, vrais prochains pas. Puis reste avec toi chaque semaine jusqu'à 10K MRR.",
      hero_cta: "Analyser mon idée",
      hero_note: "Gratuit pour commencer · Pas de carte bancaire",
      familiar_title: "Ça te parle ?",
      pain1_title: "Tu as construit quelque chose que personne ne voulait",
      pain1_desc: "4 mois de code. Lancé dans le vide. Le marché s'en foutait.",
      pain2_title: "Tu as demandé à ChatGPT. Il a dit super idée.",
      pain2_desc:
        "Chaque idée est une super idée pour ChatGPT. T'as besoin de quelque chose qui te challenge vraiment.",
      pain3_title: "Tu sais pas par où commencer",
      pain3_desc:
        "ICP, pricing, distribution, concurrents — c'est écrasant et personne te donne une vraie réponse.",
      bubble1_reject: "Désolé mais ça ne nous intéresse pas",
      bubble2_chatgpt: "Super idée ! Énorme potentiel ! 🚀",
      bubble3_lost: "Par où je commence...",
      bubble3_icp: "ICP ? CAC ? TAM ? 😵",
      tsxbubble1_reject2: "On a déjà une meilleure option",
      bubble1_months: "4 mois gaspillés",
      bubble2_build: "Allez on build !",
      how_title: "Comment ça marche ?",
      how_sub: "De l'idée brute au verdict en 10 minutes.",
      step1_pill: "Étape 1",
      step1_title: "Valide",
      step1_desc:
        "Soumets ton idée. Klayan recherche les vrais concurrents, les vraies données de marché et les vraies plaintes clients — et te donne un verdict brutal en quelques minutes.",
      step2_pill: "Étape 2",
      step2_title: "Décide",
      step2_desc:
        "Kill it. Flip it. Build it. Chaque verdict inclut des preuves complètes, une analyse des concurrents, une analyse des prix et une stack recommandée.",
      step3_pill: "Étape 3",
      step3_title: "Suis",
      step3_desc:
        "Ouvre ton espace de travail. Check-ins hebdomadaires, Playbook pour les étapes importantes, veille de marché — Klayan reste avec toi à chaque étape.",
      step4_pill: "Étape 4",
      step4_title: "Gagne",
      step4_desc:
        "Mode Co-Fondateur, Radar de Pivot et playbooks spécifiques à chaque étape. De l'idée brute au premier client payant — Klayan ne te laisse jamais dériver.",
      honest_title: "Voilà à quoi ressemble une IA honnête",
      honest_tagline: "Pas un score. Un verdict.",
      why_title: "6 raisons pour lesquelles Klayan est meilleur que ChatGPT.",
      why_sub:
        "ChatGPT est un outil. Klayan est un système conçu pour une seule chose — amener ton idée à son premier client payant.",
      reason1_title: "Il te dit la vérité.",
      reason1_desc:
        'ChatGPT est d\'accord avec tout. Chaque idée est "une grande opportunité avec un fort potentiel." Klayan est conçu pour dire non — avec des preuves derrière chaque verdict.',
      reason2_title: "Il utilise des données en direct.",
      reason2_desc:
        "ChatGPT sait ce qu'il savait en 2023. Klayan cherche sur le web maintenant — vrais concurrents, vrais prix, vraies plaintes clients de Reddit et G2. Aujourd'hui. Pas il y a deux ans.",
      reason3_title: "Il se souvient de ton parcours.",
      reason3_desc:
        "Chaque conversation avec ChatGPT repart de zéro. Klayan se souvient de chaque idée, chaque pivot, chaque signal. Le jour 47 est plus intelligent que le jour 1 parce qu'il connaît ton histoire.",
      reason4_title: "Il pose les bonnes questions.",
      reason4_desc:
        "Avec ChatGPT tu dois savoir quoi demander. La plupart des founders ne savent pas. Klayan suit un processus structuré — les mêmes questions qu'un vrai investisseur poserait avant d'écrire un chèque.",
      reason5_title: "Il exécute, pas seulement conseille.",
      reason5_desc:
        "ChatGPT te donne du texte. Klayan te donne les 20 personnes exactes à contacter, le message exact à envoyer, le texte de ta landing page, ton pricing, ton plan de lancement sur 30 jours.",
      reason6_title: "Il reste avec toi.",
      reason6_desc:
        "ChatGPT est une conversation unique. Klayan te suit de l'idée brute au premier client payant — s'adaptant au fur et à mesure que tes signaux arrivent, sans jamais repartir de zéro.",
      pricing_label: "Simple. Honnête. Orienté revenus.",
      pricing_spark: "Spark",
      pricing_build: "Build",
      pricing_scale: "Scale",
      pricing_popular: "Le plus populaire !",
      pricing_get_started: "Commencer",
      price_spark: "19€",
      price_build: "69€",
      price_scale: "149€",
      pricing_spark_f1: "3 analyses par mois",
      pricing_spark_f2: "Verdict Kill or Build",
      pricing_spark_f3: "Recherche de marché & scan des concurrents",
      pricing_spark_f4: "Vérités difficiles + analyse des opportunités",
      pricing_spark_f5: "Espace de travail + Notes",
      pricing_build_f1: "10 analyses par mois",
      pricing_build_f2: "Tout ce qui est dans Spark",
      pricing_build_f3: "Check-in hebdomadaire + rapport IA",
      pricing_build_f4: "Machine d'Étapes Importantes & Playbook",
      pricing_build_f5: "Market Watch (mensuel)",
      pricing_build_f6: "Pivot Radar",
      pricing_build_f7: "Moteur Marketing",
      pricing_build_f8: "Moteur de Prospection",
      pricing_build_f9: "Suivi des Concurrents",
      pricing_build_f10: "Stratégie de Prix",
      pricing_scale_badge: "Tire le meilleur de Klayan !",
      pricing_scale_f1: "Analyses illimitées",
      pricing_scale_f2: "Tout ce qui est dans Build",
      pricing_scale_f3: "Mode Co-Fondateur (sessions illimitées)",
      pricing_scale_f4: "Market Watch (illimité)",
      pricing_scale_f5: "Roadmap des Revenus",
      pricing_scale_f6: "Support prioritaire",
      pricing_locked_signal: "Signal Sprint",
      pricing_locked_flip: "Flip Engine",
      pricing_locked_structure: "Structure Business",
      pricing_locked_roadmap: "Revenue Roadmap",
      pricing_locked_marketing: "Marketing Machine",
      story_quote:
        "\"J'ai passé des mois à construire des produits que personne ne voulait. Pivoter. Reconstruire. Pivoter encore. Un soir j'ai passé 3 heures avec une IA qui m'a vraiment challengé. Tué les mauvaises idées vite. Donné un vrai plan. Cette conversation est devenue Klayan. Chaque founder mérite cette conversation.\"",
      story_author: "— Rayan, Fondateur de Klayan",
      faq_title: "Tout ce que vous devez savoir.",
      faq_q1: "Klayan est-il juste un autre chatbot IA ?",
      faq_a1:
        "Non. Klayan est un système de validation structuré. Il recherche sur le web en temps réel, analyse de vrais concurrents, trouve de vraies plaintes clients, et délivre un verdict — pas une conversation. Il est conçu spécifiquement pour un seul travail : te dire si ton idée vaut la peine d'être construite.",
      faq_q2: "En quoi est-ce différent de demander à ChatGPT ?",
      faq_a2:
        "ChatGPT est d'accord avec tout. Klayan est conçu pour te challenger. Il utilise des données web en direct, suit un cadre de validation strict, et te donne un verdict Kill/Flip/Build avec des preuves. ChatGPT te donne de l'encouragement. Klayan te donne la vérité.",
      faq_q3: "Qu'est-ce que le verdict inclut exactement ?",
      faq_a3:
        "Un verdict complet inclut : le verdict (Kill/Flip/Build) avec une phrase brutale, 5 vérités difficiles soutenues par de vraies données, une analyse des concurrents avec prix et faiblesses, l'opportunité de marché, une stack technique recommandée, ton plan d'action pour les 48 prochaines heures, et la question qui fera ou brisera ton idée.",
      faq_q4: "Puis-je obtenir un remboursement ?",
      faq_a4:
        "Si tu lances ta première analyse et que tu n'es pas satisfait, envoie-nous un email dans les 48 heures et nous te rembourserons. Sans questions.",
      faq_q5: "Et si mon idée obtient un verdict KILL IT ?",
      faq_a5:
        "C'est le verdict le plus précieux que tu puisses obtenir. Il te fait économiser des mois de temps gaspillé et des milliers en coûts de développement. La plupart des startups qui ont échoué auraient voulu que quelqu'un leur dise plus tôt. Klayan te le dit dès le premier jour.",
      faq_q6: "Mon idée reste-t-elle privée ?",
      faq_a6:
        "Oui. Tes idées sont stockées en sécurité et ne sont jamais partagées, vendues ou utilisées pour entraîner des modèles IA. Ce que tu soumets reste le tien.",
      cta_title: "Ta prochaine idée mérite mieux qu'une intuition.",
      cta_sub: "Rejoins les founders qui valident d'abord et buildent ensuite.",
      cta_btn: "Analyser mon idée",
      cta_note: "Gratuit · Pas de carte bancaire · Résiliable à tout moment",
      footer: "© 2026 Klayan — Construit par des founders, pour des founders.",
    },
  }[lang];

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    void supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !user) {
      setAvatarUrl(null);
      setUserPlan("free");
      setProfileUsername(null);
      return;
    }
    void supabase
      .from("profiles")
      .select("username, avatar_url, plan")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("Landing: profiles query error", error);
          setAvatarUrl(null);
          setUserPlan("free");
          setProfileUsername(null);
          return;
        }
        if (!data) {
          setAvatarUrl(null);
          setUserPlan("free");
          setProfileUsername(null);
          return;
        }
        setProfileUsername(
          typeof data.username === "string" && data.username.trim()
            ? data.username.trim()
            : null
        );
        const u = data.avatar_url;
        setAvatarUrl(typeof u === "string" && u ? u : null);
        const raw =
          (data.plan as string | undefined)?.toLowerCase() ?? "free";
        setUserPlan(
          raw === "build" ? "build" : raw === "scale" ? "scale" : raw === "spark" ? "spark" : "free"
        );
      });
  }, [user]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileMenuOpen]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setSuccessOpen(false);
    document.body.style.overflow = "";
    setNextLabel("OK, NEXT →");
    setNextBusy(false);
  }, []);

  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const openModal = useCallback(() => {
    setCurrent(0);
    setAnswers(Array(7).fill(""));
    setInputValue("");
    setShowInputError(false);
    setModalOpen(true);
    setSuccessOpen(false);
    setNextLabel("OK, NEXT →");
    setNextBusy(false);
    document.body.style.overflow = "hidden";
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    if (modalOpen) {
      setInputValue(answers[current] ?? "");
    }
  }, [current, modalOpen, answers]);

  useLayoutEffect(() => {
    document.querySelectorAll(".reveal").forEach((el) => {
      el.classList.add("hidden");
    });
  }, []);

  useEffect(() => {
    const reveals = document.querySelectorAll(".reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.remove("hidden");
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    reveals.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const painCards = document.querySelectorAll<HTMLElement>(".pain-card");
    painCards.forEach((card, i) => {
      card.style.transition = "opacity 0.4s ease, transform 0.4s ease";
      if (i > 0) card.style.opacity = "0.4";
    });
    const onScroll = () => {
      const winH = window.innerHeight;
      painCards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        if (center > 0 && center < winH) {
          card.style.opacity = "1";
          card.style.transform = "scale(1)";
        } else {
          card.style.opacity = "0.4";
          card.style.transform = "scale(0.97)";
        }
      });
    };
    window.addEventListener("scroll", onScroll);
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const triggerShake = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    input.classList.remove("shake");
    void input.offsetWidth;
    input.classList.add("shake");
  }, []);

  const submitForm = useCallback(async (finalAnswers: string[]) => {
    const email = finalAnswers[6];
    setNextLabel("Sending...");
    setNextBusy(true);
    try {
      const w = window as Window & { emailjs?: EmailJs };
      await w.emailjs?.send(
        "service_r02bz7",
        "template_71g18ls",
        {
          email,
          idea: finalAnswers[0],
          target_customer: finalAnswers[1],
          why_problem: finalAnswers[2],
          existing_solutions: finalAnswers[3],
          unfair_advantage: finalAnswers[4],
          market_conversations: finalAnswers[5],
        },
        "v2gJC8RuLeTrpUZid"
      );
      console.log("EmailJS sent successfully");
    } catch (e) {
      console.error("EmailJS error:", e);
    }
    setModalOpen(false);
    setSuccessOpen(true);
    setNextBusy(false);
    setNextLabel("OK, NEXT →");
  }, []);

  const handleNext = useCallback(async () => {
    const val = inputValue.trim();
    if (!val) {
      setShowInputError(true);
      triggerShake();
      return;
    }
    setShowInputError(false);
    const nextAnswers = [...answers];
    nextAnswers[current] = val;
    setAnswers(nextAnswers);

    const total = QUESTIONS.length;
    if (current < total - 1) {
      const content = modalContentRef.current;
      if (content) {
        content.style.opacity = "0";
        content.style.transform = "translateY(-8px)";
        setTimeout(() => {
          setCurrent((c) => c + 1);
          content.style.transition = "opacity 0.25s ease, transform 0.25s ease";
          content.style.opacity = "1";
          content.style.transform = "translateY(0)";
        }, 180);
      } else {
        setCurrent((c) => c + 1);
      }
    } else {
      await submitForm(nextAnswers);
    }
  }, [answers, current, inputValue, submitForm, triggerShake]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!modalOpen) return;
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        void handleNext();
      }
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen, closeModal, handleNext]);

  const handlePrev = () => {
    if (current === 0) return;
    const nextAnswers = [...answers];
    nextAnswers[current] = inputValue;
    setAnswers(nextAnswers);
    const content = modalContentRef.current;
    if (content) {
      content.style.opacity = "0";
      content.style.transform = "translateY(8px)";
      setTimeout(() => {
        setCurrent((c) => c - 1);
        content.style.transition = "opacity 0.25s ease, transform 0.25s ease";
        content.style.opacity = "1";
        content.style.transform = "translateY(0)";
      }, 180);
    } else {
      setCurrent((c) => c - 1);
    }
  };

  useEffect(() => {
    if (!modalOpen) return;
    const total = QUESTIONS.length;
    setNextLabel(
      current === total - 1 ? "ANALYZE MY IDEA →" : "OK, NEXT →"
    );
    setShowInputError(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [current, modalOpen]);

  useEffect(() => {
    const video = document.getElementById("demoVideo") as HTMLVideoElement;
    const progress = document.getElementById("demoProgress") as HTMLInputElement;
    const timeEl = document.getElementById("demoTime");
    const volumeIcon = document.getElementById("volumeIcon");
    if (!video) return;
    const onTimeUpdate = () => {
      if (!video.duration) return;
      const pct = (video.currentTime / video.duration) * 100;
      if (progress) progress.value = String(pct);
      const mins = Math.floor(video.currentTime / 60);
      const secs = Math.floor(video.currentTime % 60)
        .toString()
        .padStart(2, "0");
      if (timeEl) timeEl.textContent = `${mins}:${secs}`;
      if (volumeIcon) {
        volumeIcon.innerHTML = video.muted
          ? '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>'
          : '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, []);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex((prev) => (prev === index ? null : index));
  };

  const q = QUESTIONS[current];
  const totalQ = QUESTIONS.length;
  const progressPct = ((current + 1) / totalQ) * 100;

  const scrollToServices = () => {
    document.getElementById("services")?.scrollIntoView({ behavior: "smooth" });
  };

  const renderPricingCta = (tier: PlanTier, featured: boolean) => {
    const loggedIn = !!user;
    const plan = loggedIn ? userPlan : null;
    const cta = getPricingCta(tier, { loggedIn, plan });
    const scaleCls = tier === "scale" ? " pricing-btn-scale" : "";

    if (cta.kind === "try-free") {
      return (
        <a
          href="/analyze"
          className={
            (featured ? "pricing-btn pricing-btn-light" : "pricing-btn pricing-btn-dark") +
            scaleCls
          }
        >
          {t.pricing_get_started}
        </a>
      );
    }
    if (cta.kind === "current") {
      return (
        <span
          className={"pricing-cta-current" + scaleCls}
          aria-current="true"
        >
          {lang === "fr" ? "Plan actuel" : cta.label}
        </span>
      );
    }
    if (cta.kind === "downgrade") {
      return (
        <a href="/dashboard" className={"pricing-cta-downgrade" + scaleCls}>
          {lang === "fr" ? "Rétrograder" : cta.label}
        </a>
      );
    }
    const priceId = cta.upgradeTarget
      ? getPriceIdForUpgradeTarget(cta.upgradeTarget)
      : getSparkPriceId();
    const targetPlan = cta.upgradeTarget ?? "spark";
    return (
      <button
        type="button"
        className={"pricing-cta-upgrade" + scaleCls}
        onClick={() => {
          if (priceId) {
            void handleUpgrade(priceId).catch(() => {
              window.location.href = `/pricing?plan=${targetPlan}`;
            });
          } else {
            window.location.href = `/pricing?plan=${targetPlan}`;
          }
        }}
      >
        {lang === "fr"
          ? cta.label
              .replace("Upgrade to Spark →", "Passer à Spark →")
              .replace("Upgrade to Build →", "Passer à Build →")
              .replace("Upgrade to Scale →", "Passer à Scale →")
              .replace("Try free", "Essayer gratuitement")
          : cta.label}
      </button>
    );
  };

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"
        strategy="afterInteractive"
        onLoad={() => {
          const w = window as Window & {
            emailjs?: { init: (publicKey: string) => void };
          };
          w.emailjs?.init("v2gJC8RuLeTrpUZid");
        }}
      />
      <form
        name="klayan-analysis"
        method="POST"
        data-netlify="true"
        data-netlify-honeypot="bot-field"
        className="hidden-netlify-form"
        aria-hidden
      >
        <input type="text" name="bot-field" tabIndex={-1} autoComplete="off" />
        <input type="text" name="email" />
        <input type="text" name="01_Idea" />
        <input type="text" name="02_Target_Customer" />
        <input type="text" name="03_Why_Real_Problem" />
        <input type="text" name="04_Existing_Solutions" />
        <input type="text" name="05_Unfair_Advantage" />
        <input type="text" name="06_Market_Conversations" />
      </form>

      <nav>
        <div className="nav-logo">
          <img
            src="/images/navbarlogo.png"
            alt="Klayan"
            className="nav-logo-img"
          />
        </div>
        <div className="nav-right" style={{ gap: 3 }}>
          <ul className="nav-links">
            <li>
              <a href="#services">{t.nav_services}</a>
            </li>
            <li>
              <a href="#pricing">{t.nav_pricing}</a>
            </li>
          </ul>
          <a href="/analyze" className="nav-cta">
            {t.nav_analyze}
          </a>
          {user ? (
            <div
              ref={profileMenuRef}
              style={{ position: "relative", marginLeft: 10, flexShrink: 0 }}
            >
              <button
                type="button"
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
                onClick={() => setProfileMenuOpen((o) => !o)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  background: avatarUrl ? "transparent" : "rgba(171,171,171,0.24)",
                  backdropFilter: avatarUrl ? undefined : "blur(8px)",
                  WebkitBackdropFilter: avatarUrl ? undefined : "blur(8px)",
                  color: "#fff",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    width={40}
                    height={40}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : (
                  profileInitials(user, profileUsername)
                )}
              </button>
              {profileMenuOpen ? (
                <div
                  role="menu"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 10px)",
                    right: 0,
                    minWidth: 200,
                    background: "rgba(22,22,22,0.96)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                    padding: "8px 0",
                    zIndex: 10000,
                    boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
                  }}
                >
                  <a
                    href="#"
                    role="menuitem"
                    onClick={(e) => {
                      e.preventDefault();
                      setProfileMenuOpen(false);
                      void openWorkspacePicker();
                    }}
                    style={PROFILE_DROPDOWN_ITEM_STYLE}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "0.5";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "1";
                    }}
                  >
                    {lang === "fr" ? "Espaces de travail" : "Workspaces"}
                  </a>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      window.location.href = "/dashboard";
                    }}
                    style={PROFILE_DROPDOWN_ITEM_STYLE}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "0.5";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "1";
                    }}
                  >
                    My Dashboard
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      window.location.href = "/analyze";
                    }}
                    style={PROFILE_DROPDOWN_ITEM_STYLE}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "0.5";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "1";
                    }}
                  >
                    New Analysis
                  </button>
                  <a
                    href="/contact"
                    role="menuitem"
                    onClick={() => setProfileMenuOpen(false)}
                    style={PROFILE_DROPDOWN_ITEM_STYLE}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "0.5";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "1";
                    }}
                  >
                    Contact
                  </a>
                  <div
                    style={{
                      height: 1,
                      background: "rgba(255,255,255,0.08)",
                      margin: "6px 0",
                    }}
                  />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={async () => {
                      setProfileMenuOpen(false);
                      if (supabase) await supabase.auth.signOut();
                    }}
                    style={PROFILE_DROPDOWN_ITEM_STYLE}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "0.5";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "1";
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                window.location.href = "/auth";
              }}
              style={{
                marginLeft: 10,
                flexShrink: 0,
                border: "none",
                cursor: "pointer",
                background: "rgba(171,171,171,0.24)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                borderRadius: 100,
                padding: "8px 16px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "#fff",
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: "-0.02em",
              }}
            >
              <img
                src="/images/navbarlogo.png"
                alt=""
                width={24}
                height={24}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
              {t.nav_signin}
            </button>
          )}
          <div style={{ position: "relative", marginLeft: 8 }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowLangDropdown(!showLangDropdown); }}
              style={{
                background: "rgba(171,171,171,0.15)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 100,
                padding: "8px 14px",
                color: "#fff",
                fontFamily: "'Inter', sans-serif",
                fontSize: 16,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {lang === "fr" ? "🇫🇷" : "🇬🇧"}
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>▾</span>
            </button>

            {showLangDropdown ? (
              <div style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                background: "#111",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                overflow: "hidden",
                zIndex: 100,
                minWidth: 120,
              }}>
                {[
                  { code: "en", flag: "🇬🇧", label: "English" },
                  { code: "fr", flag: "🇫🇷", label: "Français" },
                ].map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => {
                      const newLang = l.code as "en" | "fr";
                      setLang(newLang);
                      localStorage.setItem("klayan_lang", newLang);
                      setShowLangDropdown(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      background: lang === l.code ? "rgba(255,255,255,0.08)" : "transparent",
                      border: "none",
                      padding: "10px 16px",
                      color: "#fff",
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 13,
                      fontWeight: lang === l.code ? 600 : 400,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = lang === l.code ? "rgba(255,255,255,0.08)" : "transparent"; }}
                  >
                    <span>{l.flag}</span>
                    <span>{l.label}</span>
                    {lang === l.code ? <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.4)" }}>✓</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </nav>

      <div className="hero-outer">
        <div className="hero-box">
          <section className="hero" id="hero">
            <div className="hero-content">
              <div className="hero-title">
                <span className="hero-title-main">
                  {lang === "fr" ? "De l'Idée" : "From Idea"}
                </span>
                <br />
                <span className="hero-title-italic">
                  {lang === "fr" ? "au " : "to "}
                  {"10K MRR."}
                </span>
              </div>
              <p className="hero-sub">{t.hero_sub}</p>
              <div className="hero-cta-row">
                <a href="/analyze" className="hero-btn">
                  {t.hero_cta}
                </a>
                <div className="hero-divider" />
                <div className="hero-note">
                  {t.hero_note}
                  <button
                    type="button"
                    className="hero-scroll-btn"
                    onClick={scrollToServices}
                    aria-label="Scroll to services"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="demo-section">
        <div className="demo-video-wrap reveal" id="demoVideoWrap">
          <video
            id="demoVideo"
            src={lang === "fr" ? "https://res.cloudinary.com/dv1nagsve/video/upload/v1774978474/v2demo.francais_tthimr.mp4" : "https://res.cloudinary.com/dv1nagsve/video/upload/v1774977967/v2demo.english_oa203v.mp4"}
            loop
            playsInline
            className="demo-video"
            onClick={() => {
              const video = document.getElementById(
                "demoVideo"
              ) as HTMLVideoElement;
              const btn = document.getElementById("demoPlayBtn");
              const controls = document.getElementById("demoControls");
              if (video.paused) {
                void video.play();
                if (btn) btn.classList.add("hidden");
                if (controls) controls.classList.add("visible");
              } else {
                video.pause();
                if (btn) btn.classList.remove("hidden");
                if (controls) controls.classList.remove("visible");
              }
            }}
          />
          <button
            type="button"
            className="demo-play-btn"
            id="demoPlayBtn"
            onClick={() => {
              const video = document.getElementById(
                "demoVideo"
              ) as HTMLVideoElement;
              const btn = document.getElementById("demoPlayBtn");
              const controls = document.getElementById("demoControls");
              void video.play();
              if (btn) btn.classList.add("hidden");
              if (controls) controls.classList.add("visible");
            }}
            aria-label="Play demo"
          >
            <svg viewBox="0 0 24 24" fill="white" width="28" height="28">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <div className="demo-controls" id="demoControls">
            <input
              type="range"
              className="demo-progress"
              id="demoProgress"
              min={0}
              max={100}
              defaultValue={0}
              onChange={(e) => {
                const video = document.getElementById(
                  "demoVideo"
                ) as HTMLVideoElement;
                video.currentTime =
                  (Number(e.target.value) / 100) * video.duration;
              }}
            />
            <span className="demo-time" id="demoTime">
              0:00
            </span>
            <button
              type="button"
              className="demo-ctrl-btn"
              id="demoMuteBtn"
              aria-label="Toggle mute"
              onClick={(e) => {
                e.stopPropagation();
                const video = document.getElementById(
                  "demoVideo"
                ) as HTMLVideoElement;
                const btn = document.getElementById("demoMuteBtn");
                video.muted = !video.muted;
                if (btn) btn.setAttribute("data-muted", String(video.muted));
              }}
            >
              <svg
                id="volumeIcon"
                viewBox="0 0 24 24"
                fill="white"
                width="18"
                height="18"
              >
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
              </svg>
            </button>
            <button
              type="button"
              className="demo-ctrl-btn"
              aria-label="Fullscreen"
              onClick={(e) => {
                e.stopPropagation();
                const wrap = document.getElementById("demoVideoWrap");
                if (!document.fullscreenElement) {
                  wrap?.requestFullscreen();
                } else {
                  document.exitFullscreen();
                }
              }}
            >
              <svg viewBox="0 0 24 24" fill="white" width="18" height="18">
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      <section className="familiar-section" id="services">
        <div className="familiar-inner">
          <div className="familiar-left">
            <h2 className="familiar-title">{t.familiar_title}</h2>
          </div>
          <div className="familiar-right">
            <div className="pain-card reveal">
              <div className="pain-card-title">
                {t.pain1_title}
              </div>
              <div className="pain-bubbles">
                <div className="bubble bubble-dark">
                  &quot;{t.bubble1_reject}&quot;
                </div>
                <div className="pain-bubbles-row">
                  <div className="bubble bubble-white bubble-rotated">
                    &quot;{t.tsxbubble1_reject2}&quot;
                  </div>
                  <div className="bubble bubble-yellow bubble-rotated2">
                    {t.bubble1_months}
                  </div>
                </div>
              </div>
              <p className="pain-desc">{t.pain1_desc}</p>
            </div>
            <div className="pain-card reveal reveal-delay-1">
              <div className="pain-card-title">{t.pain2_title}</div>
              <div className="pain-bubbles">
                <div className="chat-row">
                  <div className="chatgpt-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
                    </svg>
                  </div>
                  <div className="bubble bubble-white">{t.bubble2_chatgpt}</div>
                </div>
                <div className="chat-row" style={{ marginTop: 8 }}>
                  <div
                    className="bubble bubble-yellow bubble-rotated2"
                    style={{ marginLeft: 0 }}
                  >
                    {t.bubble2_build}
                  </div>
                </div>
              </div>
              <p className="pain-desc">{t.pain2_desc}</p>
            </div>
            <div className="pain-card reveal reveal-delay-2">
              <div className="pain-card-title">{t.pain3_title}</div>
              <div className="pain-bubbles">
                <div className="chat-row">
                  <div className="chatgpt-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
                    </svg>
                  </div>
                  <div className="bubble bubble-white">{t.bubble3_icp}</div>
                </div>
                <div className="chat-row" style={{ marginTop: 8 }}>
                  <div className="bubble bubble-yellow bubble-rotate-2">
                    {t.bubble3_lost}
                  </div>
                </div>
              </div>
              <p className="pain-desc">{t.pain3_desc}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="how-section" id="how">
        <h2 className="section-title reveal">{t.how_title}</h2>
        <p className="section-sub reveal">{t.how_sub}</p>
        <div className="steps-grid">
          <div className="step-card purple row-top">
            <div className="step-pill">Step 1</div>
            <div className="step-text">
              <h3 className="step-title">{t.step1_title}</h3>
              <p className="step-desc">{t.step1_desc}</p>
            </div>
          </div>
          <div className="step-card dark row-top">
            <div className="step-pill">Step 2</div>
            <div className="step-text">
              <h3 className="step-title">{t.step2_title}</h3>
              <p className="step-desc">{t.step2_desc}</p>
            </div>
          </div>
          <div className="step-card dark row-bottom">
            <div className="step-pill">Step 3</div>
            <div className="step-text">
              <h3 className="step-title">{t.step3_title}</h3>
              <p className="step-desc">{t.step3_desc}</p>
            </div>
          </div>
          <div className="step-card dark row-tall step-card-step4">
            <div className="step-pill">Step 4</div>
            <div className="step-card-step4-logo-wrap">
              <img
                src="/images/cardgif.gif"
                alt=""
                width={220}
                height="auto"
              />
            </div>
            <div className="step-card-step4-text-wrap">
              <div className="step-text">
                <h3 className="step-title">{t.step4_title}</h3>
                <p className="step-desc">{t.step4_desc}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="honest-section">
        <h2 className="honest-title reveal">{t.honest_title}</h2>
        <div className="terminal-wrap reveal">
          <div className="terminal-bar">
            <div className="t-dot t-dot-a" />
            <div className="t-dot t-dot-b" />
            <div className="t-dot t-dot-c" />
            <div className="t-title">klayan_analysis.log</div>
          </div>
          <div className="terminal-body">
            <div className="t-header">KLAYAN ANALYSIS — YOUR IDEA</div>
            <div className="t-divider">
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            </div>
            <span className="t-label">SITUATION</span>
            <div className="t-content">
              You built an AI SMS tool targeting marketing agencies. Weeks of
              outreach. Zero paying customers. End of March deadline.
            </div>
            <div className="t-divider">
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            </div>
            <span className="t-label">HARD TRUTHS</span>
            <div className="t-numbered">
              <span className="t-arrow">›</span>
              <span className="t-num-text">
                01 — Your ICP is too broad. Marketing agencies is not a customer.
              </span>
            </div>
            <div className="t-numbered">
              <span className="t-arrow">›</span>
              <span className="t-num-text">
                02 — Market more saturated than you think. GHL already does this.
              </span>
            </div>
            <div className="t-numbered">
              <span className="t-arrow">›</span>
              <span className="t-num-text">
                03 — No clear distribution channel exists for this ICP.
              </span>
            </div>
            <div className="t-divider">
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            </div>
            <span className="t-label">VERDICT</span>
            <div className="t-verdict">—— FLIP IT ——</div>
            <div className="t-content">
              Core insight is right. Market is wrong. Pivot to performance agencies
              running paid lead gen for local services.
            </div>
            <div className="t-divider">
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            </div>
            <span className="t-label">NEXT 48 HOURS</span>
            <div className="t-numbered">
              <span className="t-arrow">›</span>
              <span className="t-num-text">
                01 — Search Facebook ads agency HVAC. DM 10 agencies today.
              </span>
            </div>
            <div className="t-numbered">
              <span className="t-arrow">›</span>
              <span className="t-num-text">
                02 — Run one free 2-week pilot. Document every number.
              </span>
            </div>
            <div className="t-numbered">
              <span className="t-arrow">›</span>
              <span className="t-num-text">
                03 — Rewrite pitch around ROI not features.
              </span>
            </div>
            <div className="t-divider">
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            </div>
            <span className="t-label">THE QUESTION THAT MATTERS</span>
            <div className="t-highlight">
              Can you find one person who says that&apos;s exactly what kills us —
              not that&apos;s interesting? Find them in 48 hours.
            </div>
          </div>
        </div>
        <h2 className="honest-tagline reveal">{t.honest_tagline}</h2>
      </section>

      <section className="why-section">
        <div className="why-header reveal">
          <h2 className="why-title">{t.why_title}</h2>
          <p className="why-sub">{t.why_sub}</p>
        </div>
        <div className="reasons-grid">
          <div className="reason-item reveal">
            <div className="reason-num">1</div>
            <h3 className="reason-title">{t.reason1_title}</h3>
            <p className="reason-desc">{t.reason1_desc}</p>
          </div>
          <div className="reason-item reveal reveal-delay-1">
            <div className="reason-num">2</div>
            <h3 className="reason-title">{t.reason2_title}</h3>
            <p className="reason-desc">{t.reason2_desc}</p>
          </div>
          <div className="reason-item reveal reveal-delay-2">
            <div className="reason-num">3</div>
            <h3 className="reason-title">{t.reason3_title}</h3>
            <p className="reason-desc">{t.reason3_desc}</p>
          </div>
          <div className="reason-item reveal">
            <div className="reason-num">4</div>
            <h3 className="reason-title">{t.reason4_title}</h3>
            <p className="reason-desc">{t.reason4_desc}</p>
          </div>
          <div className="reason-item reveal reveal-delay-1">
            <div className="reason-num">5</div>
            <h3 className="reason-title">{t.reason5_title}</h3>
            <p className="reason-desc">{t.reason5_desc}</p>
          </div>
          <div className="reason-item reveal reveal-delay-2">
            <div className="reason-num">6</div>
            <h3 className="reason-title">{t.reason6_title}</h3>
            <p className="reason-desc">{t.reason6_desc}</p>
          </div>
        </div>
      </section>

      <section className="pricing-section" id="pricing">
        <p className="pricing-label reveal">{t.pricing_label}</p>
        <div className="pricing-grid reveal">
          <div className="pricing-card">
            <div className="pricing-card-name">{t.pricing_spark}</div>
            <div className="pricing-price">{t.price_spark}{lang === "fr" ? "/mois" : "/mo"}</div>
            {renderPricingCta("spark", false)}
            <div className="pricing-divider" />
            <ul className="pricing-features">
              <li>
                <span className="feat-dot" /> {t.pricing_spark_f1}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_spark_f2}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_spark_f3}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_spark_f4}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_spark_f5}
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> {t.pricing_locked_signal}
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> {t.pricing_locked_flip}
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> {t.pricing_locked_structure}
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> {t.pricing_locked_roadmap}
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> {t.pricing_locked_marketing}
              </li>
            </ul>
          </div>
          <div className="pricing-card featured">
            <div className="pricing-popular-badge">
              {t.pricing_popular}{" "}
              <img
                src="/images/navbarlogo.png"
                alt=""
                className="pricing-inline-logo"
              />
            </div>
            <div className="pricing-card-name">{t.pricing_build}</div>
            <div className="pricing-price pricing-price-black">{t.price_build}{lang === "fr" ? "/mois" : "/mo"}</div>
            {renderPricingCta("build", true)}
            <div className="pricing-divider" />
            <ul className="pricing-features">
              <li>
                <span className="feat-dot" /> {t.pricing_build_f1}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_build_f2}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_build_f3}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_build_f4}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_build_f5}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_build_f6}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_build_f7}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_build_f8}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_build_f9}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_build_f10}
              </li>
            </ul>
          </div>
        </div>
        <div className="pricing-card scale reveal pricing-card-scale-max">
          <div className="pricing-card-name">{t.pricing_scale}</div>
          <div className="scale-badge">
            {t.pricing_scale_badge}{" "}
            <img
              src="/images/navbarlogo.png"
              alt=""
              className="pricing-inline-logo"
            />
          </div>
          <div className="pricing-price">{t.price_scale}{lang === "fr" ? "/mois" : "/mo"}</div>
          {renderPricingCta("scale", false)}
          <div className="pricing-divider pricing-divider-mt" />
          <ul className="pricing-features">
            <li>
              <span className="feat-dot" /> {t.pricing_scale_f1}
            </li>
            <li>
              <span className="feat-dot" /> {t.pricing_scale_f2}
            </li>
            <li>
              <span className="feat-dot" /> {t.pricing_scale_f3}
            </li>
            <li>
              <span className="feat-dot" /> {t.pricing_scale_f4}
            </li>
            <li>
              <span className="feat-dot" /> {t.pricing_scale_f5}
            </li>
            <li>
              <span className="feat-dot" /> {t.pricing_scale_f6}
            </li>
          </ul>
        </div>
      </section>

      <section className="story-section">
        <div className="story-quote reveal">{t.story_quote}</div>
        <div className="story-author reveal">{t.story_author}</div>
      </section>

      <section className="faq-section">
        <h2 className="faq-title reveal">{t.faq_title}</h2>
        <p className="faq-sub reveal">
          More questions? Book a call or email us at{" "}
          <a href="#" className="faq-email-link" onClick={(e) => e.preventDefault()}>
            [email&nbsp;protected]
          </a>
        </p>
        <div className="faq-list reveal">
          {[
            { q: t.faq_q1, a: t.faq_a1 },
            { q: t.faq_q2, a: t.faq_a2 },
            { q: t.faq_q3, a: t.faq_a3 },
            { q: t.faq_q4, a: t.faq_a4 },
            { q: t.faq_q5, a: t.faq_a5 },
            { q: t.faq_q6, a: t.faq_a6 },
          ].map((item, index) => (
            <div
              key={index}
              className={`faq-item${openFaqIndex === index ? " open" : ""}`}
            >
              <div
                className="faq-question"
                onClick={() => toggleFaq(index)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleFaq(index);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                {item.q}
                <span className="faq-plus">+</span>
              </div>
              <div className="faq-answer">{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="cta-section">
        <h2 className="cta-title reveal">{t.cta_title}</h2>
        <p className="cta-sub reveal">{t.cta_sub}</p>
        <a href="/analyze" className="cta-big-btn reveal">
          {t.cta_btn}
        </a>
        <p className="cta-note reveal">{t.cta_note}</p>
      </section>

      <footer>
        <div className="footer-copy">{t.footer}</div>
        <ul className="footer-links">
          <li>
            <a href="#" onClick={(e) => e.preventDefault()}>
              Privacy
            </a>
          </li>
          <li>
            <a href="#" onClick={(e) => e.preventDefault()}>
              Terms
            </a>
          </li>
          <li>
            <a href="#" onClick={(e) => e.preventDefault()}>
              Contact
            </a>
          </li>
        </ul>
      </footer>

      <div id="klayanModal" className={modalOpen ? "is-open" : ""}>
        <div className="klayan-modal-panel">
          <button
            type="button"
            className="klayan-modal-close"
            onClick={closeModal}
            aria-label="Close"
          >
            ✕
          </button>
          <div id="modalProgressBar">
            <div
              id="modalProgress"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div id="modalContent" ref={modalContentRef}>
            <div id="qLabel">{q.label}</div>
            <div id="qText">{q.question}</div>
            <div id="qHint">{q.hint}</div>
            <textarea
              ref={inputRef}
              id="qInput"
              rows={4}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={q.placeholder}
            />
            <div id="qError" className={showInputError ? "is-visible" : ""}>
              ✕ Type something to continue
            </div>
            <div id="qCtrlHint">
              Press <span className="kbd">Ctrl</span> +{" "}
              <span className="kbd">Enter</span> to continue
            </div>
            <div className="klayan-modal-actions">
              <button
                type="button"
                id="qNext"
                onClick={() => void handleNext()}
                disabled={nextBusy}
                style={{ opacity: nextBusy ? 0.6 : 1 }}
              >
                {nextLabel}
              </button>
              <button
                type="button"
                id="qBack"
                className={current > 0 ? "is-visible" : ""}
                onClick={handlePrev}
              >
                ↑ BACK
              </button>
            </div>
          </div>
          <div id="modalFooter">
            <span id="qCounter">
              {current + 1} of {totalQ} questions
            </span>
            <div id="qDots">
              {Array.from({ length: totalQ }, (_, i) => (
                <div
                  key={i}
                  className={
                    "modal-dot " +
                    (i === current ? "active" : i < current ? "done" : "todo")
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div id="klayanSuccess" className={successOpen ? "is-open" : ""}>
        <img
          src="/images/cardgif.gif"
          alt=""
          className="klayan-success-gif"
        />
        <h2 className="klayan-success-title">We&apos;re on it.</h2>
        <p className="klayan-success-text">
          Your verdict will be in your inbox within 24 hours. We&apos;re running a
          full Kill or Build analysis on your idea right now.
        </p>
        <button
          type="button"
          className="klayan-success-btn"
          onClick={closeModal}
        >
          Back to Klayan
        </button>
      </div>

      {showWorkspacePicker ? (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.8)",
          backdropFilter: "blur(8px)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
        onClick={() => setShowWorkspacePicker(false)}
        >
          <div
            style={{
              background: "#111",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 20,
              padding: 32,
              width: "100%",
              maxWidth: 480,
              maxHeight: "80vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em", color: "#fff" }}>
                  {lang === "fr" ? "Vos espaces de travail" : "Your Workspaces"}
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                  {lang === "fr" ? "Choisissez une idée" : "Choose an idea to work on"}
                </div>
              </div>
              <button type="button" onClick={() => setShowWorkspacePicker(false)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 20 }}>✕</button>
            </div>

            {userProjects.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
                {lang === "fr" ? "Pas encore d'espaces de travail. Lance une analyse pour en créer un." : "No workspaces yet. Run an analysis to create one."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {userProjects.map((project) => (
                  <a
                    key={project.id}
                    href={`/project/${project.id}`}
                    onClick={() => setShowWorkspacePicker(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "16px 20px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 14,
                      textDecoration: "none",
                      color: "#fff",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: project.status === "building" ? "#4ade80" : project.status === "pivoting" ? "#facc15" : "#f87171",
                        flexShrink: 0,
                      }} />
                      <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>
                        {project.idea_name.length > 40 ? project.idea_name.slice(0, 37) + "..." : project.idea_name}
                      </div>
                    </div>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>→</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
