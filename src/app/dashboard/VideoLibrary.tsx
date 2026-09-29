"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LibraryVideo, VideoLibraryResult } from "@/lib/creator-intel-types";
import { PlatformLogo } from "@/components/PlatformLogo";
import { CreatorAvatar } from "./CreatorAvatar";
import "./video-library.css";

// Creators > Videos: every tracked video, like an ad library. Filters come from
// the catalog bar; this component fetches /api/videos and renders the cards.

export type VideoFilters = {
  niche: string;
  country: string;
  language: string;
  minViews: string;
  postedWithin: string;
  mediaType: string;
  duration: string;
  hasProduct: boolean;
  sort: string;
};

export const EMPTY_VIDEO_FILTERS: VideoFilters = {
  niche: "",
  country: "",
  language: "",
  minViews: "",
  postedWithin: "",
  mediaType: "",
  duration: "",
  hasProduct: false,
  sort: "views",
};

const MIN_VIEWS: Record<string, number> = { "10k": 10_000, "100k": 100_000, "500k": 500_000, "1m": 1_000_000, "10m": 10_000_000 };

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

function posted(iso: string | null): { ago: string; date: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
  return { ago: days === 0 ? "today" : `${days}d`, date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
}

const I = ({ d }: { d: string }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

function VideoCard({ v, index, onOpenCreator }: { v: LibraryVideo; index: number; onOpenCreator: (username: string) => void }) {
  const [more, setMore] = useState(false);
  const p = posted(v.postedAt);
  return (
    <article className="vl-card" style={{ ["--i" as string]: index % 24 }}>
      <header className="vl-card__head">
        <button type="button" className="vl-card__who" onClick={() => onOpenCreator(v.username)}>
          <CreatorAvatar username={v.username} src={v.avatarUrl} displayName={v.displayName} size={32} />
          <span>
            <strong>{v.displayName}</strong>
            <small>
              <PlatformLogo platform={v.platform} size={11} /> {fmt(v.followers)} followers
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
              {more ? "See less" : "See more"}
            </button>
          ) : null}
        </p>
      ) : null}
      <a className="vl-card__media" href={v.shareUrl || undefined} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {v.cover ? <img src={v.cover} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : null}
        <span className="vl-card__play" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z" /></svg>
        </span>
        <span className="vl-card__views">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4v16l13-8z" /></svg>
          {fmt(v.views)}
        </span>
        {v.viewsGained7d ? <span className="vl-card__gain">+{fmt(v.viewsGained7d)} this week</span> : null}
        {v.mediaType !== "video" ? <span className="vl-card__type">Photo</span> : v.durationSeconds ? <span className="vl-card__type">{v.durationSeconds}s</span> : null}
      </a>
      <div className="vl-card__stats">
        <span><I d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" />{fmt(v.likes)}</span>
        <span><I d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />{fmt(v.comments)}</span>
        <span><I d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />{fmt(v.shares)}</span>
        {v.hasProductLink ? <span className="vl-card__shop"><I d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" />Product</span> : null}
      </div>
      {v.hashtags.length ? (
        <div className="vl-card__tags">
          {v.hashtags.slice(0, 4).map((t) => (
            <span key={t}>#{t}</span>
          ))}
        </div>
      ) : null}
      <footer className="vl-card__foot">
        <button type="button" onClick={() => onOpenCreator(v.username)}>See creator</button>
        <a href={v.shareUrl || undefined} target="_blank" rel="noreferrer">
          Open video <I d="M7 17L17 7M9 7h8v8" />
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
  const [videos, setVideos] = useState<LibraryVideo[]>([]);
  const [source, setSource] = useState<VideoLibraryResult["source"]>("tracked");
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);
  const gen = useRef(0);

  const params = useCallback(
    (offset: number) => {
      const p = new URLSearchParams({ sort: filters.sort || "views", offset: String(offset), limit: "48" });
      if (platform) p.set("platform", platform);
      if (search.trim().length >= 2) p.set("q", search.trim());
      if (filters.niche) p.set("niche", filters.niche);
      if (filters.country) p.set("country", filters.country);
      if (filters.language) p.set("language", filters.language);
      if (MIN_VIEWS[filters.minViews]) p.set("minViews", String(MIN_VIEWS[filters.minViews]));
      if (filters.postedWithin) p.set("postedWithin", filters.postedWithin);
      if (filters.mediaType) p.set("mediaType", filters.mediaType);
      if (filters.duration) p.set("duration", filters.duration);
      if (filters.hasProduct) p.set("hasProduct", "1");
      return p.toString();
    },
    [filters, search, platform],
  );

  useEffect(() => {
    const my = ++gen.current;
    setLoading(true);
    setError(false);
    const t = window.setTimeout(() => {
      fetch(`/api/videos?${params(0)}`)
        .then((r) => (r.ok ? (r.json() as Promise<VideoLibraryResult>) : Promise.reject(new Error(String(r.status)))))
        .then((d) => {
          if (my !== gen.current) return;
          setVideos(d.videos);
          setHasMore(d.hasMore);
          setSource(d.source);
        })
        .catch(() => my === gen.current && setError(true))
        .finally(() => my === gen.current && setLoading(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [params]);

  useEffect(() => {
    onCount?.(videos.length, loading);
  }, [videos.length, loading, onCount]);

  const loadMore = async () => {
    const my = gen.current;
    const r = await fetch(`/api/videos?${params(videos.length)}`);
    if (!r.ok || my !== gen.current) return;
    const d = (await r.json()) as VideoLibraryResult;
    setVideos((prev) => [...prev, ...d.videos.filter((v) => !prev.some((x) => x.id === v.id))]);
    setHasMore(d.hasMore);
  };

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
  if (error) return <p className="vl-empty">The video library is not responding. Try again in a moment.</p>;
  if (!videos.length) return <p className="vl-empty">No video matches these filters yet.</p>;

  return (
    <>
      {source === "snapshot" ? (
        <p className="vl-note">Showing each creator&apos;s top videos. Captions, dates and weekly growth fill in as creators get tracked.</p>
      ) : null}
      <div className="vl-grid">
        {videos.map((v, i) => (
          <VideoCard key={`${v.platform}-${v.id}`} v={v} index={i} onOpenCreator={onOpenCreator} />
        ))}
      </div>
      {hasMore ? (
        <button type="button" className="vl-more" onClick={() => void loadMore()}>
          Load more videos
        </button>
      ) : null}
    </>
  );
}
