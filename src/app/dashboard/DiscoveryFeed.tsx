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

function daysAgoLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "actif aujourd'hui";
  if (d === 1) return "actif hier";
  if (d < 30) return `actif il y a ${d} j`;
  return `actif il y a ${Math.floor(d / 30)} mois`;
}

function Lock({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

const FILTERS: { label: string; options: string[] }[] = [
  { label: "Niche", options: ["Toutes niches", "Fitness", "Beauté", "Food", "Mode", "Tech", "Finance"] },
  { label: "Plateforme", options: ["Toutes", "TikTok", "Instagram", "YouTube"] },
  { label: "Abonnés", options: ["Tous", "< 50k", "50k – 500k", "500k – 2M", "2M+"] },
  { label: "Engagement", options: ["Tous", "≥ 3%", "≥ 6%", "≥ 9%"] },
  { label: "Localisation", options: ["Tous pays", "France", "USA", "UK", "Allemagne", "Brésil"] },
  { label: "Langue", options: ["Toutes", "Français", "Anglais", "Espagnol"] },
];

function VideoStrip({ creator }: { creator: FeedCreator }) {
  const vids = (creator.videoThumbnails || []).slice(0, 3);
  if (vids.length === 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
      {vids.map((v, i) => {
        const Wrapper = v.url ? "a" : "div";
        const props = v.url ? { href: v.url, target: "_blank", rel: "noopener noreferrer" } : {};
        return (
          <Wrapper key={i} {...props} style={{ aspectRatio: "9 / 16", borderRadius: 8, position: "relative", display: "block",
            background: v.thumbnail ? `url("${v.thumbnail}") center / cover no-repeat` : "#F0F0F0" }}>
            {v.views > 0 && (
              <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "5px 6px", fontSize: 10, fontWeight: 600,
                color: "#FFF", background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }}>{fmt(v.views)} vues</span>
            )}
          </Wrapper>
        );
      })}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#9A9A9A", marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: accent ? "#0047FF" : "#1A1A1A" }}>{value}</div>
    </div>
  );
}

