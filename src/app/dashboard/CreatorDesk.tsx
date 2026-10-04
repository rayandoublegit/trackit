"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { CreatorPaymentInfo } from "./CreatorPaymentInfo";
import { useCreatorStats } from "@/lib/useCreatorStats";
import { useLang, type Lang } from "@/lib/useLang";

type GiftMission = {
  id: string;
  campaign_id: string;
  status: string;
  carrier: string | null;
  tracking_number: string | null;
  contract_text: string;
};
type GiftCampaign = {
  id: string;
  name: string;
  product: string;
  deadline: string;
  video_count: number;
};
type GiftVideo = { mission_id: string; name: string; status: string; feedback: string };
type RpmTotals = { views?: number; accrued?: number; videos?: number };

const PARCEL: Record<Lang, Record<string, string>> = {
  en: {
    invited: "Invitation received. Nothing has shipped yet.",
    accepted: "Contract to sign. The parcel leaves after that.",
    signed: "Signed. The brand is preparing the shipment.",
    shipped: "The product is on the way.",
    delivered: "Product received. The video can be submitted.",
    submitted: "Video submitted. Waiting on the brand.",
    approved: "Video approved.",
    declined: "Mission declined.",
  },
  fr: {
    invited: "Invitation reçue. Rien n’a encore été expédié.",
    accepted: "Contrat à signer. Le colis part juste après.",
    signed: "Signé. La marque prépare l’envoi.",
    shipped: "Le produit est en route.",
    delivered: "Produit reçu. Tu peux envoyer la vidéo.",
    submitted: "Vidéo envoyée. En attente de la marque.",
    approved: "Vidéo validée.",
    declined: "Mission refusée.",
  },
};

// English shows the raw content status; French gets a readable label.
const VIDEO_STATUS_FR: Record<string, string> = {
  pending: "en revue",
  changes_requested: "modification demandée",
  approved: "validée",
};

