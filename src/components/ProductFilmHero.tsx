"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/useLang";
import { prefersReducedMotion } from "@/app/dashboard/sample-motion";
import { Avatar, CampaignScene, DiscoverScene, GiftingScene, PayoutScene } from "@/app/auth/AuthShowcase";
import "@/app/auth/auth-showcase.css";
import "./product-film.css";

// Landing hero: a motion "film" of the product, played scene by scene like a
// video (chapters, progress, play/pause). Every person and number is fictional.

type Lang = "en" | "fr";
type ChapterId = "find" | "mino" | "track" | "gift" | "pay";

const SCENE_MS = 7200;

const CHAPTERS: { id: ChapterId; label: Record<Lang, string>; caption: Record<Lang, string> }[] = [
  {
    id: "find",
    label: { fr: "Trouver", en: "Find" },
    caption: {
      fr: "Cherchez par niche, taille et vues. Les bons créateurs remontent, vous les sauvegardez en un clic.",
      en: "Search by niche, size and views. The right creators come up; save them in one click.",
    },
  },
  {
    id: "mino",
    label: { fr: "Mino, l’IA", en: "Mino, the AI" },
    caption: {
      fr: "Demandez en français. Mino lit vos campagnes, vos ventes et vos créateurs, puis agit pour vous.",
      en: "Ask in plain words. Mino reads your campaigns, sales and creators, then acts for you.",
    },
  },
  {
    id: "track",
    label: { fr: "Suivre", en: "Track" },
    caption: {
      fr: "Chaque vente est rattachée au créateur qui l’a générée, en direct.",
      en: "Every sale is tied to the creator who drove it, live.",
    },
  },
  {
    id: "gift",
    label: { fr: "Offrir", en: "Gift" },
    caption: {
      fr: "Contrat signé, colis suivi, vidéo validée : le gifting de bout en bout.",
      en: "Signed contract, tracked parcel, approved video: gifting end to end.",
    },
  },
  {
    id: "pay",
    label: { fr: "Payer", en: "Pay" },
    caption: {
      fr: "Les commissions se calculent seules. Vous payez tout le monde en un clic.",
      en: "Commissions calculate themselves. Pay everyone in one click.",
    },
  },
];

