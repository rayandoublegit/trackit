"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type Step = 1 | 2 | 3 | 4 | 5;
type BusinessType = "ecommerce" | "infopreneur" | "agency" | "other";
type Revenue = "starting" | "1k-10k" | "10k-50k" | "50k+";
type Source = "tiktok" | "reddit" | "twitter" | "friend" | "google" | "other";

export default function OnboardingPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");

  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [niche, setNiche] = useState("");
  const [revenue, setRevenue] = useState<Revenue | null>(null);

  const [source, setSource] = useState<Source | null>(null);

  const [shopifyUrl, setShopifyUrl] = useState("");

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace("/auth"); return; }
      setUser(user);
      try {
        await fetch("/api/auth/record-login", { method: "POST", credentials: "include" });
      } catch {
        /* non-blocking */
      }
    });
  }, [router]);

  useEffect(() => {
    return () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); };
  }, [avatarPreview]);

  useEffect(() => {
    if (!username || !supabase) { setUsernameStatus("idle"); return; }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) { setUsernameStatus("invalid"); return; }
    setUsernameStatus("checking");
    const timer = setTimeout(async () => {
      const { data } = await supabase!.from("profiles").select("id").eq("username", username).neq("id", user?.id ?? "").maybeSingle();
      setUsernameStatus(data ? "taken" : "available");
    }, 400);
    return () => clearTimeout(timer);
  }, [username, user?.id]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    if (f.size > 2 * 1024 * 1024) { setError("Image must be under 2MB"); return; }
    setError(null);
    setAvatarFile(f);
    setAvatarPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
  };

  const uploadAvatar = async () => {
    if (!avatarFile || !user || !supabase) return null;
    const ext = avatarFile.name.split(".").pop() || "jpg";
    const path = `${user.id}/avatar.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });
    if (uploadErr) { setError(uploadErr.message); return null; }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    return pub.publicUrl;
  };

  const goNext = async () => {
    setError(null);
    if (step === 1) {
      if (!fullName.trim()) { setError("Please enter your name"); return; }
      if (usernameStatus !== "available" && username !== "") { setError("Please choose a valid available username"); return; }
      if (!username.trim()) { setError("Please choose a username"); return; }
    }
    if (step === 2) {
      if (!businessName.trim() || !businessType || !niche.trim() || !revenue) { setError("Please complete all fields"); return; }
    }
    if (step === 3) {
      if (!source) { setError("Please pick one"); return; }
    }
    setStep((s) => (s + 1) as Step);
  };

  const handleFinish = async () => {
    if (!user || !supabase) return;
    setLoading(true);
    setError(null);
    try {
      let avatarUrl: string | null = null;
      if (avatarFile) avatarUrl = await uploadAvatar();
      const { error: updateErr } = await supabase.from("profiles").update({
        full_name: fullName.trim(),
        username: username.trim(),
        avatar_url: avatarUrl,
        business_name: businessName.trim(),
        business_type: businessType,
        niche: niche.trim(),
        revenue_range: revenue,
        referral_source: source,
        shopify_store_url: shopifyUrl.trim() || null,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      }).eq("id", user.id);
      if (updateErr) { setError(updateErr.message); return; }
      setStep(5);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <div style={{ minHeight: "100vh", background: "#FFFFFF" }} />;

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "'InterDisplay', 'Inter Display', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
      <div style={{ width: "100%", maxWidth: 600 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 40 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: step >= i ? "#0047FF" : "rgba(0,0,0,0.08)", transition: "background 0.3s" }} />
          ))}
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 28, padding: "52px 44px" }}>
          {step === 1 && (
            <>
              <Header step={step} title="Set up your profile" subtitle="Tell us who you are. This is what creators will see when you reach out." />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 36 }}>
                <input id="avatar-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} style={{ display: "none" }} />
                <label htmlFor="avatar-input" style={{ width: 120, height: 120, borderRadius: "50%", border: "2px dashed rgba(0,0,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", background: "rgba(0,0,0,0.02)" }}>
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="9" r="3.5" stroke="rgba(0,0,0,0.3)" strokeWidth="1.7"/><path d="M5 20c0-3.5 3.5-6 7-6s7 2.5 7 6" stroke="rgba(0,0,0,0.3)" strokeWidth="1.7" strokeLinecap="round"/></svg>
                  )}
                </label>
                <label htmlFor="avatar-input" style={{ marginTop: 14, fontSize: 15, color: "rgba(0,0,0,0.45)", cursor: "pointer" }}>Upload a photo</label>
              </div>
              <Input label="Full name" value={fullName} onChange={setFullName} placeholder="Jane Smith" />
              <UsernameInput value={username} onChange={setUsername} status={usernameStatus} />
            </>
          )}

          {step === 2 && (
            <>
              <Header step={step} title="Tell us about your business" subtitle="Helps us personalize creator suggestions and outreach." />
              <Input label="Business name" value={businessName} onChange={setBusinessName} placeholder="Acme Co." />
              <div style={{ marginBottom: 28 }}>
                <Label>Business type</Label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    { key: "ecommerce" as const, label: "Ecommerce store", desc: "Shopify, WooCommerce" },
                    { key: "infopreneur" as const, label: "Infopreneur", desc: "Courses, coaching" },
                    { key: "agency" as const, label: "Agency", desc: "Client services" },
                    { key: "other" as const, label: "Other", desc: "Something else" },
                  ].map((opt) => (
                    <button key={opt.key} type="button" onClick={() => setBusinessType(opt.key)} style={cardStyle(businessType === opt.key)}>
                      <div style={{ fontSize: 16, fontWeight: 500, color: "#0A0A0A", letterSpacing: "-0.02em" }}>{opt.label}</div>
                      <div style={{ fontSize: 14, color: "rgba(0,0,0,0.5)", marginTop: 4 }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <Input label="Your niche" value={niche} onChange={setNiche} placeholder="Fashion, fitness, beauty, tech..." />
              <div style={{ marginBottom: 28 }}>
                <Label>Monthly revenue</Label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    { key: "starting" as const, label: "Just starting" },
                    { key: "1k-10k" as const, label: "$1K – $10K" },
                    { key: "10k-50k" as const, label: "$10K – $50K" },
                    { key: "50k+" as const, label: "$50K+" },
                  ].map((opt) => (
                    <button key={opt.key} type="button" onClick={() => setRevenue(opt.key)} style={cardStyle(revenue === opt.key)}>
                      <div style={{ fontSize: 16, fontWeight: 500, color: "#0A0A0A", letterSpacing: "-0.02em" }}>{opt.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <Header step={step} title="Where did you hear about us?" subtitle="One quick tap. Helps us know what's working." />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                {[
                  { key: "tiktok" as const, label: "TikTok" },
                  { key: "reddit" as const, label: "Reddit" },
                  { key: "twitter" as const, label: "X (Twitter)" },
                  { key: "friend" as const, label: "A friend" },
                  { key: "google" as const, label: "Google" },
                  { key: "other" as const, label: "Other" },
                ].map((opt) => (
                  <button key={opt.key} type="button" onClick={() => setSource(opt.key)} style={cardStyle(source === opt.key)}>
                    <div style={{ fontSize: 16, fontWeight: 500, color: "#0A0A0A", letterSpacing: "-0.02em" }}>{opt.label}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <Header step={step} title="Connect Shopify" subtitle="Connect your store to track sales and automate commission payouts. You can skip this and connect later." />
              <Input label="Your Shopify store URL" value={shopifyUrl} onChange={setShopifyUrl} placeholder="yourstore.myshopify.com" />
              <button type="button" onClick={handleFinish} disabled={loading} style={{ ...primaryBtn, marginTop: 8, background: "#95BF47" }}>
                {loading ? "Saving..." : "Connect Shopify →"}
              </button>
              <button type="button" onClick={() => { setShopifyUrl(""); void handleFinish(); }} disabled={loading} style={{ background: "transparent", color: "rgba(0,0,0,0.5)", border: "none", padding: "16px 0", fontSize: 16, fontFamily: "inherit", cursor: "pointer", width: "100%", marginTop: 10, letterSpacing: "-0.01em" }}>
                Skip for now →
              </button>
            </>
          )}

          {step === 5 && (
            <Done name={fullName} router={router} />
          )}

          {error && step !== 5 && (
            <div style={{ fontSize: 15, color: "#ff6b6b", padding: "14px 16px", borderRadius: 12, background: "rgba(255,107,107,0.08)", marginTop: 18 }}>{error}</div>
          )}

          {step !== 5 && step !== 4 && (
            <button type="button" onClick={goNext} disabled={loading} style={{ ...primaryBtn, marginTop: 20 }}>
              Continue →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Header({ step, title, subtitle }: { step: number; title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: "#0047FF", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>Step {step} of 5</div>
      <h1 style={{ fontSize: 32, fontWeight: 600, color: "#0A0A0A", letterSpacing: "-0.03em", margin: 0, marginBottom: 12 }}>{title}</h1>
      <p style={{ fontSize: 16, color: "rgba(0,0,0,0.5)", letterSpacing: "-0.01em", margin: 0, lineHeight: 1.55 }}>{subtitle}</p>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(0,0,0,0.7)", letterSpacing: "-0.01em", marginBottom: 10 }}>{children}</div>;
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <Label>{label}</Label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
    </div>
  );
}

function UsernameInput({ value, onChange, status }: { value: string; onChange: (v: string) => void; status: string }) {
  const message =
    status === "checking" ? "Checking..." :
    status === "available" ? "✓ Available" :
    status === "taken" ? "Username is taken" :
    status === "invalid" ? "3-20 characters, letters/numbers/underscores only" :
    "";
  const color =
    status === "available" ? "#1FB567" :
    status === "taken" || status === "invalid" ? "#ff6b6b" :
    "rgba(0,0,0,0.4)";
  return (
    <div style={{ marginBottom: 24 }}>
      <Label>Username</Label>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", color: "rgba(0,0,0,0.4)", fontSize: 17, letterSpacing: "-0.01em" }}>@</span>
        <input type="text" value={value} onChange={(e) => onChange(e.target.value.toLowerCase())} placeholder="yourname" style={{ ...inputStyle, paddingLeft: 36 }} />
      </div>
      {message && <div style={{ fontSize: 14, color, marginTop: 8, letterSpacing: "-0.01em" }}>{message}</div>}
    </div>
  );
}

function Done({ name, router }: { name: string; router: ReturnType<typeof useRouter> }) {
  useEffect(() => {
    const dots = document.querySelectorAll(".confetti-dot");
    dots.forEach((d, i) => {
      const el = d as HTMLElement;
      const angle = (i / dots.length) * Math.PI * 2;
      const distance = 120 + Math.random() * 80;
      el.style.transform = `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px)`;
      el.style.opacity = "0";
    });
  }, []);
  return (
    <div style={{ textAlign: "center", padding: "28px 0" }}>
      <div style={{ position: "relative", width: 96, height: 96, margin: "0 auto 36px" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#0047FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        {[...Array(14)].map((_, i) => {
          const colors = ["#0047FF", "#1FB567", "#FFD23F", "#FF6B2C", "#FF3D8B"];
          return <span key={i} className="confetti-dot" style={{ position: "absolute", top: "50%", left: "50%", width: 8, height: 8, borderRadius: 2, background: colors[i % colors.length], transform: "translate(-50%, -50%)", transition: "transform 1.2s cubic-bezier(0.2, 0.7, 0.3, 1), opacity 1.2s ease-out", transitionDelay: `${i * 30}ms` }} />;
        })}
      </div>
      <h1 style={{ fontSize: 34, fontWeight: 600, color: "#0A0A0A", letterSpacing: "-0.04em", margin: 0, marginBottom: 14 }}>You&apos;re all set{name ? `, ${name.split(" ")[0]}` : ""}!</h1>
      <p style={{ fontSize: 17, color: "rgba(0,0,0,0.5)", letterSpacing: "-0.01em", margin: 0, marginBottom: 32 }}>Time to find your first creators.</p>
      <button type="button" onClick={() => router.replace("/dashboard")} style={primaryBtn}>Start discovering creators →</button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 14, padding: "16px 18px", fontSize: 17, fontFamily: "inherit", color: "#0A0A0A",
  letterSpacing: "-0.01em", outline: "none", boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  width: "100%", background: "#0047FF", color: "#FFFFFF", border: "none", borderRadius: 14,
  padding: "18px 0", fontSize: 17, fontWeight: 500, letterSpacing: "-0.02em", cursor: "pointer",
  fontFamily: "inherit",
};

function cardStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "rgba(0,71,255,0.08)" : "#FFFFFF",
    border: active ? "1px solid #0047FF" : "1px solid rgba(0,0,0,0.1)",
    borderRadius: 14, padding: "18px 20px", cursor: "pointer", textAlign: "left",
    fontFamily: "inherit", transition: "all 0.15s ease",
  };
}
