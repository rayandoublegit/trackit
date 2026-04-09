"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useRequireActiveSubscription } from "@/lib/use-require-active-subscription";
import { useLang } from "@/lib/useLang";

type VerdictType = "FLIP IT" | "BUILD IT" | "KILL IT";

function getVerdictType(verdict: string | null): VerdictType | null {
  if (!verdict) return null;
  const v = verdict.toUpperCase().trim();
  const innerMatch = v.match(/——\s*(.*?)\s*——/);
  const inner = (innerMatch?.[1] ?? v).replace(/\s+/g, " ").trim();

  if (inner === "FLIP IT") return "FLIP IT";
  if (inner === "BUILD IT") return "BUILD IT";
  if (inner === "KILL IT") return "KILL IT";

  if (inner.includes("/")) {
    const first = inner.split("/")[0].trim();
    if (first === "FLIP IT") return "FLIP IT";
    if (first === "BUILD IT") return "BUILD IT";
    if (first === "KILL IT") return "KILL IT";
  }

  const mentionsFlip = inner.includes("FLIP IT") || inner.includes("PIVOTEZ") || inner.includes("PIVOTER") || inner.includes("RETOURNEZ");
  const mentionsBuild = inner.includes("BUILD IT") || inner.includes("CONSTRUISEZ") || inner.includes("CONSTRUIRE") || inner.includes("LANCEZ");
  const mentionsKill = inner.includes("KILL IT") || inner.includes("ABANDONNEZ") || inner.includes("TUEZ") || inner.includes("ARRETEZ");

  if (mentionsFlip && !mentionsBuild && !mentionsKill) return "FLIP IT";
  if (mentionsBuild && !mentionsFlip && !mentionsKill) return "BUILD IT";
  if (mentionsKill && !mentionsFlip && !mentionsBuild) return "KILL IT";

  // Full text search fallback
  const fullText = verdict.toUpperCase();
  if (fullText.includes("FLIP IT") || fullText.includes("PIVOTEZ") || fullText.includes("PIVOTER")) return "FLIP IT";
  if (fullText.includes("BUILD IT") || fullText.includes("CONSTRUISEZ") || fullText.includes("CONSTRUIRE")) return "BUILD IT";
  if (fullText.includes("KILL IT") || fullText.includes("ABANDONNEZ") || fullText.includes("TUEZ")) return "KILL IT";

  return null;
}

type ParsedSection =
  | { label: string; kind: "text"; text: string }
  | { label: string; kind: "question"; text: string }
  | {
      label: string;
      kind: "numbered";
      items: Array<{ index: number; text: string }>;
    }
  | {
      label: string;
      kind: "verdict";
      verdictLine: string;
      explanation: string;
      verdictType: VerdictType | null;
    };

function parseNumberedLines(content: string) {
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const items: Array<{ index: number; text: string }> = [];
  for (const line of lines) {
    const m =
      line.match(/^›\s*(\d+)\s*—\s*(.*)$/) ??
      line.match(/^(\d+)\s*—\s*(.*)$/);
    if (!m) continue;
    const index = Number(m[1]);
    const text = m[2].trim();
    if (!Number.isFinite(index) || !text) continue;
    items.push({ index, text });
  }
  return items;
}

