"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";

type Status = "signed-out" | "denied" | "unavailable";

const SIGN_IN = "/auth?redirectTo=/admin";

/** Shown instead of the console when the visitor is not staff. Rendered on the server. */
export function AdminGate({ status, email }: { status: Status; email?: string }) {
  const fr = useLang() === "fr";
  const [leaving, setLeaving] = useState(false);

  // The sign-in page sends signed-in visitors to the dashboard, so switching
  // accounts means signing out first.
  const switchAccount = async () => {
    setLeaving(true);
    await supabase?.auth.signOut().catch(() => undefined);
    window.location.assign(SIGN_IN);
  };

  return (
    <div className="ad-gate">
      <div className="ad-gate__box">
        <span className="ad-gate__lock" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 118 0v4" />
          </svg>
        </span>

        {status === "signed-out" ? (
          <>
            <h1>{fr ? "Connectez-vous" : "Sign in"}</h1>
            <p>{fr ? "Cet espace est réservé à l’équipe. Connectez-vous avec un compte admin." : "This area is for the team. Sign in with an admin account."}</p>
            <a className="ad-btn ad-btn--primary ad-btn--block" href={SIGN_IN}>
              {fr ? "Se connecter" : "Sign in"}
            </a>
          </>
        ) : null}

        {status === "denied" ? (
          <>
            <h1>{fr ? "Ce compte n’est pas admin" : "This account is not an admin"}</h1>
            <p>{fr ? "Vous êtes connecté avec :" : "You are signed in as:"}</p>
            <code className="ad-gate__email">{email}</code>
            <p>
              {fr
                ? "Ajoutez cette adresse à ADMIN_EMAILS ou donnez-lui le rôle admin dans profiles, ou changez de compte."
                : "Add this address to ADMIN_EMAILS or give it the admin role in profiles, or switch accounts."}
            </p>
            <button type="button" className="ad-btn ad-btn--primary ad-btn--block" onClick={switchAccount} disabled={leaving}>
              {fr ? "Changer de compte" : "Switch account"}
            </button>
            <a className="ad-btn ad-btn--ghost ad-btn--block" href="/dashboard">
              {fr ? "Retour à l’app" : "Back to the app"}
            </a>
          </>
        ) : null}

        {status === "unavailable" ? (
          <>
            <h1>{fr ? "Vérification impossible" : "Could not check access"}</h1>
            <p>
              {fr
                ? "Le serveur n’a pas pu vérifier votre accès (Supabase indisponible ou mal configuré). Réessayez dans un instant."
                : "The server could not check your access (Supabase is down or not configured). Try again in a moment."}
            </p>
            <button type="button" className="ad-btn ad-btn--primary ad-btn--block" onClick={() => window.location.reload()}>
              {fr ? "Réessayer" : "Try again"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
