"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLang } from "@/lib/useLang";
import { prefersReducedMotion } from "@/app/dashboard/sample-motion";
import { Avatar } from "@/app/auth/AuthShowcase";
import "@/app/auth/auth-showcase.css";
import "./product-film.css";

// Landing hero: centered headline, then a launch-style product film. The film
// is one timeline in milliseconds; every shot derives its frame from it, so
// pause, loop and reduced motion are exact. Every person and number is fictional.

type Lang = "en" | "fr";
type ShotId = "find" | "flash" | "mino" | "track" | "gift" | "pay" | "outro";

const SHOTS: { id: ShotId; ms: number }[] = [
  { id: "find", ms: 6600 },
  { id: "flash", ms: 2200 },
  { id: "mino", ms: 5600 },
  { id: "track", ms: 5000 },
  { id: "gift", ms: 5000 },
  { id: "pay", ms: 4600 },
  { id: "outro", ms: 3600 },
];
const STARTS = SHOTS.reduce<number[]>((acc, s, i) => [...acc, i === 0 ? 0 : acc[i - 1] + SHOTS[i - 1].ms], []);
const TOTAL = STARTS[STARTS.length - 1] + SHOTS[SHOTS.length - 1].ms;
// Frame shown when motion is reduced: the search results, fully settled.
const STILL_AT = 5900;

// ── Timing helpers ─────────────────────────────────────────────
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const outCubic = (v: number) => 1 - Math.pow(1 - v, 3);
const outBack = (v: number) => {
  const c1 = 1.5;
  return 1 + (c1 + 1) * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2);
};
const prog = (p: number, at: number, dur: number) => clamp((p - at) / dur);

/** Pop-in: fades, lifts and de-blurs from `at` over `dur` ms. */
function pop(p: number, at: number, dur = 460, lift = 16): CSSProperties {
  const v = prog(p, at, dur);
  if (v >= 1) return {};
  const e = outBack(v);
  return {
    opacity: outCubic(v),
    transform: `translateY(${(1 - e) * lift}px) scale(${0.9 + 0.1 * e})`,
    filter: `blur(${(1 - outCubic(v)) * 8}px)`,
  };
}

