"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlanTier } from "@/lib/plan-limits";
import { FREE_FEED_VISIBLE } from "@/lib/creator-value";
import type { FeedCreator } from "@/lib/discovery-feed";

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 100_000 ? 0 : 1) + "K";
  return String(Math.round(n));
}

function Lock({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

const LOCKED_FILTERS = ["Niche", "Abonnés", "Engagement", "Pays", "Langue"];

function VideoStrip({ creator }: { creator: FeedCreator }) {
  const vids = (creator.videoThumbnails || []).slice(0, 3);
  if (vids.length === 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, marginBottom: 10 }}>
      {vids.map((v, i) => {
        const Wrapper = v.url ? "a" : "div";
        const props = v.url ? { href: v.url, target: "_blank", rel: "noopener noreferrer" } : {};
        return (
          <Wrapper key={i} {...props} style={{ aspectRatio: "9 / 16", borderRadius: 8, position: "relative", display: "block",
            background: v.thumbnail ? `url("${v.thumbnail}") center / cover no-repeat` : "#F0F0F0" }}>
            {v.views > 0 && (
              <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "5px 6px", fontSize: 10, fontWeight: 600,
                color: "#FFF", background: "linear-gradient(transparent, rgba(0,0,0,0.65))" }}>{fmt(v.views)} vues</span>
            )}
          </Wrapper>
        );
      })}
    </div>
  );
}

function FeedCard({ creator }: { creator: FeedCreator }) {
  const top = creator.valueScore >= 80;
  return (
    <div style={{ background: "#FFF", border: "0.5px solid #EFEFEF", borderRadius: 14, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <img src={creator.avatarUrl} alt="" width={36} height={36} style={{ borderRadius: "50%", background: "#F0F0F0", objectFit: "cover", flexShrink: 0 }}
          onError={(e) => { const img = e.currentTarget; if (!img.dataset.fb) { img.dataset.fb = "1"; img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(creator.displayName || creator.username)}&background=e5e5e5&color=9a9a9a&size=200&bold=true&rounded=true`; } }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{creator.displayName}</div>
          <div style={{ fontSize: 11, color: "#9A9A9A" }}>@{creator.username} · {creator.primaryNiche || creator.niche}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#15803D", background: "#F0FDF4", padding: "3px 8px", borderRadius: 8, whiteSpace: "nowrap" }}>Renta {creator.valueScore}</span>
      </div>
      <VideoStrip creator={creator} />
      {top && <div style={{ fontSize: 10, color: "#0047FF", marginBottom: 8 }}>★ Top ROI</div>}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {[["Abonnés", fmt(creator.followersCount)], ["Engag.", `${creator.engagementRate}%`], ["CPM est.", `$${creator.estCpm}`], ["Coût/post", `$${fmt(creator.estCostPerPost)}`]].map(([l, v]) => (
          <div key={l}><div style={{ fontSize: 10, color: "#9A9A9A" }}>{l}</div><div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A" }}>{v}</div></div>
        ))}
      </div>
    </div>
  );
}

export function DiscoveryFeed({ plan, isMobile, onUpgrade }: { plan: PlanTier; isMobile?: boolean; onUpgrade: () => void }) {
  const isPaid = plan !== "free";
  const [creators, setCreators] = useState<FeedCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fNiche, setFNiche] = useState("");
  const [fMinEng, setFMinEng] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/discovery-feed")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setCreators(Array.isArray(d.creators) ? d.creators : []); setError(d.error || null); } })
      .catch(() => { if (!cancelled) setError("network"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const list = useMemo(() => {
    if (!isPaid) return creators;
    return creators.filter((c) => {
      const q = fNiche.toLowerCase();
      if (q && !`${c.primaryNiche} ${c.niche}`.toLowerCase().includes(q)) return false;
      if (fMinEng && c.engagementRate < fMinEng) return false;
      return true;
    });
  }, [creators, isPaid, fNiche, fMinEng]);

  const gridCols = isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))";
  const sharp = isPaid ? list : list.slice(0, FREE_FEED_VISIBLE);
  const blurred = !isPaid ? list.slice(FREE_FEED_VISIBLE, FREE_FEED_VISIBLE + 6) : [];

  return (
    <div style={{ padding: isMobile ? "56px 16px 40px" : "40px", background: "#FFF", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0 }}>Discovery</h1>
      <p style={{ fontSize: 14, color: "#7A7A7A", margin: "6px 0 20px" }}>Les meilleurs créateurs, classés par rentabilité.</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 22 }}>
        {isPaid ? (
          <>
            <input placeholder="Niche…" value={fNiche} onChange={(e) => setFNiche(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #E5E5E5", fontSize: 13 }} />
            <select value={fMinEng} onChange={(e) => setFMinEng(Number(e.target.value))}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #E5E5E5", fontSize: 13 }}>
              <option value={0}>Engagement : tous</option>
              <option value={3}>≥ 3%</option>
              <option value={6}>≥ 6%</option>
              <option value={9}>≥ 9%</option>
            </select>
          </>
        ) : (
          <>
            {LOCKED_FILTERS.map((f) => (
              <button key={f} type="button" onClick={onUpgrade}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, border: "1px solid #EFEFEF", background: "#FAFAFA", color: "#9A9A9A", fontSize: 13, cursor: "pointer" }}>
                <Lock /> {f}
              </button>
            ))}
            <span style={{ fontSize: 12, color: "#9A9A9A" }}>Filtrer = plan payant</span>
          </>
        )}
      </div>

      {loading && <div style={{ color: "#9A9A9A", fontSize: 14 }}>Chargement du feed…</div>}
      {!loading && error && <div style={{ color: "#dc2626", fontSize: 14 }}>Erreur : {error}</div>}
      {!loading && !error && list.length === 0 && <div style={{ color: "#9A9A9A", fontSize: 14 }}>Aucun créateur.</div>}

      <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 16 }}>
        {sharp.map((c) => <FeedCard key={c.username} creator={c} />)}
      </div>

      {!isPaid && blurred.length > 0 && (
        <div style={{ position: "relative", marginTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 16, filter: "blur(5px)", opacity: 0.5, pointerEvents: "none" }} aria-hidden="true">
            {blurred.map((c) => <FeedCard key={c.username} creator={c} />)}
          </div>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "#FFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: "28px 32px", textAlign: "center", maxWidth: 360, boxShadow: "0 12px 32px rgba(0,0,0,0.10)" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#E8EEFC", color: "#0047FF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}><Lock size={22} /></div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", marginBottom: 6 }}>Discover more</div>
              <div style={{ fontSize: 13, color: "#7A7A7A", marginBottom: 16, lineHeight: 1.5 }}>Tu as vu {FREE_FEED_VISIBLE} créateurs. Débloque tout le feed et les filtres avec un plan payant.</div>
              <button type="button" onClick={onUpgrade} style={{ background: "#0047FF", color: "#FFF", border: "none", borderRadius: 12, padding: "12px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Passer au plan payant</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
