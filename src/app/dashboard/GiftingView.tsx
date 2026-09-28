"use client";

import { useCallback, useEffect, useState } from "react";
import { contractGrantsAdUse } from "@/lib/gifting";
import { uploadGiftVideoResumable } from "@/lib/gift-video-upload";
import {
  GIFT_BOARD_COLUMNS,
  friendlyGiftError,
  giftColumnFor,
  giftNextStep,
  giftStats,
  giftStatusLabel,
  isGiftSetupError,
} from "@/lib/gifting-board";
import { SAMPLE_CAMPAIGN_DETAILS } from "@/lib/sample-campaign-preview";
import { useLang } from "@/lib/useLang";
import { takeCreatorForGift } from "@/lib/creator-handoff";
import { GiftPipeline } from "./SampleCampaignPreview";
import { CountUp, SampleAvatar } from "./sample-motion";
import "./sample-preview.css";
import "./gifting-view.css";

type Lang = "en" | "fr";
type Wishlist = { id: string; name: string; description: string };
type WishlistItem = { id: string; wishlist_id: string; handle: string; platform: string };
type Campaign = {
  id: string;
  name: string;
  product: string;
  brief: string;
  deadline: string;
  allow_ads: boolean;
  rights_days: number;
  territories: string;
};
type Mission = {
  id: string;
  campaign_id: string;
  creator_handle: string;
  creator_platform: string;
  status: string;
  contract_text: string;
  signed_name: string | null;
  signed_at: string | null;
  carrier: string | null;
  tracking_number: string | null;
  address: { name: string; line: string; postalCode: string; city: string; country: string } | null;
};
type Video = { mission_id: string; name: string; status: string; feedback: string };

const VIDEO_STATUS: Record<string, { en: string; fr: string }> = {
  pending: { en: "In review", fr: "En revue" },
  changes_requested: { en: "Changes requested", fr: "Modification demandée" },
  approved: { en: "Approved", fr: "Validée" },
};

