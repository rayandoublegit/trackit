"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";

function ConfirmContent() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div style={{ background: "#000", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontFamily: "Inter, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <img src="/images/navbarlogo.png" alt="" style={{ width: 56, height: 56, borderRadius: "50%", marginBottom: 24 }} />
        <div style={{ fontSize: 18, fontWeight: 600 }}>Connexion en cours...</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 8 }}>Redirection vers le dashboard</div>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <div style={{ background: "#000", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
        <div style={{ textAlign: "center", fontSize: 18 }}>Chargement...</div>
      </div>
    }>
      <ConfirmContent />
    </Suspense>
  );
}