function parseVerdictSections(verdictText: string): ParsedSection[] {
  const normalized = verdictText
    .replace(/\r\n/g, "\n")
    .replace(/(\d{2} —)\s*\n\s*/g, "$1 ")
    .replace(/› (\d{2})/g, "$1")
    .trim();

  const dividerLineRe = /^\s*━{10,}\s*$/m;
  const segments = normalized
    .split(dividerLineRe)
    .map((s) => s.trim())
    .filter(Boolean);

  const sections: ParsedSection[] = [];

  for (const segment of segments) {
    const lines = segment.split("\n").map((l) => l.trimEnd());
    const labelRaw = (lines[0] ?? "").trim();
    if (!labelRaw) continue;

    const label = labelRaw.toUpperCase().replace(/:$/, "").trim();
    const content = lines.slice(1).join("\n").trim();

    if (label.startsWith("KLAYAN ANALYSIS")) continue;

    if (label === "HARD TRUTHS" || label === "NEXT 48 HOURS") {
      sections.push({
        label,
        kind: "numbered",
        items: parseNumberedLines(content),
      });
      continue;
    }

    if (label === "THE QUESTION THAT MATTERS") {
      sections.push({ label, kind: "question", text: content });
      continue;
    }

    if (label === "VERDICT") {
      let verdictContent = content;
      if (!verdictContent && labelRaw.toUpperCase().startsWith("VERDICT:")) {
        verdictContent = labelRaw.slice("VERDICT:".length).trim();
      }
      const contentLines = verdictContent
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const verdictLine = contentLines[0] ?? "";
      const explanation = contentLines.slice(1).join("\n").trim();
      sections.push({
        label,
        kind: "verdict",
        verdictLine,
        explanation,
        verdictType: getVerdictType(verdictLine),
      });
      continue;
    }

    sections.push({ label, kind: "text", text: content });
  }

  // If no VERDICT section found, try to detect it from content
  const hasVerdict = sections.some((s) => s.kind === "verdict");
  if (!hasVerdict) {
    const fullText = normalized.toUpperCase();
    let verdictKind: "build" | "kill" | "flip" | null = null;
    if (fullText.includes("BUILD IT")) verdictKind = "build";
    else if (fullText.includes("KILL IT")) verdictKind = "kill";
    else if (fullText.includes("FLIP IT")) verdictKind = "flip";

    if (verdictKind) {
      const verdictLine =
        verdictKind === "build"
          ? "—— BUILD IT ——"
          : verdictKind === "kill"
            ? "—— KILL IT ——"
            : "—— FLIP IT ——";
      sections.unshift({
        label: "VERDICT",
        kind: "verdict",
        verdictLine,
        explanation: "",
        verdictType: getVerdictType(verdictLine),
      });
    }
  }

  return sections;
}

function isRecommendedStackLabel(label: string): boolean {
  const u = label.toUpperCase();
  return (
    u === "RECOMMENDED STACK" ||
    u === "STACK RECOMMANDÉE" ||
    u === "STACK RECOMMANDEE"
  );
}

function isMarketSignalLabel(label: string): boolean {
  const u = label.toUpperCase();
  return (
    u === "MARKET SIGNAL" ||
    u === "SIGNAL DE MARCHÉ" ||
    u === "SIGNAL DE MARCHE" ||
    u === "OPPORTUNITY" ||
    u === "OPPORTUNITÉ" ||
    u === "OPPORTUNITE"
  );
}

function isHardTruthsLabel(label: string): boolean {
  const u = label.toUpperCase();
  return (
    u === "HARD TRUTHS" ||
    u === "VÉRITÉS BRUTALES" ||
    u === "VERITES BRUTALES"
  );
}

function reorderVerdictAfterHardTruths(
  sections: ParsedSection[]
): ParsedSection[] {
  const verdictIdx = sections.findIndex((s) => s.kind === "verdict");
  if (verdictIdx === -1) return sections;

  const hardTruthsIdx = sections.findIndex((s) => isHardTruthsLabel(s.label));
  if (hardTruthsIdx === -1) return sections;

  if (verdictIdx > hardTruthsIdx) return sections;

  const verdictSec = sections[verdictIdx];
  const withoutVerdict = sections.filter((_, i) => i !== verdictIdx);
  const htIdx = withoutVerdict.findIndex((s) => isHardTruthsLabel(s.label));
  if (htIdx === -1) return sections;

  return [
    ...withoutVerdict.slice(0, htIdx + 1),
    verdictSec,
    ...withoutVerdict.slice(htIdx + 1),
  ];
}

const LOGO_BLOCK = (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      marginBottom: "32px",
    }}
  >
    <img
      src="/images/navbarlogo.png"
      alt="Klayan"
      style={{
        width: "56px",
        height: "56px",
        borderRadius: "50%",
      }}
    />
  </div>
);

