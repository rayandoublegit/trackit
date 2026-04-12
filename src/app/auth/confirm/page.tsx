"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    if (!supabase) {
      setStatus("error");
      return;
    }

    const client = supabase;

    // Handle implicit flow: tokens in URL hash
    if (typeof window !== "undefined" && window.location.hash) {
      const { error } = await client.auth.getSession();
      if (!error) {
        setStatus("success");
        router.replace("/dashboard");
        return;
      }
    }

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
        router.replace("/dashboard");
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
        router.replace("/dashboard");
        return;
      }

      // Check existing session
      const {
        data: { session },
      } = await client.auth.getSession();
      if (session) {
        setStatus("success");
        router.replace("/dashboard");
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
            Confirmation failed.
          </div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 300, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, marginBottom: 24 }}>
            The link may have expired. Try signing up again.
          </div>
          <button
            type="button"
            onClick={() => router.push("/auth")}
            style={{ background: "#fff", color: "#000", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 15, fontWeight: 600, cursor: "pointer", width: "100%" }}
          >
            Back to Sign Up
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
            Email confirmed.
          </div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 300, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
            You can close this tab and go back to where you signed up.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#000", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontFamily: "Inter, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <img src="/images/navbarlogo.png" alt="" style={{ width: 56, height: 56, borderRadius: "50%", marginBottom: 24 }} />
        <div style={{ fontSize: 18, fontWeight: 600 }}>Confirming your account...</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 8 }}>Please wait</div>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <div style={{ background: "#000", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
        <div style={{ textAlign: "center", fontSize: 18 }}>Loading...</div>
      </div>
    }>
      <ConfirmContent />
    </Suspense>
  );
}
