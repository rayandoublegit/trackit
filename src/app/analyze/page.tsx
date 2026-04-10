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
      step2_title: "Who's your target customer?",
      step2_sub: "Be specific. Not 'everyone'. Who exactly has this problem?",
      step3_title: "How do you make money?",
      step3_sub: "Your pricing model, not your revenue projections.",
      step4_title: "Who are your main competitors?",
      step4_sub: "Direct and indirect. What are people using instead of you?",
      step5_title: "What's your unfair advantage?",
      step5_sub: "Why you, why now?",
      step6_title: "Have you talked to anyone in your target market yet?",
      step6_sub: "What did they say? Be specific.",
      step_next: "OK, NEXT →",
      step_back: "← Back",
      step_submit: "Analyze my idea →",
      step_analyzing: "Analyzing...",
      step_hint: "Press Ctrl + Enter to continue",
      step1_eg: "e.g. A tool that helps freelancers send invoices in 30 seconds without an accountant.",
      step2_eg: "e.g. Freelancers aged 25-40 who invoice 3-10 clients per month and hate spreadsheets.",
      step3_eg: "e.g. $29/month subscription, or $9 per invoice sent.",
      step4_eg: "e.g. FreshBooks, Wave, QuickBooks — but they're too complex for solo freelancers.",
      step5_eg: "e.g. I'm a freelancer myself and hate invoicing. I already have 5 friends who'd pay for this.",
      step6_eg: "e.g. Yes — 8 freelancers. 6 out of 8 said invoicing is their biggest admin pain.",
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
      step2_title: "C'est qui ton client cible ?",
      step2_sub: "Sois précis. Pas 'tout le monde'. Qui exactement a ce problème ?",
      step3_title: "Comment tu gagnes de l'argent ?",
      step3_sub: "Ton modèle de prix, pas tes projections de revenus.",
      step4_title: "C'est qui tes principaux concurrents ?",
      step4_sub: "Directs et indirects. Qu'est-ce que les gens utilisent à la place ?",
      step5_title: "C'est quoi ton avantage déloyal ?",
      step5_sub: "Pourquoi toi, pourquoi maintenant ?",
      step6_title: "Tu as déjà parlé à des gens de ton marché ?",
      step6_sub: "Ils ont dit quoi ? Sois précis.",
      step_next: "OK, SUIVANT →",
      step_back: "← Retour",
      step_submit: "Analyser mon idée →",
      step_analyzing: "Analyse en cours...",
      step_hint: "Appuie sur Ctrl + Entrée pour continuer",
      step1_eg: "ex. Un outil qui aide les freelances à envoyer des factures en 30 secondes sans comptable.",
      step2_eg: "ex. Freelances de 25-40 ans qui facturent 3-10 clients par mois et détestent les tableurs.",
      step3_eg: "ex. Abonnement à 29€/mois, ou 9€ par facture envoyée.",
      step4_eg: "ex. FreshBooks, Wave, QuickBooks — mais trop complexes pour les freelances solo.",
      step5_eg: "ex. Je suis moi-même freelance et je déteste la facturation. J'ai déjà 5 amis qui paieraient pour ça.",
      step6_eg: "ex. Oui — 8 freelances. 6 sur 8 ont dit que la facturation est leur plus grande douleur administrative.",
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
  const [answers, setAnswers] = useState<string[]>(() =>
    Array(QUESTION_META.length).fill("")
  );
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
  ] as const;
  const [stepTitle, stepSub] = stepRows[current];

  const nextLabel = useMemo(
    () => (current === totalQ - 1 ? t.step_submit : t.step_next),
    [current, totalQ, t.step_submit, t.step_next]
  );

  const stepPlaceholders = useMemo(
    () => [t.step1_eg, t.step2_eg, t.step3_eg, t.step4_eg, t.step5_eg, t.step6_eg],
    [t.step1_eg, t.step2_eg, t.step3_eg, t.step4_eg, t.step5_eg, t.step6_eg]
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

    const val = inputValue.trim();
    if (!val) {
      setShowInputError(true);
      setSubmitError(null);
      triggerShake();
      return;
    }

    setShowInputError(false);

    const nextAnswers = [...answers];
    nextAnswers[current] = val;
    setAnswers(nextAnswers);

    if (current < totalQ - 1) {
      animateTo(current + 1, "next");
      return;
    }

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
        unfair_advantage: nextAnswers[4],
        market_conversations: nextAnswers[5],
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
      const isSpark = planRaw !== "build" && planRaw !== "scale";

      const { count, error: countError } = await supabase
        .from("analyses")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (countError) {
        console.error("Analyze: analyses count error", countError);
      }

      const FREE_ANALYSES = 1;
      const analysisCount = count ?? 0;



      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          userId: user.id,
        }),
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 500 || res.status === 529) {
          setSubmitError(
            lang === "fr"
              ? "Notre IA est surchargée en ce moment. Réessaie dans 30 secondes."
              : "Our AI is overloaded right now. Try again in 30 seconds."
          );
        } else if (errData.error === "Subscription required") {
          setIsSubmitting(false);
          router.push("/pricing");
          return;
        } else {
          setSubmitError(
            lang === "fr"
              ? "Une erreur est survenue. Réessaie."
              : "Something went wrong. Please try again."
          );
        }
        setIsSubmitting(false);
        return;
      }

      window.location.href = `/verdict/${analysisId}`;
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
    lang,
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

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#000000",
        color: "var(--white)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ position: "fixed", top: "24px", left: "24px", zIndex: 1000 }}>
        <Link
          href="/"
          aria-label="Home"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            background: "rgba(171,171,171,0.24)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            border: "none",
            cursor: "pointer",
            textDecoration: "none",
          }}
        >
          <img
            src="/images/navbarlogo.png"
            alt=""
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              objectFit: "cover",
            }}
          />
        </Link>
      </div>

      <div
        style={{
          width: "100%",
          height: 2,
          background: "rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}
      >
        <div
          id="modalProgress"
          style={{
            height: "100%",
            background: "#fff",
            transition: "width 0.4s ease",
            width: `${progressPct}%`,
          }}
        />
      </div>

      <div id="modalContent" ref={contentRef}>
        {!isSubmitting ? <div id="qLabel">{q.label}</div> : null}
        <div id="qText">
          {isSubmitting ? t.thinking : stepTitle}
        </div>
        <div id="qHint">
          {isSubmitting ? t.thinking_sub : stepSub}
        </div>

        <div style={{ marginBottom: 32 }}>
          <button
            type="button"
            onClick={() => setShowExample(true)}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 12,
              padding: "14px 24px",
              color: "#ffffff",
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "-0.01em",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
          >
            <span style={{ fontSize: 16 }}>👁️</span>
            {lang === "fr" ? "Voir un exemple de verdict" : "See an example verdict"}
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>→</span>
          </button>
        </div>

        <textarea
          id="qInput"
          ref={inputRef}
          rows={4}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={isSubmitting}
          placeholder={stepPlaceholders[current]}
        />

        <div
          id="qError"
          className={showInputError || submitError ? "is-visible" : ""}
        >
          {submitError ? `✕ ${submitError}` : t.error_empty}
        </div>

        <div id="qCtrlHint">{t.step_hint}</div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <button
            id="qNext"
            type="button"
            onClick={() => void handleNext()}
            disabled={isSubmitting}
            style={{ opacity: isSubmitting ? 0.6 : 1 }}
          >
            {isSubmitting ? t.step_analyzing : nextLabel}
          </button>

          <button
            id="qBack"
            type="button"
            className={current > 0 ? "is-visible" : ""}
            onClick={handlePrev}
          >
            {t.step_back}
          </button>
        </div>
      </div>

      <div id="modalFooter">
        <span id="qCounter">
          {current + 1} {t.counter_of} {totalQ} {t.counter_questions} ·{" "}
          {t.free_note}
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
  );
}

