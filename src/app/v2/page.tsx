"use client";

import Link from "next/link";
import { useState } from "react";
import { useLang } from "@/lib/useLang";

const FONT = "'InterDisplay', 'Inter Display', sans-serif";
const BLUE = "#0047FF";
const TEXT = "#1A1A1A";
const SUBTEXT = "#7A7A7A";
const BG = "#fff";

function BellIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M13.73 21a2 2 0 01-3.46 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RemindMeLabel({ lang }: { lang: "en" | "fr" }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {lang === "fr" ? "Me le rappeler" : "Remind me"}
      <BellIcon />
    </span>
  );
}

type V2StepVisual = "find" | "track" | "pay";

function V2ProcessVisual({ type, lang }: { type: V2StepVisual; lang: "en" | "fr" }) {
  if (type === "find") {
    return (
      <div className="v2-mock-find">
        <div className="v2-mock-find__search">
          <div className="v2-mock-find__input" />
          <div className="v2-mock-find__btn">
            Find it
            <span className="v2-mock-find__btn-dot" />
          </div>
        </div>
        <div className="v2-mock-find__pills">
          <span className="v2-mock-find__pill v2-mock-find__pill--active">
            {lang === "fr" ? "France" : "France"}
          </span>
          <span className="v2-mock-find__pill">{lang === "fr" ? "Fitness" : "Fitness"}</span>
          <span className="v2-mock-find__pill">TikTok</span>
        </div>
        <div className="v2-mock-find__rows">
          {[0, 1].map((i) => (
            <div key={i} className="v2-mock-find__row">
              <div className="v2-mock-find__avatar" />
              <div className="v2-mock-find__line" />
              <div className="v2-mock-find__line v2-mock-find__line--short" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "track") {
    return (
      <div className="v2-mock-track">
        <div className="v2-mock-track__chart">
          {[40, 65, 48, 90, 72, 55, 80].map((h, i) => (
            <div
              key={i}
              className={`v2-mock-track__bar${i === 3 ? " v2-mock-track__bar--tall" : ""}`}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <div className="v2-mock-track__stats">
          <div className="v2-mock-track__stat">
            <div className="v2-mock-track__stat-label">{lang === "fr" ? "Ventes" : "Sales"}</div>
            <div className="v2-mock-track__stat-value v2-mock-track__stat-value--up">+24%</div>
          </div>
          <div className="v2-mock-track__stat">
            <div className="v2-mock-track__stat-label">{lang === "fr" ? "Campagnes" : "Campaigns"}</div>
            <div className="v2-mock-track__stat-value">12</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="v2-mock-pay">
      <div className="v2-mock-pay__card">
        <div className="v2-mock-pay__label">{lang === "fr" ? "Votre solde" : "Your balance"}</div>
        <div className="v2-mock-pay__amount">{lang === "fr" ? "2 450 €" : "$2,450"}</div>
        <div className="v2-mock-pay__btn">
          Pay it
          <span className="v2-mock-pay__btn-dot" />
        </div>
      </div>
    </div>
  );
}

export default function V2Page() {
  const lang = useLang();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [formData, setFormData] = useState({ firstName: "", email: "", note: "" });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = formData.firstName.trim() && formData.email.trim();

  const FAQ_ITEMS = [
    {
      q: lang === "fr" ? "Quand sort Trackit v2 ?" : "When is Trackit v2 launching?",
      a:
        lang === "fr"
          ? "Nous finalisons les dernières fonctionnalités. Les personnes sur la liste d'attente seront informées en premier, avec un accès anticipé avant le lancement public."
          : "We're putting the finishing touches on the last features. Waitlist members will be notified first, with early access before the public launch.",
    },
    {
      q: lang === "fr" ? "Mes données seront-elles conservées ?" : "Will my data carry over?",
      a:
        lang === "fr"
          ? "Oui. Vos campagnes, créateurs, ventes et paramètres restent intacts. v2 améliore l'expérience sans repartir de zéro."
          : "Yes. Your campaigns, creators, sales, and settings stay intact. v2 upgrades the experience without starting from scratch.",
    },
    {
      q: lang === "fr" ? "Le prix va-t-il changer ?" : "Will pricing change?",
      a:
        lang === "fr"
          ? "Les abonnés actuels conservent leur tarif. v2 apporte plus de valeur aux mêmes plans Growth, Pro et Scale."
          : "Current subscribers keep their rate. v2 brings more value to the same Growth, Pro, and Scale plans.",
    },
    {
      q: lang === "fr" ? "Dois-je faire quelque chose ?" : "Do I need to do anything?",
      a:
        lang === "fr"
          ? "Non. La mise à jour se fera automatiquement. Inscrivez-vous à la liste d'attente si vous voulez être parmi les premiers testeurs."
          : "No. The update rolls out automatically. Join the waitlist if you want to be among the first testers.",
    },
    {
      q: lang === "fr" ? "Quoi de neuf dans v2 ?" : "What's new in v2?",
      a:
        lang === "fr"
          ? "Découverte plus intelligente, workflow unifié Find it → Track it → Pay it, automatisations plus rapides, payouts améliorés et un dashboard entièrement repensé."
          : "Smarter discovery, a unified Find it → Track it → Pay it workflow, faster automations, improved payouts, and a fully redesigned dashboard.",
    },
  ];

  const steps: {
    step: string;
    brand: string;
    titleSuffix: string;
    desc: string;
    visual: V2StepVisual;
    delay: string;
  }[] = [
    {
      step: "01",
      brand: "Find it",
      titleSuffix: lang === "fr" ? ", plus vite" : ", faster",
      desc:
        lang === "fr"
          ? "Découverte IA repensée : meilleurs matchs créateurs, filtres plus précis et résultats plus pertinents pour votre niche."
          : "Redesigned AI discovery: better creator matches, sharper filters, and more relevant results for your niche.",
      visual: "find",
      delay: "",
    },
    {
      step: "02",
      brand: "Track it",
      titleSuffix: lang === "fr" ? ", tout au même endroit" : ", all in one place",
      desc:
        lang === "fr"
          ? "Campagnes, outreach, ventes et commissions dans un seul flux. Fini les allers-retours entre outils."
          : "Campaigns, outreach, sales, and commissions in one flow. No more jumping between tools.",
      visual: "track",
      delay: "fade-up-delay-1",
    },
    {
      step: "03",
      brand: "Pay it",
      titleSuffix: lang === "fr" ? ", en un clic" : ", in one click",
      desc:
        lang === "fr"
          ? "Paiements créateurs simplifiés, solde plus clair et Stripe Connect plus fluide pour les marques en croissance."
          : "Simpler creator payouts, a clearer balance view, and smoother Stripe Connect for growing brands.",
      visual: "pay",
      delay: "fade-up-delay-2",
    },
  ];

  const highlights = [
    lang === "fr" ? "Dashboard repensé" : "Redesigned dashboard",
    lang === "fr" ? "Découverte IA améliorée" : "Improved AI discovery",
    lang === "fr" ? "Automatisations plus rapides" : "Faster automations",
    lang === "fr" ? "Payouts & solde refaits" : "Rebuilt payouts & balance",
    lang === "fr" ? "Workflow Find → Track → Pay" : "Find → Track → Pay workflow",
    lang === "fr" ? "Performance & vitesse" : "Performance & speed",
  ];

  const submitWaitlist = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formData.firstName,
          email: formData.email,
          expectations: formData.note,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        console.error("waitlist error:", data.error);
        return;
      }
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: BG,
        color: TEXT,
        fontFamily: FONT,
        letterSpacing: "-0.02em",
      }}
    >
      <nav
        className="navbar"
        style={{
          justifyContent: "space-between",
          width: "min(560px, calc(100vw - 32px))",
          paddingRight: 20,
        }}
      >
        <Link href="/" className="nav-logo" aria-label="Trackit home">
          <img src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="Trackit" />
        </Link>
        <Link
          href="/"
          style={{
            color: TEXT,
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            fontFamily: FONT,
          }}
        >
          {lang === "fr" ? "Retour à l'accueil" : "Back to home"}
        </Link>
      </nav>

      <section style={{ width: "100%", padding: "48px 24px 64px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <img
            src="https://i.ibb.co/20jgns98/navbarlogotransparent.png"
            alt="Trackit"
            style={{
              height: "clamp(88px, 14vw, 128px)",
              width: "auto",
              display: "block",
              margin: "0 auto 6px",
              objectFit: "contain",
              transform: "translateX(-4px)",
            }}
          />
          <div
            style={{
              color: BLUE,
              fontSize: "clamp(18px, 2.8vw, 22px)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              marginBottom: 24,
              textAlign: "center",
              transform: "translateX(-4px)",
            }}
          >
            Trackit v2
          </div>
          <h1
            className="hero-headline"
            style={{ fontSize: "clamp(36px, 5vw, 52px)", marginBottom: 16 }}
          >
            <span className="hero-line-wrap">
              {lang === "fr" ? "Trouver. Suivre. Payer." : "Find. Track. Pay."}
            </span>
            <span className="hero-line-wrap">
              {lang === "fr" ? "Tout repensé" : "All rebuilt"}
              <span style={{ color: BLUE, fontSize: "1.55em", fontWeight: 600 }}>.</span>
            </span>
          </h1>
          <p className="hero-sub" style={{ marginBottom: 20 }}>
            {lang === "fr"
              ? "Trackit v2 arrive bientôt. Une expérience plus rapide, plus intelligente et plus fluide pour découvrir des créateurs, suivre vos ventes et payer vos commissions — au même endroit."
              : "Trackit v2 is coming soon. A faster, smarter, smoother experience to find creators, track sales, and pay commissions — all in one place."}
          </p>
          <button
            type="button"
            className="hero-cta"
            onClick={() => setPanelOpen(true)}
            style={{ marginTop: 8, marginBottom: 12, border: "none", cursor: "pointer" }}
          >
            <RemindMeLabel lang={lang} />
          </button>
          <p style={{ fontSize: 13, color: SUBTEXT, margin: 0, letterSpacing: "-0.01em" }}>
            {lang === "fr" ? "Recevez un rappel quand la v2 sort." : "Get a reminder when v2 launches."}
          </p>
        </div>
      </section>

      <section className="v2-process-section">
        <h2 className="v2-process-section__title">
          {lang === "fr" ? "Ce qui change avec v2" : "What's changing in v2"}
        </h2>
        <p className="v2-process-section__sub">
          {lang === "fr"
            ? "Trois piliers repensés autour de votre workflow : Find it, Track it, Pay it."
            : "Three pillars rebuilt around your workflow: Find it, Track it, Pay it."}
        </p>
        <div className="v2-process-grid">
          {steps.map((item) => (
            <article
              key={item.step}
              className={`v2-process-card fade-up visible ${item.delay}`.trim()}
            >
              <div className="v2-process-card__top">
                <span className="v2-process-card__badge">
                  <span className="v2-process-card__dot" aria-hidden />
                  {lang === "fr" ? `Étape ${item.step}` : `Step ${item.step}`}
                </span>
              </div>
              <div className="v2-process-card__visual">
                <V2ProcessVisual type={item.visual} lang={lang} />
              </div>
              <div className="v2-process-card__footer">
                <h3 className="v2-process-card__title">
                  <span className="v2-process-card__brand">{item.brand}</span>
                  {item.titleSuffix}
                </h3>
                <p className="v2-process-card__desc">{item.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 560, margin: "0 auto", padding: "0 24px 72px" }}>
        <div
          style={{
            background: "#fff",
            border: "1px solid #EFEFEF",
            borderRadius: 20,
            padding: 32,
          }}
        >
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 6px", letterSpacing: "-0.03em" }}>
            {lang === "fr" ? "Aperçu de v2" : "v2 preview"}
          </h2>
          <p style={{ fontSize: 14, color: SUBTEXT, margin: "0 0 28px", letterSpacing: "-0.01em" }}>
            {lang === "fr"
              ? "Une refonte complète autour de votre workflow : Find it, Track it, Pay it."
              : "A full redesign built around your workflow: Find it, Track it, Pay it."}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
            {highlights.map((item) => (
              <div
                key={item}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  background: "#FAFAFA",
                  borderRadius: 10,
                  border: "1px solid #F0F0F0",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: BLUE,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 14, fontWeight: 500, color: TEXT, letterSpacing: "-0.02em" }}>
                  {item}
                </span>
              </div>
            ))}
          </div>

          <div className="affiliation-earnings-card">
            <div className="affiliation-earnings-label">
              {lang === "fr" ? "Soyez parmi les premiers" : "Be among the first"}
            </div>
            <div className="affiliation-earnings-amount">v2</div>
            <div className="affiliation-earnings-sub">
              {lang === "fr" ? "accès anticipé · notifications en priorité" : "early access · priority updates"}
            </div>
            <button
              type="button"
              className="affiliation-earnings-cta"
              onClick={() => setPanelOpen(true)}
              style={{ border: "none", cursor: "pointer" }}
            >
              <RemindMeLabel lang={lang} />
            </button>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 640, margin: "0 auto", padding: "0 24px 72px" }}>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 600,
            textAlign: "center",
            marginBottom: 24,
            letterSpacing: "-0.03em",
          }}
        >
          {lang === "fr" ? "Questions fréquentes" : "Common questions"}
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {FAQ_ITEMS.map((item, i) => {
            const open = openFaq === i;
            return (
              <div
                key={item.q}
                style={{
                  background: "#fff",
                  border: "1px solid #EFEFEF",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(open ? null : i)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "16px 18px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: FONT,
                    textAlign: "left",
                    letterSpacing: "-0.02em",
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{item.q}</span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{
                      flexShrink: 0,
                      transform: open ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s ease",
                    }}
                  >
                    <path d="M6 9l6 6 6-6" stroke="#9A9A9A" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
                {open && (
                  <div
                    style={{
                      padding: "0 18px 16px",
                      fontSize: 14,
                      color: SUBTEXT,
                      lineHeight: 1.6,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section
        style={{
          background: "#fff",
          border: "1px solid #EFEFEF",
          margin: "0 24px 48px",
          borderRadius: 20,
          padding: "56px 32px",
          textAlign: "center",
          maxWidth: 960,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        <h2
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: TEXT,
            margin: "0 0 12px",
            letterSpacing: "-0.04em",
          }}
        >
          {lang === "fr" ? "Prêt pour la suite ?" : "Ready for what's next?"}
        </h2>
        <p
          style={{
            fontSize: 15,
            color: SUBTEXT,
            margin: "0 auto 28px",
            maxWidth: 420,
            lineHeight: 1.6,
            letterSpacing: "-0.01em",
          }}
        >
          {lang === "fr"
            ? "Inscrivez-vous à la liste d'attente v2 et soyez notifié en premier quand l'accès anticipé ouvre."
            : "Join the v2 waitlist and get notified first when early access opens."}
        </p>
        <button
          type="button"
          className="hero-cta"
          onClick={() => setPanelOpen(true)}
          style={{ marginTop: 0, border: "none", cursor: "pointer" }}
        >
          <RemindMeLabel lang={lang} />
        </button>
      </section>

      {panelOpen && (
        <>
          <div
            onClick={() => setPanelOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 999 }}
          />
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              height: "100vh",
              width: "min(480px, 100vw)",
              background: "#fff",
              zIndex: 1000,
              boxShadow: "-8px 0 40px rgba(0,0,0,0.12)",
              overflowY: "auto",
              padding: 32,
              fontFamily: "Inter, sans-serif",
            }}
          >
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              style={{
                position: "absolute",
                top: 20,
                right: 20,
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 20,
                color: "#9A9A9A",
              }}
            >
              ×
            </button>

            {submitted ? (
              <div style={{ textAlign: "center", paddingTop: 80 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🚀</div>
                <h2
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: "-0.03em",
                    margin: "0 0 8px",
                    color: "#1A1A1A",
                  }}
                >
                  {lang === "fr" ? "Vous êtes sur la liste !" : "You're on the list!"}
                </h2>
                <p style={{ fontSize: 14, color: "#7A7A7A", lineHeight: 1.6 }}>
                  {lang === "fr"
                    ? "Nous vous préviendrons dès que l'accès anticipé à Trackit v2 ouvre."
                    : "We'll notify you as soon as Trackit v2 early access opens."}
                </p>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 28 }}>
                  <div
                    style={{
                      display: "inline-block",
                      background: "#F0F6FF",
                      color: "#0047FF",
                      borderRadius: 8,
                      padding: "4px 12px",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      marginBottom: 12,
                    }}
                  >
                    {lang === "fr" ? "TRACKIT V2" : "TRACKIT V2"}
                  </div>
                  <h2
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      letterSpacing: "-0.03em",
                      margin: "0 0 6px",
                      color: "#1A1A1A",
                    }}
                  >
                    {lang === "fr" ? "Rejoindre la liste d'attente" : "Join the waitlist"}
                  </h2>
                  <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0 }}>
                    {lang === "fr"
                      ? "Soyez notifié en premier. Accès anticipé avant le lancement public."
                      : "Get notified first. Early access before the public launch."}
                  </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#1A1A1A",
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      {lang === "fr" ? "Prénom *" : "First name *"}
                    </label>
                    <input
                      value={formData.firstName}
                      onChange={(e) => setFormData((p) => ({ ...p, firstName: e.target.value }))}
                      placeholder={lang === "fr" ? "Prénom" : "First name"}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        border: "1px solid #E5E5E5",
                        borderRadius: 10,
                        fontSize: 13,
                        fontFamily: "inherit",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#1A1A1A",
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      {lang === "fr" ? "E-mail *" : "Email *"}
                    </label>
                    <input
                      value={formData.email}
                      onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                      placeholder="your@email.com"
                      type="email"
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        border: "1px solid #E5E5E5",
                        borderRadius: 10,
                        fontSize: 13,
                        fontFamily: "inherit",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#1A1A1A",
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      {lang === "fr" ? "Qu'attendez-vous de v2 ?" : "What are you most excited about?"}
                    </label>
                    <textarea
                      value={formData.note}
                      onChange={(e) => setFormData((p) => ({ ...p, note: e.target.value }))}
                      placeholder={
                        lang === "fr"
                          ? "Découverte IA, payouts, automatisations..."
                          : "AI discovery, payouts, automations..."
                      }
                      rows={4}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        border: "1px solid #E5E5E5",
                        borderRadius: 10,
                        fontSize: 13,
                        fontFamily: "inherit",
                        outline: "none",
                        boxSizing: "border-box",
                        resize: "none",
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    disabled={!canSubmit || submitting}
                    onClick={() => void submitWaitlist()}
                    style={{
                      background: canSubmit ? "#0047FF" : "#E5E5E5",
                      color: canSubmit ? "#fff" : "#9A9A9A",
                      border: "none",
                      borderRadius: 10,
                      padding: "13px 20px",
                      fontSize: 14,
                      fontWeight: 700,
                      fontFamily: "inherit",
                      cursor: canSubmit ? "pointer" : "not-allowed",
                      letterSpacing: "-0.02em",
                      marginTop: 4,
                    }}
                  >
                    {submitting
                      ? lang === "fr"
                        ? "Envoi en cours..."
                        : "Sending..."
                      : <RemindMeLabel lang={lang} />}
                  </button>

                  <p style={{ fontSize: 12, color: "#7A7A7A", textAlign: "center", margin: 0 }}>
                    {lang === "fr" ? "Déjà client ? " : "Already a customer? "}
                    <Link href="/auth" style={{ color: "#0047FF", textDecoration: "none" }}>
                      {lang === "fr" ? "Se connecter" : "Sign in"}
                    </Link>
                  </p>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </main>
  );
}
