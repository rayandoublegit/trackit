"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlanTier } from "@/lib/plan-limits";
import type { FeedCreator } from "@/lib/discovery-feed";
import { CreatorDetailDrawer } from "@/app/dashboard/CreatorDetailDrawer";
import { saveCreator } from "@/lib/workspace-client";

const proxy = (u?: string) => (!u ? "" : u.includes("/api/img-proxy") ? u : `/api/img-proxy?url=${encodeURIComponent(u)}`);

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
  if (d < 365) return `actif il y a ${Math.floor(d / 30)} mois`;
  return null;
}

function Lock({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

const FILTERS: { key: string; label: string; options: string[] }[] = [
  { key: "niche", label: "Niche", options: ["Toutes niches", "Fitness", "Beauté", "Food", "Mode", "Tech", "Finance", "Voyage", "Gaming"] },
  { key: "platform", label: "Plateforme", options: ["Toutes", "TikTok", "Instagram", "YouTube"] },
  { key: "followers", label: "Abonnés", options: ["Tous", "< 50k", "50k – 500k", "500k – 2M", "2M+"] },
  { key: "engagement", label: "Engagement", options: ["Tous", "≥ 3%", "≥ 6%", "≥ 9%"] },
  { key: "country", label: "Localisation", options: ["Tous pays", "France", "USA", "UK", "Allemagne", "Brésil"] },
  { key: "language", label: "Langue", options: ["Toutes", "Français", "Anglais", "Espagnol"] },
];

type FilterState = Record<string, string>;

function toParams(f: FilterState): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.niche) p.niche = f.niche;
  if (f.platform && f.platform !== "TikTok") p.platform = f.platform; // all data is TikTok -> no-op
  if (f.followers === "< 50k") p.maxFollowers = "50000";
  else if (f.followers === "50k – 500k") { p.minFollowers = "50000"; p.maxFollowers = "500000"; }
  else if (f.followers === "500k – 2M") { p.minFollowers = "500000"; p.maxFollowers = "2000000"; }
  else if (f.followers === "2M+") p.minFollowers = "2000000";
  if (f.engagement === "≥ 3%") p.minEngagement = "3";
  else if (f.engagement === "≥ 6%") p.minEngagement = "6";
  else if (f.engagement === "≥ 9%") p.minEngagement = "9";
  const C: Record<string, string> = { France: "FR", USA: "US", UK: "GB", Allemagne: "DE", "Brésil": "BR" };
  if (C[f.country]) p.country = C[f.country];
  const L: Record<string, string> = { "Français": "fr", Anglais: "en", Espagnol: "es" };
  if (L[f.language]) p.language = L[f.language];
  return p;
}

