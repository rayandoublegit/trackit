"use client";

import { useCallback, useEffect, useState } from "react";
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
  profileUsernameStatusColor,
  profileUsernameStatusMessage,
  type ProfileUsernameStatus,
} from "@/lib/profile-username";
import type { OnboardingSavePayload } from "@/lib/onboarding-save";
import {
  buildBootstrapFromOnboarding,
  writeDashboardBootstrap,
} from "@/lib/dashboard-bootstrap-cache";
import {
  clearOnboardingDraft,
  onboardingStepFromUrl,
  readOnboardingDraft,
  writeOnboardingDraft,
  type OnboardingDraft,
  type OnboardingDraftStep,
} from "@/lib/onboarding-draft";
import type { User } from "@supabase/supabase-js";

const TRACKIT_LOGO_URL = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

type Step = 1 | 2 | 3 | 4;
type BusinessType = "ecommerce" | "infopreneur" | "agency" | "other";
type Revenue = "starting" | "1k-10k" | "10k-50k" | "50k+";
type Source = ReferralSource;

const STEPS = [
  { id: 1 as const, labelFr: "Infos perso", labelEn: "Personal Info" },
  { id: 2 as const, labelFr: "Type de compte", labelEn: "Account Type" },
  { id: 3 as const, labelFr: "Origine", labelEn: "How you found us" },
  { id: 4 as const, labelFr: "Choisir une offre", labelEn: "Choose a Plan" },
];

const STEP_COPY = {
  1: {
    titleFr: "Configurez votre profil",
    titleEn: "Set up your profile",
    subFr: "Infos personnelles",
    subEn: "Personal info",
  },
  2: {
    titleFr: "Vous inscrivez-vous en tant que marque ?",
    titleEn: "Tell us about your business",
    subFr: "Choisissez le type de compte",
    subEn: "Choose account type",
  },
  3: {
    titleFr: "Comment nous avez-vous connus ?",
    titleEn: "Where did you hear about us?",
    subFr: "Choisissez une option",
    subEn: "Choose one",
  },
} as const;

const BUSINESS_TYPES = [
  { key: "ecommerce" as const, label: "Ecommerce store", labelFr: "Boutique e-commerce", desc: "Shopify, WooCommerce", descFr: "Shopify, WooCommerce" },
  { key: "infopreneur" as const, label: "Infopreneur", labelFr: "Infopreneur", desc: "Courses, coaching", descFr: "Formations, coaching" },
  { key: "agency" as const, label: "Agency", labelFr: "Agence", desc: "Client services", descFr: "Services clients" },
  { key: "other" as const, label: "Other", labelFr: "Autre", desc: "Something else", descFr: "Autre chose" },
];

const REVENUES = [
  { key: "starting" as const, label: "Just starting", labelFr: "Je débute" },
  { key: "1k-10k" as const, label: "$1K – $10K", labelFr: "1K€ – 10K€" },
  { key: "10k-50k" as const, label: "$10K – $50K", labelFr: "10K€ – 50K€" },
  { key: "50k+" as const, label: "$50K+", labelFr: "50K€+" },
];

const SOURCES = [
  { key: "tiktok" as const, label: "TikTok", labelFr: "TikTok" },
  { key: "instagram" as const, label: "Instagram", labelFr: "Instagram" },
  { key: "twitter" as const, label: "X (Twitter)", labelFr: "X (Twitter)" },
  { key: "reddit" as const, label: "Reddit", labelFr: "Reddit" },
  { key: "friend" as const, label: "A friend", labelFr: "Un ami" },
  { key: "google" as const, label: "Google", labelFr: "Google" },
  { key: "other" as const, label: "Other", labelFr: "Autre" },
];

