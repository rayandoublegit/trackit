"use client";

import type { CampaignKind } from "@/lib/dashboard-navigation";
import { useLang } from "@/lib/useLang";
import "./sample-preview.css";
import "./campaign-kind.css";

const CHOICES: { kind: CampaignKind; title: { en: string; fr: string }; text: { en: string; fr: string }; tags: { en: string[]; fr: string[] } }[] = [
  {
    kind: "affiliate",
    title: { en: "Affiliation", fr: "Affiliation" },
    text: {
      en: "A code, a commission, and the sales tied to the campaign.",
      fr: "Un code, une commission, et les ventes rattachées à la campagne.",
    },
    tags: { en: ["Promo code", "Commission", "Payouts"], fr: ["Code promo", "Commission", "Paiements"] },
  },
  {
    kind: "gifting",
    title: { en: "Gifting", fr: "Gifting" },
    text: {
      en: "A gifted product, a frozen contract, a parcel, then the video.",
      fr: "Un produit offert, un contrat figé, un colis, puis la vidéo.",
    },
    tags: { en: ["Contract", "Parcel", "Ad rights"], fr: ["Contrat", "Colis", "Droits ads"] },
  },
  {
    kind: "rpm",
    title: { en: "RPM", fr: "RPM" },
    text: {
      en: "A rate per thousand views, tracked on the published videos.",
      fr: "Un tarif pour mille vues, suivi sur les vidéos publiées.",
    },
    tags: { en: ["Views", "Rate per 1,000", "Payouts"], fr: ["Vues", "Tarif pour 1 000", "Paiements"] },
  },
];

function KindScene({ kind }: { kind: CampaignKind }) {
  if (kind === "affiliate") {
    return (
      <div className="ck-scene ck-scene--affiliate" aria-hidden>
        <span className="ck-code">SUMMER15</span>
        <span className="ck-coin">€</span>
        <span className="ck-coin" style={{ animationDelay: ".6s" }}>€</span>
        <span className="ck-coin" style={{ animationDelay: "1.2s" }}>€</span>
      </div>
    );
  }
  if (kind === "gifting") {
    return (
      <div className="ck-scene ck-scene--gifting" aria-hidden>
        <span className="ck-track" />
        <span className="ck-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5v-9z" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M3 7.5L12 12l9-4.5M12 12v9" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    );
  }
  return (
    <div className="ck-scene ck-scene--rpm" aria-hidden>
      {[38, 62, 48, 80, 66, 94].map((h, i) => (
        <span key={i} style={{ ["--h" as string]: `${h}%`, animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  );
}

export function CampaignKindChooser({
  isMobile,
  onPick,
  onClose,
}: {
  isMobile?: boolean;
  onPick: (kind: CampaignKind) => void;
  onClose: () => void;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  return (
    <div className={`ck-page${isMobile ? " is-mobile" : ""}`}>
      <div className="ck-inner">
        <button type="button" onClick={onClose} className="sp-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {fr ? "Retour" : "Back"}
        </button>
        <h1>{fr ? "Créer une campagne" : "Create a campaign"}</h1>
        <p className="ck-lead">
          {fr
            ? "Un seul départ. La suite dépend de ce que vous voulez mesurer."
            : "One start. The rest of the flow depends on what you want to measure."}
        </p>
        <div className="ck-grid">
          {CHOICES.map((choice, i) => (
            <button
              key={choice.kind}
              type="button"
              onClick={() => onPick(choice.kind)}
              className="ck-card"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <KindScene kind={choice.kind} />
              <strong>{choice.title[lang]}</strong>
              <span className="ck-text">{choice.text[lang]}</span>
              <span className="ck-tags">
                {choice.tags[lang].map((tag) => (
                  <em key={tag}>{tag}</em>
                ))}
              </span>
              <span className="ck-go" aria-hidden>→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
