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

type Tier = "spark" | "build" | "scale";

function PricingPageInner() {
  const router = useRouter();
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
        .select("subscription_status")
        .eq("id", user.id)
        .single();

      if (profile?.subscription_status === "active") {
        router.replace("/dashboard");
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

      <h1 className="pricing-page-title">Choose your plan.</h1>
      <p className="pricing-page-sub">
        Start validating your ideas today.
      </p>

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
            <div className="pricing-price">$19/mo</div>
            <button
              type="button"
              className="pricing-btn pricing-btn-dark"
              disabled={busy !== null}
              onClick={() => void startCheckout("spark")}
            >
              {busy === "spark" ? "Please wait…" : "Get started"}
            </button>
            <div className="pricing-divider" />
            <ul className="pricing-features">
              <li>
                <span className="feat-dot" /> 3 analyses per month
              </li>
              <li>
                <span className="feat-dot" /> Kill or Build verdict
              </li>
              <li>
                <span className="feat-dot" /> Market research &amp; competitor
                scan
              </li>
              <li>
                <span className="feat-dot" /> Hard Truths + Opportunity analysis
              </li>
              <li>
                <span className="feat-dot" /> Recommended Stack
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> Signal Sprint
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> Flip Engine
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> Business Structure
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> Revenue Roadmap
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> Marketing Machine
              </li>
            </ul>
          </div>

          <div className="pricing-card featured">
            <div className="pricing-popular-badge">
              Most Popular!{" "}
              <img
                src="/images/navbarlogo.png"
                alt=""
                className="pricing-inline-logo"
              />
            </div>
            <div className="pricing-card-name">Build</div>
            <div className="pricing-price pricing-price-black">$69/mo</div>
            <button
              type="button"
              className="pricing-btn pricing-btn-light"
              disabled={busy !== null}
              onClick={() => void startCheckout("build")}
            >
              {busy === "build" ? "Please wait…" : "Get started"}
            </button>
            <div className="pricing-divider" />
            <ul className="pricing-features">
              <li>
                <span className="feat-dot" /> 10 analyses per month
              </li>
              <li>
                <span className="feat-dot" /> Everything in Spark
              </li>
              <li>
                <span className="feat-dot" /> Signal Sprint (20 exact people to
                contact)
              </li>
              <li>
                <span className="feat-dot" /> Flip Engine (3 alternative business
                models)
              </li>
              <li>
                <span className="feat-dot" /> Business Structure recommendations
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> Revenue Roadmap
              </li>
              <li className="locked">
                <span className="feat-x">✗</span> Marketing Machine
              </li>
            </ul>
          </div>
        </div>

        <div className="pricing-card scale reveal visible pricing-card-scale-max">
          <div className="pricing-card-name">Scale</div>
          <div className="scale-badge">
            Get the best out of Klayan!{" "}
            <img
              src="/images/navbarlogo.png"
              alt=""
              className="pricing-inline-logo"
            />
          </div>
          <div className="pricing-price">$149/mo</div>
          <button
            type="button"
            className="pricing-btn pricing-btn-dark pricing-btn-scale"
            disabled={busy !== null}
            onClick={() => void startCheckout("scale")}
          >
            {busy === "scale" ? "Please wait…" : "Get started"}
          </button>
          <div className="pricing-divider pricing-divider-mt" />
          <ul className="pricing-features">
            <li>
              <span className="feat-dot" /> Unlimited analyses
            </li>
            <li>
              <span className="feat-dot" /> Everything in Build
            </li>
            <li>
              <span className="feat-dot" /> Revenue Roadmap (day by day to $10K
              MRR)
            </li>
            <li>
              <span className="feat-dot" /> Marketing Machine (landing page copy,
              outreach sequences, 30-day launch plan)
            </li>
            <li>
              <span className="feat-dot" /> Priority support
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
