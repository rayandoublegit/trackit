"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!supabase) {
      router.push("/auth");
      return;
    }

    const client = supabase;

    const token_hash = searchParams.get("token_hash");
    const type = searchParams.get("type");

    if (token_hash && type) {
      void (async () => {
        const { error } = await client.auth.verifyOtp({
          token_hash,
          type: type as EmailOtpType,
        });

        if (error) {
          router.push("/auth?error=confirmation_failed");
          return;
        }

        await client.auth.getUser();
        // Stay on success screen — the signup device handles the redirect
      })();
      return;
    }

    // Handle Supabase hash fragment (#access_token=...)
    const hash = window.location.hash;
    if (hash && hash.includes("access_token")) {
      void (async () => {
        const { error } = await client.auth.getSession();
        if (error) {
          router.push("/auth?error=confirmation_failed");
        }
        // Stay on success screen
      })();
      return;
    }

    // No token found — redirect to auth
    router.push("/auth");
  }, [router, searchParams]);

  return (
    <div
      style={{
        background: "#000",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420, padding: "0 24px" }}>
        <div
          style={{
            fontSize: 40,
            marginBottom: 16,
          }}
        >
          ✅
        </div>
        <div
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginBottom: 12,
          }}
        >
          Email confirmed.
        </div>
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 16,
            fontWeight: 300,
            color: "rgba(255,255,255,0.5)",
            lineHeight: 1.6,
          }}
        >
          You can close this tab and go back to where you signed up.
        </div>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            background: "#000",
            height: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontFamily: "Inter, sans-serif",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <img
              src="https://i.ibb.co/msYn5RH/navbarlogo.png"
              alt=""
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                marginBottom: "24px",
              }}
            />
            <div style={{ fontSize: "18px", fontWeight: 600 }}>
              Confirming your account...
            </div>
            <div
              style={{
                fontSize: "14px",
                color: "rgba(255,255,255,0.5)",
                marginTop: "8px",
              }}
            >
              Please wait
            </div>
          </div>
        </div>
      }
    >
      <ConfirmContent />
    </Suspense>
  );
}
