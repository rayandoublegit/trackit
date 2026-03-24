"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token_hash = searchParams.get("token_hash");
    const type = searchParams.get("type");

    if (!supabase) {
      router.push("/auth");
      return;
    }

    const client = supabase;

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

        const {
          data: { user },
        } = await client.auth.getUser();

        if (user) {
          const { data: profile } = await client
            .from("profiles")
            .select("plan")
            .eq("id", user.id)
            .maybeSingle();

          if (!profile) {
            await client.from("profiles").insert({
              id: user.id,
              username: user.email?.split("@")[0] ?? "founder",
              plan: "spark",
            });
            router.push("/pricing");
          } else {
            router.push("/dashboard");
          }
        } else {
          router.push("/auth");
        }
      })();
    } else {
      router.push("/auth");
    }
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
