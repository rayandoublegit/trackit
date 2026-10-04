"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { selectProfileRow } from "@/lib/profile-row";
import { isValidProfileUsername, normalizeProfileUsername } from "@/lib/profile-username";
import { useLang, useLocaleHref } from "@/lib/useLang";
import { authErrorMessage } from "@/lib/auth-error-message";

const TRACKIT_LOGO = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";
const BLUE = "#0047FF";

type CampaignInfo = {
  id: string;
  name: string;
  description: string;
  platform: string;
  commissionRate: number | null;
  commissionType: string | null;
};

type Viewer =
  | { kind: "anonymous" }
  | { kind: "brand"; email: string }
  | { kind: "creator"; email: string; username: string; fullName: string };

type Stage = "loading" | "error" | "form" | "awaiting-email" | "done";

const pendingKey = (id: string) => `trackit-join-${id}`;

function readPending(id: string): { fullName?: string; handle?: string } {
  try {
    return JSON.parse(localStorage.getItem(pendingKey(id)) || "{}");
  } catch {
    return {};
  }
}

function writePending(id: string, value: { fullName: string; handle: string } | null) {
  try {
    if (value) localStorage.setItem(pendingKey(id), JSON.stringify(value));
    else localStorage.removeItem(pendingKey(id));
  } catch {}
}

