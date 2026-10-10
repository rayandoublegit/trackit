"use client";

import { useEffect, useState } from "react";
import { PlatformLogo } from "@/components/PlatformLogo";
import { buildMailComposeLink, readStoredMailClient } from "@/lib/mail-client";
import { openComposeLink } from "@/lib/outreach-email";
import { formatFollowers, giftShareMessage, giftShareUrl, giftTakesSpot, giftCampaignAvailability, todayIso } from "@/lib/gift-share";
import { CreatorAvatar } from "./CreatorAvatar";
import type { GiftCampaignUi, GiftMissionUi } from "./gifting-types";

// One gift campaign, brand side: the link to send, the applications to review,
// and (secondary) a mission sent straight to a creator already connected.

type Lang = "en" | "fr";

export function giftCampaignStateLabel(campaign: GiftCampaignUi, taken: number, lang: Lang): { label: string; tone: "open" | "paused" | "closed" } {
  const fr = lang === "fr";
  const a = giftCampaignAvailability(
    { status: campaign.status ?? "active", share_enabled: campaign.share_enabled, deadline: campaign.deadline, spots: campaign.spots },
    taken,
    todayIso(),
  );
  switch (a.reason) {
    case "open":
      return { label: fr ? "Lien ouvert" : "Link open", tone: "open" };
    case "disabled":
      return { label: fr ? "Lien en pause" : "Link paused", tone: "paused" };
    case "full":
      return { label: fr ? "Complète" : "Full", tone: "closed" };
    case "expired":
      return { label: fr ? "Échéance passée" : "Deadline passed", tone: "closed" };
    default:
      return { label: fr ? "Terminée" : "Closed", tone: "closed" };
  }
}

