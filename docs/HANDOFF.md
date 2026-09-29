# Trackit — developer handoff

Everything a developer needs to pick up Trackit: what the product is, where it
runs, how it's built, how data flows, what's done, and what's next.
Last updated: 2026-09-30.

Related docs: [SCRAPING.md](SCRAPING.md) (creator data pipeline),
[ADMIN_PLAN.md](ADMIN_PLAN.md) (staff console),
[PARTNERADS_GIFTING_HANDOFF.md](PARTNERADS_GIFTING_HANDOFF.md) (gifting),
[VERIFICATION_2026-09-29.md](VERIFICATION_2026-09-29.md) (last full verification).

---

## 1. The product

**Trackit** (thentrack.it) is a creator affiliate platform for Shopify brands.
It absorbed the earlier PartnerAds product. A brand uses it to:

1. **Find creators**: search a catalog of creators (TikTok today) with real stats,
   growth and videos, or ask Mino in plain language.
2. **Run campaigns**: affiliate links and discount codes, tracked Shopify sales,
   commissions per creator.
3. **Gift products**: contract signed by the creator, parcel tracked, video
   delivered and approved (see the gifting doc).
4. **Pay creators**: commissions owed, payouts, history.
5. **Mino**: the built-in AI assistant (mascot: the blue star `MinoCompanion`).
   Chat, creator search with animated result cards, and simple actions
   (create a meeting or a task, open a page, open a creator's payout, start a campaign).

Creators also have accounts (creator dashboard: analytics, content, community,
brand infos, Pay it / balance).

### Plans

| Plan (code tier) | Monthly | Annual |
| --- | --- | --- |
| Free (`free`) | $0 | — |
| Growth (`basic`) | $49 | $490 |
| Pro (`pro`) | $99 | $990 |
| Scale (`scale`) | $199 | $1,990 |

Gating lives in `src/lib/plan-limits.ts` and `src/lib/plan-marketing.ts`.
Billing: Whop (webhook `src/app/api/whop/webhook`) plus legacy Stripe price ids in env.

### Product rules set by the owner

- **English only, everywhere** (landing, auth, dashboard, admin, emails). `getAppLang()`
  always returns `"en"`; the `fr` branches left in the code are dead.
- **No initials as avatars.** Real photo when there is one, otherwise an icon
  (`src/components/FallbackGlyphs.tsx`, `CreatorAvatar`). Sample people use free
  Unsplash photos (`sample-motion.tsx`).
- **Real icons, never emoji as icons.** Platform marks: `src/components/PlatformLogo.tsx`.
- **Motion and "dopamine" design**: animated heroes, count-ups, cards that drop in,
  dashboards in the style of Shopify / Whoop.
- **Design references**: the landing hero and product film follow Trendtrack's
  first section and Zescale's launch intros; the creator catalog, creator page and
  video library follow Trendtrack (shops page, shop page, ads library).
- **Never fake numbers.** Growth appears only from stored history; sample data is
  labeled as such.
- Mino must not invent sales or campaign figures (the chat has no access to them yet).

---

## 2. Where it runs

| | thentrack.it (main) | partnerads.vercel.app |
| --- | --- | --- |
| Vercel project | `trackit` (team `klayans-projects`) | `partnerads` (team `theolcxlecurieux-4978s-projects`) |
| Deploys | automatically on push to `main` of `github.com/rayandoublegit/trackit` | manually: `npx vercel deploy --prod --yes` from a folder linked to `partnerads` |
| AI for Mino | Anthropic (`ANTHROPIC_API_KEY`) | OpenAI (`OPENAI_API_KEY`, gpt-4o-mini) |
| Creator scraping source | ScrapeCreators (`SCRAPECREATORS_API_KEY`) | RapidAPI (`RAPIDAPI_*`) |
| Database | Supabase `tokpuhzjhysqxwjkxfya` | same Supabase project |

`/api/ai-chat` uses OpenAI when `OPENAI_API_KEY` is set, otherwise Anthropic.
The scraper uses ScrapeCreators when its key is set, otherwise RapidAPI.

**Warning, crons:** both Vercel projects read `vercel.json` and both have a
`CRON_SECRET` and the service key, so **every cron runs twice** if both are
deployed with the same `vercel.json`. The latest cron schedule (scraper) is only
deployed on thentrack.it. Either stop deploying partnerads, or remove its
`CRON_SECRET`, before redeploying it.

### Local development

```bash
npm ci
npx next dev -p 3100
```

`.env.development.local` with `NEXT_PUBLIC_DEV_BYPASS_PLAN=scale` gives a signed-in
preview user (`00000000-0000-0000-0000-000000000000`) without Supabase. Without
Supabase keys, API routes return empty data; the UI still renders.

### Deploy

1. Commit on a branch, merge fast-forward into `main`, push. Vercel deploys thentrack.it.
2. Check: `gh api repos/rayandoublegit/trackit/deployments` (latest status `success`).
3. partnerads only if needed (see the cron warning).

Build check without real keys:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy NEXT_PUBLIC_DEV_BYPASS_PLAN= npx next build
```

Don't commit Next's auto-generated `AGENTS.md` / `CLAUDE.md` or `supabase/.temp`.

---

## 3. Stack and architecture

- Next.js 16 (App Router, Turbopack), React 19, TypeScript.
- Supabase: Postgres, Auth, Storage. Browser uses the publishable key
  (`NEXT_PUBLIC_SUPABASE_ANON_KEY` holds `sb_publishable_…`); server routes use the
  secret key (`SUPABASE_SERVICE_ROLE_KEY` holds `sb_secret_…`). Legacy JWT keys are
  disabled.
- Tests: vitest (`npm test`), and `npm run test:db` which replays every migration
  on a real Postgres in-process (PGlite) and runs end-to-end checks.

### Patterns

- **API auth:** `getAuthedUserId(req)` from `src/lib/api-auth.ts` (cookie session;
  dev bypass locally). Staff routes: `requireAdmin(req)` from `src/lib/admin-auth.ts`.
- **Server DB access:** `getSupabaseAdmin()` from `src/lib/supabase-admin.ts`.
  Tables with personal or business data are server-only (RLS on, no policies).
- **Crons:** `GET` routes under `src/app/api/cron/*` checking
  `Authorization: Bearer $CRON_SECRET`; schedules in `vercel.json`.
- **Dashboard:** one client app at `src/app/dashboard/page.tsx` with views kept
  alive (`KeepAlivePane`); navigation state in `DashboardNavigationProvider`
  (`navigate({ view, creator, … })`, `goBack()`); shell and rail in
  `src/app/dashboard/workspace/WorkspaceShell.tsx`; design tokens `--ws-*` in
  `workspace.css` (light and dark via `data-dashboard-theme`).

---

## 4. Feature map (where things live)

| Area | Main files |
| --- | --- |
| Landing | `src/components/TrackitLanding.tsx`, `src/app/hero-preview/HeroPreviewShell.tsx` (nav), `src/components/ProductFilmHero.tsx` (hero + product film), `src/components/AnnouncementBar.tsx` (Q4 bar) |
| Auth | `src/app/auth/page.tsx`, `src/app/auth/AuthShowcase.tsx` (right-side motion) |
| Home (brand) | `src/app/dashboard/HomeOverviewView.tsx`, `MinoHomeHero.tsx` (Mino first, then "Your program") |
| Mino | `src/app/dashboard/AiChatView.tsx`, `MinoCreatorResults.tsx` (search motion + cards), `src/app/api/ai-chat` (chat + creator search), `src/app/api/ai-command` (actions), `src/lib/mino-search-parse.ts` (plain-language → filters), `src/lib/mino-creator-search.ts`, chats stored in the browser (`src/lib/mino-chats-storage.ts`) |
| Creator catalog | `src/app/dashboard/DiscoveryFeed.tsx`, `CatalogFilterBar.tsx` (presets, platform tabs, filters), `src/app/api/catalog`, `src/lib/catalog-query.ts` |
| Creator page | `src/app/dashboard/CreatorProfilePage.tsx`, `src/app/api/creator-profile`, `src/lib/creator-intel-read.ts` |
| Video library | `src/app/dashboard/VideoLibrary.tsx`, `src/app/api/videos` |
| Saved creators / lists | `MyCreatorsView.tsx`, `SaveCreatorDropdown.tsx`, `/api/saved`, `/api/folders` |
| Campaigns | `CampaignsView.tsx`, `/api/campaigns`, `/api/links`, `/api/affiliate-codes` |
| Gifting | `GiftingView.tsx`, `/api/gifting`, see gifting doc |
| Payouts | `PayoutsView.tsx`, `PayoutsPulse.tsx` (overview), `/api/payouts` |
| Shopify | `/api/shopify/*` (install, callback, orders, sync) |
| Outreach | `OutreachView.tsx`, `/api/outreach`, `/api/generate-outreach` |
| Staff console | `src/app/admin/*`, `src/app/api/admin/*`, see ADMIN_PLAN.md |
| Blog | `src/app/blog`, posts in `src/lib/blog/posts-en.ts` (French posts redirect to English) |

---

## 5. Data model (main tables)

- `profiles` (users; `account_type` brand/creator, `plan`), `workspaces`.
- `creators` (a brand's creators), `creator_links` (creator ↔ brand).
- `campaigns`, `sales` (tracked Shopify orders, commissions), payouts tables.
- `gift_*` (gifting: campaigns, missions, events; bucket `gift-videos`).
- `discovery_saved`, `discovery_folders`, `discovery_folder_items` (saved creators).
- `admin_audit_log`, `user_sessions`, `affiliate_applications`.
- **Creator catalog and intelligence:**
  - `creators_index`: one row per creator (17,636 TikTok creators on 2026-09-30),
    current stats and precomputed growth. Unique on `username`; Instagram rows use an
    `ig_` prefix.
  - `creator_snapshots`, `creator_videos`, `creator_video_snapshots`,
    `scrape_jobs`, `scrape_runs`. See SCRAPING.md.

Migrations: `supabase/migrations/`. A few production tables and `profiles` columns
were created by hand before migrations existed; `scripts/db-verify/00_*.sql` and
`01_*.sql` reproduce them for tests. Exporting the production schema
(`supabase db dump --schema-only`) into a base migration is still a TODO.

---

## 6. Creator data pipeline (short version)

Full details in [SCRAPING.md](SCRAPING.md).

- The app only reads stored data. Only the scraper calls external APIs.
- `/api/cron/scrape` drains a queue: each creator refresh = 2 API calls
  (profile + 30 latest videos), stores covers and avatars permanently, writes daily
  snapshots, updates the creator row and recomputes growth
  (`refresh_creator_rollup`). Keyword discovery adds new creators.
- Refresh rhythm by priority: fast growers daily, big accounts every 2–3 days,
  small ones every 4, inactive ones weekly; failures back off.
- **Status (2026-09-30):** migration applied in production; schedule live on
  thentrack.it: hourly pass of 25 jobs (`5 * * * *`) and a daily discovery pass on
  3 rotating niches (`35 4 * * *`). Growth figures appear after 7 days of snapshots.
- Scaling it up: raise `budget` in `vercel.json` (or `SCRAPE_BATCH`) according to
  the ScrapeCreators / RapidAPI plan. ~0.7 API call per creator per day at steady state.

---

## 7. Crons (vercel.json)

| Path | Schedule | What |
| --- | --- | --- |
| `/api/weekly-reminder` | Mondays 09:00 | weekly reminder emails |
| `/api/cron/monthly-payouts` | 1st of month 09:00 | disabled in code (no real transfers) |
| `/api/cron/seed-niches` | daily 03:00 | old niche seeding (ScrapeCreators) |
| `/api/cron/scrape?budget=25` | hourly at :05 | creator refresh pass |
| `/api/cron/scrape?budget=10&seedNiches=3` | daily 04:35 | discovery pass |

`/api/cron/enrich-creators` still exists but is no longer scheduled; the new
scraper replaces it.

---

## 8. Security notes

- 2026-09: production shipped the service-role key to browsers. Fixed; keys rotated
  to the new publishable/secret keys; legacy JWT keys disabled.
- Locked to signed-in users: `/api/catalog` (rows include emails), `/api/ai-chat`
  (AI cost), `/api/creator-profile`, `/api/videos`.
- New data tables are server-only; verified in `npm run test:db`.
- **To do by the owner:** revoke the Supabase personal access token used for
  migrations; remove unused secret keys in Supabase; check partnerads env.

---

## 9. Testing

```bash
npm test          # unit and route tests (vitest)
npm run test:db   # all migrations on real Postgres + gifting e2e + creator-intel checks
npx tsc --noEmit -p .
npx eslint src    # 8 known errors remain in older files
```

---

## 10. Known gaps and next steps (by priority)

1. **Mino on real data**: give Mino tools to read sales, campaigns and creators
   (Supabase queries), to draft and send outreach with confirmation, and to create
   campaigns. Today it chats, searches creators and opens pages; tasks and meetings
   it creates live only in the browser.
2. **Scraper scale-up**: watch `scrape_runs` for a few days, then raise the budget.
   Consider ordering the first passes by followers or curated creators.
3. **Instagram and YouTube**: add sources in `src/lib/scraper/sources.ts`
   (Instagram via RapidAPI or ScrapeCreators; YouTube via the YouTube Data API,
   needs a Google API key). The catalog UI already has the tabs (YouTube shows "Soon").
4. **Live search on thentrack.it**: Mino's live top-up and Instagram live search use
   RapidAPI, which thentrack.it doesn't have. Add a ScrapeCreators search fallback
   in `src/lib/catalog-query.ts` (`liveCreatorSearch`).
5. **Currency**: the dashboard shows `$` in English without converting; decide
   whether EUR sales should display in EUR.
6. **Signed-in production check**: walk through signup, onboarding, Whop payment,
   Shopify OAuth, emails and video upload with test accounts.
7. **Schema baseline**: dump the production schema into a base migration.
8. **Clean-up**: `src/app/dashboard/DiscoveryView.tsx` is unused; French branches
   are dead code; 8 lint errors in older files.