function playVerdictArrivalSound() {
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

const HOME_PILL = (
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
);

export default function VerdictPage() {
  useRequireActiveSubscription();
  const lang = useLang();
  const t = {
    en: {
      new_analysis: "+ New Analysis",
      dashboard: "← Dashboard",
      copy: "Copy verdict",
      copied: "Copied ✓",
      start_tracking: "🚀 Start tracking this idea →",
      view_verdict: "View last analysis",
      locked_signal: "20 exact people to contact + outreach messages",
      locked_flip: "3 alternative business models fully validated",
      locked_structure: "Legal structure, equity split, contractor vs employee",
      locked_roadmap: "Day by day plan from idea to $10K MRR",
      locked_marketing: "Landing page copy, outreach sequences, 30-day launch plan",
      locked_cofounder: "Unlimited strategic AI sessions with live web search",
    },
    fr: {
      new_analysis: "+ Nouvelle analyse",
      dashboard: "← Dashboard",
      copy: "Copier le verdict",
      copied: "Copié ✓",
      start_tracking: "🚀 Suivre cette idée →",
      view_verdict: "Voir la dernière analyse",
      locked_signal: "20 personnes exactes à contacter + messages de prospection",
      locked_flip: "3 modèles business alternatifs entièrement validés",
      locked_structure: "Structure légale, répartition des parts, freelance vs employé",
      locked_roadmap: "Plan jour par jour de l'idée à 10K MRR",
      locked_marketing: "Texte landing page, séquences de prospection, plan de lancement 30 jours",
      locked_cofounder: "Sessions stratégiques IA illimitées avec recherche web en direct",
    },
  }[lang];
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<{
    id: string;
    user_id: string;
    idea: string;
    target_customer: string;
    why_problem: string;
    existing_solutions: string;
    unfair_advantage: string;
    market_conversations: string;
    email: string;
    status: string;
    verdict: string | null;
    created_at: string;
  } | null>(null);

  const [copied, setCopied] = useState(false);
  const [userPlan, setUserPlan] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  const analysisSelectColumns =
    "id,user_id,idea,target_customer,why_problem,existing_solutions,unfair_advantage,market_conversations,email,status,verdict,created_at";

  const showLoadingShell =
    !analysisError &&
    ((analysisLoading && !analysis) ||
      (analysis !== null && analysis.verdict === null));

  useEffect(() => {
    if (analysis?.verdict) {
      playVerdictArrivalSound();
    }
  }, [analysis?.verdict]);

  useEffect(() => {
    if (!id) return;
    if (!isSupabaseConfigured || !supabase) {
      routerRef.current.push("/auth");
      return;
    }

    const client = supabase;
    let intervalId: number | undefined;
    let cancelled = false;

    setAnalysisLoading(true);
    setAnalysisError(null);

    const init = async () => {
      try {
        const { data, error } = await client
          .from("analyses")
          .select(analysisSelectColumns)
          .eq("id", id)
          .single();

        if (cancelled) return;

        if (error || !data) {
          setAnalysisError("Could not load your analysis.");
          setAnalysisLoading(false);
          return;
        }

        if (data.verdict) {
          setAnalysis(data);
          setAnalysisLoading(false);
          return;
        }

        setAnalysis(data);
        setAnalysisLoading(false);

        if (cancelled) return;

        if (data.status === "pending") {
          const {
            data: { user: userForAnalyze },
          } = await client.auth.getUser();

          const analyzeRes = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              analysisId: id,
              userId: userForAnalyze?.id,
            }),
          }).catch(() => null);

          if (analyzeRes?.status === 403) {
            cancelled = true;
            window.location.href = "/pricing";
            return;
          }
        }

        let attempts = 0;
        const tick = async () => {
          if (cancelled) return;
          attempts += 1;
          if (attempts > 40) {
            if (intervalId) {
              window.clearInterval(intervalId);
              intervalId = undefined;
            }
            if (!cancelled) {
              setAnalysisError("Analysis took too long. Please try again.");
            }
            return;
          }

          try {
            const { data: polled, error: pollError } = await client
              .from("analyses")
              .select("verdict, status, idea, user_id")
              .eq("id", id)
              .single();

            if (cancelled) return;
            if (pollError) return;

            if (polled?.verdict) {
              setAnalysis((prev) => {
                if (prev) {
                  return {
                    ...prev,
                    verdict: polled.verdict,
                    ...(polled.status != null ? { status: polled.status } : {}),
                    ...(polled.idea != null ? { idea: polled.idea } : {}),
                    ...(polled.user_id != null ? { user_id: polled.user_id } : {}),
                  };
                }
                return {
                  id,
                  user_id: polled.user_id ?? "",
                  idea: polled.idea ?? "",
                  target_customer: "",
                  why_problem: "",
                  existing_solutions: "",
                  unfair_advantage: "",
                  market_conversations: "",
                  email: "",
                  status: polled.status ?? "",
                  verdict: polled.verdict,
                  created_at: new Date().toISOString(),
                };
              });
              setAnalysisLoading(false);
              if (intervalId) {
                window.clearInterval(intervalId);
                intervalId = undefined;
              }
            }
          } catch (e) {
            console.error("Verdict: poll error", e);
          }
        };

        if (cancelled) return;

        void tick();
        intervalId = window.setInterval(() => {
          void tick();
        }, 3000);
      } catch (e) {
        console.error("Verdict: load analysis error", e);
        if (!cancelled) {
          setAnalysisError("Could not load your analysis.");
          setAnalysisLoading(false);
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [id]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    void (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from("profiles")
          .select("plan")
          .eq("id", user.id)
          .maybeSingle();
        if (error) {
          setUserPlan("spark");
          return;
        }
        const p = (data?.plan as string | undefined)?.toLowerCase() ?? "spark";
        setUserPlan(p === "build" || p === "scale" ? p : p === "free" ? "free" : "spark");
      } catch (e) {
        console.error("Verdict: profile plan fetch error", e);
        setUserPlan("spark");
      }
    })();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !analysis?.id) {
      setProjectId(null);
      return;
    }
    setProjectId(null);
    void (async () => {
      const { data } = await supabase
        .from("projects")
        .select("id")
        .eq("analysis_id", analysis.id)
        .maybeSingle();
      if (data?.id) {
        setProjectId(data.id);
      } else if (analysis) {
        const verdictUp = (analysis.verdict ?? "").toUpperCase();
        const shouldCreate =
          verdictUp.includes("BUILD IT") ||
          verdictUp.includes("FLIP IT") ||
          verdictUp.includes("CONSTRUISEZ") ||
          verdictUp.includes("CONSTRUIRE") ||
          verdictUp.includes("LANCEZ") ||
          verdictUp.includes("PIVOTEZ") ||
          verdictUp.includes("PIVOTER") ||
          verdictUp.includes("RETOURNEZ");

        if (shouldCreate) {
          const { data: newProject } = await supabase
            .from("projects")
            .insert({
              user_id: analysis.user_id,
              analysis_id: analysis.id,
              idea_name: (analysis.idea ?? "").slice(0, 100),
              status:
                verdictUp.includes("FLIP IT") ||
                verdictUp.includes("PIVOTEZ") ||
                verdictUp.includes("PIVOTER")
                  ? "pivoting"
                  : "building",
            })
            .select("id")
            .single();
          if (newProject?.id) setProjectId(newProject.id);
        }
      }
    })();
  }, [analysis?.id, analysis?.verdict]);

  const parsedSections = useMemo(() => {
    if (!analysis?.verdict) return null;
    return parseVerdictSections(analysis.verdict);
  }, [analysis]);

  const displaySections = useMemo(() => {
    if (!parsedSections) return null;
    return reorderVerdictAfterHardTruths(parsedSections);
  }, [parsedSections]);

  const verdictType = useMemo(() => {
    const verdictSection = parsedSections?.find((s) => s.kind === "verdict");
    if (!verdictSection || verdictSection.kind !== "verdict") return null;
    return verdictSection.verdictType;
  }, [parsedSections]);

  const verdictColor = useMemo(() => {
    if (!verdictType) return "#ffffff";
    if (verdictType === "FLIP IT") return "#f5c842";
    if (verdictType === "BUILD IT") return "#4ade80";
    return "#ef4444";
  }, [verdictType]);

  const dividerLine = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

  const handleUpgrade = async () => {
    console.log("[checkout] step 1: handleUpgrade invoked");
    const priceId = process.env.NEXT_PUBLIC_STRIPE_BUILD_PRICE_ID;
    console.log(
      "[checkout] step 2: NEXT_PUBLIC_STRIPE_BUILD_PRICE_ID =",
      priceId ?? "(undefined — set in .env.local and restart dev server)"
    );

    if (!priceId) {
      console.error(
        "[checkout] abort: NEXT_PUBLIC_STRIPE_BUILD_PRICE_ID is missing; API will reject checkout."
      );
      return;
    }

    if (!supabase) {
      console.error("[checkout] abort: supabase client is null");
      return;
    }

    try {
      console.log("[checkout] step 3: calling supabase.auth.getUser()");
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      console.log("[checkout] step 4: getUser result", {
        userId: user?.id,
        email: user?.email,
        userError: userError?.message,
      });

      const body = {
        priceId,
        userId: user?.id,
        email: user?.email,
        cancelUrl: window.location.href,
      };
      console.log("[checkout] step 5: POST /api/create-checkout body", body);

      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      console.log(
        "[checkout] step 6: fetch response",
        res.status,
        res.statusText
      );

      const data = (await res.json()) as { url?: string; error?: string };
      console.log("[checkout] step 7: Checkout response:", data);

      if (data.url) {
        console.log("[checkout] step 8: redirecting to Stripe Checkout URL");
        window.location.href = data.url;
      } else {
        console.error("[checkout] step 8: No URL returned:", data);
      }
    } catch (e) {
      console.error("[checkout] Checkout error:", e);
    }
  };

  const handleShare = async () => {
    const verdictText = analysis?.verdict ?? "";
    try {
      await navigator.clipboard.writeText(verdictText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = verdictText;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!params?.id) {
    return null;
  }

  if (analysisError) {
    const isTimeout =
      analysisError === "Analysis took too long. Please try again.";
    return (
      <div
        style={{
          background: "#000",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "24px",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <img
          src="/images/navbarlogo.png"
          alt=""
          style={{ width: "56px", borderRadius: "50%" }}
        />
        <div
          style={{
            color: "white",
            fontSize: "18px",
            fontWeight: 600,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Something went wrong
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: "14px",
            fontFamily: "'Inter', sans-serif",
            textAlign: "center",
            maxWidth: 320,
            lineHeight: 1.5,
          }}
        >
          {isTimeout
            ? "The analysis took too long to complete."
            : analysisError}
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            background: "white",
            color: "black",
            border: "none",
            padding: "12px 28px",
            borderRadius: "100px",
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Try again
        </button>
        <Link
          href="/analyze"
          style={{
            color: "rgba(255,255,255,0.4)",
            fontSize: "13px",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {t.new_analysis}
        </Link>
      </div>
    );
  }

  if (showLoadingShell) {
    return (
      <div
        style={{
          background: "#000000",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "32px",
          padding: "0 24px",
          boxSizing: "border-box",
        }}
      >
        <img
          src="/images/cardgif.gif"
          alt=""
          style={{ width: "80px", height: "80px", objectFit: "contain" }}
        />
        <div
          style={{
            fontSize: 15,
            color: "rgba(255,255,255,0.85)",
            fontFamily: "'Inter', sans-serif",
            textAlign: "center",
            maxWidth: 360,
            lineHeight: 1.5,
            minHeight: 48,
          }}
        >
          Writing your verdict…
        </div>
        <div
          style={{
            width: "200px",
            height: "2px",
            background: "rgba(255,255,255,0.08)",
            borderRadius: "2px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              background: "#ffffff",
              borderRadius: "2px",
              animation: "loading 2s ease-in-out infinite",
            }}
          />
        </div>
        <style>{`
          @keyframes loading {
            0% { width: 0%; margin-left: 0%; }
            50% { width: 60%; margin-left: 20%; }
            100% { width: 0%; margin-left: 100%; }
          }
        `}</style>
      </div>
    );
  }

  const requiredPlan =
    userPlan === "free" ? "Spark" : userPlan === "spark" ? "Build" : "Scale";

  const actionButtons = (
    <div
      style={{
        display: "flex",
        gap: 12,
        marginTop: 20,
        flexWrap: "wrap",
        justifyContent: "center",
      }}
    >
      <button
        type="button"
        onClick={() => router.push("/analyze")}
        style={{
          background: "#fff",
          color: "#000",
          border: "none",
          borderRadius: 100,
          padding: "12px 24px",
          fontFamily: "'Inter', sans-serif",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {t.new_analysis}
      </button>
      <button
        type="button"
        onClick={() => router.push("/dashboard")}
        style={{
          background: "#fff",
          color: "#000",
          border: "none",
          borderRadius: 100,
          padding: "12px 24px",
          fontFamily: "'Inter', sans-serif",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {t.dashboard}
      </button>
      <button
        type="button"
        onClick={() => void handleShare()}
        style={{
          background: "#fff",
          color: "#000",
          border: "none",
          borderRadius: 100,
          padding: "12px 24px",
          fontFamily: "'Inter', sans-serif",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {copied ? t.copied : t.copy}
      </button>
    </div>
  );

  const cardShell = (children: ReactNode) => (
    <div
      style={{
        width: "100%",
        background: "#111",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12,
        padding: 32,
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontFamily: "'Inter', monospace" }}>{children}</div>
    </div>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#3a3a3a",
        padding: 32,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        boxSizing: "border-box",
      }}
    >
      {HOME_PILL}
      <div style={{ width: "100%", maxWidth: 700 }}>
        {LOGO_BLOCK}

        {cardShell(
          <>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 3,
                color: "rgba(255,255,255,0.3)",
                marginBottom: 12,
              }}
            >
              KLAYAN ANALYSIS — YOUR IDEA
            </div>

            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.06)",
                margin: "10px 0",
                letterSpacing: -1,
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              {dividerLine}
            </div>

            {displaySections ? (
              <>
                {displaySections.map((sec, idx) => (
                  <div key={`${sec.label}-${idx}`}>
                    {idx > 0 ? (
                      <div
                        style={{
                          fontSize: 10,
                          color: "rgba(255,255,255,0.06)",
                          margin: "10px 0",
                          letterSpacing: -1,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                        }}
                      >
                        {dividerLine}
                      </div>
                    ) : null}

                    <span
                      style={{
                        display: "block",
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: 3,
                        textTransform: "uppercase",
                        color: "#fff",
                        marginBottom: 8,
                        marginTop: 4,
                      }}
                    >
                      {sec.label}
                    </span>

                    {sec.kind === "text" ? (
                      isRecommendedStackLabel(sec.label) &&
                      !["spark", "build", "scale"].includes(userPlan ?? "") ? null : (
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 400,
                            color: "rgba(255,255,255,0.5)",
                            lineHeight: 1.7,
                            marginBottom: 4,
                          }}
                        >
                          {sec.text}
                        </div>
                      )
                    ) : sec.kind === "numbered" ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 3,
                          marginBottom: 4,
                        }}
                      >
                        {sec.items.slice(0, 3).map((item) => (
                          <div
                            key={item.index}
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "flex-start",
                            }}
                          >
                            <span
                              style={{
                                color: "#fff",
                                fontWeight: 700,
                                flexShrink: 0,
                                fontSize: 12,
                              }}
                            >
                              › {String(item.index).padStart(2, "0")} —
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 400,
                                color: "rgba(255,255,255,0.5)",
                                lineHeight: 1.7,
                              }}
                            >
                              {item.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : sec.kind === "verdict" ? (
                      <>
                        <div
                          style={{
                            fontSize: 24,
                            fontWeight: 900,
                            letterSpacing: 4,
                            color: verdictColor,
                            margin: "6px 0",
                          }}
                        >
                          {sec.verdictLine}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "rgba(255,255,255,0.35)",
                            textAlign: "left",
                            marginTop: 6,
                            marginBottom: 28,
                            letterSpacing: "0.02em",
                            fontWeight: 500,
                          }}
                        >
                          {lang === "fr"
                            ? "847 idées analysées sur Klayan — 61% ont reçu un KILL IT. Les BUILD IT sont rares."
                            : "847 ideas analyzed on Klayan — 61% received a KILL IT. BUILD IT verdicts are rare."}
                        </div>
                        {projectId ? (
                          <a
                            href={`/project/${projectId}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              marginTop: 20,
                              background: "#ffffff",
                              color: "#000000",
                              padding: "14px 28px",
                              borderRadius: 100,
                              fontFamily: "'Inter', sans-serif",
                              fontSize: 15,
                              fontWeight: 700,
                              textDecoration: "none",
                              letterSpacing: "-0.02em",
                            }}
                          >
                            {t.start_tracking}
                          </a>
                        ) : null}
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 400,
                            color: "rgba(255,255,255,0.5)",
                            lineHeight: 1.7,
                            marginBottom: 4,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {sec.explanation}
                        </div>
                      </>
                    ) : (
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#fff",
                          borderLeft: "2px solid #fff",
                          paddingLeft: 12,
                          lineHeight: 1.6,
                          marginBottom: 20,
                        }}
                      >
                        {sec.text}
                      </div>
                    )}
                    {(userPlan === "spark" || userPlan === "free") &&
                    displaySections &&
                    isMarketSignalLabel(sec.label) ? (
                      <div
                        style={{
                          background:
                            "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 14,
                          padding: "18px 24px",
                          marginBottom: 16,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 16,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: "#fff",
                              marginBottom: 4,
                            }}
                          >
                            {lang === "fr"
                              ? "Le pivot exact que personne dans ce marché ne fait encore →"
                              : "The exact pivot nobody in this market is doing yet →"}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "rgba(255,255,255,0.4)",
                            }}
                          >
                            {lang === "fr"
                              ? "Réservé aux membres Spark"
                              : "Reserved for Spark members"}
                          </div>
                        </div>
                        <div style={{ fontSize: 24, flexShrink: 0 }}>🔒</div>
                      </div>
                    ) : null}
                  </div>
                ))}

                {(userPlan === "spark" || userPlan === "free") && displaySections ? (
                  <div style={{ margin: "32px auto 0", maxWidth: 500 }}>
                    <div
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 16,
                        padding: "24px 28px",
                        marginBottom: 12,
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 14,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 20,
                            flexShrink: 0,
                            marginTop: 2,
                          }}
                        >
                          🔒
                        </div>
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 700,
                            color: "rgba(255,255,255,0.5)",
                            letterSpacing: "-0.01em",
                            lineHeight: 1.4,
                          }}
                        >
                          {lang === "fr" ? (
                            "Un seul pivot bien exécuté change tout."
                          ) : (
                            <>
                              Available on the <strong>{requiredPlan}</strong> plan and above.
                            </>
                          )}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "rgba(255,255,255,0.3)",
                          lineHeight: 1.6,
                          paddingLeft: 34,
                        }}
                      >
                        {t.locked_signal}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "rgba(255,255,255,0.45)",
                          lineHeight: 1.6,
                          paddingLeft: 34,
                        }}
                      >
                        {lang === "fr"
                          ? "La plupart des fondateurs abandonnent ici. Les autres trouvent le pivot."
                          : "Most founders quit here. The others find the pivot."}
                      </div>
                      {(() => {
                        const deadline = new Date("2026-05-01T00:00:00");
                        const now = new Date();
                        const diff = deadline.getTime() - now.getTime();
                        const days = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
                        return (
                          <div
                            style={{
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.08)",
                              borderRadius: 10,
                              padding: "12px 16px",
                              marginBottom: 16,
                              textAlign: "center",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: "#facc15",
                                letterSpacing: "0.05em",
                                textTransform: "uppercase",
                                marginBottom: 4,
                              }}
                            >
                              {lang === "fr" ? "Prix de lancement" : "Launch pricing"}
                            </div>
                            <div
                              style={{
                                fontSize: 13,
                                color: "rgba(255,255,255,0.6)",
                                lineHeight: 1.5,
                              }}
                            >
                              {lang === "fr"
                                ? `19€/mois. Prix monte à 29€ dans ${days} jour${days > 1 ? "s" : ""}.`
                                : `$19/mo. Price goes up to $29 in ${days} day${days > 1 ? "s" : ""}.`}
                            </div>
                          </div>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => void handleUpgrade()}
                        style={{
                          alignSelf: "flex-start",
                          marginLeft: 34,
                          background: "#ffffff",
                          color: "#000000",
                          border: "none",
                          borderRadius: 100,
                          padding: "10px 22px",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                          letterSpacing: "-0.01em",
                          textDecoration: "none",
                          display: "inline-block",
                        }}
                      >
                        {lang === "fr"
                          ? "Voir le pivot exact + plan d'action 48h → Spark 19€"
                          : "See exact pivot + 48h action plan → Spark $19"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {analysisError ? (
              <div style={{ marginTop: 16, fontSize: 12, color: "#ff4d4f" }}>
                {analysisError}
              </div>
            ) : null}
          </>
        )}

        <div
          style={{
            textAlign: "center",
            marginTop: 32,
            paddingTop: 24,
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <Link
            href="/analyze"
            style={{
              color: "rgba(255,255,255,0.4)",
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              letterSpacing: "-0.01em",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "rgba(255,255,255,0.4)";
            }}
          >
            {lang === "fr"
              ? "Tu as une autre idée ? Lance une 2ème analyse →"
              : "Got another idea? Run a second analysis →"}
          </Link>
        </div>

        {actionButtons}
      </div>
    </div>
  );
}
