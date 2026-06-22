# Discovery Feed (freemium "rentabilité") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Discovery screen with a freemium feed of top creators across all niches, re-ranked by a value/ROI ("rentabilité") score, where free users see ~9 then a blurred "Discover more" paywall and filters are locked behind any paid plan.

**Architecture:** Pure value-scoring functions (`creator-value.ts`) feed a pure feed-ranker (`rankFeed`) wrapped by an I/O aggregator (`buildFeed`) that pulls from the live ScrapeCreators engine (or the DB in prod). A new `DiscoveryFeed.tsx` renders the feed, gates it by `plan`, and reuses the live avatar/video data. Built on branch `experiment/discovery-feed` (not pushed).

**Tech Stack:** Next.js 16, TypeScript (strict), Vitest, the existing `discovery-live` engine + `/api/img-proxy`.

**Conventions:** commits end with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (via a second `-m`). Path alias `@/` → `./src/`. Tests co-located.

---

## File Structure

**Create:**
- `src/lib/creator-value.ts` — pure: `estimatedCostPerPost`, `estimatedCpm`, `valueScore`, `valueTier`, `FREE_FEED_VISIBLE`.
- `src/lib/creator-value.test.ts`
- `src/lib/discovery-feed.ts` — `FeedCreator`, `rankFeed` (pure), `buildFeed` (I/O aggregator + cache).
- `src/lib/discovery-feed.test.ts` — tests `rankFeed`.
- `src/app/api/discovery-feed/route.ts` — serves the feed.
- `src/app/dashboard/DiscoveryFeed.tsx` — feed UI + gating + paywall + locked filters.

**Modify:**
- `src/lib/dev-bypass.ts` — `DEV_BYPASS_PLAN` from `NEXT_PUBLIC_DEV_BYPASS_PLAN` (default `free`).
- `src/app/dashboard/page.tsx` — render `DiscoveryFeed` for the `discovery` view.

---

## Task 1: `creator-value.ts` — value / rentabilité scoring

**Files:**
- Create: `src/lib/creator-value.ts`
- Test: `src/lib/creator-value.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { estimatedCostPerPost, estimatedCpm, valueScore, valueTier, FREE_FEED_VISIBLE } from "@/lib/creator-value";

describe("estimatedCostPerPost", () => {
  it("tiers by followers", () => {
    expect(estimatedCostPerPost(5_000)).toBe(50);
    expect(estimatedCostPerPost(45_000)).toBe(150);
    expect(estimatedCostPerPost(200_000)).toBe(500);
    expect(estimatedCostPerPost(800_000)).toBe(1800);
    expect(estimatedCostPerPost(4_000_000)).toBe(5000);
    expect(estimatedCostPerPost(6_700_000)).toBe(12000);
  });
});

describe("valueTier", () => {
  it("labels by size", () => {
    expect(valueTier(5_000)).toBe("nano");
    expect(valueTier(45_000)).toBe("micro");
    expect(valueTier(200_000)).toBe("mid");
    expect(valueTier(800_000)).toBe("macro");
    expect(valueTier(4_000_000)).toBe("mega");
  });
});

describe("estimatedCpm", () => {
  it("cost per 1000 real views, rounded to 0.1", () => {
    expect(estimatedCpm(150, 40_000)).toBe(3.8); // 150 / 40
    expect(estimatedCpm(5000, 108_000)).toBeCloseTo(46.3, 1);
  });
  it("guards zero views", () => {
    expect(estimatedCpm(150, 0)).toBe(1500); // 150 / 0.1
  });
});

describe("valueScore", () => {
  it("micro engaged scores high", () => {
    expect(valueScore(45_000, 8, 40_000)).toBe(81);
  });
  it("mid scores well", () => {
    expect(valueScore(200_000, 7, 90_000)).toBe(76);
  });
  it("big healthy account is mediocre value", () => {
    expect(valueScore(4_000_000, 13, 108_000)).toBe(44);
  });
  it("big inflated account scores low", () => {
    expect(valueScore(6_700_000, 4.7, 22_000)).toBe(15);
  });
  it("clamps to 0-100", () => {
    const s = valueScore(5_000, 50, 50_000);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});

describe("FREE_FEED_VISIBLE", () => {
  it("is 9", () => expect(FREE_FEED_VISIBLE).toBe(9));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/creator-value.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/creator-value.ts`**

