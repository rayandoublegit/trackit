# Creator Workspace Implementation Plan

> **For agentic workers:** execute inline (executing-plans), phase by phase, verifying in the browser preview after each phase. TDD for the pure libs; pragmatic for API/UI (matches repo test depth). Steps use checkbox (`- [ ]`).

**Goal:** Click a creator → rich in-app detail drawer (full data + TikTok-embedded videos), save creators, organize into named folders, track an outreach pipeline.

**Architecture:** New Supabase tables (`discovery_saved`, `discovery_folders`, `discovery_folder_items`) + `creators_index.top_videos`. New API routes scoped by `getAuthedUser()`. New UI: `CreatorDetailDrawer`, `MyCreatorsView`, wired into `DiscoveryFeed` + dashboard nav. Videos play via official TikTok embed iframe.

**Tech Stack:** Next.js 16 / React 19 / TS strict, Supabase (service_role + manual user scoping + RLS), Vitest.

**Conventions:** commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branch `feature/creator-workspace`. Don't push without user OK.

---

## File Structure
- Create: `supabase/migrations/20260622_000016_creator_workspace.sql`
- Create: `src/lib/creator-video.ts` (+ `.test.ts`) — pure: `extractVideoId`, `videoEmbedUrl`
- Create: `src/lib/pipeline.ts` (+ `.test.ts`) — pure: stages, labels, colors, helpers
- Modify: `src/lib/scrapecreators.ts` (+ test) — add `parseVideosRich`
- Modify: `src/lib/creator-enrichment.ts` (+ test) — store `top_videos`
- Modify: `scripts/seed-creators-bulk.ts` — pass rich videos into the row
- Create: `src/app/api/creator/[username]/route.ts`
- Create: `src/app/api/saved/route.ts`
- Create: `src/app/api/folders/route.ts`, `src/app/api/folders/items/route.ts`
- Create: `src/app/dashboard/CreatorDetailDrawer.tsx`
- Create: `src/app/dashboard/MyCreatorsView.tsx`
- Modify: `src/app/dashboard/DiscoveryFeed.tsx` — card onClick → drawer; Save button
- Modify: `src/app/dashboard/page.tsx` (+ nav) — register "Mes créateurs" view + render drawer

---

## Phase 0 — Migration

### Task 1: Migration file
**Files:** Create `supabase/migrations/20260622_000016_creator_workspace.sql`
- [ ] Write the exact SQL from the spec §3 (3 tables + `top_videos` + indexes + RLS via drop/create policy). Commit.
- [ ] This file is also what the user runs (bundled with the precision migration). No app code depends on running it locally except the seed/API at runtime.

---

## Phase 1 — Detail drawer + in-app video

### Task 2: `creator-video.ts` (pure, TDD)
**Files:** Create `src/lib/creator-video.ts`, `src/lib/creator-video.test.ts`
- [ ] Test cases:
  - `extractVideoId("https://www.tiktok.com/@sarah.fit/video/7311234567890123456")` → `"7311234567890123456"`
  - `extractVideoId("https://www.tiktok.com/@x/video/123?lang=en")` → `"123"`
  - `extractVideoId("garbage")` → `null`; `extractVideoId(undefined)` → `null`
  - `videoEmbedUrl("73112...")` → `"https://www.tiktok.com/embed/v2/73112..."`
  - `videoEmbedUrl({shareUrl, id})` accepts either; prefers `id`, else extracts from shareUrl; returns `null` if neither yields an id.
- [ ] Implement minimal code. Run `npx vitest run src/lib/creator-video.test.ts` → PASS.

### Task 3: `parseVideosRich` (TDD)
**Files:** Modify `src/lib/scrapecreators.ts`, `src/lib/scrapecreators.test.ts`
- [ ] Add `RichVideo` type: `{ id, cover, shareUrl, playCount, likeCount, commentCount, shareCount, createTime, desc, isAd }`.
- [ ] `parseVideosRich(raw): RichVideo[]` from `aweme_list[]`: `id=aweme_id`, `cover=video.dynamic_cover?.url_list?.[0] ?? video.ai_dynamic_cover?...`, `shareUrl=share_url ?? share_info?.share_url`, stats from `statistics`, `desc`, `createTime=create_time`, `isAd=is_ad`.
- [ ] Test with a small `aweme_list` fixture: returns mapped objects; missing fields default safely; preserves order.
- [ ] Run the test → PASS. (Keep existing `parseVideos` for metrics untouched.)

