"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";
import { formatCurrency } from "@/lib/useCurrency";
import {
  getGrowthPriceId,
  getProPriceId,
  getScalePriceId,
  handleUpgrade,
} from "@/lib/checkout";
import type { User } from "@supabase/supabase-js";

type Step = 1 | 2 | 3 | 4 | 5;
type BusinessType = "ecommerce" | "infopreneur" | "agency" | "other";
type Revenue = "starting" | "1k-10k" | "10k-50k" | "50k+";
type Source = "tiktok" | "reddit" | "twitter" | "friend" | "google" | "other";

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

  const [shopifyUrl, setShopifyUrl] = useState("");

  useEffect(() => {
    const s = supabase;
    if (!s) return;
    void s.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace("/auth"); return; }

      try {
        // Wait for profile to be created by trigger (race condition on OAuth signup)
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

        // If onboarding is already complete, don't show the onboarding flow again.
        if (profile?.onboarding_completed) {
          router.replace("/dashboard");
          return;
        }

        // Pre-fill name from Google/OAuth metadata
        if (user.user_metadata?.full_name) {
          setFullName(user.user_metadata.full_name);
        } else if (user.user_metadata?.name) {
          setFullName(user.user_metadata.name);
        }
      } catch {
        // Non-blocking: if this fails, we still allow onboarding to render.
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
      if (!fullName.trim()) { setError(lang === "fr" ? "Veuillez entrer votre nom" : "Please enter your name"); return; }
      if (usernameStatus !== "available" && username !== "") { setError(lang === "fr" ? "Choisissez un nom d'utilisateur valide et disponible" : "Please choose a valid available username"); return; }
      if (!username.trim()) { setError(lang === "fr" ? "Choisissez un nom d'utilisateur" : "Please choose a username"); return; }
    }
    if (step === 2) {
      if (!businessName.trim() || !businessType || !niche.trim() || !revenue) { setError(lang === "fr" ? "Veuillez remplir tous les champs" : "Please complete all fields"); return; }
    }
    if (step === 3) {
      if (!source) { setError(lang === "fr" ? "Veuillez choisir une option" : "Please pick one"); return; }
      // Last step now: finish onboarding directly (Shopify step removed).
      await handleFinish();
      return;
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
      const { error: updateErr } = await supabase.from("profiles").upsert({
        id: user.id,
        email: user.email,
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
      }, { onConflict: "id" });
      if (updateErr) { setError(updateErr.message); return; }
      setStep(5);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <div style={{ minHeight: "100vh", background: "#FFFFFF" }} />;

  const cardShellStyle: React.CSSProperties = {
    background: "#FFFFFF",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 20,
    padding: "32px 28px",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "'InterDisplay', 'Inter Display', sans-serif", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "8px 24px 48px" }}>
      <div style={{ width: "100%", maxWidth: step === 5 ? 1100 : 440 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 24, maxWidth: 440, marginLeft: step === 5 ? "auto" : undefined, marginRight: step === 5 ? "auto" : undefined }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: step >= i ? "#0047FF" : "rgba(0,0,0,0.08)", transition: "background 0.3s" }} />
          ))}
        </div>

        {step === 5 ? (
          <>
            <div style={{ ...cardShellStyle, maxWidth: 440, margin: "0 auto" }}>
              <Done name={fullName} router={router} />
            </div>
            <OnboardingPricingReminder />
          </>
        ) : (
        <div style={cardShellStyle}>
          {step === 1 && (
            <>
              <Header step={step} title="Set up your profile" subtitle="Tell us who you are. This is what creators will see when you reach out." titleFr="Configurez votre profil" subtitleFr="Dites-nous qui vous êtes. C'est ce que les créateurs verront quand vous les contactez." />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
                <input id="avatar-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} style={{ display: "none" }} />
                <label htmlFor="avatar-input" style={{ width: 88, height: 88, borderRadius: "50%", border: "2px dashed rgba(0,0,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", background: "rgba(0,0,0,0.02)" }}>
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="9" r="3.5" stroke="rgba(0,0,0,0.3)" strokeWidth="1.7"/><path d="M5 20c0-3.5 3.5-6 7-6s7 2.5 7 6" stroke="rgba(0,0,0,0.3)" strokeWidth="1.7" strokeLinecap="round"/></svg>
                  )}
                </label>
                <label htmlFor="avatar-input" style={{ marginTop: 10, fontSize: 13, color: "rgba(0,0,0,0.45)", cursor: "pointer" }}>{lang === "fr" ? "Ajouter une photo" : "Upload a photo"}</label>
              </div>
              <Input label="Full name" labelFr="Nom complet" value={fullName} onChange={setFullName} placeholder="Jane Smith" placeholderFr="Jean Dupont" />
              <UsernameInput value={username} onChange={setUsername} status={usernameStatus} />
            </>
          )}

          {step === 2 && (
            <>
              <Header step={step} title="Tell us about your business" subtitle="Helps us personalize creator suggestions and outreach." titleFr="Parlez-nous de votre activité" subtitleFr="Cela nous aide à personnaliser les suggestions de créateurs et les messages." />
              <Input label="Business name" labelFr="Nom de votre entreprise" value={businessName} onChange={setBusinessName} placeholder="Acme Co." placeholderFr="Ma Boutique" />
              <div style={{ marginBottom: 20 }}>
                <Label>{lang === "fr" ? "Type d'activité" : "Business type"}</Label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { key: "ecommerce" as const, label: "Ecommerce store", labelFr: "Boutique e-commerce", desc: "Shopify, WooCommerce", descFr: "Shopify, WooCommerce" },
                    { key: "infopreneur" as const, label: "Infopreneur", labelFr: "Infopreneur", desc: "Courses, coaching", descFr: "Formations, coaching" },
                    { key: "agency" as const, label: "Agency", labelFr: "Agence", desc: "Client services", descFr: "Services clients" },
                    { key: "other" as const, label: "Other", labelFr: "Autre", desc: "Something else", descFr: "Autre chose" },
                  ].map((opt) => (
                    <button key={opt.key} type="button" onClick={() => setBusinessType(opt.key)} style={cardStyle(businessType === opt.key)}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "#0A0A0A", letterSpacing: "-0.02em" }}>{lang === "fr" ? opt.labelFr : opt.label}</div>
                      <div style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", marginTop: 4 }}>{lang === "fr" ? opt.descFr : opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <Input label="Your niche" labelFr="Votre niche" value={niche} onChange={setNiche} placeholder="Fashion, fitness, beauty, tech..." placeholderFr="Mode, fitness, beauté, tech..." />
              <div style={{ marginBottom: 20 }}>
                <Label>{lang === "fr" ? "Revenu mensuel" : "Monthly revenue"}</Label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { key: "starting" as const, label: "Just starting", labelFr: "Je débute" },
                    { key: "1k-10k" as const, label: "$1K – $10K", labelFr: "1K€ – 10K€" },
                    { key: "10k-50k" as const, label: "$10K – $50K", labelFr: "10K€ – 50K€" },
                    { key: "50k+" as const, label: "$50K+", labelFr: "50K€+" },
                  ].map((opt) => (
                    <button key={opt.key} type="button" onClick={() => setRevenue(opt.key)} style={cardStyle(revenue === opt.key)}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "#0A0A0A", letterSpacing: "-0.02em" }}>{lang === "fr" ? opt.labelFr : opt.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <Header step={step} title="Where did you hear about us?" subtitle="One quick tap. Helps us know what's working." titleFr="Comment nous avez-vous connus ?" subtitleFr="Un simple tap. Ça nous aide à savoir ce qui fonctionne." />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                {[
                  { key: "tiktok" as const, label: "TikTok", labelFr: "TikTok" },
                  { key: "reddit" as const, label: "Reddit", labelFr: "Reddit" },
                  { key: "twitter" as const, label: "X (Twitter)", labelFr: "X (Twitter)" },
                  { key: "friend" as const, label: "A friend", labelFr: "Un ami" },
                  { key: "google" as const, label: "Google", labelFr: "Google" },
                  { key: "other" as const, label: "Other", labelFr: "Autre" },
                ].map((opt) => (
                  <button key={opt.key} type="button" onClick={() => setSource(opt.key)} style={cardStyle(source === opt.key)}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "#0A0A0A", letterSpacing: "-0.02em" }}>{lang === "fr" ? opt.labelFr : opt.label}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {error && (
            <div style={{ fontSize: 14, color: "#ff6b6b", padding: "12px 14px", borderRadius: 12, background: "rgba(255,107,107,0.08)", marginTop: 16 }}>{error}</div>
          )}

          <button type="button" onClick={goNext} disabled={loading} style={{ ...primaryBtn, marginTop: 16 }}>
            {step === 3
              ? (loading ? (lang === "fr" ? "Enregistrement..." : "Saving...") : (lang === "fr" ? "Terminer →" : "Finish →"))
              : (lang === "fr" ? "Continuer →" : "Continue →")}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}

function getOnboardingPricingCopy(lang: "en" | "fr") {
  const fr = lang === "fr";
  return {
    reminderTitle: fr ? "Passez à l'offre supérieure quand vous voulez" : "Upgrade when you're ready",
    reminderSub: fr
      ? "Vous êtes déjà sur le plan gratuit. Voici les offres si vous voulez aller plus loin — sans obligation."
      : "You're already on the free plan. Here's what's available if you want to go further — no pressure.",
    pricingSave: fr ? "−20% annuel" : "Save 20% annual",
    pricingBasicDesc: fr
      ? "L'entrée idéale pour lancer votre programme créateurs."
      : "Your entry point — start fast without overcommitting.",
    pricingTrackitDesc: fr
      ? "Le meilleur rapport qualité-prix. Le choix de la plupart des marques."
      : "Best value. The plan most brands choose.",
    pricingScaleDesc: fr
      ? "Tout Pro, plus la puissance multi-boutiques et l'automatisation."
      : "Everything in Pro, plus multi-store power and full automation.",
    pricingScalePill: fr ? "Pour les agences" : "For agencies",
    pricingMostPopular: fr ? "Le plus populaire" : "Most Popular",
    pricingCta: fr ? "Commencer" : "Get Started",
    pricingMonth: fr ? "/mois" : "/month",
    pricingYear: fr ? "par an" : "/year",
    pricingAnnually: fr ? "Annuel" : "Annually",
    pricingEverythingInPro: fr ? "Tout le plan Pro" : "Everything in Pro",
    continueFree: fr ? "Continuer en gratuit →" : "Continue free →",
    growthFeatures: [
      fr ? "20 découvertes/mois" : "20 discoveries/month",
      fr ? "50 résultats par recherche" : "50 results per search",
      fr ? "3 campagnes actives" : "3 active campaigns",
      fr ? "15 créateurs gérés" : "15 managed creators",
      fr ? "Messages IA illimités" : "Unlimited AI outreach",
      fr ? "Modèles d'outreach (sauvegarde & import)" : "Outreach templates (save & import)",
      fr ? "Paiements manuels (PayPal, Revolut, IBAN)" : "Manual payouts (PayPal, Revolut, IBAN)",
      fr ? "Tableau de bord analytique complet" : "Full analytics dashboard",
      fr ? "Intégration Shopify" : "Shopify integration",
      fr ? "Liens d'affiliation & suivi" : "Affiliate links & tracking",
    ],
    proFeatures: [
      fr ? "50 découvertes/mois" : "50 discoveries/month",
      fr ? "25 résultats/recherche" : "25 results/search",
      fr ? "15 campagnes actives" : "15 active campaigns",
      fr ? "50 créateurs gérés" : "50 managed creators",
      fr ? "Messages IA illimités" : "Unlimited AI outreach",
      fr ? "Tous les modèles + import CSV en masse" : "All templates + bulk import via CSV",
      fr ? "Paiements manuels + automatiques" : "Manual + auto payouts",
      fr ? "Analytiques avancées + suivi ROI" : "Advanced analytics + ROI tracking",
      fr ? "Intégration Shopify" : "Shopify integration",
      fr ? "Liens d'affiliation & suivi" : "Affiliate links & tracking",
      fr ? "Workflows d'automatisation" : "Automation workflows",
      fr ? "Support prioritaire" : "Priority support",
    ],
    scaleFeatures: [
      fr ? "Tout le plan Pro" : "Everything in Pro",
      fr ? "Campagnes illimitées" : "Unlimited campaigns",
      fr ? "Créateurs gérés illimités" : "Unlimited managed creators",
      fr ? "Import CSV en masse (illimité)" : "Bulk CSV import (unlimited)",
      fr ? "Paiements auto (Stripe Connect)" : "Auto payouts (Stripe Connect)",
      fr ? "Agent d'automatisation complet" : "Full automation agent",
      fr ? "Outreach en marque blanche" : "White-label outreach",
      fr ? "Shopify multi-boutiques (3 boutiques)" : "Multi-store Shopify (3 stores)",
      fr ? "Support dédié" : "Dedicated support",
    ],
  };
}

const pricingCheckIcon = (
  <svg className="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M4 12l3 3 5-6M11 15l3 3 6-9" stroke="#9A9A9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function OnboardingPricingReminder() {
  const lang = useLang();
  const t = getOnboardingPricingCopy(lang);
  const [growthAnnual, setGrowthAnnual] = useState(false);
  const [proAnnual, setProAnnual] = useState(false);
  const [scaleAnnual, setScaleAnnual] = useState(false);
  const checkoutCurrency = lang === "fr" ? "eur" : "usd";

  const startCheckout = async (plan: "growth" | "pro" | "scale", annual: boolean) => {
    try {
      const priceId =
        plan === "growth"
          ? getGrowthPriceId(checkoutCurrency, annual)
          : plan === "pro"
            ? getProPriceId(checkoutCurrency, annual)
            : getScalePriceId(checkoutCurrency, annual);
      await handleUpgrade(priceId);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not start checkout");
    }
  };

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ maxWidth: 440, margin: "0 auto 28px", textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#0047FF", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
          {lang === "fr" ? "Tarifs" : "Pricing"}
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 600, color: "#0A0A0A", letterSpacing: "-0.03em", margin: "0 0 8px" }}>
          {t.reminderTitle}
        </h2>
        <p style={{ fontSize: 14, color: "rgba(0,0,0,0.5)", letterSpacing: "-0.01em", margin: "0 0 6px", lineHeight: 1.5 }}>
          {t.reminderSub}
        </p>
      </div>

      <div className="pricing-grid">
        <div className="pricing-wrap">
          <div className="pricing-toggle">
            <div className="pricing-toggle-left">
              <button
                type="button"
                className={`toggle-switch${growthAnnual ? " is-on" : ""}`}
                aria-label="Toggle billing"
                aria-pressed={growthAnnual}
                onClick={() => setGrowthAnnual((on) => !on)}
              >
                <span className="toggle-thumb" />
              </button>
              <span className="toggle-label">{t.pricingAnnually}</span>
            </div>
            <div className="pricing-toggle-pill">{t.pricingSave}</div>
          </div>
          <div className="pricing-card">
            <div className="pricing-card-top">
              <div className="pricing-logo">
                <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" />
              </div>
              <div className="pricing-name">Growth</div>
              <div className="pricing-desc">{t.pricingBasicDesc}</div>
              <div className="pricing-price">
                <span className="pricing-amount">
                  {growthAnnual ? formatCurrency(190, lang) : formatCurrency(19, lang)}
                </span>
                <span className="pricing-period">{growthAnnual ? t.pricingYear : t.pricingMonth}</span>
              </div>
            </div>
            <div className="pricing-divider" />
            <div className="pricing-features">
              {t.growthFeatures.map((label) => (
                <div key={label} className="pricing-feature">
                  {pricingCheckIcon}
                  {label}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => void startCheckout("growth", growthAnnual)} className="pricing-cta">
              {t.pricingCta}
            </button>
          </div>
        </div>

        <div className="pricing-wrap pricing-wrap-hero">
          <div className="pricing-toggle">
            <div className="pricing-toggle-left">
              <button
                type="button"
                className={`toggle-switch${proAnnual ? " is-on" : ""}`}
                aria-label="Toggle billing"
                aria-pressed={proAnnual}
                onClick={() => setProAnnual((on) => !on)}
              >
                <span className="toggle-thumb" />
              </button>
              <span className="toggle-label">{t.pricingAnnually}</span>
            </div>
          </div>
          <div className="pricing-card pricing-card-hero">
            <span className="pricing-badge-most-popular">{t.pricingMostPopular}</span>
            <div className="pricing-card-top">
              <div className="pricing-logo">
                <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" />
              </div>
              <div className="pricing-name">Pro</div>
              <div className="pricing-desc">{t.pricingTrackitDesc}</div>
              <div className="pricing-price">
                <span className="pricing-amount">
                  {proAnnual ? formatCurrency(390, lang) : formatCurrency(39, lang)}
                </span>
                <span className="pricing-period">{proAnnual ? t.pricingYear : t.pricingMonth}</span>
              </div>
            </div>
            <div className="pricing-divider" />
            <div className="pricing-features">
              {t.proFeatures.map((label) => (
                <div key={label} className="pricing-feature">
                  {pricingCheckIcon}
                  {label}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void startCheckout("pro", proAnnual)}
              className="pricing-cta pricing-cta-hero"
            >
              {t.pricingCta}
            </button>
          </div>
        </div>

        <div className="pricing-wrap">
          <div className="pricing-toggle">
            <div className="pricing-toggle-left">
              <button
                type="button"
                className={`toggle-switch${scaleAnnual ? " is-on" : ""}`}
                aria-label="Toggle billing"
                aria-pressed={scaleAnnual}
                onClick={() => setScaleAnnual((on) => !on)}
              >
                <span className="toggle-thumb" />
              </button>
              <span className="toggle-label">{t.pricingAnnually}</span>
            </div>
            <div className="pricing-toggle-pill">{t.pricingScalePill}</div>
          </div>
          <div className="pricing-card">
            <div className="pricing-card-top">
              <div className="pricing-logo">
                <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" />
              </div>
              <div className="pricing-name">Scale</div>
              <div className="pricing-desc">{t.pricingScaleDesc}</div>
              <div className="pricing-price">
                <span className="pricing-amount">
                  {scaleAnnual ? formatCurrency(990, lang) : formatCurrency(99, lang)}
                </span>
                <span className="pricing-period">{scaleAnnual ? t.pricingYear : t.pricingMonth}</span>
              </div>
            </div>
            <div className="pricing-divider" />
            <div className="pricing-features">
              {t.scaleFeatures.map((label) => (
                <div key={label} className="pricing-feature">
                  {pricingCheckIcon}
                  {label}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void startCheckout("scale", scaleAnnual)}
              className="pricing-cta pricing-cta-dark"
            >
              {t.pricingCta}
            </button>
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 24 }}>
        <Link
          href="/dashboard"
          style={{
            fontSize: 15,
            fontWeight: 500,
            color: "#0047FF",
            textDecoration: "none",
            letterSpacing: "-0.02em",
            fontFamily: "inherit",
          }}
        >
          {t.continueFree}
        </Link>
      </div>
    </div>
  );
}

function Header({ step, title, subtitle, titleFr, subtitleFr }: { step: number; title: string; subtitle: string; titleFr: string; subtitleFr: string }) {
  const lang = useLang();
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: "#0047FF", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
        {lang === "fr" ? `Étape ${step} sur 5` : `Step ${step} of 5`}
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 600, color: "#0A0A0A", letterSpacing: "-0.03em", margin: 0, marginBottom: 8 }}>{lang === "fr" ? titleFr : title}</h1>
      <p style={{ fontSize: 14, color: "rgba(0,0,0,0.5)", letterSpacing: "-0.01em", margin: 0, lineHeight: 1.5 }}>{lang === "fr" ? subtitleFr : subtitle}</p>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(0,0,0,0.7)", letterSpacing: "-0.01em", marginBottom: 10 }}>{children}</div>;
}

