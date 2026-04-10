"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import {
  getBuildPriceId,
  getScalePriceId,
  getSparkPriceId,
} from "@/lib/checkout";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useLang } from "@/lib/useLang";

type Tier = "spark" | "build" | "scale";

function PricingPageInner() {
  const router = useRouter();
  const lang = useLang();
  const currency = lang === "fr" ? "€" : "$";

  const t = {
    en: {
      title: "Simple. Honest. Revenue-led.",
      sub: "No fluff. Pick the plan that matches where you are.",
      monthly: "Monthly",
      free_tier: "Free",
      free_desc: "Try Klayan once. No credit card.",
      free_feature1: "1 free analysis",
      free_feature2: "Basic verdict",
      free_cta: "Start free →",
      popular: "Most Popular!",
      get_started: "Get started →",
      per_month: "/mo",
      scale_badge: "Get the best out of Klayan!",
      pricing_spark_f1: "Unlimited analyses",
      pricing_spark_f2: "Kill or Build verdict",
      pricing_spark_f3: "Market research & competitor scan",
      pricing_spark_f4: "Hard Truths + Opportunity analysis",
      pricing_spark_f5: "Workspace + Notes",
      pricing_build_f1: "Unlimited analyses",
      pricing_build_f2: "Everything in Spark",
      pricing_build_f3: "Weekly Check-in + AI report",
      pricing_build_f4: "Milestone Engine + Playbooks",
      pricing_build_f5: "Market Watch (monthly)",
      pricing_build_f6: "Pivot Radar",
      pricing_scale_f1: "Unlimited analyses",
      pricing_scale_f2: "Everything in Build",
      pricing_scale_f3: "Co-Founder Mode (unlimited sessions)",
      pricing_scale_f4: "Market Watch (unlimited)",
      pricing_scale_f5: "Revenue Roadmap",
      pricing_scale_f6: "Marketing Machine",
      pricing_locked_signal: "Signal Sprint",
      pricing_locked_flip: "Flip Engine",
      pricing_locked_structure: "Business Structure",
      pricing_locked_roadmap: "Revenue Roadmap",
      pricing_locked_marketing: "Marketing Machine",
    },
    fr: {
      title: "Simple. Honnête. Orienté revenus.",
      sub: "Pas de blabla. Choisis le plan qui correspond à où tu en es.",
      monthly: "Mensuel",
      free_tier: "Gratuit",
      free_desc: "Essaie Klayan une fois. Sans carte bancaire.",
      free_feature1: "1 analyse gratuite",
      free_feature2: "Verdict basique",
      free_cta: "Commencer gratuitement →",
      popular: "Le plus populaire !",
      get_started: "Commencer →",
      per_month: "/mois",
      scale_badge: "Tire le meilleur de Klayan !",
      pricing_spark_f1: "Analyses illimitées",
      pricing_spark_f2: "Verdict Kill or Build",
      pricing_spark_f3: "Recherche de marché & scan des concurrents",
      pricing_spark_f4: "Vérités difficiles + analyse des opportunités",
      pricing_spark_f5: "Espace de travail + Notes",
      pricing_build_f1: "Analyses illimitées",
      pricing_build_f2: "Tout ce qui est dans Spark",
      pricing_build_f3: "Check-in hebdomadaire + rapport IA",
      pricing_build_f4: "Milestone Engine + Playbooks",
      pricing_build_f5: "Market Watch (mensuel)",
      pricing_build_f6: "Pivot Radar",
      pricing_scale_f1: "Analyses illimitées",
      pricing_scale_f2: "Tout ce qui est dans Build",
      pricing_scale_f3: "Mode Co-Fondateur (sessions illimitées)",
      pricing_scale_f4: "Market Watch (illimité)",
      pricing_scale_f5: "Revenue Roadmap",
      pricing_scale_f6: "Marketing Machine",
      pricing_locked_signal: "Signal Sprint",
      pricing_locked_flip: "Flip Engine",
      pricing_locked_structure: "Structure Business",
      pricing_locked_roadmap: "Revenue Roadmap",
      pricing_locked_marketing: "Marketing Machine",
    },
  }[lang];

  const [busy, setBusy] = useState<Tier | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const analysisId = searchParams.get("analysisId") ?? undefined;

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/auth");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_status, plan")
        .eq("id", user.id)
        .single();

      if (profile?.subscription_status === "active") {
        const plan = profile?.plan ?? "free";
        if (plan === "scale") {
          router.replace("/dashboard");
        }
        // Otherwise stay on pricing so they can upgrade
      }
    })();
  }, [router]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const startCheckout = async (tier: Tier) => {
    if (!supabase) return;
    setPageError(null);
    const priceId =
      tier === "spark"
        ? getSparkPriceId()
        : tier === "build"
          ? getBuildPriceId()
          : getScalePriceId();
    if (!priceId) {
      setPageError("Checkout is not configured. Please try again later.");
      return;
    }

    setBusy(tier);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/auth");
        return;
      }

      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId,
          userId: user.id,
          email: user.email,
          analysisId,
          currency: lang === "fr" ? "eur" : "usd",
          cancelUrl: window.location.href,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };

      if (!res.ok || !payload.url) {
        setPageError(payload.error ?? "Could not start checkout.");
        return;
      }

      window.location.href = payload.url;
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!supabase) return;
    const params = new URLSearchParams(window.location.search);
    const plan = params.get("plan") as "spark" | "build" | "scale" | null;
    if (plan && ["spark", "build", "scale"].includes(plan)) {
      void startCheckout(plan);
    }
  }, []);

  return (
    <div className="pricing-page-wrap">
      <div className="pricing-page-logo-row">
        <Link href="/" aria-label="Home">
          <img
            src="/images/navbarlogo.png"
            alt="Klayan"
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              objectFit: "cover",
            }}
          />
        </Link>
      </div>

      <h1 className="pricing-page-title">{t.title}</h1>
      <p className="pricing-page-sub">{t.sub}</p>

      {pageError ? (
        <p
          style={{
            color: "#ff4d4f",
            textAlign: "center",
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            marginBottom: 24,
            maxWidth: 480,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {pageError}
        </p>
      ) : null}

      <section className="pricing-section pricing-page-section">
        <div className="pricing-grid">
          <div className="pricing-card">
            <div className="pricing-card-name">Spark</div>
            <div className="pricing-price">{`${currency}19${t.per_month}`}</div>
            <button
              type="button"
              className="pricing-btn pricing-btn-dark"
              disabled={busy !== null}
              onClick={() => void startCheckout("spark")}
            >
              {busy === "spark" ? "Please wait…" : t.get_started}
            </button>
            <div className="pricing-divider" />
            <ul className="pricing-features">
              <li>
                <span className="feat-dot" /> {t.pricing_spark_f1}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_spark_f2}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_spark_f3}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_spark_f4}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_spark_f5}
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> {t.pricing_locked_signal}
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> {t.pricing_locked_flip}
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> {t.pricing_locked_structure}
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> {t.pricing_locked_roadmap}
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> {t.pricing_locked_marketing}
              </li>
            </ul>
          </div>

          <div className="pricing-card featured">
            <div className="pricing-popular-badge">
              {t.popular}{" "}
              <img
                src="/images/navbarlogo.png"
                alt=""
                className="pricing-inline-logo"
              />
            </div>
            <div className="pricing-card-name">Build</div>
            <div className="pricing-price pricing-price-black">{`${currency}69${t.per_month}`}</div>
            <button
              type="button"
              className="pricing-btn pricing-btn-light"
              disabled={busy !== null}
              onClick={() => void startCheckout("build")}
            >
              {busy === "build" ? "Please wait…" : t.get_started}
            </button>
            <div className="pricing-divider" />
            <ul className="pricing-features">
              <li>
                <span className="feat-dot" /> {t.pricing_build_f1}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_build_f2}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_build_f3}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_build_f4}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_build_f5}
              </li>
              <li>
                <span className="feat-dot" /> {t.pricing_build_f6}
              </li>
            </ul>
          </div>
        </div>

        <div className="pricing-card scale reveal visible pricing-card-scale-max">
          <div className="pricing-card-name">Scale</div>
          <div className="scale-badge">
            {t.scale_badge}{" "}
            <img
              src="/images/navbarlogo.png"
              alt=""
              className="pricing-inline-logo"
            />
          </div>
          <div className="pricing-price">{`${currency}149${t.per_month}`}</div>
          <button
            type="button"
            className="pricing-btn pricing-btn-dark pricing-btn-scale"
            disabled={busy !== null}
            onClick={() => void startCheckout("scale")}
          >
            {busy === "scale" ? "Please wait…" : t.get_started}
          </button>
          <div className="pricing-divider pricing-divider-mt" />
          <ul className="pricing-features">
            <li>
              <span className="feat-dot" /> {t.pricing_scale_f1}
            </li>
            <li>
              <span className="feat-dot" /> {t.pricing_scale_f2}
            </li>
            <li>
              <span className="feat-dot" /> {t.pricing_scale_f3}
            </li>
            <li>
              <span className="feat-dot" /> {t.pricing_scale_f4}
            </li>
            <li>
              <span className="feat-dot" /> {t.pricing_scale_f5}
            </li>
            <li>
              <span className="feat-dot" /> {t.pricing_scale_f6}
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={<div className="pricing-page-wrap" />}>
      <PricingPageInner />
    </Suspense>
  );
}
