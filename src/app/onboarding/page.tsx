"use client";

import {
  selectionCardStyle,
  selectionTextMuted,
  selectionTextPrimary,
} from "@/lib/selection-card-styles";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import { PricingPlans } from "@/components/PricingPlans";
import {
  isSocialReferralSource,
  normalizeSocialHandle,
  referralDetailsFieldCopy,
  referralHandleFieldCopy,
  requiresReferralDetails,
  type ReferralSource,
} from "@/lib/referral-source";
import {
  fetchProfileUsernameAvailability,
  isValidProfileUsername,
  normalizeProfileUsername,
  profileUsernameSaveError,
  profileUsernameStatusColor,
  profileUsernameStatusMessage,
  type ProfileUsernameStatus,
} from "@/lib/profile-username";
import type { User } from "@supabase/supabase-js";

const TRACKIT_LOGO_URL = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

type Step = 1 | 2 | 3 | 4;
type BusinessType = "ecommerce" | "infopreneur" | "agency" | "other";
type Revenue = "starting" | "1k-10k" | "10k-50k" | "50k+";
type Source = ReferralSource;

const STEP_COPY = {
  1: {
    taglineFr: "Étape 1 · Profil",
    taglineEn: "Step 1 · Profile",
    titleFr: "Configurez votre profil",
    titleEn: "Set up your profile",
    subtitleFr: "Dites-nous qui vous êtes. C'est ce que les créateurs verront quand vous les contactez.",
    subtitleEn: "Tell us who you are. This is what creators will see when you reach out.",
  },
  2: {
    taglineFr: "Étape 2 · Activité",
    taglineEn: "Step 2 · Business",
    titleFr: "Parlez-nous de votre activité",
    titleEn: "Tell us about your business",
    subtitleFr: "Cela nous aide à personnaliser les suggestions de créateurs et les messages.",
    subtitleEn: "Helps us personalize creator suggestions and outreach.",
  },
  3: {
    taglineFr: "Étape 3 · Origine",
    taglineEn: "Step 3 · Source",
    titleFr: "Comment nous avez-vous connus ?",
    titleEn: "Where did you hear about us?",
    subtitleFr: "Un simple tap. Ça nous aide à savoir ce qui fonctionne.",
    subtitleEn: "One quick tap. Helps us know what's working.",
  },
} as const;

