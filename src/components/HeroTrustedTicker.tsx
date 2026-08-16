"use client";

import { useEffect, useState } from "react";

export function HeroTrustedTicker({ lang }: { lang: "en" | "fr" }) {
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    const holdMs = 3600;
    const animMs = 700;
    const id = window.setInterval(() => {
      setLineIndex((i) => (i + 1) % 2);
    }, holdMs + animMs);
    return () => window.clearInterval(id);
  }, []);

  const prefix = lang === "fr" ? "Fait confiance par plus de " : "Trusted by ";
  const lines =
    lang === "fr"
      ? ["1k+ boutiques Shopify", "500+ fondateurs SaaS"]
      : ["1k+ Shopify stores", "500+ SaaS owners"];
  return (
    <p className="hero-trusted fade-up fade-up-delay-5">
      <span className="hero-trusted-inner">
        <span className="hero-trusted-prefix">{prefix}</span>
        <span className="hero-trusted-slot" data-active={lineIndex} aria-live="polite">
          <span className="hero-trusted-line hero-trusted-line--shopify">{lines[0]}</span>
          <span className="hero-trusted-line hero-trusted-line--saas">{lines[1]}</span>
          <span className="hero-trusted-sizer" aria-hidden>
            {lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </span>
        </span>
      </span>
      <span className="hero-trusted-logo-wrap" data-stripe={lineIndex === 1 ? "true" : undefined} aria-hidden>
        <img
          src="/shopify-logo.svg"
          alt=""
          className={`hero-trusted-logo hero-trusted-logo--shopify${lineIndex === 0 ? " is-visible" : ""}`}
        />
        <img
          src="/stripe-logo.svg"
          alt=""
          className={`hero-trusted-logo hero-trusted-logo--stripe${lineIndex === 1 ? " is-visible" : ""}`}
        />
      </span>
    </p>
  );
}
