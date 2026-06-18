"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const TRACKIT_LOGO = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";
const BLUE = "#0047FF";

export default function CreatorSpace() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/auth"); return; }
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, account_type")
        .eq("id", user.id)
        .maybeSingle();
      // Si ce n'est pas un créateur, il n'a rien à faire ici.
      if (!profile || profile.account_type !== "creator") {
        router.replace("/dashboard");
        return;
      }
      setName(profile.full_name || "");
      setLoading(false);
    })();
  }, [router]);

  if (loading) {
    return <div style={{ minHeight: "100vh", background: "#FFFFFF" }} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "'InterDisplay', 'Inter Display', sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "56px 24px" }}>
      <img src={TRACKIT_LOGO} alt="Trackit" style={{ height: 30, marginBottom: 48 }} />
      <div style={{ width: "100%", maxWidth: 760 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.03em", marginBottom: 8 }}>
          Bonjour{name ? " " + name : ""} 👋
        </h1>
        <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", lineHeight: 1.5, marginBottom: 32 }}>
          Voici votre espace créateur. Vous y suivrez bientôt vos ventes, vos commissions et vos paiements en temps réel.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 24 }}>
            <div style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", marginBottom: 8 }}>Ventes générées</div>
            <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>—</div>
          </div>
          <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 24 }}>
            <div style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", marginBottom: 8 }}>Commissions à recevoir</div>
            <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", color: BLUE }}>—</div>
          </div>
        </div>
        <div style={{ border: "1px dashed rgba(0,0,0,0.15)", borderRadius: 16, padding: 24, textAlign: "center", color: "rgba(0,0,0,0.4)", fontSize: 14 }}>
          Le suivi détaillé de vos ventes arrive très bientôt.
        </div>
      </div>
    </div>
  );
}