function Input({ label, labelFr, value, onChange, placeholder, placeholderFr }: { label: string; labelFr?: string; value: string; onChange: (v: string) => void; placeholder: string; placeholderFr?: string }) {
  const lang = useLang();
  return (
    <div style={{ marginBottom: 16 }}>
      <Label>{lang === "fr" && labelFr ? labelFr : label}</Label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={lang === "fr" && placeholderFr ? placeholderFr : placeholder} style={inputStyle} />
    </div>
  );
}

function UsernameInput({ value, onChange, status }: { value: string; onChange: (v: string) => void; status: string }) {
  const lang = useLang();
  const message =
    status === "checking" ? (lang === "fr" ? "Vérification..." : "Checking...") :
    status === "available" ? (lang === "fr" ? "✓ Disponible" : "✓ Available") :
    status === "taken" ? (lang === "fr" ? "Ce nom est déjà pris" : "Username is taken") :
    status === "invalid" ? (lang === "fr" ? "3-20 caractères, lettres/chiffres/underscores uniquement" : "3-20 characters, letters/numbers/underscores only") :
    "";
  const color =
    status === "available" ? "#1FB567" :
    status === "taken" || status === "invalid" ? "#ff6b6b" :
    "rgba(0,0,0,0.4)";
  return (
    <div style={{ marginBottom: 16 }}>
      <Label>{lang === "fr" ? "Nom d'utilisateur" : "Username"}</Label>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "rgba(0,0,0,0.4)", fontSize: 15, letterSpacing: "-0.01em" }}>@</span>
        <input type="text" value={value} onChange={(e) => onChange(e.target.value.toLowerCase())} placeholder={lang === "fr" ? "ton pseudo" : "yourname"} style={{ ...inputStyle, paddingLeft: 38 }} />
      </div>
      {message && <div style={{ fontSize: 13, color, marginTop: 8, letterSpacing: "-0.01em" }}>{message}</div>}
    </div>
  );
}

