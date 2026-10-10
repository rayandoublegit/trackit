import { cache } from "react";
import type { Metadata } from "next";
import { WorkspaceGlyph } from "@/components/FallbackGlyphs";
import { PlatformLogo, PLATFORM_LABEL } from "@/components/PlatformLogo";
import { formatFollowers, giftSharePath, isGiftShareToken, type PublicGiftCampaign } from "@/lib/gift-share";
import { loadPublicGiftCampaign } from "@/lib/gift-share-server";
import { legalLinks } from "@/lib/legal-links";
import { buildPageMetadata } from "@/lib/site-seo";
import { GiftApply } from "./GiftApply";
import "./gift-page.css";

// Public page of a gift campaign, /gift/<token> and /fr/gift/<token>.
// Server-rendered from public fields only (toPublicGiftCampaign). Creators are
// addressed with "tu" in French.

type Lang = "en" | "fr";

const TRACKIT_LOGO = "https://i.ibb.co/20jgns98/navbarlogotransparent.png";

const loadCampaign = cache(async (token: string) => (isGiftShareToken(token) ? loadPublicGiftCampaign(token) : null));

export async function giftPageMetadata(token: string, lang: Lang): Promise<Metadata> {
  const fr = lang === "fr";
  const campaign = await loadCampaign(token);
  const base = buildPageMetadata({
    title: campaign
      ? fr ? `${campaign.product} offert par ${campaign.brand.name ?? "une marque"}` : `${campaign.product}, gifted by ${campaign.brand.name ?? "a brand"}`
      : fr ? "Campagne cadeau" : "Gift campaign",
    description: campaign
      ? fr ? `Reçois ${campaign.product} en échange d’un contenu. Inscris-toi sur Trackit.` : `Get ${campaign.product} in exchange for content. Sign up on Trackit.`
      : fr ? "Une marque t’offre un produit sur Trackit." : "A brand gifts you a product on Trackit.",
    path: giftSharePath(isGiftShareToken(token) ? token : "invalid", lang),
    lang,
    noIndex: true,
  });
  // The root layout adds its own " | Trackit" template: keep the built title as is.
  if (typeof base.title === "string") base.title = { absolute: base.title };
  if (campaign?.images[0]) {
    base.openGraph = { ...(base.openGraph ?? {}), images: [{ url: campaign.images[0] }] };
  }
  return base;
}

