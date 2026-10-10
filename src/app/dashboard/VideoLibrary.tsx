"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LibraryVideo, VideoLibraryResult } from "@/lib/creator-intel-types";
import { PlatformLogo } from "@/components/PlatformLogo";
import { CreatorAvatar } from "./CreatorAvatar";
import { useLang, type Lang } from "@/lib/useLang";
import { videoFiltersToParams } from "@/lib/catalog-filter-params";
import { createFetchCache } from "@/lib/client-fetch-cache";
import { CoverImage } from "./CoverImage";
import "./video-library.css";
import { UpgradeNudge } from "@/components/PlanLock";

// Creators > Videos: every tracked video, like an ad library. Filters come from
// the catalog bar; this component fetches /api/videos and renders the cards.

export type VideoFilters = {
  niche: string;
  country: string;
  language: string;
  minViews: string;
  postedWithin: string;
  /** YYYY-MM-DD, custom published-date range (inclusive). */
  postedFrom: string;
  postedTo: string;
  /** video | short | long | photo | carousel */
  mediaType: string;
  duration: string;
  hasProduct: boolean;
  viral: boolean;
  sort: string;
};

export const EMPTY_VIDEO_FILTERS: VideoFilters = {
  niche: "",
  country: "",
  language: "",
  minViews: "",
  postedWithin: "",
  postedFrom: "",
  postedTo: "",
  mediaType: "",
  duration: "",
  hasProduct: false,
  viral: false,
  sort: "views",
};

/** First page small so the grid paints fast; the next pages load on scroll. */
const FIRST_PAGE = 24;
const NEXT_PAGE = 24;

// Results per filter set (first page plus what was loaded on scroll), so going
// back to a filter or reopening the tab paints at once.
const libraryCache = createFetchCache<VideoLibraryResult>({ ttlMs: 2 * 60_000, max: 30 });

async function fetchLibrary(query: string): Promise<VideoLibraryResult> {
  const r = await fetch(`/api/videos?${query}`);
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as VideoLibraryResult;
}

