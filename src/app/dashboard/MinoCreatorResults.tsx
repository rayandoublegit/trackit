"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { FeedCreator } from "@/lib/discovery-feed";
import { listFolders, listSaved, type FolderItem, type FolderRow } from "@/lib/workspace-client";
import { extractVideoId, tiktokVideoWatchUrl } from "@/lib/creator-video";
import { MinoCompanion } from "@/components/MinoCompanion";
import { PlatformLogo, platformKey, platformProfileUrl, PLATFORM_LABEL } from "@/components/PlatformLogo";
import { useLang } from "@/lib/useLang";
import { CreatorAvatar } from "./CreatorAvatar";
import { SaveCreatorDropdown } from "./SaveCreatorDropdown";
import { InAppVideoPlayer } from "./TikTokEmbedPlayer";
import { CountUp } from "./sample-motion";
import "./mino-search.css";

// Mino's creator search, in two parts: the motion shown while it searches,
// then the creators as profiles (photo, numbers, videos that play in the app,
// save / contact / open) that drop in one by one.

function compact(n: number, fr = false): string {
  if (!n) return "—";
  const dec = (s: string) => (fr ? s.replace(".", ",") : s);
  if (n >= 1_000_000) return `${dec((n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1))}M`;
  if (n >= 1_000) return `${dec((n / 1_000).toFixed(n >= 100_000 ? 0 : 1))}K`;
  return String(Math.round(n));
}

function percent(n: number, fr: boolean): string {
  if (!n) return "—";
  return fr ? `${n.toFixed(1).replace(".", ",")} %` : `${n.toFixed(1)}%`;
}

const SEARCH_STEPS = [
  "Reading your brief",
  "Scanning the creator catalog",
  "Checking engagement and views",
  "Ranking the best matches",
];

const SEARCH_STEPS_FR = [
  "Lecture de votre brief",
  "Parcours du catalogue de créateurs",
  "Vérification de l’engagement et des vues",
  "Classement des meilleurs profils",
];

export function MinoSearchMotion({ label }: { label: string }) {
  const fr = useLang() === "fr";
  const steps = fr ? SEARCH_STEPS_FR : SEARCH_STEPS;
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => Math.min(s + 1, SEARCH_STEPS.length - 1)), 1100);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="mino-search" role="status" aria-live="polite">
      <div className="mino-search__head">
        <span className="mino-search__orb" aria-hidden>
          <MinoCompanion size={30} />
        </span>
        <div className="mino-search__title">
          <strong>{fr ? "Recherche de créateurs" : "Searching creators"}</strong>
          <span>{label}</span>
        </div>
      </div>
      <div className="mino-search__platforms">
        {(["tiktok", "instagram", "youtube"] as const).map((p, i) => (
          <div key={p} className="mino-search__lane" style={{ ["--i" as string]: i }}>
            <PlatformLogo platform={p} size={18} />
            <span className="mino-search__lane-name">{PLATFORM_LABEL[p]}</span>
            <span className="mino-search__bar" aria-hidden>
              <span />
            </span>
          </div>
        ))}
      </div>
      <ol className="mino-search__steps">
        {steps.map((s, i) => (
          <li key={s} className={i < step ? "is-done" : i === step ? "is-on" : ""}>
            <span className="mino-search__tick" aria-hidden />
            {s}
          </li>
        ))}
      </ol>
      <div className="mino-search__ghosts" aria-hidden>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mino-search__ghost" style={{ ["--i" as string]: i }}>
            <span className="mino-search__ghost-face" />
            <span className="mino-search__ghost-line" />
            <span className="mino-search__ghost-line is-short" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CreatorPhoto({ creator, size }: { creator: FeedCreator; size: number }) {
  const [failed, setFailed] = useState(false);
  if (platformKey(creator.platform) === "instagram") {
    if (!creator.avatarUrl || failed) {
      return <CreatorAvatar username={creator.username} displayName={creator.displayName} size={size} src="" />;
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="mino-card__photo"
        src={creator.avatarUrl}
        alt={creator.displayName || creator.username}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return <CreatorAvatar src={creator.avatarUrl} username={creator.username} displayName={creator.displayName} size={size} />;
}

type PlayableVideo = {
  key: string;
  cover: string;
  views: number;
  videoId?: string;
  shareUrl?: string;
  streamUrl?: string;
};

/** Up to 3 videos per creator: top videos from the catalog, else the thumbnails a live search returned. */
export function creatorVideos(c: FeedCreator): PlayableVideo[] {
  const top = (c.topVideos ?? [])
    .filter((v) => v.cover)
    .slice(0, 3)
    .map((v, i) => ({
      key: v.id || v.shareUrl || String(i),
      cover: v.cover,
      views: Number(v.playCount) || 0,
      videoId: extractVideoId(v.id) || extractVideoId(v.shareUrl) || undefined,
      shareUrl: v.shareUrl || undefined,
      streamUrl: v.playUrl || undefined,
    }));
  if (top.length) return top;
  return (c.videoThumbnails ?? [])
    .filter((t) => t.thumbnail)
    .slice(0, 3)
    .map((t, i) => ({
      key: t.url || String(i),
      cover: t.thumbnail || "",
      views: Number(t.views) || 0,
      videoId: extractVideoId(t.url) || undefined,
      shareUrl: t.url || undefined,
    }));
}

function PlayGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" />
    </svg>
  );
}

