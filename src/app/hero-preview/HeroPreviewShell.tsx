"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MinoCompanion } from "@/components/MinoCompanion";
import { HeroTrustedTicker } from "@/components/HeroTrustedTicker";
import { ProductFilmHero } from "@/components/ProductFilmHero";
import { ANNOUNCEMENT_KEY, AnnouncementBar } from "@/components/AnnouncementBar";
import { useLang } from "@/lib/useLang";
import { PremiumWorkspaceDemo } from "./PremiumWorkspaceDemo";
import "@/app/dashboard/workspace/workspace.css";
import "./hero-preview.css";

function heroCopy(lang: "en" | "fr") {
  if (lang === "fr") {
    return {
      affiliates: "Affiliés",
      solutions: "Solutions",
      learn: "Ressources",
      product: "Produit",
      pricing: "Tarifs",
      login: "Connexion",
      signup: "Inscription",
      getStarted: "Commencer",
      forFree: "Gratuit !!",
      badge: "Nouveauté : Ask Mino",
      titleBefore: "Toute l'affiliation dans un seul ",
      titleEm: "Workspace",
      points: [
        {
          strong: "Trouver des créateurs.",
          rest: "Trouvez les bons créateurs et invitez-les au même endroit.",
        },
        {
          strong: "Gérer les affiliés.",
          rest: "Campagnes, outreach et conversations, ensemble.",
        },
        {
          strong: "Suivre et payer.",
          rest: "Suivez les ventes et payez les commissions automatiquement.",
        },
      ],
      affiliateItems: [
        { label: "Commencer", href: "/affiliation" },
        { label: "Mon compte", href: "/auth?mode=login&role=creator" },
      ],
      solutionItems: [
        "Découverte de créateurs",
        "Outreach IA",
        "Campagnes",
        "Liens d'affiliation",
        "Suivi des ventes",
        "Scripts",
        "Contenu créateur",
        "Inbox",
        "Paiements",
        "Analytics",
        "Planner",
        "Tableaux",
        "Ask Mino",
        "Intégration Shopify",
      ],
      openMenu: "Ouvrir le menu",
      closeMenu: "Fermer le menu",
    };
  }
  return {
    affiliates: "Affiliates",
    solutions: "Solutions",
    learn: "Learn",
    product: "Product",
    pricing: "Pricing",
    login: "Login",
    signup: "Sign Up",
    getStarted: "Get started",
    forFree: "For free!!",
    badge: "New: Ask Mino",
    titleBefore: "All your affiliation in one ",
    titleEm: "Workspace",
    points: [
      {
        strong: "Discover Creators.",
        rest: "Find the right creators and invite them in one place.",
      },
      {
        strong: "Handle Affiliates.",
        rest: "Manage campaigns, outreach, and conversations together.",
      },
      {
        strong: "Track and Pay.",
        rest: "Follow sales and pay commissions automatically.",
      },
    ],
    affiliateItems: [
      { label: "Get Started", href: "/affiliation" },
      { label: "My Account", href: "/auth?mode=login&role=creator" },
    ],
    solutionItems: [
      "Creator Discovery",
      "AI Outreach",
      "Campaigns",
      "Affiliate Links",
      "Sales Tracking",
      "Scripts",
      "Creator Content",
      "Inbox",
      "Payouts",
      "Analytics",
      "Planner",
      "Boards",
      "Ask Mino",
      "Shopify Integration",
    ],
    openMenu: "Open menu",
    closeMenu: "Close menu",
  };
}

function noop(e?: { preventDefault?: () => void }) {
  e?.preventDefault?.();
}

