"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function ResetContent() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async () => {
    if (!supabase) return;
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); setLoading(false); return; }
    setDone(true);
    setTimeout(() => router.replace("/dashboard"), 2000);
  };

  if (done) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", background: "#F7F7F5" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: "#1A1A1A" }}>Password updated!</h2>
        <p style={{ color: "#7A7A7A", fontSize: 14 }}>Redirecting to dashboard...</p>
      </div>
    </div>
  );

  if (!ready) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", background: "#F7F7F5" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#7A7A7A" }}>Verifying reset link...</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", background: "#F7F7F5" }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 40, width: "min(420px, 90vw)", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", margin: "0 0 6px", color: "#1A1A1A" }}>Set new password</h2>
        <p style={{ fontSize: 13, color: "#7A7A7A", margin: "0 0 24px" }}>Choose a strong password for your account.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="New password"
            type="password"
            style={{ width: "100%", padding: "10px 14px", border: "1px solid #E5E5E5", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          />
          <input
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            type="password"
            style={{ width: "100%", padding: "10px 14px", border: "1px solid #E5E5E5", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          />
          {error && <p style={{ color: "#dc2626", fontSize: 12, margin: 0 }}>{error}</p>}
          <button
            type="button"
            onClick={handleReset}
            disabled={!password || !confirm || loading}
            style={{ background: "#0047FF", color: "#fff", border: "none", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", marginTop: 4 }}
          >
            {loading ? "Updating..." : "Update password →"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ResetPage() {
  return <Suspense><ResetContent /></Suspense>;
}
