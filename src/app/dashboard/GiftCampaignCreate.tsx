"use client";

import { useState } from "react";
import { PlatformLogo, PLATFORM_LABEL } from "@/components/PlatformLogo";
import { GIFT_MAX_CONTENTS, giftExpectedCount } from "@/lib/gifting";
import { friendlyGiftError } from "@/lib/gifting-board";
import { GIFT_MAX_PRODUCT_IMAGES, GIFT_MAX_SPOTS, GIFT_PLATFORMS, GIFT_PRODUCT_IMAGE_MAX_BYTES, todayIso, type GiftPlatform } from "@/lib/gift-share";

// New gift campaign: everything the creator will see on the public page.
// No creator handle here: the campaign is created open, with its share link.

type Lang = "en" | "fr";

export function GiftCampaignCreate({
  lang,
  busy,
  onCreate,
  onError,
}: {
  lang: Lang;
  busy: boolean;
  /** Sends op create_campaign; resolves ok when the campaign exists. */
  onCreate: (payload: Record<string, unknown>) => Promise<{ ok: boolean }>;
  onError: (message: string) => void;
}) {
  const fr = lang === "fr";
  const [name, setName] = useState("");
  const [product, setProduct] = useState("");
  const [offer, setOffer] = useState("");
  const [value, setValue] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [brief, setBrief] = useState("");
  const [deadline, setDeadline] = useState("");
  const [contentCount, setContentCount] = useState("1");
  const [allowAds, setAllowAds] = useState(true);
  const [rightsDays, setRightsDays] = useState("90");
  const [territories, setTerritories] = useState("France");
  const [spots, setSpots] = useState("10");
  const [autoApprove, setAutoApprove] = useState(false);
  const [platforms, setPlatforms] = useState<GiftPlatform[]>([...GIFT_PLATFORMS]);
  const [minFollowers, setMinFollowers] = useState("");
  const [countries, setCountries] = useState("");
  const [showCriteria, setShowCriteria] = useState(false);

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const room = GIFT_MAX_PRODUCT_IMAGES - photos.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    if (picked.length === 0) return onError(friendlyGiftError("Too many photos.", lang));
    setUploading(true);
    try {
      for (const file of picked) {
        if (file.size > GIFT_PRODUCT_IMAGE_MAX_BYTES) {
          onError(friendlyGiftError("Image too large.", lang));
          continue;
        }
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/gifting/photo", { method: "POST", body: form });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.url) {
          onError(friendlyGiftError(body.error || (fr ? "Envoi de la photo impossible." : "Photo upload failed."), lang));
          continue;
        }
        setPhotos((list) => [...list, String(body.url)].slice(0, GIFT_MAX_PRODUCT_IMAGES));
      }
    } catch {
      onError(fr ? "Connexion impossible. Réessayez." : "Connection failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  const togglePlatform = (p: GiftPlatform) =>
    setPlatforms((list) => (list.includes(p) ? (list.length > 1 ? list.filter((x) => x !== p) : list) : [...list, p]));

  return (
    <section className="gv-card gift-create gvc">
      <header className="gift-create__head">
        <h2>{fr ? "Nouvelle campagne cadeau" : "New gift campaign"}</h2>
        <p>
          {fr
            ? "La campagne est créée tout de suite avec son lien. Vous l’envoyez aux créateurs : ils s’inscrivent et postulent."
            : "The campaign is created right away with its link. You send it to creators: they sign up and apply."}
        </p>
      </header>
      <form
        className="gift-create__form"
        onSubmit={(event) => {
          event.preventDefault();
          void onCreate({
            op: "create_campaign",
            name,
            product,
            offer,
            productValue: value,
            productImages: photos,
            brief,
            deadline,
            videoCount: giftExpectedCount(contentCount),
            allowAds,
            rightsDays: allowAds ? Number(rightsDays) : 0,
            territories: allowAds ? territories : "",
            spots: Number(spots),
            autoApprove,
            platforms,
            minFollowers: minFollowers ? Number(minFollowers) : 0,
            countries,
            lang,
          });
        }}
      >
        <fieldset className="gvc-step">
          <legend>
            <span>1</span> {fr ? "Le produit" : "The product"}
          </legend>
          <div className="gv-row2">
            <label>
              {fr ? "Nom de la campagne" : "Campaign name"}
              <input className="gv-field" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder={fr ? "Routine du matin" : "Morning routine"} />
            </label>
            <label>
              {fr ? "Produit offert" : "Gifted product"}
              <input className="gv-field" required maxLength={160} value={product} onChange={(e) => setProduct(e.target.value)} placeholder={fr ? "Sérum Glow 30 ml" : "Glow Serum 30 ml"} />
            </label>
          </div>
          <div className="gvc-photos">
            {photos.map((url, i) => (
              <span key={url} className="gvc-photo">
                {/* eslint-disable-next-line @next/next/no-img-element -- uploaded product photo */}
                <img src={url} alt={fr ? `Photo ${i + 1}` : `Photo ${i + 1}`} />
                <button type="button" aria-label={fr ? "Retirer la photo" : "Remove photo"} onClick={() => setPhotos((list) => list.filter((u) => u !== url))}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </span>
            ))}
            {photos.length < GIFT_MAX_PRODUCT_IMAGES ? (
              <label className="gvc-photo is-add">
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading} onChange={(e) => void addPhotos(e.target.files)} />
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="5" width="18" height="15" rx="2" />
                  <circle cx="9" cy="10" r="2" />
                  <path d="M21 16l-5-5-9 9" />
                </svg>
                <small>{uploading ? (fr ? "Envoi…" : "Uploading…") : fr ? "Photos du produit" : "Product photos"}</small>
              </label>
            ) : null}
          </div>
          <small className="gv-muted">{fr ? "Jusqu’à 4 photos (JPEG, PNG, WebP, 8 Mo max). Elles apparaissent sur la page du lien." : "Up to 4 photos (JPEG, PNG, WebP, 8 MB max). They show on the link page."}</small>
          <div className="gv-row2">
            <label>
              {fr ? "Ce que reçoit le créateur" : "What the creator gets"}
              <input className="gv-field" maxLength={300} value={offer} onChange={(e) => setOffer(e.target.value)} placeholder={fr ? "Le sérum + la crème de nuit, en taille réelle" : "The serum + the night cream, full size"} />
            </label>
            <label>
              {fr ? "Valeur du produit (€, facultatif)" : "Product value (€, optional)"}
              <input className="gv-field" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="45" />
            </label>
          </div>
        </fieldset>

        <fieldset className="gvc-step">
          <legend>
            <span>2</span> {fr ? "Le contenu attendu" : "The content you expect"}
          </legend>
          <label>
            Brief
            <textarea className="gv-field" required maxLength={2000} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={fr ? "Ce que le créateur doit montrer." : "What the creator should show."} style={{ minHeight: 96 }} />
          </label>
          <div className="gv-row2">
            <label>
              {fr ? "Contenus attendus" : "Contents expected"}
              <input className="gv-field" type="number" min="1" max={GIFT_MAX_CONTENTS} step="1" required value={contentCount} onChange={(e) => setContentCount(e.target.value)} />
              <small className="gv-muted">{fr ? "Vidéos ou photos, de 1 à 20. Écrit dans le contrat." : "Videos or photos, 1 to 20. Written into the contract."}</small>
            </label>
            <label>
              {fr ? "Échéance" : "Deadline"}
              <input className="gv-field" type="date" required min={todayIso()} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
          </div>
          <div className="gift-ads">
            <p>{fr ? "Usage publicitaire" : "Advertising use"}</p>
            <div>
              <button type="button" className={allowAds ? "is-on" : ""} onClick={() => setAllowAds(true)}>
                {fr ? "Autorisé" : "Granted"}
              </button>
              <button type="button" className={!allowAds ? "is-on" : ""} onClick={() => setAllowAds(false)}>
                {fr ? "Non autorisé" : "Not granted"}
              </button>
            </div>
          </div>
          {allowAds ? (
            <div className="gv-row2">
              <label>
                {fr ? "Durée des droits (jours)" : "Rights duration (days)"}
                <input className="gv-field" type="number" min="1" step="1" required value={rightsDays} onChange={(e) => setRightsDays(e.target.value)} />
              </label>
              <label>
                {fr ? "Territoires autorisés" : "Licensed territories"}
                <input className="gv-field" required value={territories} onChange={(e) => setTerritories(e.target.value)} />
              </label>
            </div>
          ) : null}
        </fieldset>

        <fieldset className="gvc-step">
          <legend>
            <span>3</span> {fr ? "Les créateurs" : "The creators"}
          </legend>
          <div className="gv-row2">
            <label>
              {fr ? "Nombre de créateurs" : "Number of creators"}
              <input className="gv-field" type="number" min="1" max={GIFT_MAX_SPOTS} step="1" required value={spots} onChange={(e) => setSpots(e.target.value)} />
              <small className="gv-muted">{fr ? "Le lien se ferme quand toutes les places sont prises." : "The link closes once every spot is taken."}</small>
            </label>
            <div className="gift-ads">
              <p>{fr ? "Candidatures" : "Applications"}</p>
              <div>
                <button type="button" className={!autoApprove ? "is-on" : ""} onClick={() => setAutoApprove(false)}>
                  {fr ? "Je valide chacune" : "I review each"}
                </button>
                <button type="button" className={autoApprove ? "is-on" : ""} onClick={() => setAutoApprove(true)}>
                  {fr ? "Acceptation auto" : "Auto-approve"}
                </button>
              </div>
            </div>
          </div>
          {autoApprove ? (
            <small className="gv-muted">
              {fr
                ? "Un créateur qui remplit vos critères (vérifiés sur ses statistiques) passe directement à la signature. Sans statistiques connues, vous validez à la main."
                : "A creator who meets your criteria (checked on their stats) goes straight to signing. Without known stats, you review by hand."}
            </small>
          ) : null}
          <button type="button" className="gvc-more" aria-expanded={showCriteria} onClick={() => setShowCriteria((v) => !v)}>
            {fr ? "Critères (facultatif)" : "Criteria (optional)"}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden style={{ transform: showCriteria ? "rotate(180deg)" : undefined }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {showCriteria ? (
            <div className="gvc-criteria">
              <div>
                <p className="gvc-label">{fr ? "Plateformes" : "Platforms"}</p>
                <div className="gvc-chips">
                  {GIFT_PLATFORMS.map((p) => (
                    <button key={p} type="button" className={`gvc-chip${platforms.includes(p) ? " is-on" : ""}`} aria-pressed={platforms.includes(p)} onClick={() => togglePlatform(p)}>
                      <PlatformLogo platform={p} size={16} /> {PLATFORM_LABEL[p]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="gv-row2">
                <label>
                  {fr ? "Abonnés minimum" : "Minimum followers"}
                  <input className="gv-field" type="number" min="0" step="1" value={minFollowers} onChange={(e) => setMinFollowers(e.target.value)} placeholder="5000" />
                </label>
                <label>
                  {fr ? "Pays (codes à 2 lettres)" : "Countries (2-letter codes)"}
                  <input className="gv-field" value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="FR, BE, CH" />
                </label>
              </div>
            </div>
          ) : null}
        </fieldset>

        <div className="gvc-submit">
          <button className="es-primary" disabled={busy || uploading}>
            {busy ? (fr ? "Création…" : "Creating…") : fr ? "Créer la campagne" : "Create campaign"}
          </button>
          <small className="gv-muted">{fr ? "Vous obtenez le lien à partager juste après." : "You get the link to share right after."}</small>
        </div>
      </form>
    </section>
  );
}
