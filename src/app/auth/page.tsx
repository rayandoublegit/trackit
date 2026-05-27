"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { getAuthRedirectPath } from "@/lib/auth-destination";
import { recordLoginIp, tryAutoAuth } from "@/lib/auto-auth";

function useLang(): "en" | "fr" {
  const [lang, setLang] = useState<"en" | "fr">("en");
  useEffect(() => {
    const stored = localStorage.getItem("trackit_lang");
    if (stored === "fr" || stored === "en") { setLang(stored); return; }
    const detected = navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
    setLang(detected);
  }, []);
  return lang;
}

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
          setError(signErr.message);
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
          setError(signUpError.message);
        } else if (data.session) {
          await recordLoginIp();
          try {
            await fetch("/api/notify-signup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: email.trim() })
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

  if (checkingSession) {
    return (
      <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "'InterDisplay', 'Inter Display', sans-serif", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "80px" }}>
        <p style={{ fontSize: 15, color: "#7A7A7A", letterSpacing: "-0.01em" }}>{lang === "fr" ? "Connexion en cours..." : "Signing you in..."}</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "'InterDisplay', 'Inter Display', sans-serif", marginTop: -80, display: "flex", flexDirection: "column", alignItems: "flex-start", paddingTop: "80px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 48px 8px" }}>
        <a href="/" style={{ display: "flex", alignItems: "center" }}>
          <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="Trackit" style={{ height: 130, width: "auto", display: "block" }} />
        </a>
        <button
          type="button"
          className="hero-cta"
          onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); setSignupAwaitingEmail(false); }}
          style={{ marginTop: 0, border: "none", cursor: "pointer" }}
        >
          {lang === "fr" ? (mode === "login" ? "Créer un compte" : "Se connecter") : (mode === "login" ? "Create an account" : "Sign in")}
        </button>
      </header>

      <main style={{ maxWidth: 560, margin: "24px auto 0", padding: "0 24px" }}>
        {signupAwaitingEmail ? (
          <div>
            <h1 style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.04em", color: "#1A1A1A", margin: 0, marginBottom: 12 }}>{lang === "fr" ? "Vérifiez vos emails." : "Check your email."}</h1>
            <p style={{ fontSize: 16, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0, marginBottom: 32 }}>{lang === "fr" ? `Nous avons envoyé un lien de confirmation à ${email}. Cliquez dessus pour activer votre compte.` : `We sent a confirmation link to ${email}. Click it to activate your account.`}</p>
            <button type="button" onClick={() => { setSignupAwaitingEmail(false); setMode("login"); }} style={{ width: "100%", background: "#000", color: "#fff", border: "none", padding: "18px 0", borderRadius: 14, fontSize: 16, fontWeight: 500, letterSpacing: "-0.02em", cursor: "pointer", fontFamily: "inherit" }}>Already confirmed? Sign in</button>
          </div>
        ) : resetMode ? (
          <div>
            {resetSent ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
                <h2>Check your email</h2>
                <p style={{ color: "#7A7A7A", fontSize: 14 }}>{lang === "fr" ? `Nous avons envoyé un lien à ${resetEmail}` : `We sent a reset link to ${resetEmail}`}</p>
                <button type="button" onClick={() => { setResetMode(false); setResetSent(false); }} style={{ marginTop: 16, fontSize: 13, color: "#0047FF", background: "none", border: "none", cursor: "pointer" }}>Back to login</button>
              </div>
            ) : (
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>{lang === "fr" ? "Réinitialiser votre mot de passe" : "Reset your password"}</h2>
                <p style={{ fontSize: 13, color: "#7A7A7A", marginBottom: 20 }}>{lang === "fr" ? "Entrez votre email et nous vous enverrons un lien." : "Enter your email and we'll send you a reset link."}</p>
                <input
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  placeholder="your@email.com"
                  type="email"
                  style={{ width: "100%", padding: "10px 14px", border: "1px solid #E5E5E5", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 12 }}
                />
                <button
                  type="button"
                  disabled={!resetEmail || resetLoading}
                  onClick={async () => {
                    if (!supabase || !resetEmail) return;
                    setResetLoading(true);
                    await supabase.auth.resetPasswordForEmail(resetEmail, {
                      redirectTo: `${window.location.origin}/auth/reset`
                    });
                    setResetSent(true);
                    setResetLoading(false);
                  }}
                  style={{ width: "100%", background: "#0047FF", color: "#fff", border: "none", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
                >
                  {lang === "fr" ? (resetLoading ? "Envoi..." : "Envoyer le lien →") : (resetLoading ? "Sending..." : "Send reset link →")}
                </button>
                <button type="button" onClick={() => setResetMode(false)} style={{ width: "100%", marginTop: 10, background: "none", border: "none", fontSize: 13, color: "#7A7A7A", cursor: "pointer", fontFamily: "inherit" }}>← Back to login</button>
              </div>
            )}
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em", color: "#1A1A1A", margin: 0, marginBottom: 24 }}>
              {lang === "fr" ? (mode === "login" ? "Se connecter" : "Créer un compte") : (mode === "login" ? "Sign in" : "Create an account")}
            </h1>

            <form onSubmit={handleSubmit}>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder={lang === "fr" ? "Votre adresse email" : "Enter your email address"} autoComplete="email" required disabled={!isSupabaseConfigured || loading} style={{ width: "100%", background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 14, padding: "18px 22px", fontSize: 16, fontFamily: "inherit", color: "#1A1A1A", letterSpacing: "-0.02em", outline: "none", boxSizing: "border-box", marginBottom: 12 }} />

              <div style={{ position: "relative", marginBottom: 16 }}>
                <input value={password} onChange={(e) => setPassword(e.target.value)} type={pwVisible ? "text" : "password"} placeholder={lang === "fr" ? "Mot de passe" : "Password"} autoComplete={mode === "login" ? "current-password" : "new-password"} required disabled={!isSupabaseConfigured || loading} style={{ width: "100%", background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 14, padding: "18px 22px", paddingRight: 44, fontSize: 16, fontFamily: "inherit", color: "#1A1A1A", letterSpacing: "-0.02em", outline: "none", boxSizing: "border-box" }} />
                <button
                  type="button"
                  onClick={() => setPwVisible((v) => !v)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9A9A9A", padding: 0, display: "flex", alignItems: "center" }}
                >
                  {pwVisible ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22"/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>

              {mode === "login" ? (
                <div style={{ marginBottom: 12 }}>
                  <button type="button" onClick={() => setResetMode(true)} style={{ background: "none", border: "none", padding: 0, fontSize: 12, color: "#7A7A7A", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>{lang === "fr" ? "Mot de passe oublié ?" : "Forgot password?"}</button>
                </div>
              ) : null}

              {error ? (<div style={{ fontSize: 14, fontWeight: 500, color: "#992323", padding: "10px 14px", borderRadius: 10, background: "rgba(153,35,35,0.06)", marginBottom: 16 }}>{error}</div>) : null}

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
                {lang === "fr" ? (loading ? "Veuillez patienter..." : mode === "login" ? "Se connecter" : "Créer un compte") : (loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account")}
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                <div style={{ flex: 1, height: 1, background: "#E5E5E5" }} />
                <span style={{ fontSize: 13, color: "#9A9A9A", letterSpacing: "-0.01em" }}>{lang === "fr" ? "ou" : "or"}</span>
                <div style={{ flex: 1, height: 1, background: "#E5E5E5" }} />
              </div>

              <button type="button" onClick={() => handleOAuth("google")} style={{ width: "100%", background: "#FFFFFF", color: "#1A1A1A", border: "1px solid #1A1A1A", padding: "16px 0", borderRadius: 14, fontSize: 16, fontWeight: 500, letterSpacing: "-0.02em", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                {lang === "fr" ? "Se connecter avec Google" : "Sign in with Google"}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "'InterDisplay', 'Inter Display', sans-serif", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "80px" }}>
          <p style={{ fontSize: 15, color: "#7A7A7A", letterSpacing: "-0.01em" }}>Loading...</p>
        </div>
      }
    >
      <AuthPageContent />
    </Suspense>
  );
}
