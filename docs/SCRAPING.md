# Creator data pipeline

How Trackit builds and keeps a large, growing creator database with real history
(follower growth, views over time, every video) without calling a scraping API
when someone opens the app.

## The idea

- **Scrape on a schedule, read from the database.** The catalog, the creator page,
  Mino and the video library only read stored data. Only the cron calls the
  scraping API.
- **Keep history.** Every refresh writes one snapshot per creator per day and one
  per video per day. Growth is a difference between two stored days, never a
  guess.
- **Precompute what we sort on.** After each refresh, `refresh_creator_rollup()`
  writes growth, 30-day views, posts and a growth score onto `creators_index`,
  so "Top scaling" and every sort is a plain indexed query.
- **Refresh by importance.** Fast-growing creators come back daily, big stable
  ones every 2–3 days, small ones every 4, inactive ones weekly. Failures back off.

## Tables (migration `20260930_000044_creator_intelligence.sql`)

| Table | One row per | Used for |
| --- | --- | --- |
| `creators_index` (existing) | creator | current state + precomputed growth (`followers_growth_pct_7d/30d`, `views_30d`, `posts_30d`, `views_gained_7d`, `growth_score`, `history_days`) and scheduling (`scrape_priority`, `next_scrape_at`, `scrape_failures`, `last_scraped_at`) |
| `creator_snapshots` | creator × day | followers, following, total likes, video count, avg views, engagement |
| `creator_videos` | video | caption, hashtags, duration, format, product link, stored cover, latest views/likes/comments/shares/saves, `views_gained_7d` |
| `creator_video_snapshots` | video × day | views, likes, comments, shares |
| `scrape_jobs` | job | the queue: `creator_refresh` (a handle) or `creator_discover` (a keyword); one live job per target |
| `scrape_runs` | cron pass | jobs done/failed, API calls, new creators, videos, errors |

All five new tables are server-only (RLS on, no policies, no grants to `anon` or
`authenticated`). Functions: `enqueue_due_creators(limit)`,
`claim_scrape_jobs(limit, kinds)` (atomic, `for update skip locked`, reclaims jobs
stuck 15 min), `refresh_creator_rollup(platform, username)`.

`npm run test:db` replays all migrations on a real Postgres (PGlite) and checks
the queue, the snapshots, the rollup math and that browsers can't read any of it.

## Code

- `src/lib/scraper/sources.ts`: TikTok sources behind one interface
  (`profile`, `videos`, `search`). ScrapeCreators when `SCRAPECREATORS_API_KEY`
  is set, otherwise the RapidAPI TikTok scraper (`tiktok-scraper7`).
  Adding Instagram or YouTube = one more source object.
- `src/lib/scraper/ingest.ts`: one refresh = 2 API calls (profile + 30 latest
  videos). Stores covers and avatar permanently in Supabase Storage (TikTok CDN
  links expire), upserts the creator, today's snapshots and the videos, runs
  the rollup, sets the next refresh date. `discoverKeyword()` adds new creators
  from a keyword search (1 call).
- `src/lib/scraper/schedule.ts`: priority and refresh interval rules.
- `src/app/api/cron/scrape/route.ts`: the cron.
- Reads: `src/lib/catalog-query.ts` (catalog), `src/lib/creator-intel-read.ts`
  (`/api/creator-profile`, `/api/videos`). They fall back to the existing
  `creators_index` columns and stored top videos when the new tables are empty
  or not migrated yet.

## Running it

1. Apply the migration once (Supabase SQL editor or `supabase db push`).
2. Call the cron with the secret:

   ```
   GET /api/cron/scrape?budget=25
   Authorization: Bearer $CRON_SECRET
   ```

   - `budget` = jobs per pass (env `SCRAPE_BATCH`, max 200). A pass stops
     claiming work after ~250 s and hands leftovers back.
   - `discover=skincare,fitness` searches those keywords for new creators.
   - `seedNiches=3` searches 3 niches of the niche tree, rotating every day.
   - `SCRAPE_CONCURRENCY` (default 3) = parallel refreshes.
3. Schedule it. On Vercel add to `vercel.json`:

   ```json
   { "path": "/api/cron/scrape?budget=60", "schedule": "*/30 * * * *" }
   ```

   Vercel sends the `CRON_SECRET` bearer itself.

## Cost

| Action | API calls |
| --- | --- |
| Refresh one creator | 2 |
| Search one keyword | 1 |

Daily calls ≈ 2 × (creators refreshed per day) + keywords searched.
With the default intervals, a base of N creators needs roughly N / 3 refreshes a
day, so about **0.7 × N calls a day** (e.g. 3,000 creators ≈ 2,000 calls/day,
≈ 60,000/month). Covers are stored once per video, so they cost no further calls.

## Watching it

```sql
-- last runs
select started_at, jobs_done, jobs_failed, api_calls, creators_new, notes->'errors'
from scrape_runs order by started_at desc limit 20;

-- queue
select kind, status, count(*) from scrape_jobs group by 1, 2;

-- coverage: creators with at least a week of history
select count(*) filter (where history_days >= 7) as with_growth, count(*) as total from creators_index;
```

## Growth needs time

Follower growth appears after 7 days of snapshots (30 for the 30-day figures).
Until then "Top scaling" ranks by reach (views vs followers). Weekly video
growth ("Trending now") needs two snapshots a week apart.
