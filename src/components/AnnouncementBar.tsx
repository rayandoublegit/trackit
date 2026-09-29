"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/useLang";
import "./announcement-bar.css";

// Q4 announcement above the landing nav. The countdown is computed after mount
// so the server and the first client render agree.

export const ANNOUNCEMENT_KEY = "trackit_annc_q4_2026";
const BLACK_FRIDAY = new Date(2026, 10, 27);

function daysUntil(target: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function AnnouncementBar({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const fr = lang === "fr";
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    setDays(daysUntil(BLACK_FRIDAY));
  }, []);

  return (
    <div className="annc" role="region" aria-label={fr ? "Annonce" : "Announcement"}>
      <span className="annc__shine" aria-hidden />
      <a className="annc__body" href="/auth?mode=signup">
        <span className="annc__tag">Q4</span>
        <span className="annc__text">
          <strong>{fr ? "Le Q4 commence." : "Q4 is here."}</strong>
          <span className="annc__long">
            {fr
              ? " Black Friday, Cyber Monday, Noël : lancez vos campagnes créateurs maintenant."
              : " Black Friday, Cyber Monday, holidays: launch your creator campaigns now."}
          </span>
          <span className="annc__short">{fr ? " Préparez vos campagnes." : " Plan your campaigns."}</span>
        </span>
        {days !== null && days >= 0 ? (
          <span className="annc__count">
            <span className="annc__dot" aria-hidden />
            {days === 0
              ? fr
                ? "Black Friday aujourd’hui"
                : "Black Friday today"
              : fr
                ? `Black Friday J-${days}`
                : `Black Friday in ${days} days`}
          </span>
        ) : null}
        <span className="annc__cta">
          {fr ? "Préparer mon Q4" : "Get Q4-ready"}
          <span aria-hidden>→</span>
        </span>
      </a>
      <button type="button" className="annc__close" onClick={onClose} aria-label={fr ? "Fermer l’annonce" : "Close the announcement"}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