export default function CampaignJoinPage() {
  const params = useParams();
  const campaignId = (params?.id as string) || "";
  const lang = useLang();
  const fr = lang === "fr";
  const href = useLocaleHref();
  const t = (en: string, frText: string) => (fr ? frText : en);

  const [stage, setStage] = useState<Stage>("loading");
  const [loadError, setLoadError] = useState<"not_found" | "closed" | "network" | null>(null);
  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [brandName, setBrandName] = useState("");
  const [viewer, setViewer] = useState<Viewer>({ kind: "anonymous" });

  const [fullName, setFullName] = useState("");
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const loadViewer = useCallback(async (): Promise<Viewer> => {
    if (!supabase) return { kind: "anonymous" };
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { kind: "anonymous" };
    const profile = await selectProfileRow<{ account_type?: string | null; username?: string | null; full_name?: string | null }>(
      supabase,
      user.id,
      ["account_type", "username", "full_name"],
    );
    const email = user.email || "";
    if ((profile?.account_type || "").toLowerCase() === "brand") return { kind: "brand", email };
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    return {
      kind: "creator",
      email,
      username: profile?.username || (typeof meta.username === "string" ? meta.username : ""),
      fullName: profile?.full_name || (typeof meta.full_name === "string" ? meta.full_name : ""),
    };
  }, []);

  useEffect(() => {
    if (!campaignId) {
      setLoadError("not_found");
      setStage("error");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/campaigns/join?id=${encodeURIComponent(campaignId)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!data.ok) {
          setLoadError(data.error === "closed" ? "closed" : "not_found");
          setStage("error");
          return;
        }
        setCampaign(data.campaign);
        setBrandName(data.brandName || "");
        const who = await loadViewer();
        if (cancelled) return;
        setViewer(who);
        const pending = readPending(campaignId);
        if (who.kind === "creator") {
          setHandle(who.username || pending.handle || "");
          setFullName(who.fullName || pending.fullName || "");
        } else {
          setHandle(pending.handle || "");
          setFullName(pending.fullName || "");
        }
        setStage("form");
      } catch {
        if (!cancelled) {
          setLoadError("network");
          setStage("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, loadViewer]);

  const joinErrorText = (code: string | undefined): string => {
    switch (code) {
      case "brand_account":
        return t("This link is for creators. You're signed in with a brand account.", "Ce lien est réservé aux créateurs. Tu es connecté avec un compte marque.");
      case "own_campaign":
        return t("This is your own campaign.", "C’est ta propre campagne.");
      case "closed":
        return t("This campaign is no longer accepting creators.", "Cette campagne n’accepte plus de créateurs.");
      case "missing_handle":
        return t("Enter your social handle.", "Entre ton pseudo sur les réseaux.");
      case "not_found":
        return t("This campaign doesn't exist anymore.", "Cette campagne n’existe plus.");
      default:
        return t("We couldn't add you to the campaign. Try again.", "Impossible de t’ajouter à la campagne. Réessaie.");
    }
  };

  const callJoin = async (cleanHandle: string, name: string): Promise<boolean> => {
    if (!supabase) return false;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/campaigns/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ campaignId, socialHandle: cleanHandle, fullName: name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      setFormError(joinErrorText(data.error));
      return false;
    }
    writePending(campaignId, null);
    setStage("done");
    return true;
  };

  const validHandle = (): string | null => {
    const clean = normalizeProfileUsername(handle);
    if (!clean) {
      setFormError(t("Enter your social handle.", "Entre ton pseudo sur les réseaux."));
      return null;
    }
    if (!isValidProfileUsername(clean)) {
      setFormError(
        t(
          "Invalid handle: 3–20 characters, letters, numbers and underscores only.",
          "Pseudo invalide : 3 à 20 caractères, lettres, chiffres et underscores uniquement.",
        ),
      );
      return null;
    }
    return clean;
  };

  const joinSignedIn = async () => {
    setFormError("");
    const clean = validHandle();
    if (!clean) return;
    setSubmitting(true);
    try {
      await callJoin(clean, fullName.trim());
    } finally {
      setSubmitting(false);
    }
  };

  const signUpAndJoin = async () => {
    setFormError("");
    if (!supabase) {
      setFormError(t("Service unavailable.", "Service indisponible."));
      return;
    }
    if (!fullName.trim()) {
      setFormError(t("Enter your full name.", "Entre ton nom complet."));
      return;
    }
    const clean = validHandle();
    if (!clean) return;
    if (!email.trim() || !password) {
      setFormError(t("Enter your email and a password.", "Entre ton email et un mot de passe."));
      return;
    }
    setSubmitting(true);
    try {
      writePending(campaignId, { fullName: fullName.trim(), handle: clean });
      const next = window.location.pathname;
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
          data: { full_name: fullName.trim(), username: clean },
        },
      });
      const exists =
        (signUpErr && signUpErr.message.toLowerCase().includes("already")) ||
        (signUpData?.user && (signUpData.user.identities ?? []).length === 0);
      if (signUpErr && !exists) {
        setFormError(authErrorMessage(signUpErr.message, lang));
        return;
      }
      if (signUpData?.session) {
        await callJoin(clean, fullName.trim());
        return;
      }
      if (exists) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInErr) {
          if (/not confirmed/i.test(signInErr.message)) {
            setStage("awaiting-email");
            return;
          }
          setFormError(t("This account already exists. Wrong password?", "Ce compte existe déjà. Mauvais mot de passe ?"));
          return;
        }
        const who = await loadViewer();
        setViewer(who);
        if (who.kind === "brand") {
          setFormError(joinErrorText("brand_account"));
          return;
        }
        await callJoin(clean, fullName.trim());
        return;
      }
      // New account waiting for email confirmation: the email link brings them back here.
      setStage("awaiting-email");
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setViewer({ kind: "anonymous" });
    setFormError("");
  };

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
  const linkBtn: React.CSSProperties = {
    background: "none", border: "none", padding: 0, color: BLUE, fontFamily: "inherit",
    fontSize: 13, cursor: "pointer", textDecoration: "underline",
  };

  const title = campaign?.name || t("this campaign", "cette campagne");
  const brand = brandName || t("the brand", "la marque");
  const commission =
    campaign?.commissionRate != null && Number(campaign.commissionRate) > 0
      ? (campaign.commissionType || "").toLowerCase() === "fixed" || (campaign.commissionType || "").toLowerCase() === "flat"
        ? new Intl.NumberFormat(fr ? "fr-FR" : "en-US", { style: "currency", currency: "EUR" }).format(Number(campaign.commissionRate))
        : `${Number(campaign.commissionRate)} %`
      : null;

  const errorBox = formError ? (
    <div style={{ fontSize: 14, color: "#992323", padding: "10px 12px", borderRadius: 10, background: "rgba(153,35,35,0.06)", marginBottom: 12 }}>{formError}</div>
  ) : null;

  const handleField = (
    <>
      <input type="text" placeholder={t("Your handle (e.g. myaccount)", "Ton pseudo (ex. moncompte)")} value={handle} onChange={(e) => setHandle(e.target.value)} style={input} autoComplete="off" />
      <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", margin: "-4px 0 12px", lineHeight: 1.45 }}>
        {t(
          "Your TikTok / Instagram handle, so your videos and sales are tracked.",
          "Ton pseudo TikTok / Instagram, pour suivre tes vidéos et tes ventes.",
        )}
      </p>
    </>
  );

  let right: React.ReactNode;
  if (stage === "loading") {
    right = <div style={{ fontSize: 15, color: "rgba(0,0,0,0.4)" }}>{t("Loading…", "Chargement…")}</div>;
  } else if (stage === "error") {
    right = (
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 10 }}>
          {loadError === "closed" ? t("Campaign closed", "Campagne fermée") : t("Invalid link", "Lien invalide")}
        </h2>
        <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", lineHeight: 1.5 }}>
          {loadError === "closed"
            ? t("This campaign is no longer accepting creators.", "Cette campagne n’accepte plus de nouveaux créateurs.")
            : loadError === "network"
              ? t("We couldn't load this campaign. Check your connection and reload.", "Impossible de charger la campagne. Vérifie ta connexion et recharge la page.")
              : t("This link doesn't match any campaign. Ask the brand for a new one.", "Ce lien ne correspond à aucune campagne. Demande un nouveau lien à la marque.")}
        </p>
      </div>
    );
  } else if (stage === "done") {
    right = (
      <div>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#E8F0FF", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke={BLUE} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <h2 style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 10 }}>
          {t(`You joined ${title}`, `Tu as rejoint ${title}`)}
        </h2>
        <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", lineHeight: 1.5, marginBottom: 28 }}>
          {t(`${brand} can see you in the campaign. Your sales and earnings will show up in your dashboard.`, `${brand} te voit dans la campagne. Tes ventes et tes gains apparaîtront dans ton tableau de bord.`)}
        </p>
        <a href={href("/dashboard")} style={{ ...btn, display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
          {t("Go to my dashboard →", "Aller à mon tableau de bord →")}
        </a>
      </div>
    );
  } else if (stage === "awaiting-email") {
    right = (
      <div>
        <h2 style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 10 }}>{t("Check your inbox", "Vérifie ta boîte mail")}</h2>
        <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", lineHeight: 1.5 }}>
          {t(
            `We sent a confirmation link to ${email || "your email"}. Click it and you'll come back here to finish joining ${title}.`,
            `On a envoyé un lien de confirmation à ${email || "ton email"}. Clique dessus : tu reviendras ici pour finir de rejoindre ${title}.`,
          )}
        </p>
      </div>
    );
  } else if (viewer.kind === "brand") {
    right = (
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 10 }}>{t("This link is for creators", "Ce lien est réservé aux créateurs")}</h2>
        <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", lineHeight: 1.5, marginBottom: 20 }}>
          {t(
            `You're signed in with a brand account (${viewer.email}). Share this link with creators so they can join the campaign.`,
            `Tu es connecté avec un compte marque (${viewer.email}). Partage ce lien aux créateurs pour qu’ils rejoignent la campagne.`,
          )}
        </p>
        <button type="button" onClick={() => void signOut()} style={linkBtn}>{t("Sign out to join as a creator", "Se déconnecter pour rejoindre en créateur")}</button>
      </div>
    );
  } else if (viewer.kind === "creator") {
    right = (
      <div>
        <h2 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.025em", marginBottom: 8, lineHeight: 1.2 }}>
          {t(`Join ${title}`, `Rejoins ${title}`)}
        </h2>
        <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", lineHeight: 1.5, marginBottom: 24 }}>
          {t(`Signed in as ${viewer.email}.`, `Connecté avec ${viewer.email}.`)}{" "}
          <button type="button" onClick={() => void signOut()} style={linkBtn}>{t("Not you?", "Ce n’est pas toi ?")}</button>
        </p>
        {viewer.username ? null : handleField}
        {errorBox}
        <button type="button" onClick={() => void joinSignedIn()} disabled={submitting} style={btn}>
          {submitting ? t("Joining…", "Inscription…") : t("Join the campaign →", "Rejoindre la campagne →")}
        </button>
      </div>
    );
  } else {
    right = (
      <div>
        <h2 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.025em", marginBottom: 8, lineHeight: 1.2 }}>
          {t(`Join ${title}`, `Rejoins ${title}`)}
        </h2>
        <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", lineHeight: 1.5, marginBottom: 24 }}>
          {t("Create your free creator account in seconds. Already have one? Use the same email and password.", "Crée ton compte créateur gratuit en quelques secondes. Déjà un compte ? Utilise le même email et mot de passe.")}
        </p>
        <input type="text" placeholder={t("Your full name", "Ton nom complet")} value={fullName} onChange={(e) => setFullName(e.target.value)} style={input} autoComplete="name" />
        {handleField}
        <input type="email" placeholder={t("Your email", "Ton email")} value={email} onChange={(e) => setEmail(e.target.value)} style={input} autoComplete="email" />
        <div style={{ position: "relative" }}>
          <input type={showPassword ? "text" : "password"} placeholder={t("Choose a password", "Choisis un mot de passe")} value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...input, paddingRight: 46 }} autoComplete="new-password" onKeyDown={(e) => { if (e.key === "Enter") void signUpAndJoin(); }} />
          <button type="button" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? t("Hide password", "Masquer le mot de passe") : t("Show password", "Afficher le mot de passe")} style={{ position: "absolute", right: 12, top: 14, background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "rgba(0,0,0,0.4)", display: "flex" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />{showPassword ? <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : null}</svg>
          </button>
        </div>
        {errorBox}
        <button type="button" onClick={() => void signUpAndJoin()} disabled={submitting} style={btn}>
          {submitting ? t("Joining…", "Inscription…") : t("Join the campaign →", "Rejoindre la campagne →")}
        </button>
        <p style={{ fontSize: 12, color: "rgba(0,0,0,0.35)", marginTop: 16, lineHeight: 1.5 }}>
          {t(
            `By continuing, you agree to share your contact details with ${brand} to track your commissions.`,
            `En continuant, tu acceptes de partager tes coordonnées avec ${brand} pour le suivi de tes commissions.`,
          )}
        </p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "'InterDisplay', 'Inter Display', sans-serif", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "56px 16px 24px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", width: "100%", maxWidth: 920, background: "#FFFFFF", borderRadius: 24, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,30,90,0.12)" }}>
        <div style={{ flex: "1 1 340px", background: `linear-gradient(160deg, ${BLUE} 0%, #0035C4 100%)`, padding: "44px 36px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 420 }}>
          <img src={TRACKIT_LOGO} alt="Trackit" style={{ height: 54, width: "auto", objectFit: "contain", alignSelf: "flex-start", filter: "brightness(0) invert(1)" }} />
          <div style={{ margin: "36px 0" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 14 }}>
              {brandName ? t(`Campaign by ${brandName}`, `Campagne de ${brandName}`) : t("Creator campaign", "Campagne créateurs")}
            </div>
            <h1 style={{ fontSize: 30, fontWeight: 600, color: "#FFFFFF", letterSpacing: "-0.03em", lineHeight: 1.15, marginBottom: 18, overflowWrap: "anywhere" }}>
              {campaign?.name || t("Join the campaign", "Rejoins la campagne")}
            </h1>
            {campaign?.description ? (
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 1.5, marginBottom: 18, overflowWrap: "anywhere" }}>{campaign.description}</p>
            ) : null}
            {commission ? (
              <div style={{ display: "inline-block", fontSize: 14, fontWeight: 600, color: "#FFFFFF", background: "rgba(255,255,255,0.16)", borderRadius: 999, padding: "8px 14px" }}>
                {t(`Commission: ${commission} per sale`, `Commission : ${commission} par vente`)}
              </div>
            ) : null}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", letterSpacing: "-0.01em" }}>{t("Powered by Trackit", "Propulsé par Trackit")}</div>
        </div>
        <div style={{ flex: "1 1 340px", padding: "44px 36px", display: "flex", flexDirection: "column", justifyContent: "center" }}>{right}</div>
      </div>
    </div>
  );
}
