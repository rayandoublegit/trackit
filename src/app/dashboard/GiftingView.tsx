"use client";

import { useCallback, useEffect, useState } from "react";
import { contractGrantsAdUse } from "@/lib/gifting";
import { uploadGiftVideoResumable } from "@/lib/gift-video-upload";
import { useLang } from "@/lib/useLang";

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

const STATUSES = [
  "invited",
  "accepted",
  "signed",
  "shipped",
  "delivered",
  "submitted",
  "approved",
  "declined",
] as const;

export function GiftingView({
  isMobile,
  isCreator,
  plan = "free",
  onUpgrade,
}: {
  isMobile?: boolean;
  isCreator?: boolean;
  plan?: string;
  onUpgrade?: () => void;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [listName, setListName] = useState("");
  const [handle, setHandle] = useState("");
  const [inviteHandle, setInviteHandle] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [product, setProduct] = useState("");
  const [brief, setBrief] = useState("");
  const [deadline, setDeadline] = useState("");
  const [allowAds, setAllowAds] = useState(true);
  const [rightsDays, setRightsDays] = useState("90");
  const [territories, setTerritories] = useState("France");
  const [publishPaywall, setPublishPaywall] = useState(false);
  const paid = plan !== "free";
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/gifting");
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || (fr ? "Chargement impossible." : "Could not load."));
      return;
    }
    setError("");
    setWishlists(body.wishlists ?? []);
    setItems(body.items ?? []);
    setCampaigns(body.campaigns ?? []);
    setMissions(body.missions ?? []);
    setVideos(body.videos ?? []);
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
      const body = await response.json();
      if (!response.ok) {
        setError(body.error || (fr ? "Action refusée." : "Action refused."));
        return { ...body, ok: false };
      }
      await load();
      return { ...body, ok: true };
    } catch {
      setError(fr ? "Connexion impossible. Réessaie." : "Connection failed. Please try again.");
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

  const pad = isMobile ? 16 : 40;
  const open = missions.find((mission) => mission.id === openId) ?? null;
  const selectedVideo = videos.find((video) => video.mission_id === open?.id);

  return (
    <div style={{ padding: pad, color: "var(--ws-text)", display: "grid", gap: 28 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 28, letterSpacing: "-0.03em" }}>
          {fr ? "Gifting" : "Gifting"}
        </h1>
        <p style={{ margin: "8px 0 0", color: "var(--ws-text-muted, #8e8e93)" }}>
          {fr
            ? "Listes, contrat figé, colis et droits publicitaires. Le forfait affiché ne déclenche pas de paiement."
            : "Lists, a frozen contract, the parcel and ad rights. A shown fee does not trigger a payment."}
        </p>
      </header>
      {error && (
        <p role="alert" style={{ margin: 0, color: "#b42318" }}>
          {error}
        </p>
      )}

      {!isCreator && (
        <section style={panel}>
          <h2 style={heading}>{fr ? "Listes" : "Wishlists"}</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send({ op: "create_wishlist", name: listName }).then((result) => { if (result.ok) setListName(""); });
            }}
            style={row}
          >
            <input
              aria-label={fr ? "Nom de la liste" : "List name"}
              value={listName}
              onChange={(event) => setListName(event.target.value)}
              placeholder={fr ? "Créateurs beauté" : "Beauty creators"}
              style={field}
            />
            <button style={button} disabled={busy}>
              {fr ? "Créer" : "Create"}
            </button>
          </form>
          {wishlists.map((list) => (
            <article key={list.id} style={{ marginTop: 16 }}>
              <strong>{list.name}</strong>
              <ul>
                {items
                  .filter((item) => item.wishlist_id === list.id)
                  .map((item) => (
                    <li key={item.id}>
                      @{item.handle} · {item.platform}
                    </li>
                  ))}
              </ul>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send({
                    op: "add_creator",
                    wishlistId: list.id,
                    handle,
                    platform: "tiktok",
                  }).then((result) => { if (result.ok) setHandle(""); });
                }}
                style={row}
              >
                <input
                  aria-label={fr ? "Pseudo à ajouter" : "Handle to add"}
                  value={handle}
                  onChange={(event) => setHandle(event.target.value)}
                  placeholder="@handle"
                  style={field}
                />
                <button style={button} disabled={busy}>
                  {fr ? "Ajouter" : "Add"}
                </button>
              </form>
            </article>
          ))}
        </section>
      )}

      {!isCreator && (
        <section className="gift-create" style={panel}>
          <header className="gift-create__head">
            <h2 style={heading}>{fr ? "Campagne de cadeau" : "Gift campaign"}</h2>
            <p>
              {fr
                ? "Le produit, le brief, et si le contrat autorise l’usage publicitaire."
                : "The product, the brief, and whether the contract grants advertising use."}
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
                }
              });
            }}
          >
            <label>
              {fr ? "Nom" : "Name"}
              <input aria-label={fr ? "Nom de la campagne" : "Campaign name"} value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder={fr ? "Routine du matin" : "Morning routine"} style={field} />
            </label>
            <label>
              {fr ? "Produit" : "Product"}
              <input aria-label={fr ? "Produit" : "Product"} value={product} onChange={(event) => setProduct(event.target.value)} placeholder={fr ? "Sérum" : "Serum"} style={field} />
            </label>
            <label>
              Brief
              <textarea aria-label="Brief" value={brief} onChange={(event) => setBrief(event.target.value)} placeholder={fr ? "Ce que le créateur doit montrer." : "What the creator should show."} style={{ ...field, minHeight: 96 }} />
            </label>
            <label>
              {fr ? "Échéance" : "Deadline"}
              <input aria-label={fr ? "Échéance" : "Deadline"} type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} style={field} />
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
              <div style={row}>
                <label>
                  {fr ? "Durée des droits (jours)" : "Rights duration (days)"}
                  <input aria-label={fr ? "Durée des droits" : "Rights duration"} type="number" min="1" step="1" required value={rightsDays} onChange={(event) => setRightsDays(event.target.value)} style={field} />
                </label>
                <label>
                  {fr ? "Territoires autorisés" : "Licensed territories"}
                  <input aria-label={fr ? "Territoires autorisés" : "Licensed territories"} required value={territories} onChange={(event) => setTerritories(event.target.value)} style={field} />
                </label>
              </div>
            )}
            <button style={button} disabled={busy}>
              {fr ? "Créer la campagne" : "Create campaign"}
            </button>
          </form>
          {campaigns.map((campaign) => (
            <article key={campaign.id} className="gift-campaign-card">
              <strong>{campaign.name}</strong>
              <p>
                {campaign.product} · {campaign.deadline}
                {" · "}
                {campaign.allow_ads
                  ? fr
                    ? `usage publicitaire autorisé · ${campaign.rights_days} jours · ${campaign.territories}`
                    : `advertising use granted · ${campaign.rights_days} days · ${campaign.territories}`
                  : fr
                    ? "usage publicitaire non autorisé"
                    : "advertising use not granted"}
              </p>
              <form
                style={row}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!paid) {
                    setPublishPaywall(true);
                    return;
                  }
                  void send({
                    op: "invite",
                    campaignId: campaign.id,
                    handle: inviteHandle,
                    platform: "tiktok",
                    lang,
                  }).then((result) => {
                    if (result && typeof result === "object" && "code" in result && result.code === "paywall") {
                      setPublishPaywall(true);
                    }
                  });
                }}
              >
                <input
                  aria-label={fr ? "Pseudo à inviter" : "Handle to invite"}
                  value={inviteHandle}
                  onChange={(event) => setInviteHandle(event.target.value)}
                  placeholder="@handle"
                  style={field}
                />
                <button style={button} disabled={busy}>
                  {paid ? (fr ? "Envoyer la mission" : "Send mission") : (fr ? "Envoi — payant" : "Send — upgrade")}
                </button>
              </form>
            </article>
          ))}
        </section>
      )}

      <section style={panel}>
        <h2 style={heading}>{fr ? "Missions et colis" : "Missions and parcels"}</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {STATUSES.map((status) => (
            <span key={status} style={{ fontSize: 12, color: "var(--ws-text-muted, #8e8e93)" }}>
              {missions.filter((mission) => mission.status === status).length} {status}
            </span>
          ))}
        </div>
        {missions.length === 0 && (
          <p style={{ color: "var(--ws-text-muted, #8e8e93)" }}>
            {fr ? "Aucune mission pour le moment." : "No mission yet."}
          </p>
        )}
        {missions.map((mission) => (
          <button
            key={mission.id}
            onClick={() => setOpenId(mission.id)}
            style={{ ...button, marginRight: 8, marginBottom: 8 }}
          >
            @{mission.creator_handle} · {mission.status}
          </button>
        ))}
        {open && (
          <MissionPanel
            fr={fr}
            mission={open}
            video={selectedVideo}
            isCreator={!!isCreator}
            busy={busy}
            uploadPercent={uploadPercent}
            onAct={(action) => send({ op: "act", missionId: open.id, action })}
            onSubmitVideo={(file) => submitVideo(open.id, file)}
            onOpenVideo={() => openVideo(open.id)}
          />
        )}
      </section>
      {publishPaywall ? (
        <div role="dialog" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", zIndex: 40, padding: 24 }}>
          <div style={{ background: "var(--ws-surface, #fff)", color: "var(--ws-text, #111)", borderRadius: 16, padding: 24, maxWidth: 420, display: "grid", gap: 12 }}>
            <strong>{fr ? "Publier la campagne" : "Publish the campaign"}</strong>
            <p style={{ margin: 0 }}>
              {fr
                ? "Tu peux préparer la campagne. L’envoi de la mission à un créateur déjà connecté à cette marque nécessite un abonnement."
                : "You can prepare the campaign. Sending a mission to a creator already connected to this brand requires a subscription."}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" style={button} onClick={() => setPublishPaywall(false)}>{fr ? "Fermer" : "Close"}</button>
              <button type="button" style={button} onClick={() => onUpgrade?.()}>{fr ? "Débloquer" : "Unlock"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
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
      {lines.map((line) => (
        <p key={line}>{line}</p>
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

function MissionPanel({
  fr,
  mission,
  video,
  isCreator,
  busy,
  uploadPercent,
  onAct,
  onSubmitVideo,
  onOpenVideo,
}: {
  fr: boolean;
  mission: Mission;
  video?: Video;
  isCreator: boolean;
  busy: boolean;
  uploadPercent: number | null;
  onAct: (action: Record<string, unknown>) => void;
  onSubmitVideo: (file: File) => void;
  onOpenVideo: () => void;
}) {
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

  return (
    <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
      <ContractSheet
        fr={fr}
        text={mission.contract_text}
        signature={mission.signed_name || (mission.status === "accepted" ? name : "")}
        signedAt={mission.signed_at}
      />
      {mission.address && (
        <p>
          {mission.address.name}, {mission.address.line}, {mission.address.postalCode}{" "}
          {mission.address.city}, {mission.address.country}
        </p>
      )}
      {(mission.carrier || mission.tracking_number) && (
        <p>
          {fr ? "Colis" : "Parcel"} : {mission.carrier} · {mission.tracking_number}
        </p>
      )}
      {video && (
        <p>
          {video.name} · {video.status}
          {video.feedback ? ` · ${video.feedback}` : ""}
          {" · "}<button type="button" style={button} disabled={busy} onClick={onOpenVideo}>{fr ? "Voir la vidéo" : "Open video"}</button>
        </p>
      )}
      {isCreator && mission.status === "invited" && (
        <div style={row}>
          <button style={button} disabled={busy} onClick={() => onAct({ type: "accept" })}>
            {fr ? "Accepter" : "Accept"}
          </button>
          <button style={button} disabled={busy} onClick={() => onAct({ type: "decline" })}>
            {fr ? "Refuser" : "Decline"}
          </button>
        </div>
      )}
      {isCreator && mission.status === "accepted" && (
        <form
          style={{ display: "grid", gap: 8 }}
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
          <input aria-label={fr ? "Signature" : "Signature"} value={name} onChange={(event) => setName(event.target.value)} placeholder={fr ? "Prénom et nom" : "Full name"} style={field} />
          <input aria-label={fr ? "Adresse" : "Address"} value={line} onChange={(event) => setLine(event.target.value)} placeholder={fr ? "Voie" : "Street"} style={field} />
          <input aria-label={fr ? "Code postal" : "Postal code"} value={postalCode} onChange={(event) => setPostalCode(event.target.value)} style={field} />
          <input aria-label={fr ? "Ville" : "City"} value={city} onChange={(event) => setCity(event.target.value)} style={field} />
          <input aria-label={fr ? "Pays" : "Country"} value={country} onChange={(event) => setCountry(event.target.value)} style={field} />
          <label>
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />{" "}
            {fr
              ? "Je signe ce contrat, y compris l’autorisation ads indiquée ci-dessus. Le texte reste figé."
              : "I sign this contract, including the ads authorization shown above. The text stays frozen."}
          </label>
          <button style={button} disabled={busy}>
            {fr ? "Signer" : "Sign"}
          </button>
        </form>
      )}
      {!isCreator && mission.status === "signed" && (
        <form
          style={row}
          onSubmit={(event) => {
            event.preventDefault();
            onAct({ type: "ship", carrier, trackingNumber: tracking });
          }}
        >
          <input aria-label={fr ? "Transporteur" : "Carrier"} value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder={fr ? "Transporteur" : "Carrier"} style={field} />
          <input aria-label={fr ? "Numéro de suivi" : "Tracking number"} value={tracking} onChange={(event) => setTracking(event.target.value)} placeholder={fr ? "Suivi" : "Tracking"} style={field} />
          <button style={button} disabled={busy}>
            {fr ? "Marquer envoyé" : "Mark sent"}
          </button>
        </form>
      )}
      {mission.status === "shipped" && (
        <button style={button} disabled={busy} onClick={() => onAct({ type: "deliver" })}>
          {fr ? "Marquer reçu" : "Mark received"}
        </button>
      )}
      {isCreator && (mission.status === "delivered" || mission.status === "submitted") && (
        <form
          style={row}
          onSubmit={(event) => {
            event.preventDefault();
            if (videoFile) onSubmitVideo(videoFile);
          }}
        >
          <input aria-label={fr ? "Fichier vidéo" : "Video file"} type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)} style={field} />
          <button style={button} disabled={busy || !videoFile}>
            {uploadPercent === null ? (fr ? "Déposer" : "Submit") : `${uploadPercent} %`}
          </button>
        </form>
      )}
      {!isCreator && mission.status === "submitted" && (
        <div style={{ display: "grid", gap: 8 }}>
          <button style={button} disabled={busy} onClick={() => onAct({ type: "approve" })}>
            {fr ? "Valider" : "Approve"}
          </button>
          <form
            style={row}
            onSubmit={(event) => {
              event.preventDefault();
              onAct({ type: "request_changes", feedback });
            }}
          >
            <input aria-label={fr ? "Retour" : "Feedback"} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder={fr ? "Retour" : "Feedback"} style={field} />
            <button style={button} disabled={busy}>
              {fr ? "Demander une modification" : "Request changes"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const panel: React.CSSProperties = {
  background: "var(--ws-surface)",
  border: "1px solid var(--ws-border)",
  borderRadius: 16,
  padding: 20,
};
const heading: React.CSSProperties = { margin: "0 0 12px", fontSize: 18 };
const row: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const field: React.CSSProperties = {
  border: "1px solid var(--ws-border)",
  borderRadius: 10,
  padding: "8px 10px",
  background: "transparent",
  color: "inherit",
  minWidth: 160,
};
const button: React.CSSProperties = {
  border: "1px solid var(--ws-border)",
  borderRadius: 999,
  padding: "8px 14px",
  background: "var(--ws-surface)",
  color: "inherit",
  cursor: "pointer",
};