export function CreatorDesk({
  userId,
  isMobile,
  fullName,
  username,
  onNavigate,
}: {
  userId?: string;
  isMobile?: boolean;
  fullName?: string | null;
  username?: string | null;
  onNavigate: (view: "infos" | "content" | "gifting" | "analytics" | "payouts" | "settings") => void;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  const { stats, loading: statsLoading } = useCreatorStats(userId);
  const [rpm, setRpm] = useState<RpmTotals | null>(null);
  const [rpmReady, setRpmReady] = useState(false);
  const [missions, setMissions] = useState<GiftMission[]>([]);
  const [campaigns, setCampaigns] = useState<GiftCampaign[]>([]);
  const [videos, setVideos] = useState<GiftVideo[]>([]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void fetch(`/api/creator/rpm?userId=${encodeURIComponent(userId)}&refresh=0`)
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;
        setRpm(body.totals ?? null);
        setRpmReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setRpm(null);
        setRpmReady(true);
      });
    void fetch("/api/gifting")
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;
        setMissions(body.missions ?? []);
        setCampaigns(body.campaigns ?? []);
        setVideos(body.videos ?? []);
      })
      .catch(() => {
        if (!cancelled) setMissions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const pad = isMobile ? 16 : 40;
  const locale = fr ? "fr-FR" : "en-US";
  const viewsLabel = !rpmReady ? "…" : rpm?.views != null ? rpm.views.toLocaleString(locale) : "—";
  const salesLabel = statsLoading ? "…" : stats ? stats.salesCount.toLocaleString(locale) : "—";
  const euros = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const money = (value: number | null | undefined) => (value == null ? "—" : euros.format(value));
  const day = (value: string) => {
    const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
    return Number.isNaN(parsed.getTime())
      ? value
      : parsed.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  };
  const rpmVideos = rpm?.videos ?? 0;
  const shippedCount = missions.filter((mission) => mission.status === "shipped").length;

  return (
    <div style={{ padding: pad, display: "grid", gap: 22, color: "var(--ws-text)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, color: "var(--ws-text-muted)", fontSize: 13 }}>{fr ? "Aujourd’hui" : "Today"}</p>
          <h1 style={{ margin: "6px 0 0", fontSize: 32, letterSpacing: "-0.04em" }}>
            {fullName || username || (fr ? "Créateur" : "Creator")}
          </h1>
          {username ? <p style={note}>@{username.replace(/^@/, "")}</p> : null}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => onNavigate("settings")} style={button}>
            {fr ? "Profil" : "Profile"}
          </button>
          <button type="button" onClick={() => onNavigate("infos")} style={button}>
            {fr ? "Règles" : "Rules"}
          </button>
        </div>
      </header>

      <section style={grid}>
        <article style={card}>
          <p style={kicker}>{fr ? "Affiliation" : "Affiliate"}</p>
          <strong style={figure}>{salesLabel}</strong>
          <span>{fr ? (stats && stats.salesCount > 1 ? "ventes" : "vente") : "sales"}</span>
          <p style={note}>
            {stats
              ? fr
                ? `${money(stats.totalSales)} de ventes · ${money(stats.totalCommissions)} de commission`
                : `${money(stats.totalSales)} in sales · ${money(stats.totalCommissions)} in commission`
              : fr
                ? "Tes ventes et commissions s’affichent ici dès qu’une commande est liée."
                : "Sales and commissions show up here once an order is linked."}
          </p>
          <button type="button" onClick={() => onNavigate("analytics")} style={button}>
            {fr ? "Voir les ventes" : "View sales"}
          </button>
        </article>
        <article style={card}>
          <p style={kicker}>RPM</p>
          <strong style={figure}>{viewsLabel}</strong>
          <span>{fr ? (rpm?.views != null && rpm.views <= 1 ? "vue" : "vues") : "views"}</span>
          <p style={note}>
            {rpm?.accrued != null
              ? fr
                ? `${money(rpm.accrued)} cumulés · ${rpmVideos} vidéo${rpmVideos > 1 ? "s" : ""}`
                : `${money(rpm.accrued)} accrued · ${rpmVideos} video${rpmVideos > 1 ? "s" : ""}`
              : fr
                ? "Les vues de tes vidéos RPM publiées s’affichent ici."
                : "Views from published RPM videos show up here."}
          </p>
          <button type="button" onClick={() => onNavigate("content")} style={button}>
            {fr ? "Voir les vidéos" : "View videos"}
          </button>
        </article>
        <article style={card}>
          <p style={kicker}>Gifting</p>
          <strong style={figure}>{shippedCount}</strong>
          <span>{fr ? "colis en route" : "parcels on the way"}</span>
          <p style={note}>
            {missions.length === 0
              ? fr
                ? "Pas encore de mission gifting."
                : "No gift mission yet."
              : `${missions.length} mission${missions.length > 1 ? "s" : ""}`}
          </p>
          <button type="button" onClick={() => onNavigate("gifting")} style={button}>
            {fr ? "Ouvrir le gifting" : "Open gifting"}
          </button>
        </article>
      </section>

      <section style={card}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>{fr ? "Colis et vidéos à rendre" : "Parcels and videos due"}</h2>
        {missions.length === 0 && (
          <p style={note}>
            {fr
              ? "Quand une marque t’invite, le suivi du colis et la date de rendu de la vidéo s’affichent ici."
              : "When a brand invites you, the parcel status and the video due date show up here."}
          </p>
        )}
        {missions.map((mission) => {
          const campaign = campaigns.find((item) => item.id === mission.campaign_id);
          const video = videos.find((item) => item.mission_id === mission.id);
          const videoCount = campaign?.video_count ?? 1;
          return (
            <article key={mission.id} style={{ padding: "12px 0", borderTop: "1px solid var(--ws-border)" }}>
              <strong>{campaign?.name || "Mission"}</strong>
              <p style={note}>{campaign?.product}</p>
              <p style={{ margin: "6px 0" }}>{PARCEL[lang][mission.status] || mission.status}</p>
              {mission.status === "shipped" && (
                <p style={note}>
                  {mission.carrier || (fr ? "Transporteur" : "Carrier")} ·{" "}
                  {mission.tracking_number || (fr ? "suivi en attente" : "tracking pending")}
                </p>
              )}
              <p style={note}>
                {videoCount} {fr ? "vidéo" : "video"}
                {videoCount > 1 ? "s" : ""}
                {campaign?.deadline
                  ? fr
                    ? ` à rendre le ${day(campaign.deadline)}`
                    : ` due ${day(campaign.deadline)}`
                  : ""}
                {video
                  ? ` · ${video.name} (${fr ? VIDEO_STATUS_FR[video.status] || video.status : video.status})`
                  : fr
                    ? ` · pas encore envoyée${videoCount > 1 ? "s" : ""}`
                    : " · not submitted yet"}
              </p>
            </article>
          );
        })}
      </section>

      {stats?.sales && stats.sales.length > 0 && (
        <section style={card}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>{fr ? "Ventes récentes" : "Recent sales"}</h2>
          {stats.sales.slice(0, 5).map((sale) => (
            <p key={sale.id} style={{ ...note, display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>{sale.brandName || sale.discountCode || (fr ? "Vente" : "Sale")}</span>
              <span>
                {money(sale.orderAmount)} · commission {money(sale.commissionAmount)}
              </span>
            </p>
          ))}
        </section>
      )}

      <section style={card}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>{fr ? "Paiement" : "Payout"}</h2>
        <p style={note}>
          {fr
            ? "PayPal, Revolut ou IBAN. C’est ce que la marque utilise pour te payer."
            : "PayPal, Revolut, or IBAN. This is what the brand uses to pay you."}
        </p>
        <CreatorPaymentInfo userId={userId} isMobile={isMobile} />
        <button type="button" onClick={() => onNavigate("payouts")} style={button}>
          {fr ? "Voir les paiements" : "View payouts"}
        </button>
      </section>
    </div>
  );
}

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};
const card: CSSProperties = {
  background: "var(--ws-surface)",
  border: "1px solid var(--ws-border)",
  borderRadius: 16,
  padding: 18,
};
const kicker: CSSProperties = {
  margin: 0,
  fontSize: 12,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--ws-text-muted)",
};
const figure: CSSProperties = { display: "block", fontSize: 36, letterSpacing: "-0.04em", margin: "8px 0 0" };
const note: CSSProperties = { margin: "8px 0", color: "var(--ws-text-muted)", fontSize: 14 };
const button: CSSProperties = {
  border: "1px solid var(--ws-border)",
  background: "transparent",
  color: "inherit",
  borderRadius: 999,
  padding: "8px 12px",
  cursor: "pointer",
  font: "inherit",
};
