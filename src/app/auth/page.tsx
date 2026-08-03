"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { getAuthRedirectPath } from "@/lib/auth-destination";
import { recordLoginIp, tryAutoAuth } from "@/lib/auto-auth";
import { useLang } from "@/lib/useLang";
import { translateAuthError } from "@/lib/auth-errors";
import { formatCreatorDeactivatedMessage } from "@/lib/creator-deactivation-message";

const AUTH_FONT = "'InterDisplay', 'Inter Display', sans-serif";
const TRACKIT_LOGO = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

type KeyPoint = {
  metric: string;
  metricLabel: string;
  detail: string;
};

function getKeyPoints(lang: "en" | "fr"): KeyPoint[] {
  if (lang === "fr") {
    return [
      {
        metric: "3-en-1",
        metricLabel: "Find it · Track it · Pay it",
        detail:
          "Un seul dashboard : trouvez des créateurs, trackez le CA Shopify et payez les commissions.",
      },
      {
        metric: "100%",
        metricLabel: "des ventes attribuées",
        detail:
          "Liens d’affiliation, codes promo et commandes Shopify rattachés à chaque créateur en temps réel.",
      },
      {
        metric: "−10h",
        metricLabel: "de suivi manuel / semaine",
        detail:
          "Plus de tableurs : pipeline, campagnes et payouts centralisés pour toute l’équipe.",
      },
    ];
  }

  return [
    {
      metric: "3-in-1",
      metricLabel: "Find it · Track it · Pay it",
      detail:
        "One dashboard to find creators, track Shopify revenue, and pay commissions.",
    },
    {
      metric: "100%",
      metricLabel: "of sales attributed",
      detail:
        "Affiliate links, discount codes, and Shopify orders tied to every creator in real time.",
    },
    {
      metric: "−10h",
      metricLabel: "manual tracking / week",
      detail:
        "No more spreadsheets: pipeline, campaigns, and payouts in one place for the team.",
    },
  ];
}

