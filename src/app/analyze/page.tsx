"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";

type QuestionMeta = {
  label: string;
};

const QUESTION_META: QuestionMeta[] = [
  { label: "01 →" },
  { label: "02 →" },
  { label: "03 →" },
  { label: "04 →" },
  { label: "05 →" },
  { label: "06 →" },
  { label: "07 →" },
];

export default function AnalyzePage() {
  function playSendSound() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(400, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  }

  function playVerdictSound() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      [523, 659, 784].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
        gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.2);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.2);
      });
    } catch (e) {}
  }

  const router = useRouter();
  const lang = useLang();
  const [showExample, setShowExample] = useState(false);

  // Draft logic — auto-save to localStorage
  const DRAFT_KEY = "klayan_analyze_draft";

  const saveDraft = (answers: string[]) => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ answers, savedAt: Date.now() }));
    } catch (e) {}
  };

  const clearDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  };

  const t = {
    en: {
      title: "What's your idea?",
      subtitle:
        "Be specific. The more detail you give, the more brutal and accurate the verdict.",
      placeholder:
        "Describe your idea in detail — what it does, who it's for, how it makes money...",
      free_note: "You have 1 free analysis. No credit card required.",
      thinking: "Klayan is thinking...",
      thinking_sub:
        "Searching competitors, scanning markets, building your verdict.",
      error_empty: "✕ Type something to continue",
      counter_of: "of",
      counter_questions: "questions",
      step1_title: "What's your idea in one sentence?",
      step1_sub: "The problem, who has it, and how you solve it.",
      step2_title: "Who specifically is your target customer?",
      step2_sub: "Not 'everyone'. A specific person with a specific pain.",
      step3_title: "What's the biggest problem your target customer has right now?",
      step3_sub: "Be brutal. What keeps them up at night?",
      step4_title: "How do you make money?",
      step4_sub: "Your pricing model, not your revenue projections.",
      step5_title: "Have you talked to anyone in your target market yet?",
      step5_sub: "What did they say? Be specific.",
      step6_title: "Why are you the right person to build this?",
      step6_sub: "Your unfair edge — experience, network, obsession.",
      step7_title: "What's your biggest fear about this idea?",
      step7_sub: "Be honest. This helps Klayan give you a real verdict.",
      step_next: "OK, NEXT →",
      step_back: "← Back",
      step_submit: "Analyze my idea →",
      step_analyzing: "Analyzing...",
      step_hint: "Press Ctrl + Enter to continue",
      step1_eg: "e.g. A tool that helps freelancers send invoices in 30 seconds without an accountant.",
      step2_eg: "e.g. Freelancers aged 25-40 who invoice 3-10 clients per month and hate spreadsheets.",
      step3_eg: "e.g. They lose hours every month on manual invoicing and often get paid late because of it.",
      step4_eg: "e.g. $29/month subscription, or $9 per invoice sent.",
      step5_eg: "e.g. Yes — 8 freelancers. 6 out of 8 said invoicing is their biggest admin pain.",
      step6_eg: "e.g. I'm a freelancer myself, I've felt this pain daily for 3 years.",
      step7_eg: "e.g. That people won't pay for it because they think spreadsheets are good enough.",
    },
    fr: {
      title: "C'est quoi ton idée ?",
      subtitle:
        "Sois précis. Plus tu donnes de détails, plus le verdict sera brutal et précis.",
      placeholder:
        "Décris ton idée en détail — ce qu'elle fait, pour qui, comment elle gagne de l'argent...",
      free_note: "Tu as 1 analyse gratuite. Pas de carte bancaire requise.",
      thinking: "Klayan réfléchit...",
      thinking_sub:
        "Recherche de concurrents, scan des marchés, construction de ton verdict.",
      error_empty: "✕ Écris quelque chose pour continuer",
      counter_of: "sur",
      counter_questions: "questions",
      step1_title: "C'est quoi ton idée en une phrase ?",
      step1_sub: "Le problème, qui l'a, et comment tu le résous.",
      step2_title: "C'est qui exactement ton client cible ?",
      step2_sub: "Pas 'tout le monde'. Une personne précise avec une douleur précise.",
      step3_title: "C'est quoi le plus grand problème de ton client cible en ce moment ?",
      step3_sub: "Sois brutal. Qu'est-ce qui l'empêche de dormir la nuit ?",
      step4_title: "Comment tu gagnes de l'argent ?",
      step4_sub: "Ton modèle de prix, pas tes projections de revenus.",
      step5_title: "Tu as déjà parlé à des gens de ton marché ?",
      step5_sub: "Ils ont dit quoi ? Sois précis.",
      step6_title: "Pourquoi tu es la bonne personne pour construire ça ?",
      step6_sub: "Ton avantage déloyal — expérience, réseau, obsession.",
      step7_title: "C'est quoi ta plus grande peur sur cette idée ?",
      step7_sub: "Sois honnête. Ça aide Klayan à te donner un vrai verdict.",
      step_next: "OK, SUIVANT →",
      step_back: "← Retour",
      step_submit: "Analyser mon idée →",
      step_analyzing: "Analyse en cours...",
      step_hint: "Appuie sur Ctrl + Entrée pour continuer",
      step1_eg: "ex. Un outil qui aide les freelances à envoyer des factures en 30 secondes sans comptable.",
      step2_eg: "ex. Freelances de 25-40 ans qui facturent 3-10 clients par mois et détestent les tableurs.",
      step3_eg: "ex. Ils perdent des heures chaque mois sur la facturation manuelle et se font souvent payer en retard.",
      step4_eg: "ex. Abonnement à 29€/mois, ou 9€ par facture envoyée.",
      step5_eg: "ex. Oui — 8 freelances. 6 sur 8 ont dit que la facturation est leur plus grande douleur admin.",
      step6_eg: "ex. Je suis moi-même freelance, j'ai vécu cette douleur chaque jour pendant 3 ans.",
      step7_eg: "ex. Que les gens ne voudront pas payer parce qu'ils pensent que les tableurs suffisent.",
    },
  }[lang];

  const exampleVerdict = {
    en: {
      idea: "An AI tool that helps solo founders validate their SaaS idea before building",
      verdict: "BUILD IT — but flip your positioning from 'validation tool' to 'AI co-founder that saves you 6 months of wasted work.'",
      hard_truths: [
        "35% of startups fail due to no market need — your problem is real and validated by CB Insights data",
        "ValidatorAI already has 300,000 users — you're entering a crowded market and need sharp differentiation",
        "ChatGPT is free and most founders use it to validate — your live web search is your only real moat",
        "Founders on Reddit say existing tools give 'feel-good scores' not actionable verdicts — that's your opening",
        "The market is growing — AI tools for founders is a $2.1B space by 2027 according to recent reports",
      ],
      opportunity: "No tool combines live web search + brutal verdict + actionable roadmap in one product. Most validators give you a score. None give you a co-founder.",
      next_48h: [
        "Post your landing page on r/SaaS and r/startups and ask for brutal feedback",
        "DM 10 founders on X who complained about wasted time building — offer them a free analysis",
        "Run your own idea through the tool and screenshot the verdict for social proof",
      ],
    },
    fr: {
      idea: "Un outil IA qui aide les founders solo à valider leur idée SaaS avant de construire",
      verdict: "BUILD IT — mais repositionne-toi de 'outil de validation' à 'co-fondateur IA qui te fait économiser 6 mois de travail inutile.'",
      hard_truths: [
        "35% des startups échouent par manque de marché — ton problème est réel et validé par les données CB Insights",
        "ValidatorAI a déjà 300 000 utilisateurs — tu entres dans un marché saturé et tu dois te différencier fortement",
        "ChatGPT est gratuit et la plupart des founders l'utilisent pour valider — ta recherche web en direct est ton seul vrai avantage",
        "Les founders sur Reddit disent que les outils existants donnent des 'scores feel-good' pas des verdicts actionnables — c'est ton ouverture",
        "Le marché grandit — les outils IA pour founders représentent 2,1 milliards de dollars d'ici 2027",
      ],
      opportunity: "Aucun outil ne combine recherche web en direct + verdict brutal + roadmap actionnable en un seul produit. La plupart des validateurs te donnent un score. Aucun ne te donne un co-fondateur.",
      next_48h: [
        "Poste ta landing page sur r/SaaS et r/startups et demande un retour brutal",
        "DM 10 founders sur X qui ont parlé de temps gaspillé à construire — offre-leur une analyse gratuite",
        "Passe ta propre idée dans l'outil et prends une capture du verdict pour la preuve sociale",
      ],
    },
  }[lang];

  const totalQ = QUESTION_META.length;

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("klayan_analyze_draft");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.answers && Array.isArray(parsed.answers)) return parsed.answers;
      }
    } catch (e) {}
    return Array(QUESTION_META.length).fill("");
  });
  const [inputValue, setInputValue] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInputError, setShowInputError] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const progressPct = useMemo(
    () => ((current + 1) / totalQ) * 100,
    [current, totalQ]
  );

  const q = QUESTION_META[current];

  const stepRows = [
    [t.step1_title, t.step1_sub],
    [t.step2_title, t.step2_sub],
    [t.step3_title, t.step3_sub],
    [t.step4_title, t.step4_sub],
    [t.step5_title, t.step5_sub],
    [t.step6_title, t.step6_sub],
    [t.step7_title, t.step7_sub],
  ] as const;
  const [stepTitle, stepSub] = stepRows[current];

  const nextLabel = useMemo(
    () => (current === totalQ - 1 ? t.step_submit : t.step_next),
    [current, totalQ, t.step_submit, t.step_next]
  );

  const stepPlaceholders = useMemo(
    () => [t.step1_eg, t.step2_eg, t.step3_eg, t.step4_eg, t.step5_eg, t.step6_eg, t.step7_eg],
    [t.step1_eg, t.step2_eg, t.step3_eg, t.step4_eg, t.step5_eg, t.step6_eg, t.step7_eg]
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      router.push("/auth");
    }
  }, [router]);

  useEffect(() => {
    setInputValue(answers[current] ?? "");
    setShowInputError(false);
    setSubmitError(null);
    // Keep focus consistent with the original modal behavior.
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [current, totalQ, answers, isSubmitting]);

  const triggerShake = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.classList.remove("shake");
    // Force reflow to restart animation.
    void el.offsetWidth;
    el.classList.add("shake");
  }, []);

  const animateTo = useCallback(
    (nextIndex: number, direction: "next" | "prev") => {
      const content = contentRef.current;
      if (!content) {
        setCurrent(nextIndex);
        return;
      }

      content.style.transition = "none";
      content.style.opacity = "0";
      content.style.transform =
        direction === "next"
          ? "translateY(-8px)"
          : "translateY(8px)";

      setTimeout(() => {
        setCurrent(nextIndex);
        content.style.transition = "opacity 0.25s ease, transform 0.25s ease";
        content.style.opacity = "1";
        content.style.transform = "translateY(0)";
      }, 180);
    },
    []
  );

  const handlePrev = useCallback(() => {
    if (isSubmitting) return;
    if (current === 0) return;

    const nextAnswers = [...answers];
    nextAnswers[current] = inputValue;
    setAnswers(nextAnswers);

    animateTo(current - 1, "prev");
  }, [answers, animateTo, current, inputValue, isSubmitting]);

  const handleNext = useCallback(async () => {
    if (isSubmitting) return;

    if (!answers.every(a => a.trim())) {
      setSubmitError(lang === "fr" ? "Réponds à toutes les questions." : "Please answer all questions.");
      return;
    }

    setSubmitError(null);
    const nextAnswers = [...answers];

    if (!supabase) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      console.log("Getting user...");
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error("No user session:", userError);
        setIsSubmitting(false);
        router.push("/auth");
        return;
      }

      const userEmail =
        user.email ??
        (user.user_metadata?.email as string | undefined) ??
        "";

      if (!userEmail.trim()) {
        setSubmitError(
          "No email on your account. Add one in your auth profile and try again."
        );
        setIsSubmitting(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_status, plan")
        .eq("id", user.id)
        .maybeSingle();

      const subStatus =
        (profile?.subscription_status as string | undefined)?.toLowerCase() ?? "inactive";

      playSendSound();
      console.log("Inserting analysis...");
      const insertPayload = {
        user_id: user.id,
        idea: nextAnswers[0],
        target_customer: nextAnswers[1],
        why_problem: nextAnswers[2],
        existing_solutions: nextAnswers[3],
        market_conversations: nextAnswers[4],
        unfair_advantage: nextAnswers[5],
        email: userEmail,
        status: "pending",
        verdict: null as string | null,
      };

      const { data, error: insertError } = await supabase
        .from("analyses")
        .insert(insertPayload)
        .select("id")
        .single();

      console.log("Insert result:", data, insertError);

      if (insertError || !data?.id) {
        console.error("Insert error:", insertError);
        setSubmitError("Something went wrong. Please try again.");
        setIsSubmitting(false);
        return;
      }

      const analysisId = data.id;

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", user.id)
        .maybeSingle();

      const planRaw =
        (profileRow?.plan as string | undefined)?.toLowerCase() ?? "spark";
      const isFree = planRaw === "free" || planRaw === "";

      const { count, error: countError } = await supabase
        .from("analyses")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (countError) {
        console.error("Analyze: analyses count error", countError);
      }

      const FREE_ANALYSES = 1;
      const analysisCount = count ?? 0;

      if (isFree && analysisCount > FREE_ANALYSES) {
        window.location.href = `/pricing?analysisId=${analysisId}`;
        return;
      }



      // Verdict page mounts and calls /api/analyze while this tab stays on that URL
      playVerdictSound();
      clearDraft();
      window.location.href = `/verdict/${data.id}`;
    } catch (e) {
      console.error("Submit exception:", e);
      setSubmitError("Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  }, [
    answers,
    animateTo,
    current,
    inputValue,
    isSubmitting,
    router,
    totalQ,
    triggerShake,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        void handleNext();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handleNext]);

  const [openIdx, setOpenIdx] = useState<number>(0);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const allFilled = answers.every(a => a.trim().length > 0);

  return (
    <div style={{ height: "100vh", background: "#000", color: "#fff", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <video autoPlay muted loop playsInline style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(18px) brightness(0.35)", transform: "scale(1.08)", zIndex: 0, pointerEvents: "none" }} src="https://res.cloudinary.com/dv1nagsve/video/upload/v1776312898/landing_pchifo.mp4" />
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1, pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Navbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 32px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}><Link href="/" style={{ textDecoration: "none" }}><img src="/images/navbarlogo.png" alt="Klayan" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} /></Link><Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 6, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.08)", textDecoration: "none", padding: "0 14px" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg><span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", fontFamily: "'Europa Grotesk No 2 SH', sans-serif" }}>{lang === "fr" ? "Brouillon" : "Draft"}</span></Link></div>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", fontFamily: "'Europa Grotesk No 2 SH', sans-serif", marginLeft: isMobile ? 16 : 0, textAlign: isMobile ? "right" as const : "left" as const, flexShrink: 1, minWidth: 0 }}>{t.free_note}</span>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 32 : 64, padding: isMobile ? "32px 20px" : "64px 48px", maxWidth: 1100, margin: "0 auto", width: "100%", overflow: isMobile ? "auto" : "hidden" }}>

        {/* Left — title */}
        <div style={{ width: isMobile ? "100%" : 320, flexShrink: 0, alignSelf: "flex-start", position: isMobile ? "static" : "sticky", top: 0 }}>

          <h1 style={{ fontSize: 42, fontWeight: 500, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1.1, margin: "0 0 16px", fontFamily: "'Europa Grotesk No 2 SH', sans-serif" }}>
            {lang === "fr" ? <><span>Dis-nous tout</span><br /><span style={{ color: "#ffffff" }}>sur ton idée.</span></> : <><span>Tell us everything</span><br /><span style={{ color: "#ffffff" }}>about your idea.</span></>}
          </h1>
          <p style={{ fontSize: 14, fontWeight: 300, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, fontFamily: "'Europa Grotesk No 2 SH', sans-serif", margin: "0 0 20px" }}>
            {lang === "fr"
              ? "Sois précis. Plus tu donnes de détails, plus le verdict sera brutal et précis."
              : "Be specific. The more detail you give, the more brutal and accurate the verdict."}
          </p>

          {/* Example verdict */}
          <details style={{ marginBottom: 32 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.45)", fontFamily: "'Europa Grotesk No 2 SH', sans-serif", listStyle: "none", display: "flex", alignItems: "center", gap: 6, userSelect: "none" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {lang === "fr" ? "Voir un exemple de verdict" : "See an example verdict"}
            </summary>
            <div style={{ marginTop: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "16px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#4ade80", fontFamily: "'Europa Grotesk No 2 SH', sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>BUILD IT</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontFamily: "'Europa Grotesk No 2 SH', sans-serif", lineHeight: 1.6, marginBottom: 12 }}>
                {lang === "fr"
                  ? "Un outil IA pour aider les founders solo à valider leur SaaS avant de construire. Le marché est réel — 35% des startups échouent par manque de besoin marché. Mais tes concurrents ont 300k+ utilisateurs. Ton ouverture : les outils existants donnent des scores feel-good. Klayan donne des verdicts brutaux. Repositionne-toi en co-fondateur IA qui te fait économiser 6 mois de travail inutile."
                  : "An AI tool helping solo founders validate their SaaS before building. Market is real — 35% of startups fail from no market need. But competitors have 300k+ users. Your opening: existing tools give feel-good scores. Klayan gives brutal verdicts. Reposition as the AI co-founder that saves you 6 months of wasted work."}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  lang === "fr" ? "Cible les founders qui ont déjà brûlé de l'argent sur une mauvaise idée" : "Target founders who already burned money on the wrong idea",
                  lang === "fr" ? "Le verdict Kill est votre différenciateur — aucun concurrent ne l'offre" : "The Kill verdict is your differentiator — no competitor offers it",
                  lang === "fr" ? "Prouve ça avec 10 analyses publiques sur Reddit cette semaine" : "Prove it with 10 public analyses on Reddit this week"
                ].map((point, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ade80", marginTop: 6, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontFamily: "'Europa Grotesk No 2 SH', sans-serif", lineHeight: 1.5 }}>{point}</span>
                  </div>
                ))}
              </div>
            </div>
          </details>

          {isSubmitting && (
            <div style={{ background: "#f8f8f8", borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#111", fontFamily: "'Inter', sans-serif", marginBottom: 6 }}>{t.thinking}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", fontFamily: "'Europa Grotesk No 2 SH', sans-serif", lineHeight: 1.5 }}>{t.thinking_sub}</div>
            </div>
          )}

          {submitError && (
            <div style={{ background: "#fff0f0", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#dc2626", fontFamily: "'Inter', sans-serif" }}>
              ✕ {submitError}
            </div>
          )}
        </div>

        {/* Right — FAQ accordion */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 0, overflowY: isMobile ? "visible" : "auto", maxHeight: isMobile ? "none" : "calc(100vh - 140px)", paddingRight: isMobile ? 0 : 4 }}>
          {stepRows.map(([title, sub], idx) => {
            const isOpen = openIdx === idx;
            const isFilled = answers[idx]?.trim().length > 0;
            return (
              <div key={idx} style={{ borderRadius: 16, border: "none", marginBottom: 10, overflow: "visible", background: "#1c1c1e", boxShadow: isOpen ? "0 4px 24px rgba(0,0,0,0.5)" : "none" }}>
                {/* Header */}
                <button
                  type="button"
                  onClick={() => setOpenIdx(isOpen ? -1 : idx)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ fontSize: 16, fontWeight: 500, color: "#fff", fontFamily: "'Inter', sans-serif", letterSpacing: "-0.01em" }}>
                    {isFilled && !isOpen && (
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", background: "#111111", marginRight: 10 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      </span>
                    )}
                    {title}
                  </span>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: isOpen ? "#111111" : "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isOpen ? "#fff" : "#111111"} strokeWidth="2.5" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>
                </button>

                {/* Body */}
                {isOpen && (
                  <div style={{ padding: "0 24px 24px" }}>
                    {sub && <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", fontFamily: "'Europa Grotesk No 2 SH', sans-serif", margin: "0 0 14px", lineHeight: 1.5 }}>{sub}</p>}
                    <textarea
                      autoFocus
                      rows={4}
                      value={answers[idx] ?? ""}
                      onChange={(e) => {
                        const next = [...answers];
                        next[idx] = e.target.value;
                        setAnswers(next);
                        saveDraft(next);
                      }}
                      placeholder={stepPlaceholders[idx]}
                      disabled={isSubmitting}
                      style={{ width: "100%", borderRadius: 10, border: "1px solid #e0e0e0", padding: "14px 16px", fontSize: 14, fontFamily: "'Inter', sans-serif", color: "#fff", background: "#222222", resize: "none", outline: "none", boxSizing: "border-box" as any, lineHeight: 1.6 }}
                      onFocus={(e) => { e.target.style.borderColor = "#555"; e.target.style.background = "#222222"; }}
                      onBlur={(e) => { e.target.style.borderColor = "#444"; e.target.style.background = "#222222"; }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                      {idx < totalQ - 1 ? (
                        <button
                          type="button"
                          onClick={() => setOpenIdx(idx + 1)}
                          disabled={!answers[idx]?.trim()}
                          style={{ background: "#111111", color: "#fff", border: "none", borderRadius: 100, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: answers[idx]?.trim() ? "pointer" : "not-allowed", opacity: answers[idx]?.trim() ? 1 : 0.4, fontFamily: "'Inter', sans-serif" }}
                        >
                          {lang === "fr" ? "Suivant →" : "Next →"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleNext()}
                          disabled={isSubmitting || !answers[idx]?.trim()}
                          style={{ background: "#111111", color: "#fff", border: "none", borderRadius: 100, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: answers[idx]?.trim() ? "pointer" : "not-allowed", opacity: answers[idx]?.trim() ? 1 : 0.4, fontFamily: "'Inter', sans-serif" }}
                        >
                          {isSubmitting ? t.step_analyzing : (lang === "fr" ? "Suivant →" : "Next →")}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Submit button always visible when all filled */}
          {allFilled && !isSubmitting && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={() => void handleNext()}
                style={{ width: "100%", background: "#111111", color: "#fff", border: "none", borderRadius: 14, padding: "16px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter', sans-serif", letterSpacing: "-0.01em" }}
              >
                {isSubmitting ? t.step_analyzing : t.step_submit}
              </button>
            </div>
          )}
        </div>
      </div>

      {showExample ? (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.9)",
          backdropFilter: "blur(8px)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          overflowY: "auto",
        }}
        onClick={() => setShowExample(false)}
        >
          <div
            style={{
              background: "#111",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 20,
              padding: 32,
              width: "100%",
              maxWidth: 600,
              maxHeight: "90vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {lang === "fr" ? "Exemple de verdict" : "Example Verdict"}
              </div>
              <button type="button" onClick={() => setShowExample(false)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>

            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
              {lang === "fr" ? "Idée soumise" : "Submitted idea"}
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", marginBottom: 24, fontStyle: "italic", lineHeight: 1.6 }}>
              &quot;{exampleVerdict.idea}&quot;
            </div>

            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                {lang === "fr" ? "Verdict" : "Verdict"}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#4ade80", lineHeight: 1.5 }}>
                {exampleVerdict.verdict}
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
                {lang === "fr" ? "Vérités difficiles" : "Hard Truths"}
              </div>
              {exampleVerdict.hard_truths.map((truth, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                  <span style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>0{i + 1} —</span>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>{truth}</span>
                </div>
              ))}
            </div>

            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                {lang === "fr" ? "Opportunité" : "Opportunity"}
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
                {exampleVerdict.opportunity}
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
                {lang === "fr" ? "Prochaines 48h" : "Next 48 Hours"}
              </div>
              {exampleVerdict.next_48h.map((action, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                  <span style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>0{i + 1} —</span>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>{action}</span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowExample(false)}
              style={{
                background: "#ffffff",
                color: "#000",
                border: "none",
                borderRadius: 100,
                padding: "12px 24px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                width: "100%",
              }}
            >
              {lang === "fr" ? "Valider ma propre idée →" : "Validate my own idea →"}
            </button>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}