/** The nearest scrolling ancestor (the catalog pane), for the infinite-scroll observer. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === "auto" || o === "scroll") return p;
  }
  return null;
}

/** "shop.example.com" from a product link, for the card. */
function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function fmt(n: number | null | undefined, lang: Lang = "en"): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (lang === "fr") {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(".", ",")} M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace(".", ",")} k`;
    return String(Math.round(n));
  }
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

function posted(iso: string | null, lang: Lang = "en"): { ago: string; date: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
  if (lang === "fr") {
    return { ago: days === 0 ? "aujourd'hui" : `${days} j`, date: d.toLocaleDateString("fr-FR", { month: "short", day: "numeric" }) };
  }
  return { ago: days === 0 ? "today" : `${days}d`, date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
}

const I = ({ d }: { d: string }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

function VideoCard({ v, index, onOpenCreator }: { v: LibraryVideo; index: number; onOpenCreator: (username: string) => void }) {
  const lang = useLang();
  const fr = lang === "fr";
  const [more, setMore] = useState(false);
  const p = posted(v.postedAt, lang);
  return (
    <article className="vl-card" style={{ ["--i" as string]: index % 24 }}>
      <header className="vl-card__head">
        <button type="button" className="vl-card__who" onClick={() => onOpenCreator(v.username)}>
          <CreatorAvatar username={v.username} src={v.avatarUrl} displayName={v.displayName} size={32} />
          <span>
            <strong>{v.displayName}</strong>
            <small>
              <PlatformLogo platform={v.platform} size={11} /> {fmt(v.followers, lang)} {fr ? (v.followers != null && v.followers < 2 ? "abonné" : "abonnés") : "followers"}
            </small>
          </span>
        </button>
        {p ? (
          <span className="vl-card__when" title={p.date}>
            <b>{p.ago}</b>
            <small>{p.date}</small>
          </span>
        ) : null}
      </header>
      {v.caption ? (
        <p className={`vl-card__caption${more ? " is-open" : ""}`}>
          {v.caption}
          {v.caption.length > 120 ? (
            <button type="button" onClick={() => setMore((x) => !x)}>
              {more ? (fr ? "Voir moins" : "See less") : fr ? "Voir plus" : "See more"}
            </button>
          ) : null}
        </p>
      ) : null}
      <a className="vl-card__media" href={v.shareUrl || undefined} target="_blank" rel="noreferrer">
        <CoverImage src={v.cover} fallback={v.coverFallback} width={270} height={420} priority={index < 4} />
        <span className="vl-card__play" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z" /></svg>
        </span>
        <span className="vl-card__views">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4v16l13-8z" /></svg>
          {fmt(v.views, lang)}
        </span>
        {v.viewsGained7d ? <span className="vl-card__gain">+{fmt(v.viewsGained7d, lang)} {fr ? "cette semaine" : "this week"}</span> : null}
        {v.isViral ? (
          <span className="vl-card__viral" title={fr ? "Au moins 5x les vues habituelles du créateur" : "At least 5x the creator's usual views"}>
            {fr ? "Virale" : "Viral"}
          </span>
        ) : null}
        {v.mediaType === "carousel" ? (
          <span className="vl-card__type">{fr ? "Carrousel" : "Carousel"}</span>
        ) : v.mediaType !== "video" ? (
          <span className="vl-card__type">Photo</span>
        ) : v.durationSeconds ? (
          <span className="vl-card__type">{v.durationSeconds >= 60 ? `${Math.floor(v.durationSeconds / 60)}:${String(v.durationSeconds % 60).padStart(2, "0")}` : `${v.durationSeconds}s`}</span>
        ) : null}
      </a>
      <div className="vl-card__stats">
        <span><I d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" />{fmt(v.likes, lang)}</span>
        <span><I d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />{fmt(v.comments, lang)}</span>
        <span><I d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />{fmt(v.shares, lang)}</span>
        {v.hasProductLink && !v.productUrl ? <span className="vl-card__shop"><I d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" />{fr ? "Produit" : "Product"}</span> : null}
      </div>
      {v.productUrl ? (
        <a className="vl-card__product" href={v.productUrl} target="_blank" rel="noreferrer nofollow" title={v.productUrl}>
          <I d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" />
          <span>{fr ? "Lien produit" : "Product link"}</span>
          <small>{linkHost(v.productUrl)}</small>
          <I d="M7 17L17 7M9 7h8v8" />
        </a>
      ) : null}
      {v.hashtags.length ? (
        <div className="vl-card__tags">
          {v.hashtags.slice(0, 4).map((t) => (
            <span key={t}>#{t}</span>
          ))}
        </div>
      ) : null}
      <footer className="vl-card__foot">
        <button type="button" onClick={() => onOpenCreator(v.username)}>{fr ? "Voir le créateur" : "See creator"}</button>
        <a href={v.shareUrl || undefined} target="_blank" rel="noreferrer">
          {fr ? "Ouvrir la vidéo" : "Open video"} <I d="M7 17L17 7M9 7h8v8" />
        </a>
      </footer>
    </article>
  );
}

export function VideoLibrary({
  filters,
  search,
  platform,
  onCount,
  onOpenCreator,
}: {
  filters: VideoFilters;
  search: string;
  platform: string;
  onCount?: (n: number, loading: boolean) => void;
  onOpenCreator: (username: string) => void;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  const [videos, setVideos] = useState<LibraryVideo[]>([]);
  const [source, setSource] = useState<VideoLibraryResult["source"]>("tracked");
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [needsTracking, setNeedsTracking] = useState(false);
  const [teaserLocked, setTeaserLocked] = useState(false);
  const gen = useRef(0);
  const firstLoad = useRef(true);
  const moreBusy = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const params = useCallback(
    (offset: number, limit: number, snapshot = false) => {
      const query = videoFiltersToParams(filters, search, platform, offset, limit);
      return snapshot ? `${query}&source=snapshot` : query;
    },
    [filters, search, platform],
  );
  const cacheKey = params(0, FIRST_PAGE);

  useEffect(() => {
    const my = ++gen.current;
    const show = (d: VideoLibraryResult) => {
      setVideos(d.videos);
      setHasMore(d.hasMore);
      setSource(d.source);
      setNeedsTracking(Boolean(d.needsTracking));
      setTeaserLocked(Boolean(d.teaserLocked));
      setLoading(false);
    };
    setError(false);
    const cached = libraryCache.get(cacheKey);
    if (cached) {
      firstLoad.current = false;
      show(cached);
      return;
    }
    setLoading(true);
    const run = () => {
      libraryCache
        .load(cacheKey, () => fetchLibrary(cacheKey))
        .then((d) => my === gen.current && show(d))
        .catch(() => {
          if (my !== gen.current) return;
          setError(true);
          setLoading(false);
        });
    };
    // The first load goes at once; later filter changes (typing) wait a moment.
    if (firstLoad.current) {
      firstLoad.current = false;
      run();
      return;
    }
    const t = window.setTimeout(run, 250);
    return () => window.clearTimeout(t);
  }, [cacheKey]);

  useEffect(() => {
    onCount?.(videos.length, loading);
  }, [videos.length, loading, onCount]);

  const loadMore = useCallback(async () => {
    if (moreBusy.current || !hasMore) return;
    moreBusy.current = true;
    setLoadingMore(true);
    const my = gen.current;
    try {
      const d = await fetchLibrary(params(videos.length, NEXT_PAGE, source === "snapshot"));
      if (my !== gen.current) return;
      const seen = new Set(videos.map((x) => `${x.platform}-${x.id}`));
      const merged = [...videos, ...d.videos.filter((v) => !seen.has(`${v.platform}-${v.id}`))];
      setVideos(merged);
      setHasMore(d.hasMore && d.videos.length > 0);
      const cached = libraryCache.get(cacheKey);
      if (cached) libraryCache.set(cacheKey, { ...cached, videos: merged, hasMore: d.hasMore && d.videos.length > 0 });
    } catch {
      /* the button stays; the next scroll retries */
    } finally {
      moreBusy.current = false;
      if (my === gen.current) setLoadingMore(false);
    }
  }, [cacheKey, hasMore, params, source, videos]);

  // Infinite scroll: the next page starts loading well before the end of the grid.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void loadMore(), {
      root: scrollParent(el),
      rootMargin: "0px 0px 900px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore, videos.length]);

  if (loading && !videos.length) {
    return (
      <div className="vl-grid" aria-hidden>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="vl-card is-ghost" style={{ ["--i" as string]: i }}>
            <span className="vl-ghost vl-ghost--head" />
            <span className="vl-ghost vl-ghost--line" />
            <span className="vl-ghost vl-ghost--media" />
          </div>
        ))}
      </div>
    );
  }
  if (error) return <p className="vl-empty">{fr ? "La bibliothèque de vidéos ne répond pas. Réessayez dans un instant." : "The video library is not responding. Try again in a moment."}</p>;
  if (!videos.length) {
    return (
      <p className="vl-empty">
        {needsTracking
          ? fr
            ? "Aucune vidéo suivie ne correspond encore. Le format, la durée et le lien produit ne sont connus que pour les vidéos suivies, et de nouvelles vidéos sont ajoutées chaque jour."
            : "No tracked video matches yet. Format, length and product links are only known for tracked videos, and new videos are added every day."
          : fr
            ? "Aucune vidéo ne correspond encore à ces filtres."
            : "No video matches these filters yet."}
      </p>
    );
  }

  return (
    <>
      {source === "snapshot" ? (
        <p className="vl-note">
          {fr
            ? "Affichage des meilleures vidéos de chaque créateur. Légendes, dates et croissance hebdomadaire se complètent à mesure que les créateurs sont suivis."
            : "Showing each creator's top videos. Captions, dates and weekly growth fill in as creators get tracked."}
        </p>
      ) : null}
      <div className="vl-grid">
        {videos.map((v, i) => (
          <VideoCard key={`${v.platform}-${v.id}`} v={v} index={i} onOpenCreator={onOpenCreator} />
        ))}
      </div>
      {hasMore ? (
        <>
          <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />
          <button type="button" className="vl-more" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? (fr ? "Chargement…" : "Loading…") : fr ? "Charger plus de vidéos" : "Load more videos"}
          </button>
        </>
      ) : null}
      {teaserLocked ? (
        <div style={{ maxWidth: 560, margin: "20px auto 0" }}>
          <UpgradeNudge
            lang={lang}
            feature="discovery"
            title={fr ? "Plus de vidéos avec Growth" : "More videos with Growth"}
            body={fr ? "Le plan Gratuit affiche les premières vidéos de chaque recherche. Growth débloque toute la bibliothèque." : "Free shows the first videos of each search. Growth unlocks the whole library."}
          />
        </div>
      ) : null}
    </>
  );
}