function VideoTile({ video, index, fr, onPlay }: { video: PlayableVideo; index: number; fr: boolean; onPlay: () => void }) {
  const [broken, setBroken] = useState(false);
  return (
    <button
      type="button"
      className="mino-profile__video"
      style={{ ["--v" as string]: index }}
      onClick={onPlay}
      aria-label={fr ? `Lire la vidéo ${index + 1}` : `Play video ${index + 1}`}
    >
      {!broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={video.cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : null}
      <span className="mino-profile__play" aria-hidden>
        <PlayGlyph />
      </span>
      {video.views ? (
        <span className="mino-profile__views">
          <PlayGlyph />
          {compact(video.views, fr)}
        </span>
      ) : null}
    </button>
  );
}

function VerifiedMark({ fr }: { fr: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-label={fr ? "Vérifié" : "Verified"}>
      <path fill="#0047ff" d="M12 2l2.4 2.1 3.2-.3.9 3.1 2.8 1.6-1 3 1 3-2.8 1.6-.9 3.1-3.2-.3L12 22l-2.4-2.1-3.2.3-.9-3.1-2.8-1.6 1-3-1-3 2.8-1.6.9-3.1 3.2.3z" />
      <path d="M8.5 12.2l2.3 2.3 4.7-4.8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Workspace = {
  saved: Set<string>;
  folders: FolderRow[];
  items: FolderItem[];
};

type ProfileActions = {
  onOpenProfile?: (creator: FeedCreator) => void;
  onContact?: (creator: FeedCreator) => void;
  isPaid?: boolean;
  onUpgrade?: () => void;
};

function ProfileCard({
  creator,
  index,
  workspace,
  onWorkspaceChange,
  onPlay,
  actions,
}: {
  creator: FeedCreator;
  index: number;
  workspace: Workspace;
  onWorkspaceChange: () => void;
  onPlay: (videoIndex: number) => void;
  actions: ProfileActions;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  const p = platformKey(creator.platform);
  const verified = creator.authenticityScore >= 60;
  const videos = creatorVideos(creator);
  const handle = creator.username.toLowerCase();
  const inFolders = useMemo(
    () => new Set(workspace.items.filter((i) => i.creator_username.toLowerCase() === handle).map((i) => i.folder_id)),
    [workspace.items, handle],
  );
  const delay = index * 80;

  return (
    <article className="mino-profile" style={{ ["--i" as string]: index }}>
      <header className="mino-profile__head">
        <span className="mino-card__face">
          <CreatorPhoto creator={creator} size={52} />
          <span className="mino-card__platform">
            <PlatformLogo platform={p} size={16} />
          </span>
        </span>
        <div className="mino-card__who">
          <strong>
            <span className="mino-profile__name">{creator.displayName || creator.username}</span>
            {verified ? <VerifiedMark fr={fr} /> : null}
          </strong>
          <span>
            @{creator.username} · {PLATFORM_LABEL[p]}
          </span>
        </div>
        <a
          className="mino-profile__ext"
          href={platformProfileUrl(creator.platform, creator.username)}
          target="_blank"
          rel="noreferrer"
          aria-label={fr ? `Voir sur ${PLATFORM_LABEL[p]}` : `View on ${PLATFORM_LABEL[p]}`}
          title={fr ? `Voir sur ${PLATFORM_LABEL[p]}` : `View on ${PLATFORM_LABEL[p]}`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M7 17L17 7M9 7h8v8" />
          </svg>
        </a>
      </header>

      <div className="mino-card__tags">
        {creator.primaryNiche ? <span className="mino-card__tag">{creator.primaryNiche}</span> : null}
        {creator.countryCode ? <span className="mino-card__tag is-geo">{creator.countryCode}</span> : null}
        {creator.email ? (
          <span className="mino-card__tag is-mail">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 7l9 6 9-6" />
            </svg>
            {fr ? "E-mail" : "Email"}
          </span>
        ) : null}
      </div>

      <dl className="mino-card__stats">
        <div>
          <dt>{fr ? "Abonnés" : "Followers"}</dt>
          <dd>{creator.followersCount ? <CountUp value={creator.followersCount} format={(n) => compact(n, fr)} delayMs={delay} /> : "—"}</dd>
        </div>
        <div>
          <dt>{fr ? "Vues moy." : "Avg views"}</dt>
          <dd>{creator.avgViews ? <CountUp value={creator.avgViews} format={(n) => compact(n, fr)} delayMs={delay + 60} /> : "—"}</dd>
        </div>
        <div>
          <dt>Engagement</dt>
          <dd className={creator.engagementRate >= 6 ? "is-hot" : ""}>
            {creator.engagementRate ? (
              <CountUp value={creator.engagementRate} format={(n) => percent(n, fr)} delayMs={delay + 120} />
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>

      {videos.length ? (
        <div className="mino-profile__videos">
          {videos.map((v, i) => (
            <VideoTile key={v.key} video={v} index={i} fr={fr} onPlay={() => onPlay(i)} />
          ))}
        </div>
      ) : (
        <div className="mino-profile__novideo">
          {fr ? "Vidéos pas encore analysées pour ce profil." : "Videos not analysed yet for this profile."}
        </div>
      )}

      <div className="mino-profile__actions">
        <SaveCreatorDropdown
          lang={lang}
          creator={creator}
          saved={workspace.saved.has(handle)}
          inFolders={inFolders}
          folders={workspace.folders}
          isPaid={Boolean(actions.isPaid)}
          onUpgrade={actions.onUpgrade}
          onWorkspaceChange={onWorkspaceChange}
        />
        {actions.onContact ? (
          <button type="button" className="mino-profile__btn" onClick={() => actions.onContact?.(creator)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            {fr ? "Contacter" : "Contact"}
          </button>
        ) : null}
        {actions.onOpenProfile ? (
          <button type="button" className="mino-profile__btn is-primary" onClick={() => actions.onOpenProfile?.(creator)}>
            {fr ? "Profil" : "Profile"}
            <span aria-hidden>→</span>
          </button>
        ) : null}
      </div>
    </article>
  );
}

function VideoModal({
  creator,
  start,
  onClose,
  actions,
}: {
  creator: FeedCreator;
  start: number;
  onClose: () => void;
  actions: ProfileActions;
}) {
  const fr = useLang() === "fr";
  const videos = creatorVideos(creator);
  const [i, setI] = useState(start);
  const v = videos[i];
  const p = platformKey(creator.platform);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((x) => Math.min(videos.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, videos.length]);

  if (!v || typeof document === "undefined") return null;
  const watchUrl =
    p === "tiktok"
      ? tiktokVideoWatchUrl({ id: v.videoId, shareUrl: v.shareUrl, username: creator.username })
      : v.shareUrl || platformProfileUrl(creator.platform, creator.username);

  return createPortal(
    <div className="mino-player" role="dialog" aria-modal aria-label={creator.displayName || creator.username} onClick={onClose}>
      <div className="mino-player__panel" onClick={(e) => e.stopPropagation()}>
        <div className="mino-player__head">
          <span className="mino-card__face">
            <CreatorPhoto creator={creator} size={36} />
          </span>
          <div className="mino-card__who">
            <strong>{creator.displayName || creator.username}</strong>
            <span>
              @{creator.username}
              {v.views ? ` · ${compact(v.views, fr)} ${fr ? "vues" : "views"}` : ""}
            </span>
          </div>
          <button type="button" className="mino-player__close" onClick={onClose} aria-label={fr ? "Fermer" : "Close"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div
          className="mino-player__stage"
          style={v.cover ? { backgroundImage: `linear-gradient(rgba(0,0,0,.5), rgba(0,0,0,.5)), url("${v.cover}")` } : undefined}
        >
          <InAppVideoPlayer
            key={v.key}
            videoId={v.videoId}
            shareUrl={v.shareUrl}
            // CDN links expire: a TikTok id is resolved fresh, the stored link is the fallback.
            streamUrl={v.videoId && p === "tiktok" ? undefined : v.streamUrl}
            username={creator.username}
            poster={v.cover}
            title={creator.displayName || creator.username}
            autoPlay
            // The cover shows through while the video loads (or if it cannot play).
            style={{ background: "transparent", color: "#fff" }}
          />
          {videos.length > 1 ? (
            <>
              <button
                type="button"
                className="mino-player__nav is-prev"
                disabled={i === 0}
                onClick={() => setI((x) => Math.max(0, x - 1))}
                aria-label={fr ? "Vidéo précédente" : "Previous video"}
              >
                ‹
              </button>
              <button
                type="button"
                className="mino-player__nav is-next"
                disabled={i === videos.length - 1}
                onClick={() => setI((x) => Math.min(videos.length - 1, x + 1))}
                aria-label={fr ? "Vidéo suivante" : "Next video"}
              >
                ›
              </button>
            </>
          ) : null}
        </div>
        <div className="mino-player__foot">
          {actions.onContact ? (
            <button
              type="button"
              className="mino-profile__btn"
              onClick={() => {
                onClose();
                actions.onContact?.(creator);
              }}
            >
              {fr ? "Contacter" : "Contact"}
            </button>
          ) : null}
          {watchUrl ? (
            <a className="mino-profile__btn" href={watchUrl} target="_blank" rel="noreferrer">
              <PlatformLogo platform={p} size={14} />
              {fr ? `Ouvrir sur ${PLATFORM_LABEL[p]}` : `Open on ${PLATFORM_LABEL[p]}`}
            </a>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function MinoCreatorResults({
  creators,
  label,
  sources,
  onOpenCatalog,
  onOpenProfile,
  onContact,
  isPaid,
  onUpgrade,
}: {
  creators: FeedCreator[];
  label: string;
  sources: string[];
  onOpenCatalog?: () => void;
} & ProfileActions) {
  const fr = useLang() === "fr";
  const [workspace, setWorkspace] = useState<Workspace>({ saved: new Set(), folders: [], items: [] });
  const [playing, setPlaying] = useState<{ creator: FeedCreator; index: number } | null>(null);

  const loadWorkspace = useCallback(async () => {
    const [saved, lists] = await Promise.all([listSaved(), listFolders()]);
    setWorkspace({
      saved: new Set(saved.map((r) => r.creator_username.toLowerCase())),
      folders: lists.folders,
      items: lists.items,
    });
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const summary = useMemo(() => {
    const reach = creators.reduce((s, c) => s + (Number(c.followersCount) || 0), 0);
    const rates = creators.map((c) => Number(c.engagementRate) || 0).filter((n) => n > 0);
    const engagement = rates.length ? rates.reduce((s, n) => s + n, 0) / rates.length : 0;
    const withEmail = creators.filter((c) => c.email).length;
    const videos = creators.reduce((s, c) => s + creatorVideos(c).length, 0);
    const platforms = [...new Set(creators.map((c) => platformKey(c.platform)))];
    return { reach, engagement, withEmail, videos, platforms };
  }, [creators]);

  if (!creators.length) return null;
  const live = sources.includes("live");
  const actions: ProfileActions = { onOpenProfile, onContact, isPaid, onUpgrade };

  return (
    <section className="mino-results" aria-label={fr ? `Créateurs pour ${label}` : `Creators for ${label}`}>
      <header className="mino-strip">
        <div className="mino-strip__lead">
          <span className="mino-strip__logos" aria-hidden>
            {summary.platforms.map((p) => (
              <span key={p}>
                <PlatformLogo platform={p} size={16} />
              </span>
            ))}
          </span>
          <div>
            <strong>
              {fr
                ? `${creators.length} profil${creators.length > 1 ? "s" : ""} trouvé${creators.length > 1 ? "s" : ""}`
                : `${creators.length} profile${creators.length > 1 ? "s" : ""} found`}
            </strong>
            <span>{label}</span>
          </div>
          <span className={`mino-results__source${live ? " is-live" : ""}`}>
            <i aria-hidden />
            {fr
              ? live && sources.includes("catalog")
                ? "Catalogue + recherche en direct"
                : live
                  ? "Recherche en direct"
                  : "Catalogue Trackit"
              : live && sources.includes("catalog")
                ? "Catalog + live search"
                : live
                  ? "Live search"
                  : "Trackit catalog"}
          </span>
        </div>
        <dl className="mino-strip__stats">
          <div>
            <dt>{fr ? "Audience cumulée" : "Total reach"}</dt>
            <dd>{summary.reach ? <CountUp value={summary.reach} format={(n) => compact(n, fr)} /> : "—"}</dd>
          </div>
          <div>
            <dt>{fr ? "Engagement moyen" : "Avg engagement"}</dt>
            <dd>{summary.engagement ? <CountUp value={summary.engagement} format={(n) => percent(n, fr)} delayMs={80} /> : "—"}</dd>
          </div>
          <div>
            <dt>{fr ? "Avec email" : "With email"}</dt>
            <dd>
              <CountUp value={summary.withEmail} format={(n) => String(Math.round(n))} delayMs={160} />
              <small>/{creators.length}</small>
            </dd>
          </div>
          <div>
            <dt>{fr ? "Vidéos à regarder" : "Videos to watch"}</dt>
            <dd>
              <CountUp value={summary.videos} format={(n) => String(Math.round(n))} delayMs={240} />
            </dd>
          </div>
        </dl>
      </header>

      <div className="mino-results__grid">
        {creators.map((c, i) => (
          <ProfileCard
            key={`${c.platform}-${c.username}`}
            creator={c}
            index={i}
            workspace={workspace}
            onWorkspaceChange={() => void loadWorkspace()}
            actions={actions}
            onPlay={(index) => {
              const v = creatorVideos(c)[index];
              // Instagram posts without a TikTok id cannot stream here: open the post.
              if (v && !v.videoId && !v.streamUrl && v.shareUrl) {
                window.open(v.shareUrl, "_blank", "noopener,noreferrer");
                return;
              }
              setPlaying({ creator: c, index });
            }}
          />
        ))}
      </div>

      {onOpenCatalog ? (
        <button type="button" className="mino-results__more" onClick={onOpenCatalog}>
          {fr ? "Affiner dans le catalogue" : "Refine in the catalog"}
          <span aria-hidden>→</span>
        </button>
      ) : null}

      {playing ? (
        <VideoModal creator={playing.creator} start={playing.index} onClose={() => setPlaying(null)} actions={actions} />
      ) : null}
    </section>
  );
}
