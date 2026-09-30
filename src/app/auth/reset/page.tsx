"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import { authErrorMessage } from "@/lib/auth-error-message";

function ResetContent() {
  const router = useRouter();
  const lang = useLang();
  const fr = lang === "fr";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async () => {
    if (!supabase) return;
    if (password !== confirm) { setError(fr ? "Les mots de passe ne correspondent pas" : "Passwords don't match"); return; }
    if (password.length < 8) { setError(fr ? "Le mot de passe doit contenir au moins 8 caractères" : "Password must be at least 8 characters"); return; }
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(authErrorMessage(error.message, lang)); setLoading(false); return; }
    setDone(true);
    setTimeout(() => router.replace("/dashboard"), 2000);
  };

  if (done) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", background: "#F7F7F5" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: "#1A1A1A" }}>{fr ? "Mot de passe mis à jour !" : "Password updated!"}</h2>
        <p style={{ color: "#7A7A7A", fontSize: 14 }}>{fr ? "Redirection vers le tableau de bord..." : "Redirecting to dashboard..."}</p>
      </div>
    </div>
  );

  if (!ready) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", background: "#F7F7F5" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#7A7A7A" }}>{fr ? "Vérification du lien..." : "Verifying reset link..."}</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", background: "#F7F7F5" }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 40, width: "min(420px, 90vw)", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", margin: "0 0 6px", color: "#1A1A1A" }}>{fr ? "Nouveau mot de passe" : "Set new password"}</h2>
        <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 24px" }}>{fr ? "Choisissez un mot de passe solide pour votre compte." : "Choose a strong password for your account."}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={fr ? "Nouveau mot de passe" : "New password"}
            type="password"
            style={{ width: "100%", padding: "10px 14px", border: "1px solid #E5E5E5", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          />
          <input
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder={fr ? "Confirmer le nouveau mot de passe" : "Confirm new password"}
            type="password"
            style={{ width: "100%", padding: "10px 14px", border: "1px solid #E5E5E5", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          />
          {error && <p style={{ color: "#dc2626", fontSize: 12, margin: 0 }}>{error}</p>}
          <button
            type="button"
            onClick={handleReset}
            disabled={!password || !confirm || loading}
            style={{ background: "#0047FF", color: "#fff", border: "none", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", marginTop: 4 }}
          >
            {loading ? (fr ? "Mise à jour..." : "Updating...") : fr ? "Mettre à jour le mot de passe →" : "Update password →"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ResetPage() {
  return <Suspense><ResetContent /></Suspense>;
}