```ts
export const FREE_FEED_VISIBLE = 9;

export type ValueTier = "nano" | "micro" | "mid" | "macro" | "mega";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Indicative market rate for one sponsored post, by follower tier (USD).
export function estimatedCostPerPost(followers: number): number {
  if (followers < 10_000) return 50;
  if (followers < 50_000) return 150;
  if (followers < 250_000) return 500;
  if (followers < 1_000_000) return 1800;
  if (followers < 5_000_000) return 5000;
  return 12000;
}

export function valueTier(followers: number): ValueTier {
  if (followers < 10_000) return "nano";
  if (followers < 100_000) return "micro";
  if (followers < 500_000) return "mid";
  if (followers < 1_000_000) return "macro";
  return "mega";
}

// USD per 1000 real views. Lower = better value. Rounded to 0.1.
export function estimatedCpm(estCostPerPost: number, avgViews: number): number {
  const cpm = estCostPerPost / Math.max(avgViews / 1000, 0.1);
  return Math.round(cpm * 10) / 10;
}

// 0-100. Rewards low CPM (cost efficiency) and high engagement.
export function valueScore(followers: number, engagementRate: number, avgViews: number): number {
  const cost = estimatedCostPerPost(followers);
  const cpm = cost / Math.max(avgViews / 1000, 0.1);
  const cpmComponent = clamp(100 - cpm * 2, 0, 100);
  const engagementComponent = clamp(engagementRate * 8, 0, 100);
  return Math.round(0.6 * cpmComponent + 0.4 * engagementComponent);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/creator-value.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add src/lib/creator-value.ts src/lib/creator-value.test.ts
git commit -m "feat: creator value/rentabilité scoring (cost, CPM, score)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `discovery-feed.ts` — rankFeed (pure) + buildFeed (I/O)

**Files:**
- Create: `src/lib/discovery-feed.ts`
- Test: `src/lib/discovery-feed.test.ts`

- [ ] **Step 1: Write the failing test** (rankFeed is pure)

```ts
import { describe, it, expect } from "vitest";
import { rankFeed } from "@/lib/discovery-feed";
import type { DiscoveryCreatorResult } from "@/lib/discovery-live";

function creator(p: Partial<DiscoveryCreatorResult> & { username: string }): DiscoveryCreatorResult {
  return {
    username: p.username, displayName: p.username, avatarUrl: "", followersCount: p.followersCount ?? 50_000,
    engagementRate: p.engagementRate ?? 8, engagementByFollower: 0, avgViews: p.avgViews ?? 40_000,
    postFrequency: 0, lastPostAt: null, authenticityScore: 90, qualityStatus: "ok", platform: "TikTok",
    bio: "", email: null, niche: "fitness", primaryNiche: "fitness", language: "unknown",
    location: null, countryCode: null, videoThumbnails: [],
  };
}

