"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isValidProfileUsername, normalizeProfileUsername } from "@/lib/profile-username";

const TRACKIT_LOGO = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

export default function InvitePage() {
  const params = useParams();
  const token = (params?.token as string) || "";

  const [loading, setLoading] = useState(true);
  const [brandName, setBrandName] = useState("");
  const [inviteError, setInviteError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [socialHandle, setSocialHandle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setInviteError("Invalid link"); setLoading(false); return; }
    fetch(`/api/invites/accept?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setBrandName(data.brandName || "this brand");
        else setInviteError(data.error || "Invalid link");
      })
      .catch(() => setInviteError("Could not load the invitation"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleJoin = async () => {
    setFormError("");
    if (!supabase) { setFormError("Service unavailable"); return; }
    if (!email.trim() || !password) { setFormError("Enter your email and a password"); return; }
    if (!fullName.trim()) { setFormError("Enter your full name"); return; }
    const cleanHandle = normalizeProfileUsername(socialHandle);
    if (!cleanHandle) { setFormError("Enter your social handle"); return; }
    if (!isValidProfileUsername(cleanHandle)) {
      setFormError("Invalid handle: 3–20 characters, letters, numbers, and underscores only.");
      return;
    }
    setSubmitting(true);
    try {
      let userId = "";
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signUpErr && !signUpErr.message.toLowerCase().includes("already")) {
        setFormError(signUpErr.message); setSubmitting(false); return;
      }
      userId = signUpData?.user?.id || "";
      if (!userId) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(), password,
        });
        if (signInErr) { setFormError("This account already exists. Wrong password?"); setSubmitting(false); return; }
        userId = signInData?.user?.id || "";
      }
      if (!userId) { setFormError("Could not create the account"); setSubmitting(false); return; }

      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, creatorId: userId, fullName: fullName.trim(), socialHandle: cleanHandle }),
      });
      const data = await res.json();
      if (!data.ok) { setFormError(data.error || "Could not link your account"); setSubmitting(false); return; }

      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  return <InviteUI
    loading={loading} brandName={brandName} inviteError={inviteError}
    email={email} setEmail={setEmail} password={password} setPassword={setPassword}
    fullName={fullName} setFullName={setFullName} socialHandle={socialHandle} setSocialHandle={setSocialHandle}
    submitting={submitting} formError={formError} done={done} onJoin={handleJoin}
  />;
}

const BLUE = "#0047FF";

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 18 }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <span style={{ fontSize: 15, color: "rgba(255,255,255,0.92)", lineHeight: 1.45, letterSpacing: "-0.01em" }}>{children}</span>
    </div>
  );
}

function InviteUI(props: {
  loading: boolean; brandName: string; inviteError: string;
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  fullName: string; setFullName: (v: string) => void;
  socialHandle: string; setSocialHandle: (v: string) => void;
  submitting: boolean; formError: string; done: boolean; onJoin: () => void;
}) {
  const { loading, brandName, inviteError, email, setEmail, password, setPassword, fullName, setFullName, socialHandle, setSocialHandle, submitting, formError, done, onJoin } = props;
  const [showPassword, setShowPassword] = useState(false);

  const input: React.CSSProperties = {
    width: "100%", padding: "14px 15px", fontSize: 15, fontFamily: "inherit",
    border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, marginBottom: 12,
    outline: "none", boxSizing: "border-box", letterSpacing: "-0.01em", background: "#FAFAFA",
  };
  const btn: React.CSSProperties = {
    width: "100%", padding: "15px", fontSize: 15, fontWeight: 600, fontFamily: "inherit",
    color: "#FFFFFF", background: BLUE, border: "none", borderRadius: 12,
    cursor: submitting ? "default" : "pointer", letterSpacing: "-0.01em", opacity: submitting ? 0.6 : 1,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "'InterDisplay', 'Inter Display', sans-serif", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "56px 24px 24px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", width: "100%", maxWidth: 920, background: "#FFFFFF", borderRadius: 24, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,30,90,0.12)" }}>

        <div style={{ flex: "1 1 380px", background: `linear-gradient(160deg, ${BLUE} 0%, #0035C4 100%)`, padding: "48px 44px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 520 }}>
          <img src={TRACKIT_LOGO} alt="Trackit" style={{ height: 54, width: "auto", objectFit: "contain", alignSelf: "flex-start", filter: "brightness(0) invert(1)" }} />
          <div style={{ margin: "40px 0" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 14 }}>Creator invitation</div>
            <h1 style={{ fontSize: 30, fontWeight: 600, color: "#FFFFFF", letterSpacing: "-0.03em", lineHeight: 1.15, marginBottom: 28 }}>
              Track your sales and commissions in real time.
            </h1>
            <Bullet>See every sale you drive, the moment it happens</Bullet>
            <Bullet>Follow your earnings and payouts without asking</Bullet>
            <Bullet>Manage your payout details on your own</Bullet>
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", letterSpacing: "-0.01em" }}>Powered by Trackit</div>
        </div>

        <div style={{ flex: "1 1 380px", padding: "48px 44px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {loading ? (
            <div style={{ fontSize: 15, color: "rgba(0,0,0,0.4)" }}>Loading...</div>
          ) : inviteError ? (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 10 }}>Invalid link</h2>
              <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", lineHeight: 1.5 }}>
                This invitation is no longer valid or has expired. Ask the brand that invited you for a new link.
              </p>
            </div>
          ) : done ? (
            <div>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#E8F0FF", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke={BLUE} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <h2 style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 10 }}>You're connected to {brandName}</h2>
              <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", lineHeight: 1.5, marginBottom: 28 }}>
                Your sales and earnings are now waiting in your dashboard.
              </p>
              <a href="/dashboard" style={{ ...btn, display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
                Go to my dashboard →
              </a>
            </div>
          ) : (
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.025em", marginBottom: 8, lineHeight: 1.2 }}>
                {brandName} invited you to join them
              </h2>
              <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", lineHeight: 1.5, marginBottom: 28 }}>
                Create your free account in seconds.
              </p>
              <input type="text" placeholder="Your full name" value={fullName} onChange={(e) => setFullName(e.target.value)} style={input} autoComplete="name" />
              <input type="text" placeholder="Your handle (e.g. myaccount)" value={socialHandle} onChange={(e) => setSocialHandle(e.target.value)} style={input} autoComplete="off" />
              <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", margin: "-4px 0 12px", lineHeight: 1.45 }}>
                Use the same handle as on TikTok / Instagram — the brand will find you by this name.
              </p>
              <input type="email" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} style={input} autoComplete="email" />
              <div style={{ position: "relative" }}>
                <input type={showPassword ? "text" : "password"} placeholder="Choose a password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...input, paddingRight: 46 }} autoComplete="new-password" onKeyDown={(e) => { if (e.key === "Enter") onJoin(); }} />
                <button type="button" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? "Hide password" : "Show password"} style={{ position: "absolute", right: 12, top: 14, background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "rgba(0,0,0,0.4)", display: "flex" }}>
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/></svg>
                  )}
                </button>
              </div>
              {formError && (
                <div style={{ fontSize: 14, color: "#992323", padding: "10px 12px", borderRadius: 10, background: "rgba(153,35,35,0.06)", marginBottom: 12 }}>{formError}</div>
              )}
              <button type="button" onClick={onJoin} disabled={submitting} style={btn}>
                {submitting ? "Creating..." : "Join " + brandName + " →"}
              </button>
              <p style={{ fontSize: 12, color: "rgba(0,0,0,0.35)", marginTop: 16, lineHeight: 1.5 }}>
                By continuing, you agree to share your contact details with {brandName} to track your commissions.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