function Done({ name, router }: { name: string; router: ReturnType<typeof useRouter> }) {
  const lang = useLang();
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
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ position: "relative", width: 80, height: 80, margin: "0 auto 28px" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#0047FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        {[...Array(14)].map((_, i) => {
          const colors = ["#0047FF", "#1FB567", "#FFD23F", "#FF6B2C", "#FF3D8B"];
          return <span key={i} className="confetti-dot" style={{ position: "absolute", top: "50%", left: "50%", width: 8, height: 8, borderRadius: 2, background: colors[i % colors.length], transform: "translate(-50%, -50%)", transition: "transform 1.2s cubic-bezier(0.2, 0.7, 0.3, 1), opacity 1.2s ease-out", transitionDelay: `${i * 30}ms` }} />;
        })}
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 600, color: "#0A0A0A", letterSpacing: "-0.04em", margin: 0, marginBottom: 10 }}>
        {lang === "fr"
          ? `C'est parti${name ? `, ${name.split(" ")[0]}` : ""} !`
          : `You're all set${name ? `, ${name.split(" ")[0]}` : ""}!`}
      </h1>
      <p style={{ fontSize: 15, color: "rgba(0,0,0,0.5)", letterSpacing: "-0.01em", margin: 0, marginBottom: 24 }}>
        {lang === "fr" ? "C'est l'heure de trouver vos premiers créateurs." : "Time to find your first creators."}
      </p>
      <button
        type="button"
        onClick={() => {
          window.location.href = "/dashboard";
        }}
        style={primaryBtn}
      >
        {lang === "fr" ? "Commencer à découvrir des créateurs →" : "Start discovering creators →"}
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 12, padding: "12px 14px", fontSize: 15, fontFamily: "inherit", color: "#0A0A0A",
  letterSpacing: "-0.01em", outline: "none", boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  width: "100%", background: "#0047FF", color: "#FFFFFF", border: "none", borderRadius: 12,
  padding: "14px 0", fontSize: 15, fontWeight: 500, letterSpacing: "-0.02em", cursor: "pointer",
  fontFamily: "inherit",
};

function cardStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "rgba(0,71,255,0.08)" : "#FFFFFF",
    border: active ? "1px solid #0047FF" : "1px solid rgba(0,0,0,0.1)",
    borderRadius: 12, padding: "14px 16px", cursor: "pointer", textAlign: "left",
    fontFamily: "inherit", transition: "all 0.15s ease",
  };
}
