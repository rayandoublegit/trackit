"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { FeedCreator } from "@/lib/discovery-feed";
import type { CreatorProfileData, HistoryPoint, LibraryVideo } from "@/lib/creator-intel-types";
import { PlatformLogo, platformKey, platformProfileUrl } from "@/components/PlatformLogo";
import { CreatorAvatar } from "./CreatorAvatar";
import { CountUp } from "./sample-motion";
import { useLang, type Lang } from "@/lib/useLang";
import { nicheLabel } from "@/lib/niche-tree";
import "./creator-profile.css";

// A creator's page, market-research style: identity and links, key numbers
// with growth, follower and views charts, the videos, hashtags, content mix
// and similar creators. Everything comes from stored data (/api/creator-profile).

function fmt(n: number | null | undefined, lang: Lang = "en"): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (lang === "fr") {
    if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace(".", ",")} M`;
    if (a >= 1_000) return `${(n / 1_000).toFixed(a >= 100_000 ? 0 : 1).replace(".", ",")} k`;
    return String(Math.round(n));
  }
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(a >= 100_000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

function ago(iso: string | null, lang: Lang = "en"): string {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (!Number.isFinite(d) || d < 0) return "";
  if (lang === "fr") {
    if (d === 0) return "aujourd'hui";
    if (d === 1) return "hier";
    if (d < 30) return `il y a ${d} jours`;
    if (d < 365) return `il y a ${Math.floor(d / 30)} mois`;
    const y = Math.floor(d / 365);
    return `il y a ${y} ${y < 2 ? "an" : "ans"}`;
  }
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function monthYear(iso: string | null, lang: Lang = "en"): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { month: "short", year: "numeric" });
}

function Icon({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function Growth({ pct, abs }: { pct: number | null | undefined; abs?: number | null }) {
  const lang = useLang();
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <span className={`cp-growth${up ? " is-up" : " is-down"}`}>
      {up ? "▲" : "▼"} {lang === "fr" ? `${Math.abs(pct).toFixed(1).replace(".", ",")} %` : `${Math.abs(pct).toFixed(1)}%`}{abs != null ? ` · ${up ? "+" : ""}${fmt(abs, lang)}` : ""}
    </span>
  );
}

function FollowersChart({ history, current }: { history: HistoryPoint[]; current: number }) {
  const lang = useLang();
  const fr = lang === "fr";
  const loc = fr ? "fr-FR" : "en-US";
  const [hover, setHover] = useState<number | null>(null);
  const pts = history.filter((h) => h.followers != null) as (HistoryPoint & { followers: number })[];
  if (pts.length < 2) {
    return (
      <div className="cp-chart__empty">
        <b>{fmt(current, lang)}</b>
        <span>{fr ? "La croissance des abonnés apparaît ici après quelques jours de suivi." : "Follower growth appears here after a few days of tracking."}</span>
      </div>
    );
  }
  const W = 600;
  const H = 180;
  const min = Math.min(...pts.map((p) => p.followers));
  const max = Math.max(...pts.map((p) => p.followers));
  const span = Math.max(1, max - min);
  const xy = pts.map((p, i) => [(i / (pts.length - 1)) * W, H - 14 - ((p.followers - min) / span) * (H - 40)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const h = hover != null ? pts[hover] : null;
  return (
    <div className="cp-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(pts.length - 1, Math.round(((e.clientX - r.left) / r.width) * (pts.length - 1)))));
        }}
      >
        <path d={`${line} L${W},${H} L0,${H} Z`} className="cp-chart__area" />
        <path d={line} className="cp-chart__line" pathLength={1} />
        {pts.map((p, i) =>
          i % Math.max(1, Math.round(pts.length / 12)) === 0 || i === pts.length - 1 ? (
            <circle key={p.day} cx={xy[i][0]} cy={xy[i][1]} r="3.5" className="cp-chart__pt" />
          ) : null,
        )}
        {hover != null ? <line x1={xy[hover][0]} x2={xy[hover][0]} y1="0" y2={H} className="cp-chart__cursor" /> : null}
      </svg>
      {h ? (
        <div className="cp-chart__tip" style={{ left: `${(hover! / (pts.length - 1)) * 100}%` }}>
          <b>{fmt(h.followers, lang)}</b>
          <span>{new Date(h.day).toLocaleDateString(loc, { month: "short", day: "numeric" })}</span>
        </div>
      ) : null}
      <div className="cp-chart__axis">
        <span>{new Date(pts[0].day).toLocaleDateString(loc, { month: "short", day: "numeric" })}</span>
        <span>{new Date(pts[pts.length - 1].day).toLocaleDateString(loc, { month: "short", day: "numeric" })}</span>
      </div>
    </div>
  );
}

function ViewsBars({ videos, tracked }: { videos: LibraryVideo[]; tracked: boolean }) {
  const lang = useLang();
  const fr = lang === "fr";
  const list = tracked
    ? videos.filter((v) => v.postedAt).slice(0, 24).reverse()
    : videos.slice(0, 12);
  if (!list.length) return <div className="cp-chart__empty"><span>{fr ? "Aucune vidéo enregistrée pour l'instant." : "No videos stored yet."}</span></div>;
  const max = Math.max(...list.map((v) => v.views), 1);
  return (
    <div className="cp-bars">
      {list.map((v, i) => (
        <a
          key={v.id}
          className="cp-bar"
          href={v.shareUrl || undefined}
          target="_blank"
          rel="noreferrer"
          style={{ ["--h" as string]: `${Math.max(4, (v.views / max) * 100)}%`, ["--i" as string]: i }}
          title={`${fmt(v.views, lang)} ${fr ? (v.views < 2 ? "vue" : "vues") : "views"}${v.postedAt ? ` · ${new Date(v.postedAt).toLocaleDateString(fr ? "fr-FR" : "en-US", { month: "short", day: "numeric" })}` : ""}`}
        >
          <span />
        </a>
      ))}
    </div>
  );
}

function VideoCard({ v, rank }: { v: LibraryVideo; rank?: number }) {
  const lang = useLang();
  return (
    <a className="cp-video" href={v.shareUrl || undefined} target="_blank" rel="noreferrer">
      <span className="cp-video__media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {v.cover ? <img src={v.cover} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : null}
        {rank ? <span className="cp-video__rank">#{rank}</span> : null}
        <span className="cp-video__views">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4v16l13-8z" /></svg>
          {fmt(v.views, lang)}
        </span>
        {v.viewsGained7d ? <span className="cp-video__gain">+{fmt(v.viewsGained7d, lang)} {lang === "fr" ? "7 j" : "7d"}</span> : null}
        {v.isViral ? <span className="cp-video__viral">{lang === "fr" ? "Virale" : "Viral"}</span> : null}
      </span>
      <span className="cp-video__meta">
        {v.caption ? <span className="cp-video__caption">{v.caption}</span> : null}
        <span className="cp-video__stats">
          {v.likes ? (
            <span>
              <Icon d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" size={11} />
              {fmt(v.likes, lang)}
            </span>
          ) : null}
          {v.comments ? (
            <span>
              <Icon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" size={11} />
              {fmt(v.comments, lang)}
            </span>
          ) : null}
          {v.postedAt ? <span>{ago(v.postedAt, lang)}</span> : null}
          {v.hasProductLink ? (
            <span className="cp-video__shop" title={v.productUrl ?? undefined}>
              <Icon d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" size={11} />
              {lang === "fr" ? "Produit" : "Product"}
            </span>
          ) : null}
        </span>
      </span>
    </a>
  );
}

function Kpi({ label, children, sub, icon, i }: { label: string; children: ReactNode; sub?: ReactNode; icon: string; i: number }) {
  return (
    <div className="cp-kpi" style={{ ["--i" as string]: i }}>
      <span className="cp-kpi__top">
        <span>{label}</span>
        <span className="cp-kpi__icon"><Icon d={icon} size={15} /></span>
      </span>
      <b className="cp-kpi__value">{children}</b>
      {sub ? <span className="cp-kpi__sub">{sub}</span> : null}
    </div>
  );
}

export function CreatorProfilePage({
  username,
  preview,
  onBack,
  onOpenCreator,
  onReachOut,
  saveSlot,
}: {
  username: string;
  preview?: FeedCreator | null;
  onBack: () => void;
  onOpenCreator: (c: FeedCreator) => void;
  onReachOut?: (c: FeedCreator) => void;
  saveSlot?: (c: FeedCreator) => ReactNode;
}) {
  const lang = useLang();
  const fr = lang === "fr";
  const f = (n: number | null | undefined) => fmt(n, lang);
  const [data, setData] = useState<CreatorProfileData | null>(null);
  const [error, setError] = useState<"missing" | "failed" | null>(null);
  const [tab, setTab] = useState<"top" | "latest">("top");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/creator-profile?username=${encodeURIComponent(username)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "missing" : "failed");
        return r.json() as Promise<CreatorProfileData>;
      })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error && e.message === "missing" ? "missing" : "failed"));
    return () => {
      cancelled = true;
    };
  }, [username]);

  const c = data?.creator ?? preview ?? null;
  const g = c?.growth;
  const videos = useMemo(() => {
    const list = data?.videos ?? [];
    return tab === "top"
      ? [...list].sort((a, b) => b.views - a.views)
      : [...list].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
  }, [data, tab]);

  if (!c) {
    return (
      <div className="cp">
        <button type="button" className="cp-back" onClick={onBack}>
          <Icon d="M15 18l-6-6 6-6" size={16} /> {fr ? "Retour aux créateurs" : "Back to creators"}
        </button>
        {error ? (
          <p className="cp-error">
            {error === "missing"
              ? fr
                ? "Ce créateur n'est pas encore dans le catalogue."
                : "This creator is not in the catalog yet."
              : fr
                ? "Impossible de charger ce créateur."
                : "Could not load this creator."}
          </p>
        ) : <div className="cp-loading"><i /><i /><i /></div>}
      </div>
    );
  }

  const tracked = data?.depth === "tracked";
  const profileUrl = platformProfileUrl(c.platform, c.username);
  const erHot = c.engagementRate >= 6;

  return (
    <div className="cp">
      <div className="cp-top">
        <button type="button" className="cp-back" onClick={onBack} aria-label={fr ? "Retour aux créateurs" : "Back to creators"}>
          <Icon d="M15 18l-6-6 6-6" size={16} />
        </button>
        <span className="cp-top__face">
          <CreatorAvatar username={c.username} src={c.avatarUrl} displayName={c.displayName} size={44} />
          <span className="cp-top__platform"><PlatformLogo platform={c.platform} size={14} /></span>
        </span>
        <div className="cp-top__name">
          <h1>
            {c.displayName || c.username}
            {c.authenticityScore >= 60 ? (
              <svg width="16" height="16" viewBox="0 0 24 24" aria-label={fr ? "Vérifié" : "Verified"}><circle cx="12" cy="12" r="10" fill="var(--ws-accent)" /><path d="M8 12.5l2.5 2.5L16 9" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            ) : null}
          </h1>
          <a href={profileUrl} target="_blank" rel="noreferrer">
            @{c.username} <Icon d="M7 17L17 7M9 7h8v8" size={12} />
          </a>
        </div>
        <div className="cp-top__actions">
          <button
            type="button"
            className="cp-icon-btn"
            title={fr ? "Copier le lien du profil" : "Copy profile link"}
            onClick={() => {
              void navigator.clipboard?.writeText(profileUrl);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            }}
          >
            <Icon d={copied ? "M20 6L9 17l-5-5" : "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"} size={15} />
          </button>
          {saveSlot ? saveSlot(c) : null}
          {onReachOut ? (
            <button type="button" className="cp-primary" onClick={() => onReachOut(c)}>
              <Icon d="M22 2 11 13M22 2l-7 20-4-9-9-4z" size={14} /> {fr ? "Contacter" : "Reach out"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="cp-chips">
        <span className="cp-chip"><PlatformLogo platform={c.platform} size={13} />{platformKey(c.platform) === "instagram" ? "Instagram" : platformKey(c.platform) === "youtube" ? "YouTube" : "TikTok"}</span>
        {c.countryCode ? <span className="cp-chip"><Icon d="M12 22s-8-6-8-12a8 8 0 0 1 16 0c0 6-8 12-8 12zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />{c.countryCode}</span> : null}
        {c.language && c.language !== "unknown" ? <span className="cp-chip"><Icon d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6" />{c.language.toUpperCase()}</span> : null}
        {c.primaryNiche ? <span className="cp-chip is-niche">{fr ? nicheLabel(c.primaryNiche, "fr") : c.primaryNiche}</span> : null}
        {c.email ? <span className="cp-chip is-mail"><Icon d="M3 5h18v14H3zM3 7l9 6 9-6" />{fr ? "E-mail disponible" : "Email on file"}</span> : null}
        {g?.bioLink ? (
          <a className="cp-chip" href={g.bioLink} target="_blank" rel="noreferrer"><Icon d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />{g.bioLink.replace(/^https?:\/\//, "").slice(0, 32)}</a>
        ) : null}
        {g?.firstSeenAt ? <span className="cp-chip is-dim"><Icon d="M3 4h18v18H3zM16 2v4M8 2v4M3 10h18" />{fr ? "Suivi depuis" : "Tracked since"} {monthYear(g.firstSeenAt, lang)}</span> : null}
        {c.lastPostAt ? <span className="cp-chip is-dim">{fr ? "Dernière publication" : "Last post"} {ago(c.lastPostAt, lang)}</span> : null}
      </div>

      {c.bio ? <p className="cp-bio">{c.bio}</p> : null}

      <div className="cp-kpis">
        <Kpi i={0} label={fr ? "Abonnés" : "Followers"} icon="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" sub={<Growth pct={g?.followersGrowthPct30d} abs={g?.followersGrowth30d} />}>
          <CountUp value={c.followersCount} format={f} />
        </Kpi>
        <Kpi i={1} label={fr ? "Vues moy." : "Avg views"} icon="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6" sub={c.viewsPerFollower ? (fr ? `${Math.round(c.viewsPerFollower * 100)} % des abonnés` : `${Math.round(c.viewsPerFollower * 100)}% of followers`) : undefined}>
          <CountUp value={c.avgViews} format={f} />
        </Kpi>
        <Kpi i={2} label="Engagement" icon="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" sub={erHot ? <span className="cp-growth is-up">{fr ? "Au-dessus de la moyenne" : "Above average"}</span> : undefined}>
          {c.engagementRate ? (fr ? `${c.engagementRate.toFixed(1).replace(".", ",")} %` : `${c.engagementRate.toFixed(1)}%`) : "—"}
        </Kpi>
        <Kpi
          i={3}
          label={fr ? "Vues, 30 derniers jours" : "Views, last 30 days"}
          icon="M3 3v18h18M7 14l4-4 4 4 5-6"
          sub={g?.posts30d != null ? (fr ? `${g.posts30d} ${g.posts30d < 2 ? "publication" : "publications"}` : `${g.posts30d} posts`) : fr ? "Suivi nécessaire" : "Needs tracking"}
        >
          {g?.views30d != null ? <CountUp value={g.views30d} format={f} /> : "—"}
        </Kpi>
        <Kpi
          i={4}
          label={fr ? "Likes au total" : "Total likes"}
          icon="M7 10v12M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 7a2 2 0 0 1-1.9 1.4H7V10l4-8a2.5 2.5 0 0 1 4 3.9z"
          sub={g?.videoCount != null ? (fr ? `${f(g.videoCount)} ${g.videoCount < 2 ? "vidéo" : "vidéos"}` : `${fmt(g.videoCount)} videos`) : undefined}
        >
          {g?.totalLikes != null ? <CountUp value={g.totalLikes} format={f} /> : c.avgLikes ? `${f(c.avgLikes)} / ${fr ? "vidéo" : "video"}` : "—"}
        </Kpi>
      </div>

      <div className="cp-grid2">
        <section className="cp-card">
          <header className="cp-card__head">
            <h2>{fr ? "Abonnés" : "Followers"}</h2>
            {g?.followersGrowthPct7d != null ? <span className="cp-card__note">{fr ? "7 jours" : "7 days"} <Growth pct={g.followersGrowthPct7d} abs={g.followersGrowth7d} /></span> : null}
          </header>
          <FollowersChart history={data?.history ?? []} current={c.followersCount} />
        </section>
        <section className="cp-card">
          <header className="cp-card__head">
            <h2>{tracked ? (fr ? "Vues par vidéo" : "Views per video") : fr ? "Vues des meilleures vidéos" : "Views of top videos"}</h2>
            {g?.viewsGained7d ? <span className="cp-card__note">+{f(g.viewsGained7d)} {fr ? "vues en 7 jours" : "views in 7 days"}</span> : null}
          </header>
          <ViewsBars videos={data?.videos ?? []} tracked={tracked} />
        </section>
      </div>

      <div className="cp-grid-main">
        <section className="cp-card">
          <header className="cp-card__head">
            <h2>
              {fr ? "Vidéos" : "Videos"} <span className="cp-count">{data?.videos.length ?? 0}</span>
            </h2>
            <div className="cp-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "top"} className={tab === "top" ? "is-on" : ""} onClick={() => setTab("top")}>
                {fr ? "Les plus vues" : "Most viewed"}
              </button>
              <button type="button" role="tab" aria-selected={tab === "latest"} className={tab === "latest" ? "is-on" : ""} onClick={() => setTab("latest")} disabled={!data?.videos.some((v) => v.postedAt)}>
                {fr ? "Récentes" : "Latest"}
              </button>
            </div>
          </header>
          {!data ? (
            <div className="cp-loading"><i /><i /><i /></div>
          ) : videos.length ? (
            <div className="cp-videos">
              {videos.slice(0, 18).map((v, i) => (
                <VideoCard key={v.id} v={v} rank={tab === "top" ? i + 1 : undefined} />
              ))}
            </div>
          ) : (
            <p className="cp-muted">{fr ? "Aucune vidéo enregistrée pour ce créateur pour l'instant." : "No videos stored for this creator yet."}</p>
          )}
          {!tracked && data ? <p className="cp-muted">{fr ? "Les légendes, les dates et l'historique complet des vidéos apparaissent une fois ce créateur suivi." : "Captions, dates and the full video history appear once this creator is tracked."}</p> : null}
        </section>

        <aside className="cp-side">
          <section className="cp-card">
            <header className="cp-card__head"><h2>{fr ? "Engagement par vidéo" : "Engagement per video"}</h2></header>
            <dl className="cp-rows">
              <div><dt>Likes</dt><dd>{f(c.avgLikes)}</dd></div>
              <div><dt>{fr ? "Commentaires" : "Comments"}</dt><dd>{f(c.avgComments)}</dd></div>
              <div><dt>{fr ? "Partages" : "Shares"}</dt><dd>{f(c.avgShares)}</dd></div>
              <div><dt>{fr ? "Publications analysées" : "Posts analyzed"}</dt><dd>{c.postsAnalyzed ?? "—"}</dd></div>
            </dl>
          </section>
          <section className="cp-card">
            <header className="cp-card__head"><h2>{fr ? "Contenu" : "Content"}</h2></header>
            <dl className="cp-rows">
              <div><dt>{fr ? "Vidéos" : "Videos"}</dt><dd>{data?.mix.videos ?? "—"}</dd></div>
              <div><dt>{fr ? "Publications photo" : "Photo posts"}</dt><dd>{data?.mix.photos ?? "—"}</dd></div>
              <div><dt>{fr ? "Durée moy." : "Avg length"}</dt><dd>{data?.mix.avgDurationSeconds ? `${data.mix.avgDurationSeconds}s` : "—"}</dd></div>
              <div><dt>{fr ? "Avec lien produit" : "With product link"}</dt><dd>{data?.mix.productLinkShare != null ? (fr ? `${data.mix.productLinkShare} %` : `${data.mix.productLinkShare}%`) : "—"}</dd></div>
              <div title={fr ? "Au moins 5x les vues habituelles du créateur, 100k minimum" : "At least 5x the creator's usual views, 100K minimum"}><dt>{fr ? "Vidéos virales" : "Viral videos"}</dt><dd>{data?.mix.viralVideos ?? "—"}</dd></div>
            </dl>
            {data?.hashtags.length ? (
              <div className="cp-tags">
                {data.hashtags.map((h) => (
                  <span key={h.tag} className="cp-tag">#{h.tag} <em>{h.count}</em></span>
                ))}
              </div>
            ) : null}
          </section>
        </aside>
      </div>

      {data?.similar.length ? (
        <section className="cp-card">
          <header className="cp-card__head"><h2>{fr ? "Créateurs similaires" : "Similar creators"}</h2></header>
          <div className="cp-similar">
            {data.similar.map((s, i) => (
              <button key={s.username} type="button" className="cp-sim" style={{ ["--i" as string]: i }} onClick={() => onOpenCreator(s)}>
                <span className="cp-sim__head">
                  <CreatorAvatar username={s.username} src={s.avatarUrl} displayName={s.displayName} size={36} />
                  <span className="cp-sim__name">
                    <strong>{s.displayName || s.username}</strong>
                    <span>@{s.username}</span>
                  </span>
                </span>
                <span className="cp-sim__stats">
                  <span><Icon d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" size={12} />{f(s.followersCount)}</span>
                  <span><Icon d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" size={12} />{f(s.avgViews)}</span>
                  <span className={s.engagementRate >= 6 ? "is-hot" : ""}>{s.engagementRate ? (fr ? `${s.engagementRate.toFixed(1).replace(".", ",")} %` : `${s.engagementRate.toFixed(1)}%`) : "—"}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
