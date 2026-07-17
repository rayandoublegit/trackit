"use client";

import { useState } from "react";

export type FrYoutubeVideo = {
  id: string;
  title: string;
  channel: string;
  channelUrl: string;
  channelAvatarUrl: string;
  views: number;
  publishedAt: string;
  description: string;
  durationLabel: string;
};

const RAYAN_CHANNEL_AVATAR = "/images/rayan-channel-avatar.png";

export const FR_TRACKIT_VIDEOS: FrYoutubeVideo[] = [
  {
    id: "YQKVDIRM8EE",
    title: "Let's work EP1 : Copie cette strategie sur ton SaaS si tu veux $$$$",
    channel: "Rayan",
    channelUrl: "https://www.youtube.com/@yaanvsr",
    channelAvatarUrl: RAYAN_CHANNEL_AVATAR,
    views: 47,
    publishedAt: "2026-07-11",
    durationLabel: "8:55",
    description:
      "Voici la stratégie qu'on applique sur Trackit pour $$.\n\nIl y a plein de contenu value qui arrivent..\n\nIg : rayanmakems\nx : rayanvsr\n\nhttps://thentrack.it",
  },
  {
    id: "IuAoKMFV8hQ",
    title: "Let's Work EP2 : Cashh en e-commerce full organique grâce a cette stratégie d'AC..",
    channel: "Rayan",
    channelUrl: "https://www.youtube.com/@yaanvsr",
    channelAvatarUrl: RAYAN_CHANNEL_AVATAR,
    views: 85,
    publishedAt: "2026-07-12",
    durationLabel: "6:41",
    description:
      "Le meilleur framework E-commerce pour générer vos premieres ventes et scaler votre acquisition en organique SANS ADS.\n\nDans cette video je te dévoile toute la strategie que on utilise pour scaler des boutiques a 10k/day full organique\n\nx : rayanvsr\nig : rayanmakems\n\nOutil : thentrack.it\n\nCODE PROMO : TRACKITSEASON30 sur tout les abonnements présents sur Trackit",
  },
  {
    id: "Oax7ANeIhsY",
    title: "Let's work EP3 : Comment trouver des influs rentable en 5 minutes et $$$",
    channel: "Rayan",
    channelUrl: "https://www.youtube.com/@yaanvsr",
    channelAvatarUrl: RAYAN_CHANNEL_AVATAR,
    views: 17,
    publishedAt: "2026-07-17",
    durationLabel: "8:57",
    description:
      "Framework sur comment trouver des influenceurs rentables, trackez les ventes, payez les commissions et tout gérer grace a Trackit.\n\nTu es créateur de contenu/e-commerçant et tu veux faire partie de notre ecosystème et gagner de l'argent grâce a tes ventes, Inscris toi ici : https://thentrack.it/affiliation\n\nX : https://x.com/rayanvsr\nIG : https://www.instagram.com/rayanmakems/\n\nOutil : https://thentrack.it\n\nTRACKITSEASON30 pour 30% off sur tes tout les abonnements\n\nLet's work",
  },
];

function thumbUrl(id: string, quality: "hqdefault" | "mqdefault" | "maxresdefault" = "hqdefault") {
  return `https://i.ytimg.com/vi/${id}/${quality}.jpg`;
}

function formatViewsFr(n: number): string {
  return `${n.toLocaleString("fr-FR")} vue${n > 1 ? "s" : ""}`;
}

function formatPublishedFr(isoDate: string): string {
  const published = new Date(`${isoDate}T12:00:00`);
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - published.getTime());
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "il y a 1 jour";
  if (days < 7) return `il y a ${days} jours`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "il y a 1 semaine";
  if (weeks < 5) return `il y a ${weeks} semaines`;
  return published.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function YoutubeMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M23.5 7.2a3 3 0 0 0-2.1-2.1C19.5 4.5 12 4.5 12 4.5s-7.5 0-9.4.6A3 3 0 0 0 .5 7.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-4.8Z"
        fill="#FF0000"
      />
      <path d="M9.75 15.02V8.98L15.5 12l-5.75 3.02Z" fill="#FFFFFF" />
    </svg>
  );
}

/** Pill matching the reference: overlapping icons + label, white + soft shadow. */
export function FrVideosBubble({
  active,
  onClick,
}: {
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="3 vidéos"
      aria-pressed={active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        height: 40,
        padding: "0 14px 0 8px",
        border: "none",
        borderRadius: 999,
        background: "#FFFFFF",
        boxShadow: active
          ? "0 4px 16px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)"
          : "0 4px 14px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)",
        cursor: "pointer",
        fontFamily: "inherit",
        outline: active ? "1.5px solid #E8E8E8" : "none",
        outlineOffset: 0,
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: "#F3F3F3",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <YoutubeMark size={14} />
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#1A1A1A",
          letterSpacing: "-0.02em",
          whiteSpace: "nowrap",
          lineHeight: 1,
        }}
      >
        3 vidéos
      </span>
    </button>
  );
}