function money(n: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency: lang === "fr" ? "EUR" : "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

function Typed({ text, p, at, speed = 36 }: { text: string; p: number; at: number; speed?: number }) {
  const n = Math.max(0, Math.min(text.length, Math.floor((p - at) / speed)));
  const typing = n > 0 && n < text.length;
  return (
    <span className="pf-typed">
      {text.slice(0, typing ? n - 1 : n)}
      {typing ? <span className="pf-typed__last">{text.slice(n - 1, n)}</span> : null}
      <span className="pf-caret" />
    </span>
  );
}

function Cursor({ p, from, at, click, dx = 180, dy = 150 }: { p: number; from: number; at: number; click: number; dx?: number; dy?: number }) {
  const m = outCubic(prog(p, from, at - from));
  const pressed = p >= click && p < click + 180;
  return (
    <svg
      className="pf-cursor"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      style={{
        opacity: prog(p, from, 160),
        transform: `translate(${(1 - m) * dx}px, ${(1 - m) * dy}px) scale(${pressed ? 0.82 : 1})`,
      }}
    >
      <path d="M5 3l14 7.5-6.2 1.6L10 18.5z" fill="#0b0d12" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function Sparkle({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

// ── Shots ──────────────────────────────────────────────────────

const CREATORS = [
  { name: "Sarah Cole", handle: "@sarah.glow", hue: 222, niche: { fr: "Beauté", en: "Beauty" }, followers: "84,2 k", views: "31 k", match: 91 },
  { name: "Luna Park", handle: "@lunapark", hue: 312, niche: { fr: "Skincare", en: "Skincare" }, followers: "142 k", views: "58 k", match: 96 },
  { name: "Nora Diallo", handle: "@nora.d", hue: 160, niche: { fr: "Lifestyle", en: "Lifestyle" }, followers: "56,8 k", views: "22 k", match: 88 },
  { name: "Maya Chen", handle: "@mayachen", hue: 28, niche: { fr: "Beauté", en: "Beauty" }, followers: "97,5 k", views: "40 k", match: 90 },
  { name: "Inès Morel", handle: "@ines.m", hue: 268, niche: { fr: "Mode", en: "Fashion" }, followers: "63 k", views: "19 k", match: 84 },
  { name: "Zoé Martin", handle: "@zoe.mtn", hue: 190, niche: { fr: "Bien-être", en: "Wellness" }, followers: "48,1 k", views: "26 k", match: 86 },
];

function FindShot({ p, lang }: { p: number; lang: Lang }) {
  const fr = lang === "fr";
  const lift = outCubic(prog(p, 2500, 560));
  const picked = p >= 4300;
  const added = p >= 4900;
  return (
    <div className="pf-shot pf-find">
      <div
        className="pf-bar-pos"
        style={{
          top: `calc(${50 - 50 * lift}% + ${lift} * var(--pf-bar-top))`,
          transform: `translate(-50%, ${-50 * (1 - lift)}%) scale(${1 - 0.1 * lift})`,
        }}
      >
        <div className="pf-bar" style={pop(p, 0, 520, 24)}>
        <SearchIcon />
        <Typed p={p} at={420} text={fr ? "Trouve les créateurs qui vendent vraiment." : "Find the creators who actually sell."} />
        <span className="pf-bar__go" style={{ opacity: lift, transform: `scale(${0.6 + 0.4 * lift})` }}>
          {fr ? "Rechercher" : "Search"}
        </span>
        </div>
      </div>
      <div className="pf-filters" style={pop(p, 2750, 400)}>
        <span>{fr ? "Beauté" : "Beauty"}</span>
        <span>10 k – 150 k</span>
        <span>TikTok</span>
        <span>{fr ? "France" : "France"}</span>
        <b>{fr ? "212 résultats" : "212 results"}</b>
      </div>
      <div className="pf-grid">
        {CREATORS.map((c, i) => (
          <div key={c.name} className={`pf-card${i === 1 && picked ? " is-picked" : ""}`} style={pop(p, 2950 + i * 110, 520, 30)}>
            <div className="pf-card__top">
              <Avatar name={c.name} hue={c.hue} size={34} />
              <div>
                <strong>{c.name}</strong>
                <span>{c.handle}</span>
              </div>
              <span className={`pf-card__add${i === 1 && added ? " is-done" : ""}`}>
                {i === 1 && added ? "✓" : "+"}
                {i === 1 ? <Cursor p={p} from={3900} at={4700} click={4760} dx={170} dy={140} /> : null}
              </span>
            </div>
            <div className="pf-card__stats">
              <span>
                <em>{fr ? "Abonnés" : "Followers"}</em>
                {c.followers}
              </span>
              <span>
                <em>{fr ? "Vues moy." : "Avg. views"}</em>
                {c.views}
              </span>
              <span className="pf-card__match">
                <em>Match</em>
                {c.match} %
              </span>
            </div>
            <span className="pf-tag">{c.niche[lang]}</span>
          </div>
        ))}
      </div>
      <div className="pf-toast" style={pop(p, 5000, 420, 24)}>
        <span className="pf-dot-ok">✓</span>
        {fr ? "Luna Park ajoutée à « Rentrée 2026 »" : "Luna Park added to “Fall 2026”"}
      </div>
    </div>
  );
}

function FlashShot({ p, lang }: { p: number; lang: Lang }) {
  const words = lang === "fr" ? ["Trouvez.", "Suivez.", "Offrez.", "Payez."] : ["Find.", "Track.", "Gift.", "Pay."];
  const each = 480;
  const i = Math.min(words.length - 1, Math.floor(p / each));
  const q = p - i * each;
  const v = outCubic(clamp(q / 240));
  const last = i === words.length - 1;
  return (
    <div className="pf-shot pf-flash">
      <span className="pf-flash__kicker" style={pop(p, 0, 300, 8)}>
        Trackit
      </span>
      <span
        key={i}
        className={`pf-flash__word${i % 2 ? " is-accent" : ""}${last ? " is-last" : ""}`}
        style={{ opacity: v, transform: `scale(${1.28 - 0.28 * v})`, filter: `blur(${(1 - v) * 16}px)` }}
      >
        {words[i]}
      </span>
      <div className="pf-flash__ticks">
        {words.map((w, j) => (
          <i key={w} className={j <= i ? "is-on" : ""} />
        ))}
      </div>
    </div>
  );
}

function MinoShot({ p, lang }: { p: number; lang: Lang }) {
  const fr = lang === "fr";
  const rows = [
    { name: "Sarah Cole", hue: 222, sales: 26, revenue: 1780, w: 100 },
    { name: "Luna Park", hue: 312, sales: 14, revenue: 1120, w: 63 },
    { name: "Nora Diallo", hue: 160, sales: 9, revenue: 585, w: 33 },
  ];
  const thinking = p >= 1900 && p < 2500;
  const pressed = p >= 4300 && p < 4480;
  return (
    <div className="pf-shot pf-mino">
      <div className="pf-bar pf-bar--top pf-bar--mino" style={pop(p, 0, 460, 20)}>
        <span className="pf-mino__badge">
          <Sparkle />
          Mino
        </span>
        <Typed p={p} at={320} speed={32} text={fr ? "Quels créateurs ont le plus vendu ce mois-ci ?" : "Which creators sold the most this month?"} />
      </div>
      {thinking ? (
        <div className="pf-mino__thinking">
          <Sparkle size={13} />
          {fr ? "Mino analyse 48 créateurs et 1 204 ventes…" : "Mino is reading 48 creators and 1,204 sales…"}
        </div>
      ) : null}
      <div className="pf-answer" style={pop(p, 2450, 480, 26)}>
        <p className="pf-answer__title">
          <Sparkle size={13} />
          {fr ? "Vos 3 meilleures créatrices sur 30 jours" : "Your top 3 creators over 30 days"}
        </p>
        {rows.map((r, i) => {
          const g = outCubic(prog(p, 2700 + i * 160, 800));
          return (
            <div key={r.name} className="pf-answer__row" style={pop(p, 2600 + i * 140, 420)}>
              <Avatar name={r.name} hue={r.hue} size={28} />
              <span className="pf-answer__name">{r.name}</span>
              <span className="pf-answer__track">
                <span style={{ width: `${r.w * g}%` }} />
              </span>
              <em>
                {Math.round(r.sales * g)} {fr ? "ventes" : "sales"}
              </em>
              <strong>{money(r.revenue * g, lang)}</strong>
            </div>
          );
        })}
        <div className="pf-answer__hint" style={pop(p, 3600, 400)}>
          {fr ? "4 créateurs n’ont rien publié depuis 14 jours." : "4 creators haven’t posted in 14 days."}
        </div>
        <div className="pf-answer__actions" style={pop(p, 3800, 400)}>
          <span className={`pf-chip is-primary${pressed ? " is-pressed" : ""}`}>
            {fr ? "Relancer les 4 créateurs" : "Nudge the 4 creators"}
            <Cursor p={p} from={3900} at={4250} click={4300} dx={120} dy={70} />
          </span>
          <span className="pf-chip">{fr ? "Créer une campagne" : "Create a campaign"}</span>
        </div>
        <div className="pf-answer__done" style={pop(p, 4550, 400)}>
          <span className="pf-dot-ok">✓</span>
          {fr ? "4 messages personnalisés envoyés" : "4 personal messages sent"}
        </div>
      </div>
    </div>
  );
}

const SALES = [
  { name: "Sarah Cole", hue: 222, code: "SARAH10", amount: 89 },
  { name: "Luna Park", hue: 312, code: "LUNA15", amount: 124 },
  { name: "Maya Chen", hue: 28, code: "MAYA", amount: 64 },
  { name: "Nora Diallo", hue: 160, code: "NORA10", amount: 142 },
];

function TrackShot({ p, lang }: { p: number; lang: Lang }) {
  const fr = lang === "fr";
  const count = outCubic(prog(p, 300, 2200));
  const draw = outCubic(prog(p, 400, 2300));
  const shown = SALES.filter((_, i) => p >= 1000 + i * 800);
  const path = "M0 170 C 40 160, 70 150, 100 152 S 160 120, 200 118 S 260 130, 300 96 S 360 70, 400 74 S 470 40, 520 22";
  return (
    <div className="pf-shot pf-track">
      <div className="pf-panel pf-track__main" style={pop(p, 0, 480, 24)}>
        <span className="pf-track__label">{fr ? "Ventes générées par vos créateurs · septembre" : "Sales driven by your creators · September"}</span>
        <div className="pf-track__big">
          {money(48920 * count, lang)}
          <span className="pf-delta" style={pop(p, 2400, 380, 8)}>
            +38 %
          </span>
        </div>
        <svg className="pf-chart" viewBox="0 0 520 190" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="pf-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0047ff" stopOpacity=".22" />
              <stop offset="100%" stopColor="#0047ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path} L 520 190 L 0 190 Z`} fill="url(#pf-area)" style={{ opacity: draw }} />
          <path d={path} fill="none" stroke="#0047ff" strokeWidth="3.5" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - draw} />
          <circle cx="520" cy="22" r="6" fill="#0047ff" style={{ opacity: draw >= 0.98 ? 1 : 0 }} />
        </svg>
      </div>
      <div className="pf-feed">
        <span className="pf-feed__live">
          <i /> {fr ? "En direct" : "Live"}
        </span>
        {[...shown].reverse().map((s) => (
          <div key={s.code} className="pf-sale" style={pop(p, 1000 + SALES.indexOf(s) * 800, 460, -18)}>
            <Avatar name={s.name} hue={s.hue} size={30} />
            <div>
              <strong>{fr ? "Nouvelle vente" : "New sale"}</strong>
              <span>
                {s.name} · {fr ? "code" : "code"} {s.code}
              </span>
            </div>
            <b>+{money(s.amount, lang)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function GiftShot({ p, lang }: { p: number; lang: Lang }) {
  const fr = lang === "fr";
  const steps = [
    { t: fr ? "Contrat signé" : "Contract signed", d: fr ? "Droits d’usage 12 mois" : "12-month usage rights" },
    { t: fr ? "Colis expédié" : "Parcel shipped", d: "Colissimo · 6A 184 229" },
    { t: fr ? "Colis reçu" : "Parcel delivered", d: fr ? "Livré le 14 sept." : "Delivered Sep 14" },
    { t: fr ? "Vidéo validée" : "Video approved", d: fr ? "38 s · prête à publier" : "38 s · ready to post" },
  ];
  const at = (i: number) => 700 + i * 750;
  const doneCount = steps.filter((_, i) => p >= at(i)).length;
  const fill = outCubic(prog(p, 700, 750 * 3));
  const views = outCubic(prog(p, 3200, 1500));
  return (
    <div className="pf-shot pf-gift">
      <div className="pf-panel pf-gift__product" style={pop(p, 0, 480, 24)}>
        <div className="pf-gift__img">
          <span />
        </div>
        <strong>{fr ? "Coffret Glow Routine" : "Glow Routine box"}</strong>
        <span>
          {fr ? "Offert à" : "Gifted to"} Luna Park · {money(89, lang)}
        </span>
      </div>
      <div className="pf-panel pf-steps" style={pop(p, 150, 480, 24)}>
        <span className="pf-steps__rail">
          <span style={{ height: `${fill * 100}%` }} />
        </span>
        {steps.map((s, i) => (
          <div key={s.t} className={`pf-step${i < doneCount ? " is-done" : ""}`}>
            <span className="pf-step__dot" style={i < doneCount ? pop(p, at(i), 360, 0) : undefined}>
              {i < doneCount ? "✓" : i + 1}
            </span>
            <div>
              <strong>{s.t}</strong>
              <span>{s.d}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="pf-phone" style={pop(p, 300, 520, 30)}>
        <div className={`pf-phone__screen${doneCount === 4 ? " is-live" : ""}`}>
          {doneCount === 4 ? (
            <>
              <span className="pf-phone__play" style={pop(p, at(3), 400, 0)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              <span className="pf-phone__meta">
                @lunapark
                <b>{Math.round(128 * views)} k {fr ? "vues" : "views"}</b>
              </span>
            </>
          ) : (
            <span className="pf-phone__wait">{fr ? "Vidéo en attente…" : "Waiting for video…"}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function PayShot({ p, lang }: { p: number; lang: Lang }) {
  const fr = lang === "fr";
  const rows = [
    { name: "Sarah Cole", hue: 222, sales: 26, amount: 1240 },
    { name: "Luna Park", hue: 312, sales: 21, amount: 980 },
    { name: "Maya Chen", hue: 28, sales: 15, amount: 745 },
    { name: "Nora Diallo", hue: 160, sales: 9, amount: 447 },
  ];
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const click = 1800;
  const state = p < click ? "idle" : p < 2250 ? "busy" : "done";
  return (
    <div className="pf-shot pf-pay">
      <div className="pf-panel pf-pay__table" style={pop(p, 0, 480, 24)}>
        <div className="pf-pay__head">
          <div>
            <strong>{fr ? "Commissions · septembre" : "Commissions · September"}</strong>
            <span>{fr ? "Calculées automatiquement sur les ventes suivies" : "Calculated from tracked sales"}</span>
          </div>
          <span className={`pf-paybtn is-${state}${p >= click && p < click + 180 ? " is-pressed" : ""}`}>
            {state === "idle" ? `${fr ? "Tout payer" : "Pay all"} · ${money(total, lang)}` : state === "busy" ? <i className="pf-spin" /> : `✓ ${fr ? "Payé" : "Paid"}`}
            <Cursor p={p} from={900} at={1700} click={click} dx={-160} dy={150} />
            {state === "done" ? <span className="pf-burst" style={{ opacity: 1 - prog(p, 2250, 700), transform: `scale(${1 + 1.6 * outCubic(prog(p, 2250, 700))})` }} /> : null}
          </span>
        </div>
        {rows.map((r, i) => {
          const paid = p >= 2300 + i * 160;
          return (
            <div key={r.name} className="pf-pay__row" style={pop(p, 200 + i * 110, 420)}>
              <Avatar name={r.name} hue={r.hue} size={30} />
              <span className="pf-pay__name">{r.name}</span>
              <em>
                {r.sales} {fr ? "ventes" : "sales"}
              </em>
              <strong>{money(r.amount, lang)}</strong>
              <span key={paid ? "paid" : "due"} className={`pf-status${paid ? " is-paid" : ""}`} style={paid ? pop(p, 2300 + i * 160, 320, 0) : undefined}>
                {paid ? (fr ? "Payé" : "Paid") : fr ? "À payer" : "Due"}
              </span>
            </div>
          );
        })}
        <div className="pf-pay__total" style={pop(p, 3000, 400)}>
          {fr ? "Versé à 4 créateurs" : "Paid to 4 creators"}
          <b>{money(total, lang)}</b>
        </div>
      </div>
    </div>
  );
}

function OutroShot({ p, lang }: { p: number; lang: Lang }) {
  const fr = lang === "fr";
  return (
    <div className="pf-shot pf-outro">
      <span className="pf-outro__ring" style={{ opacity: 0.9 - 0.9 * prog(p, 100, 1400), transform: `scale(${0.4 + 1.8 * outCubic(prog(p, 100, 1400))})` }} />
      <img className="pf-outro__logo" src="https://i.ibb.co/20jgns98/navbarlogotransparent.png" alt="" style={pop(p, 120, 560, 20)} />
      <p className="pf-outro__line" style={pop(p, 650, 500, 18)}>
        {fr ? "Créateurs, cadeaux, ventes." : "Creators, gifts, sales."}
        <br />
        <span>{fr ? "Pilotés par l’IA." : "Run by AI."}</span>
      </p>
      <span className="pf-outro__cta" style={pop(p, 1150, 480, 14)}>
        {fr ? "Commencer gratuitement" : "Start for free"} <span>→</span>
      </span>
    </div>
  );
}

function Shot({ id, p, lang }: { id: ShotId; p: number; lang: Lang }) {
  switch (id) {
    case "find":
      return <FindShot p={p} lang={lang} />;
    case "flash":
      return <FlashShot p={p} lang={lang} />;
    case "mino":
      return <MinoShot p={p} lang={lang} />;
    case "track":
      return <TrackShot p={p} lang={lang} />;
    case "gift":
      return <GiftShot p={p} lang={lang} />;
    case "pay":
      return <PayShot p={p} lang={lang} />;
    case "outro":
      return <OutroShot p={p} lang={lang} />;
  }
}

// ── Player ─────────────────────────────────────────────────────

export function ProductFilm() {
  const lang = useLang();
  const fr = lang === "fr";
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [box, setBox] = useState({ scale: 1, narrow: false });
  const canvasRef = useRef<HTMLDivElement>(null);
  const tRef = useRef(0);

  // Scale the fixed-size stage to the canvas; phones get a taller layout.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      const narrow = w < 600;
      setBox({ narrow, scale: w / (narrow ? 520 : 960) });
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Only play while on screen.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setPlaying(false);
      tRef.current = STILL_AT;
      setT(STILL_AT);
    }
  }, []);

  const running = playing && visible;

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      tRef.current = (tRef.current + Math.min(64, now - last)) % TOTAL;
      last = now;
      setT(tRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  let index = 0;
  while (index < SHOTS.length - 1 && t >= STARTS[index + 1]) index += 1;
  const shot = SHOTS[index];
  const p = t - STARTS[index];

  // Launch-style cut: each shot zooms in out of a blur, drifts, and blurs out.
  const inV = outCubic(clamp(p / 420));
  const outV = clamp((shot.ms - p) / 300);
  const cam: CSSProperties = {
    opacity: Math.min(inV, outV),
    transform: `scale(${(1 + 0.035 * (p / shot.ms)) * (1 + (1 - inV) * 0.08) * (1 - (1 - outV) * 0.05)})`,
    filter: inV < 1 || outV < 1 ? `blur(${Math.max((1 - inV) * 12, (1 - outV) * 10)}px)` : undefined,
  };
  const W = box.narrow ? 520 : 960;
  const H = box.narrow ? 640 : 540;

  const seek = (i: number) => {
    tRef.current = STARTS[i];
    setT(STARTS[i]);
    setPlaying(true);
  };

  return (
    <div className="pf-player">
      <div className="pf-bezel">
        <div ref={canvasRef} className={`pf-canvas is-${shot.id}`} style={{ aspectRatio: `${W} / ${H}` }}>
          <p className="pf-sr">
            {fr
              ? "Démo animée de Trackit : recherche de créateurs, Mino l’IA, suivi des ventes, gifting et paiement des commissions."
              : "Animated Trackit demo: creator search, Mino the AI, sales tracking, gifting and commission payouts."}
          </p>
          <div className={`pf-stage${box.narrow ? " is-narrow" : ""}`} style={{ width: W, height: H, transform: `scale(${box.scale})` }} aria-hidden>
            <div className="pf-cam" key={`${shot.id}-${lang}`} style={cam}>
              <Shot id={shot.id} p={p} lang={lang} />
            </div>
            <span className="pf-sweep" key={`sweep-${index}`} style={{ transform: `translateX(${-120 + 260 * outCubic(clamp(p / 650))}%)`, opacity: p < 650 ? 1 : 0 }} />
          </div>
          <button type="button" className="pf-toggle" onClick={() => setPlaying((v) => !v)} aria-label={playing ? (fr ? "Mettre la démo en pause" : "Pause the demo") : fr ? "Lire la démo" : "Play the demo"}>
            {playing ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
            {playing ? "Pause" : fr ? "Lecture" : "Play"}
          </button>
          <div className="pf-progress">
            {SHOTS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={i < index ? "is-done" : i === index ? "is-on" : ""}
                style={{ flexGrow: s.ms }}
                onClick={() => seek(i)}
                aria-label={`${fr ? "Aller au plan" : "Go to shot"} ${i + 1}`}
              >
                <span style={i === index ? { transform: `scaleX(${p / s.ms})` } : undefined} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="pf-chip-proof">
      <span aria-hidden>{icon}</span>
      {children}
    </li>
  );
}

export function ProductFilmHero() {
  const lang = useLang();
  const fr = lang === "fr";
  return (
    <section className="pf-hero" aria-labelledby="pf-title">
      <div className="pf-hero__bg" aria-hidden />
      <div className="pf-hero__inner">
        <span className="pf-pill">
          <span className="pf-pill__spark" aria-hidden>
            <Sparkle size={12} />
          </span>
          {fr ? "Nouveau · Mino, l’IA qui pilote vos créateurs" : "New · Mino, the AI that runs your creators"}
        </span>
        <h1 id="pf-title">
          {fr ? (
            <>
              Trouvez les créateurs
              <br />
              qui vendent, <span className="pf-accent">vraiment</span>.
            </>
          ) : (
            <>
              Find the creators
              <br />
              who actually <span className="pf-accent">sell</span>.
            </>
          )}
        </h1>
        <p className="pf-lead">
          {fr ? "Recherche, campagnes, gifting, paiements & IA." : "Search, campaigns, gifting, payouts & AI."}
          <br />
          {fr ? "Tout au même endroit, suivi à la vente près." : "All in one place, tracked down to the sale."}
        </p>
        <ul className="pf-chips">
          <Chip icon="⚡">{fr ? "Shopify en 1 clic" : "Shopify in 1 click"}</Chip>
          <Chip icon="📈">{fr ? "Ventes suivies en direct" : "Sales tracked live"}</Chip>
          <Chip icon="🎁">{fr ? "Gifting avec contrat" : "Gifting with contracts"}</Chip>
        </ul>
        <a className="pf-cta" href="/auth?mode=signup">
          {fr ? "Commencer gratuitement" : "Start for free"}
          <span className="pf-cta__arrow" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </span>
        </a>
        <ProductFilm />
        <p className="pf-tools__label">{fr ? "Connecté à vos outils" : "Works with your stack"}</p>
        <ul className="pf-tools">
          <li>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#95bf47" aria-hidden>
              <path d="M15.3 3.6c-.1 0-.2 0-.3.1l-.8 2.5c-.5-.2-1-.3-1.6-.3-1.3 0-2 1.6-2.3 2.4l-1.7.5c-.5.2-.5.2-.6.7L6.5 20.3 16.6 22l2.9-.7s-2.9-17.6-3-17.7c-.1-.1-1.2 0-1.2 0zm-2.6.8-.6 1.8-1.4.4c.3-1.1.9-2.2 2-2.2z" />
            </svg>
            Shopify
          </li>
          <li>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#0b0d12" aria-hidden>
              <path d="M16.6 2h-3.4v13.4a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .8.1V9.1a6.3 6.3 0 1 0 5.5 6.3V8.6a8.2 8.2 0 0 0 4.4 1.3V6.5a4.7 4.7 0 0 1-4.4-4.5z" />
            </svg>
            TikTok
          </li>
          <li>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#e1306c" strokeWidth="2.2" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1" fill="#e1306c" stroke="none" />
            </svg>
            Instagram
          </li>
          <li>
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
              <rect x="2" y="5" width="20" height="14" rx="4" fill="#ff0033" />
              <path d="M10 9v6l5-3z" fill="#fff" />
            </svg>
            YouTube
          </li>
        </ul>
        <div className="pf-cards">
          {[
            {
              k: fr ? "Mino, l’IA" : "Mino, the AI",
              t: fr ? "Posez une question, Mino agit : relances, campagnes, rapports." : "Ask a question, Mino acts: nudges, campaigns, reports.",
              m: fr ? "Réponses en langage courant" : "Answers in plain words",
            },
            {
              k: fr ? "Gifting de bout en bout" : "Gifting end to end",
              t: fr ? "Contrat signé, colis suivi, vidéo validée avant publication." : "Signed contract, tracked parcel, video approved before it posts.",
              m: fr ? "Contrat figé à la signature" : "Contract frozen at signature",
            },
            {
              k: fr ? "Commissions automatiques" : "Automatic commissions",
              t: fr ? "Chaque vente rattachée à son créateur, chacun payé en un clic." : "Every sale tied to its creator, everyone paid in one click.",
              m: fr ? "Paiement groupé en 1 clic" : "Batch payout in 1 click",
            },
          ].map((c) => (
            <div key={c.k} className="pf-feature">
              <strong>{c.k}</strong>
              <p>{c.t}</p>
              <span>{c.m}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
