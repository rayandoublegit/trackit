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

Creators also have accounts. They get their own simple, mobile-first app
(`src/app/dashboard/creator/CreatorApp.tsx`, dark, four tabs): Home (balance,
code and link, the one gift mission that needs them with a single next-step
button), Missions (accept, sign with the address, confirm the parcel, send the
video), Earnings (payout method), Profile (language, legal, sign out). The brand
workspace (`WorkspaceShell`) is never shown to creators. Local preview:
`/dashboard?as=creator` with the dev bypass (sample data).

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

- **Bilingual, nothing hard-coded.** English at `/…`, French at `/fr/…` (every public
  page, auth and app entry points). Pages under `src/app/fr/` render French on the
  server via `LangProvider` (`src/lib/useLang.ts`); the signed-in app follows the last
  language chosen (localStorage `trackit_lang`, set by browsing /fr or in settings).
  Links: `useLocaleHref()` / `localizeHref()`. Brands are addressed with "vous",
  creators with "tu". French shows euros and fr-FR formats. Mino and the outreach
  generators answer in the user's language (`lang` in the request body). Emails and
  raw server error texts are still English.
- **Legal:** mentions légales / legal notice, CGU-CGV / terms, privacy, cookies in both
  languages (`src/lib/legal-content.ts`, links in `src/lib/legal-links.ts`). Company
  details live in `src/lib/legal-entity.ts`; unknown fields are `null` and hidden.
  Cookie banner (`src/components/CookieConsent.tsx`): Clarity loads only after consent.
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

| | thentrack.it |
| --- | --- |
| Vercel project | `trackit` (team `klayans-projects`) |
| Deploys | automatically on push to `main` of `github.com/rayandoublegit/trackit` |
| AI for Mino | Anthropic (`ANTHROPIC_API_KEY`) |
| Creator scraping source | ScrapeCreators (`SCRAPECREATORS_API_KEY`), RapidAPI (`RAPIDAPI_*`) as fallback |
| Billing | Whop (`WHOP_API_KEY`, webhook secret), legacy Stripe |
| Database | Supabase `tokpuhzjhysqxwjkxfya` |

`/api/ai-chat` uses OpenAI when `OPENAI_API_KEY` is set, otherwise Anthropic.
The scraper uses ScrapeCreators first (TikTok, Instagram, YouTube) and falls back to RapidAPI for TikTok (`SCRAPER_PROVIDER_TIKTOK` swaps the order).

The separate `partnerads` Vercel project (partnerads.vercel.app) was deleted on
2026-09-29; thentrack.it is the only deployment, so crons run once.

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
  - `creators_index`: one row per creator (~17,800 TikTok creators on 2026-09-30),
    current stats and precomputed growth. Unique on `username`, which is the storage
    key: the handle for TikTok, `ig_` + handle for Instagram, `yt_` + handle for
    YouTube. `platform` is lowercase only (`tiktok`, `instagram`, `youtube`) once
    migration 000046 is applied.
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
- Weekly rhythm: every Monday `/api/cron/scrape/weekly-refresh` queues every creator
  and `/api/cron/scrape/weekly-discovery` queues this week's keyword searches
  (niche tree, TikTok + Instagram + YouTube); `/api/cron/scrape` (every 10 minutes)
  drains the queue and costs nothing when it is empty.
- A refresh = 2 API calls (TikTok, Instagram) or 3 (YouTube): profile + latest
  videos; covers and avatars stored permanently, daily snapshots, creator row,
  growth (`refresh_creator_rollup`). Creators brands work with get a second refresh
  each week. Failures back off 1, 2, 4, 8 weeks; "not found" keeps the history.
- Providers: ScrapeCreators (all platforms), RapidAPI (TikTok) as automatic fallback;
  `SCRAPER_PROVIDER_TIKTOK` picks the first. Identity is `(platform, handle)`,
  never a provider id.
- Hard weekly caps: `SCRAPE_WEEKLY_MAX_CREATORS` (20,000),
  `SCRAPE_WEEKLY_MAX_DISCOVERY_KEYWORDS` (150), `SCRAPE_WEEKLY_MAX_NEW_CREATORS` (2,500).
  Cost today: ~35,750 calls/week (~155,500/month); 50k creators on 3 platforms:
  ~108,000/week (~470,000/month). Details in SCRAPING.md.
- **Status (2026-10-01):** migration 000044 applied in production. Migration
  `20261001_000046_creator_platform_normalize.sql` (lowercase platforms, merge of
  duplicate creators, weekly queue functions) is written and tested but **not
  applied yet**: apply it, then deploy the new `vercel.json`. The code works before
  it is applied (it falls back to the older queue function and skips the new columns).

---

## 7. Crons (vercel.json)

| Path | Schedule | What |
| --- | --- | --- |
| `/api/weekly-reminder` | Mondays 09:00 | weekly reminder emails |
| `/api/cron/monthly-payouts` | 1st of month 09:00 | disabled in code (no real transfers) |
| `/api/cron/scrape/weekly-discovery` | Mondays 00:05 | queues the week's keyword searches (no API call) |
| `/api/cron/scrape/weekly-refresh` | Mondays 00:15 | queues every creator due this week (no API call) |
| `/api/cron/scrape?budget=60` | every 10 minutes | queue worker: runs jobs within the weekly caps; idle = no API call |

`/api/cron/seed-niches` (daily niche seeding) and `/api/cron/enrich-creators` still
exist but are no longer scheduled; the weekly discovery and the worker replace them.

---

## 8. Security notes

- 2026-09: production shipped the service-role key to browsers. Fixed; keys rotated
  to the new publishable/secret keys; legacy JWT keys disabled.
- Locked to signed-in users: `/api/catalog` (rows include emails), `/api/ai-chat`
  (AI cost), `/api/creator-profile`, `/api/videos`.
- New data tables are server-only; verified in `npm run test:db`.
- **To do by the owner:** revoke the Supabase personal access token used for
  migrations; remove unused secret keys in Supabase.

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
2. **Scraper**: apply migration 000046 in production, deploy, then watch
   `scrape_runs` (calls per provider, credits) for the first weeks and raise
   `SCRAPE_WEEKLY_MAX_CREATORS` as the base grows.
3. **Instagram and YouTube in the app**: the scraper now fills them (ScrapeCreators);
   the catalog UI still shows YouTube as "Soon". The creator page lookup
   (`src/lib/creator-intel-read.ts`) tries `username` and `ig_` + username; it should
   also try `yt_` + username for YouTube creators.
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
