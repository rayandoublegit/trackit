"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { selectProfileRow } from "@/lib/profile-row";
import { useLang, useLocaleHref } from "@/lib/useLang";

function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useLang();
  const href = useLocaleHref();
  const fr = lang === "fr";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    if (!supabase) {
      setStatus("error");
      return;
    }

    const client = supabase;

    void (async () => {
      // Handle PKCE code exchange
      const code = searchParams.get("code");
      if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) {
          setStatus("error");
          return;
        }
        setStatus("success");
        const { data: { user } } = await client.auth.getUser();
        if (user) {
          const profile = await selectProfileRow<{ onboarding_completed?: boolean | null; account_type?: string | null }>(
            client,
            user.id,
            ["onboarding_completed", "account_type"]
          );
          if (profile && profile.account_type === "creator") {
            router.replace("/dashboard?view=analytics");
            return;
          }
          if (!profile || (profile.onboarding_completed !== true && user.user_metadata?.onboarding_completed !== true)) {
            router.replace("/onboarding");
          } else {
            router.replace("/dashboard");
          }
        }
        return;
      }

      // Handle token_hash flow
      const token_hash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      if (token_hash && type) {
        const { error } = await client.auth.verifyOtp({
          token_hash,
          type: type as EmailOtpType,
        });
        if (error) {
          setStatus("error");
          return;
        }
        setStatus("success");
        const { data: { user } } = await client.auth.getUser();
        if (user) {
          const profile = await selectProfileRow<{ onboarding_completed?: boolean | null; account_type?: string | null }>(
            client,
            user.id,
            ["onboarding_completed", "account_type"]
          );
          if (profile && profile.account_type === "creator") {
            router.replace("/dashboard?view=analytics");
            return;
          }
          if (!profile || (profile.onboarding_completed !== true && user.user_metadata?.onboarding_completed !== true)) {
            router.replace("/onboarding");
          } else {
            router.replace("/dashboard");
          }
        }
        return;
      }

      // Check existing session
      const {
        data: { session },
      } = await client.auth.getSession();
      if (session) {
        setStatus("success");
        const { data: { user } } = await client.auth.getUser();
        if (user) {
          const profile = await selectProfileRow<{ onboarding_completed?: boolean | null; account_type?: string | null }>(
            client,
            user.id,
            ["onboarding_completed", "account_type"]
          );
          if (profile && profile.account_type === "creator") {
            router.replace("/dashboard?view=analytics");
            return;
          }
          if (!profile || (profile.onboarding_completed !== true && user.user_metadata?.onboarding_completed !== true)) {
            router.replace("/onboarding");
          } else {
            router.replace("/dashboard");
          }
        }
        return;
      }

      setStatus("error");
    })();
  }, [router, searchParams]);

  if (status === "error") {
    return (
      <div style={{ background: "#000", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontFamily: "Inter, sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: 420, padding: "0 24px" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>❌</div>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 12 }}>
            {fr ? "La confirmation a échoué." : "Confirmation failed."}
          </div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 300, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, marginBottom: 24 }}>
            {fr ? "Le lien a peut-être expiré. Réessayez de vous inscrire." : "The link may have expired. Try signing up again."}
          </div>
          <button
            type="button"
            onClick={() => router.push(href("/auth"))}
            style={{ background: "#fff", color: "#000", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 15, fontWeight: 600, cursor: "pointer", width: "100%" }}
          >
            {fr ? "Retour à l’inscription" : "Back to Sign Up"}
          </button>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div style={{ background: "#000", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontFamily: "Inter, sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: 420, padding: "0 24px" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 12 }}>
            {fr ? "Email confirmé." : "Email confirmed."}
          </div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 300, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
            {fr ? "Vous pouvez fermer cet onglet et revenir là où vous vous êtes inscrit." : "You can close this tab and go back to where you signed up."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#000", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontFamily: "Inter, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <img src="/images/navbarlogo.png" alt="" style={{ width: 56, height: 56, borderRadius: "50%", marginBottom: 24 }} />
        <div style={{ fontSize: 18, fontWeight: 600 }}>{fr ? "Confirmation de votre compte..." : "Confirming your account..."}</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 8 }}>{fr ? "Veuillez patienter" : "Please wait"}</div>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  const lang = useLang();
  return (
    <Suspense fallback={
      <div style={{ background: "#000", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
        <div style={{ textAlign: "center", fontSize: 18 }}>{lang === "fr" ? "Chargement..." : "Loading..."}</div>
      </div>
    }>
      <ConfirmContent />
    </Suspense>
  );
}