export function HeroPreviewShell() {
  const lang = useLang();
  const [navOpen, setNavOpen] = useState(false);
  const [announcement, setAnnouncement] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const dashRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(ANNOUNCEMENT_KEY) === "closed") setAnnouncement(false);
    } catch {
      // storage blocked: keep the announcement
    }
  }, []);

  const closeAnnouncement = () => {
    setAnnouncement(false);
    try {
      localStorage.setItem(ANNOUNCEMENT_KEY, "closed");
    } catch {
      // storage blocked: hide for this visit only
    }
  };

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".hp-nav")) setNavOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // The dashboard is laid out at desktop size, then scaled so it ends at the
  // viewport edge and its bottom fills the frame.
  useLayoutEffect(() => {
    const frame = rootRef.current;
    const dash = dashRef.current;
    if (!frame || !dash) return;

    const align = () => {
      const box = frame.getBoundingClientRect();
      const visible = Math.min(box.right, document.documentElement.clientWidth) - box.left;
      const small = window.innerWidth <= 720;
      const scale = small ? 0.5 : Math.min(0.86, Math.max(0.6, visible / 1150));
      dash.style.transform = `scale(${scale})`;
      dash.style.width = `${visible / scale}px`;
      dash.style.height = `${box.height / scale}px`;
    };

    align();
    void document.fonts?.ready.then(align);
    window.addEventListener("resize", align);
    return () => window.removeEventListener("resize", align);
  }, []);

  const t = heroCopy(lang);
  const navLinks = [
    { label: t.affiliates, href: "/affiliation" },
    { label: t.solutions, href: "#features" },
    { label: t.product, href: "#product" },
    { label: t.pricing, href: "#pricing" },
  ];

  return (
    <div className={`hp-page${announcement ? " has-annc" : ""}`}>
      <nav className="hp-nav">
        {announcement ? <AnnouncementBar lang={lang} onClose={closeAnnouncement} /> : null}
        <div className="hp-nav__inner">
          <a className="hp-nav__brand" href="/" onClick={noop}>
            <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="Trackit" />
          </a>
          <div className="hp-nav__links">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="hp-nav__link">
                {l.label}
              </a>
            ))}
          </div>
          <div className="hp-nav__actions">
            <a href="/auth?mode=login" className="hp-nav__login">
              {t.login}
            </a>
            <a href="/auth?mode=signup" className="hp-nav__signup">
              {t.signup}
            </a>
            <button
              type="button"
              className="hp-nav__toggle"
              aria-label={navOpen ? t.closeMenu : t.openMenu}
              aria-expanded={navOpen}
              onClick={() => setNavOpen((v) => !v)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {navOpen ? (
                  <>
                    <path d="M6 6l12 12" />
                    <path d="M18 6L6 18" />
                  </>
                ) : (
                  <>
                    <path d="M4 7h16" />
                    <path d="M4 12h16" />
                    <path d="M4 17h16" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>
        {navOpen ? (
          <div className="hp-nav__sheet">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="hp-nav__sheet-link" onClick={() => setNavOpen(false)}>
                {l.label}
              </a>
            ))}
            <a href="/auth?mode=login" className="hp-nav__login" onClick={() => setNavOpen(false)}>
              {t.login}
            </a>
            <a href="/auth?mode=signup" className="hp-nav__signup" onClick={() => setNavOpen(false)}>
              {t.signup}
            </a>
          </div>
        ) : null}
      </nav>
      <ProductFilmHero />
      <section className="hp-hero">
        <div className="hp-copy">
          <div className="hp-badge">
            <span className="hp-badge__led" aria-hidden>
              <span className="mtg-promptbox__led-spin" />
            </span>
            <span className="hp-badge__label">
              <MinoCompanion size={16} />
              {t.badge}
            </span>
          </div>
          <h1>
            {t.titleBefore}
            <span className="hp-copy__cursive">{t.titleEm}</span>.
          </h1>
          <ul className="hp-points">
            {t.points.map((point) => (
              <li key={point.strong}>
                <span className="hp-check" aria-hidden />
                <span>
                  <strong>{point.strong}</strong> {point.rest}
                </span>
              </li>
            ))}
          </ul>
          <div className="hp-cta-row">
            <a href="/auth?mode=signup" className="hp-cta">
              <span className="hp-cta__swap">
                <span>{t.getStarted}</span>
                <span>{t.forFree}</span>
              </span>
            </a>
            <HeroTrustedTicker lang={lang} />
          </div>
        </div>

        <div className="hp-stage">
          <div className="hp-frame" ref={rootRef}>
            <div className="hp-dash" data-dashboard-theme="light" ref={dashRef}>
              <PremiumWorkspaceDemo />
            </div>
            <div className="hp-fade" aria-hidden />
          </div>
        </div>
      </section>
    </div>
  );
}