export default function OnboardingPage() {
  const lang = useLang();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);
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

  const applyOnboardingDraft = useCallback((draft: OnboardingDraft) => {
    setFullName(draft.fullName);
    setUsername(draft.username);
    if (draft.avatarPreviewUrl) setAvatarPreview(draft.avatarPreviewUrl);
    setBusinessName(draft.businessName);
    setBusinessType(draft.businessType);
    setNiche(draft.niche);
    setRevenue(draft.revenue);
    setSource(draft.source);
    setSourceHandle(draft.sourceHandle);
    setSourceDetails(draft.sourceDetails);
    setShopifyUrl(draft.shopifyUrl);
  }, []);

  const persistOnboardingDraft = useCallback(
    (nextStep: OnboardingDraftStep = step) => {
      if (!user) return;
      writeOnboardingDraft({
        userId: user.id,
        step: nextStep,
        fullName,
        username,
        avatarPreviewUrl: avatarPreview,
        businessName,
        businessType,
        niche,
        revenue,
        source,
        sourceHandle,
        sourceDetails,
        shopifyUrl,
      });
    },
    [
      user,
      step,
      fullName,
      username,
      avatarPreview,
      businessName,
      businessType,
      niche,
      revenue,
      source,
      sourceHandle,
      sourceDetails,
      shopifyUrl,
    ]
  );

  useEffect(() => {
    const s = supabase;
    if (!s) return;
    void s.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace("/auth?mode=signup"); return; }

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
          clearOnboardingDraft();
          router.replace("/dashboard");
          return;
        }

        const draft = readOnboardingDraft(user.id);
        if (draft) applyOnboardingDraft(draft);

        const urlStep = onboardingStepFromUrl();
        const resumeStep = (urlStep ?? draft?.step ?? 1) as Step;
        setStep(resumeStep);

        if (urlStep && typeof window !== "undefined") {
          window.history.replaceState({}, "", "/onboarding");
        }

        if (user.user_metadata?.full_name && !draft?.fullName) {
          setFullName(user.user_metadata.full_name);
        } else if (user.user_metadata?.name && !draft?.fullName) {
          setFullName(user.user_metadata.name);
        }
      } catch {
        /* non-blocking */
      }

      setUser(user);
      setHydrated(true);
      try {
        await fetch("/api/auth/record-login", { method: "POST", credentials: "include" });
      } catch {
        /* non-blocking */
      }
    });
  }, [router, applyOnboardingDraft]);

  useEffect(() => {
    if (!user || !hydrated) return;
    persistOnboardingDraft();
  }, [user, hydrated, persistOnboardingDraft]);

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

  useEffect(() => {
    return () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); };
  }, [avatarPreview]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [step]);

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
      persistOnboardingDraft(4);
      return;
    }
    const nextStep = (step + 1) as Step;
    setStep(nextStep);
    persistOnboardingDraft(nextStep);
  };

  const buildOnboardingPayload = async (): Promise<OnboardingSavePayload | null> => {
    if (!user) return null;
    setError(null);
    persistOnboardingDraft(4);
    let avatarUrl: string | null = null;
    if (avatarFile) {
      avatarUrl = await uploadAvatar();
      if (!avatarUrl) return null;
    }
    if (!businessType || !revenue || !source) {
      setError(lang === "fr" ? "Profil incomplet" : "Incomplete profile");
      return null;
    }
    return {
      fullName: fullName.trim(),
      username: normalizeProfileUsername(username),
      avatarUrl,
      businessName: businessName.trim(),
      businessType,
      niche: niche.trim(),
      revenueRange: revenue,
      referralSource: source,
      referralSocialHandle: isSocialReferralSource(source) ? normalizeSocialHandle(sourceHandle) : null,
      referralDetails: !isSocialReferralSource(source) ? sourceDetails.trim() || null : null,
      shopifyStoreUrl: shopifyUrl.trim() || null,
    };
  };

  const saveOnboardingProfile = async (): Promise<OnboardingSavePayload | null> => {
    if (!user) return null;
    setLoading(true);
    setError(null);
    try {
      const payload = await buildOnboardingPayload();
      if (!payload) return null;
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? (lang === "fr" ? "Impossible d'enregistrer le profil." : "Could not save profile."));
        return null;
      }
      return payload;
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteFree = async () => {
    if (!user) return;
    const payload = await saveOnboardingProfile();
    if (!payload) return;
    writeDashboardBootstrap(buildBootstrapFromOnboarding(user, payload));
    clearOnboardingDraft();
    router.replace("/dashboard");
  };

  if (!user || !hydrated) return <div className="ob-page" />;

  const stepCopy = STEP_COPY[step as 1 | 2 | 3];
  const initial = (fullName.trim()[0] || user.email?.[0] || "T").toUpperCase();

  return (
    <div className="ob-page">
      <header className="ob-header">
        <a href="/" className="ob-logo">
          <img src={TRACKIT_LOGO_URL} alt="Trackit" />
        </a>
        <button type="button" className="ob-avatar" onClick={() => setStep(1)} aria-label="Profile">
          {avatarPreview ? <img src={avatarPreview} alt="" /> : <span>{initial}</span>}
        </button>
      </header>

      <aside className="ob-sidebar">
        <p className="ob-sidebar__kicker">{lang === "fr" ? "Configuration" : "Account Setup"}</p>
        <ol className="ob-steps">
          {STEPS.map((item) => {
            const state = step > item.id ? "done" : step === item.id ? "current" : "todo";
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`ob-step${state === "done" ? " is-done" : ""}${state === "current" ? " is-current" : ""}`}
                  onClick={() => {
                    if (state === "done") setStep(item.id);
                  }}
                >
                  <span className="ob-step__icon">
                    {state === "done" ? (
                      <span className="ob-step__check">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      </span>
                    ) : state === "current" ? (
                      <svg className="ob-step__spin" width="22" height="22" viewBox="0 0 22 22" fill="none">
                        <circle cx="11" cy="11" r="8" stroke="#dbe4ff" strokeWidth="2.4" />
                        <path d="M11 3a8 8 0 018 8" stroke="#0047ff" strokeWidth="2.4" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <span className="ob-step__num">{item.id}</span>
                    )}
                  </span>
                  <span className="ob-step__label">{lang === "fr" ? item.labelFr : item.labelEn}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      <main className={`ob-main${step === 4 ? " is-wide" : ""}`}>
        {step === 4 ? (
          <>
            <PricingPlans
              tagline={lang === "fr" ? "Étape 4 · Tarifs" : "Step 4 · Pricing"}
              title={lang === "fr" ? "Avant d'accéder à votre dashboard" : "Before you access your dashboard"}
              subtitle={
                lang === "fr"
                  ? "Choisissez un plan pour débloquer tout Trackit — vous pourrez upgrader à tout moment."
                  : "Pick a plan to unlock all of Trackit — you can upgrade anytime."
              }
              showCurrentPlanBadge={false}
              showLogo={false}
              paidCtaLabel={lang === "fr" ? "Commencer" : "Get Started"}
              userId={user.id}
              userEmail={user.email ?? undefined}
              cancelUrl={
                typeof window !== "undefined"
                  ? `${window.location.origin}/onboarding?step=4`
                  : undefined
              }
              onStayFree={() => void handleCompleteFree()}
              stayFreeLabel={lang === "fr" ? "Je préfère rester en free" : "I'd rather stay free"}
              getOnboardingPayload={buildOnboardingPayload}
            />
            {error ? <p className="ob-error">{error}</p> : null}
            {loading ? <p className="ob-saving">{lang === "fr" ? "Enregistrement…" : "Saving…"}</p> : null}
          </>
        ) : (
          <>
            <h1 className="ob-title">{lang === "fr" ? stepCopy.titleFr : stepCopy.titleEn}</h1>
            <p className="ob-sub">{lang === "fr" ? stepCopy.subFr : stepCopy.subEn}</p>

            {step === 1 && (
              <>
                <div className="ob-photo">
                  <input id="avatar-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} hidden />
                  <label htmlFor="avatar-input" className="ob-photo__ring">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="" />
                    ) : (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="9" r="3.5" stroke="#a1a1aa" strokeWidth="1.7" />
                        <path d="M5 20c0-3.5 3.5-6 7-6s7 2.5 7 6" stroke="#a1a1aa" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                    )}
                  </label>
                  <label htmlFor="avatar-input" className="ob-photo__add">
                    {lang === "fr" ? "Ajouter une photo" : "Upload a photo"}
                  </label>
                </div>
                <Field
                  label={lang === "fr" ? "Nom complet" : "Full name"}
                  value={fullName}
                  onChange={setFullName}
                  placeholder={lang === "fr" ? "Jean Dupont" : "Jane Smith"}
                />
                <UsernameField value={username} onChange={setUsername} status={usernameStatus} />
              </>
            )}

            {step === 2 && (
              <>
                <Field
                  label={lang === "fr" ? "Nom de votre entreprise" : "Business name"}
                  value={businessName}
                  onChange={setBusinessName}
                  placeholder={lang === "fr" ? "Ma Boutique" : "Acme Co."}
                />
                <ChoiceList
                  items={BUSINESS_TYPES.map((opt) => ({
                    key: opt.key,
                    title: lang === "fr" ? opt.labelFr : opt.label,
                    desc: lang === "fr" ? opt.descFr : opt.desc,
                  }))}
                  value={businessType}
                  onChange={setBusinessType}
                />
                <Field
                  label={lang === "fr" ? "Votre niche" : "Your niche"}
                  value={niche}
                  onChange={setNiche}
                  placeholder={lang === "fr" ? "Mode, fitness, beauté, tech..." : "Fashion, fitness, beauty, tech..."}
                />
                <p className="ob-label">{lang === "fr" ? "Revenu mensuel" : "Monthly revenue"}</p>
                <ChoiceList
                  items={REVENUES.map((opt) => ({
                    key: opt.key,
                    title: lang === "fr" ? opt.labelFr : opt.label,
                  }))}
                  value={revenue}
                  onChange={setRevenue}
                />
              </>
            )}

            {step === 3 && (
              <>
                <ChoiceList
                  items={SOURCES.map((opt) => ({
                    key: opt.key,
                    title: lang === "fr" ? opt.labelFr : opt.label,
                  }))}
                  value={source}
                  onChange={setSource}
                />
                {source && isSocialReferralSource(source) ? (
                  <ReferralHandleField source={source} value={sourceHandle} onChange={setSourceHandle} />
                ) : null}
                {source && !isSocialReferralSource(source) ? (
                  <ReferralDetailsField source={source} value={sourceDetails} onChange={setSourceDetails} />
                ) : null}
              </>
            )}

            {error ? <p className="ob-error">{error}</p> : null}

            <button type="button" className="ob-continue" onClick={() => void goNext()} disabled={loading}>
              {lang === "fr" ? "Continuer" : "Continue"}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </>
        )}
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="ob-field">
      <label>{label}</label>
      <input className="ob-input" type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function ChoiceList<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { key: T; title: string; desc?: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="ob-choices">
      {items.map((item) => {
        const on = value === item.key;
        return (
          <button key={item.key} type="button" className={`ob-choice${on ? " is-on" : ""}`} onClick={() => onChange(item.key)}>
            <span className="ob-radio" />
            <span>
              <span className="ob-choice__title">{item.title}</span>
              {item.desc ? <span className="ob-choice__desc">{item.desc}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function UsernameField({
  value,
  onChange,
  status,
}: {
  value: string;
  onChange: (v: string) => void;
  status: string;
}) {
  const lang = useLang();
  const message = profileUsernameStatusMessage(status as ProfileUsernameStatus, lang);
  const color = profileUsernameStatusColor(status as ProfileUsernameStatus);
  return (
    <div className="ob-field">
      <label>{lang === "fr" ? "Nom d'utilisateur" : "Username"}</label>
      <div className="ob-input-wrap">
        <span className="ob-prefix">@</span>
        <input
          className="ob-input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          placeholder={lang === "fr" ? "ton pseudo" : "yourname"}
        />
      </div>
      {message ? <p className="ob-hint" style={{ color }}>{message}</p> : null}
    </div>
  );
}

function ReferralHandleField({
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
    <div className="ob-field">
      <label>{copy.label}</label>
      <div className={showAtPrefix ? "ob-input-wrap" : undefined}>
        {showAtPrefix ? <span className="ob-prefix">@</span> : null}
        <input className="ob-input" type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={copy.placeholder} autoComplete="off" />
      </div>
      {copy.hint ? <p className="ob-hint">{copy.hint}</p> : null}
    </div>
  );
}

function ReferralDetailsField({
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
    <div className="ob-field">
      <label>
        {copy.label}
        {!copy.required ? (
          <span style={{ fontWeight: 400, color: "#9A9A9A" }}>
            {lang === "fr" ? " (optionnel)" : " (optional)"}
          </span>
        ) : null}
      </label>
      <textarea className="ob-textarea" value={value} onChange={(e) => onChange(e.target.value)} placeholder={copy.placeholder} rows={4} />
      {copy.hint ? <p className="ob-hint">{copy.hint}</p> : null}
    </div>
  );
}