### Task 4: store `top_videos` in enrichment (TDD)
**Files:** Modify `src/lib/creator-enrichment.ts` (+ test), `scripts/seed-creators-bulk.ts`
- [ ] `buildEnrichmentRow` (or a thin wrapper) accepts optional rich videos and sets `top_videos` = top N (≤9) non-ad, by `playCount` desc, mapped to the `top_videos` jsonb shape (drop `isAd`). If none, `top_videos: []`.
- [ ] Test: given rich videos incl. one `isAd`, row.top_videos excludes ads, length ≤9, sorted by playCount desc.
- [ ] Update seed `enrichAndStore`: compute `const rich = parseVideosRich(vRaw)` and pass into the row builder so seeded creators get `top_videos`.
- [ ] Run tests → PASS.

### Task 5: `GET /api/creator/[username]`
**Files:** Create `src/app/api/creator/[username]/route.ts`
- [ ] `getAuthedUser` (401 if none — keep parity with other routes; detail is gated to logged-in users). Read `creators_index` by `username` (+platform tiktok), return mapped detail incl. `topVideos` (from `top_videos`), all stats, niches, country/lang, email, authenticity, value fields (reuse `creator-value` for valueScore/estCpm/estCostPerPost/valueTier), and `videoThumbnails` fallback.
- [ ] No live ScrapeCreators call here (credit control). If row absent → 404 `{ error: "not found" }`.
- [ ] Manual verify with a seeded username once data exists.

### Task 6: `CreatorDetailDrawer.tsx` + wire feed + embed
**Files:** Create `src/app/dashboard/CreatorDetailDrawer.tsx`; Modify `src/app/dashboard/DiscoveryFeed.tsx`, `src/app/dashboard/page.tsx`
- [ ] Drawer props: `{ creator: FeedCreator | null; plan; onClose; onUpgrade }`. When `creator` set: render panel (right slide-in; fullscreen mobile), show list data immediately, then `fetch('/api/creator/'+username)` to fill `topVideos`/bio.
- [ ] Sections: header (avatar w/ onError→ui-avatars, name, verified, niche pills, country/lang, Renta + Auth), action bar (Save / Folder ▼ / Stage ▼ / Email — wired in later phases; render now, no-op or basic save), stats grid, **analysis** (auth explanation line + last-videos bar chart from topVideos playCount; gate behind `canUseAdvancedAnalytics` with blur+paywall for free), **videos** grid: each thumbnail = `cover` via `/api/img-proxy`; onClick swaps to `<iframe src={videoEmbedUrl(...)} width=... height=... allow="autoplay; encrypted-media" referrerPolicy="strict-origin">`; note textarea (wired phase 2/3).
- [ ] In `DiscoveryFeed`: lift a `selected` state; `FeedCard` gets `onOpen(creator)`; clicking the card body (not the Save button) calls it. Render `<CreatorDetailDrawer .../>` at the feed root.
- [ ] Verify in preview: click card → drawer opens with data; click a video thumbnail → TikTok video plays inline; no navigation away.

---

## Phase 2 — Save + folders

### Task 7: `/api/saved`
**Files:** Create `src/app/api/saved/route.ts`
- [ ] `getAuthedUser` + service_role admin, manual `user_id` scoping.
- [ ] GET → list rows for user (optional `?status=` filter, `?folderId=` join). POST → upsert (onConflict user_id+creator_username) from body snapshot; enforce free limit via `getMaxManagedCreators(plan)` (read plan from profile) → 402/409 with `{ error: "limit" }` when exceeded. PATCH → update `pipeline_status` and/or `notes` (by id, scoped). DELETE → `?username=` (scoped).

### Task 8: `/api/folders` (+ items)
**Files:** Create `src/app/api/folders/route.ts`, `src/app/api/folders/items/route.ts`
- [ ] folders: GET (list w/ item counts), POST (name, color), PATCH (rename/color/position), DELETE (`?id=`). All scoped by user.
- [ ] items: POST `{ folderId, creatorUsername }` (verify folder belongs to user), DELETE `?folderId=&username=`.

