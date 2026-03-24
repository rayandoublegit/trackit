"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useRequireActiveSubscription } from "@/lib/use-require-active-subscription";

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

  const mentionsFlip = inner.includes("FLIP IT");
  const mentionsBuild = inner.includes("BUILD IT");
  const mentionsKill = inner.includes("KILL IT");

  if (mentionsFlip && !mentionsBuild && !mentionsKill) return "FLIP IT";
  if (mentionsBuild && !mentionsFlip && !mentionsKill) return "BUILD IT";
  if (mentionsKill && !mentionsFlip && !mentionsBuild) return "KILL IT";

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
    const m = line.match(/^›\s*(\d+)\s*—\s*(.*)$/);
    if (!m) continue;
    const index = Number(m[1]);
    const text = m[2].trim();
    if (!Number.isFinite(index) || !text) continue;
    items.push({ index, text });
  }
  return items;
}

function parseVerdictSections(verdictText: string): ParsedSection[] {
  const normalized = verdictText.replace(/\r\n/g, "\n").trim();
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

    const label = labelRaw.toUpperCase();
    const content = lines.slice(1).join("\n").trim();

    if (!content) {
      sections.push({ label, kind: "text", text: "" });
      continue;
    }

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
      const contentLines = content
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

  return sections;
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
      src="https://i.ibb.co/msYn5RH/navbarlogo.png"
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
);

export default function VerdictPage() {
  useRequireActiveSubscription();
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<{
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

  const analysisSelectColumns =
    "idea,target_customer,why_problem,existing_solutions,unfair_advantage,market_conversations,email,status,verdict,created_at";

  const showLoadingShell =
    !analysisError &&
    ((analysisLoading && !analysis) ||
      (analysis !== null && analysis.verdict === null));

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
          fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              analysisId: id,
              userId: userForAnalyze?.id,
            }),
          }).catch(console.error);
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
              .select("verdict, status, idea")
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
                  };
                }
                return {
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
        setUserPlan(p === "build" || p === "scale" ? p : "spark");
      } catch (e) {
        console.error("Verdict: profile plan fetch error", e);
        setUserPlan("spark");
      }
    })();
  }, []);

  const parsedSections = useMemo(() => {
    if (!analysis?.verdict) return null;
    return parseVerdictSections(analysis.verdict);
  }, [analysis]);

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
          src="https://i.ibb.co/msYn5RH/navbarlogo.png"
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
          Start a new analysis
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
          src="https://i.ibb.co/rR3fVfcY/cardgif.gif"
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
        Start a new analysis
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
        Go to Dashboard
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
        {copied ? "Copied! ✓" : "Share my verdict"}
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

            {parsedSections ? (
              <>
                {parsedSections.map((sec, idx) => (
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
                  </div>
                ))}

                {userPlan === "spark" && parsedSections ? (
                  <div
                    style={{
                      margin: "32px auto 0",
                      maxWidth: 500,
                      borderRadius: "12px",
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        filter: "blur(4px)",
                        pointerEvents: "none",
                        background: "#111",
                        padding: "24px 28px",
                        opacity: 0.6,
                      }}
                    >
                      <div
                        style={{
                          fontSize: "9px",
                          fontWeight: 800,
                          letterSpacing: "3px",
                          color: "white",
                        }}
                      >
                        SIGNAL SPRINT
                      </div>
                      <div
                        style={{
                          color: "rgba(255,255,255,0.5)",
                          fontSize: "12px",
                          marginTop: "8px",
                        }}
                      >
                        › 01 — [20 exact people to contact with personalized messages...]
                        <br />
                        › 02 — [LinkedIn outreach sequence...]
                        <br />
                        › 03 — [Reddit DM strategy...]
                      </div>
                    </div>
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        padding: "16px 20px",
                        boxSizing: "border-box",
                        background: "rgba(0,0,0,0.7)",
                        backdropFilter: "blur(2px)",
                        WebkitBackdropFilter: "blur(2px)",
                      }}
                    >
                      <div style={{ fontSize: "20px", marginBottom: "8px", lineHeight: 1 }}>
                        🔒
                      </div>
                      <div
                        style={{
                          color: "white",
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                          fontWeight: 700,
                          fontSize: "18px",
                          textAlign: "center",
                          lineHeight: 1.2,
                          marginBottom: "8px",
                        }}
                      >
                        Unlock Signal Sprint
                      </div>
                      <div
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          color: "rgba(255,255,255,0.5)",
                          fontSize: "13px",
                          textAlign: "center",
                          lineHeight: 1.4,
                          marginBottom: "16px",
                          maxWidth: 320,
                        }}
                      >
                        20 exact people to contact + messages
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleUpgrade()}
                        style={{
                          background: "#ffffff",
                          color: "#000000",
                          padding: "10px 24px",
                          borderRadius: "100px",
                          fontWeight: 700,
                          fontSize: "14px",
                          textDecoration: "none",
                          display: "inline-block",
                          border: "none",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        Upgrade to Build →
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

        {actionButtons}
      </div>
    </div>
  );
}