function AuthKeyPointsPanel({ lang }: { lang: "en" | "fr" }) {
  const before = lang === "fr" ? "Prêt à scaler votre " : "Ready to scale your ";
  const after = "?";

  return (
    <aside className="auth-page__right" aria-hidden>
      <div className="auth-page__testimonials">
        <h2 className="auth-page__hook">
          {before}
          <span className="auth-page__hook-mark">
            marketing
            <svg
              className="auth-page__hook-doodle"
              viewBox="0 0 100 8"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path
                className="auth-page__hook-doodle-path"
                d="M1.5 5.2 C 12 3.8, 22 6.4, 33 4.6 C 44 2.8, 54 6.2, 65 4.8 C 76 3.4, 86 5.9, 98.5 3.9"
              />
            </svg>
          </span>
          {after}
        </h2>
        <div className="auth-page__cards">
          {getKeyPoints(lang).map((item) => (
            <article key={item.metric} className="auth-page__card">
              <div className="auth-page__metric">
                <span className="auth-page__metric-value">{item.metric}</span>
                <span className="auth-page__metric-label">{item.metricLabel}</span>
              </div>
              <p className="auth-page__quote">{item.detail}</p>
            </article>
          ))}
        </div>
      </div>
    </aside>
  );
}

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useLang();
  const [isMobile, setIsMobile] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pwVisible, setPwVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupAwaitingEmail, setSignupAwaitingEmail] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const requestedMode = searchParams.get("mode");
    if (requestedMode === "login" || requestedMode === "signup") {
      setMode(requestedMode);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      return;
    }
    void (async () => {
      const redirectParam = searchParams.get("redirectTo");
      const fallback = await tryAutoAuth(supabase);
      if (fallback) {
        router.replace(redirectParam && redirectParam.startsWith("/") ? redirectParam : fallback);
        return;
      }
      setCheckingSession(false);
    })();
  }, [router, searchParams]);

  const toggleMode = () => {
    setMode((current) => (current === "login" ? "signup" : "login"));
    setError(null);
    setSignupAwaitingEmail(false);
    setResetMode(false);
    setResetSent(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!supabase) {
      setError(lang === "fr" ? "Supabase n'est pas encore configuré." : "Supabase is not configured yet.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        const { error: signErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signErr) {
          const lowered = signErr.message.trim().toLowerCase();
          if (lowered.includes("invalid login credentials") || lowered.includes("invalid credentials")) {
            try {
              const check = await fetch(
                `/api/auth/deactivated-creator?email=${encodeURIComponent(email.trim())}`,
                { cache: "no-store" },
              );
              const payload = (await check.json()) as { deactivated?: boolean; brandName?: string };
              if (payload.deactivated && payload.brandName) {
                setError(formatCreatorDeactivatedMessage(payload.brandName, lang));
                return;
              }
            } catch {
              /* fallback to generic auth error */
            }
          }
          setError(translateAuthError(signErr.message, lang));
        } else {
          await recordLoginIp();
          const redirectParam = searchParams.get("redirectTo");
          const destination = supabase
            ? await getAuthRedirectPath(supabase, (await supabase.auth.getUser()).data.user!.id)
            : "/dashboard";
          router.replace(redirectParam && redirectParam.startsWith("/") ? redirectParam : destination);
        }
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (signUpError) {
          setError(translateAuthError(signUpError.message, lang));
        } else if (data.session) {
          await recordLoginIp();
          try {
            await fetch("/api/notify-signup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: email.trim() }),
            });
          } catch {}
          router.replace("/onboarding");
        } else {
          setSignupAwaitingEmail(true);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const shellClass = isMobile ? "auth-shell auth-shell--mobile" : "auth-shell";

  const leftPanelStyle = {
    flex: isMobile ? "1 1 auto" : "1 1 50%",
    minHeight: 0,
    height: isMobile ? "auto" : "100%",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "flex-start",
    alignItems: "stretch" as const,
    gap: isMobile ? 12 : 12,
    padding: isMobile ? "12px 20px 40px" : "8px 36px 48px 104px",
    boxSizing: "border-box" as const,
    overflow: "hidden" as const,
  };

  const formWrapStyle = {
    width: "100%",
    maxWidth: isMobile ? 440 : 500,
    marginTop: 0,
  };

  if (checkingSession) {
    return (
      <div className={shellClass}>
        <div style={{ ...leftPanelStyle, justifyContent: "center" }}>
          <p style={{ fontSize: 15, color: "#7A7A7A", letterSpacing: "-0.01em" }}>
            {lang === "fr" ? "Connexion en cours..." : "Signing you in..."}
          </p>
        </div>
        <AuthKeyPointsPanel lang={lang} />
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div style={leftPanelStyle}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: isMobile ? 12 : 16,
            width: "100%",
            maxWidth: isMobile ? 440 : 500,
          }}
        >
          <a href="/" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <img
              src={TRACKIT_LOGO}
              alt="Trackit"
              style={{ height: isMobile ? 68 : 88, width: "auto", display: "block" }}
            />
          </a>
          <span
            style={{
              fontSize: isMobile ? 13 : 15,
              fontWeight: 600,
              color: "#000000",
              letterSpacing: "-0.02em",
              lineHeight: 1.35,
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            Find it, <span style={{ color: "#0047FF" }}>Track it</span>, Pay it
            <span style={{ color: "#0047FF", fontSize: isMobile ? 22 : 30, lineHeight: 1 }}>.</span>
          </span>
        </header>

        <main style={formWrapStyle}>
          {signupAwaitingEmail ? (
            <div>
              <h1 style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.04em", color: "#1A1A1A", margin: 0, marginBottom: 12 }}>
                {lang === "fr" ? "Vérifiez vos emails." : "Check your email."}
              </h1>
              <p style={{ fontSize: 16, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0, marginBottom: 32 }}>
                {lang === "fr"
                  ? `Nous avons envoyé un lien de confirmation à ${email}. Cliquez dessus pour activer votre compte.`
                  : `We sent a confirmation link to ${email}. Click it to activate your account.`}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSignupAwaitingEmail(false);
                  setMode("login");
                }}
                style={{
                  width: "100%",
                  background: "#000",
                  color: "#fff",
                  border: "none",
                  padding: "18px 0",
                  borderRadius: 14,
                  fontSize: 16,
                  fontWeight: 500,
                  letterSpacing: "-0.02em",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {lang === "fr" ? "Déjà confirmé ? Se connecter" : "Already confirmed? Sign in"}
              </button>
            </div>
          ) : resetMode ? (
            <div>
              {resetSent ? (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
                  <h2>{lang === "fr" ? "Vérifiez vos emails" : "Check your email"}</h2>
                  <p style={{ color: "#7A7A7A", fontSize: 14 }}>
                    {lang === "fr" ? `Nous avons envoyé un lien à ${resetEmail}` : `We sent a reset link to ${resetEmail}`}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setResetMode(false);
                      setResetSent(false);
                    }}
                    style={{ marginTop: 16, fontSize: 13, color: "#0047FF", background: "none", border: "none", cursor: "pointer" }}
                  >
                    {lang === "fr" ? "Retour à la connexion" : "Back to login"}
                  </button>
                </div>
              ) : (
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
                    {lang === "fr" ? "Réinitialiser votre mot de passe" : "Reset your password"}
                  </h2>
                  <p style={{ fontSize: 13, color: "#7A7A7A", marginBottom: 20 }}>
                    {lang === "fr" ? "Entrez votre email et nous vous enverrons un lien." : "Enter your email and we'll send you a reset link."}
                  </p>
                  <input
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="your@email.com"
                    type="email"
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      border: "1px solid #E5E5E5",
                      borderRadius: 10,
                      fontSize: 13,
                      fontFamily: "inherit",
                      outline: "none",
                      boxSizing: "border-box",
                      marginBottom: 12,
                    }}
                  />
                  <button
                    type="button"
                    disabled={!resetEmail || resetLoading}
                    onClick={async () => {
                      if (!supabase || !resetEmail) return;
                      setResetLoading(true);
                      await supabase.auth.resetPasswordForEmail(resetEmail, {
                        redirectTo: `${window.location.origin}/auth/reset`,
                      });
                      setResetSent(true);
                      setResetLoading(false);
                    }}
                    style={{
                      width: "100%",
                      background: "#0047FF",
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      padding: "12px",
                      fontSize: 14,
                      fontWeight: 600,
                      fontFamily: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    {lang === "fr" ? (resetLoading ? "Envoi..." : "Envoyer le lien →") : resetLoading ? "Sending..." : "Send reset link →"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetMode(false)}
                    style={{
                      width: "100%",
                      marginTop: 10,
                      background: "none",
                      border: "none",
                      fontSize: 13,
                      color: "#7A7A7A",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    ← {lang === "fr" ? "Retour à la connexion" : "Back to login"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: isMobile ? 30 : 36, fontWeight: 600, letterSpacing: "-0.03em", color: "#1A1A1A", margin: 0, marginBottom: 10 }}>
                {lang === "fr" ? (mode === "login" ? "Se connecter" : "Créer un compte") : mode === "login" ? "Sign in" : "Create an account"}
              </h1>
              <p style={{ fontSize: isMobile ? 15 : 16, color: "#7A7A7A", letterSpacing: "-0.02em", margin: "0 0 28px", lineHeight: 1.5 }}>
                {lang === "fr"
                  ? mode === "login"
                    ? "Reprenez là où vous en étiez — votre pipeline créateurs vous attend."
                    : "2 minutes pour démarrer. Trouvez, trackez et payez vos créateurs au même endroit."
                  : mode === "login"
                    ? "Pick up where you left off — your creator pipeline is waiting."
                    : "2 minutes to start. Find, track, and pay your creators in one place."}
              </p>

              <form onSubmit={handleSubmit}>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder={lang === "fr" ? "Votre adresse email" : "Enter your email address"}
                  autoComplete="email"
                  required
                  disabled={!isSupabaseConfigured || loading}
                  style={{
                    width: "100%",
                    background: "#FFFFFF",
                    border: "1px solid #E5E5E5",
                    borderRadius: 14,
                    padding: "20px 22px",
                    fontSize: 17,
                    fontFamily: "inherit",
                    color: "#1A1A1A",
                    letterSpacing: "-0.02em",
                    outline: "none",
                    boxSizing: "border-box",
                    marginBottom: 14,
                  }}
                />

                <div style={{ position: "relative", marginBottom: 18 }}>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={pwVisible ? "text" : "password"}
                    placeholder={lang === "fr" ? "Mot de passe" : "Password"}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    required
                    disabled={!isSupabaseConfigured || loading}
                    style={{
                      width: "100%",
                      background: "#FFFFFF",
                      border: "1px solid #E5E5E5",
                      borderRadius: 14,
                      padding: "20px 22px",
                      paddingRight: 44,
                      fontSize: 17,
                      fontFamily: "inherit",
                      color: "#1A1A1A",
                      letterSpacing: "-0.02em",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setPwVisible((v) => !v)}
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#9A9A9A",
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {pwVisible ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>

                {mode === "login" ? (
                  <div style={{ marginBottom: 12 }}>
                    <button
                      type="button"
                      onClick={() => setResetMode(true)}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        fontSize: 12,
                        color: "#7A7A7A",
                        cursor: "pointer",
                        textDecoration: "underline",
                        fontFamily: "inherit",
                      }}
                    >
                      {lang === "fr" ? "Mot de passe oublié ?" : "Forgot password?"}
                    </button>
                  </div>
                ) : null}

                {error ? (
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: "#992323",
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "rgba(153,35,35,0.06)",
                      marginBottom: 16,
                    }}
                  >
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  className="hero-cta"
                  disabled={loading || !isSupabaseConfigured}
                  style={{
                    width: "100%",
                    display: "block",
                    marginTop: 0,
                    marginBottom: 14,
                    border: "none",
                    cursor: "pointer",
                    opacity: loading ? 0.7 : 1,
                    boxSizing: "border-box",
                  }}
                >
                  {lang === "fr"
                    ? loading
                      ? "Veuillez patienter..."
                      : mode === "login"
                        ? "Se connecter"
                        : "Créer un compte"
                    : loading
                      ? "Please wait..."
                      : mode === "login"
                        ? "Sign in"
                        : "Create account"}
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                  <div style={{ flex: 1, height: 1, background: "#E5E5E5" }} />
                  <span style={{ fontSize: 13, color: "#9A9A9A", letterSpacing: "-0.01em" }}>{lang === "fr" ? "ou" : "or"}</span>
                  <div style={{ flex: 1, height: 1, background: "#E5E5E5" }} />
                </div>

                <button
                  type="button"
                  onClick={() => handleOAuth("google")}
                  style={{
                    width: "100%",
                    background: "#FFFFFF",
                    color: "#1A1A1A",
                    border: "1px solid #1A1A1A",
                    padding: "18px 0",
                    borderRadius: 14,
                    fontSize: 17,
                    fontWeight: 500,
                    letterSpacing: "-0.02em",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  {lang === "fr"
                    ? mode === "login"
                      ? "Se connecter avec Google"
                      : "S'inscrire avec Google"
                    : mode === "login"
                      ? "Sign in with Google"
                      : "Sign up with Google"}
                </button>

                <p
                  style={{
                    marginTop: 24,
                    textAlign: "center",
                    fontSize: 15,
                    color: "#7A7A7A",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {lang === "fr"
                    ? mode === "login"
                      ? "Pas encore de compte ? "
                      : "Déjà un compte ? "
                    : mode === "login"
                      ? "Don't have an account? "
                      : "Already have an account? "}
                  <button
                    type="button"
                    onClick={toggleMode}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      font: "inherit",
                      color: "#0047FF",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {lang === "fr"
                      ? mode === "login"
                        ? "Créer un compte"
                        : "Se connecter"
                      : mode === "login"
                        ? "Create an account"
                        : "Sign in"}
                  </button>
                </p>
              </form>
            </>
          )}
        </main>

      </div>

      <AuthKeyPointsPanel lang={lang} />
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            background: "#FFFFFF",
            fontFamily: AUTH_FONT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p style={{ fontSize: 15, color: "#7A7A7A", letterSpacing: "-0.01em" }}>Loading...</p>
        </div>
      }
    >
      <AuthPageContent />
    </Suspense>
  );
}
