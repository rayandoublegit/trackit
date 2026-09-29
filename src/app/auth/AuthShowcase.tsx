"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/useLang";
import { CountUp, prefersReducedMotion } from "@/app/dashboard/sample-motion";

// Right-hand motion panel of the sign-in page. Every person and number is fictional.

type SceneId = "discover" | "campaign" | "gifting" | "payout";

const SCENES: SceneId[] = ["discover", "campaign", "gifting", "payout"];
const SCENE_MS = 5600;

const COPY: Record<SceneId, { en: { kicker: string; title: string; text: string }; fr: { kicker: string; title: string; text: string } }> = {
  discover: {
    en: { kicker: "Find it", title: "Find the creators who already sell your niche.", text: "Search by niche, tier and views. Save the good ones in one click." },
    fr: { kicker: "Find it", title: "Trouvez les créateurs qui vendent déjà dans votre niche.", text: "Recherche par niche, palier et vues. Sauvegardez les bons en un clic." },
  },
  campaign: {
    en: { kicker: "Track it", title: "Every sale, tied to the creator who drove it.", text: "Codes, links and orders roll up into one live campaign view." },
    fr: { kicker: "Track it", title: "Chaque vente, rattachée au créateur qui l’a générée.", text: "Codes, liens et commandes remontent dans une vue de campagne en direct." },
  },
  gifting: {
    en: { kicker: "Gifting", title: "Send a product, get the video back.", text: "A frozen contract, the parcel, the upload and the ad rights, in one flow." },
    fr: { kicker: "Gifting", title: "Envoyez un produit, recevez la vidéo.", text: "Un contrat figé, le colis, le dépôt et les droits ads, dans un seul parcours." },
  },
  payout: {
    en: { kicker: "Pay it", title: "Commissions calculated. Creators paid.", text: "Each order splits what the creator is owed. You pay in a click." },
    fr: { kicker: "Pay it", title: "Commissions calculées. Créateurs payés.", text: "Chaque commande calcule ce qui est dû au créateur. Vous payez en un clic." },
  },
};

const CREATORS = [
  { name: "Sarah Cole", handle: "sarah.creates", hue: 222, followers: "184K", views: "412K", niche: { en: "Skincare", fr: "Soin" } },
  { name: "Luna Park", handle: "luna.beauty", hue: 312, followers: "61K", views: "164K", niche: { en: "Beauty", fr: "Beauté" } },
  { name: "Nora Diallo", handle: "nora.daily", hue: 160, followers: "42K", views: "97K", niche: { en: "Lifestyle", fr: "Lifestyle" } },
];

export function Avatar({ name, hue, size = 32 }: { name: string; hue: number; size?: number }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
  return (
    <span
      className="ash-avatar"
      aria-hidden
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: `linear-gradient(135deg, hsl(${hue} 85% 72%), hsl(${(hue + 40) % 360} 75% 54%))`,
      }}
    >
      {initials}
    </span>
  );
}

