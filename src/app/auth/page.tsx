"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { getAuthRedirectPath } from "@/lib/auth-destination";
import { recordLoginIp, tryAutoAuth } from "@/lib/auto-auth";
import { useLang } from "@/lib/useLang";
import { translateAuthError } from "@/lib/auth-errors";
import { formatCreatorDeactivatedMessage } from "@/lib/creator-deactivation-message";

const TRACKIT_LOGO = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useLang();
  const [mode, setMode] = useState<"login" | "signup">("login");
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
  const isCreatorLogin = searchParams.get("role") === "creator";

  useEffect(() => {
    const requestedMode = searchParams.get("mode");
    if (isCreatorLogin) {
      setMode("login");
      return;
    }
    if (requestedMode === "login" || requestedMode === "signup") {
      setMode(requestedMode);
    }
  }, [searchParams, isCreatorLogin]);

  useEffect(() => {
    if (searchParams.get("error") === "not_creator") {
      setError(
        lang === "fr"
          ? "Ce login est réservé aux dashboards créateurs."
          : "This login is only for creator dashboards.",
      );
    }
  }, [searchParams, lang]);

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      return;
    }
    void (async () => {
      const redirectParam = searchParams.get("redirectTo");
      const fallback = await tryAutoAuth(supabase);
      if (fallback) {
        if (isCreatorLogin) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("account_type")
              .eq("id", user.id)
              .maybeSingle();
            if (profile?.account_type === "creator") {
              router.replace("/dashboard?view=analytics");
              return;
            }
          }
          await supabase.auth.signOut();
          setCheckingSession(false);
          return;
        }
        router.replace(redirectParam && redirectParam.startsWith("/") ? redirectParam : fallback);
        return;
      }
      setCheckingSession(false);
    })();
  }, [router, searchParams, isCreatorLogin]);

  const creatorOnlyError =
    lang === "fr"
      ? "Ce login est réservé aux dashboards créateurs."
      : "This login is only for creator dashboards.";

  const rejectIfNotCreator = async () => {
    if (!supabase) return creatorOnlyError;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return creatorOnlyError;
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_type")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.account_type !== "creator") {
      await supabase.auth.signOut();
      return creatorOnlyError;
    }
    return null;
  };

  const toggleMode = () => {
    if (isCreatorLogin) return;
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
          if (isCreatorLogin) {
            const creatorErr = await rejectIfNotCreator();
            if (creatorErr) {
              setError(creatorErr);
              return;
            }
            router.replace("/dashboard?view=analytics");
            return;
          }
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
          options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
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

  const handleOAuth = async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback${isCreatorLogin ? "?role=creator" : ""}`,
      },
    });
  };

  if (checkingSession) {
    return (
      <div className="auth-shell">
        <p className="auth-status">
          {lang === "fr" ? "Connexion en cours..." : "Signing you in..."}
        </p>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <Link href="/" className="auth-card__logo">
          <img src={TRACKIT_LOGO} alt="Trackit" />
        </Link>

        {signupAwaitingEmail ? (
          <div className="auth-message">
            <h1>{lang === "fr" ? "Vérifiez vos emails." : "Check your email."}</h1>
            <p>
              {lang === "fr"
                ? `Nous avons envoyé un lien de confirmation à ${email}. Cliquez dessus pour activer votre compte.`
                : `We sent a confirmation link to ${email}. Click it to activate your account.`}
            </p>
            <button
              type="button"
              className="auth-submit"
              onClick={() => {
                setSignupAwaitingEmail(false);
                setMode("login");
              }}
            >
              {lang === "fr" ? "Déjà confirmé ? Se connecter" : "Already confirmed? Log in"}
            </button>
          </div>
        ) : resetMode ? (
          <div className="auth-message">
            {resetSent ? (
              <>
                <h2>{lang === "fr" ? "Vérifiez vos emails" : "Check your email"}</h2>
                <p>
                  {lang === "fr"
                    ? `Nous avons envoyé un lien à ${resetEmail}`
                    : `We sent a reset link to ${resetEmail}`}
                </p>
                <button
                  type="button"
                  className="auth-back"
                  onClick={() => {
                    setResetMode(false);
                    setResetSent(false);
                  }}
                >
                  {lang === "fr" ? "Retour à la connexion" : "Back to login"}
                </button>
              </>
            ) : (
              <>
                <h2>{lang === "fr" ? "Mot de passe oublié ?" : "Forgot password?"}</h2>
                <p>
                  {lang === "fr"
                    ? "Entrez votre email, on vous envoie un lien."
                    : "Enter your email and we’ll send a reset link."}
                </p>
                <form
                  className="auth-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!supabase || !resetEmail) return;
                    setResetLoading(true);
                    await supabase.auth.resetPasswordForEmail(resetEmail, {
                      redirectTo: `${window.location.origin}/auth/reset`,
                    });
                    setResetSent(true);
                    setResetLoading(false);
                  }}
                >
                  <div className="auth-field">
                    <input
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder={lang === "fr" ? "Email professionnel" : "Work email"}
                      type="email"
                      required
                    />
                  </div>
                  <button type="submit" className="auth-submit" disabled={!resetEmail || resetLoading}>
                    {lang === "fr"
                      ? resetLoading
                        ? "Envoi..."
                        : "Envoyer le lien"
                      : resetLoading
                        ? "Sending..."
                        : "Send reset link"}
                  </button>
                </form>
                <button type="button" className="auth-back" onClick={() => setResetMode(false)}>
                  {lang === "fr" ? "Retour à la connexion" : "Back to login"}
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <h1 className="auth-card__title">
              {isCreatorLogin
                ? lang === "fr"
                  ? "Espace créateur"
                  : "Creator login"
                : mode === "login"
                  ? lang === "fr"
                    ? "Bon retour !"
                    : "Welcome back!"
                  : lang === "fr"
                    ? "Créer un compte"
                    : "Create an account"}
            </h1>
            <p className="auth-card__switch">
              {isCreatorLogin ? (
                <>
                  {lang === "fr" ? "Pas encore affilié ? " : "Not in the program yet? "}
                  <Link href="/affiliation">
                    {lang === "fr" ? "Commencer" : "Get started"}
                  </Link>
                </>
              ) : (
                <>
                  {mode === "login"
                    ? lang === "fr"
                      ? "Pas encore de compte ? "
                      : "Don't have an account? "
                    : lang === "fr"
                      ? "Déjà un compte ? "
                      : "Already have an account? "}
                  <button type="button" onClick={toggleMode}>
                    {mode === "login"
                      ? lang === "fr"
                        ? "S'inscrire"
                        : "Sign up"
                      : lang === "fr"
                        ? "Se connecter"
                        : "Log in"}
                  </button>
                </>
              )}
            </p>

            <button type="button" className="auth-google" onClick={() => void handleOAuth()}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {lang === "fr" ? "Continuer avec Google" : "Continue with Google"}
            </button>

            <div className="auth-divider">{lang === "fr" ? "ou" : "or"}</div>

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-field">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder={
                    isCreatorLogin
                      ? "Email"
                      : lang === "fr"
                        ? "Email professionnel"
                        : "Work email"
                  }
                  autoComplete="email"
                  required
                  disabled={!isSupabaseConfigured || loading}
                />
              </div>
              <div className="auth-field auth-field--pw">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={pwVisible ? "text" : "password"}
                  placeholder={lang === "fr" ? "Mot de passe" : "Password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  disabled={!isSupabaseConfigured || loading}
                />
                <button type="button" className="auth-eye" onClick={() => setPwVisible((v) => !v)} aria-label="Toggle password">
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

              {error ? <p className="auth-error">{error}</p> : null}

              <button type="submit" className="auth-submit" disabled={loading || !isSupabaseConfigured}>
                {loading
                  ? lang === "fr"
                    ? "Veuillez patienter..."
                    : "Please wait..."
                  : mode === "login"
                    ? lang === "fr"
                      ? "Se connecter"
                      : "Log In"
                    : lang === "fr"
                      ? "Créer un compte"
                      : "Create account"}
              </button>
            </form>

            {mode === "login" ? (
              <button type="button" className="auth-forgot" onClick={() => setResetMode(true)}>
                {lang === "fr" ? "Mot de passe oublié ?" : "Forgot Password?"}
              </button>
            ) : null}
          </>
        )}
      </div>

      <Link href="/contact" className="auth-help">
        {lang === "fr" ? "Besoin d'aide ?" : "Need help?"}
      </Link>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-shell">
          <p className="auth-status">Loading...</p>
        </div>
      }
    >
      <AuthPageContent />
    </Suspense>
  );
}
