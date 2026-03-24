"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getSparkPriceId } from "@/lib/checkout";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

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
] as const;

type Question = (typeof QUESTIONS)[number];

export default function AnalyzePage() {
  const router = useRouter();

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() => Array(6).fill(""));
  const [inputValue, setInputValue] = useState("");

  const [nextLabel, setNextLabel] = useState("OK, NEXT →");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInputError, setShowInputError] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const totalQ = QUESTIONS.length;
  const progressPct = useMemo(
    () => ((current + 1) / totalQ) * 100,
    [current, totalQ]
  );

  const q: Question = QUESTIONS[current];

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      router.push("/auth");
    }
  }, [router]);

  useEffect(() => {
    setInputValue(answers[current] ?? "");
    if (!isSubmitting) {
      setNextLabel(
        current === totalQ - 1 ? "ANALYZE MY IDEA →" : "OK, NEXT →"
      );
    }
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

      const sparkPriceId = getSparkPriceId();

      if (
        isSpark &&
        analysisCount > FREE_ANALYSES &&
        sparkPriceId
      ) {
        const res = await fetch("/api/create-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            priceId: sparkPriceId,
            userId: user.id,
            email: user.email,
            analysisId,
          }),
        });

        const checkoutPayload = (await res.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
        };

        if (!res.ok || !checkoutPayload.url) {
          setSubmitError(
            checkoutPayload.error ??
              "Could not start checkout. Please try again."
          );
          setIsSubmitting(false);
          return;
        }

        window.location.href = checkoutPayload.url;
        return;
      }

      if (isSpark && analysisCount > FREE_ANALYSES && !sparkPriceId) {
        setSubmitError(
          "Subscription checkout is not configured. Contact support."
        );
        setIsSubmitting(false);
        return;
      }

      // Fire and forget - do NOT await
      const {
        data: { user: userForAnalyze },
      } = await supabase.auth.getUser();
      console.log("Triggering analyze for:", data.id);
      fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: data.id,
          userId: userForAnalyze?.id,
        }),
      }).catch(console.error);

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
            src="https://i.ibb.co/msYn5RH/navbarlogo.png"
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
        <div id="qLabel">{q.label}</div>
        <div id="qText">{q.question}</div>
        <div id="qHint">{q.hint}</div>

        <textarea
          id="qInput"
          ref={inputRef}
          rows={4}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={q.placeholder}
        />

        <div
          id="qError"
          className={showInputError || submitError ? "is-visible" : ""}
        >
          {submitError ? `✕ ${submitError}` : "✕ Type something to continue"}
        </div>

        <div id="qCtrlHint">
          Press{" "}
          <span className="kbd" style={{ padding: "1px 6px", fontSize: 10 }}>
            Ctrl
          </span>{" "}
          +{" "}
          <span className="kbd" style={{ padding: "1px 6px", fontSize: 10 }}>
            Enter
          </span>{" "}
          to continue
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <button
            id="qNext"
            type="button"
            onClick={() => void handleNext()}
            disabled={isSubmitting}
            style={{ opacity: isSubmitting ? 0.6 : 1 }}
          >
            {isSubmitting ? "Saving..." : nextLabel}
          </button>

          <button
            id="qBack"
            type="button"
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
  );
}

