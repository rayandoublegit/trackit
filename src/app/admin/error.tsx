"use client";

import { useEffect } from "react";
import { useLang } from "@/lib/useLang";

// Catches a crash in any admin page. It renders inside the console shell, so the
// sidebar stays and the error is readable instead of an empty screen.
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const fr = useLang() === "fr";

  useEffect(() => {
    console.error("[admin] page crashed", error);
  }, [error]);

  return (
    <div className="tc-error tc-error--page" role="alert">
      <strong>{fr ? "Cette page a planté" : "This page crashed"}</strong>
      <p>{fr ? "Le reste de la console fonctionne. Détail de l’erreur :" : "The rest of the console still works. Error details:"}</p>
      <code className="tc-error__detail">
        {error.message || (fr ? "Erreur inconnue" : "Unknown error")}
        {error.digest ? ` · ${error.digest}` : ""}
      </code>
      <button type="button" className="tc-btn tc-btn--primary" onClick={() => retry()}>
        {fr ? "Réessayer" : "Try again"}
      </button>
    </div>
  );
}
