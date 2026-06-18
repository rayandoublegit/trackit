"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const TRACKIT_LOGO = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

export default function InvitePage() {
  const params = useParams();
  const token = (params?.token as string) || "";

  const [loading, setLoading] = useState(true);
  const [brandName, setBrandName] = useState("");
  const [inviteError, setInviteError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState(false);

  // Vérifie le token au chargement.
  useEffect(() => {
    if (!token) { setInviteError("Lien invalide"); setLoading(false); return; }
    fetch(`/api/invites/accept?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setBrandName(data.brandName || "cette marque");
        else setInviteError(data.error || "Lien invalide");
      })
      .catch(() => setInviteError("Erreur de chargement"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleJoin = async () => {
    setFormError("");
    if (!supabase) { setFormError("Service indisponible"); return; }
    if (!email.trim() || !password) { setFormError("Entrez votre email et un mot de passe"); return; }
    setSubmitting(true);
    try {
      // 1. Crée le compte créateur (ou connecte s'il existe déjà).
      let userId = "";
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signUpErr && !signUpErr.message.toLowerCase().includes("already")) {
        setFormError(signUpErr.message); setSubmitting(false); return;
      }
      userId = signUpData?.user?.id || "";
      // Si déjà inscrit, on tente la connexion.
      if (!userId) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(), password,
        });
        if (signInErr) { setFormError("Ce compte existe déjà. Mot de passe incorrect ?"); setSubmitting(false); return; }
        userId = signInData?.user?.id || "";
      }
      if (!userId) { setFormError("Impossible de créer le compte"); setSubmitting(false); return; }

      // 2. Relie le créateur à la marque.
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, creatorId: userId }),
      });
      const data = await res.json();
      if (!data.ok) { setFormError(data.error || "Échec de la liaison"); setSubmitting(false); return; }

      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  return <InviteUI
    loading={loading} brandName={brandName} inviteError={inviteError}
    email={email} setEmail={setEmail} password={password} setPassword={setPassword}
    submitting={submitting} formError={formError} done={done} onJoin={handleJoin}
  />;
}

const TRACKIT_BLUE = "#0047FF";

function InviteUI(props: {
  loading: boolean; brandName: string; inviteError: string;
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  submitting: boolean; formError: string; done: boolean; onJoin: () => void;
}) {
  const { loading, brandName, inviteError, email, setEmail, password, setPassword, submitting, formError, done, onJoin } = props;

  const shell: React.CSSProperties = {
    minHeight: "100vh", background: "#FFFFFF",
    fontFamily: "'InterDisplay', 'Inter Display', sans-serif",
    display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "96px 24px 48px",
  };
  const card: React.CSSProperties = { width: "100%", maxWidth: 420 };
  const input: React.CSSProperties = {
    width: "100%", padding: "13px 14px", fontSize: 15, fontFamily: "inherit",
    border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, marginBottom: 12,
    outline: "none", boxSizing: "border-box", letterSpacing: "-0.01em",
  };
  const btn: React.CSSProperties = {
    width: "100%", padding: "14px", fontSize: 15, fontWeight: 600, fontFamily: "inherit",
    color: "#FFFFFF", background: TRACKIT_BLUE, border: "none", borderRadius: 12,
    cursor: submitting ? "default" : "pointer", letterSpacing: "-0.01em", opacity: submitting ? 0.6 : 1,
  };

  return (
    <div style={shell}>
      <div style={card}>
        <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="Trackit" style={{ height: 40, marginBottom: 40, display: "block" }} />

        {loading ? (
          <div style={{ fontSize: 15, color: "rgba(0,0,0,0.4)" }}>Chargement...</div>
        ) : inviteError ? (
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 8 }}>Lien invalide</h1>
            <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", lineHeight: 1.5 }}>
              Cette invitation n'est plus valide ou a expiré. Demandez un nouveau lien à la marque qui vous a invité.
            </p>
          </div>
        ) : done ? (
          <div>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#E8F0FF", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke={TRACKIT_BLUE} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 8 }}>Vous êtes connecté à {brandName}</h1>
            <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", lineHeight: 1.5, marginBottom: 24 }}>
              Vous pourrez suivre vos ventes et vos gains depuis votre espace.
            </p>
            <a href="/dashboard" style={{ ...btn, display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
              Accéder à mon espace →
            </a>
          </div>
        ) : (
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 8 }}>{brandName} vous invite</h1>
            <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", lineHeight: 1.5, marginBottom: 24 }}>
              Créez votre compte pour suivre vos ventes et vos commissions en temps réel.
            </p>
            <input type="email" placeholder="Votre email" value={email} onChange={(e) => setEmail(e.target.value)} style={input} autoComplete="email" />
            <input type="password" placeholder="Choisissez un mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} style={input} autoComplete="new-password" onKeyDown={(e) => { if (e.key === "Enter") onJoin(); }} />
            {formError && (
              <div style={{ fontSize: 14, color: "#992323", padding: "10px 12px", borderRadius: 10, background: "rgba(153,35,35,0.06)", marginBottom: 12 }}>{formError}</div>
            )}
            <button type="button" onClick={onJoin} disabled={submitting} style={btn}>
              {submitting ? "Création..." : "Rejoindre →"}
            </button>
            <p style={{ fontSize: 12, color: "rgba(0,0,0,0.35)", marginTop: 16, lineHeight: 1.5 }}>
              En continuant, vous acceptez de partager vos coordonnées avec {brandName} pour le suivi de vos commissions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