export default function OnboardingPage() {
  const lang = useLang();
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
  const [sourceHandle, setSourceHandle] = useState("");
  const [sourceDetails, setSourceDetails] = useState("");

  const [shopifyUrl, setShopifyUrl] = useState("");

  useEffect(() => {
    setSourceHandle("");
    setSourceDetails("");
  }, [source]);

  useEffect(() => {
    const s = supabase;
    if (!s) return;
    void s.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace("/auth"); return; }

      try {
        let profile: { onboarding_completed?: boolean } | null = null;
        for (let i = 0; i < 5; i++) {
          const { data } = await s
            .from("profiles")
            .select("onboarding_completed")
            .eq("id", user.id)
            .maybeSingle();
          if (data) { profile = data as { onboarding_completed?: boolean }; break; }
          await new Promise((res) => setTimeout(res, 600));
        }

        if (profile?.onboarding_completed) {
          router.replace("/dashboard");
          return;
        }

        if (user.user_metadata?.full_name) {
          setFullName(user.user_metadata.full_name);
        } else if (user.user_metadata?.name) {
          setFullName(user.user_metadata.name);
        }
      } catch {
        /* non-blocking */
      }

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
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [step]);

  useEffect(() => {
    if (!username) { setUsernameStatus("idle"); return; }
    const normalized = normalizeProfileUsername(username);
    if (!isValidProfileUsername(normalized)) { setUsernameStatus("invalid"); return; }
    setUsernameStatus("checking");
    const timer = setTimeout(async () => {
      const status = await fetchProfileUsernameAvailability(normalized);
      setUsernameStatus(status);
    }, 400);
    return () => clearTimeout(timer);
  }, [username]);

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
      if (!fullName.trim()) { setError(lang === "fr" ? "Veuillez entrer votre nom" : "Please enter your name"); return; }
      if (usernameStatus !== "available" && username !== "") { setError(lang === "fr" ? "Choisissez un nom d'utilisateur valide et disponible" : "Please choose a valid available username"); return; }
      if (!username.trim()) { setError(lang === "fr" ? "Choisissez un nom d'utilisateur" : "Please choose a username"); return; }
    }
    if (step === 2) {
      if (!businessName.trim() || !businessType || !niche.trim() || !revenue) { setError(lang === "fr" ? "Veuillez remplir tous les champs" : "Please complete all fields"); return; }
    }
    if (step === 3) {
      if (!source) { setError(lang === "fr" ? "Veuillez choisir une option" : "Please pick one"); return; }
      if (isSocialReferralSource(source) && !normalizeSocialHandle(sourceHandle)) {
        setError(lang === "fr" ? "Indiquez le @ ou pseudo du compte" : "Enter the account @ or username");
        return;
      }
      if (requiresReferralDetails(source) && !sourceDetails.trim()) {
        setError(lang === "fr" ? "Précisez comment vous nous avez connus" : "Tell us how you found us");
        return;
      }
      setStep(4);
      return;
    }
    setStep((s) => (s + 1) as Step);
  };

  const saveOnboardingProfile = async (): Promise<boolean> => {
    if (!user || !supabase) return false;
    setLoading(true);
    setError(null);
    try {
      let avatarUrl: string | null = null;
      if (avatarFile) avatarUrl = await uploadAvatar();
      if (avatarFile && !avatarUrl) return false;
      const { error: updateErr } = await supabase.from("profiles").upsert({
        id: user.id,
        email: user.email,
        full_name: fullName.trim(),
        username: normalizeProfileUsername(username),
        avatar_url: avatarUrl,
        business_name: businessName.trim(),
        business_type: businessType,
        niche: niche.trim(),
        revenue_range: revenue,
        referral_source: source,
        shopify_store_url: shopifyUrl.trim() || null,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (updateErr) {
        setError(profileUsernameSaveError(updateErr, lang));
        return false;
      }

      if (source) {
        const { error: referralErr } = await supabase.from("user_referral_attributions").upsert({
          user_id: user.id,
          source,
          social_handle: isSocialReferralSource(source) ? normalizeSocialHandle(sourceHandle) : null,
          details: !isSocialReferralSource(source) ? sourceDetails.trim() || null : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        if (referralErr) {
          setError(referralErr.message);
          return false;
        }
      }

      return true;
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteFree = async () => {
    const saved = await saveOnboardingProfile();
    if (!saved) return;
    router.replace("/dashboard");
  };

  if (!user) return <div style={{ minHeight: "100vh", background: "#FFFFFF" }} />;

  const stepCopy = STEP_COPY[step as 1 | 2 | 3];
  const containerMaxWidth = step === 4 ? 1180 : 720;

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "'InterDisplay', 'Inter Display', sans-serif", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 20px 64px" }}>
      <div style={{ width: "100%", maxWidth: containerMaxWidth }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 32, maxWidth: step === 4 ? 520 : 560, marginLeft: "auto", marginRight: "auto" }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 5,
                borderRadius: 999,
                background: step >= i ? "#0047FF" : "rgba(0, 71, 255, 0.12)",
                transition: "background 0.3s ease",
              }}
            />
          ))}
        </div>

        {step === 4 ? (
          <div style={{ paddingTop: 4 }}>
            <PricingPlans
              tagline={lang === "fr" ? "Étape 4 · Tarifs" : "Step 4 · Pricing"}
              title={lang === "fr" ? "Avant d'accéder à votre dashboard" : "Before you access your dashboard"}
              subtitle={
                lang === "fr"
                  ? "Choisissez un plan pour débloquer tout Trackit, ou continuez gratuitement — vous pourrez upgrader à tout moment."
                  : "Pick a plan to unlock all of Trackit, or continue for free — you can upgrade anytime."
              }
              showCurrentPlanBadge={false}
              freeCtaLabel={lang === "fr" ? "Je préfère rester en free" : "I'd rather stay free"}
              paidCtaLabel={lang === "fr" ? "Commencer" : "Get Started"}
              userId={user.id}
              userEmail={user.email ?? undefined}
              cancelUrl={typeof window !== "undefined" ? `${window.location.origin}/onboarding` : undefined}
              onStayFree={() => void handleCompleteFree()}
              onBeforeCheckout={saveOnboardingProfile}
            />
            {error && <OnboardingError message={error} />}
            {loading && (
              <p style={{ textAlign: "center", fontSize: 14, color: "#7A7A7A", marginTop: 16, letterSpacing: "-0.01em" }}>
                {lang === "fr" ? "Enregistrement…" : "Saving…"}
              </p>
            )}
          </div>
        ) : (
          <>
            <OnboardingStepHeader
              tagline={lang === "fr" ? stepCopy.taglineFr : stepCopy.taglineEn}
              title={lang === "fr" ? stepCopy.titleFr : stepCopy.titleEn}
              subtitle={lang === "fr" ? stepCopy.subtitleFr : stepCopy.subtitleEn}
            />

            <div style={formPanelStyle}>
              {step === 1 && (
                <>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
                    <input id="avatar-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} style={{ display: "none" }} />
                    <label htmlFor="avatar-input" style={avatarRingStyle}>
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle cx="12" cy="9" r="3.5" stroke="rgba(0,0,0,0.28)" strokeWidth="1.7" />
                          <path d="M5 20c0-3.5 3.5-6 7-6s7 2.5 7 6" stroke="rgba(0,0,0,0.28)" strokeWidth="1.7" strokeLinecap="round" />
                        </svg>
                      )}
                    </label>
                    <label htmlFor="avatar-input" style={avatarLabelStyle}>
                      {lang === "fr" ? "Ajouter une photo" : "Upload a photo"}
                    </label>
                  </div>
                  <Input label="Full name" labelFr="Nom complet" value={fullName} onChange={setFullName} placeholder="Jane Smith" placeholderFr="Jean Dupont" />
                  <UsernameInput value={username} onChange={setUsername} status={usernameStatus} />
                </>
              )}

              {step === 2 && (
                <>
                  <Input label="Business name" labelFr="Nom de votre entreprise" value={businessName} onChange={setBusinessName} placeholder="Acme Co." placeholderFr="Ma Boutique" />
                  <div style={{ marginBottom: 28 }}>
                    <FieldLabel>{lang === "fr" ? "Type d'activité" : "Business type"}</FieldLabel>
                    <div style={optionGridStyle}>
                      {[
                        { key: "ecommerce" as const, label: "Ecommerce store", labelFr: "Boutique e-commerce", desc: "Shopify, WooCommerce", descFr: "Shopify, WooCommerce" },
                        { key: "infopreneur" as const, label: "Infopreneur", labelFr: "Infopreneur", desc: "Courses, coaching", descFr: "Formations, coaching" },
                        { key: "agency" as const, label: "Agency", labelFr: "Agence", desc: "Client services", descFr: "Services clients" },
                        { key: "other" as const, label: "Other", labelFr: "Autre", desc: "Something else", descFr: "Autre chose" },
                      ].map((opt) => {
                        const active = businessType === opt.key;
                        return (
                          <button key={opt.key} type="button" onClick={() => setBusinessType(opt.key)} style={optionCardStyle(active)}>
                            <div style={{ fontSize: 16, fontWeight: 500, color: selectionTextPrimary(active), letterSpacing: "-0.025em", lineHeight: 1.3 }}>
                              {lang === "fr" ? opt.labelFr : opt.label}
                            </div>
                            <div style={{ fontSize: 13, color: selectionTextMuted(active), marginTop: 6, letterSpacing: "-0.02em", lineHeight: 1.4 }}>
                              {lang === "fr" ? opt.descFr : opt.desc}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <Input label="Your niche" labelFr="Votre niche" value={niche} onChange={setNiche} placeholder="Fashion, fitness, beauty, tech..." placeholderFr="Mode, fitness, beauté, tech..." />
                  <div style={{ marginBottom: 4 }}>
                    <FieldLabel>{lang === "fr" ? "Revenu mensuel" : "Monthly revenue"}</FieldLabel>
                    <div style={optionGridStyle}>
                      {[
                        { key: "starting" as const, label: "Just starting", labelFr: "Je débute" },
                        { key: "1k-10k" as const, label: "$1K – $10K", labelFr: "1K€ – 10K€" },
                        { key: "10k-50k" as const, label: "$10K – $50K", labelFr: "10K€ – 50K€" },
                        { key: "50k+" as const, label: "$50K+", labelFr: "50K€+" },
                      ].map((opt) => {
                        const active = revenue === opt.key;
                        return (
                          <button key={opt.key} type="button" onClick={() => setRevenue(opt.key)} style={optionCardStyle(active, { compact: true })}>
                            <div style={{ fontSize: 16, fontWeight: 500, color: selectionTextPrimary(active), letterSpacing: "-0.025em" }}>
                              {lang === "fr" ? opt.labelFr : opt.label}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div style={{ ...optionGridStyle, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                    {[
                      { key: "tiktok" as const, label: "TikTok", labelFr: "TikTok" },
                      { key: "instagram" as const, label: "Instagram", labelFr: "Instagram" },
                      { key: "twitter" as const, label: "X (Twitter)", labelFr: "X (Twitter)" },
                      { key: "reddit" as const, label: "Reddit", labelFr: "Reddit" },
                      { key: "friend" as const, label: "A friend", labelFr: "Un ami" },
                      { key: "google" as const, label: "Google", labelFr: "Google" },
                      { key: "other" as const, label: "Other", labelFr: "Autre" },
                    ].map((opt) => {
                      const active = source === opt.key;
                      return (
                        <button key={opt.key} type="button" onClick={() => setSource(opt.key)} style={optionCardStyle(active, { tall: true })}>
                          <div style={{ fontSize: 17, fontWeight: 500, color: selectionTextPrimary(active), letterSpacing: "-0.025em" }}>
                            {lang === "fr" ? opt.labelFr : opt.label}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {source && isSocialReferralSource(source) && (
                    <div style={{ marginTop: 28 }}>
                      <ReferralHandleInput
                        source={source}
                        value={sourceHandle}
                        onChange={setSourceHandle}
                      />
                    </div>
                  )}

                  {source && !isSocialReferralSource(source) && (
                    <div style={{ marginTop: 28 }}>
                      <ReferralDetailsInput
                        source={source}
                        value={sourceDetails}
                        onChange={setSourceDetails}
                      />
                    </div>
                  )}
                </>
              )}

              {error && <OnboardingError message={error} />}
            </div>

            <div style={{ maxWidth: 480, margin: "28px auto 0" }}>
              <button type="button" onClick={goNext} disabled={loading} style={primaryBtn}>
                {lang === "fr" ? "Continuer →" : "Continue →"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OnboardingStepHeader({ tagline, title, subtitle }: { tagline: string; title: string; subtitle: string }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 32 }}>
      <img src={TRACKIT_LOGO_URL} alt="Trackit" style={{ height: 72, width: "auto", margin: "0 auto 18px", display: "block" }} />
      <div className="tagline" style={{ justifyContent: "center", marginBottom: 8 }}>
        {tagline}
      </div>
      <h1 className="section-title" style={{ marginBottom: 10, letterSpacing: "-0.025em", fontSize: 34, lineHeight: 1.1 }}>
        {title}
      </h1>
      <p className="section-sub" style={{ maxWidth: 560, margin: "0 auto" }}>
        {subtitle}
      </p>
    </div>
  );
}

function OnboardingError({ message }: { message: string }) {
  return (
    <div style={{ fontSize: 14, color: "#ff6b6b", padding: "12px 16px", borderRadius: 14, background: "rgba(255,107,107,0.08)", marginTop: 20, textAlign: "center", letterSpacing: "-0.01em" }}>
      {message}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 12 }}>
      {children}
    </div>
  );
}

function Input({ label, labelFr, value, onChange, placeholder, placeholderFr }: { label: string; labelFr?: string; value: string; onChange: (v: string) => void; placeholder: string; placeholderFr?: string }) {
  const lang = useLang();
  return (
    <div style={{ marginBottom: 24 }}>
      <FieldLabel>{lang === "fr" && labelFr ? labelFr : label}</FieldLabel>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={lang === "fr" && placeholderFr ? placeholderFr : placeholder}
        style={inputStyle}
      />
    </div>
  );
}

function ReferralHandleInput({
  source,
  value,
  onChange,
}: {
  source: ReferralSource;
  value: string;
  onChange: (v: string) => void;
}) {
  const lang = useLang();
  const copy = referralHandleFieldCopy(source, lang);
  const showAtPrefix = source !== "reddit";

  return (
    <div>
      <FieldLabel>{copy.label}</FieldLabel>
      <div style={{ position: "relative" }}>
        {showAtPrefix && (
          <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "rgba(0,0,0,0.35)", fontSize: 16, letterSpacing: "-0.02em" }}>@</span>
        )}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={copy.placeholder}
          style={{ ...inputStyle, paddingLeft: showAtPrefix ? 40 : 16 }}
          autoComplete="off"
        />
      </div>
      {copy.hint && (
        <p style={{ fontSize: 13, color: "#7A7A7A", marginTop: 10, marginBottom: 0, letterSpacing: "-0.02em", lineHeight: 1.45 }}>
          {copy.hint}
        </p>
      )}
    </div>
  );
}

function ReferralDetailsInput({
  source,
  value,
  onChange,
}: {
  source: ReferralSource;
  value: string;
  onChange: (v: string) => void;
}) {
  const lang = useLang();
  const copy = referralDetailsFieldCopy(source, lang);

  return (
    <div>
      <FieldLabel>
        {copy.label}
        {!copy.required && (
          <span style={{ fontWeight: 400, color: "#9A9A9A" }}>
            {lang === "fr" ? " (optionnel)" : " (optional)"}
          </span>
        )}
      </FieldLabel>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={copy.placeholder}
        rows={4}
        style={textareaStyle}
      />
      {copy.hint && (
        <p style={{ fontSize: 13, color: "#7A7A7A", marginTop: 10, marginBottom: 0, letterSpacing: "-0.02em", lineHeight: 1.45 }}>
          {copy.hint}
        </p>
      )}
    </div>
  );
}

function UsernameInput({ value, onChange, status }: { value: string; onChange: (v: string) => void; status: string }) {
  const lang = useLang();
  const message = profileUsernameStatusMessage(status as ProfileUsernameStatus, lang);
  const color = profileUsernameStatusColor(status as ProfileUsernameStatus);
  return (
    <div style={{ marginBottom: 8 }}>
      <FieldLabel>{lang === "fr" ? "Nom d'utilisateur" : "Username"}</FieldLabel>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "rgba(0,0,0,0.35)", fontSize: 16, letterSpacing: "-0.02em" }}>@</span>
        <input type="text" value={value} onChange={(e) => onChange(e.target.value.toLowerCase())} placeholder={lang === "fr" ? "ton pseudo" : "yourname"} style={{ ...inputStyle, paddingLeft: 40 }} />
      </div>
      {message && <div style={{ fontSize: 13, color, marginTop: 10, letterSpacing: "-0.02em" }}>{message}</div>}
    </div>
  );
}

const formPanelStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid rgba(0, 0, 0, 0.08)",
  borderRadius: 24,
  padding: "36px 32px",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.04)",
  maxWidth: 640,
  margin: "0 auto",
};

const avatarRingStyle: React.CSSProperties = {
  width: 112,
  height: 112,
  borderRadius: "50%",
  border: "2px dashed rgba(0, 71, 255, 0.25)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  overflow: "hidden",
  background: "rgba(0, 71, 255, 0.04)",
  transition: "border-color 0.2s ease, background 0.2s ease",
};

const avatarLabelStyle: React.CSSProperties = {
  marginTop: 12,
  fontSize: 14,
  fontWeight: 500,
  color: "#0047FF",
  cursor: "pointer",
  letterSpacing: "-0.02em",
};

const optionGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#FFFFFF",
  border: "1px solid rgba(0, 0, 0, 0.1)",
  borderRadius: 14,
  padding: "14px 16px",
  fontSize: 16,
  fontFamily: "inherit",
  color: "#0A0A0A",
  letterSpacing: "-0.02em",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: 112,
  lineHeight: 1.5,
};

const primaryBtn: React.CSSProperties = {
  width: "100%",
  background: "#0047FF",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 14,
  padding: "16px 0",
  fontSize: 16,
  fontWeight: 500,
  letterSpacing: "-0.025em",
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 8px 24px rgba(0, 71, 255, 0.22)",
};

function optionCardStyle(active: boolean, options?: { compact?: boolean; tall?: boolean }): React.CSSProperties {
  return {
    ...selectionCardStyle(active, {
      unselectedBackground: "#FFFFFF",
      unselectedBorder: "1px solid rgba(0, 0, 0, 0.1)",
    }),
    borderRadius: 16,
    padding: options?.compact ? "18px 20px" : options?.tall ? "24px 22px" : "22px 20px",
    minHeight: options?.tall ? 80 : options?.compact ? 64 : 88,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
    transition: "all 0.18s ease",
    boxShadow: active ? "0 8px 24px rgba(0, 71, 255, 0.18)" : "0 2px 8px rgba(0, 0, 0, 0.03)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  };
}