function VideoPreview({ creator }: { creator: FeedCreator }) {
  const vids = (creator.topVideos || []).filter((v) => v.cover).slice(0, 3);
  if (vids.length === 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
      {vids.map((v, i) => (
        <div key={v.id || i} style={{ position: "relative", aspectRatio: "9 / 16", borderRadius: 10, overflow: "hidden",
          background: `#111 url("${proxy(v.cover)}") center / cover no-repeat` }}>
          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.92)", fontSize: 22 }}>▶</span>
          {v.playCount > 0 && (
            <span style={{ position: "absolute", left: 6, bottom: 6, fontSize: 11, fontWeight: 600, color: "#FFF", textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>{fmt(v.playCount)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: "#F7F7F8", borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ fontSize: 11, color: "#9A9A9A", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: accent ? "#0047FF" : "#1A1A1A" }}>{value}</div>
    </div>
  );
}

function FeedCard({ creator, onOpen, onUpgrade }: { creator: FeedCreator; onOpen?: () => void; onUpgrade?: () => void }) {
  const [saved, setSaved] = useState(false);
  const c = creator;
  const active = daysAgoLabel(c.lastPostAt);
  const rentaColor = c.valueScore >= 70 ? "#15803D" : c.valueScore >= 40 ? "#B45309" : "#9A1F1F";
  const rentaBg = c.valueScore >= 70 ? "#F0FDF4" : c.valueScore >= 40 ? "#FFFBEB" : "#FEF2F2";
  return (
    <div onClick={onOpen} style={{ background: "#FFF", border: "0.5px solid #ECECEC", borderRadius: 16, padding: 16, cursor: "pointer", display: "flex", flexDirection: "column", gap: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <img src={c.avatarUrl ? proxy(c.avatarUrl) : `https://ui-avatars.com/api/?name=${encodeURIComponent(c.displayName || c.username)}&background=eef1f8&color=4a6cf7&size=160&bold=true&rounded=true`} alt="" width={52} height={52} style={{ borderRadius: "50%", background: "#F0F0F0", objectFit: "cover", flexShrink: 0 }}
          onError={(e) => { const i = e.currentTarget; if (!i.dataset.fb) { i.dataset.fb = "1"; i.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(c.displayName || c.username)}&background=eef1f8&color=4a6cf7&size=160&bold=true&rounded=true`; } }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.displayName}</span>
          </div>
          <div style={{ fontSize: 12.5, color: "#9A9A9A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            @{c.username}{c.countryCode ? ` · ${c.countryCode}` : ""}{c.language && c.language !== "unknown" ? ` · ${c.language}` : ""}
          </div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: rentaColor, background: rentaBg, padding: "5px 9px", borderRadius: 9, whiteSpace: "nowrap" }}>Renta {c.valueScore}</span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: "#1A1A1A", letterSpacing: "-0.02em" }}>{fmt(c.followersCount)}</span>
        <span style={{ fontSize: 12.5, color: "#9A9A9A" }}>abonnés</span>
        <span style={{ fontSize: 11, color: "#0047FF", background: "#E8EEFC", padding: "2px 9px", borderRadius: 20, textTransform: "capitalize" }}>{c.primaryNiche || c.niche}</span>
        {c.valueScore >= 80 && <span style={{ fontSize: 11, fontWeight: 600, color: "#92400E", background: "#FEF3C7", padding: "2px 9px", borderRadius: 20 }}>★ Top ROI</span>}
        {active && <span style={{ fontSize: 11, color: "#15803D", background: "#F0FDF4", padding: "2px 9px", borderRadius: 20 }}>{active}</span>}
      </div>

      <VideoPreview creator={c} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 7 }}>
        <MiniStat label="Engagement" value={`${c.engagementRate}%`} />
        <MiniStat label="Vues moy." value={fmt(c.avgViews)} />
        <MiniStat label="CPM est." value={`$${c.estCpm}`} accent />
        <MiniStat label="Authenticité" value={`${c.authenticityScore}`} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 12, color: c.email ? "#15803D" : "#9A9A9A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.email ? `✉ ${c.email}` : "Contact via DM"}
        </span>
        <button type="button"
          onClick={async (e) => { e.stopPropagation(); if (saved) return; const r = await saveCreator(c); if (r.error) { if (r.status === 402) onUpgrade?.(); return; } setSaved(true); }}
          style={{ fontSize: 13, fontWeight: 600, color: saved ? "#15803D" : "#0047FF", background: saved ? "#F0FDF4" : "#FFF", border: `1px solid ${saved ? "#86EFAC" : "#E5E5E5"}`, borderRadius: 9, padding: "8px 16px", cursor: "pointer" }}>
          {saved ? "✓ Sauvé" : "Sauver"}
        </button>
      </div>
    </div>
  );
}

function FilterBar({ isPaid, values, onChange, onLocked }: {
  isPaid: boolean; values: FilterState; onChange: (key: string, v: string) => void; onLocked: () => void;
}) {
  const selStyle: React.CSSProperties = { padding: "9px 13px", borderRadius: 10, border: "1px solid #E5E5E5", fontSize: 13, color: "#1A1A1A", background: "#FFF", fontFamily: "inherit", cursor: "pointer" };
  const guard = isPaid ? undefined : (e: React.SyntheticEvent) => { e.preventDefault(); onLocked(); };
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 22 }}>
      {FILTERS.map((f) => (
        <select key={f.key} aria-label={f.label} style={selStyle} onMouseDown={guard} onKeyDown={guard}
          value={isPaid ? (values[f.key] || f.options[0]) : f.options[0]}
          onChange={(e) => { if (!isPaid) { e.preventDefault(); onLocked(); return; } onChange(f.key, e.target.value === f.options[0] ? "" : e.target.value); }}>
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

const FREE_VISIBLE = 6;
const LIMIT = 24;

export function DiscoveryFeed({ plan, isMobile, onUpgrade }: { plan: PlanTier; isMobile?: boolean; onUpgrade: () => void }) {
  const isPaid = plan !== "free";
  const [creators, setCreators] = useState<FeedCreator[]>([]);
  const [filters, setFilters] = useState<FilterState>({ niche: "", platform: "", followers: "", engagement: "", country: "", language: "" });
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterPaywall, setFilterPaywall] = useState(false);
  const [selected, setSelected] = useState<FeedCreator | null>(null);

  const params = useMemo(() => toParams(filters), [filters]);

  const fetchPage = useCallback(async (off: number, replace: boolean) => {
    const qs = new URLSearchParams({ ...params, offset: String(off), limit: String(LIMIT) }).toString();
    const r = await fetch(`/api/discovery-feed?${qs}`);
    const d = await r.json();
    const list: FeedCreator[] = Array.isArray(d.creators) ? d.creators : [];
    setError(d.error || null);
    setCreators((prev) => (replace ? list : [...prev, ...list]));
    setHasMore(!!d.hasMore);
    setOffset(off + list.length);
  }, [params]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPage(0, true).catch(() => { if (!cancelled) setError("network"); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchPage]);

  // Auto-load more on scroll near the bottom (paid). Re-binds on offset change
  // so the closure always fetches the right page.
  useEffect(() => {
    if (!isPaid || !hasMore || loading || loadingMore) return;
    const onScroll = () => {
      const el = document.scrollingElement || document.documentElement;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 900) {
        setLoadingMore(true);
        fetchPage(offset, false).finally(() => setLoadingMore(false));
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isPaid, hasMore, loading, loadingMore, offset, fetchPage]);

  const items = isPaid ? creators : creators.slice(0, FREE_VISIBLE + 2);
  const hasMoreFree = !isPaid && creators.length > FREE_VISIBLE;
  const gridCols = isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))";

  return (
    <div style={{ padding: isMobile ? "56px 16px 40px" : "40px", background: "#FFF", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.04em", margin: 0 }}>Discovery</h1>
      <p style={{ fontSize: 14, color: "#7A7A7A", margin: "6px 0 20px" }}>Trouve les meilleurs créateurs — aperçu complet du compte, vidéos et analyse de rentabilité.</p>

      <FilterBar isPaid={isPaid} values={filters} onLocked={() => setFilterPaywall(true)}
        onChange={(key, v) => setFilters((prev) => ({ ...prev, [key]: v }))} />

      {loading && <div style={{ color: "#9A9A9A", fontSize: 14 }}>Chargement du feed…</div>}
      {!loading && error && <div style={{ color: "#dc2626", fontSize: 14 }}>Erreur : {error}</div>}
      {!loading && !error && creators.length === 0 && <div style={{ color: "#9A9A9A", fontSize: 14 }}>Aucun créateur pour ces filtres.</div>}

      <div style={{ position: "relative" }}>
        <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 16 }}>
          {items.map((c, i) => {
            const locked = !isPaid && i >= FREE_VISIBLE;
            return (
              <div key={c.username} aria-hidden={locked || undefined} style={locked ? { filter: "blur(7px)", opacity: 0.5, pointerEvents: "none" } : undefined}>
                <FeedCard creator={c} onOpen={() => setSelected(c)} onUpgrade={onUpgrade} />
              </div>
            );
          })}
        </div>

        {hasMoreFree && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 420, background: "linear-gradient(rgba(255,255,255,0), #FFF 62%)", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 40, pointerEvents: "none" }}>
            <div style={{ background: "#FFF", border: "1px solid #EFEFEF", borderRadius: 16, padding: "28px 34px", textAlign: "center", maxWidth: 400, boxShadow: "0 12px 32px rgba(0,0,0,0.12)", pointerEvents: "auto" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#E8EEFC", color: "#0047FF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}><Lock size={22} /></div>
              <div style={{ fontSize: 19, fontWeight: 600, color: "#1A1A1A", marginBottom: 6 }}>Des milliers de créateurs t&apos;attendent</div>
              <div style={{ fontSize: 13, color: "#7A7A7A", marginBottom: 16, lineHeight: 1.5 }}>Débloque tout le feed, les filtres et le défilement illimité avec un plan payant.</div>
              <button type="button" onClick={onUpgrade} style={{ background: "#0047FF", color: "#FFF", border: "none", borderRadius: 12, padding: "12px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Passer au plan payant</button>
            </div>
          </div>
        )}
      </div>

      {isPaid && hasMore && !loading && (
        <div style={{ textAlign: "center", padding: "28px 0 8px" }}>
          <button type="button" disabled={loadingMore}
            onClick={() => { setLoadingMore(true); fetchPage(offset, false).finally(() => setLoadingMore(false)); }}
            style={{ fontSize: 14, fontWeight: 600, color: "#0047FF", background: "#FFF", border: "1px solid #D6E0FF", borderRadius: 12, padding: "12px 28px", cursor: loadingMore ? "default" : "pointer" }}>
            {loadingMore ? "Chargement…" : "Charger plus de créateurs"}
          </button>
        </div>
      )}

      {filterPaywall && (
        <PaywallModal title="Le filtrage est payant" body="Filtrer par niche, abonnés, engagement, pays ou langue est réservé aux plans payants." onUpgrade={onUpgrade} onClose={() => setFilterPaywall(false)} />
      )}

      <CreatorDetailDrawer creator={selected} plan={plan} onClose={() => setSelected(null)} onUpgrade={onUpgrade} />
    </div>
  );
}
