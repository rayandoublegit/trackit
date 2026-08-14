"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLang } from "@/lib/useLang";
import { getClientBrandWorkspaceId } from "@/lib/workspaces";
import { getCampaigns } from "@/lib/db";
import {
  formatContentBytes,
  isImageContentFile,
  isVideoContentFile,
  type ContentListItem,
} from "@/lib/content-shared";

type CampaignOpt = { id: string; name: string };

function formatWhen(iso: string, fr: boolean) {
  try {
    return new Date(iso).toLocaleString(fr ? "fr-FR" : "en-US", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function notifyLabel(item: ContentListItem, fr: boolean) {
  const who = item.creatorName || (item.creatorHandle ? `@${item.creatorHandle}` : fr ? "Un créateur" : "A creator");
  if (isVideoContentFile(item)) {
    return fr ? `${who} a posté une vidéo` : `${who} posted a video`;
  }
  if (isImageContentFile(item)) {
    return fr ? `${who} a envoyé une image` : `${who} sent an image`;
  }
  return fr ? `${who} a envoyé du contenu` : `${who} sent content`;
}

export function FinditInboxView({
  userId,
  isMobile,
}: {
  userId?: string;
  isMobile?: boolean;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  const brandId = getClientBrandWorkspaceId() || userId || "";

  const [items, setItems] = useState<ContentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ContentListItem | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignOpt[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [attachMsg, setAttachMsg] = useState("");

  const load = async () => {
    if (!brandId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/content?brandId=${encodeURIComponent(brandId)}`, {
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; items?: ContentListItem[] };
      setItems(res.ok && data.items ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [brandId]);

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      try {
        const rows = await getCampaigns(userId);
        setCampaigns(
          (rows || []).map((r) => ({
            id: String((r as { id: string }).id),
            name: String((r as { name?: string }).name || "Campaign"),
          })),
        );
      } catch {
        setCampaigns([]);
      }
    })();
  }, [userId]);

  useEffect(() => {
    if (!panelOpen) {
      setCampaignId("");
      setAttachMsg("");
    }
  }, [panelOpen]);

  const openItem = (item: ContentListItem) => {
    setSelected(item);
    setPanelOpen(true);
  };

  const attach = async () => {
    if (!selected || !campaignId || !brandId || attaching) return;
    setAttaching(true);
    setAttachMsg("");
    try {
      const res = await fetch("/api/content/attach-campaign", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          contentId: selected.id,
          campaignId,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; campaignName?: string };
      if (!res.ok || !data.ok) {
        setAttachMsg(data.error || (fr ? "Impossible d’ajouter" : "Couldn’t attach"));
        return;
      }
      setAttachMsg(
        fr
          ? `Ajouté à « ${data.campaignName || "campagne"} »`
          : `Added to “${data.campaignName || "campaign"}”`,
      );
      void load();
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              campaignNames: [...new Set([...(prev.campaignNames || []), data.campaignName || ""].filter(Boolean))],
            }
          : prev,
      );
    } catch {
      setAttachMsg(fr ? "Erreur réseau" : "Network error");
    } finally {
      setAttaching(false);
    }
  };

  const availableCampaigns = useMemo(() => {
    if (!selected) return campaigns;
    const linked = new Set((selected.campaignNames || []).map((n) => n.toLowerCase()));
    return campaigns.filter((c) => !linked.has(c.name.toLowerCase()));
  }, [campaigns, selected]);

  const panel =
    panelOpen && selected && typeof document !== "undefined"
      ? createPortal(
          <div className="fi-inbox-overlay" onClick={() => setPanelOpen(false)}>
            <aside
              className={`fi-inbox-panel${isMobile ? " is-mobile" : ""}`}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="fi-inbox-panel__head">
                <div>
                  <h2>{notifyLabel(selected, fr)}</h2>
                  <p>{formatWhen(selected.created_at, fr)}</p>
                </div>
                <button type="button" className="fi-inbox-panel__close" onClick={() => setPanelOpen(false)} aria-label="Close">
                  ×
                </button>
              </div>

              <div className="fi-inbox-panel__media">
                {isVideoContentFile(selected) ? (
                  <video src={selected.file_url} controls playsInline />
                ) : isImageContentFile(selected) ? (
                  <img src={selected.file_url} alt={selected.title} />
                ) : (
                  <div className="fi-inbox-panel__file">
                    <strong>{selected.file_name}</strong>
                    {selected.file_size ? <span>{formatContentBytes(selected.file_size)}</span> : null}
                    <a href={selected.file_url} target="_blank" rel="noreferrer">
                      {fr ? "Ouvrir le fichier" : "Open file"}
                    </a>
                  </div>
                )}
              </div>

              <div className="fi-inbox-panel__meta">
                <strong>{selected.title}</strong>
                {selected.notes ? <p>{selected.notes}</p> : null}
                {selected.campaignNames && selected.campaignNames.length > 0 ? (
                  <div className="fi-inbox-panel__tags">
                    {selected.campaignNames.map((name) => (
                      <span key={name}>{name}</span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="fi-inbox-panel__cta">
                <label>{fr ? "Ajouter à la campagne" : "Add to campaign"}</label>
                <div className="fi-inbox-panel__cta-row">
                  <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                    <option value="">{fr ? "Choisir une campagne…" : "Choose a campaign…"}</option>
                    {availableCampaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" disabled={!campaignId || attaching} onClick={() => void attach()}>
                    {attaching ? "…" : fr ? "Ajouter" : "Add"}
                  </button>
                </div>
                {attachMsg ? <p className="fi-inbox-panel__msg">{attachMsg}</p> : null}
                {availableCampaigns.length === 0 && campaigns.length > 0 ? (
                  <p className="fi-inbox-panel__hint">
                    {fr ? "Déjà lié à toutes vos campagnes." : "Already linked to all your campaigns."}
                  </p>
                ) : null}
              </div>
            </aside>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`fi-inbox${isMobile ? " is-mobile" : ""}`}>
      <header className="fi-inbox__head">
        <h1>Inbox</h1>
        <p>
          {fr
            ? "Contenu et envois des créateurs — cliquez une notification pour prévisualiser."
            : "Creator uploads and messages — click a notification to preview."}
        </p>
      </header>

      {loading ? (
        <p className="fi-inbox__empty">{fr ? "Chargement…" : "Loading…"}</p>
      ) : items.length === 0 ? (
        <p className="fi-inbox__empty">
          {fr
            ? "Il semblerait que votre inbox Discover soit encore calme — dès qu’un créateur envoie du contenu, il apparaîtra ici."
            : "Looks like your Discover inbox is still quiet — as soon as a creator sends content, it’ll show up here."}
        </p>
      ) : (
        <ul className="fi-inbox__list">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" className="fi-inbox__item" onClick={() => openItem(item)}>
                <span className="fi-inbox__dot" aria-hidden />
                <span className="fi-inbox__body">
                  <strong>{notifyLabel(item, fr)}</strong>
                  <span>
                    {item.title}
                    {item.file_size ? ` · ${formatContentBytes(item.file_size)}` : ""}
                  </span>
                </span>
                <time>{formatWhen(item.created_at, fr)}</time>
              </button>
            </li>
          ))}
        </ul>
      )}

      {panel}
    </div>
  );
}
