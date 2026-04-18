"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { handleUpgrade } from "@/lib/checkout";
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
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.3);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.3);
    });
  } catch (e) {}
}

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
  const verdictPlayedRef = useRef(false);
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
  const [upgrading, setUpgrading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("klayan_dark");
      setDarkMode(saved === "1");
    } catch (e) {}
  }, []);

  const D = darkMode;
  const theme = {
    bg: D ? "#111" : "#f2f1ef",
    card: D ? "#1c1c1e" : "#fff",
    cardBorder: D ? "#2a2a2a" : "#e8e6e1",
    text: D ? "#f5f5f5" : "#111",
    textMuted: D ? "#888" : "#666",
    divider: D ? "#2a2a2a" : "#e8e6e1",
    topBar: D ? "#1c1c1e" : "#fff",
    shadow: D ? "0 1px 4px rgba(0,0,0,0.4), 0 8px 32px rgba(0,0,0,0.3)" : "0 1px 4px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.06)",
  };

  const handleVerdictUpgrade = async () => {
    setUpgrading(true);
    try {
      const priceId =
        userPlan === "free" || !userPlan
          ? process.env.NEXT_PUBLIC_STRIPE_SPARK_PRICE_ID
          : userPlan === "spark"
          ? process.env.NEXT_PUBLIC_STRIPE_BUILD_PRICE_ID
          : process.env.NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID;
      if (priceId) {
        await handleUpgrade(priceId);
      } else {
        window.location.href = "/pricing";
      }
    } catch {
      window.location.href = "/pricing";
    }
    setUpgrading(false);
  };

  const upgradeLabel = () => {
    if (!userPlan || userPlan === "free") return lang === "fr" ? "Voir le pivot exact + plan 48h → Spark 19€" : "See exact pivot + 48h action plan → Spark $19";
    if (userPlan === "spark") return lang === "fr" ? "Accéder au workspace complet → Build 69€" : "Get full workspace access → Build $69";
    return lang === "fr" ? "Débloquer le co-fondateur IA → Scale 149€" : "Unlock AI Co-Founder → Scale $149";
  };

  const upgradeSubtext = () => {
    if (!userPlan || userPlan === "free") return lang === "fr" ? "19€/mois. Le prix passe à 29€ dans 13 jours." : "$19/mo. Price goes up to $29 in 13 days.";
    if (userPlan === "spark") return lang === "fr" ? "69€/mois · Annulez quand vous voulez." : "$69/mo · Cancel anytime.";
    return lang === "fr" ? "149€/mois · Sessions IA illimitées." : "$149/mo · Unlimited AI sessions.";
  };

  const analysisSelectColumns =
    "id,user_id,idea,target_customer,why_problem,existing_solutions,unfair_advantage,market_conversations,email,status,verdict,created_at";

  const showLoadingShell =
    !analysisError &&
    ((analysisLoading && !analysis) ||
      (analysis !== null && analysis.verdict === null));

  useEffect(() => {
    if (!analysis?.verdict) return;
    if (analysis.status !== "complete") return;
    if (verdictPlayedRef.current) return;
    verdictPlayedRef.current = true;
    playVerdictSound();
  }, [analysis?.verdict, analysis?.status]);

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
          verdictUp.includes("KILL IT") ||
          verdictUp.includes("CONSTRUISEZ") ||
          verdictUp.includes("CONSTRUIRE") ||
          verdictUp.includes("LANCEZ") ||
          verdictUp.includes("PIVOTEZ") ||
          verdictUp.includes("PIVOTER") ||
          verdictUp.includes("RETOURNEZ") ||
          verdictUp.includes("ABANDONNEZ") ||
          verdictUp.includes("TUEZ");

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
                  : verdictUp.includes("KILL IT") ||
                      verdictUp.includes("ABANDONNEZ") ||
                      verdictUp.includes("TUEZ")
                    ? "killed"
                    : "building",
            })
            .select("id")
            .single();
          if (newProject?.id) setProjectId(newProject.id);
        }
      }
    })();
  }, [analysis?.id, analysis?.verdict]);


  const sections = useMemo(() => {
    if (!analysis?.verdict) return null;
    return parseVerdictSections(analysis.verdict);
  }, [analysis?.verdict]);

  const orderedSections = useMemo(() => {
    if (!sections) return null;
    return reorderVerdictAfterHardTruths(sections);
  }, [sections]);

  const verdictSection = orderedSections?.find((s) => s.kind === "verdict") ?? null;
  const verdictType = useMemo(() => {
    if (!verdictSection || verdictSection.kind !== "verdict") return null;
    return verdictSection.verdictType;
  }, [verdictSection]);

  const verdictColor =
    verdictType === "BUILD IT" ? "#16a34a" :
    verdictType === "FLIP IT" ? "#d97706" :
    verdictType === "KILL IT" ? "#dc2626" : "#111";

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleCopy = () => {
    if (analysis?.verdict) {
      navigator.clipboard.writeText(analysis.verdict).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    setMenuOpen(false);
  };

  const europaBold = "'Europa Grotesk No 2 SH', 'Plus Jakarta Sans', sans-serif";
  const europaLight = "'Europa Grotesk No 2 SH', 'Plus Jakarta Sans', sans-serif";

  const formattedDate = analysis?.created_at
    ? new Date(analysis.created_at).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { year: "numeric", month: "long", day: "numeric" })
    : "";

  if (analysisError) {
    return (
      <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: europaBold }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, color: "#666", marginBottom: 16 }}>{analysisError}</div>
          <Link href="/dashboard" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>{t.dashboard}</Link>
        </div>
      </div>
    );
  }

  if (showLoadingShell) {
    return (
      <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 760, maxWidth: "calc(100vw - 48px)", background: theme.card, borderRadius: 16, boxShadow: theme.shadow, padding: "48px 56px" }}>
          {[180, 120, 240, 160, 200].map((w, i) => (
            <div key={i} style={{ height: i === 0 ? 28 : 14, width: w, background: "#e8e8e8", borderRadius: 4, marginBottom: i === 0 ? 32 : 12, animation: "pulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, padding: "48px 24px 80px", fontFamily: europaBold }}>

      {/* Paper card */}
      <div style={{ width: 760, maxWidth: "calc(100vw - 48px)", margin: "0 auto", background: theme.card, borderRadius: 16, boxShadow: theme.shadow, overflow: "hidden" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: "1px solid #e8e6e1" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, fontFamily: europaBold, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {lang === "fr" ? "Analyse produit" : "Product Analysis"}{" · "}{analysis?.created_at ? new Date(analysis.created_at).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { month: "long" }) : ""}{" 2026"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }} ref={menuRef}>
            {/* 3-dot menu */}
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 6, color: "#666", display: "flex", alignItems: "center" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
            </button>
            {menuOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "#fff", border: "1px solid #e8e6e1", borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 100, minWidth: 180, overflow: "hidden" }}>
                <button type="button" onClick={handleCopy} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#111", fontFamily: europaLight, textAlign: "left" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f5f4f0"}
                  onMouseLeave={e => e.currentTarget.style.background = "none"}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  {copied ? t.copied : t.copy}
                </button>
                <div style={{ height: 1, background: "#e8e6e1" }} />
                <Link href="/dashboard" onClick={() => setMenuOpen(false)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 16px", fontSize: 13, color: "#111", fontFamily: europaLight, textDecoration: "none" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f5f4f0"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                  {lang === "fr" ? "Tableau de bord" : "Dashboard"}
                </Link>
                {projectId && (
                  <>
                    <div style={{ height: 1, background: "#e8e6e1" }} />
                    <Link href={`/project/${projectId}`} onClick={() => setMenuOpen(false)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 16px", fontSize: 13, color: "#111", fontFamily: europaLight, textDecoration: "none" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f5f4f0"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
                      {lang === "fr" ? "Workspace" : "Workspace"}
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "48px 56px 56px" }}>

          {/* Big title */}
          <h1 style={{ fontSize: 36, fontWeight: 600, color: D ? "#ffffff" : "#111", letterSpacing: "-0.03em", fontFamily: europaBold, margin: "0 0 28px", lineHeight: 1.15 }}>
            {analysis?.idea ?? ""}
          </h1>

          {/* Metadata row + CTA */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 32 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#93c5fd", borderRadius: 6, padding: "5px 10px" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span style={{ fontSize: 12, color: "#111", fontFamily: europaLight }}>
                  {lang === "fr" ? "Créé le" : "Created"} <strong style={{ color: "#111", fontWeight: 600 }}>{formattedDate}</strong>
                </span>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#c4b5fd", borderRadius: 6, padding: "5px 10px" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6d28d9" strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <span style={{ fontSize: 12, color: "#111", fontFamily: europaLight }}>
                  {lang === "fr" ? "Source" : "Source"} <strong style={{ color: "#111", fontWeight: 600 }}>Live web data · Klayan AI</strong>
                </span>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#f9a8d4", borderRadius: 6, padding: "5px 10px" }}>
                <img src="/images/navbarlogo.png" alt="Klayan" style={{ width: 13, height: 13, borderRadius: "50%", objectFit: "cover" }} />
                <span style={{ fontSize: 12, color: "#111", fontFamily: europaLight }}>
                  {lang === "fr" ? "Analysé par" : "Analyzed by"} <strong style={{ color: "#111", fontWeight: 600 }}>Klayan · 2026</strong>
                </span>
              </div>
            </div>
            {projectId && (
              <Link href={`/project/${projectId}`} style={{ flexShrink: 0, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, width: 260, minHeight: 110, background: "#2563eb", borderRadius: 16, padding: "20px 20px 18px 24px", textDecoration: "none", boxSizing: "border-box" as any }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", fontFamily: europaBold, letterSpacing: "-0.02em", lineHeight: 1.25 }}>
                  {lang === "fr" ? "Suivre cette idée aujourd'hui." : "Start tracking this idea today."}
                </span>
                <div style={{ flexShrink: 0, width: 36, height: 36, background: "#fff", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </div>
              </Link>
            )}
          </div>

          {/* Separator */}
          <div style={{ height: 1, background: "#e8e6e1", marginBottom: 40 }} />

          {/* Sections */}
          {orderedSections?.map((section, idx) => {
            if (section.kind === "verdict") {
              return (
                <div key={idx} style={{ marginBottom: 40, padding: "28px 32px", background: verdictColor === "#16a34a" ? "#f0fdf4" : verdictColor === "#dc2626" ? "#fef2f2" : "#fffbeb", borderRadius: 6, border: `1px solid ${verdictColor === "#16a34a" ? "#bbf7d0" : verdictColor === "#dc2626" ? "#fecaca" : "#fde68a"}` }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: verdictColor, marginBottom: 10, fontFamily: europaBold }}>{section.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 600, color: verdictColor, letterSpacing: "-0.02em", fontFamily: europaBold, marginBottom: section.explanation ? 12 : 0 }}>{section.verdictLine}</div>
                  {section.explanation && <div style={{ fontSize: 15, color: D ? "rgba(255,255,255,0.85)" : "#444", lineHeight: 1.7, fontFamily: europaLight, fontWeight: 300 }}>{section.explanation}</div>}
                </div>
              );
            }

            if (section.kind === "numbered") {
              return (
                <div key={idx} style={{ marginBottom: 36 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 600, color: D ? "#ffffff" : "#111", letterSpacing: "-0.02em", fontFamily: europaBold, margin: "0 0 16px" }}>{section.label}</h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {section.items.map((item) => (
                      <div key={item.index} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#999", minWidth: 20, paddingTop: 2, fontFamily: europaBold }}>{String(item.index).padStart(2, "0")}</span>
                        <span style={{ fontSize: 15, color: D ? "rgba(255,255,255,0.8)" : "#444", lineHeight: 1.7, fontFamily: europaLight, fontWeight: 300 }}>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            if (section.kind === "question") {
              return (
                <div key={idx} style={{ marginBottom: 36, padding: "24px 28px", background: "#fafaf8", borderRadius: 6, borderLeft: "3px solid #111" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: D ? "#ffffff" : "#999", marginBottom: 10, fontFamily: europaBold }}>{section.label}</div>
                  <div style={{ fontSize: 17, color: D ? "#ffffff" : "#111", lineHeight: 1.65, fontFamily: europaBold, fontWeight: 500, fontStyle: "italic" }}>{section.text}</div>
                </div>
              );
            }

            return (
              <div key={idx} style={{ marginBottom: 36 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: D ? "#ffffff" : "#111", letterSpacing: "-0.02em", fontFamily: europaBold, margin: "0 0 12px" }}>{section.label}</h2>
                <div style={{ fontSize: 15, color: D ? "rgba(255,255,255,0.8)" : "#444", lineHeight: 1.75, fontFamily: europaLight, fontWeight: 300, whiteSpace: "pre-wrap" }}>{section.text}</div>
              </div>
            );
          })}



          {/* Paywall — free users only */}
          {userPlan !== "scale" && <div style={{ height: 1, background: theme.divider, margin: "48px 0 32px" }} />}
          {userPlan !== "scale" && <div style={{ background: "#0f0f0f", borderRadius: 16, padding: "40px 40px 36px", position: "relative", overflow: "hidden" }}>
            {/* subtle grid texture */}
            <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 80% 20%, rgba(37,99,235,0.15) 0%, transparent 60%)", pointerEvents: "none" }} />

            <div style={{ position: "relative", zIndex: 1 }}>
              {/* Lock + headline */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 32, height: 32, background: "rgba(255,255,255,0.08)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", fontFamily: europaBold }}>
                  {lang === "fr" ? "TARIF DE LANCEMENT" : "LAUNCH PRICING"}
                </div>
              </div>

              <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", fontFamily: europaBold, letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: 12, maxWidth: 480 }}>
                {(!userPlan || userPlan === "free") && (lang === "fr" ? "Pour 19€ — le pivot exact, plan 48h, 20 contacts qualifiés, et un workspace jusqu'à 10K MRR." : "For $19 — the exact pivot, 48h action plan, 20 qualified contacts, and a workspace that follows you to $10K MRR.")}
                {userPlan === "spark" && (lang === "fr" ? "Passez à Build — workspace complet, Market Watch, Competitor Tracker, et plus." : "Upgrade to Build — full workspace, Market Watch, Competitor Tracker, and more.")}
                {userPlan === "build" && (lang === "fr" ? "Passez à Scale — Co-Fondateur IA illimité avec recherche web en direct." : "Upgrade to Scale — unlimited AI Co-Founder with live web search.")}
              </div>

              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", fontFamily: europaLight, marginBottom: 28, lineHeight: 1.6 }}>
                {lang === "fr"
                  ? "La plupart des fondateurs abandonnent ici. Les autres trouvent le pivot."
                  : "Most founders quit here. The others find the pivot."}
              </div>

              {/* Feature bullets */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
                {[
                  lang === "fr" ? "20 personnes exactes à contacter + messages de prospection" : "20 exact people to contact + outreach messages",
                  lang === "fr" ? "3 modèles business alternatifs entièrement validés" : "3 alternative business models fully validated",
                  lang === "fr" ? "Plan jour par jour de l'idée à 10K MRR" : "Day by day plan from idea to $10K MRR",
                  lang === "fr" ? "Sessions stratégiques IA illimitées avec recherche web en direct" : "Unlimited strategic AI sessions with live web search",
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: "rgba(37,99,235,0.4)", border: "1px solid rgba(37,99,235,0.6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", fontFamily: europaLight }}>{item}</span>
                  </div>
                ))}
              </div>

              {/* CTA row */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <button type="button" onClick={() => void handleVerdictUpgrade()} disabled={upgrading} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", background: "#2563eb", borderRadius: 100, fontSize: 14, fontWeight: 700, color: "#fff", border: "none", cursor: upgrading ? "not-allowed" : "pointer", fontFamily: europaBold, letterSpacing: "-0.01em", opacity: upgrading ? 0.7 : 1 }}>
                  {upgrading ? (lang === "fr" ? "Redirection..." : "Redirecting...") : upgradeLabel()}
                </button>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontFamily: europaLight }}>
                  {upgradeSubtext()}
                </div>
              </div>

              <div style={{ marginTop: 16, fontSize: 12, color: "rgba(255,255,255,0.25)", fontFamily: europaLight, fontStyle: "italic" }}>
                {lang === "fr" ? "Moins cher qu'un café par semaine. Plus utile qu'un an de ChatGPT." : "Cheaper than a coffee a week. More useful than a year of ChatGPT."}
              </div>
            </div>
          </div>}
        </div>
      </div>
    </div>
  );
}
