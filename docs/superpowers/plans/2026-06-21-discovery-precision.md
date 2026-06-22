# Discovery Precision — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace TRACKIT's estimated creator metrics with measured data and make every search filter run on that real data, fed by a self-evolving daily enrichment cron.

**Architecture:** Pure, unit-tested functions compute real metrics + an authenticity score from ScrapeCreators profile/video responses; Claude (Haiku) classifies niche/language/email. Thin I/O wrappers (cron routes, API route, SC client) call those pure functions. `/api/discovery` serves **enriched-only** rows and filters on real columns with a default quality gate.

**Tech Stack:** Next.js 16, TypeScript (strict), Supabase Postgres, `@anthropic-ai/sdk`, ScrapeCreators REST API, **Vitest** (new).

**Conventions:**
- Every commit message ends with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (shown via a second `-m`).
- Path alias `@/` → `./src/`.
- Tests are co-located: `src/lib/foo.ts` → `src/lib/foo.test.ts`.

---

## File Structure

**Create:**
- `vitest.config.ts` — Vitest config with `@/` alias
- `supabase/migrations/20260621_000015_creators_index_precision.sql` — new columns + indexes
- `src/lib/creator-metrics.ts` — pure: `median`, `computeMetrics` (real views/engagement)
- `src/lib/creator-quality.ts` — pure: `scoreQuality` (authenticity_score, quality_status)
- `src/lib/scrapecreators.ts` — typed SC client + pure parsers (`parseProfile`, `parseVideos`, `extractCaptions`)
- `src/lib/creator-enrichment.ts` — pure: `buildEnrichmentRow` (assembles a DB row)
- `src/lib/creator-classify.ts` — Claude classification: `buildClassificationPrompt`, `parseClassification` (pure) + `classifyCreator` (I/O)
- `src/lib/creator-discovery-filters.ts` — pure: `normalizeDiscoveryFilters` (filter spec + default quality gate + sort)
- `src/app/api/cron/enrich-creators/route.ts` — enrichment + refresh-rotation cron
- Test files alongside each pure module.

**Modify:**
- `package.json` — Vitest devDep + `test` scripts
- `src/lib/niche-tree.ts` — add `getDailySlice` (rotating discovery slice)
- `src/app/api/cron/seed-niches/route.ts` — rotating slice + set `enrichment_status='pending'`
- `src/app/api/discovery/route.ts` — remove estimates; enriched-only; real filters + quality gate
- `vercel.json` — add `enrich-creators` cron
- `src/app/dashboard/DiscoveryView.tsx` — expose new filters (Task 13, enhancement)

---

## Task 1: Vitest setup

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/lib/sanity.test.ts` (temporary)

- [ ] **Step 1: Install dependencies**

Run (PowerShell, repo root):
```
npm install
npm install -D vitest
```
Expected: completes; `vitest` appears in `devDependencies`.

- [ ] **Step 2: Add test scripts to `package.json`**

In the `"scripts"` block, add:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Create a sanity test** — `src/lib/sanity.test.ts`

```ts
import { describe, it, expect } from "vitest";

