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
      let userId = "";
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signUpErr && !signUpErr.message.toLowerCase().includes("already")) {
        setFormError(signUpErr.message); setSubmitting(false); return;
      }
      userId = signUpData?.user?.id || "";
      if (!userId) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(), password,
        });
        if (signInErr) { setFormError("Ce compte existe déjà. Mot de passe incorrect ?"); setSubmitting(false); return; }
        userId = signInData?.user?.id || "";
      }
      if (!userId) { setFormError("Impossible de créer le compte"); setSubmitting(false); return; }

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

const BLUE = "#0047FF";

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 18 }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <span style={{ fontSize: 15, color: "rgba(255,255,255,0.92)", lineHeight: 1.45, letterSpacing: "-0.01em" }}>{children}</span>
    </div>
  );
}

function InviteUI(props: {
  loading: boolean; brandName: string; inviteError: string;
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  submitting: boolean; formError: string; done: boolean; onJoin: () => void;
}) {
  const { loading, brandName, inviteError, email, setEmail, password, setPassword, submitting, formError, done, onJoin } = props;

  const input: React.CSSProperties = {
    width: "100%", padding: "14px 15px", fontSize: 15, fontFamily: "inherit",
    border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, marginBottom: 12,
    outline: "none", boxSizing: "border-box", letterSpacing: "-0.01em", background: "#FAFAFA",
  };
  const btn: React.CSSProperties = {
    width: "100%", padding: "15px", fontSize: 15, fontWeight: 600, fontFamily: "inherit",
    color: "#FFFFFF", background: BLUE, border: "none", borderRadius: 12,
    cursor: submitting ? "default" : "pointer", letterSpacing: "-0.01em", opacity: submitting ? 0.6 : 1,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FB", fontFamily: "'InterDisplay', 'Inter Display', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", width: "100%", maxWidth: 920, background: "#FFFFFF", borderRadius: 24, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,30,90,0.12)" }}>

        <div style={{ flex: "1 1 380px", background: `linear-gradient(160deg, ${BLUE} 0%, #0035C4 100%)`, padding: "48px 44px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 520 }}>
          <img src={TRACKIT_LOGO} alt="Trackit" style={{ height: 54, width: "auto", objectFit: "contain", alignSelf: "flex-start", filter: "brightness(0) invert(1)" }} />
          <div style={{ margin: "40px 0" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 14 }}>Invitation créateur</div>
            <h1 style={{ fontSize: 30, fontWeight: 600, color: "#FFFFFF", letterSpacing: "-0.03em", lineHeight: 1.15, marginBottom: 28 }}>
              Suivez vos ventes et vos commissions, en temps réel.
            </h1>
            <Bullet>Voyez chaque vente que vous générez, à la seconde près</Bullet>
            <Bullet>Suivez vos gains et vos paiements sans rien demander</Bullet>
            <Bullet>Gérez vos infos de paiement en toute autonomie</Bullet>
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", letterSpacing: "-0.01em" }}>Propulsé par Trackit</div>
        </div>

        <div style={{ flex: "1 1 380px", padding: "48px 44px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {loading ? (
            <div style={{ fontSize: 15, color: "rgba(0,0,0,0.4)" }}>Chargement...</div>
          ) : inviteError ? (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 10 }}>Lien invalide</h2>
              <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", lineHeight: 1.5 }}>
                Cette invitation n'est plus valide ou a expiré. Demandez un nouveau lien à la marque qui vous a invité.
              </p>
            </div>
          ) : done ? (
            <div>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#E8F0FF", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke={BLUE} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <h2 style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 10 }}>Vous êtes connecté à {brandName}</h2>
              <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", lineHeight: 1.5, marginBottom: 28 }}>
                Retrouvez vos ventes et vos gains dès maintenant dans votre espace.
              </p>
              <a href="/dashboard" style={{ ...btn, display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
                Accéder à mon espace →
              </a>
            </div>
          ) : (
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.025em", marginBottom: 8, lineHeight: 1.2 }}>
                {brandName} vous invite à les rejoindre
              </h2>
              <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", lineHeight: 1.5, marginBottom: 28 }}>
                Créez votre compte gratuit en quelques secondes.
              </p>
              <input type="email" placeholder="Votre email" value={email} onChange={(e) => setEmail(e.target.value)} style={input} autoComplete="email" />
              <input type="password" placeholder="Choisissez un mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} style={input} autoComplete="new-password" onKeyDown={(e) => { if (e.key === "Enter") onJoin(); }} />
              {formError && (
                <div style={{ fontSize: 14, color: "#992323", padding: "10px 12px", borderRadius: 10, background: "rgba(153,35,35,0.06)", marginBottom: 12 }}>{formError}</div>
              )}
              <button type="button" onClick={onJoin} disabled={submitting} style={btn}>
                {submitting ? "Création..." : "Rejoindre " + brandName + " →"}
              </button>
              <p style={{ fontSize: 12, color: "rgba(0,0,0,0.35)", marginTop: 16, lineHeight: 1.5 }}>
                En continuant, vous acceptez de partager vos coordonnées avec {brandName} pour le suivi de vos commissions.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