function MinoScene({ lang }: { lang: Lang }) {
  const fr = lang === "fr";
  const rows = [
    { name: "Sarah Cole", hue: 222, sales: 26, revenue: fr ? "1 780 €" : "$1,780" },
    { name: "Luna Park", hue: 312, sales: 14, revenue: fr ? "1 120 €" : "$1,120" },
    { name: "Nora Diallo", hue: 160, sales: 9, revenue: fr ? "585 €" : "$585" },
  ];
  return (
    <div className="ash-scene pf-mino">
      <div className="pf-mino__ask">
        <span className="pf-mino__you">{fr ? "Vous" : "You"}</span>
        <p className="pf-mino__typed">
          {fr ? "Quels créateurs ont le plus vendu ce mois-ci ?" : "Which creators sold the most this month?"}
        </p>
      </div>
      <div className="pf-mino__answer">
        <span className="pf-mino__badge" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z" />
          </svg>
          Mino
        </span>
        <span className="pf-mino__dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <div className="pf-mino__reply">
          <p>{fr ? "Vos 3 meilleures créatrices sur 30 jours :" : "Your top 3 creators over 30 days:"}</p>
          <ul>
            {rows.map((r, i) => (
              <li key={r.name} style={{ animationDelay: `${2.6 + i * 0.25}s` }}>
                <Avatar name={r.name} hue={r.hue} size={24} />
                <span>{r.name}</span>
                <em>
                  {r.sales} {fr ? "ventes" : "sales"}
                </em>
                <strong>{r.revenue}</strong>
              </li>
            ))}
          </ul>
          <div className="pf-mino__actions">
            <span className="pf-mino__chip is-primary">{fr ? "Relancer les 4 créateurs inactifs" : "Nudge the 4 idle creators"}</span>
            <span className="pf-mino__chip">{fr ? "Créer une campagne" : "Create a campaign"}</span>
          </div>
          <div className="pf-mino__done">
            <span aria-hidden>✓</span>
            {fr ? "4 messages personnalisés envoyés" : "4 personal messages sent"}
          </div>
        </div>
      </div>
    </div>
  );
}

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function ProductFilm() {
  const lang = useLang();
  const fr = lang === "fr";
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const frameRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<number>(0);

  // Only play while on screen.
  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) setPlaying(false);
  }, []);

  const running = playing && visible;

  useEffect(() => {
    if (!running) return;
    startRef.current = performance.now() - elapsed;
    let raf = 0;
    const tick = (now: number) => {
      const e = now - startRef.current;
      if (e >= SCENE_MS) {
        setIndex((i) => (i + 1) % CHAPTERS.length);
        setElapsed(0);
        return;
      }
      setElapsed(e);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // elapsed is read once when (re)starting on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, index]);

  const chapter = CHAPTERS[index];
  const total = SCENE_MS * CHAPTERS.length;
  const current = index * SCENE_MS + elapsed;

  const goTo = (i: number) => {
    setIndex(i);
    setElapsed(0);
    setPlaying(true);
  };

  return (
    <div className={`pf-player${running ? " is-playing" : ""}`}>
      <div className="pf-frame" ref={frameRef}>
        <div className="pf-chrome" aria-hidden>
          <i />
          <i />
          <i />
          <span>thentrack.it/{chapter.id === "mino" ? "ai" : chapter.id === "find" ? "discover" : chapter.id === "gift" ? "gifting" : chapter.id === "pay" ? "payouts" : "campaigns"}</span>
        </div>
        <div className="pf-bg" aria-hidden>
          <span className="ash-blob ash-blob--a" />
          <span className="ash-blob ash-blob--b" />
          <span className="ash-grid" />
        </div>
        <div className="pf-stage" key={`${chapter.id}-${index}`} aria-live="polite">
          {chapter.id === "find" ? <DiscoverScene lang={lang} /> : null}
          {chapter.id === "mino" ? <MinoScene lang={lang} /> : null}
          {chapter.id === "track" ? <CampaignScene lang={lang} /> : null}
          {chapter.id === "gift" ? <GiftingScene lang={lang} /> : null}
          {chapter.id === "pay" ? <PayoutScene lang={lang} /> : null}
        </div>
        <p className="pf-caption" key={`cap-${index}`}>
          <b>{String(index + 1).padStart(2, "0")}</b> {chapter.caption[lang]}
        </p>
        {!playing ? (
          <button type="button" className="pf-bigplay" onClick={() => setPlaying(true)} aria-label={fr ? "Lire le film" : "Play the film"}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="pf-controls">
        <button
          type="button"
          className="pf-play"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? (fr ? "Pause" : "Pause") : fr ? "Lecture" : "Play"}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <div className="pf-chapters" role="tablist" aria-label={fr ? "Chapitres" : "Chapters"}>
          {CHAPTERS.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              className={`pf-chapter${i === index ? " is-on" : i < index ? " is-done" : ""}`}
              onClick={() => goTo(i)}
            >
              <span className="pf-chapter__bar">
                <span style={i === index ? { transform: `scaleX(${elapsed / SCENE_MS})` } : undefined} />
              </span>
              <span className="pf-chapter__label">{c.label[lang]}</span>
            </button>
          ))}
        </div>
        <span className="pf-time">
          {fmtTime(current)} / {fmtTime(total)}
        </span>
      </div>
    </div>
  );
}

export function ProductFilmHero() {
  const lang = useLang();
  const fr = lang === "fr";
  return (
    <section className="pf-hero" aria-labelledby="pf-title">
      <div className="pf-hero__glow" aria-hidden />
      <div className="pf-hero__copy">
        <span className="pf-pill">
          <span className="pf-pill__dot" aria-hidden />
          {fr ? "Nouveau · Mino, l’IA qui pilote vos créateurs" : "New · Mino, the AI that runs your creators"}
        </span>
        <h1 id="pf-title">
          {fr ? (
            <>
              Créateurs, cadeaux, ventes.
              <br />
              <span className="pf-grad">Pilotés par l’IA.</span>
            </>
          ) : (
            <>
              Creators, gifts, sales.
              <br />
              <span className="pf-grad">Run by AI.</span>
            </>
          )}
        </h1>
        <p className="pf-lead">
          {fr
            ? "Trackit réunit la recherche de créateurs, les campagnes d’affiliation, le gifting avec contrat et le paiement des commissions. Mino, l’IA intégrée, répond à vos questions et fait le travail répétitif à votre place."
            : "Trackit brings creator search, affiliate campaigns, gifting with contracts and commission payouts together. Mino, the built-in AI, answers your questions and does the repetitive work for you."}
        </p>
        <div className="pf-ctas">
          <a className="pf-cta" href="/auth?mode=signup">
            {fr ? "Commencer gratuitement" : "Start for free"}
            <span aria-hidden>→</span>
          </a>
          <a className="pf-cta pf-cta--ghost" href="#features">
            {fr ? "Voir les fonctionnalités" : "See the features"}
          </a>
        </div>
        <ul className="pf-proof">
          <li>{fr ? "Sans carte bancaire" : "No credit card"}</li>
          <li>{fr ? "Shopify en 1 clic" : "Shopify in 1 click"}</li>
          <li>{fr ? "TikTok, Instagram, YouTube" : "TikTok, Instagram, YouTube"}</li>
        </ul>
      </div>
      <ProductFilm />
    </section>
  );
}
