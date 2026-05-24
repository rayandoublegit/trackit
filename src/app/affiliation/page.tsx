"use client";

import Link from "next/link";
import { useState } from "react";
import { useLang } from "@/lib/useLang";
import { formatCurrency } from "@/lib/useCurrency";

const FONT = "'InterDisplay', 'Inter Display', sans-serif";
const BLUE = "#0047FF";
const TEXT = "#1A1A1A";
const SUBTEXT = "#7A7A7A";
const BG = "#fff";

export default function AffiliationPage() {
  const lang = useLang();
  const [users, setUsers] = useState(10);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    country: "",
    instagram: "",
    tiktok: "",
    youtube: "",
    twitter: "",
    linkedin: "",
    facebook: "",
    why: "",
    phone: "",
  });
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const earnings = Math.round(users * 49 * 0.2);

  const canSubmit =
    formData.firstName &&
    formData.lastName &&
    formData.email &&
    formData.password &&
    formData.country &&
    formData.phone &&
    formData.why &&
    agreed;

  const FAQ_ITEMS = [
    {
      q: lang === "fr" ? "Comment obtenir mon lien affilié ?" : "How do I get my affiliate link?",
      a:
        lang === "fr"
          ? "Inscrivez-vous gratuitement, allez dans Paramètres → Affiliation, et votre lien unique est prêt à être partagé."
          : "Sign up for free, go to Settings → Affiliation, and your unique link is ready to share.",
    },
    {
      q: lang === "fr" ? "Quand suis-je payé ?" : "When do I get paid?",
      a:
        lang === "fr"
          ? `Les paiements sont traités le 1er de chaque mois pour les gains du mois précédent. Paiement minimum de ${formatCurrency(20, lang)}.`
          : `Payouts are processed on the 1st of every month for the previous month's earnings. Minimum payout is ${formatCurrency(20, lang)}.`,
    },
    {
      q: lang === "fr" ? "Combien de temps dure le cookie ?" : "How long does the cookie last?",
      a:
        lang === "fr"
          ? "90 jours. Si quelqu'un clique sur votre lien et s'inscrit dans les 90 jours, la vente vous est attribuée."
          : "90 days. If someone clicks your link and signs up within 90 days, the sale is attributed to you.",
    },
    {
      q: lang === "fr" ? "Et s'ils annulent ?" : "What if they cancel?",
      a:
        lang === "fr"
          ? "Vous arrêtez de gagner quand ils annulent. Mais s'ils se réabonnent, les commissions reprennent automatiquement."
          : "You stop earning when they cancel. But if they resubscribe, commissions resume automatically.",
    },
    {
      q: lang === "fr" ? "Y a-t-il un processus de validation ?" : "Is there an approval process?",
      a:
        lang === "fr"
          ? "Non. Inscrivez-vous et commencez à partager immédiatement. Pas de taille d'audience minimum, pas de validation."
          : "No. Sign up and start sharing immediately. No minimum audience size, no application review.",
    },
  ];

  const steps = [
    {
      step: "1",
      title: lang === "fr" ? "Partagez votre lien" : "Share your link",
      desc:
        lang === "fr"
          ? "Publiez-le partout. Bio, vidéos, newsletters, posts. Votre lien unique suit chaque inscription que vous générez."
          : "Post it anywhere. Bio, videos, newsletters, posts. Your unique link tracks every signup you drive.",
      image: "/images/link.png",
    },
    {
      step: "2",
      title: lang === "fr" ? "Ils s'inscrivent et paient" : "They sign up and pay",
      desc:
        lang === "fr"
          ? "Votre audience découvre Trackit. Quand ils passent à Basic ou Pro, la vente vous est attribuée."
          : "Your audience discovers Trackit. When they upgrade to Basic or Pro, the sale is attributed to you.",
      image: "/images/signupandpay.png",
    },
    {
      step: "3",
      title: lang === "fr" ? "Vous êtes payé" : "You get paid",
      desc:
        lang === "fr"
          ? "Commission récurrente de 20% déposée chaque mois. Tant qu'ils restent abonnés, vous continuez à gagner."
          : "20% recurring commission deposited every month. As long as they stay subscribed, you keep earning.",
      image: "/images/getpaid.png",
    },
  ];

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

      {/* Hero */}
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
          {lang === "fr" ? "Affiliation" : "Affiliate"}
        </div>
        <h1
          className="hero-headline"
          style={{ fontSize: "clamp(36px, 5vw, 52px)", marginBottom: 16 }}
        >
          <span className="hero-line-wrap">{lang === "fr" ? "Gagnez 20% sur chaque" : "Earn 20% on every"}</span>
          <span className="hero-line-wrap">
            {lang === "fr" ? "utilisateur que vous apportez" : "user you bring"}
            <span style={{ color: BLUE, fontSize: "1.55em", fontWeight: 600 }}>.</span>
          </span>
        </h1>
        <p className="hero-sub" style={{ marginBottom: 20 }}>
          {lang === "fr"
            ? "Partagez votre lien unique. Chaque fois que quelqu'un s'inscrit et paie, vous gagnez 20% de son abonnement. Chaque mois. Sans plafond. Sans minimum."
            : "Share your unique link. Every time someone signs up and pays, you earn 20% of their subscription. Every month. No cap. No minimum."}
        </p>
        <button
          type="button"
          className="hero-cta"
          onClick={() => setPanelOpen(true)}
          style={{ marginTop: 8, marginBottom: 12, border: "none", cursor: "pointer" }}
        >
          {lang === "fr" ? "Devenir partenaire →" : "Start partnering →"}
        </button>
        <p style={{ fontSize: 13, color: SUBTEXT, margin: 0, letterSpacing: "-0.01em" }}>
          {lang === "fr" ? "Gratuit. Sans validation requise." : "Free to join. No approval needed."}
        </p>
        </div>
      </section>

      {/* How it works */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px 72px" }}>
        <h2
          style={{
            fontSize: "clamp(28px, 4vw, 36px)",
            fontWeight: 600,
            textAlign: "center",
            marginBottom: 32,
            letterSpacing: "-0.03em",
          }}
        >
          {lang === "fr" ? "Comment devenir affilié ?" : "How to become an affiliate?"}
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
          }}
        >
          {steps.map((item) => (
            <div
              key={item.step}
              style={{
                background: "#fff",
                border: "1px solid #EFEFEF",
                borderRadius: 16,
                padding: 24,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  color: BLUE,
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 14,
                  letterSpacing: "-0.02em",
                }}
              >
                {lang === "fr" ? `Étape ${item.step}` : `Step ${item.step}`}
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px", letterSpacing: "-0.03em" }}>
                {item.title}
              </h3>
              <p style={{ fontSize: 14, color: SUBTEXT, margin: 0, lineHeight: 1.55, letterSpacing: "-0.01em" }}>
                {item.desc}
              </p>
              {"image" in item && item.image && (
                <img
                  src={item.image}
                  alt={item.title}
                  className="affiliation-step-image"
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Revenue simulator */}
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
            {lang === "fr" ? "Calculez vos gains" : "Calculate your earnings"}
          </h2>
          <p style={{ fontSize: 14, color: SUBTEXT, margin: "0 0 28px", letterSpacing: "-0.01em" }}>
            {lang === "fr"
              ? "Chaque utilisateur que vous apportez vous rapporte 20% de son abonnement. Chaque mois."
              : "Every user you bring earns you 20% of their subscription. Every month."}
          </p>

          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: "#555", letterSpacing: "-0.01em" }}>
                {lang === "fr" ? "Utilisateurs référencés" : "Users you refer"}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>
                {users}{" "}
                {lang === "fr"
                  ? users === 1
                    ? "utilisateur"
                    : "utilisateurs"
                  : users === 1
                    ? "user"
                    : "users"}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={500}
              step={1}
              value={users}
              onChange={(e) => setUsers(Number(e.target.value))}
              style={{ width: "100%", accentColor: BLUE }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <span style={{ fontSize: 11, color: "#9A9A9A" }}>
                1 {lang === "fr" ? "utilisateur" : "user"}
              </span>
              <span style={{ fontSize: 11, color: "#9A9A9A" }}>
                500 {lang === "fr" ? "utilisateurs" : "users"}
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "12px 0",
              marginBottom: 24,
              borderBottom: "1px solid #F0F0F0",
            }}
          >
            <span style={{ fontSize: 13, color: SUBTEXT, letterSpacing: "-0.01em" }}>
              {lang === "fr"
                ? `Votre commission (20% de ${formatCurrency(49, lang)}/mois par utilisateur)`
                : `Your commission (20% of ${formatCurrency(49, lang)}/mo per user)`}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: BLUE, letterSpacing: "-0.02em" }}>
              {formatCurrency(earnings, lang)}/mo
            </span>
          </div>

          <div className="affiliation-earnings-card">
            <div className="affiliation-earnings-label">
              {lang === "fr" ? "Vos gains mensuels estimés" : "Your estimated monthly earnings"}
            </div>
            <div className="affiliation-earnings-amount">{formatCurrency(earnings, lang)}</div>
            <div className="affiliation-earnings-sub">
              {lang === "fr" ? "par mois · récurrent" : "per month · recurring"}
            </div>
            <button
              type="button"
              className="affiliation-earnings-cta"
              onClick={() => setPanelOpen(true)}
              style={{ border: "none", cursor: "pointer" }}
            >
              {lang === "fr" ? "Obtenir mon lien affilié →" : "Get my affiliate link →"}
            </button>
          </div>
        </div>
      </section>

      {/* FAQ */}
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

      {/* CTA */}
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
          {lang === "fr" ? "Prêt à commencer à gagner ?" : "Ready to start earning?"}
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
            ? "Rejoignez notre programme partenaire gratuitement. Sans validation. Sans trafic minimum."
            : "Join our partner program for free. No approval. No minimum traffic."}
        </p>
        <button
          type="button"
          className="hero-cta"
          onClick={() => setPanelOpen(true)}
          style={{ marginTop: 0, border: "none", cursor: "pointer" }}
        >
          {lang === "fr" ? "Obtenir mon lien affilié →" : "Get my affiliate link →"}
        </button>
      </section>

      {panelOpen && (
        <>
          <div
            onClick={() => setPanelOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 999 }}
          />
          <div style={{
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
            fontFamily: "Inter, sans-serif"
          }}>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              style={{ position: "absolute", top: 20, right: 20, background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9A9A9A" }}
            >×</button>

            {submitted ? (
              <div style={{ textAlign: "center", paddingTop: 80 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
                <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", margin: "0 0 8px", color: "#1A1A1A" }}>Application sent!</h2>
                <p style={{ fontSize: 14, color: "#7A7A7A", lineHeight: 1.6 }}>We'll review your application and send your affiliate link within 24 hours.</p>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 28 }}>
                  <div style={{ display: "inline-block", background: "#F0F6FF", color: "#0047FF", borderRadius: 8, padding: "4px 12px", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", marginBottom: 12 }}>PARTNER PROGRAM</div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", margin: "0 0 6px", color: "#1A1A1A" }}>Apply to become a partner</h2>
                  <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0 }}>Earn 20% on every user you bring. Takes 2 minutes.</p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", display: "block", marginBottom: 6 }}>First name *</label>
                    <input
                      value={formData.firstName}
                      onChange={e => setFormData(p => ({ ...p, firstName: e.target.value }))}
                      placeholder="First name"
                      style={{ width: "100%", padding: "10px 14px", border: "1px solid #E5E5E5", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", display: "block", marginBottom: 6 }}>Last name *</label>
                    <input
                      value={formData.lastName}
                      onChange={e => setFormData(p => ({ ...p, lastName: e.target.value }))}
                      placeholder="Last name"
                      style={{ width: "100%", padding: "10px 14px", border: "1px solid #E5E5E5", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", display: "block", marginBottom: 6 }}>Email *</label>
                    <input
                      value={formData.email}
                      onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                      placeholder="your@email.com"
                      type="email"
                      style={{ width: "100%", padding: "10px 14px", border: "1px solid #E5E5E5", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", display: "block", marginBottom: 6 }}>Password *</label>
                    <input
                      value={formData.password}
                      onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
                      placeholder="Create a password"
                      type="password"
                      style={{ width: "100%", padding: "10px 14px", border: "1px solid #E5E5E5", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", display: "block", marginBottom: 6 }}>Country *</label>
                    <input
                      value={formData.country}
                      onChange={e => setFormData(p => ({ ...p, country: e.target.value }))}
                      placeholder="Your country"
                      style={{ width: "100%", padding: "10px 14px", border: "1px solid #E5E5E5", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", marginTop: 4 }}>Your platforms</div>

                  <div>
                    <input
                      value={formData.instagram}
                      onChange={e => setFormData(p => ({ ...p, instagram: e.target.value }))}
                      placeholder="https://instagram.com/yourhandle"
                      style={{ width: "100%", padding: "10px 14px", border: "1px solid #E5E5E5", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  <div>
                    <input
                      value={formData.tiktok}
                      onChange={e => setFormData(p => ({ ...p, tiktok: e.target.value }))}
                      placeholder="https://tiktok.com/@yourhandle"
                      style={{ width: "100%", padding: "10px 14px", border: "1px solid #E5E5E5", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  <div>
                    <input
                      value={formData.youtube}
                      onChange={e => setFormData(p => ({ ...p, youtube: e.target.value }))}
                      placeholder="https://youtube.com/yourchannel"
                      style={{ width: "100%", padding: "10px 14px", border: "1px solid #E5E5E5", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  <div>
                    <input
                      value={formData.twitter}
                      onChange={e => setFormData(p => ({ ...p, twitter: e.target.value }))}
                      placeholder="https://x.com/yourhandle"
                      style={{ width: "100%", padding: "10px 14px", border: "1px solid #E5E5E5", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  <div>
                    <input
                      value={formData.linkedin}
                      onChange={e => setFormData(p => ({ ...p, linkedin: e.target.value }))}
                      placeholder="https://linkedin.com/in/yourhandle"
                      style={{ width: "100%", padding: "10px 14px", border: "1px solid #E5E5E5", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  <div>
                    <input
                      value={formData.facebook}
                      onChange={e => setFormData(p => ({ ...p, facebook: e.target.value }))}
                      placeholder="https://facebook.com/yourpage"
                      style={{ width: "100%", padding: "10px 14px", border: "1px solid #E5E5E5", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", display: "block", marginBottom: 6 }}>How would you promote Trackit? *</label>
                    <textarea
                      value={formData.why}
                      onChange={e => setFormData(p => ({ ...p, why: e.target.value }))}
                      placeholder="I will promote Trackit on (YouTube, TikTok, blog, newsletter, community...) I will promote it by (detailed method...) I can bring approximately (how many users)..."
                      rows={5}
                      style={{ width: "100%", padding: "10px 14px", border: "1px solid #E5E5E5", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", resize: "none" }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", display: "block", marginBottom: 6 }}>Phone number (include country code e.g. +33, +1) *</label>
                    <input
                      value={formData.phone}
                      onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                      placeholder="+33 6 12 34 56 78"
                      type="tel"
                      style={{ width: "100%", padding: "10px 14px", border: "1px solid #E5E5E5", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "#7A7A7A", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={e => setAgreed(e.target.checked)}
                      style={{ marginTop: 2 }}
                    />
                    <span>By signing up, you agree to the Trackit Partner Agreement</span>
                  </label>

                  <button
                    type="button"
                    disabled={!canSubmit || submitting}
                    onClick={async () => {
                      if (!formData.firstName || !formData.email || !agreed) return;
                      setSubmitting(true);
                      try {
                        const { createClient } = await import("@supabase/supabase-js");
                        const supabase = createClient(
                          process.env.NEXT_PUBLIC_SUPABASE_URL!,
                          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                        );
                        await supabase.from("affiliate_applications").insert({
                          first_name: formData.firstName,
                          last_name: formData.lastName,
                          email: formData.email,
                          country: formData.country,
                          phone: formData.phone,
                          instagram: formData.instagram,
                          tiktok: formData.tiktok,
                          youtube: formData.youtube,
                          twitter: formData.twitter,
                          linkedin: formData.linkedin,
                          facebook: formData.facebook,
                          promotion_plan: formData.why
                        });
                        setSubmitted(true);
                      } finally {
                        setSubmitting(false);
                      }
                    }}
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
                      marginTop: 4
                    }}
                  >
                    {submitting ? "Sending..." : "Submit application →"}
                  </button>

                  <p style={{ fontSize: 12, color: "#7A7A7A", textAlign: "center", margin: 0 }}>
                    Already have an account? <a href="#" style={{ color: "#0047FF", textDecoration: "none" }}>Sign in</a>
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