describe("rankFeed", () => {
  it("adds value fields, dedups, and sorts by valueScore desc", () => {
    const out = rankFeed([
      creator({ username: "big", followersCount: 6_700_000, engagementRate: 4.7, avgViews: 22_000 }),   // ~15
      creator({ username: "micro", followersCount: 45_000, engagementRate: 8, avgViews: 40_000 }),       // ~81
      creator({ username: "micro" }),                                                                    // dup -> dropped
      creator({ username: "mid", followersCount: 200_000, engagementRate: 7, avgViews: 90_000 }),        // ~76
    ]);
    expect(out.map((c) => c.username)).toEqual(["micro", "mid", "big"]);
    expect(out[0].valueScore).toBe(81);
    expect(out[0].estCpm).toBeGreaterThan(0);
    expect(out[0].valueTier).toBe("micro");
    expect(out[0].estCostPerPost).toBe(150);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/discovery-feed.test.ts`
Expected: FAIL — `rankFeed` not exported.

- [ ] **Step 3: Implement `src/lib/discovery-feed.ts`**

```ts
import type { DiscoveryCreatorResult } from "@/lib/discovery-live";
import { liveSearchAndEnrich } from "@/lib/discovery-live";
import { normalizeDiscoveryFilters } from "@/lib/creator-discovery-filters";
import { createClient } from "@supabase/supabase-js";
import {
  estimatedCostPerPost,
  estimatedCpm,
  valueScore,
  valueTier,
  type ValueTier,
} from "@/lib/creator-value";

export interface FeedCreator extends DiscoveryCreatorResult {
  valueScore: number;
  estCostPerPost: number;
  estCpm: number;
  valueTier: ValueTier;
}

// Niches aggregated to build the cross-niche feed. Override with FEED_NICHES
// (comma-separated) and FEED_LIMIT_PER_NICHE to control credit spend.
const DEFAULT_NICHES = ["fitness", "beauty", "food", "fashion", "tech"];

export function feedNiches(): string[] {
  const raw = process.env.FEED_NICHES;
  return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_NICHES;
}

// Pure: attach value fields, dedup by username, sort by valueScore desc.
export function rankFeed(creators: DiscoveryCreatorResult[]): FeedCreator[] {
  const seen = new Set<string>();
  const out: FeedCreator[] = [];
  for (const c of creators) {
    if (!c.username || seen.has(c.username)) continue;
    seen.add(c.username);
    const estCostPerPost = estimatedCostPerPost(c.followersCount);
    out.push({
      ...c,
      estCostPerPost,
      estCpm: estimatedCpm(estCostPerPost, c.avgViews),
      valueScore: valueScore(c.followersCount, c.engagementRate, c.avgViews),
      valueTier: valueTier(c.followersCount),
    });
  }
  return out.sort((a, b) => b.valueScore - a.valueScore);
}

let cache: { at: number; creators: FeedCreator[] } | null = null;
const TTL_MS = 30 * 60 * 1000;

function dbRowToCreator(c: Record<string, unknown>): DiscoveryCreatorResult {
  return {
    username: String(c.username), displayName: String(c.display_name ?? c.username),
    avatarUrl: String(c.avatar_url ?? ""), followersCount: Number(c.followers ?? 0),
    engagementRate: Number(c.engagement_rate ?? 0), engagementByFollower: Number(c.engagement_by_follower ?? 0),
    avgViews: Number(c.avg_views ?? 0), postFrequency: Number(c.post_frequency ?? 0),
    lastPostAt: (c.last_post_at as string) ?? null, authenticityScore: Number(c.authenticity_score ?? 0),
    qualityStatus: String(c.quality_status ?? "ok"), platform: String(c.platform ?? "TikTok"),
    bio: String(c.bio ?? ""), email: (c.email as string) ?? null, niche: String(c.primary_niche ?? ""),
    primaryNiche: String(c.primary_niche ?? ""), language: String(c.language ?? "unknown"),
    location: (c.location as string) ?? null, countryCode: (c.country_code as string) ?? null,
    videoThumbnails: Array.isArray(c.video_thumbnails) ? (c.video_thumbnails as DiscoveryCreatorResult["videoThumbnails"]) : [],
  };
}

// I/O: build the cross-niche feed. DB-first in prod; live aggregation locally.
export async function buildFeed(opts: { limitPerNiche?: number } = {}): Promise<FeedCreator[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.creators;

  const hasDb = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
  let pool: DiscoveryCreatorResult[] = [];

  if (hasDb) {
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data } = await supabaseAdmin
      .from("creators_index")
      .select("*")
      .eq("enrichment_status", "enriched")
      .neq("quality_status", "dead")
      .neq("quality_status", "inflated")
      .gte("authenticity_score", 40)
      .order("followers", { ascending: false })
      .limit(120);
    pool = (data || []).map(dbRowToCreator);
  } else if (process.env.SCRAPECREATORS_API_KEY) {
    const limit = Number(opts.limitPerNiche ?? process.env.FEED_LIMIT_PER_NICHE ?? 3);
    for (const niche of feedNiches()) {
      try {
        const part = await liveSearchAndEnrich(niche, normalizeDiscoveryFilters({ niche }), { limit });
        pool.push(...part);
      } catch {
        // skip a niche on error
      }
    }
  }

  const ranked = rankFeed(pool);
  cache = { at: Date.now(), creators: ranked };
  return ranked;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/discovery-feed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add src/lib/discovery-feed.ts src/lib/discovery-feed.test.ts
git commit -m "feat: discovery feed aggregator + value ranking" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `api/discovery-feed/route.ts` — serve the feed

**Files:**
- Create: `src/app/api/discovery-feed/route.ts`

> I/O route over the tested `buildFeed`; verified by `tsc` + the live check (Task 7).

- [ ] **Step 1: Implement `src/app/api/discovery-feed/route.ts`**

```ts
import { NextResponse } from "next/server";
import { buildFeed } from "@/lib/discovery-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const creators = await buildFeed();
    return NextResponse.json({ creators, count: creators.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "feed failed";
    return NextResponse.json({ creators: [], error: msg });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing the new route.

- [ ] **Step 3: Commit**

```
git add src/app/api/discovery-feed/route.ts
git commit -m "feat: /api/discovery-feed route" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `dev-bypass.ts` — switchable plan for testing both states

**Files:**
- Modify: `src/lib/dev-bypass.ts`

- [ ] **Step 1: Change `DEV_BYPASS_PLAN`** — replace the line `export const DEV_BYPASS_PLAN = "pro";` with:

```ts
// Plan for the dev-bypass user. Default "free" so the discovery paywall is
// visible; set NEXT_PUBLIC_DEV_BYPASS_PLAN=pro in .env.local to test unlocked.
export const DEV_BYPASS_PLAN = process.env.NEXT_PUBLIC_DEV_BYPASS_PLAN || "free";
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add src/lib/dev-bypass.ts
git commit -m "feat: dev-bypass plan switchable via env (default free)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `DiscoveryFeed.tsx` — feed UI + gating + paywall

**Files:**
- Create: `src/app/dashboard/DiscoveryFeed.tsx`

> Client component, no unit test. Gate is `npx tsc --noEmit` + the browser check (Task 7).

- [ ] **Step 1: Create `src/app/dashboard/DiscoveryFeed.tsx`**

```tsx
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in `DiscoveryFeed.tsx`.

- [ ] **Step 3: Commit**

```
git add src/app/dashboard/DiscoveryFeed.tsx
git commit -m "feat(ui): DiscoveryFeed — rentabilité feed with paywall + locked filters" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Wire `DiscoveryFeed` into the dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Import `DiscoveryFeed`** — add near the other dashboard-view imports (e.g. right after the `DiscoveryView` import line `import { DiscoveryView } from "./DiscoveryView";`):

```ts
import { DiscoveryFeed } from "./DiscoveryFeed";
```

- [ ] **Step 2: Render it for the discovery view** — find the block `{view === "discovery" && (` ... `<DiscoveryView ... />` ... `)}` and replace the `<DiscoveryView .../>` element with:

```tsx
          <DiscoveryFeed
            isMobile={isMobile}
            plan={plan}
            onUpgrade={() => {
              if (plan === "free") void handleUpgradeBasic();
              else if (plan === "basic") void handleUpgradePro();
              else void handleUpgradeScale();
            }}
          />
```

(Leave the `DiscoveryView` import in place — it stays available, just not rendered for this view.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (`handleUpgradeBasic/Pro/Scale` already exist in this file.)

- [ ] **Step 4: Commit**

```
git add src/app/dashboard/page.tsx
git commit -m "feat: render DiscoveryFeed for the discovery view" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Live verification (free + pro states)

**Files:** none. Credit-conscious — keep the feed small first.

- [ ] **Step 1: Keep the first feed cheap** — in `.env.local` add (bounds credits for the first build; the feed is cached after):

```
FEED_NICHES=fitness,beauty,food
FEED_LIMIT_PER_NICHE=3
```

(~3 niches × 3 = ~9 enrich + 3 search ≈ 21 credits, one-time, cached.)

- [ ] **Step 2: Test the FREE state** — ensure `.env.local` has `NEXT_PUBLIC_DEV_BYPASS_PLAN=free` (or no such line → defaults free). Restart the dev server (preview_stop + preview_start). Open the dashboard → Discovery. Expected: ~9 sharp creator cards (avatars + 3 video previews + Renta/CPM), then a blurred row with the centered "Discover more" paywall, and the filter chips showing padlocks. Clicking a filter or the paywall button triggers the upgrade flow.

- [ ] **Step 3: Verify the feed endpoint directly** —
```
curl -sS http://localhost:3000/api/discovery-feed | python3 -c "import sys,json; d=json.load(sys.stdin); print('count', d.get('count'), 'error', d.get('error')); [print(' ', c['username'], 'renta', c['valueScore'], 'cpm', c['estCpm']) for c in d.get('creators',[])[:6]]"
```
Expected: creators sorted by `valueScore` desc, each with `estCpm` and `valueScore`.

- [ ] **Step 4: Test the PRO state** — set `NEXT_PUBLIC_DEV_BYPASS_PLAN=pro` in `.env.local`, restart the dev server, reload Discovery. Expected: the full feed (no blur, no paywall), and the filter inputs are active (typing a niche / picking a min-engagement narrows the list).

- [ ] **Step 5: Record results** (counts + a couple of sample rows + screenshots). No commit (no code changed).

---

## Self-Review (author checklist — completed)

**Spec coverage:** §2 value score → Task 1. §3 feed source (live + DB) → Task 2 (`buildFeed`) + Task 3 (route). §4 gating (9 free, blur, paywall, locked filters, any paid unlocks) → Task 5 + Task 6 (`onUpgrade` wiring). §4 dev plan switch → Task 4. §5 cards (avatar + 3 videos + renta + CPM) → Task 5 (`FeedCard`/`VideoStrip`). §7 tests → Tasks 1-2 unit + Task 7 live. The reference cases in §2 are encoded verbatim in Task 1's tests.

**Placeholder scan:** No TBD/TODO; every code step is complete. Paid filtering is implemented as simple client-side niche + min-engagement (matches spec §8 "start client, simple").

**Type consistency:** `FeedCreator` (discovery-feed.ts) extends `DiscoveryCreatorResult` (discovery-live.ts) and carries `valueScore`/`estCpm`/`estCostPerPost`/`valueTier`; consumed by `DiscoveryFeed.tsx`. `valueScore`/`estimatedCpm`/`estimatedCostPerPost`/`valueTier`/`FREE_FEED_VISIBLE` names match across creator-value.ts → discovery-feed.ts → DiscoveryFeed.tsx. `PlanTier` imported from plan-limits.ts. `videoThumbnails` shape (`{views, thumbnail, url?}`) matches the live engine.
