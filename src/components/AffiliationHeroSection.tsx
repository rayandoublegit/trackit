import type { ReactNode } from "react";
import type { Lang } from "@/lib/useLang";

function IndicatorIcon({
  className,
  label,
  badge,
  children,
}: {
  className: string;
  label: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <div className={`affiliation-hero__icon ${className}`} aria-hidden>
      <div className="affiliation-hero__app">{children}</div>
      {badge ? <span className="affiliation-hero__badge">{badge}</span> : null}
    </div>
  );
}

export function AffiliationHeroSection({ lang }: { lang: Lang }) {
  const title =
    lang === "fr"
      ? {
          line1: "Partagez votre lien, créez du contenu",
          line2Prefix: "et ",
          emphasis: "gagnez",
          line2Suffix: " de l'argent",
          line3: "sur toutes les inscriptions.",
        }
      : {
          line1: "Share your link, create content",
          line2Prefix: "and ",
          emphasis: "earn",
          line2Suffix: " money",
          line3: "on all signups.",
        };

  const stats =
    lang === "fr"
      ? [
          "50 % à vie sur chaque abonnement.",
          "70 % sur les ventes le premier mois.",
          "Cookie 90 jours — vente attribuée.",
        ]
      : [
          "50% lifetime on every subscription.",
          "70% on sales in the first month.",
          "90-day cookie — sale attributed.",
        ];

  const ariaLabel =
    lang === "fr"
      ? "Partagez votre lien, créez du contenu, gagnez de l'argent sur toutes les inscriptions."
      : "Share your link, create content, earn money on all signups.";

  return (
    <div className="affiliation-hero" aria-label={ariaLabel}>
      <div className="affiliation-hero__icons-layer">
        <IndicatorIcon className="affiliation-hero__icon--views" label="Views" badge="12K+">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </IndicatorIcon>

        <IndicatorIcon className="affiliation-hero__icon--star" label="Rating" badge="4.9">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#F59E0B" aria-hidden>
            <path d="M12 2l2.9 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 7.1-1.01L12 2z" />
          </svg>
        </IndicatorIcon>

        <IndicatorIcon className="affiliation-hero__icon--chart affiliation-hero__icon--sm" label="Growth" badge="+38%">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 18h16M7 14l3-4 3 2 5-7"
              stroke="#10B981"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M15 5h4v4" stroke="#10B981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IndicatorIcon>

        <IndicatorIcon className="affiliation-hero__icon--comment affiliation-hero__icon--sm" label="Comments" badge="89">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 9.5a7 7 0 0 1 14 0v.4a7 7 0 0 1-7 7c-1.2 0-2.3-.3-3.3-.8L5 19l1.4-3.6A6.9 6.9 0 0 1 5 9.9V9.5Z"
              stroke="#0EA5E9"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
          </svg>
        </IndicatorIcon>

        <IndicatorIcon className="affiliation-hero__icon--share affiliation-hero__icon--sm" label="Shares" badge="2K+">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M10 13a4.5 4.5 0 0 0 3.2 1.35M14 7.5a4.5 4.5 0 1 1 0 7.9M10 17.65a4.5 4.5 0 1 1 0-7.9"
              stroke="#0047FF"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </IndicatorIcon>

        <IndicatorIcon className="affiliation-hero__icon--users affiliation-hero__icon--sm" label="Signups" badge="150+">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="9" cy="8" r="3.2" stroke="#7C3AED" strokeWidth="1.7" />
            <path
              d="M4.5 18.5c.6-2.8 2.6-4.5 4.5-4.5s3.9 1.7 4.5 4.5"
              stroke="#7C3AED"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <circle cx="16.5" cy="9.5" r="2.4" stroke="#7C3AED" strokeWidth="1.5" />
            <path
              d="M14.5 18.5c.4-1.8 1.8-3 3.5-3 1.2 0 2.2.6 2.8 1.6"
              stroke="#7C3AED"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </IndicatorIcon>

        <IndicatorIcon className="affiliation-hero__icon--coin" label="Commission" badge="20%">
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden>
            <defs>
              <linearGradient id="aff-hero-coin-face" x1="6" y1="5" x2="24" y2="25" gradientUnits="userSpaceOnUse">
                <stop stopColor="#5B9AFF" />
                <stop offset="1" stopColor="#0047FF" />
              </linearGradient>
              <linearGradient id="aff-hero-coin-shine" x1="15" y1="6" x2="15" y2="14" gradientUnits="userSpaceOnUse">
                <stop stopColor="#fff" stopOpacity="0.5" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <ellipse cx="15" cy="23.5" rx="9" ry="2.4" fill="#D8E6FF" />
            <ellipse cx="15" cy="20.8" rx="9" ry="2.6" fill="#B4CCFF" stroke="#0047FF" strokeOpacity="0.25" strokeWidth="0.6" />
            <circle cx="15" cy="13.5" r="9.5" fill="url(#aff-hero-coin-face)" />
            <circle cx="15" cy="13.5" r="9.5" fill="url(#aff-hero-coin-shine)" />
            <circle cx="15" cy="13.5" r="7.8" stroke="#fff" strokeOpacity="0.22" strokeWidth="0.9" />
            <path
              d="M11.8 11.2c.7-1.6 2.2-2.6 4.1-2.6 1.6 0 3 .7 3.8 1.8M12.1 15.2c.8 1.1 2.2 1.8 3.8 1.8 1.9 0 3.4-1 4.1-2.6"
              stroke="#fff"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path d="M10.5 13.2h6.2" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </IndicatorIcon>

        <IndicatorIcon className="affiliation-hero__icon--like" label="Likes" badge="420">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 20.25s-7-4.35-7-10.2a4.2 4.2 0 0 1 7.35-2.55A4.2 4.2 0 0 1 19 10.05c0 5.85-7 10.2-7 10.2Z"
              stroke="#E11D48"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </IndicatorIcon>
      </div>

      <div className="affiliation-hero__content">
        <h1 className="affiliation-hero__title">
          <span className="affiliation-hero__title-line">{title.line1}</span>
          <span className="affiliation-hero__title-line">
            {title.line2Prefix}
            <span className="affiliation-hero__emphasis">{title.emphasis}</span>
            {title.line2Suffix}
          </span>
          <span className="affiliation-hero__title-line">{title.line3}</span>
        </h1>
        <div className="affiliation-hero__stats">
          {stats.map((stat) => (
            <p key={stat}>{stat}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