function FeedCard({ creator }: { creator: FeedCreator }) {
  const top = creator.valueScore >= 80;
  const active = daysAgoLabel(creator.lastPostAt);
  const rentaColor = creator.valueScore >= 70 ? "#15803D" : creator.valueScore >= 40 ? "#B45309" : "#9A1F1F";
  const rentaBg = creator.valueScore >= 70 ? "#F0FDF4" : creator.valueScore >= 40 ? "#FFFBEB" : "#FEF2F2";
  return (
    <div style={{ background: "#FFF", border: "0.5px solid #EFEFEF", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <img src={creator.avatarUrl} alt="" width={40} height={40} style={{ borderRadius: "50%", background: "#F0F0F0", objectFit: "cover", flexShrink: 0 }}
          onError={(e) => { const img = e.currentTarget; if (!img.dataset.fb) { img.dataset.fb = "1"; img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(creator.displayName || creator.username)}&background=e5e5e5&color=9a9a9a&size=200&bold=true&rounded=true`; } }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{creator.displayName}</div>
          <div style={{ fontSize: 11, color: "#9A9A9A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            @{creator.username}{creator.countryCode ? ` · ${creator.countryCode}` : ""}
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: rentaColor, background: rentaBg, padding: "4px 8px", borderRadius: 8, whiteSpace: "nowrap" }}>Renta {creator.valueScore}</span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 11 }}>
        <span style={{ fontSize: 10, color: "#0047FF", background: "#E8EEFC", padding: "2px 8px", borderRadius: 20, textTransform: "capitalize" }}>{creator.primaryNiche || creator.niche}</span>
        <span style={{ fontSize: 10, color: "#7A7A7A", background: "#F5F5F5", padding: "2px 8px", borderRadius: 20, textTransform: "capitalize" }}>{creator.valueTier}</span>
        {top && <span style={{ fontSize: 10, fontWeight: 600, color: "#92400E", background: "#FEF3C7", padding: "2px 8px", borderRadius: 20 }}>★ Top ROI</span>}
        {active && <span style={{ fontSize: 10, color: "#15803D", background: "#F0FDF4", padding: "2px 8px", borderRadius: 20 }}>{active}</span>}
      </div>

      <VideoStrip creator={creator} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 8px", marginBottom: 11 }}>
        <Stat label="Abonnés" value={fmt(creator.followersCount)} />
        <Stat label="Engagement" value={`${creator.engagementRate}%`} />
        <Stat label="Vues moy." value={fmt(creator.avgViews)} />
        <Stat label="CPM est." value={`$${creator.estCpm}`} accent />
        <Stat label="Coût/post" value={`$${fmt(creator.estCostPerPost)}`} />
        <Stat label="Posts/sem." value={creator.postFrequency ? String(creator.postFrequency) : "—"} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto" }}>
        <span style={{ flex: 1, fontSize: 11, color: creator.email ? "#15803D" : "#9A9A9A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {creator.email ? `✉ ${creator.email}` : "Contact via DM"}
        </span>
        <button type="button" style={{ fontSize: 12, fontWeight: 600, color: "#0047FF", background: "#FFF", border: "1px solid #E5E5E5", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Sauver</button>
      </div>
    </div>
  );
}

function FilterBar({ isPaid, onLockedInteract, onNicheChange, onEngChange, nicheValue, engValue }: {
  isPaid: boolean;
  onLockedInteract: () => void;
  onNicheChange: (v: string) => void;
  onEngChange: (v: number) => void;
  nicheValue: string;
  engValue: number;
}) {
  const selStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid #E5E5E5", fontSize: 13, color: "#1A1A1A", background: "#FFF", fontFamily: "inherit", cursor: "pointer" };
  // Free users SEE every filter, fully styled and clickable — but interacting
  // with any of them opens the paywall instead of filtering.
  const guard = isPaid ? undefined : (e: React.SyntheticEvent) => { e.preventDefault(); onLockedInteract(); };
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 24 }}>
      {FILTERS.map((f) => (
        <select
          key={f.label}
          aria-label={f.label}
          style={selStyle}
          defaultValue={f.options[0]}
          onMouseDown={guard}
          onKeyDown={guard}
          onChange={(e) => {
            if (!isPaid) { e.preventDefault(); onLockedInteract(); return; }
            if (f.label === "Niche") onNicheChange(e.target.value === FILTERS[0].options[0] ? "" : e.target.value);
            if (f.label === "Engagement") onEngChange(e.target.value === "≥ 3%" ? 3 : e.target.value === "≥ 6%" ? 6 : e.target.value === "≥ 9%" ? 9 : 0);
          }}
          value={isPaid && f.label === "Niche" ? (nicheValue || f.options[0]) : isPaid && f.label === "Engagement" ? (engValue ? `≥ ${engValue}%` : f.options[0]) : undefined}
        >
          {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ))}
    </div>
  );
}

function PaywallModal({ title, body, onUpgrade, onClose }: { title: string; body: string; onUpgrade: () => void; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#FFF", borderRadius: 18, padding: "30px 34px", textAlign: "center", maxWidth: 380, boxShadow: "0 24px 48px rgba(0,0,0,0.18)" }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#E8EEFC", color: "#0047FF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}><Lock size={24} /></div>
        <div style={{ fontSize: 19, fontWeight: 600, color: "#1A1A1A", marginBottom: 7 }}>{title}</div>
        <div style={{ fontSize: 13, color: "#7A7A7A", marginBottom: 18, lineHeight: 1.5 }}>{body}</div>
        <button type="button" onClick={onUpgrade} style={{ background: "#0047FF", color: "#FFF", border: "none", borderRadius: 12, padding: "12px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%" }}>Passer à un plan payant</button>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#9A9A9A", fontSize: 13, marginTop: 12, cursor: "pointer" }}>Plus tard</button>
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
  const [filterPaywall, setFilterPaywall] = useState(false);

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
      if (fNiche && !`${c.primaryNiche} ${c.niche}`.toLowerCase().includes(fNiche.toLowerCase())) return false;
      if (fMinEng && c.engagementRate < fMinEng) return false;
      return true;
    });
  }, [creators, isPaid, fNiche, fMinEng]);

  const gridCols = isMobile ? "1fr" : "repeat(auto-fill, minmax(290px, 1fr))";
  const sharp = isPaid ? list : list.slice(0, FREE_FEED_VISIBLE);
  const blurred = !isPaid ? list.slice(FREE_FEED_VISIBLE, FREE_FEED_VISIBLE + 9) : [];

  return (
    <div style={{ padding: isMobile ? "56px 16px 40px" : "40px", background: "#FFF", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0 }}>Discovery</h1>
      <p style={{ fontSize: 14, color: "#7A7A7A", margin: "6px 0 20px" }}>Les meilleurs créateurs, classés par rentabilité.</p>

      <FilterBar
        isPaid={isPaid}
        onLockedInteract={() => setFilterPaywall(true)}
        onNicheChange={setFNiche}
        onEngChange={setFMinEng}
        nicheValue={fNiche}
        engValue={fMinEng}
      />

      {loading && <div style={{ color: "#9A9A9A", fontSize: 14 }}>Chargement du feed…</div>}
      {!loading && error && <div style={{ color: "#dc2626", fontSize: 14 }}>Erreur : {error}</div>}
      {!loading && !error && list.length === 0 && <div style={{ color: "#9A9A9A", fontSize: 14 }}>Aucun créateur.</div>}

      <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 16 }}>
        {sharp.map((c) => <FeedCard key={c.username} creator={c} />)}
      </div>

      {!isPaid && blurred.length > 0 && (
        <div style={{ position: "relative", marginTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 16, filter: "blur(6px)", opacity: 0.5, pointerEvents: "none" }} aria-hidden="true">
            {blurred.map((c) => <FeedCard key={c.username} creator={c} />)}
          </div>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "#FFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: "28px 34px", textAlign: "center", maxWidth: 380, boxShadow: "0 12px 32px rgba(0,0,0,0.12)" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#E8EEFC", color: "#0047FF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}><Lock size={22} /></div>
              <div style={{ fontSize: 19, fontWeight: 600, color: "#1A1A1A", marginBottom: 6 }}>Discover more</div>
              <div style={{ fontSize: 13, color: "#7A7A7A", marginBottom: 16, lineHeight: 1.5 }}>Des centaines d&apos;autres créateurs t&apos;attendent. Débloque tout le feed et les filtres avec un plan payant.</div>
              <button type="button" onClick={onUpgrade} style={{ background: "#0047FF", color: "#FFF", border: "none", borderRadius: 12, padding: "12px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Passer au plan payant</button>
            </div>
          </div>
        </div>
      )}

      {filterPaywall && (
        <PaywallModal
          title="Le filtrage est payant"
          body="Filtrer par niche, abonnés, engagement, pays ou langue est réservé aux plans payants. Passe à un plan payant pour cibler précisément."
          onUpgrade={onUpgrade}
          onClose={() => setFilterPaywall(false)}
        />
      )}
    </div>
  );
}