function countryName(code: string, lang: Lang) {
  try {
    return new Intl.DisplayNames([lang === "fr" ? "fr-FR" : "en-US"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function GiftCampaignDetail({
  lang,
  campaign,
  missions,
  brandName,
  paid,
  busy,
  inviteHandle,
  justCreated,
  onInviteHandle,
  onSend,
  onUpgrade,
  onOpenMission,
  onClose,
}: {
  lang: Lang;
  campaign: GiftCampaignUi;
  missions: GiftMissionUi[];
  brandName: string;
  paid: boolean;
  busy: boolean;
  inviteHandle: string;
  justCreated: boolean;
  onInviteHandle: (value: string) => void;
  onSend: (payload: Record<string, unknown>) => Promise<{ ok: boolean; code?: string }>;
  onUpgrade: () => void;
  onOpenMission: (id: string) => void;
  onClose: () => void;
}) {
  const fr = lang === "fr";
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<"link" | "message" | null>(null);
  const [showInvite, setShowInvite] = useState(Boolean(inviteHandle));
  useEffect(() => setOrigin(window.location.origin), []);

  const taken = missions.filter((m) => giftTakesSpot(m.status)).length;
  const applicants = missions.filter((m) => m.status === "applied");
  const rejected = missions.filter((m) => m.status === "rejected").length;
  const state = giftCampaignStateLabel(campaign, taken, lang);
  const token = campaign.share_token ?? "";
  const url = token && origin ? giftShareUrl(origin, token, lang) : "";
  const message = giftShareMessage({ brandName: brandName || (fr ? "Notre marque" : "Our brand"), product: campaign.product, url, lang });
  const closed = (campaign.status ?? "active") !== "active";
  const paused = campaign.share_enabled === false;
  const full = campaign.spots != null && taken >= campaign.spots;
  const canShare = paid && Boolean(url) && !closed;

  async function copy(textToCopy: string, what: "link" | "message") {
    try {
      await navigator.clipboard.writeText(textToCopy);
    } catch {
      const area = document.createElement("textarea");
      area.value = textToCopy;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(what);
    window.setTimeout(() => setCopied(null), 1800);
  }

  function email() {
    const link = buildMailComposeLink({
      client: readStoredMailClient() ?? "mailto",
      to: "",
      subject: fr ? `${brandName || "Une marque"} t’offre ${campaign.product}` : `${brandName || "A brand"} is gifting you ${campaign.product}`,
      body: message,
      lang,
    });
    openComposeLink(link.url);
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: campaign.product, text: message, url });
    } catch {
      // dismissed
    }
  }

  return (
    <section className="gv-card gcd" aria-label={campaign.name}>
      <header className="gcd-head">
        <div>
          <span className={`gcd-state is-${state.tone}`}>{state.label}</span>
          <h2>{campaign.name}</h2>
          <p className="gv-muted">
            {campaign.product}
            {campaign.spots != null ? ` · ${fr ? `${taken}/${campaign.spots} places prises` : `${taken}/${campaign.spots} spots taken`}` : ""}
            {campaign.auto_approve ? ` · ${fr ? "acceptation auto" : "auto-approve"}` : ""}
          </p>
        </div>
        <div className="gv-inline">
          <button
            type="button"
            className="gv-btn"
            disabled={busy}
            onClick={() => {
              if (!closed && !window.confirm(fr ? "Terminer la campagne ? Le lien n’acceptera plus de candidatures." : "Close the campaign? The link stops taking applications.")) return;
              void onSend({ op: "campaign_status", campaignId: campaign.id, status: closed ? "active" : "completed" });
            }}
          >
            {closed ? (fr ? "Rouvrir" : "Reopen") : fr ? "Terminer" : "Close campaign"}
          </button>
          <button type="button" className="gv-btn" onClick={onClose}>
            {fr ? "Fermer" : "Close"}
          </button>
        </div>
      </header>

      {justCreated ? (
        <div className="gcd-created" role="status">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12l5 5L19 7" />
          </svg>
          <div>
            <strong>{fr ? "Campagne créée" : "Campaign created"}</strong>
            <p>{fr ? "Envoyez ce lien aux créateurs : ils s’inscrivent, postulent, et leurs candidatures arrivent ici." : "Send this link to creators: they sign up, apply, and their applications land here."}</p>
          </div>
        </div>
      ) : null}

      <div className={`gcd-share${canShare ? "" : " is-locked"}`}>
        <div className="gcd-share__head">
          <strong>{fr ? "Lien à envoyer aux créateurs" : "Link to send to creators"}</strong>
          {paused && !closed ? <span className="gv-chip">{fr ? "En pause" : "Paused"}</span> : null}
        </div>
        <div className="gcd-link">
          <input className="gv-field" readOnly value={paid ? url : `${origin}/gift/••••••••`} onFocus={(e) => e.currentTarget.select()} aria-label={fr ? "Lien de la campagne cadeau" : "Gift campaign link"} />
          <button type="button" className="es-primary" disabled={!canShare} onClick={() => void copy(url, "link")}>
            {copied === "link" ? (fr ? "Copié" : "Copied") : fr ? "Copier le lien" : "Copy link"}
          </button>
        </div>
        {paid ? (
          <div className="gcd-channels">
            <a className={`gcd-channel${canShare ? "" : " is-off"}`} href={canShare ? `https://wa.me/?text=${encodeURIComponent(message)}` : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!canShare}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 20l1.3-3.9A8 8 0 1112 20a8 8 0 01-3.9-1z" />
                <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.4-1.8-.9-.8.8a4 4 0 01-2.4-2.4l.8-.8-.9-1.8z" />
              </svg>
              WhatsApp
            </a>
            <button
              type="button"
              className="gcd-channel"
              disabled={!canShare}
              onClick={() => {
                void copy(message, "message");
                window.open("https://www.instagram.com/direct/inbox/", "_blank", "noopener,noreferrer");
              }}
            >
              <PlatformLogo platform="instagram" size={18} />
              {copied === "message" ? (fr ? "Message copié" : "Message copied") : fr ? "DM Instagram" : "Instagram DM"}
            </button>
            <button type="button" className="gcd-channel" disabled={!canShare} onClick={email}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 7l9 6 9-6" />
              </svg>
              Email
            </button>
            {typeof navigator !== "undefined" && "share" in navigator ? (
              <button type="button" className="gcd-channel" disabled={!canShare} onClick={() => void nativeShare()}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 002 2h10a2 2 0 002-2v-5" />
                </svg>
                {fr ? "Partager" : "Share"}
              </button>
            ) : null}
            <a className={`gcd-channel${url ? "" : " is-off"}`} href={url || undefined} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
              </svg>
              {fr ? "Voir la page" : "View page"}
            </a>
          </div>
        ) : (
          <div className="gcd-lock">
            <p>{fr ? "La campagne est prête. L’envoi du lien aux créateurs nécessite un abonnement." : "The campaign is ready. Sending the link to creators requires a subscription."}</p>
            <button type="button" className="es-primary" onClick={onUpgrade}>
              {fr ? "Débloquer" : "Unlock"}
            </button>
          </div>
        )}
        {paid && !closed ? (
          <div className="gcd-linkctl">
            <button
              type="button"
              className="gv-btn"
              disabled={busy}
              onClick={() => void onSend({ op: "share_link", campaignId: campaign.id, action: paused ? "enable" : "disable" })}
            >
              {paused ? (fr ? "Réactiver le lien" : "Turn the link back on") : fr ? "Mettre le lien en pause" : "Pause the link"}
            </button>
            <button
              type="button"
              className="gv-btn"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(fr ? "Créer un nouveau lien ? L’ancien ne fonctionnera plus." : "Make a new link? The old one stops working.")) return;
                void onSend({ op: "share_link", campaignId: campaign.id, action: "regenerate" });
              }}
            >
              {fr ? "Nouveau lien" : "New link"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="gcd-section">
        <div className="gv-card__head">
          <h3>
            {fr ? "Candidatures" : "Applications"} {applicants.length > 0 ? <em className="gcd-count">{applicants.length}</em> : null}
          </h3>
          {rejected > 0 ? <span className="gv-muted">{fr ? `${rejected} refusée${rejected > 1 ? "s" : ""}` : `${rejected} declined`}</span> : null}
        </div>
        {applicants.length === 0 ? (
          <p className="gv-muted gcd-empty">
            {campaign.auto_approve
              ? fr
                ? "Les créateurs qui remplissent vos critères passent directement à la signature. Les autres apparaissent ici."
                : "Creators who meet your criteria go straight to signing. The others show up here."
              : fr
                ? "Aucune candidature pour l’instant. Envoyez le lien : chaque créateur qui postule apparaît ici avec ses statistiques."
                : "No application yet. Send the link: every creator who applies shows up here with their stats."}
          </p>
        ) : (
          <ul className="gcd-applicants">
            {applicants.map((m, i) => {
              const s = m.creator_stats ?? null;
              return (
                <li key={m.id} className="gcd-applicant" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="gcd-applicant__who">
                    <CreatorAvatar src={s?.avatarUrl ?? null} username={m.creator_handle} size={44} alt={`@${m.creator_handle}`} />
                    <div>
                      <strong>
                        <PlatformLogo platform={m.creator_platform} size={14} /> @{m.creator_handle}
                      </strong>
                      {s?.displayName ? <small>{s.displayName}</small> : null}
                    </div>
                  </div>
                  <dl className="gcd-stats">
                    <div>
                      <dt>{fr ? "Abonnés" : "Followers"}</dt>
                      <dd>{s?.followers != null ? formatFollowers(s.followers, lang) : "—"}</dd>
                    </div>
                    <div>
                      <dt>{fr ? "Vues moy." : "Avg views"}</dt>
                      <dd>{s?.avgViews != null ? formatFollowers(s.avgViews, lang) : "—"}</dd>
                    </div>
                    <div>
                      <dt>{fr ? "Engagement" : "Engagement"}</dt>
                      <dd>{s?.engagementRate != null ? `${s.engagementRate.toLocaleString(fr ? "fr-FR" : "en-US", { maximumFractionDigits: 1 })} %` : "—"}</dd>
                    </div>
                    <div>
                      <dt>{fr ? "Pays" : "Country"}</dt>
                      <dd>{s?.country ? countryName(s.country, lang) : "—"}</dd>
                    </div>
                  </dl>
                  {!s ? <p className="gv-muted">{fr ? "Pas encore de statistiques pour ce compte." : "No stats for this account yet."}</p> : null}
                  {m.application_message ? <blockquote className="gcd-msg">{m.application_message}</blockquote> : null}
                  <div className="gv-inline">
                    <button
                      type="button"
                      className="es-primary"
                      disabled={busy || full}
                      title={full ? (fr ? "Toutes les places sont prises" : "Every spot is taken") : undefined}
                      onClick={() => void onSend({ op: "act", missionId: m.id, action: { type: "approve_application" } })}
                    >
                      {fr ? "Accepter" : "Approve"}
                    </button>
                    <button type="button" className="gv-btn" disabled={busy} onClick={() => void onSend({ op: "act", missionId: m.id, action: { type: "decline_application" } })}>
                      {fr ? "Refuser" : "Decline"}
                    </button>
                    {m.applied_at ? (
                      <span className="gv-muted">
                        {new Date(m.applied_at).toLocaleDateString(fr ? "fr-FR" : "en-US", { day: "numeric", month: "short" })}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {full && applicants.length > 0 ? (
          <p className="gv-muted">{fr ? "Toutes les places sont prises : ajoutez des places en créant une nouvelle campagne, ou refusez les candidatures restantes." : "Every spot is taken: decline the remaining applications or start a new campaign."}</p>
        ) : null}
      </div>

      {missions.some((m) => giftTakesSpot(m.status)) ? (
        <div className="gcd-section">
          <h3>{fr ? "Créateurs retenus" : "Selected creators"}</h3>
          <div className="gv-list__chips">
            {missions
              .filter((m) => giftTakesSpot(m.status))
              .map((m) => (
                <button key={m.id} type="button" className="gv-chip" onClick={() => onOpenMission(m.id)}>
                  <CreatorAvatar src={m.creator_stats?.avatarUrl ?? null} username={m.creator_handle} size={16} /> @{m.creator_handle}
                </button>
              ))}
          </div>
        </div>
      ) : null}

      {(campaign.min_followers ?? 0) > 0 || (campaign.countries?.length ?? 0) > 0 ? (
        <p className="gv-muted">
          {fr ? "Critères : " : "Criteria: "}
          {[
            (campaign.min_followers ?? 0) > 0 ? `${formatFollowers(campaign.min_followers ?? 0, lang)} ${fr ? "abonnés min." : "followers min."}` : "",
            (campaign.countries ?? []).map((c) => countryName(c, lang)).join(", "),
            (campaign.platforms ?? []).join(" / "),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}

      <div className="gcd-section">
        <button type="button" className="gvc-more" aria-expanded={showInvite} onClick={() => setShowInvite((v) => !v)}>
          {fr ? "Inviter directement un créateur déjà relié à votre marque" : "Invite a creator already connected to your brand"}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden style={{ transform: showInvite ? "rotate(180deg)" : undefined }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {showInvite ? (
          <form
            className="gv-inline"
            style={{ marginTop: 10 }}
            onSubmit={(event) => {
              event.preventDefault();
              if (!paid) return onUpgrade();
              void onSend({ op: "invite", campaignId: campaign.id, handle: inviteHandle, platform: "tiktok", lang }).then((result) => {
                if (result.code === "paywall") onUpgrade();
                if (result.ok) onInviteHandle("");
              });
            }}
          >
            <input
              className="gv-field"
              aria-label={fr ? "Pseudo à inviter" : "Handle to invite"}
              value={inviteHandle}
              required
              onChange={(event) => onInviteHandle(event.target.value)}
              placeholder={fr ? "@pseudo" : "@handle"}
            />
            <button className="gv-btn" disabled={busy}>
              {fr ? "Envoyer la mission" : "Send mission"}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
