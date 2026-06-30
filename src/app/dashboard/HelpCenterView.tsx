"use client";

import type { CSSProperties, ReactNode } from "react";
import { useLang } from "@/lib/useLang";
import type { PlanTier } from "@/lib/plan-limits";

const SUPPORT_EMAIL = "support@trackit.app";
const CALENDLY_BOOKING_URL = process.env.NEXT_PUBLIC_CALENDLY_BOOKING_URL ?? "";
const BLUE = "#0047FF";

const btnPrimary: CSSProperties = {
  background: BLUE,
  color: "#FFFFFF",
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
  letterSpacing: "-0.02em",
  textDecoration: "none",
  display: "inline-block",
};

function IconBubble({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: "#EEF4FF",
        color: BLUE,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

function MailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function HelpCenterRow({
  icon,
  title,
  text,
  action,
  href,
  onClick,
  external,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action: string;
  href?: string;
  onClick?: () => void;
  external?: boolean;
}) {
  const cta = href ? (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      style={btnPrimary}
    >
      {action} →
    </a>
  ) : (
    <button type="button" onClick={onClick} style={btnPrimary}>
      {action} →
    </button>
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        padding: "24px 0",
        borderBottom: "1px solid #EFEFEF",
      }}
    >
      <IconBubble>{icon}</IconBubble>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", margin: "0 0 6px", letterSpacing: "-0.02em" }}>{title}</h2>
        <p style={{ fontSize: 14, color: "#7A7A7A", margin: "0 0 16px", lineHeight: 1.55, letterSpacing: "-0.02em" }}>{text}</p>
        {cta}
      </div>
    </div>
  );
}

export function HelpCenterView({ isMobile, plan: _plan = "free" }: { isMobile?: boolean; plan?: PlanTier }) {
  const lang = useLang();

  return (
    <div style={{ minHeight: "100%", background: "#FFFFFF" }}>
      <div
        style={{
          paddingTop: isMobile ? 56 : 40,
          paddingRight: isMobile ? 16 : 40,
          paddingBottom: isMobile ? 16 : 24,
          paddingLeft: isMobile ? 16 : 40,
          background: "#FFFFFF",
        }}
      >
        <h1
          style={{
            fontSize: isMobile ? 26 : 34,
            fontWeight: 600,
            color: "#1A1A1A",
            letterSpacing: "-0.04em",
            margin: 0,
            marginBottom: 6,
          }}
        >
          {lang === "fr" ? "Centre d'aide" : "Help Center"}
        </h1>
        <p style={{ fontSize: 15, color: "#7A7A7A", letterSpacing: "-0.02em", margin: 0, maxWidth: 560, lineHeight: 1.5 }}>
          {lang === "fr"
            ? "Une question ? Écrivez-nous ou réservez un appel avec l'équipe Trackit."
            : "Have a question? Email us or book a call with the Trackit team."}
        </p>
      </div>

      <div
        style={{
          padding: isMobile ? "8px 16px 40px" : "8px 40px 48px",
          maxWidth: 640,
        }}
      >
        <HelpCenterRow
          icon={<MailIcon />}
          title={lang === "fr" ? "Support par email" : "Email support"}
          text={
            lang === "fr"
              ? `Envoyez-nous un message à ${SUPPORT_EMAIL}. Nous répondons sous 24h.`
              : `Send us a message at ${SUPPORT_EMAIL}. We reply within 24 hours.`
          }
          action={lang === "fr" ? "Envoyer un email" : "Send email"}
          href={`mailto:${SUPPORT_EMAIL}`}
        />

        <HelpCenterRow
          icon={<CalendarIcon />}
          title={lang === "fr" ? "Réserver un appel" : "Book a call"}
          text={
            lang === "fr"
              ? "Planifiez un créneau de 15 minutes avec notre équipe pour de l'aide personnalisée."
              : "Schedule a 15-minute slot with our team for personalized help."
          }
          action={lang === "fr" ? "Réserver un appel" : "Book a call"}
          href={CALENDLY_BOOKING_URL || undefined}
          external
          onClick={
            CALENDLY_BOOKING_URL
              ? undefined
              : () =>
                  window.alert(
                    lang === "fr"
                      ? "Le lien Calendly sera bientôt disponible."
                      : "Calendly booking link coming soon."
                  )
          }
        />
      </div>
    </div>
  );
}
