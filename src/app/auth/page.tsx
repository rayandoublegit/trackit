"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";

type Mode = "login" | "signup";

function getErrorMessage(err: AuthError | null) {
  if (!err) return null;
  return err.message ?? "Something went wrong.";
}

function EyeOpenIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function EyeClosedIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M1 1l22 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const eyeBtnStyle: CSSProperties = {
  position: "absolute",
  right: 0,
  top: "50%",
  transform: "translateY(-50%)",
  background: "none",
  border: "none",
  padding: 6,
  cursor: "pointer",
  color: "#fff",
  opacity: 0.4,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 0,
};

const inputBase: CSSProperties = {
  width: "100%",
  background: "transparent",
  border: "none",
  borderBottom: "1px solid #ffffff",
  color: "#fff",
  fontFamily: "'Inter', sans-serif",
  fontSize: 16,
  fontWeight: 300,
  padding: "12px 40px 12px 0",
  outline: "none",
  boxSizing: "border-box",
};

export default function AuthPage() {
  const router = useRouter();
  const lang = useLang();

  const t = {
    en: {
      login_title: "Welcome back.",
      login_sub: "Sign in to your Klayan account.",
      signup_title: "Create your account.",
      signup_sub: "What's your idea worth? Find out in 10 minutes.",
      email: "Email",
      password: "Password",
      username: "Username",
      signin_btn: "Sign in →",
      signup_btn: "Create account →",
      no_account: "Don't have an account?",
      has_account: "Already have an account?",
      signup_link: "Sign up",
      signin_link: "Sign in",
      check_email: "Check your email.",
      check_email_sub:
        "We sent you a confirmation link. Click it to activate your account.",
      confirmed_btn: "Already confirmed? Log in →",
    },
    fr: {
      login_title: "Bon retour.",
      login_sub: "Connecte-toi à ton compte Klayan.",
      signup_title: "Crée ton compte.",
      signup_sub: "Ton idée vaut combien ? Découvre-le en 10 minutes.",
      email: "Email",
      password: "Mot de passe",
      username: "Nom d'utilisateur",
      signin_btn: "Se connecter →",
      signup_btn: "Créer un compte →",
      no_account: "Pas encore de compte ?",
      has_account: "Déjà un compte ?",
      signup_link: "S'inscrire",
      signin_link: "Se connecter",
      check_email: "Vérifie tes emails.",
      check_email_sub:
        "On t'a envoyé un lien de confirmation. Clique dessus pour activer ton compte.",
      confirmed_btn: "Déjà confirmé ? Se connecter →",
    },
  }[lang];

  const skipAuthRedirectForAvatarRef = useRef(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("signup");
  const [signupStep, setSignupStep] = useState<1 | 2 | 3>(1);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");

  const [loginPwVisible, setLoginPwVisible] = useState(false);
  const [signupPwVisible, setSignupPwVisible] = useState(false);
  const [confirmPwVisible, setConfirmPwVisible] = useState(false);

  const [loading, setLoading] = useState(false);
  const [signupAwaitingEmail, setSignupAwaitingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "confirmation_failed") {
      setError("Email confirmation failed. Please try again or sign up with a new link.");
      setMode("login");
      window.history.replaceState(null, "", "/auth");
    }
  }, []);

  useEffect(() => {
    if (!signupAwaitingEmail) return;
    const client = supabase;
    if (!client) return;

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user?.email_confirmed_at) {
        subscription.unsubscribe();
        router.push("/analyze");
      }
    });

    const interval = setInterval(() => {
      void client.auth.getSession().then(({ data: { session } }) => {
        if (session?.user?.email_confirmed_at) {
          clearInterval(interval);
          router.push("/analyze");
        }
      });
    }, 2000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [signupAwaitingEmail, router]);

  const validateEmail = (value: string) => {
    const basic = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!basic.test(value)) return false;
    const domain = value.split("@")[1] ?? "";
    const parts = domain.split(".");
    const tld = parts[parts.length - 1] ?? "";
    return /^[A-Za-z]{2,}$/.test(tld);
  };

  const validateUsername = (value: string) => {
    if (value.length < 3 || value.length > 20) return false;
    return /^[a-zA-Z0-9_]+$/.test(value);
  };

  const resetFieldErrors = () => {
    setEmailError(null);
    setPasswordError(null);
    setConfirmPasswordError(null);
    setUsernameError(null);
    setError(null);
  };

  const handleSignupContinue = (e: React.FormEvent) => {
    e.preventDefault();
    resetFieldErrors();

    if (!validateEmail(email.trim())) {
      setEmailError("Adresse email invalide");
      return;
    }
    if (password.length < 12) {
      setPasswordError("12 caractères minimum");
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setPasswordError("Au moins une majuscule requise");
      return;
    }
    if (!/[!@#$%^&*]/.test(password)) {
      setPasswordError("Au moins un symbole requis (!@#$%^&*)");
      return;
    }
    if (confirmPassword !== password) {
      setConfirmPasswordError("Les mots de passe ne correspondent pas");
      return;
    }

    void handleCreateAccount_inner();
  };

  const handleCreateAccount_inner = async () => {
    if (!supabase) {
      setError("Supabase is not configured yet.");
      return;
    }

    resetFieldErrors();

    const u = email.trim().split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 20) || "founder";

    setLoading(true);
    skipAuthRedirectForAvatarRef.current = true;
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { username: u },
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
        },
      });

      const msg = getErrorMessage(signUpError);
      if (msg) {
        skipAuthRedirectForAvatarRef.current = false;
        setError(msg);
        return;
      }

      const user = data.user;
      if (!user) {
        skipAuthRedirectForAvatarRef.current = false;
        setError("Could not create account. Please try again.");
        return;
      }

      if (data.session) {
        setSignupStep(3);
      } else {
        skipAuthRedirectForAvatarRef.current = false;
        router.replace("/analyze");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    setAvatarFile(f);
    setAvatarPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
  };

  const completeSignupWithOptionalAvatar = async (opts: { skipUpload: boolean }) => {
    if (!supabase) {
      setError("Supabase is not configured yet.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Session expired. Please sign in again.");
        skipAuthRedirectForAvatarRef.current = false;
        return;
      }

      const shouldUpload = !opts.skipUpload && avatarFile !== null;

      if (shouldUpload && avatarFile) {
        const path = `${user.id}/avatar`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, {
            upsert: true,
            contentType: avatarFile.type || "image/jpeg",
          });

        if (uploadError) {
          setError(uploadError.message);
          return;
        }

        const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
        const publicUrl = pub.publicUrl;

        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();

        if (existingProfile) {
          const { error: profileUpdateError } = await supabase
            .from("profiles")
            .update({ avatar_url: publicUrl })
            .eq("id", user.id);

          if (profileUpdateError) {
            setError(profileUpdateError.message);
            return;
          }
        }
      }

      // Create profile if it doesn't exist yet
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (!existingProfile) {
        await supabase.from("profiles").insert({
          id: user.id,
          username: username.trim() || user.email?.split("@")[0] || "founder",
          plan: "free",
          subscription_status: "inactive",
        });
      }

      skipAuthRedirectForAvatarRef.current = false;
      router.replace("/analyze");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError("Supabase is not configured yet.");
      return;
    }

    resetFieldErrors();

    if (!validateEmail(email.trim())) {
      setEmailError("Adresse email invalide");
      return;
    }

    setLoading(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      const msg = getErrorMessage(signErr);
      if (msg) {
        setError(msg);
      } else {
        const {
          data: { user: signedInUser },
        } = await supabase.auth.getUser();
        if (!signedInUser) {
          router.replace("/auth");
          return;
        }
        const { data: profileRow } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", signedInUser.id)
          .maybeSingle();
        if (!profileRow) {
          router.replace("/analyze");
        } else {
          router.replace("/dashboard");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!supabase) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/confirm` },
    });
    if (error) { setError(error.message); setLoading(false); }
  };

  const toggleMode = () => {
    setMode((m) => (m === "login" ? "signup" : "login"));
    setSignupStep(1);
    setSignupAwaitingEmail(false);
    setAvatarFile(null);
    setAvatarPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError(null);
    resetFieldErrors();
  };

  const showSignupStep1Fields = mode === "signup" && signupStep === 1;
  const showSignupStep2 = mode === "signup" && signupStep === 2;
  const showSignupStep3 = mode === "signup" && signupStep === 3;
  const showWelcomeHeader =
    mode === "login" || (mode === "signup" && signupStep === 1);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#000000",
        color: "var(--white)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          borderRadius: 20,
          border: "none",
          background: signupAwaitingEmail ? "transparent" : "#111111",
          padding: signupAwaitingEmail ? 0 : 28,
        }}
      >
        {signupAwaitingEmail ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
            }}
          >
            <img
              src="/images/navbarlogo.png"
              alt="Klayan"
              style={{
                width: 60,
                height: 60,
                objectFit: "cover",
                borderRadius: 50,
                marginBottom: 24,
              }}
            />
            <div
              style={{
                width: "100%",
                maxWidth: 420,
                background: "#ffffff",
                color: "#000000",
                borderRadius: 16,
                padding: "28px 24px",
                textAlign: "center",
                boxSizing: "border-box",
              }}
            >
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 16,
                  fontWeight: 500,
                  lineHeight: 1.55,
                  margin: 0,
                  whiteSpace: "pre-line",
                }}
              >
                {`${t.check_email}\n${t.check_email_sub}`}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSignupAwaitingEmail(false);
                  setMode("login");
                }}
                style={{
                  marginTop: 20,
                  background: "#000000",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 24px",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: "pointer",
                  letterSpacing: "-0.02em",
                  width: "100%",
                }}
              >
                {t.confirmed_btn}
              </button>
            </div>
          </div>
        ) : null}

        {!signupAwaitingEmail && showWelcomeHeader ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <img
              src="/images/navbarlogo.png"
              alt="Klayan"
              style={{
                width: 60,
                height: 60,
                objectFit: "cover",
                borderRadius: 50,
                marginBottom: 18,
              }}
            />

            <div
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: "-0.04em",
                lineHeight: 1.0,
                marginBottom: 10,
                textAlign: "center",
              }}
            >
              {mode === "login" ? t.login_title : t.signup_title}
            </div>

            <div
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 16,
                fontWeight: 300,
                color: "var(--muted)",
                lineHeight: 1.6,
                marginBottom: 18,
                textAlign: "center",
              }}
            >
              {mode === "login" ? t.login_sub : t.signup_sub}
            </div>

            <button
              type="button"
              onClick={toggleMode}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--muted)",
                cursor: "pointer",
                fontFamily: "'Inter', sans-serif",
                fontSize: 16,
                fontWeight: 300,
                padding: 0,
                lineHeight: 1.4,
              }}
            >
              {mode === "login"
                ? `${t.no_account} ${t.signup_link}`
                : `${t.has_account} ${t.signin_link}`}
            </button>

            {mode === "signup" && (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 10, textAlign: "center" }}>
                Rejoins 13 fondateurs qui ont déjà validé leur idée.
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleGoogleSignIn()}
              style={{
                marginTop: 20,
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                background: "#fff",
                color: "#000",
                border: "none",
                borderRadius: 100,
                padding: "14px 24px",
                fontFamily: "'Inter', sans-serif",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: "-0.01em",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              {mode === "signup" ? "Continuer avec Google" : "Se connecter avec Google"}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0 0", width: "100%" }}>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", fontFamily: "'Inter', sans-serif" }}>ou</span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
            </div>
          </div>
        ) : null}

        {false ? (
          <div
            style={{
              display: "none",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setSignupStep(1);
              }}
              style={{
                display: "none",
              }}
            >
              ← Back
            </button>
          </div>
        ) : null}

        {!signupAwaitingEmail && mode === "login" ? (
          <form onSubmit={(e) => void handleLogin(e)}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder={t.email}
              autoComplete="email"
              disabled={!isSupabaseConfigured || loading}
              style={{
                ...inputBase,
                padding: "12px 0",
                marginBottom: emailError ? 6 : 16,
              }}
            />
            {emailError ? (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#ff4d4f",
                  padding: "0 0 8px 0",
                  marginBottom: 16,
                  letterSpacing: 0.3,
                }}
              >
                {emailError}
              </div>
            ) : null}

            <div style={{ position: "relative", marginBottom: 16 }}>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={loginPwVisible ? "text" : "password"}
                placeholder={t.password}
                autoComplete="current-password"
                disabled={!isSupabaseConfigured || loading}
                style={{ ...inputBase, marginBottom: 0 }}
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={loginPwVisible ? "Hide password" : "Show password"}
                onClick={() => setLoginPwVisible((v) => !v)}
                style={eyeBtnStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "0.4";
                }}
              >
                {loginPwVisible ? <EyeClosedIcon /> : <EyeOpenIcon />}
              </button>
            </div>
            {error ? (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#ff4d4f",
                  border: "1px solid rgba(255,77,79,0.25)",
                  padding: "10px 14px",
                  borderRadius: 12,
                  marginBottom: 16,
                  letterSpacing: 0.3,
                }}
              >
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading || !isSupabaseConfigured}
              style={{
                width: "100%",
                textAlign: "center",
                background: "#ffffff",
                color: "#000000",
                border: "none",
                padding: "14px 0",
                borderRadius: 10,
                fontFamily: "'Inter', sans-serif",
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                cursor: "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Please wait..." : t.signin_btn}
            </button>
          </form>
        ) : null}

        {!signupAwaitingEmail && showSignupStep1Fields ? (
          <form onSubmit={handleSignupContinue}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder={t.email}
              autoComplete="email"
              disabled={!isSupabaseConfigured || loading}
              style={{
                ...inputBase,
                padding: "12px 0",
                marginBottom: emailError ? 6 : 16,
              }}
            />
            {emailError ? (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#ff4d4f",
                  padding: "0 0 8px 0",
                  marginBottom: 16,
                  letterSpacing: 0.3,
                }}
              >
                {emailError}
              </div>
            ) : null}

            <div style={{ position: "relative", marginBottom: passwordError ? 6 : 16 }}>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={signupPwVisible ? "text" : "password"}
                placeholder={t.password}
                autoComplete="new-password"
                disabled={!isSupabaseConfigured || loading}
                style={{ ...inputBase, marginBottom: 0 }}
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={signupPwVisible ? "Hide password" : "Show password"}
                onClick={() => setSignupPwVisible((v) => !v)}
                style={eyeBtnStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "0.4";
                }}
              >
                {signupPwVisible ? <EyeClosedIcon /> : <EyeOpenIcon />}
              </button>
            </div>
            {passwordError ? (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#ff4d4f",
                  padding: "0 0 8px 0",
                  marginBottom: 16,
                  letterSpacing: 0.3,
                }}
              >
                {passwordError}
              </div>
            ) : null}

            <div style={{ position: "relative", marginBottom: confirmPasswordError ? 6 : 16 }}>
              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type={confirmPwVisible ? "text" : "password"}
                placeholder="Confirm your password"
                autoComplete="new-password"
                disabled={!isSupabaseConfigured || loading}
                style={{ ...inputBase, marginBottom: 0 }}
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={confirmPwVisible ? "Hide password" : "Show password"}
                onClick={() => setConfirmPwVisible((v) => !v)}
                style={eyeBtnStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "0.4";
                }}
              >
                {confirmPwVisible ? <EyeClosedIcon /> : <EyeOpenIcon />}
              </button>
            </div>
            {confirmPasswordError ? (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#ff4d4f",
                  padding: "0 0 8px 0",
                  marginBottom: 16,
                  letterSpacing: 0.3,
                }}
              >
                {confirmPasswordError}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading || !isSupabaseConfigured}
              style={{
                width: "100%",
                textAlign: "center",
                background: "#ffffff",
                color: "#000000",
                border: "none",
                padding: "14px 0",
                borderRadius: 10,
                fontFamily: "'Inter', sans-serif",
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                cursor: "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              Continue
            </button>
          </form>
        ) : null}

        {!signupAwaitingEmail && showSignupStep2 ? (
          <form onSubmit={(e) => { e.preventDefault(); void handleCreateAccount_inner(); }}>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              type="text"
              placeholder={t.username}
              autoComplete="username"
              disabled={!isSupabaseConfigured || loading}
              style={{
                ...inputBase,
                padding: "12px 0",
                marginBottom: usernameError ? 6 : 16,
              }}
            />
            {usernameError ? (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#ff4d4f",
                  padding: "0 0 8px 0",
                  marginBottom: 16,
                  letterSpacing: 0.3,
                }}
              >
                {usernameError}
              </div>
            ) : null}

            {error ? (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#ff4d4f",
                  border: "1px solid rgba(255,77,79,0.25)",
                  padding: "10px 14px",
                  borderRadius: 12,
                  marginBottom: 16,
                  letterSpacing: 0.3,
                }}
              >
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading || !isSupabaseConfigured}
              style={{
                width: "100%",
                textAlign: "center",
                background: "#ffffff",
                color: "#000000",
                border: "none",
                padding: "14px 0",
                borderRadius: 10,
                fontFamily: "'Inter', sans-serif",
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                cursor: "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Please wait..." : t.signup_btn}
            </button>
          </form>
        ) : null}

        {!signupAwaitingEmail && showSignupStep3 ? (
          <div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                marginBottom: 22,
              }}
            >
              <img
                src="/images/navbarlogo.png"
                alt="Klayan"
                style={{
                  width: 60,
                  height: 60,
                  objectFit: "cover",
                  borderRadius: 50,
                  marginBottom: 18,
                }}
              />
              <div
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 32,
                  fontWeight: 700,
                  letterSpacing: "-0.04em",
                  lineHeight: 1.0,
                  marginBottom: 10,
                  textAlign: "center",
                }}
              >
                Add a photo.
              </div>
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 16,
                  fontWeight: 300,
                  color: "var(--muted)",
                  lineHeight: 1.6,
                  marginBottom: 20,
                  textAlign: "center",
                }}
              >
                Put a face to your ideas.
              </div>
            </div>

            <input
              ref={avatarFileInputRef}
              type="file"
              accept="image/*"
              aria-hidden
              tabIndex={-1}
              style={{ display: "none" }}
              onChange={handleAvatarFileChange}
            />

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
              }}
            >
              <button
                type="button"
                aria-label="Choose profile photo"
                onClick={() => avatarFileInputRef.current?.click()}
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: "50%",
                  border: "2px dashed rgba(255,255,255,0.2)",
                  padding: 0,
                  background: "transparent",
                  cursor: "pointer",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {avatarPreviewUrl ? (
                  <img
                    src={avatarPreviewUrl}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : null}
              </button>
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  fontWeight: 300,
                  color: "var(--muted)",
                  textAlign: "center",
                }}
              >
                Upload a photo
              </div>
            </div>

            {error ? (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#ff4d4f",
                  border: "1px solid rgba(255,77,79,0.25)",
                  padding: "10px 14px",
                  borderRadius: 12,
                  marginTop: 16,
                  marginBottom: 16,
                  letterSpacing: 0.3,
                }}
              >
                {error}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void completeSignupWithOptionalAvatar({ skipUpload: true })}
              disabled={loading || !isSupabaseConfigured}
              style={{
                display: "block",
                width: "100%",
                marginTop: 8,
                border: "none",
                background: "transparent",
                color: "var(--muted)",
                cursor: "pointer",
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                fontWeight: 300,
                padding: "10px 0",
              }}
            >
              Skip for now
            </button>

            <button
              type="button"
              onClick={() =>
                void completeSignupWithOptionalAvatar({ skipUpload: false })
              }
              disabled={loading || !isSupabaseConfigured}
              style={{
                width: "100%",
                textAlign: "center",
                background: "#ffffff",
                color: "#000000",
                border: "none",
                padding: "14px 0",
                borderRadius: 10,
                fontFamily: "'Inter', sans-serif",
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                cursor: "pointer",
                opacity: loading ? 0.7 : 1,
                marginTop: 8,
              }}
            >
              {loading ? "Please wait..." : "Finish"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
