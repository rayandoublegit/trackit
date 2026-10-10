"use client";

import { useCallback, useEffect, useState } from "react";
import { PlatformLogo, PLATFORM_LABEL } from "@/components/PlatformLogo";
import { authErrorMessage } from "@/lib/auth-error-message";
import { GIFT_APPLICATION_MESSAGE_MAX, normalizeApplicantHandle, type GiftPlatform } from "@/lib/gift-share";
import { supabase } from "@/lib/supabase";

// The "Je participe / Apply" panel of the public gift page: sign up or log in
// as a creator, then confirm the handle and apply. Creators are "tu" in French.

type Lang = "en" | "fr";
type Viewer = "loading" | "anonymous" | "creator" | "brand" | "owner";
type Stage = "form" | "awaiting-email" | "done";

const pendingKey = (token: string) => `trackit-gift-${token}`;

type Pending = { fullName?: string; handle?: string; platform?: GiftPlatform; message?: string };

function readPending(token: string): Pending {
  try {
    return JSON.parse(localStorage.getItem(pendingKey(token)) || "{}") as Pending;
  } catch {
    return {};
  }
}

function writePending(token: string, value: Pending | null) {
  try {
    if (value) localStorage.setItem(pendingKey(token), JSON.stringify(value));
    else localStorage.removeItem(pendingKey(token));
  } catch {
    // storage blocked: the form simply starts empty after the email link
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export function GiftApply({
  token,
  path,
  open,
  brandName,
  product,
  platforms,
  lang,
}: {
  token: string;
  path: string;
  open: boolean;
  brandName: string;
  product: string;
  platforms: GiftPlatform[];
  lang: Lang;
}) {
  const fr = lang === "fr";
  const t = (en: string, frText: string) => (fr ? frText : en);
  const [viewer, setViewer] = useState<Viewer>("loading");
  const [missionStatus, setMissionStatus] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("form");
  const [platform, setPlatform] = useState<GiftPlatform>(platforms[0] ?? "tiktok");
  const [handle, setHandle] = useState("");
  const [message, setMessage] = useState("");
  const [terms, setTerms] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadViewer = useCallback(async () => {
    try {
      const res = await fetch(`/api/gifting/apply?token=${encodeURIComponent(token)}`, { headers: await authHeaders(), cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setViewer("anonymous");
        return;
      }
      setViewer(body.viewer as Viewer);
      setMissionStatus(body.mission?.status ?? null);
      const pending = readPending(token);
      setHandle((h) => h || pending.handle || body.username || "");
      setFullName((n) => n || pending.fullName || body.fullName || "");
      if (pending.platform && platforms.includes(pending.platform)) setPlatform(pending.platform);
      if (pending.message) setMessage((m) => m || pending.message || "");
    } catch {
      setViewer("anonymous");
    }
  }, [token, platforms]);

  useEffect(() => {
    void loadViewer();
  }, [loadViewer]);

  const errorText = (code: string | undefined, failures?: string[]): string => {
    switch (code) {
      case "terms":
        return t("Tick the box to apply.", "Coche la case pour postuler.");
      case "platform":
        return t("This campaign isn’t open on that platform.", "Cette campagne n’est pas ouverte sur cette plateforme.");
      case "handle":
        return t("Enter your handle (letters, numbers, dots and underscores).", "Entre ton pseudo (lettres, chiffres, points et underscores).");
      case "message":
        return t("Your message is too long.", "Ton message est trop long.");
      case "brand_account":
        return t("This link is for creators. You’re signed in with a brand account.", "Ce lien est réservé aux créateurs. Tu es connecté avec un compte marque.");
      case "own_campaign":
        return t("This is your own campaign.", "C’est ta propre campagne.");
      case "full":
        return t("Every spot was just taken.", "Toutes les places viennent d’être prises.");
      case "expired":
      case "closed":
        return t("This campaign no longer accepts creators.", "Cette campagne n’accepte plus de créateurs.");
      case "disabled":
        return t("The brand paused this link.", "La marque a mis ce lien en pause.");
      case "handle_taken":
        return t("Another account already applied with this handle.", "Un autre compte a déjà postulé avec ce pseudo.");
      case "rate_limited":
        return t("Too many applications in a short time. Try again in an hour.", "Trop de candidatures en peu de temps. Réessaie dans une heure.");
      case "not_allowed":
        return t("This brand no longer works with your account.", "Cette marque ne travaille plus avec ton compte.");
      case "unauthorized":
        return t("Your session has expired. Log in again.", "Ta session a expiré. Reconnecte-toi.");
      case "requirements": {
        const parts = (failures ?? []).map((f) =>
          f === "followers"
            ? t("you don’t have enough followers yet", "tu n’as pas encore assez d’abonnés")
            : f === "country"
              ? t("the campaign is for other countries", "la campagne vise d’autres pays")
              : t("the campaign is on another platform", "la campagne est sur une autre plateforme"),
        );
        return t(`This campaign isn’t a match: ${parts.join(", ")}.`, `Cette campagne ne te correspond pas : ${parts.join(", ")}.`);
      }
      default:
        return t("We couldn’t send your application. Try again.", "Impossible d’envoyer ta candidature. Réessaie.");
    }
  };

  const apply = async () => {
    setError("");
    const clean = normalizeApplicantHandle(handle);
    if (!clean) return setError(errorText("handle"));
    if (!terms) return setError(errorText("terms"));
    setBusy(true);
    try {
      const res = await fetch("/api/gifting/apply", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ token, platform, handle: clean, message: message.trim(), acceptTerms: true, fullName: fullName.trim(), lang }),
      });
      const body = await res.json().catch(() => ({}));
      if (!body.ok) {
        setError(errorText(body.error, body.failures));
        return;
      }
      writePending(token, null);
      setMissionStatus(body.missionStatus ?? "applied");
      setStage("done");
    } catch {
      setError(t("Connection failed. Try again.", "Connexion impossible. Réessaie."));
    } finally {
      setBusy(false);
    }
  };

  const signUp = async () => {
    setError("");
    if (!supabase) return setError(t("Service unavailable.", "Service indisponible."));
    if (!fullName.trim()) return setError(t("Enter your full name.", "Entre ton nom complet."));
    const clean = normalizeApplicantHandle(handle);
    if (!clean) return setError(errorText("handle"));
    if (!email.trim() || !password) return setError(t("Enter your email and a password.", "Entre ton email et un mot de passe."));
    setBusy(true);
    try {
      writePending(token, { fullName: fullName.trim(), handle: clean, platform, message: message.trim() });
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(path)}`,
          data: { full_name: fullName.trim(), username: clean, account_type: "creator" },
        },
      });
      const exists =
        (signUpErr && /already/i.test(signUpErr.message)) || (data?.user && (data.user.identities ?? []).length === 0);
      if (signUpErr && !exists) return setError(authErrorMessage(signUpErr.message, lang));
      if (exists) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInErr) {
          if (/not confirmed/i.test(signInErr.message)) return setStage("awaiting-email");
          return setError(t("This account already exists. Wrong password?", "Ce compte existe déjà. Mauvais mot de passe ?"));
        }
        await loadViewer();
        return;
      }
      if (data?.session) {
        await loadViewer();
        return;
      }
      setStage("awaiting-email");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setViewer("anonymous");
    setMissionStatus(null);
  };

  const handleField = (
    <label className="gp-field">
      {t("Your handle", "Ton pseudo")}
      <input
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        placeholder={t("@youraccount", "@toncompte")}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        inputMode="text"
      />
      <small>{t("The brand sees your profile and its stats.", "La marque voit ton profil et ses statistiques.")}</small>
    </label>
  );

  const platformPicker =
    platforms.length > 1 ? (
      <div className="gp-seg" role="radiogroup" aria-label={t("Main platform", "Plateforme principale")}>
        {platforms.map((p) => (
          <button key={p} type="button" role="radio" aria-checked={platform === p} className={platform === p ? "is-on" : ""} onClick={() => setPlatform(p)}>
            <PlatformLogo platform={p} size={18} /> {PLATFORM_LABEL[p]}
          </button>
        ))}
      </div>
    ) : null;

  const errorBox = error ? (
    <p className="gp-error" role="alert">
      {error}
    </p>
  ) : null;

  const statusCard = (status: string) => {
    const good = status === "invited" || ["accepted", "signed", "shipped", "delivered", "submitted", "approved"].includes(status);
    const title =
      status === "applied"
        ? t("Application sent", "Candidature envoyée")
        : status === "rejected"
          ? t("Not selected this time", "Candidature non retenue")
          : status === "declined"
            ? t("You declined this campaign", "Tu as refusé cette campagne")
            : status === "invited"
              ? t("You’re in!", "C’est validé !")
              : t("You’re on this campaign", "Tu participes à cette campagne");
    const body =
      status === "applied"
        ? t(`${brandName} reviews your profile. You’ll see the answer in your Missions tab.`, `${brandName} regarde ton profil. Tu verras la réponse dans ton onglet Missions.`)
        : status === "rejected"
          ? t(`${brandName} didn’t pick your profile for this campaign. Other brands will.`, `${brandName} n’a pas retenu ton profil pour cette campagne. D’autres marques le feront.`)
          : status === "declined"
            ? t("This mission is closed.", "Cette mission est fermée.")
            : status === "invited"
              ? t(`${brandName} sends you ${product}. Open your Missions tab to accept, sign and give your address.`, `${brandName} t’envoie ${product}. Ouvre ton onglet Missions pour accepter, signer et donner ton adresse.`)
              : t("Follow every step in your Missions tab.", "Suis chaque étape dans ton onglet Missions.");
    return (
      <div className="gp-panel gp-status" role="status">
        <span className={`gp-status__icon${good ? " is-good" : ""}`} aria-hidden>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            {status === "rejected" || status === "declined" ? <path d="M6 12h12" /> : status === "applied" ? <path d="M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z" /> : <path d="M5 12l5 5L19 7" />}
          </svg>
        </span>
        <h2>{title}</h2>
        <p>{body}</p>
        <a className="gp-btn" href={fr ? "/fr/dashboard" : "/dashboard"} style={{ marginTop: 6 }}>
          {t("Open my missions", "Voir mes missions")}
        </a>
      </div>
    );
  };

  const closedCard = (
    <div className="gp-panel gp-status">
      <h2>{t("Sign-ups are closed", "Inscriptions fermées")}</h2>
      <p>{t("This campaign no longer accepts creators.", "Cette campagne n’accepte plus de créateurs.")}</p>
    </div>
  );

  if (viewer === "loading") return open ? <div className="gp-panel"><div className="gp-skel" aria-hidden /></div> : closedCard;
  if (stage === "done" && missionStatus) return statusCard(missionStatus);
  if (viewer === "creator" && missionStatus) return statusCard(missionStatus);

  if (viewer === "owner") {
    return (
      <div className="gp-panel gp-status">
        <h2>{t("This is your campaign", "C’est votre campagne")}</h2>
        <p>{t("Creators see this page. Share the link; applications show up in Gifting.", "Les créateurs voient cette page. Partagez le lien : les candidatures arrivent dans Gifting.")}</p>
        <a className="gp-btn is-ghost" href={fr ? "/fr/dashboard?view=gifting" : "/dashboard?view=gifting"}>
          {t("Back to Gifting", "Retour au Gifting")}
        </a>
      </div>
    );
  }

  if (!open) return closedCard;

  if (stage === "awaiting-email") {
    return (
      <div className="gp-panel gp-status">
        <h2>{t("Check your inbox", "Vérifie ta boîte mail")}</h2>
        <p>
          {t(
            `We sent a confirmation link to ${email || "your email"}. Click it: you’ll come back here to finish your application.`,
            `On a envoyé un lien de confirmation à ${email || "ton email"}. Clique dessus : tu reviendras ici pour finir ta candidature.`,
          )}
        </p>
      </div>
    );
  }

  if (viewer === "brand") {
    return (
      <div className="gp-panel gp-status">
        <h2>{t("This link is for creators", "Ce lien est réservé aux créateurs")}</h2>
        <p>{t("You’re signed in with a brand account. Sign out to apply as a creator.", "Tu es connecté avec un compte marque. Déconnecte-toi pour postuler en tant que créateur.")}</p>
        <button type="button" className="gp-link" onClick={() => void signOut()}>
          {t("Sign out", "Se déconnecter")}
        </button>
      </div>
    );
  }

  if (viewer === "creator") {
    return (
      <form
        className="gp-panel"
        onSubmit={(e) => {
          e.preventDefault();
          void apply();
        }}
      >
        <h2>{t("Apply", "Je participe")}</h2>
        <p>{t(`Confirm your account and ${brandName} gets your application.`, `Confirme ton compte et ${brandName} reçoit ta candidature.`)}</p>
        {platformPicker}
        {handleField}
        <label className="gp-field">
          {t("A word for the brand (optional)", "Un mot pour la marque (facultatif)")}
          <textarea value={message} maxLength={GIFT_APPLICATION_MESSAGE_MAX} onChange={(e) => setMessage(e.target.value)} placeholder={t("Why this product suits you", "Pourquoi ce produit te correspond")} />
        </label>
        <label className="gp-check">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <span>
            {t(
              `I share my profile and stats with ${brandName}. If I’m picked, I sign the contract and give my delivery address.`,
              `Je partage mon profil et mes statistiques avec ${brandName}. Si je suis retenu, je signe le contrat et je donne mon adresse de livraison.`,
            )}
          </span>
        </label>
        {errorBox}
        <button type="submit" className="gp-btn" disabled={busy}>
          {busy ? t("Sending…", "Envoi…") : t("Send my application", "Envoyer ma candidature")}
        </button>
        <p className="gp-alt">
          <button type="button" className="gp-link" onClick={() => void signOut()}>
            {t("Not you? Sign out", "Ce n’est pas toi ? Se déconnecter")}
          </button>
        </p>
      </form>
    );
  }

  return (
    <form
      className="gp-panel"
      onSubmit={(e) => {
        e.preventDefault();
        void signUp();
      }}
    >
      <h2>{t("Apply", "Je participe")}</h2>
      <p>{t("Create your free creator account in a few seconds, then send your application.", "Crée ton compte créateur gratuit en quelques secondes, puis envoie ta candidature.")}</p>
      <label className="gp-field">
        {t("Full name", "Nom complet")}
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
      </label>
      {platformPicker}
      {handleField}
      <label className="gp-field">
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
      </label>
      <label className="gp-field">
        {t("Password", "Mot de passe")}
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </label>
      {errorBox}
      <button type="submit" className="gp-btn" disabled={busy}>
        {busy ? t("One moment…", "Un instant…") : t("Create my account", "Créer mon compte")}
      </button>
      <p className="gp-alt">
        {t("Already on Trackit?", "Déjà sur Trackit ?")}{" "}
        <a href={`${fr ? "/fr" : ""}/auth?redirectTo=${encodeURIComponent(path)}`}>{t("Log in", "Se connecter")}</a>
      </p>
      <p className="gp-note">
        {t(
          "Your application is only sent after you confirm your handle on the next step.",
          "Ta candidature n’est envoyée qu’après confirmation de ton pseudo à l’étape suivante.",
        )}
      </p>
    </form>
  );
}
