"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";

type QuestionMeta = {
  label: string;
  placeholder: string;
};

const QUESTION_META: QuestionMeta[] = [
  {
    label: "01 →",
    placeholder:
      "e.g. An AI tool that helps solo founders validate their SaaS idea before building anything...",
  },
  {
    label: "02 →",
    placeholder:
      "e.g. Solo SaaS founders aged 25-35 who keep building products nobody wants...",
  },
  {
    label: "03 →",
    placeholder:
      "e.g. I built 3 products in 12 months with zero paying customers because I never validated...",
  },
  {
    label: "04 →",
    placeholder:
      "e.g. They ask ChatGPT, post on Reddit, or just wing it and hope for the best...",
  },
  {
    label: "05 →",
    placeholder:
      "e.g. I've lived this problem firsthand and know exactly what founders need...",
  },
  {
    label: "06 →",
    placeholder:
      "e.g. I DMed 20 founders on Reddit. 8 responded. 3 said they'd pay for this today...",
  },
];

export default function AnalyzePage() {
  const router = useRouter();
  const lang = useLang();

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

      if (isSpark && analysisCount > FREE_ANALYSES) {
        window.location.href = `/pricing?analysisId=${analysisId}`;
        return;
      }

      // Verdict page mounts and calls /api/analyze while this tab stays on that URL
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

        <textarea
          id="qInput"
          ref={inputRef}
          rows={4}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={isSubmitting}
          placeholder={
            current === 0 ? t.placeholder : q.placeholder
          }
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
    </div>
  );
}