export function GiftingView({
  isMobile,
  isCreator,
  plan = "free",
  onUpgrade,
  startCreating = false,
  embedded = false,
}: {
  isMobile?: boolean;
  isCreator?: boolean;
  plan?: string;
  onUpgrade?: () => void;
  /** Opens the new-campaign form right away (used from "Create a campaign"). */
  startCreating?: boolean;
  /** Shown inside the Campaigns board: no page padding or page title. */
  embedded?: boolean;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [listName, setListName] = useState("");
  const [handles, setHandles] = useState<Record<string, string>>({});
  const [inviteHandles, setInviteHandles] = useState<Record<string, string>>({});
  const [campaignName, setCampaignName] = useState("");
  const [product, setProduct] = useState("");
  const [brief, setBrief] = useState("");
  const [deadline, setDeadline] = useState("");
  const [allowAds, setAllowAds] = useState(true);
  const [rightsDays, setRightsDays] = useState("90");
  const [territories, setTerritories] = useState("France");
  const [publishPaywall, setPublishPaywall] = useState(false);
  const [creating, setCreating] = useState(startCreating && !isCreator);
  const paid = plan !== "free";
  const [openId, setOpenId] = useState<string | null>(null);
  // A creator sent from Discovery ("Send a gift") waits here until a campaign is picked.
  const [pendingHandle, setPendingHandle] = useState<string | null>(null);
  useEffect(() => {
    if (isCreator) return;
    const handle = takeCreatorForGift();
    if (handle) setPendingHandle(handle);
  }, [isCreator]);
  useEffect(() => {
    if (!pendingHandle || !loaded || loadError) return;
    if (campaigns.length === 0) {
      setCreating(true);
      return;
    }
    setInviteHandles((prev) => {
      const next = { ...prev };
      for (const c of campaigns) if (!next[c.id]) next[c.id] = pendingHandle;
      return next;
    });
  }, [pendingHandle, loaded, loadError, campaigns]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/gifting");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLoadError(body.error || (fr ? "Chargement impossible." : "Could not load."));
        return;
      }
      setLoadError("");
      setWishlists(body.wishlists ?? []);
      setItems(body.items ?? []);
      setCampaigns(body.campaigns ?? []);
      setMissions(body.missions ?? []);
      setVideos(body.videos ?? []);
    } catch {
      setLoadError(fr ? "Connexion impossible. Réessayez." : "Connection failed. Please try again.");
    } finally {
      setLoaded(true);
    }
  }, [fr]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(payload: Record<string, unknown>): Promise<{ code?: string; ok: boolean; path?: string; token?: string; url?: string }> {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/gifting", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(friendlyGiftError(body.error || (fr ? "Action refusée." : "Action refused."), lang));
        return { ...body, ok: false };
      }
      await load();
      return { ...body, ok: true };
    } catch {
      setError(fr ? "Connexion impossible. Réessayez." : "Connection failed. Please try again.");
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }

  async function submitVideo(missionId: string, file: File) {
    const ticket = await send({ op: "upload_url", missionId, contentType: file.type, size: file.size });
    if (!ticket.ok || !ticket.path || !ticket.token) return;
    setBusy(true);
    setUploadPercent(0);
    try {
      await uploadGiftVideoResumable(file, ticket.path, ticket.token, setUploadPercent);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (fr ? "Envoi de la vidéo impossible." : "Video upload failed."));
      return;
    } finally {
      setBusy(false);
      setUploadPercent(null);
    }
    await send({ op: "act", missionId, action: { type: "submit", videoName: file.name, storagePath: ticket.path } });
  }

  async function openVideo(missionId: string) {
    const result = await send({ op: "video_url", missionId });
    if (result.ok && result.url) window.open(result.url, "_blank", "noopener,noreferrer");
  }

  const open = missions.find((mission) => mission.id === openId) ?? null;
  const selectedVideo = videos.find((video) => video.mission_id === open?.id);
  const stats = giftStats(missions);
  const setupMissing = Boolean(loadError) && isGiftSetupError(loadError);
  const showSample = loaded && missions.length === 0 && (campaigns.length === 0 || setupMissing);
  const sample = SAMPLE_CAMPAIGN_DETAILS["sample-summer"];
  const sampleById = new Map(sample.creators.map((c) => [c.id, c]));
  const campaignTitle = (id: string) => campaigns.find((c) => c.id === id)?.name ?? "";

  return (
    <div className={`gv-page${isMobile ? " is-mobile" : ""}${embedded ? " is-embedded" : ""}`}>
      <header className="gv-head">
        <div className="gv-head__copy">
          <p className="es-kicker">Gifting</p>
          <h1>
            {isCreator
              ? fr ? "Mes missions cadeau" : "My gift missions"
              : fr ? "Produits offerts, vidéos en retour" : "Gifted products, videos back"}
          </h1>
          <p className="gv-lead">
            {isCreator
              ? fr
                ? "Chaque mission : une proposition, un contrat figé à signer, votre adresse, le colis, puis votre vidéo."
                : "Each mission: an offer, a frozen contract to sign, your address, the parcel, then your video."
              : fr
                ? "Listes, contrat figé, colis et droits publicitaires. Le forfait affiché ne déclenche aucun paiement."
                : "Lists, a frozen contract, the parcel and ad rights. A shown fee never triggers a payment."}
          </p>
        </div>
        {!isCreator && !loadError ? (
          <button type="button" className="es-primary" onClick={() => setCreating((v) => !v)}>
            {creating ? (fr ? "Fermer" : "Close") : fr ? "Nouvelle campagne cadeau" : "New gift campaign"}
          </button>
        ) : null}
      </header>

      <div className="gv-stats">
        {[
          { label: fr ? "En cours" : "In progress", value: stats.active, hot: false },
          { label: fr ? "Colis en route" : "Parcels on the way", value: stats.shipping, hot: false },
          { label: fr ? "Vidéos à valider" : "Videos to review", value: stats.toReview, hot: stats.toReview > 0 },
          { label: fr ? "Validées" : "Approved", value: stats.approved, hot: false },
        ].map((k, i) => (
          <div key={k.label} className={`gv-stat${k.hot ? " is-hot" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
            <span>{k.label}</span>
            <strong>{loaded ? <CountUp value={k.value} format={(n) => String(Math.round(n))} delayMs={i * 80} /> : "—"}</strong>
          </div>
        ))}
      </div>

      {pendingHandle && !isCreator && !loadError ? (
        <div className="gv-alert is-info" role="status">
          <div>
            <strong>{fr ? `Cadeau pour @${pendingHandle}` : `Gift for @${pendingHandle}`}</strong>
            <p>
              {campaigns.length === 0
                ? fr
                  ? "Créez d’abord la campagne cadeau (produit, brief, droits), puis envoyez-lui la mission."
                  : "Create the gift campaign first (product, brief, rights), then send them the mission."
                : fr
                  ? "Le pseudo est prêt dans chaque campagne ci-dessous : cliquez sur « Envoyer la mission » dans la bonne."
                  : "The handle is filled in on each campaign below: click “Send mission” on the right one."}
            </p>
          </div>
          <button type="button" className="gv-alert__close" aria-label={fr ? "Fermer" : "Dismiss"} onClick={() => setPendingHandle(null)}>
            ×
          </button>
        </div>
      ) : null}

      {loadError ? (
        <div className={`gv-alert${setupMissing ? " is-info" : ""}`} role="alert">
          <div>
            <strong>
              {setupMissing
                ? fr ? "Bientôt disponible sur cet espace" : "Coming to this workspace"
                : fr ? "Chargement impossible" : "Could not load"}
            </strong>
            <p>{friendlyGiftError(loadError, lang)}</p>
          </div>
          {!setupMissing ? (
            <button type="button" className="sample-clear" onClick={() => void load()}>
              {fr ? "Réessayer" : "Try again"}
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div className="gv-alert" role="alert">
          <p>{error}</p>
          <button type="button" className="gv-alert__close" aria-label={fr ? "Fermer" : "Dismiss"} onClick={() => setError("")}>
            ×
          </button>
        </div>
      ) : null}

      {!loaded ? (
        <div className="gv-skeleton" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      ) : null}

      {!isCreator && creating && !loadError ? (
        <section className="gv-card gift-create">
          <header className="gift-create__head">
            <h2>{fr ? "Campagne cadeau" : "Gift campaign"}</h2>
            <p>
              {fr
                ? "Le produit, le brief, et si le contrat autorise l’usage publicitaire. Le créateur voit tout avant d’accepter."
                : "The product, the brief, and whether the contract grants advertising use. The creator sees all of it before accepting."}
            </p>
          </header>
          <form
            className="gift-create__form"
            onSubmit={(event) => {
              event.preventDefault();
              void send({
                op: "create_campaign",
                name: campaignName,
                product,
                brief,
                deadline,
                allowAds,
                rightsDays: allowAds ? Number(rightsDays) : 0,
                territories: allowAds ? territories : "",
                lang,
              }).then((result) => {
                if (result.ok) {
                  setCampaignName("");
                  setProduct("");
                  setBrief("");
                  setCreating(false);
                }
              });
            }}
          >
            <div className="gv-row2">
              <label>
                {fr ? "Nom" : "Name"}
                <input className="gv-field" aria-label={fr ? "Nom de la campagne" : "Campaign name"} required value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder={fr ? "Routine du matin" : "Morning routine"} />
              </label>
              <label>
                {fr ? "Produit" : "Product"}
                <input className="gv-field" aria-label={fr ? "Produit" : "Product"} required value={product} onChange={(event) => setProduct(event.target.value)} placeholder={fr ? "Sérum" : "Serum"} />
              </label>
            </div>
            <label>
              Brief
              <textarea className="gv-field" aria-label="Brief" required value={brief} onChange={(event) => setBrief(event.target.value)} placeholder={fr ? "Ce que le créateur doit montrer." : "What the creator should show."} style={{ minHeight: 96 }} />
            </label>
            <label>
              {fr ? "Échéance" : "Deadline"}
              <input className="gv-field" aria-label={fr ? "Échéance" : "Deadline"} type="date" required value={deadline} onChange={(event) => setDeadline(event.target.value)} />
            </label>
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
            {allowAds && (
              <div className="gv-row2">
                <label>
                  {fr ? "Durée des droits (jours)" : "Rights duration (days)"}
                  <input className="gv-field" aria-label={fr ? "Durée des droits" : "Rights duration"} type="number" min="1" step="1" required value={rightsDays} onChange={(event) => setRightsDays(event.target.value)} />
                </label>
                <label>
                  {fr ? "Territoires autorisés" : "Licensed territories"}
                  <input className="gv-field" aria-label={fr ? "Territoires autorisés" : "Licensed territories"} required value={territories} onChange={(event) => setTerritories(event.target.value)} />
                </label>
              </div>
            )}
            <div>
              <button className="es-primary" disabled={busy}>
                {busy ? (fr ? "Création…" : "Creating…") : fr ? "Créer la campagne" : "Create campaign"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {!isCreator && campaigns.length > 0 ? (
        <section className="gv-campaigns">
          {campaigns.map((campaign, i) => {
            const count = missions.filter((m) => m.campaign_id === campaign.id).length;
            const value = inviteHandles[campaign.id] ?? "";
            return (
              <article key={campaign.id} className="gv-campaign" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="gv-campaign__top">
                  <div>
                    <strong>{campaign.name}</strong>
                    <p>
                      {campaign.product}
                      {campaign.deadline ? ` · ${fr ? "avant le" : "by"} ${formatDay(campaign.deadline, lang)}` : ""}
                    </p>
                  </div>
                  <span className={`gv-rights${campaign.allow_ads ? " is-yes" : ""}`}>
                    {campaign.allow_ads
                      ? `Ads · ${campaign.rights_days} ${fr ? "j" : "d"} · ${campaign.territories}`
                      : fr ? "Pas d’usage ads" : "No ad use"}
                  </span>
                </div>
                <div className="gv-campaign__bottom">
                  <span className="gv-muted">
                    {count} mission{count === 1 ? "" : "s"}
                  </span>
                  <form
                    className="gv-inline"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!paid) {
                        setPublishPaywall(true);
                        return;
                      }
                      void send({
                        op: "invite",
                        campaignId: campaign.id,
                        handle: value,
                        platform: "tiktok",
                        lang,
                      }).then((result) => {
                        if (result.code === "paywall") setPublishPaywall(true);
                        if (result.ok) setInviteHandles((prev) => ({ ...prev, [campaign.id]: "" }));
                      });
                    }}
                  >
                    <input
                      className="gv-field"
                      aria-label={fr ? "Pseudo à inviter" : "Handle to invite"}
                      value={value}
                      required={paid}
                      onChange={(event) => setInviteHandles((prev) => ({ ...prev, [campaign.id]: event.target.value }))}
                      placeholder="@handle"
                    />
                    <button className="gv-btn" disabled={busy}>
                      {paid ? (fr ? "Envoyer la mission" : "Send mission") : fr ? "Envoi — payant" : "Send — upgrade"}
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {showSample ? (
        <section className="gv-sample">
          <div className="gv-sample__head">
            <div>
              <span className="sp-sample-tag" style={{ marginLeft: 0 }}>{fr ? "Exemple" : "Sample"}</span>
              <h2>{fr ? "Voici à quoi ressemble une campagne en cours" : "This is what a running campaign looks like"}</h2>
              <p>
                {fr
                  ? "Créateurs fictifs. Chaque carte avance d’une colonne à chaque étape : signature, envoi, réception, vidéo, validation."
                  : "Fictional creators. Each card moves one column per step: signature, shipping, delivery, video, approval."}
              </p>
            </div>
            {!isCreator && !loadError ? (
              <button type="button" className="es-primary" onClick={() => setCreating(true)}>
                {fr ? "Créer la mienne" : "Create mine"}
              </button>
            ) : null}
          </div>
          <GiftPipeline lang={lang} detail={sample} byId={sampleById} />
        </section>
      ) : null}

      {missions.length > 0 ? (
        <section className="gv-card">
          <div className="gv-card__head">
            <h2>{fr ? "Missions et colis" : "Missions and parcels"}</h2>
            {stats.declined > 0 ? (
              <span className="gv-muted">
                {stats.declined} {fr ? "refusée(s)" : "declined"}
              </span>
            ) : null}
          </div>
          <div className="gv-board">
            {GIFT_BOARD_COLUMNS.map((column, col) => {
              const cards = missions.filter((m) => giftColumnFor(m.status) === column.id);
              return (
                <section key={column.id} className="gv-board__col" style={{ animationDelay: `${col * 60}ms` }}>
                  <header>
                    <span>{giftStatusLabel(column.id, lang)}</span>
                    <em>{cards.length}</em>
                  </header>
                  {cards.length === 0 ? <div className="sp-board__empty" /> : null}
                  {cards.map((mission) => (
                    <button
                      key={mission.id}
                      type="button"
                      className={`gv-mission${openId === mission.id ? " is-open" : ""}`}
                      onClick={() => setOpenId(openId === mission.id ? null : mission.id)}
                    >
                      <span className="sp-who sp-who--small">
                        <SampleAvatar name={mission.creator_handle} hue={hueOf(mission.creator_handle)} size={22} />
                        <strong>@{mission.creator_handle}</strong>
                      </span>
                      <small>{campaignTitle(mission.campaign_id) || giftStatusLabel(mission.status, lang)}</small>
                      {mission.status === "accepted" ? <em className="gv-chip">{giftStatusLabel("accepted", lang)}</em> : null}
                    </button>
                  ))}
                </section>
              );
            })}
          </div>
          {stats.declined > 0 ? (
            <div className="gv-declined">
              {missions
                .filter((m) => m.status === "declined")
                .map((m) => (
                  <button key={m.id} type="button" className="gv-chip" onClick={() => setOpenId(m.id)}>
                    @{m.creator_handle} · {giftStatusLabel("declined", lang)}
                  </button>
                ))}
            </div>
          ) : null}
          {open && (
            <MissionPanel
              key={open.id}
              lang={lang}
              mission={open}
              campaignName={campaignTitle(open.campaign_id)}
              video={selectedVideo}
              isCreator={!!isCreator}
              busy={busy}
              uploadPercent={uploadPercent}
              onClose={() => setOpenId(null)}
              onAct={(action) => send({ op: "act", missionId: open.id, action })}
              onSubmitVideo={(file) => submitVideo(open.id, file)}
              onOpenVideo={() => openVideo(open.id)}
            />
          )}
        </section>
      ) : loaded && !showSample && !loadError ? (
        <section className="gv-card gv-empty">
          <p>
            {isCreator
              ? fr
                ? "Aucune mission pour le moment. Quand une marque vous en envoie une, elle apparaît ici."
                : "No mission yet. When a brand sends you one, it shows up here."
              : fr
                ? "Aucune mission envoyée. Entrez le pseudo d’un créateur relié à votre marque sur une campagne ci-dessus."
                : "No mission sent yet. Enter the handle of a creator connected to your brand on a campaign above."}
          </p>
        </section>
      ) : null}

      {!isCreator && !loadError && loaded ? (
        <section className="gv-card">
          <div className="gv-card__head">
            <h2>{fr ? "Listes de créateurs" : "Creator wishlists"}</h2>
            <span className="gv-muted">{fr ? "Pour préparer vos prochains envois" : "To prepare your next sends"}</span>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send({ op: "create_wishlist", name: listName }).then((result) => {
                if (result.ok) setListName("");
              });
            }}
            className="gv-inline"
          >
            <input
              className="gv-field"
              aria-label={fr ? "Nom de la liste" : "List name"}
              value={listName}
              required
              onChange={(event) => setListName(event.target.value)}
              placeholder={fr ? "Créateurs beauté" : "Beauty creators"}
            />
            <button className="gv-btn" disabled={busy}>
              {fr ? "Créer" : "Create"}
            </button>
          </form>
          {wishlists.length > 0 ? (
            <div className="gv-lists">
              {wishlists.map((list) => {
                const listItems = items.filter((item) => item.wishlist_id === list.id);
                const value = handles[list.id] ?? "";
                return (
                  <article key={list.id} className="gv-list">
                    <div className="gv-list__top">
                      <strong>{list.name}</strong>
                      <span className="gv-muted">{listItems.length}</span>
                    </div>
                    <div className="gv-list__chips">
                      {listItems.length === 0 ? <span className="gv-muted">{fr ? "Liste vide" : "Empty list"}</span> : null}
                      {listItems.map((item) => (
                        <span key={item.id} className="gv-chip">
                          <SampleAvatar name={item.handle} hue={hueOf(item.handle)} size={16} /> @{item.handle}
                        </span>
                      ))}
                    </div>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void send({
                          op: "add_creator",
                          wishlistId: list.id,
                          handle: value,
                          platform: "tiktok",
                        }).then((result) => {
                          if (result.ok) setHandles((prev) => ({ ...prev, [list.id]: "" }));
                        });
                      }}
                      className="gv-inline"
                    >
                      <input
                        className="gv-field"
                        aria-label={fr ? "Pseudo à ajouter" : "Handle to add"}
                        value={value}
                        required
                        onChange={(event) => setHandles((prev) => ({ ...prev, [list.id]: event.target.value }))}
                        placeholder="@handle"
                      />
                      <button className="gv-btn" disabled={busy}>
                        {fr ? "Ajouter" : "Add"}
                      </button>
                    </form>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      {publishPaywall ? (
        <div role="dialog" aria-modal="true" className="gv-modal" onClick={() => setPublishPaywall(false)}>
          <div className="gv-modal__box" onClick={(event) => event.stopPropagation()}>
            <strong>{fr ? "Publier la campagne" : "Publish the campaign"}</strong>
            <p>
              {fr
                ? "Vous pouvez préparer la campagne. L’envoi de la mission à un créateur déjà connecté à cette marque nécessite un abonnement."
                : "You can prepare the campaign. Sending a mission to a creator already connected to this brand requires a subscription."}
            </p>
            <div className="gv-inline">
              <button type="button" className="gv-btn" onClick={() => setPublishPaywall(false)}>
                {fr ? "Fermer" : "Close"}
              </button>
              <button type="button" className="es-primary" onClick={() => onUpgrade?.()}>
                {fr ? "Débloquer" : "Unlock"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function hueOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

/** Deadlines are calendar dates (YYYY-MM-DD): format them in UTC so no timezone shifts the day. */
function formatDay(value: string, lang: Lang): string {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function ContractSheet({
  fr,
  text,
  signature,
  signedAt,
}: {
  fr: boolean;
  text: string;
  signature: string;
  signedAt: string | null;
}) {
  const granted = contractGrantsAdUse(text);
  const lines = text.split("\n").filter(Boolean);
  return (
    <article className="gift-contract" aria-label={fr ? "Contrat" : "Contract"}>
      <p className="gift-contract__kicker">{fr ? "Contrat" : "Contract"}</p>
      <h3>{fr ? "Accord de gifting" : "Gifting agreement"}</h3>
      <div className={`gift-contract__ads${granted ? " is-yes" : " is-no"}`}>
        <span>{fr ? "Autorisation d’utiliser les vidéos en ads" : "Authorization to use the videos in ads"}</span>
        <strong>{granted ? (fr ? "Accordée" : "Granted") : (fr ? "Refusée" : "Not granted")}</strong>
      </div>
      {lines.map((line, index) => (
        <p key={`${index}-${line}`}>{line}</p>
      ))}
      <div className="gift-contract__sign">
        <span>{fr ? "Signature virtuelle" : "Virtual signature"}</span>
        <div className="gift-contract__script">{signature || (fr ? "Votre nom" : "Your name")}</div>
        <div className="gift-contract__line" />
        {signedAt ? (
          <small>
            {fr ? "Signé le" : "Signed"}{" "}
            {new Date(signedAt).toLocaleDateString(fr ? "fr-FR" : "en-US", { day: "numeric", month: "long", year: "numeric" })}
          </small>
        ) : null}
      </div>
    </article>
  );
}

const TIMELINE = ["invited", "signed", "shipped", "delivered", "submitted", "approved"] as const;

function MissionPanel({
  lang,
  mission,
  campaignName,
  video,
  isCreator,
  busy,
  uploadPercent,
  onClose,
  onAct,
  onSubmitVideo,
  onOpenVideo,
}: {
  lang: Lang;
  mission: Mission;
  campaignName: string;
  video?: Video;
  isCreator: boolean;
  busy: boolean;
  uploadPercent: number | null;
  onClose: () => void;
  onAct: (action: Record<string, unknown>) => void;
  onSubmitVideo: (file: File) => void;
  onOpenVideo: () => void;
}) {
  const fr = lang === "fr";
  const [name, setName] = useState("");
  const [line, setLine] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("France");
  const [consent, setConsent] = useState(false);
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState("");
  const column = giftColumnFor(mission.status);
  const reached = column ? TIMELINE.indexOf(column as (typeof TIMELINE)[number]) : -1;

  return (
    <div className="gv-panel">
      <div className="gv-panel__head">
        <div>
          <span className="sp-who">
            <SampleAvatar name={mission.creator_handle} hue={hueOf(mission.creator_handle)} size={36} />
            <span>
              <strong>@{mission.creator_handle}</strong>
              <small>{campaignName}</small>
            </span>
          </span>
        </div>
        <button type="button" className="gv-btn" onClick={onClose}>
          {fr ? "Fermer" : "Close"}
        </button>
      </div>

      {mission.status !== "declined" ? (
        <ol className="gv-timeline" aria-label={fr ? "Avancement" : "Progress"}>
          {TIMELINE.map((step, i) => (
            <li key={step} className={i < reached ? "is-done" : i === reached ? "is-now" : ""}>
              <span>{i < reached ? "✓" : i + 1}</span>
              {giftStatusLabel(step, lang)}
            </li>
          ))}
        </ol>
      ) : null}

      <p className="gv-next">{giftNextStep(mission.status, isCreator, lang)}</p>

      <div className="gv-panel__grid">
        <ContractSheet
          fr={fr}
          text={mission.contract_text}
          signature={mission.signed_name || (mission.status === "accepted" ? name : "")}
          signedAt={mission.signed_at}
        />

        <div className="gv-panel__side">
          {mission.address && (
            <div className="gv-fact">
              <span>{fr ? "Adresse de livraison" : "Delivery address"}</span>
              <strong>
                {mission.address.name}, {mission.address.line}, {mission.address.postalCode} {mission.address.city}, {mission.address.country}
              </strong>
            </div>
          )}
          {(mission.carrier || mission.tracking_number) && (
            <div className="gv-fact">
              <span>{fr ? "Colis" : "Parcel"}</span>
              <strong>
                {mission.carrier} · {mission.tracking_number}
              </strong>
              <small>{fr ? "Suivi déclaré à la main, pas une preuve transporteur." : "Tracking entered by hand, not carrier proof."}</small>
            </div>
          )}
          {video && (
            <div className="gv-fact">
              <span>{fr ? "Vidéo" : "Video"}</span>
              <strong>{video.name}</strong>
              <small>
                {(VIDEO_STATUS[video.status]?.[lang] ?? video.status) + (video.feedback ? ` · ${video.feedback}` : "")}
              </small>
              <button type="button" className="gv-btn" disabled={busy} onClick={onOpenVideo}>
                {fr ? "Voir la vidéo" : "Open video"}
              </button>
            </div>
          )}

          {isCreator && mission.status === "invited" && (
            <div className="gv-inline">
              <button className="es-primary" disabled={busy} onClick={() => onAct({ type: "accept" })}>
                {fr ? "Accepter" : "Accept"}
              </button>
              <button className="gv-btn" disabled={busy} onClick={() => onAct({ type: "decline" })}>
                {fr ? "Refuser" : "Decline"}
              </button>
            </div>
          )}
          {isCreator && mission.status === "accepted" && (
            <form
              className="gv-form"
              onSubmit={(event) => {
                event.preventDefault();
                onAct({
                  type: "sign",
                  name,
                  consent,
                  address: { name, line, postalCode, city, country },
                });
              }}
            >
              <input className="gv-field" aria-label={fr ? "Signature" : "Signature"} required value={name} onChange={(event) => setName(event.target.value)} placeholder={fr ? "Prénom et nom" : "Full name"} />
              <input className="gv-field" aria-label={fr ? "Adresse" : "Address"} required value={line} onChange={(event) => setLine(event.target.value)} placeholder={fr ? "Voie" : "Street"} />
              <div className="gv-row2">
                <input className="gv-field" aria-label={fr ? "Code postal" : "Postal code"} required value={postalCode} onChange={(event) => setPostalCode(event.target.value)} placeholder={fr ? "Code postal" : "Postal code"} />
                <input className="gv-field" aria-label={fr ? "Ville" : "City"} required value={city} onChange={(event) => setCity(event.target.value)} placeholder={fr ? "Ville" : "City"} />
              </div>
              <input className="gv-field" aria-label={fr ? "Pays" : "Country"} required value={country} onChange={(event) => setCountry(event.target.value)} />
              <label className="gv-check">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                {fr
                  ? "Je signe ce contrat, y compris l’autorisation ads indiquée. Le texte reste figé."
                  : "I sign this contract, including the ads authorization shown. The text stays frozen."}
              </label>
              <button className="es-primary" disabled={busy || !consent}>
                {fr ? "Signer" : "Sign"}
              </button>
            </form>
          )}
          {!isCreator && mission.status === "signed" && (
            <form
              className="gv-form"
              onSubmit={(event) => {
                event.preventDefault();
                onAct({ type: "ship", carrier, trackingNumber: tracking });
              }}
            >
              <input className="gv-field" aria-label={fr ? "Transporteur" : "Carrier"} required value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder={fr ? "Transporteur (Colissimo, UPS…)" : "Carrier (UPS, DHL…)"} />
              <input className="gv-field" aria-label={fr ? "Numéro de suivi" : "Tracking number"} required value={tracking} onChange={(event) => setTracking(event.target.value)} placeholder={fr ? "Numéro de suivi" : "Tracking number"} />
              <button className="es-primary" disabled={busy}>
                {fr ? "Marquer envoyé" : "Mark sent"}
              </button>
            </form>
          )}
          {mission.status === "shipped" && (
            <button className="es-primary" disabled={busy} onClick={() => onAct({ type: "deliver" })}>
              {fr ? "Marquer reçu" : "Mark received"}
            </button>
          )}
          {isCreator && (mission.status === "delivered" || mission.status === "submitted") && (
            <form
              className="gv-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (videoFile) onSubmitVideo(videoFile);
              }}
            >
              <label className="gv-drop">
                <input aria-label={fr ? "Fichier vidéo" : "Video file"} type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)} />
                <strong>{videoFile ? videoFile.name : fr ? "Choisir la vidéo" : "Choose the video"}</strong>
                <small>MP4, MOV, WebM · 500 Mo max</small>
              </label>
              {uploadPercent !== null ? (
                <div className="gv-progress" aria-label={`${uploadPercent} %`}>
                  <span style={{ width: `${uploadPercent}%` }} />
                </div>
              ) : null}
              <button className="es-primary" disabled={busy || !videoFile}>
                {uploadPercent === null ? (fr ? "Déposer" : "Submit") : `${uploadPercent} %`}
              </button>
            </form>
          )}
          {!isCreator && mission.status === "submitted" && (
            <div className="gv-form">
              <button className="es-primary" disabled={busy} onClick={() => onAct({ type: "approve" })}>
                {fr ? "Valider la vidéo" : "Approve the video"}
              </button>
              <form
                className="gv-inline"
                onSubmit={(event) => {
                  event.preventDefault();
                  onAct({ type: "request_changes", feedback });
                }}
              >
                <input className="gv-field" aria-label={fr ? "Retour" : "Feedback"} required value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder={fr ? "Ce qu’il faut changer" : "What should change"} />
                <button className="gv-btn" disabled={busy}>
                  {fr ? "Demander une modification" : "Request changes"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
