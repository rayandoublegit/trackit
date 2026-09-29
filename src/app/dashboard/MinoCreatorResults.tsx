"use client";

import { useEffect, useState } from "react";
import type { FeedCreator } from "@/lib/discovery-feed";
import { saveCreator } from "@/lib/workspace-client";
import { MinoCompanion } from "@/components/MinoCompanion";
import { PlatformLogo, platformKey, platformProfileUrl, PLATFORM_LABEL } from "@/components/PlatformLogo";
import { CreatorAvatar } from "./CreatorAvatar";
import "./mino-search.css";

// Mino's creator search, in two parts: the motion shown while it searches,
// then the creators as cards that drop in one by one.

function compact(n: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

const SEARCH_STEPS = [
  "Reading your brief",
  "Scanning the creator catalog",
  "Checking engagement and views",
  "Ranking the best matches",
];

export function MinoSearchMotion({ label }: { label: string }) {
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
          <strong>Searching creators</strong>
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
        {SEARCH_STEPS.map((s, i) => (
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
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return <CreatorAvatar src={creator.avatarUrl} username={creator.username} displayName={creator.displayName} size={size} />;
}

type SaveState = "idle" | "saving" | "saved" | "limit" | "error";

function CreatorCard({ creator, index }: { creator: FeedCreator; index: number }) {
  const [save, setSave] = useState<SaveState>("idle");
  const p = platformKey(creator.platform);
  const verified = creator.authenticityScore >= 60;

  const onSave = async () => {
    if (save === "saving" || save === "saved") return;
    setSave("saving");
    const res = await saveCreator(creator);
    if (res.ok) setSave("saved");
    else setSave(res.status === 402 || res.status === 403 ? "limit" : "error");
  };

  return (
    <article className="mino-card" style={{ ["--i" as string]: index }}>
      <div className="mino-card__top">
        <span className="mino-card__face">
          <CreatorPhoto creator={creator} size={46} />
          <span className="mino-card__platform">
            <PlatformLogo platform={p} size={16} />
          </span>
        </span>
        <div className="mino-card__who">
          <strong>
            {creator.displayName || creator.username}
            {verified ? (
              <svg width="14" height="14" viewBox="0 0 24 24" aria-label="Verified">
                <path fill="#0047ff" d="M12 2l2.4 2.1 3.2-.3.9 3.1 2.8 1.6-1 3 1 3-2.8 1.6-.9 3.1-3.2-.3L12 22l-2.4-2.1-3.2.3-.9-3.1-2.8-1.6 1-3-1-3 2.8-1.6.9-3.1 3.2.3z" />
                <path d="M8.5 12.2l2.3 2.3 4.7-4.8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
          </strong>
          <span>@{creator.username}</span>
        </div>
      </div>
      <div className="mino-card__tags">
        {creator.primaryNiche ? <span className="mino-card__tag">{creator.primaryNiche}</span> : null}
        {creator.countryCode ? <span className="mino-card__tag is-geo">{creator.countryCode}</span> : null}
        {creator.email ? (
          <span className="mino-card__tag is-mail">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 7l9 6 9-6" />
            </svg>
            Email
          </span>
        ) : null}
      </div>
      <dl className="mino-card__stats">
        <div>
          <dt>Followers</dt>
          <dd>{compact(creator.followersCount)}</dd>
        </div>
        <div>
          <dt>Avg views</dt>
          <dd>{compact(creator.avgViews)}</dd>
        </div>
        <div>
          <dt>Engagement</dt>
          <dd className={creator.engagementRate >= 6 ? "is-hot" : ""}>
            {creator.engagementRate ? `${creator.engagementRate.toFixed(1)}%` : "—"}
          </dd>
        </div>
      </dl>
      <div className="mino-card__actions">
        <button
          type="button"
          className={`mino-card__save is-${save}`}
          onClick={() => void onSave()}
          disabled={save === "saving" || save === "saved"}
        >
          {save === "saved" ? "Saved" : save === "saving" ? "Saving…" : save === "limit" ? "Upgrade to save" : save === "error" ? "Retry" : "Save"}
        </button>
        <a className="mino-card__link" href={platformProfileUrl(creator.platform, creator.username)} target="_blank" rel="noreferrer">
          Profile
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M7 17L17 7M9 7h8v8" />
          </svg>
        </a>
      </div>
    </article>
  );
}

export function MinoCreatorResults({
  creators,
  label,
  sources,
  onOpenCatalog,
}: {
  creators: FeedCreator[];
  label: string;
  sources: string[];
  onOpenCatalog?: () => void;
}) {
  if (!creators.length) return null;
  const live = sources.includes("live");
  return (
    <section className="mino-results" aria-label={`Creators for ${label}`}>
      <header className="mino-results__head">
        <div>
          <strong>
            {creators.length} creator{creators.length > 1 ? "s" : ""}
          </strong>
          <span>{label}</span>
        </div>
        <span className={`mino-results__source${live ? " is-live" : ""}`}>
          <i aria-hidden />
          {live && sources.includes("catalog") ? "Catalog + live search" : live ? "Live search" : "Trackit catalog"}
        </span>
      </header>
      <div className="mino-results__grid">
        {creators.map((c, i) => (
          <CreatorCard key={`${c.platform}-${c.username}`} creator={c} index={i} />
        ))}
      </div>
      {onOpenCatalog ? (
        <button type="button" className="mino-results__more" onClick={onOpenCatalog}>
          Refine in the catalog
          <span aria-hidden>→</span>
        </button>
      ) : null}
    </section>
  );
}