function VideoRow({
  video,
  playing,
  onPlay,
}: {
  video: FrYoutubeVideo;
  playing: boolean;
  onPlay: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const watchUrl = `https://www.youtube.com/watch?v=${video.id}`;

  return (
    <article
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        paddingBottom: 28,
        borderBottom: "1px solid #E5E5E5",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "16 / 9",
          borderRadius: 12,
          overflow: "hidden",
          background: "#0F0F0F",
        }}
      >
        {playing ? (
          <iframe
            title={video.title}
            src={`https://www.youtube.com/embed/${video.id}?autoplay=1&rel=0`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
          />
        ) : (
          <button
            type="button"
            onClick={onPlay}
            aria-label={`Lire : ${video.title}`}
            style={{
              position: "absolute",
              inset: 0,
              border: "none",
              padding: 0,
              cursor: "pointer",
              background: "#000",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbUrl(video.id, "hqdefault")}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            <span
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(transparent, rgba(0,0,0,0.25))",
              }}
            >
              <span
                style={{
                  width: 68,
                  height: 48,
                  borderRadius: 14,
                  background: "rgba(0,0,0,0.72)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <YoutubeMark size={28} />
              </span>
            </span>
            <span
              style={{
                position: "absolute",
                right: 10,
                bottom: 10,
                background: "rgba(0,0,0,0.8)",
                color: "#FFF",
                fontSize: 12,
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: 4,
                letterSpacing: "0.02em",
                fontFamily: "Roboto, Arial, sans-serif",
              }}
            >
              {video.durationLabel}
            </span>
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <a
          href={video.channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            overflow: "hidden",
            flexShrink: 0,
            display: "block",
            background: "#F2F2F2",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={video.channelAvatarUrl}
            alt={video.channel}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </a>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2
            style={{
              margin: "0 0 6px",
              fontSize: 18,
              fontWeight: 600,
              color: "#0F0F0F",
              lineHeight: 1.35,
              letterSpacing: "-0.01em",
              fontFamily: "Roboto, Arial, Helvetica, sans-serif",
            }}
          >
            <a
              href={watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "inherit", textDecoration: "none" }}
            >
              {video.title}
            </a>
          </h2>
          <div
            style={{
              fontSize: 13,
              color: "#606060",
              lineHeight: 1.45,
              fontFamily: "Roboto, Arial, Helvetica, sans-serif",
            }}
          >
            <a
              href={video.channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#606060", textDecoration: "none", fontWeight: 500 }}
            >
              {video.channel}
            </a>
            <div>
              {formatViewsFr(video.views)} · {formatPublishedFr(video.publishedAt)}
            </div>
          </div>

          <div
            style={{
              marginTop: 12,
              background: "#F2F2F2",
              borderRadius: 12,
              padding: "12px 14px",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "#0F0F0F",
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
                fontFamily: "Roboto, Arial, Helvetica, sans-serif",
                display: "-webkit-box",
                WebkitLineClamp: expanded ? "unset" : 3,
                WebkitBoxOrient: "vertical",
                overflow: expanded ? "visible" : "hidden",
              }}
            >
              {video.description}
            </p>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              style={{
                marginTop: 8,
                border: "none",
                background: "transparent",
                padding: 0,
                fontSize: 13,
                fontWeight: 600,
                color: "#0F0F0F",
                cursor: "pointer",
                fontFamily: "Roboto, Arial, Helvetica, sans-serif",
              }}
            >
              {expanded ? "Afficher moins" : "…plus"}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function FrYoutubeVideosPanel({
  onClose,
  isMobile,
}: {
  onClose: () => void;
  isMobile?: boolean;
}) {
  const [playingId, setPlayingId] = useState<string | null>(null);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        background: "#FFFFFF",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        style={{
          maxWidth: 860,
          margin: "0 auto",
          padding: isMobile ? "20px 16px 48px" : "28px 32px 64px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 28,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <YoutubeMark size={22} />
              <h1
                style={{
                  margin: 0,
                  fontSize: isMobile ? 20 : 22,
                  fontWeight: 700,
                  color: "#0F0F0F",
                  letterSpacing: "-0.03em",
                  fontFamily: "Roboto, Arial, Helvetica, sans-serif",
                }}
              >
                3 vidéos
              </h1>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "#606060", fontFamily: "Roboto, Arial, Helvetica, sans-serif" }}>
              Let&apos;s work — stratégie Trackit avec Rayan
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "none",
              background: "#F2F2F2",
              color: "#0F0F0F",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {FR_TRACKIT_VIDEOS.map((video) => (
            <VideoRow
              key={video.id}
              video={video}
              playing={playingId === video.id}
              onPlay={() => setPlayingId(video.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