function money(cents: number, currency: string, lang: Lang) {
  return new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US", { style: "currency", currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

function day(value: string, lang: Lang) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function countryName(code: string, lang: Lang) {
  try {
    return new Intl.DisplayNames([lang === "fr" ? "fr-FR" : "en-US"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

const Svg = {
  gift: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M5 12v9h14v-9M12 8v13M12 8S10.5 3 7.5 3 5 6.5 12 8zM12 8s1.5-5 4.5-5S19 6.5 12 8z" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12l5 5L19 7" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3z" />
    </svg>
  ),
  tag: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 12l-8 8-9-9V3h8z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 010 7M18 14.8c2 .7 3.2 2.5 3.6 5.2" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  ),
  alert: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16.5v.01" />
    </svg>
  ),
};

function closedText(reason: PublicGiftCampaign["availability"]["reason"], lang: Lang): { title: string; body: string } | null {
  const fr = lang === "fr";
  switch (reason) {
    case "full":
      return { title: fr ? "Toutes les places sont prises" : "Every spot is taken", body: fr ? "Cette campagne a trouvé tous ses créateurs. Suis la marque pour la prochaine." : "This campaign found all its creators. Follow the brand for the next one." };
    case "expired":
      return { title: fr ? "Campagne terminée" : "Campaign over", body: fr ? "La date limite est passée : les inscriptions sont fermées." : "The deadline has passed: sign-ups are closed." };
    case "disabled":
      return { title: fr ? "Lien inactif" : "Link not active", body: fr ? "La marque a mis ce lien en pause. Demande-lui un nouveau lien." : "The brand paused this link. Ask them for a new one." };
    case "closed":
      return { title: fr ? "Campagne fermée" : "Campaign closed", body: fr ? "Cette campagne n’accepte plus de créateurs." : "This campaign no longer accepts creators." };
    default:
      return null;
  }
}

export function GiftInvalid({ lang }: { lang: Lang }) {
  const fr = lang === "fr";
  return (
    <main className="gp">
      <div className="gp-wrap">
        <header className="gp-top">
          <a href={fr ? "/fr" : "/"} aria-label="Trackit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={TRACKIT_LOGO} alt="Trackit" />
          </a>
        </header>
        <section className="gp-apply">
          <div className="gp-panel gp-status">
            <span className="gp-status__icon" aria-hidden style={{ width: 52, height: 52 }}>
              <span style={{ width: 26, height: 26, display: "block" }}>{Svg.gift}</span>
            </span>
            <h2>{fr ? "Lien invalide" : "Invalid link"}</h2>
            <p>
              {fr
                ? "Ce lien ne correspond à aucune campagne cadeau. Vérifie qu’il est complet ou demande un nouveau lien à la marque."
                : "This link doesn’t match any gift campaign. Check that it is complete or ask the brand for a new one."}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

export async function GiftPage({ token, lang }: { token: string; lang: Lang }) {
  const campaign = await loadCampaign(token);
  if (!campaign) return <GiftInvalid lang={lang} />;
  return <GiftLanding campaign={campaign} lang={lang} />;
}

/** The page itself, from public data only. */
export function GiftLanding({ campaign, lang }: { campaign: PublicGiftCampaign; lang: Lang }) {
  const fr = lang === "fr";
  const brand = campaign.brand.name || (fr ? "Une marque" : "A brand");
  const { availability } = campaign;
  const closed = closedText(availability.reason, lang);
  const contents = campaign.contentCount;
  const value = campaign.productValueCents > 0 ? money(campaign.productValueCents, campaign.currency, lang) : null;
  const fee = campaign.fixedFeeCents > 0 ? money(campaign.fixedFeeCents, campaign.currency, lang) : null;
  const filled = availability.spots ? Math.min(100, Math.round((availability.taken / availability.spots) * 100)) : 0;
  const path = giftSharePath(campaign.token, lang);

  return (
    <main className="gp">
      <div className="gp-wrap">
        <header className="gp-top">
          <a href={fr ? "/fr" : "/"} aria-label="Trackit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={TRACKIT_LOGO} alt="Trackit" />
          </a>
          <a href={giftSharePath(campaign.token, fr ? "en" : "fr")} hrefLang={fr ? "en" : "fr"}>
            {fr ? "English" : "Français"}
          </a>
        </header>

        <section className="gp-hero">
          <div className="gp-media">
            {campaign.images.length > 0 ? (
              <>
                <div className="gp-gallery">
                  {campaign.images.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element -- brand photo from storage, any size
                    <img key={src} src={src} alt={i === 0 ? campaign.product : ""} loading={i === 0 ? "eager" : "lazy"} />
                  ))}
                </div>
                {campaign.images.length > 1 ? (
                  <span className="gp-count">
                    {campaign.images.length} {fr ? "photos" : "photos"}
                  </span>
                ) : null}
              </>
            ) : (
              <div className="gp-placeholder">{Svg.gift}</div>
            )}
          </div>

          <div className="gp-intro">
            <div className="gp-brand">
              <span className="gp-brand__logo">
                {campaign.brand.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={campaign.brand.logoUrl} alt="" />
                ) : (
                  <WorkspaceGlyph size={18} />
                )}
              </span>
              <span>
                <strong>{brand}</strong> {fr ? "t’offre" : "is gifting you"}
              </span>
            </div>
            <h1>{campaign.product}</h1>
            {campaign.name && campaign.name !== campaign.product ? <p className="gp-campaign">{campaign.name}</p> : null}
            <div className="gp-chips">
              {value ? (
                <span className="gp-chip is-accent">
                  {Svg.tag} {fr ? `Valeur ${value}` : `Worth ${value}`}
                </span>
              ) : null}
              <span className="gp-chip">
                {Svg.video} {fr ? `${contents} ${contents > 1 ? "contenus" : "contenu"}` : `${contents} ${contents === 1 ? "content" : "contents"}`}
              </span>
              <span className="gp-chip">
                {Svg.clock} {fr ? `Avant le ${day(campaign.deadline, lang)}` : `By ${day(campaign.deadline, lang)}`}
              </span>
            </div>

            {closed ? (
              <div className="gp-banner" role="status">
                {Svg.alert}
                <div>
                  <strong>{closed.title}</strong>
                  {closed.body}
                </div>
              </div>
            ) : availability.spots !== null && availability.spotsLeft !== null ? (
              <div className="gp-spots">
                <div className="gp-spots__row">
                  <strong>
                    {fr
                      ? `${availability.spotsLeft} ${availability.spotsLeft > 1 ? "places restantes" : "place restante"}`
                      : `${availability.spotsLeft} ${availability.spotsLeft === 1 ? "spot left" : "spots left"}`}
                  </strong>
                  <span>{fr ? `sur ${availability.spots}` : `of ${availability.spots}`}</span>
                </div>
                <div className="gp-bar" aria-hidden>
                  <i style={{ width: `${Math.max(filled, 3)}%` }} />
                </div>
              </div>
            ) : null}

            {availability.open ? (
              <a className="gp-btn gp-hero-cta" href="#apply">
                {fr ? "Je participe" : "Apply"}
              </a>
            ) : null}
          </div>
        </section>

        <section className="gp-grid">
          <article className="gp-card">
            <h2>{fr ? "Ce que tu reçois" : "What you get"}</h2>
            {value ? <p className="gp-big">{value}</p> : null}
            <ul className="gp-list">
              <li>
                {Svg.gift}
                <span>
                  {campaign.product}
                  {campaign.offer ? <small>{campaign.offer}</small> : null}
                </span>
              </li>
              {fee ? (
                <li>
                  {Svg.tag}
                  <span>
                    {fr ? `Rémunération forfaitaire indiquée : ${fee}` : `Fixed fee shown: ${fee}`}
                    <small>{fr ? "Le paiement se règle directement avec la marque." : "Payment is settled directly with the brand."}</small>
                  </span>
                </li>
              ) : null}
              <li>
                {Svg.check}
                <span>{fr ? "Envoyé chez toi par la marque" : "Shipped to you by the brand"}</span>
              </li>
            </ul>
          </article>

          <article className="gp-card">
            <h2>{fr ? "Ce qu’on te demande" : "What we ask"}</h2>
            <ul className="gp-list">
              <li>
                {Svg.video}
                <span>
                  {fr
                    ? `${contents} ${contents > 1 ? "contenus" : "contenu"} (vidéo ou photo) avant le ${day(campaign.deadline, lang)}`
                    : `${contents} ${contents === 1 ? "content" : "contents"} (video or photo) by ${day(campaign.deadline, lang)}`}
                </span>
              </li>
              <li>
                {Svg.shield}
                <span>
                  {campaign.allowAds
                    ? fr
                      ? `Usage publicitaire autorisé : ${campaign.rightsDays} jours${campaign.territories ? `, ${campaign.territories}` : ""}`
                      : `Ad use granted: ${campaign.rightsDays} days${campaign.territories ? `, ${campaign.territories}` : ""}`
                    : fr
                      ? "Pas d’usage publicitaire de tes contenus"
                      : "No ad use of your content"}
                  <small>{fr ? "Écrit dans le contrat que tu signes." : "Written into the contract you sign."}</small>
                </span>
              </li>
            </ul>
            {campaign.brief ? (
              <p style={{ marginTop: 14, color: "var(--gp-muted)" }}>{campaign.brief}</p>
            ) : null}
          </article>

          <article className="gp-card">
            <h2>{fr ? "Pour qui" : "Who can join"}</h2>
            <ul className="gp-list">
              <li>
                <span className="gp-platforms">
                  {campaign.platforms.map((p) => (
                    <span key={p} className="gp-chip">
                      <PlatformLogo platform={p} size={16} /> {PLATFORM_LABEL[p]}
                    </span>
                  ))}
                </span>
              </li>
              {campaign.minFollowers > 0 ? (
                <li>
                  {Svg.users}
                  <span>{fr ? `${formatFollowers(campaign.minFollowers, lang)} abonnés minimum` : `${formatFollowers(campaign.minFollowers, lang)} followers minimum`}</span>
                </li>
              ) : null}
              {campaign.countries.length > 0 ? (
                <li>
                  {Svg.pin}
                  <span>{campaign.countries.map((c) => countryName(c, lang)).join(", ")}</span>
                </li>
              ) : null}
              <li>
                {Svg.check}
                <span>
                  {campaign.autoApprove
                    ? fr ? "Réponse immédiate si tu remplis les critères" : "Instant answer when you meet the criteria"
                    : fr ? "La marque choisit parmi les candidatures" : "The brand picks among applications"}
                </span>
              </li>
            </ul>
          </article>

          <article className="gp-card">
            <h2>{fr ? "Comment ça marche" : "How it works"}</h2>
            <ol className="gp-steps">
              <li>{fr ? "Tu crées ton compte créateur et tu postules" : "Create your creator account and apply"}</li>
              <li>{fr ? "La marque valide ta candidature" : "The brand approves your application"}</li>
              <li>{fr ? "Tu signes le contrat et donnes ton adresse" : "Sign the contract and share your address"}</li>
              <li>{fr ? "Tu reçois le produit, tu publies ton contenu" : "Receive the product, post your content"}</li>
            </ol>
          </article>
        </section>

        <section className="gp-apply" id="apply">
          <GiftApply token={campaign.token} path={path} open={availability.open} brandName={brand} product={campaign.product} platforms={campaign.platforms} lang={lang} />
        </section>
      </div>

      {availability.open ? (
        <div className="gp-sticky">
          <a className="gp-btn" href="#apply">
            {fr ? "Je participe" : "Apply"}
          </a>
        </div>
      ) : null}

      <footer className="gp-foot">
        <span>{fr ? "Propulsé par Trackit" : "Powered by Trackit"}</span>
        {legalLinks(lang).map((link) => (
          <a key={link.key} href={link.href}>
            {link.label}
          </a>
        ))}
      </footer>
    </main>
  );
}