### Task 9: Save + folder picker (UI)
**Files:** Modify `CreatorDetailDrawer.tsx`, `DiscoveryFeed.tsx`
- [ ] `db.ts`-style client helpers or inline `fetch`. Save button → POST /api/saved (optimistic), toast/needs-upgrade on limit. Folder dropdown: list folders (GET), "＋ nouveau dossier" inline create, toggle membership (POST/DELETE items). Feed `FeedCard` Save button wired too.

### Task 10: `MyCreatorsView.tsx` + nav
**Files:** Create `src/app/dashboard/MyCreatorsView.tsx`; Modify `src/app/dashboard/page.tsx`
- [ ] Fetch `/api/saved` + `/api/folders`. Folder chips/sidebar (active filter, create/rename/color/delete). List view of saved creators (cards) with stage badge; click → drawer. Gate folders/list to paid where applicable.
- [ ] Register a "Mes créateurs" entry in the dashboard nav + view switch; render the view + a shared drawer instance.
- [ ] Verify in preview: save from feed → appears in Mes créateurs; create folder, add creator, filter by folder.

---

## Phase 3 — Pipeline

### Task 11: `pipeline.ts` (pure, TDD)
**Files:** Create `src/lib/pipeline.ts`, `src/lib/pipeline.test.ts`
- [ ] `PIPELINE_STAGES = [{key:'saved',label:'Sauvegardé',color:'gray'}, {contacted,'Contacté','blue'}, {in_progress,'En cours','amber'}, {nurturing,'En éducation','purple'}, {signed,'Signé','green'}, {lost,'Perdu','red'}]`. Helpers: `stageLabel(key)`, `stageColor(key)`, `isValidStage(key)`, `STAGE_KEYS`.
- [ ] Tests: labels/colors lookup; `isValidStage('signed')=true`, `isValidStage('x')=false`; order preserved. Run → PASS.

### Task 12: Kanban board
**Files:** Modify `MyCreatorsView.tsx`
- [ ] Board view toggle (list ⇄ board). Columns from `PIPELINE_STAGES` (lost collapsible). Cards draggable (HTML5 DnD: dragstart sets username; column ondrop → PATCH /api/saved status, optimistic move). Counts per column. Click card → drawer. Gate board to pro+.
- [ ] Verify in preview: drag a creator across stages → persists (reload keeps stage).

### Task 13: Notes + outreach log
**Files:** Modify `CreatorDetailDrawer.tsx` (+ optional `/api/outreach` reuse)
- [ ] Note textarea → debounce PATCH /api/saved notes. Optional: "Journal de contact" section listing `outreach_history` for this creator (GET existing API) + quick "log a touch" (POST). Keep light.
- [ ] Verify note persists; (optional) outreach entries show.

---

## Final verification
- [ ] `npx vitest run` (all new lib tests green). `npx tsc --noEmit` clean. Build sanity (`npm run build` or preview).
- [ ] Browser pass: feed click → drawer → video plays in-app; save → folder → pipeline drag; free vs paid gating behaves.
- [ ] Summarize; do NOT push without user OK. Provide the bundled migration SQL (precision + workspace) for the user to run.

---

## Self-Review (author)
- Spec coverage: §2 components → Tasks 2–13 (all files mapped); §3 data model → Task 1 + used in 5/7/8; §4 flows → 6 (open/play), 9 (save/folder), 12 (stage), 13 (note); §5 stages → Task 11; §6 gating → 6 (analytics), 7 (save limit), 10/12 (paid). 
- Placeholders: pure libs have explicit test cases + signatures; API contracts specified (verbs, scoping, error shapes); UI tasks specify props, handlers, and the embed iframe attributes. No TBDs.
- Consistency: `top_videos` shape identical in Task 3/4/5/6; `videoEmbedUrl` (Task 2) consumed in Task 6; `PIPELINE_STAGES` keys match `discovery_saved.pipeline_status` default + Task 12 columns; `getAuthedUser` + service_role scoping consistent across Tasks 5/7/8.