export function DiscoverScene({ lang }: { lang: "en" | "fr" }) {
  const fr = lang === "fr";
  return (
    <div className="ash-scene ash-discover">
      <div className="ash-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="ash-typed">{fr ? "créatrices skincare · 50K+" : "skincare creators · 50K+"}</span>
        <span className="ash-caret" />
      </div>
      <div className="ash-chips">
        {(fr ? ["TikTok", "Micro", "Vues > 50K", "France"] : ["TikTok", "Micro", "Views > 50K", "France"]).map((c, i) => (
          <span key={c} style={{ animationDelay: `${0.9 + i * 0.12}s` }}>{c}</span>
        ))}
      </div>
      <ul className="ash-results">
        {CREATORS.map((c, i) => (
          <li key={c.handle} style={{ animationDelay: `${1.4 + i * 0.22}s` }}>
            <Avatar name={c.name} hue={c.hue} size={36} />
            <div className="ash-results__who">
              <strong>{c.name}</strong>
              <small>@{c.handle} · {c.niche[lang]}</small>
            </div>
            <div className="ash-results__stat">
              <strong>{c.followers}</strong>
              <small>{fr ? "abonnés" : "followers"}</small>
            </div>
            <div className="ash-results__stat">
              <strong>{c.views}</strong>
              <small>{fr ? "vues" : "views"}</small>
            </div>
            <span className="ash-save" style={{ animationDelay: `${2.6 + i * 0.35}s` }}>
              <i>{fr ? "Sauver" : "Save"}</i>
              <b>✓</b>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CampaignScene({ lang }: { lang: "en" | "fr" }) {
  const fr = lang === "fr";
  const money = (n: number) =>
    new Intl.NumberFormat(fr ? "fr-FR" : "en-US", { style: "currency", currency: fr ? "EUR" : "USD", maximumFractionDigits: 0 }).format(n);
  const points = [4, 6, 5, 9, 8, 12, 11, 15, 14, 19, 18, 24, 23, 29];
  const w = 320;
  const h = 90;
  const max = Math.max(...points);
  const path = points.map((v, i) => `${i === 0 ? "M" : "L"}${(i / (points.length - 1)) * w},${h - (v / max) * (h - 8)}`).join(" ");
  return (
    <div className="ash-scene ash-campaign">
      <div className="ash-card">
        <div className="ash-card__top">
          <div>
            <small>{fr ? "Campagne" : "Campaign"}</small>
            <strong>Summer drop</strong>
          </div>
          <span className="ash-live"><i />{fr ? "En direct" : "Live"}</span>
        </div>
        <div className="ash-kpis">
          <div>
            <small>{fr ? "Chiffre d’affaires" : "Revenue"}</small>
            <strong><CountUp value={4820} format={money} delayMs={300} /></strong>
          </div>
          <div>
            <small>{fr ? "Commandes" : "Orders"}</small>
            <strong><CountUp value={72} format={(n) => String(Math.round(n))} delayMs={450} /></strong>
          </div>
          <div>
            <small>ROI</small>
            <strong><CountUp value={6.7} format={(n) => `×${n.toFixed(1)}`} delayMs={600} /></strong>
          </div>
        </div>
        <svg className="ash-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="ash-spark-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#5b8cff" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#5b8cff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path} L${w},${h} L0,${h} Z`} fill="url(#ash-spark-fill)" className="ash-spark__area" />
          <path d={path} fill="none" className="ash-spark__line" pathLength={1} />
        </svg>
      </div>
      <div className="ash-toast ash-toast--sale">
        <Avatar name="Sarah Cole" hue={222} size={28} />
        <div>
          <strong>{fr ? "Sarah a généré une vente" : "Sarah drove a sale"}</strong>
          <small>{fr ? "à l’instant · code SARAH15" : "just now · code SARAH15"}</small>
        </div>
        <b>+{money(86)}</b>
      </div>
    </div>
  );
}

export function GiftingScene({ lang }: { lang: "en" | "fr" }) {
  const fr = lang === "fr";
  const stages = fr ? ["Invité", "Signé", "Expédié", "Reçu", "Vidéo"] : ["Invited", "Signed", "Shipped", "Delivered", "Video"];
  return (
    <div className="ash-scene ash-gifting">
      <div className="ash-contract">
        <small>{fr ? "Contrat figé" : "Frozen contract"}</small>
        <strong>{fr ? "Accord de gifting" : "Gifting agreement"}</strong>
        <span className="ash-contract__line" />
        <span className="ash-contract__line" style={{ width: "82%" }} />
        <span className="ash-contract__line" style={{ width: "64%" }} />
        <div className="ash-contract__ads">
          <span>{fr ? "Droits ads" : "Ad rights"}</span>
          <b>90 {fr ? "jours" : "days"} · FR, BE</b>
        </div>
        <svg className="ash-signature" viewBox="0 0 220 60" aria-hidden>
          <path
            d="M6 42 C 20 8, 34 8, 30 36 S 52 52, 62 28 S 78 6, 84 34 S 104 50, 116 26 C 124 12, 134 16, 132 34 S 150 48, 166 30 S 190 20, 214 34"
            pathLength={1}
          />
        </svg>
        <small className="ash-contract__signed">{fr ? "Signé par Luna Park" : "Signed by Luna Park"}</small>
      </div>
      <div className="ash-rail">
        <span className="ash-rail__track" />
        {stages.map((s, i) => (
          <span key={s} className="ash-rail__stop" style={{ left: `${(i / (stages.length - 1)) * 100}%`, animationDelay: `${1.2 + i * 0.7}s` }}>
            <i />
            <em>{s}</em>
          </span>
        ))}
        <span className="ash-rail__parcel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5v-9z" fill="currentColor" fillOpacity=".15" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M3 7.5L12 12l9-4.5M12 12v9" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </div>
  );
}

export function PayoutScene({ lang }: { lang: "en" | "fr" }) {
  const fr = lang === "fr";
  const money = (n: number) =>
    new Intl.NumberFormat(fr ? "fr-FR" : "en-US", { style: "currency", currency: fr ? "EUR" : "USD", maximumFractionDigits: 2 }).format(n);
  return (
    <div className="ash-scene ash-payout">
      <div className="ash-order">
        <small>{fr ? "Commande #4821" : "Order #4821"}</small>
        <strong>{money(86)}</strong>
        <span>{fr ? "via le code NORA15" : "via code NORA15"}</span>
      </div>
      <div className="ash-split">
        <span className="ash-split__beam" />
        <div className="ash-split__part ash-split__part--creator">
          <Avatar name="Nora Diallo" hue={160} size={26} />
          <div>
            <small>{fr ? "Créatrice · 15 %" : "Creator · 15%"}</small>
            <strong>{money(12.9)}</strong>
          </div>
        </div>
        <div className="ash-split__part">
          <span className="ash-brand">T</span>
          <div>
            <small>{fr ? "Votre marque" : "Your brand"}</small>
            <strong>{money(73.1)}</strong>
          </div>
        </div>
      </div>
      <div className="ash-paid">
        <span className="ash-paid__check">✓</span>
        <div>
          <strong>{fr ? "Paiement envoyé" : "Payout sent"}</strong>
          <small>{fr ? "3 créatrices · 412,80 €" : "3 creators · $412.80"}</small>
        </div>
      </div>
    </div>
  );
}

export function AuthShowcase() {
  const lang = useLang();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const scene = SCENES[index];
  const copy = COPY[scene][lang];

  useEffect(() => {
    if (paused) return;
    const id = window.setTimeout(
      () => setIndex((i) => (i + 1) % SCENES.length),
      prefersReducedMotion() ? SCENE_MS * 2 : SCENE_MS,
    );
    return () => window.clearTimeout(id);
  }, [index, paused]);

  return (
    <aside
      className="ash"
      aria-label={lang === "fr" ? "Aperçu de Trackit" : "Trackit preview"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="ash-bg" aria-hidden>
        <span className="ash-blob ash-blob--a" />
        <span className="ash-blob ash-blob--b" />
        <span className="ash-grid" />
      </div>

      <div className="ash-progress" role="tablist">
        {SCENES.map((id, i) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={COPY[id][lang].kicker}
            className={i < index ? "is-done" : i === index ? "is-on" : ""}
            onClick={() => setIndex(i)}
          >
            <span style={i === index ? { animationDuration: `${SCENE_MS}ms`, animationPlayState: paused ? "paused" : "running" } : undefined} />
          </button>
        ))}
      </div>

      <div className="ash-stage" key={scene}>
        {scene === "discover" ? <DiscoverScene lang={lang} /> : null}
        {scene === "campaign" ? <CampaignScene lang={lang} /> : null}
        {scene === "gifting" ? <GiftingScene lang={lang} /> : null}
        {scene === "payout" ? <PayoutScene lang={lang} /> : null}
      </div>

      <div className="ash-copy" key={`copy-${scene}`}>
        <p className="ash-kicker">{copy.kicker}</p>
        <h2>{copy.title}</h2>
        <p>{copy.text}</p>
      </div>

      <p className="ash-note">{lang === "fr" ? "Données d’exemple, créateurs fictifs." : "Sample data, fictional creators."}</p>
    </aside>
  );
}