describe("sanity", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 6: Delete the sanity test and commit**

```
git rm src/lib/sanity.test.ts
git add package.json vitest.config.ts package-lock.json
git commit -m "chore: add Vitest test framework" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Database migration — precision columns

**Files:**
- Create: `supabase/migrations/20260621_000015_creators_index_precision.sql`

- [ ] **Step 1: Confirm the live schema first**

In the Supabase SQL editor, run and record the columns that already exist:
```sql
select column_name, data_type
from information_schema.columns
where table_name = 'creators_index'
order by ordinal_position;
```
Confirm `username, display_name, avatar_url, platform, followers, engagement_rate, avg_views, bio, niches, language, location, last_scraped_at` exist. If any column below already exists, that's fine — the migration is idempotent.

- [ ] **Step 2: Write the migration file**

```sql
-- Precision + auto-evolution columns for creators_index.
alter table creators_index
  add column if not exists avg_likes bigint,
  add column if not exists avg_comments bigint,
  add column if not exists avg_shares bigint,
  add column if not exists views_per_follower numeric,
  add column if not exists engagement_by_follower numeric,
  add column if not exists posts_analyzed integer,
  add column if not exists last_post_at timestamptz,
  add column if not exists post_frequency numeric,
  add column if not exists authenticity_score integer,
  add column if not exists quality_status text,
  add column if not exists email text,
  add column if not exists primary_niche text,
  add column if not exists country_code text,
  add column if not exists enriched_at timestamptz,
  add column if not exists enrichment_status text default 'pending';

create index if not exists creators_index_platform_idx on creators_index (platform);
create index if not exists creators_index_niches_idx on creators_index using gin (niches);
create index if not exists creators_index_engagement_idx on creators_index (engagement_rate desc);
create index if not exists creators_index_followers_idx on creators_index (followers desc);
create index if not exists creators_index_authenticity_idx on creators_index (authenticity_score desc);
create index if not exists creators_index_last_post_idx on creators_index (last_post_at desc);
create index if not exists creators_index_enrichment_idx on creators_index (enrichment_status, enriched_at);
```

- [ ] **Step 3: Apply it**

Paste the SQL into the Supabase SQL editor and run it. Re-run the Step 1 query and confirm the new columns are present.

- [ ] **Step 4: Commit**

```
git add supabase/migrations/20260621_000015_creators_index_precision.sql
git commit -m "feat(db): add precision + enrichment columns to creators_index" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `creator-metrics.ts` — median + computeMetrics

**Files:**
- Create: `src/lib/creator-metrics.ts`
- Test: `src/lib/creator-metrics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { median, computeMetrics, type VideoStat } from "@/lib/creator-metrics";

function vid(p: Partial<VideoStat>): VideoStat {
  return { playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, createTime: 0, isAd: false, ...p };
}

describe("median", () => {
  it("odd length", () => expect(median([3, 1, 2])).toBe(2));
  it("even length", () => expect(median([1, 2, 3, 4])).toBe(2.5));
  it("empty", () => expect(median([])).toBe(0));
});

describe("computeMetrics", () => {
  const NOW = Date.UTC(2026, 5, 21) / 1000; // seconds
  const day = 86400;

  it("uses real medians and excludes ads", () => {
    const videos = [
      vid({ playCount: 20000, likeCount: 900, commentCount: 80, shareCount: 20, createTime: NOW - day }),
      vid({ playCount: 24000, likeCount: 1100, commentCount: 100, shareCount: 40, createTime: NOW - 2 * day }),
      vid({ playCount: 999999, likeCount: 1, commentCount: 1, shareCount: 1, createTime: NOW - 3 * day, isAd: true }),
    ];
    const m = computeMetrics(1_000_000, videos, { nowMs: NOW * 1000 });
    expect(m.postsAnalyzed).toBe(2); // ad excluded
    expect(m.avgViews).toBe(22000); // median of 20000, 24000
    expect(m.engagementRate).toBeGreaterThan(4); // ~ (1000+1240)/... per view
    expect(m.viewsPerFollower).toBeCloseTo(0.022, 3);
    expect(m.lastPostAt).toBe(new Date((NOW - day) * 1000).toISOString());
  });

  it("returns zeros for no videos", () => {
    const m = computeMetrics(1000, [], { nowMs: NOW * 1000 });
    expect(m.avgViews).toBe(0);
    expect(m.postsAnalyzed).toBe(0);
    expect(m.lastPostAt).toBeNull();
  });

  it("ignores zero-view videos in per-view engagement", () => {
    const videos = [vid({ playCount: 0, likeCount: 5, createTime: NOW })];
    const m = computeMetrics(1000, videos, { nowMs: NOW * 1000 });
    expect(m.engagementRate).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/creator-metrics.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/creator-metrics.ts`**

```ts
export interface VideoStat {
  playCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  createTime: number; // unix seconds
  isAd: boolean;
}

export interface CreatorMetrics {
  avgViews: number;
  avgLikes: number;
  avgComments: number;
  avgShares: number;
  engagementRate: number; // by view, %
  engagementByFollower: number; // %
  viewsPerFollower: number;
  postsAnalyzed: number;
  lastPostAt: string | null; // ISO
  postFrequency: number; // posts/week
}

export const MAX_POSTS_ANALYZED = 12;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeMetrics(
  followers: number,
  videos: VideoStat[],
  opts: { maxPosts?: number; nowMs?: number } = {}
): CreatorMetrics {
  const maxPosts = opts.maxPosts ?? MAX_POSTS_ANALYZED;
  const organic = videos.filter((v) => !v.isAd);
  const used = (organic.length > 0 ? organic : videos)
    .slice()
    .sort((a, b) => b.createTime - a.createTime)
    .slice(0, maxPosts);

  if (used.length === 0) {
    return {
      avgViews: 0, avgLikes: 0, avgComments: 0, avgShares: 0,
      engagementRate: 0, engagementByFollower: 0, viewsPerFollower: 0,
      postsAnalyzed: 0, lastPostAt: null, postFrequency: 0,
    };
  }

  const views = used.map((v) => v.playCount);
  const avgViews = Math.round(median(views));
  const avgLikes = Math.round(median(used.map((v) => v.likeCount)));
  const avgComments = Math.round(median(used.map((v) => v.commentCount)));
  const avgShares = Math.round(median(used.map((v) => v.shareCount)));

  const perViewEr = used
    .filter((v) => v.playCount > 0)
    .map((v) => ((v.likeCount + v.commentCount + v.shareCount) / v.playCount) * 100);
  const engagementRate = perViewEr.length ? round2(median(perViewEr)) : 0;

  const meanEngagement =
    used.reduce((s, v) => s + v.likeCount + v.commentCount + v.shareCount, 0) / used.length;
  const engagementByFollower = followers > 0 ? round2((meanEngagement / followers) * 100) : 0;
  const viewsPerFollower = followers > 0 ? round4(avgViews / followers) : 0;

  const times = used.map((v) => v.createTime);
  const lastTime = Math.max(...times);
  const firstTime = Math.min(...times);
  const lastPostAt = new Date(lastTime * 1000).toISOString();
  const spanDays = Math.max((lastTime - firstTime) / 86400, 1);
  const postFrequency = round2((used.length / spanDays) * 7);

  return {
    avgViews, avgLikes, avgComments, avgShares, engagementRate,
    engagementByFollower, viewsPerFollower, postsAnalyzed: used.length,
    lastPostAt, postFrequency,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/creator-metrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add src/lib/creator-metrics.ts src/lib/creator-metrics.test.ts
git commit -m "feat: compute real creator metrics from videos" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `creator-quality.ts` — authenticity score

**Files:**
- Create: `src/lib/creator-quality.ts`
- Test: `src/lib/creator-quality.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { scoreQuality } from "@/lib/creator-quality";
import type { CreatorMetrics } from "@/lib/creator-metrics";

const NOW = Date.UTC(2026, 5, 21);
function metrics(p: Partial<CreatorMetrics>): CreatorMetrics {
  return {
    avgViews: 0, avgLikes: 0, avgComments: 0, avgShares: 0,
    engagementRate: 5, engagementByFollower: 2, viewsPerFollower: 0.2,
    postsAnalyzed: 10, lastPostAt: new Date(NOW - 2 * 86400000).toISOString(),
    postFrequency: 3, ...p,
  };
}

describe("scoreQuality", () => {
  it("healthy creator scores high and is ok", () => {
    const r = scoreQuality(50_000, metrics({}), { nowMs: NOW });
    expect(r.authenticityScore).toBe(100);
    expect(r.qualityStatus).toBe("ok");
  });

  it("flags inflated reach (eresfitness-like)", () => {
    const r = scoreQuality(6_726_894, metrics({ viewsPerFollower: 0.0033, engagementRate: 4.65 }), { nowMs: NOW });
    expect(r.authenticityScore).toBeLessThanOrEqual(60);
    expect(r.qualityStatus).toBe("inflated");
  });

  it("flags dead accounts (no post in >90d)", () => {
    const r = scoreQuality(50_000, metrics({ lastPostAt: new Date(NOW - 120 * 86400000).toISOString() }), { nowMs: NOW });
    expect(r.qualityStatus).toBe("dead");
    expect(r.authenticityScore).toBeLessThan(80);
  });

  it("penalizes low engagement", () => {
    const r = scoreQuality(20_000, metrics({ engagementRate: 0.5 }), { nowMs: NOW });
    expect(r.authenticityScore).toBe(75);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/creator-quality.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/creator-quality.ts`**

```ts
import type { CreatorMetrics } from "@/lib/creator-metrics";

export type QualityStatus = "ok" | "low_quality" | "dead" | "inflated";

export interface QualityResult {
  authenticityScore: number; // 0-100
  qualityStatus: QualityStatus;
}

export interface QualityThresholds {
  inflatedViewsPerFollower: number;
  inflatedMinFollowers: number;
  lowEngagementByView: number;
  dormantDays: number;
  deadDays: number;
  lowQualityScore: number;
}

export const QUALITY_DEFAULTS: QualityThresholds = {
  inflatedViewsPerFollower: 0.005,
  inflatedMinFollowers: 100_000,
  lowEngagementByView: 1,
  dormantDays: 30,
  deadDays: 90,
  lowQualityScore: 40,
};

export function scoreQuality(
  followers: number,
  m: CreatorMetrics,
  opts: { nowMs?: number; thresholds?: QualityThresholds } = {}
): QualityResult {
  const t = opts.thresholds ?? QUALITY_DEFAULTS;
  const nowMs = opts.nowMs ?? Date.now();

  let score = 100;
  let inflated = false;

  if (m.viewsPerFollower < t.inflatedViewsPerFollower && followers > t.inflatedMinFollowers) {
    score -= 40;
    inflated = true;
  }
  if (m.engagementRate < t.lowEngagementByView) score -= 25;

  let daysSince = Infinity;
  if (m.lastPostAt) daysSince = (nowMs - new Date(m.lastPostAt).getTime()) / 86_400_000;
  const dead = daysSince > t.deadDays;
  if (dead) score -= 40;
  else if (daysSince > t.dormantDays) score -= 15;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let qualityStatus: QualityStatus;
  if (inflated) qualityStatus = "inflated";
  else if (dead) qualityStatus = "dead";
  else if (score < t.lowQualityScore) qualityStatus = "low_quality";
  else qualityStatus = "ok";

  return { authenticityScore: score, qualityStatus };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/creator-quality.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add src/lib/creator-quality.ts src/lib/creator-quality.test.ts
git commit -m "feat: authenticity score against inflated/dead accounts" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `scrapecreators.ts` — client + pure parsers

**Files:**
- Create: `src/lib/scrapecreators.ts`
- Test: `src/lib/scrapecreators.test.ts`

- [ ] **Step 1: Write the failing test** (parsers only — pure)

```ts
import { describe, it, expect } from "vitest";
import { parseProfile, parseVideos, extractCaptions } from "@/lib/scrapecreators";

describe("parseProfile", () => {
  it("maps stats and user fields", () => {
    const raw = { user: { nickname: "Eres", signature: "fit bio", verified: true }, stats: { followerCount: 6726894, videoCount: 120 } };
    const p = parseProfile(raw);
    expect(p).toEqual({ followers: 6726894, verified: true, bio: "fit bio", displayName: "Eres", videoCount: 120 });
  });
  it("defaults missing fields", () => {
    expect(parseProfile({})).toEqual({ followers: 0, verified: false, bio: "", displayName: "", videoCount: 0 });
  });
});

describe("parseVideos", () => {
  it("maps statistics and is_ad", () => {
    const raw = { aweme_list: [
      { create_time: 100, is_ad: false, desc: "leg day", statistics: { play_count: 20000, digg_count: 900, comment_count: 80, share_count: 20 } },
      { create_time: 90, is_ad: true, desc: "ad", statistics: { play_count: 5, digg_count: 1, comment_count: 0, share_count: 0 } },
    ]};
    const v = parseVideos(raw);
    expect(v).toHaveLength(2);
    expect(v[0]).toEqual({ playCount: 20000, likeCount: 900, commentCount: 80, shareCount: 20, createTime: 100, isAd: false });
    expect(v[1].isAd).toBe(true);
  });
  it("handles empty", () => expect(parseVideos({})).toEqual([]));
});

describe("extractCaptions", () => {
  it("collects non-empty descs", () => {
    const raw = { aweme_list: [{ desc: "leg day" }, { desc: "" }, { desc: "recipe" }] };
    expect(extractCaptions(raw)).toEqual(["leg day", "recipe"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/scrapecreators.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/scrapecreators.ts`**

```ts
import type { VideoStat } from "@/lib/creator-metrics";

export interface CreatorProfile {
  followers: number;
  verified: boolean;
  bio: string;
  displayName: string;
  videoCount: number;
}

const BASE = "https://api.scrapecreators.com";

function apiKey(): string {
  const k = process.env.SCRAPECREATORS_API_KEY;
  if (!k) throw new Error("SCRAPECREATORS_API_KEY is not set");
  return k;
}

async function scGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { headers: { "x-api-key": apiKey() } });
  if (!res.ok) throw new Error(`ScrapeCreators ${path} -> HTTP ${res.status}`);
  return res.json();
}

// ---- pure parsers ----
export function parseProfile(raw: any): CreatorProfile {
  const u = raw?.user ?? {};
  const s = raw?.stats ?? {};
  return {
    followers: Number(s.followerCount ?? 0),
    verified: Boolean(u.verified),
    bio: String(u.signature ?? ""),
    displayName: String(u.nickname ?? ""),
    videoCount: Number(s.videoCount ?? 0),
  };
}

export function parseVideos(raw: any): VideoStat[] {
  const list = (raw?.aweme_list ?? []) as any[];
  return list.map((a) => {
    const st = a?.statistics ?? {};
    return {
      playCount: Number(st.play_count ?? 0),
      likeCount: Number(st.digg_count ?? 0),
      commentCount: Number(st.comment_count ?? 0),
      shareCount: Number(st.share_count ?? 0),
      createTime: Number(a?.create_time ?? 0),
      isAd: Boolean(a?.is_ad),
    };
  });
}

export function extractCaptions(raw: any): string[] {
  const list = (raw?.aweme_list ?? []) as any[];
  return list.map((a) => String(a?.desc ?? "")).filter(Boolean);
}

// ---- I/O fetchers (not unit-tested; covered by live smoke) ----
export async function fetchTikTokProfileRaw(handle: string): Promise<any> {
  return scGet(`/v1/tiktok/profile?handle=${encodeURIComponent(handle)}`);
}
export async function fetchTikTokVideosRaw(handle: string): Promise<any> {
  return scGet(`/v3/tiktok/profile/videos?handle=${encodeURIComponent(handle)}`);
}
export async function searchTikTokUsersRaw(query: string, cursor?: number): Promise<any> {
  const c = cursor ? `&cursor=${cursor}` : "";
  return scGet(`/v1/tiktok/search/users?query=${encodeURIComponent(query)}${c}`);
}
```

> Note: parsers use `any` for the raw SC payloads on purpose (defensive parsing of an external API). Keep `eslint-disable` if the linter objects to `any` here.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/scrapecreators.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add src/lib/scrapecreators.ts src/lib/scrapecreators.test.ts
git commit -m "feat: typed ScrapeCreators client with pure parsers" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `creator-enrichment.ts` — buildEnrichmentRow

**Files:**
- Create: `src/lib/creator-enrichment.ts`
- Test: `src/lib/creator-enrichment.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildEnrichmentRow } from "@/lib/creator-enrichment";
import type { VideoStat } from "@/lib/creator-metrics";

const NOW = Date.UTC(2026, 5, 21);
function vid(p: Partial<VideoStat>): VideoStat {
  return { playCount: 22000, likeCount: 1000, commentCount: 100, shareCount: 30, createTime: NOW / 1000 - 86400, isAd: false, ...p };
}

describe("buildEnrichmentRow", () => {
  it("assembles a row with real metrics + quality + enriched status", () => {
    const profile = { followers: 50_000, verified: true, bio: "coach", displayName: "Coach", videoCount: 80 };
    const row = buildEnrichmentRow("coach", profile, [vid({}), vid({ playCount: 24000 })], NOW);
    expect(row.username).toBe("coach");
    expect(row.followers).toBe(50_000);
    expect(row.avg_views).toBeGreaterThan(0);
    expect(row.engagement_rate).toBeGreaterThan(0);
    expect(row.authenticity_score).toBeGreaterThan(0);
    expect(row.quality_status).toBe("ok");
    expect(row.enrichment_status).toBe("enriched");
    expect(row.enriched_at).toBe(new Date(NOW).toISOString());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/creator-enrichment.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/creator-enrichment.ts`**

```ts
import { computeMetrics } from "@/lib/creator-metrics";
import type { VideoStat } from "@/lib/creator-metrics";
import { scoreQuality } from "@/lib/creator-quality";
import type { CreatorProfile } from "@/lib/scrapecreators";

export interface EnrichmentRow {
  username: string;
  display_name: string;
  followers: number;
  bio: string;
  avg_views: number;
  avg_likes: number;
  avg_comments: number;
  avg_shares: number;
  engagement_rate: number;
  engagement_by_follower: number;
  views_per_follower: number;
  posts_analyzed: number;
  last_post_at: string | null;
  post_frequency: number;
  authenticity_score: number;
  quality_status: string;
  enrichment_status: "enriched";
  enriched_at: string;
}

export function buildEnrichmentRow(
  username: string,
  profile: CreatorProfile,
  videos: VideoStat[],
  nowMs: number = Date.now()
): EnrichmentRow {
  const metrics = computeMetrics(profile.followers, videos, { nowMs });
  const quality = scoreQuality(profile.followers, metrics, { nowMs });
  return {
    username,
    display_name: profile.displayName,
    followers: profile.followers,
    bio: profile.bio,
    avg_views: metrics.avgViews,
    avg_likes: metrics.avgLikes,
    avg_comments: metrics.avgComments,
    avg_shares: metrics.avgShares,
    engagement_rate: metrics.engagementRate,
    engagement_by_follower: metrics.engagementByFollower,
    views_per_follower: metrics.viewsPerFollower,
    posts_analyzed: metrics.postsAnalyzed,
    last_post_at: metrics.lastPostAt,
    post_frequency: metrics.postFrequency,
    authenticity_score: quality.authenticityScore,
    quality_status: quality.qualityStatus,
    enrichment_status: "enriched",
    enriched_at: new Date(nowMs).toISOString(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/creator-enrichment.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add src/lib/creator-enrichment.ts src/lib/creator-enrichment.test.ts
git commit -m "feat: assemble enrichment DB row from profile + videos" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `creator-classify.ts` — Claude classification

**Files:**
- Create: `src/lib/creator-classify.ts`
- Test: `src/lib/creator-classify.test.ts`

- [ ] **Step 1: Write the failing test** (prompt builder + parser — pure)

```ts
import { describe, it, expect } from "vitest";
import { buildClassificationPrompt, parseClassification } from "@/lib/creator-classify";

describe("buildClassificationPrompt", () => {
  it("includes bio and captions", () => {
    const p = buildClassificationPrompt({ displayName: "Coach", bio: "fitness coach", captions: ["leg day", "protein"] });
    expect(p).toContain("fitness coach");
    expect(p).toContain("leg day");
    expect(p).toContain("JSON");
  });
});

describe("parseClassification", () => {
  it("parses clean JSON", () => {
    const out = parseClassification('{"primaryNiche":"fitness","niches":["fitness","calisthenics"],"language":"fr","countryCode":"FR","email":"a@b.com","brandSafe":true}');
    expect(out.primaryNiche).toBe("fitness");
    expect(out.niches).toContain("calisthenics");
    expect(out.language).toBe("fr");
    expect(out.countryCode).toBe("FR");
    expect(out.email).toBe("a@b.com");
    expect(out.brandSafe).toBe(true);
  });
  it("parses JSON inside code fences", () => {
    const out = parseClassification('```json\n{"primaryNiche":"food","niches":["food"],"language":"en","countryCode":null,"email":null,"brandSafe":true}\n```');
    expect(out.primaryNiche).toBe("food");
    expect(out.countryCode).toBeNull();
  });
  it("throws on malformed output", () => {
    expect(() => parseClassification("not json at all")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/creator-classify.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/creator-classify.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";

export interface CreatorClassification {
  primaryNiche: string;
  niches: string[];
  language: string; // ISO 639-1
  countryCode: string | null; // ISO 3166-1 alpha-2
  email: string | null;
  brandSafe: boolean;
}

export function buildClassificationPrompt(input: {
  displayName: string;
  bio: string;
  captions: string[];
}): string {
  const captions = input.captions.slice(0, 12).map((c) => `- ${c}`).join("\n");
  return `You classify social-media creators for a brand-partnership database.

Creator display name: ${input.displayName}
Bio: ${input.bio}
Recent video captions:
${captions || "(none)"}

Return ONLY a JSON object, no prose, with this exact shape:
{
  "primaryNiche": string,           // one lowercase word, e.g. "fitness"
  "niches": string[],               // 1-4 lowercase niche tags
  "language": string,               // ISO 639-1 of the creator's content, e.g. "fr"
  "countryCode": string | null,     // ISO 3166-1 alpha-2 if inferable, else null
  "email": string | null,           // contact email if present in bio, else null
  "brandSafe": boolean              // false if adult/hateful/dangerous content
}`;
}

function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("No JSON object in classification output");
  return body.slice(start, end + 1);
}

export function parseClassification(text: string): CreatorClassification {
  const obj = JSON.parse(extractJson(text)) as Record<string, unknown>;
  const primaryNiche = String(obj.primaryNiche ?? "").toLowerCase().trim();
  if (!primaryNiche) throw new Error("classification missing primaryNiche");
  const niches = Array.isArray(obj.niches)
    ? obj.niches.map((n) => String(n).toLowerCase().trim()).filter(Boolean)
    : [primaryNiche];
  return {
    primaryNiche,
    niches: niches.length ? niches : [primaryNiche],
    language: String(obj.language ?? "").toLowerCase().trim() || "unknown",
    countryCode: obj.countryCode ? String(obj.countryCode).toUpperCase().slice(0, 2) : null,
    email: obj.email ? String(obj.email) : null,
    brandSafe: obj.brandSafe !== false,
  };
}

export async function classifyCreator(input: {
  displayName: string;
  bio: string;
  captions: string[];
}): Promise<CreatorClassification> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{ role: "user", content: buildClassificationPrompt(input) }],
  });
  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  return parseClassification(text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/creator-classify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add src/lib/creator-classify.ts src/lib/creator-classify.test.ts
git commit -m "feat: Claude Haiku creator classification (niche/lang/email)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: `niche-tree.ts` — rotating discovery slice

**Files:**
- Modify: `src/lib/niche-tree.ts`
- Test: `src/lib/niche-tree.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { getDailySlice, buildSeedTargets } from "@/lib/niche-tree";

describe("getDailySlice", () => {
  const items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  it("returns a slice of the requested size", () => {
    expect(getDailySlice(items, 0, 3)).toEqual([0, 1, 2]);
    expect(getDailySlice(items, 1, 3)).toEqual([3, 4, 5]);
  });
  it("wraps around deterministically", () => {
    expect(getDailySlice(items, 3, 3)).toEqual([9, 0, 1]);
  });
  it("covers every item across enough days", () => {
    const seen = new Set<number>();
    for (let d = 0; d < 10; d++) getDailySlice(items, d, 3).forEach((x) => seen.add(x));
    expect(seen.size).toBe(items.length);
  });
  it("handles empty / zero size", () => {
    expect(getDailySlice([], 0, 3)).toEqual([]);
    expect(getDailySlice(items, 0, 0)).toEqual([]);
  });
});

describe("buildSeedTargets", () => {
  it("still returns parent + sub targets", () => {
    const t = buildSeedTargets();
    expect(t.length).toBeGreaterThan(100);
    expect(t.find((x) => x.query === "fitness")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/niche-tree.test.ts`
Expected: FAIL — `getDailySlice` not exported.

- [ ] **Step 3: Add `getDailySlice` to `src/lib/niche-tree.ts`** (append at end; leave existing code intact)

```ts
// Deterministic rotating slice so the daily discovery cron covers all targets
// over several days without re-querying everything each run.
export function getDailySlice<T>(items: T[], dayIndex: number, sliceSize: number): T[] {
  if (items.length === 0 || sliceSize <= 0) return [];
  const size = Math.min(sliceSize, items.length);
  const start = ((dayIndex * size) % items.length + items.length) % items.length;
  const out: T[] = [];
  for (let i = 0; i < size; i++) out.push(items[(start + i) % items.length]);
  return out;
}

// Whole-day index in UTC, used to advance the rotating slice each day.
export function dayIndexUTC(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 86_400_000);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/niche-tree.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add src/lib/niche-tree.ts src/lib/niche-tree.test.ts
git commit -m "feat: rotating daily slice for discovery cron" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: `enrich-creators` cron + schedule

**Files:**
- Create: `src/app/api/cron/enrich-creators/route.ts`
- Modify: `vercel.json`

> This route is I/O orchestration over already-tested pure functions; it has no unit test. It is verified by Task 12 (live smoke).

- [ ] **Step 1: Implement `src/app/api/cron/enrich-creators/route.ts`**

```ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchTikTokProfileRaw, fetchTikTokVideosRaw, parseProfile, parseVideos, extractCaptions } from "@/lib/scrapecreators";
import { buildEnrichmentRow } from "@/lib/creator-enrichment";
import { classifyCreator } from "@/lib/creator-classify";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DEFAULT_BUDGET = Number(process.env.ENRICH_BUDGET_PER_RUN ?? 270);

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const budget = Math.min(Math.max(Number(searchParams.get("budget") || DEFAULT_BUDGET), 1), 1000);

  // pending first (enriched_at null), then stalest enriched — single ordering.
  const { data: targets } = await supabaseAdmin
    .from("creators_index")
    .select("username")
    .eq("platform", "TikTok")
    .neq("enrichment_status", "failed")
    .order("enriched_at", { ascending: true, nullsFirst: true })
    .limit(budget);

  let enriched = 0;
  let failed = 0;
  for (const t of targets || []) {
    const username = t.username as string;
    try {
      const [profileRaw, videosRaw] = await Promise.all([
        fetchTikTokProfileRaw(username),
        fetchTikTokVideosRaw(username),
      ]);
      const profile = parseProfile(profileRaw);
      const videos = parseVideos(videosRaw);
      const row = buildEnrichmentRow(username, profile, videos);

      let classMerge: Record<string, unknown> = {};
      try {
        const c = await classifyCreator({ displayName: profile.displayName, bio: profile.bio, captions: extractCaptions(videosRaw) });
        classMerge = {
          primary_niche: c.primaryNiche,
          niches: Array.from(new Set([...c.niches, c.primaryNiche])),
          language: c.language,
          country_code: c.countryCode,
          email: c.email,
        };
      } catch {
        // classification is best-effort; metrics still get saved
      }

      await supabaseAdmin.from("creators_index").upsert({ ...row, ...classMerge }, { onConflict: "username" });
      enriched++;
    } catch {
      await supabaseAdmin
        .from("creators_index")
        .update({ enrichment_status: "failed", enriched_at: new Date().toISOString() })
        .eq("username", username);
      failed++;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  return NextResponse.json({ ok: true, budget, picked: targets?.length || 0, enriched, failed });
}
```

- [ ] **Step 2: Add the cron schedule to `vercel.json`**

In the `"crons"` array, add a 4th entry (runs 04:00, after seed-niches at 03:00):
```json
    {
      "path": "/api/cron/enrich-creators",
      "schedule": "0 4 * * *"
    }
```
And in `"functions"`, add:
```json
    "src/app/api/cron/enrich-creators/route.ts": { "maxDuration": 300 }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in the files you created.

- [ ] **Step 4: Commit**

```
git add src/app/api/cron/enrich-creators/route.ts vercel.json
git commit -m "feat: daily enrich-creators cron (budgeted refresh rotation)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: `normalizeDiscoveryFilters` + rewrite `/api/discovery`

**Files:**
- Create: `src/lib/creator-discovery-filters.ts`
- Test: `src/lib/creator-discovery-filters.test.ts`
- Modify: `src/app/api/discovery/route.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { normalizeDiscoveryFilters, DEFAULT_QUALITY_GATE } from "@/lib/creator-discovery-filters";

const NOW = Date.UTC(2026, 5, 21);

describe("normalizeDiscoveryFilters", () => {
  it("applies the default quality gate and engagement-first sort", () => {
    const f = normalizeDiscoveryFilters({ niche: "fitness", platform: "TikTok" }, NOW);
    expect(f.platform).toBe("TikTok");
    expect(f.nicheTokens).toContain("fitness");
    expect(f.minAuthenticity).toBe(DEFAULT_QUALITY_GATE.minAuthenticity);
    expect(f.excludeStatuses).toEqual(DEFAULT_QUALITY_GATE.excludeStatuses);
    expect(f.sort[0]).toEqual({ column: "engagement_rate", ascending: false });
  });

  it("computes activeSince from activeWithinDays", () => {
    const f = normalizeDiscoveryFilters({ niche: "food", activeWithinDays: 30 }, NOW);
    expect(f.activeSince).toBe(new Date(NOW - 30 * 86400000).toISOString());
  });

  it("honors followers/views/engagement bounds", () => {
    const f = normalizeDiscoveryFilters({ niche: "x", minFollowers: 1000, maxFollowers: 50000, minEngagement: 3, minViews: 5000 }, NOW);
    expect(f.followers).toEqual({ gte: 1000, lte: 50000 });
    expect(f.minEngagement).toBe(3);
    expect(f.minViews).toBe(5000);
  });

  it("includeLowQuality disables the gate", () => {
    const f = normalizeDiscoveryFilters({ niche: "x", includeLowQuality: true }, NOW);
    expect(f.minAuthenticity).toBe(0);
    expect(f.excludeStatuses).toEqual([]);
  });

  it("hasEmail flag", () => {
    expect(normalizeDiscoveryFilters({ niche: "x", hasEmail: true }, NOW).hasEmail).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/creator-discovery-filters.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/creator-discovery-filters.ts`**

```ts
export interface DiscoverySearchParams {
  niche?: string;
  platform?: string;
  minFollowers?: number;
  maxFollowers?: number;
  minEngagement?: number;
  minViews?: number;
  language?: string;
  countryCode?: string;
  activeWithinDays?: number;
  includeLowQuality?: boolean;
  hasEmail?: boolean;
}

export interface QualityGate {
  minAuthenticity: number;
  excludeStatuses: string[];
}

export const DEFAULT_QUALITY_GATE: QualityGate = {
  minAuthenticity: 40,
  excludeStatuses: ["dead", "inflated"],
};

export interface NormalizedFilters {
  platform: string;
  nicheTokens: string[];
  followers: { gte: number; lte: number };
  minEngagement: number;
  minViews: number;
  language?: string;
  countryCode?: string;
  activeSince?: string;
  minAuthenticity: number;
  excludeStatuses: string[];
  hasEmail: boolean;
  sort: Array<{ column: string; ascending: boolean }>;
}

export function normalizeDiscoveryFilters(
  p: DiscoverySearchParams,
  nowMs: number = Date.now()
): NormalizedFilters {
  const platform =
    (p.platform || "TikTok").toLowerCase() === "instagram" ? "Instagram"
    : (p.platform || "TikTok").toLowerCase() === "youtube" ? "YouTube"
    : "TikTok";

  const nicheNorm = String(p.niche || "").toLowerCase().trim();
  const nicheTokens = nicheNorm ? Array.from(new Set(nicheNorm.split(/\s+/).filter(Boolean))) : [];

  const gate = p.includeLowQuality
    ? { minAuthenticity: 0, excludeStatuses: [] as string[] }
    : DEFAULT_QUALITY_GATE;

  return {
    platform,
    nicheTokens,
    followers: { gte: Number(p.minFollowers ?? 0), lte: Number(p.maxFollowers ?? 100_000_000) },
    minEngagement: Number(p.minEngagement ?? 0),
    minViews: Number(p.minViews ?? 0),
    language: p.language ? String(p.language).toLowerCase().trim() : undefined,
    countryCode: p.countryCode ? String(p.countryCode).toUpperCase().slice(0, 2) : undefined,
    activeSince: p.activeWithinDays ? new Date(nowMs - p.activeWithinDays * 86_400_000).toISOString() : undefined,
    minAuthenticity: gate.minAuthenticity,
    excludeStatuses: gate.excludeStatuses,
    hasEmail: Boolean(p.hasEmail),
    sort: [
      { column: "engagement_rate", ascending: false },
      { column: "authenticity_score", ascending: false },
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/creator-discovery-filters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the pure filter module**

```
git add src/lib/creator-discovery-filters.ts src/lib/creator-discovery-filters.test.ts
git commit -m "feat: pure discovery filter normalization + default quality gate" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: Rewrite `src/app/api/discovery/route.ts`** (replace the whole file)

```ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveCreatorCountryCode } from "@/lib/creator-country";
import { normalizeDiscoveryFilters } from "@/lib/creator-discovery-filters";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.niche) return NextResponse.json({ creators: [] });

  const f = normalizeDiscoveryFilters({
    niche: body.niche,
    platform: body.platform,
    minFollowers: body.minFollowers,
    maxFollowers: body.maxFollowers,
    minEngagement: body.minEngagement,
    minViews: body.minViews,
    language: body.language,
    countryCode: body.location,
    activeWithinDays: body.activeWithinDays,
    includeLowQuality: body.includeLowQuality,
    hasEmail: body.hasEmail,
  });

  let q = supabaseAdmin
    .from("creators_index")
    .select("*")
    .eq("platform", f.platform)
    .eq("enrichment_status", "enriched")
    .gte("followers", f.followers.gte)
    .lte("followers", f.followers.lte)
    .gte("engagement_rate", f.minEngagement)
    .gte("avg_views", f.minViews)
    .gte("authenticity_score", f.minAuthenticity);

  if (f.nicheTokens.length) {
    q = q.or(f.nicheTokens.map((w) => `niches.cs.{${w}}`).join(","));
  }
  if (f.language) q = q.eq("language", f.language);
  if (f.countryCode) q = q.eq("country_code", f.countryCode);
  if (f.activeSince) q = q.gte("last_post_at", f.activeSince);
  if (f.hasEmail) q = q.not("email", "is", null);
  for (const s of f.excludeStatuses) q = q.neq("quality_status", s);
  for (const s of f.sort) q = q.order(s.column, { ascending: s.ascending });

  const { data, error } = await q.limit(30);
  if (error) return NextResponse.json({ creators: [], error: error.message });

  const creators = (data || []).map((c) => ({
    username: c.username,
    displayName: c.display_name,
    avatarUrl: c.avatar_url,
    followersCount: c.followers,
    engagementRate: Number(c.engagement_rate),
    engagementByFollower: Number(c.engagement_by_follower ?? 0),
    avgViews: c.avg_views,
    postFrequency: Number(c.post_frequency ?? 0),
    lastPostAt: c.last_post_at,
    authenticityScore: c.authenticity_score,
    qualityStatus: c.quality_status,
    platform: c.platform,
    bio: c.bio,
    email: c.email,
    niche: body.niche,
    primaryNiche: c.primary_niche,
    language: c.language,
    location: c.location,
    countryCode: c.country_code || resolveCreatorCountryCode(c.location, c.language),
    videoThumbnails: c.video_thumbnails || [],
  }));

  return NextResponse.json({ creators, source: "db", count: creators.length });
}
```

> **Behavior change (intended):** discovery now serves **enriched-only** creators with real metrics. The old `estimateEngagement()` and live-scrape fallback (which injected fake-metric creators) are removed. Niches still being indexed return `{ creators: [] }` until the cron fills them.

- [ ] **Step 7: Type-check + full test run**

Run: `npx tsc --noEmit` then `npm test`
Expected: tsc clean for these files; all unit tests PASS.

- [ ] **Step 8: Commit**

```
git add src/app/api/discovery/route.ts
git commit -m "feat: discovery serves enriched-only creators, filters on real data" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: `seed-niches` — rotating slice + mark pending

**Files:**
- Modify: `src/app/api/cron/seed-niches/route.ts`

- [ ] **Step 1: Rotate the targets** — in the `GET` handler, replace the `let targets = buildSeedTargets(); if (only) ...` block with:

```ts
  let targets = buildSeedTargets();
  if (only) {
    targets = targets.filter((t) => t.tags.includes(only));
  } else {
    // Rotate a slice each day so we don't re-query all ~180 niches daily.
    const slice = Math.min(Math.max(Number(searchParams.get("slice") || 40), 1), targets.length);
    targets = getDailySlice(targets, dayIndexUTC(), slice);
  }
```

- [ ] **Step 2: Import the rotation helpers** — add to the existing `niche-tree` import at the top:

```ts
import { buildSeedTargets, getDailySlice, dayIndexUTC } from "@/lib/niche-tree";
```

- [ ] **Step 3: Insert-only upsert so enriched rows are never clobbered** — change the upsert call in `seedTarget` to ignore existing usernames entirely:

```ts
        await supabaseAdmin
          .from("creators_index")
          .upsert(upserts, { onConflict: "username", ignoreDuplicates: true });
```
`ignoreDuplicates: true` inserts brand-new creators and leaves every existing row (including already-enriched ones, their real metrics and `enrichment_status`) untouched. ScrapeCreators search returns no video data, so it must never overwrite precision columns.

- [ ] **Step 4: Remove fake metrics; mark new rows `pending`** — in this file: delete the `estimateEngagement` function and remove the `engagement_rate` and `avg_views` fields from the seed `upserts` object; add `enrichment_status: "pending"`. New creators are thus inserted with null precision columns and `pending`, then filled by the enrich cron. (Discovery only serves `enrichment_status='enriched'`, so pending rows never surface with empty metrics.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```
git add src/app/api/cron/seed-niches/route.ts
git commit -m "feat: seed-niches rotates daily + marks creators pending (no fake metrics)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: Live smoke test (few creators, free credits)

**Files:** none (manual verification). Stay within the ~96 free credits — cap at ~5 creators (~10-15 credits).

- [ ] **Step 1: Put the API key in `.env.local`** (gitignored — never commit)

```
SCRAPECREATORS_API_KEY=<the key>
CRON_SECRET=<any local secret>
```

- [ ] **Step 2: Seed a tiny slice**

Run the dev server (`npm run dev`), then in another shell:
```
curl -H "authorization: Bearer <CRON_SECRET>" "http://localhost:3000/api/cron/seed-niches?only=fitness&pages=1"
```
Expected: JSON `{ ok: true, ... creators: >0 }`. Confirm rows appear in Supabase with `enrichment_status='pending'`.

- [ ] **Step 3: Enrich just a few**

```
curl -H "authorization: Bearer <CRON_SECRET>" "http://localhost:3000/api/cron/enrich-creators?budget=5"
```
Expected: `{ ok: true, enriched: ~5 }`. In Supabase, those rows now have real `avg_views`, `engagement_rate`, `authenticity_score`, `quality_status`, `enrichment_status='enriched'`.

- [ ] **Step 4: Verify filtering on real data**

```
curl -X POST http://localhost:3000/api/discovery -H "content-type: application/json" -d "{\"niche\":\"fitness\",\"platform\":\"TikTok\",\"minEngagement\":2}"
```
Expected: only enriched creators with `engagementRate >= 2`; no `inflated`/`dead`; sorted by engagement. Confirm an inflated big account (if present) does NOT appear unless `includeLowQuality:true` is passed.

- [ ] **Step 5: Record results** in the plan/PR description (counts, a couple of sample rows). No commit (no code changed).

---

## Task 13: Expose new filters in the UI (enhancement)

**Files:**
- Modify: `src/app/dashboard/DiscoveryView.tsx`

> The existing filters (Niche, Platform, Followers, Engagement, Location, Language) already hit real data after Task 10 — no UI change needed for them. This task adds the **new** filters.

- [ ] **Step 1: Read the file and locate the filter controls + the discovery `fetch` call**

Run: open `src/app/dashboard/DiscoveryView.tsx`; find the existing filter `<select>` row (Niche/Plateforme/…) and the `POST /api/discovery` body.

- [ ] **Step 2: Add state for the new filters** (mirror the existing filter state pattern in this file)

Add controlled values for: `minViews` (number), `activeWithinDays` (number | undefined), `includeLowQuality` (boolean), `hasEmail` (boolean).

- [ ] **Step 3: Add them to the request body** — extend the existing `/api/discovery` POST body with:

```ts
  minViews,
  activeWithinDays,
  includeLowQuality,
  hasEmail,
```

- [ ] **Step 4: Add UI controls** following the existing control markup in this file: a "Vues min" number input, an "Actif (jours)" select (7/30/90/tous), a "Qualité vérifiée" toggle bound to `!includeLowQuality`, and an "Avec email" toggle bound to `hasEmail`. Render the new response fields (`authenticityScore`, `lastPostAt`) on the creator card.

- [ ] **Step 5: Verify in the browser** — run `npm run dev`, open the discovery view, exercise each new filter, confirm results change accordingly.

- [ ] **Step 6: Commit**

```
git add src/app/dashboard/DiscoveryView.tsx
git commit -m "feat(ui): expose views/active/quality/email filters in discovery" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (author checklist — completed)

**Spec coverage:**
- §5 data model → Task 2. §7 formulas → Tasks 3-4. Enrichment pipeline §4 → Tasks 5-9. Classification → Task 7. §6 filtering on real data + quality gate + sort → Task 10 (+ existing filters work immediately). Cron budget/rotation §4/§9 → Tasks 8-9, 11. Waves §8 → TikTok path implemented; Instagram/YouTube discovery explicitly deferred (note below). Testing §11 → Tasks 3-10 unit tests + Task 12 smoke. Security §12 → Task 12 Step 1 (.env.local).
- **Known deferral (matches spec waves):** Instagram/YouTube *discovery* is not implemented here — enrichment + filtering are platform-generic but the only discovery source wired is TikTok `search/users`. Wave 2 adds YouTube channel search + Instagram hashtag→author discovery. Flag this in the PR.

**Placeholder scan:** No TBD/TODO; all code steps contain full code. Task 13 intentionally references existing in-file patterns (UI glue in a large existing file) rather than inventing JSX — the engineer reads the file first (Step 1).

**Type consistency:** `VideoStat`, `CreatorMetrics` (creator-metrics.ts) reused by quality/enrichment/scrapecreators; `CreatorProfile` defined in scrapecreators.ts, imported by enrichment; `NormalizedFilters` consumed by the discovery route. Column names match the migration (Task 2) exactly: `avg_views`, `engagement_rate`, `engagement_by_follower`, `views_per_follower`, `authenticity_score`, `quality_status`, `last_post_at`, `enrichment_status`, `enriched_at`, `primary_niche`, `country_code`, `email`.
