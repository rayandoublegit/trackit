# Creator data pipeline

How Trackit builds and keeps a large, growing creator database (TikTok,
Instagram, YouTube) with real history (follower growth, views over time,
every video) without calling a scraping API when someone opens the app.

## The idea

- **Scrape on a schedule, read from the database.** The catalog, the creator page,
  Mino and the video library only read stored data. Only the crons call the
  scraping APIs.
- **Weekly rhythm.** Every creator is refreshed once a week (stats + latest
  videos). Once a week, discovery searches the niche tree on TikTok, Instagram
  and YouTube and adds new creators. A worker drains the queue in small batches.
- **Keep history.** Every refresh writes one snapshot per creator per day and one
  per video per day. Growth is a difference between two stored days, never a
  guess.
- **Precompute what we sort on.** After each refresh, `refresh_creator_rollup()`
  writes growth, 30-day views, posts and a growth score onto `creators_index`,
  so "Top scaling" and every sort is a plain indexed query.
- **Hard weekly caps.** Refreshes, searches and new creators per week are capped
  by env; every call is counted in `scrape_runs`.
- **Any provider, same creator.** A creator is `(platform, lower(handle))`, never a
  provider's id. Switching provider (or falling back to the other one) writes
  into the same rows and keeps the history continuous.

## Schedule (vercel.json)

| Cron | When (UTC) | What | API calls |
| --- | --- | --- | --- |
| `/api/cron/scrape/weekly-discovery` | Mondays 00:05 | queues this week's keyword searches (next slice of the niche tree, split across TikTok and YouTube) and the Creator Marketplace walks | none |
| `/api/cron/scrape/instagram-seed?searches=700` | Mondays 00:10 | queues the next 700 Instagram searches not run in 30 days, French first (see "Instagram" below) | none |
| `/api/cron/scrape/weekly-refresh` | Mondays 00:15 | queues every creator due this week (`enqueue_weekly_refresh`) | none |
| `/api/cron/scrape?budget=240` | every 10 minutes | the worker: runs up to 240 queued jobs within the weekly caps | only when jobs are queued |

- The worker costs nothing when the queue is empty: it asks the database to queue
  creators brands work with (database only), sees nothing is ready, and returns
  without any API call and without writing a run row.
- Drain speed: 60 jobs × 6 passes an hour = 360 jobs/hour, 8,640/day. The
  Monday queue of ~17,800 creators is done in about 2 days. For 50,000 creators
  use `budget=150` (and `SCRAPE_CONCURRENCY=6`): ~21,600/day, done in 2.5 days.
- Each pass stops claiming work after ~250 s (Vercel caps functions at 300 s)
  and hands leftovers back.
- The old hourly pass (`budget=25`), the daily discovery pass and the daily
  `seed-niches` cron are no longer scheduled (the routes still exist for manual use;
  `seed-niches` and `enrich-creators` now write lowercase platforms).

### Burst growth (2026-10-09)

Defaults raised for a burst toward 100,000 creators: `SCRAPE_WEEKLY_MAX_NEW_CREATORS`
100,000 (was 12,000), `SCRAPE_WEEKLY_MAX_DISCOVERY_KEYWORDS` 8,000 (was 1,200;
searches and Creator Marketplace pages), `SCRAPE_WEEKLY_MAX_CREATORS` 150,000
(was 65,000), worker `budget=240` and `SCRAPE_CONCURRENCY` 8 (~34,500 jobs a day),
Instagram seed `searches=4000` a week.

- Creator Marketplace walks run one page per walk per pass (216 walks): listing
  rows appear within about a day; every new creator then needs its first refresh
  (2 calls), so full data for 100,000 new TikTok creators takes 3-4 days and
  about 200,000 ScrapeCreators credits.
- The Instagram call caps now count RapidAPI Instagram calls only and apply only
  when RapidAPI is the first Instagram provider: ScrapeCreators Instagram is
  limited by its own credits.
- Lower the env caps when credits run short; a provider out of credits stops
  its platform cleanly.

## When is a creator refreshed

- Every refresh sets `next_scrape_at = now + 7 days`
  (`SCRAPE_REFRESH_INTERVAL_DAYS`). On Monday the weekly enqueue queues every
  creator whose `next_scrape_at` falls within the next 6.5 days, i.e. everyone not
  refreshed in the last 12 hours, whatever day they were scraped last week.
- **Creators a brand works with** (saved, in a list, in a brand's creators, in a
  gifting wishlist or mission) are also re-queued by the worker once their last
  refresh is 3.5 days old (`SCRAPE_TRACKED_INTERVAL_DAYS`, 0 = off), so they get two
  refreshes a week. These are the creators a brand is about to contact, pay or
  send product to: fresher numbers matter there, and they are a few hundred, so
  it costs about +2 calls per tracked creator per week. They go first in the queue.
- `scrape_priority` orders the queue (fast growers first) and sets the rhythm:
  priorities 1-4 (growing, active, 100K+ followers) every 7 days, 6 (smaller
  active accounts) every 14, 8 (no post in 60 days) every 28. That is what lets
  a base of 100,000 creators fit in ~65,000 refreshes a week.
- **Every refresh re-analyses the profile** (`profileAnalysis` in `ingest.ts`):
  language from the language TikTok detected on each video (`desc_language`),
  else from the captions and bio (`lib/creator-language.ts`); country from the
  account region on the videos (`author.region`); niche from the captions,
  hashtags and bio (`lib/creator-niche.ts`), kept only when the content clearly
  backs it (a niche coming from the search keyword alone is cleared); brand
  accounts flagged (`lib/brand-detect.ts`).
- **Failures back off**: a job is retried up to 3 times (30, 60 min later); then
  the creator waits 1, 2, 4, then 8 weeks; after 5 failures in a row it is no
  longer queued. History is never deleted.
- **Renamed or deleted accounts**: the provider answers "not found" → the job fails
  at once (no fallback to the other provider, no retries), `scrape_status =
  'not_found'`, the creator backs off as above and keeps its history. A renamed
  account shows up again as a new creator when discovery finds its new handle
  (we never key on provider ids, so there is no automatic link).

## Creator Marketplace walks (the main source of new creators)

Keyword searches return about 30 accounts each with no next page, so they top
out around 15-20k creators. The TikTok Creator Marketplace listing
(ScrapeCreators `GET /v1/tiktok/creators/popular`, 1 credit per page of 20) lists
real creators (no brand pages) by creator country × follower range × sort, with
the country TikTok has on file, and pages deep (`lib/scraper/marketplace.ts`).

- Monday, `weekly-discovery` queues page 1 of every walk (24 countries × 3
  follower ranges × 3 sorts = 216), French creators first (priority 1), as
  `creator_discover` jobs with the target `market:FR:10K-100K:follower:1`.
- Each page adds the creators we don't know yet (country set, first refresh
  queued) and queues the next page while pages bring new creators (or for the
  first 3 pages), up to `SCRAPE_MARKET_MAX_PAGE`.
- Pages count against `SCRAPE_WEEKLY_MAX_DISCOVERY_KEYWORDS`, new creators
  against `SCRAPE_WEEKLY_MAX_NEW_CREATORS`: ~12,000 new creators a week at most,
  so 100,000 takes about 7-8 weeks from today's base.
- `?market=0` on `weekly-discovery` skips the walks for a week.

## Weekly caps (env)

| Env | Default | Caps |
| --- | --- | --- |
| `SCRAPE_WEEKLY_MAX_CREATORS` | 65,000 | creator refreshes per week (all platforms, tracked ones and first refreshes of new creators included) |
| `SCRAPE_WEEKLY_MAX_DISCOVERY_KEYWORDS` | 1,200 | keyword searches + Creator Marketplace pages per week (all platforms) |
| `SCRAPE_MARKET_MAX_PAGE` | 100 | deepest Creator Marketplace page a walk goes to |
| `SCRAPE_WEEKLY_MAX_NEW_CREATORS` | 12,000 | creators discovery may add per week |
| `SCRAPE_DISCOVERY_MIN_FOLLOWERS` / `_MAX_FOLLOWERS` | 5,000 / 2,000,000 | size of creators discovery adds (hits without a follower count are skipped; on Instagram they are looked at as leads, see "Instagram") |
| `SCRAPE_BATCH`, `SCRAPE_CONCURRENCY` | 60 (the cron passes budget=240, max 300), 8 (max 10) | jobs per worker pass, parallel jobs |
| `SCRAPE_PLATFORMS` | `tiktok,instagram,youtube` | platforms scraped (a platform also needs a provider key) |
| `SCRAPE_INSTAGRAM_MAX_CALLS_PER_WEEK` | 11,000 | Instagram API calls per week, every Instagram provider (sized to the 50,000-request RapidAPI plan) |
| `SCRAPE_INSTAGRAM_MAX_CALLS_PER_30D` | 45,000 | Instagram API calls over the last 30 days, rolling, so no billing month can go over the plan (5,000 left for live searches from the catalog and manual tests) |
| `SCRAPE_INSTAGRAM_REFRESH_INTERVAL_DAYS` | 28 on RapidAPI, else `SCRAPE_REFRESH_INTERVAL_DAYS` | days between two refreshes of an Instagram creator (×2 under 100K followers, ×4 when inactive, like every platform) |
| `SCRAPE_INSTAGRAM_LEADS_PER_REFRESH` | 15 | accounts seen next to a refreshed Instagram creator queued to be looked at (0 = no snowball) |
| `SCRAPE_INSTAGRAM_REELS` | on | `0`: no reels call (2 calls a refresh instead of 3, but no views on Instagram) |
| `SCRAPE_INSTAGRAM_SIMILAR` | off | `1`: also ask for similar accounts after each refresh (+1 call; the endpoint answered "not found" for every account tested) |
| `SCRAPE_INSTAGRAM_SEARCHES_PER_WEEK` | 700 | searches `instagram-seed` queues when called without `?searches=` |

Instagram searches and hashtags do not count against
`SCRAPE_WEEKLY_MAX_DISCOVERY_KEYWORDS` (TikTok and YouTube keep the whole shared
cap): they are bounded by the Instagram call caps. Before an Instagram job runs,
the worker reserves the calls it may spend (3 for a refresh, 1 for a search);
when they are not left, the job goes back to the queue until next Monday (week
cap) or tomorrow (30-day cap), untouched.

A week starts Monday 00:00 UTC. The worker reads this week's usage back from
`scrape_runs` before claiming, so the caps hold across every pass. When the
refresh cap is reached, the remaining jobs wait in the queue for next week
(lowest priority last). **Raise `SCRAPE_WEEKLY_MAX_CREATORS` as the base grows**,
otherwise the tail of the base is refreshed every other week.

## Providers

| Platform | Providers (order) | One refresh | Search |
| --- | --- | --- | --- |
| TikTok | ScrapeCreators, then RapidAPI `tiktok-scraper7` (`SCRAPER_PROVIDER_TIKTOK=scrapecreators\|rapidapi` picks the first) | 2 calls: `/v1/tiktok/profile` + `/v3/tiktok/profile/videos` (RapidAPI: `/user/info` + `/user/posts`) | `/v1/tiktok/search/users` (RapidAPI `/user/search`) |
| Instagram | ScrapeCreators, then RapidAPI "Instagram Scraper Stable API" (`SCRAPER_PROVIDER_INSTAGRAM=rapidapi` puts it first; with no ScrapeCreators key it is the only one) | ScrapeCreators 2 calls: `/v1/instagram/profile` + `/v2/instagram/user/posts` (12 latest posts). RapidAPI 3 calls: `POST /ig_get_fb_profile.php` + `POST /get_ig_user_posts.php` (up to 24 latest posts) + `POST /get_ig_user_reels.php` (play counts) | ScrapeCreators `/v1/instagram/search/profiles` (follower counts for the first 10 hits); RapidAPI `POST /search_ig.php` (~5 accounts, follower count as text and often missing) |
| YouTube | ScrapeCreators | 3 calls: `/v1/youtube/channel` + `/v1/youtube/channel-videos?sort=latest` + `/v1/youtube/channel/shorts?sort=newest` | `/v1/youtube/search?type=channels` |

- ScrapeCreators charges **1 credit per call** for every endpoint above
  (`credits_charged` in each response, recorded in `scrape_runs.notes.credits`).
  HTTP 402 = out of credits, 404 = not found.
- **Automatic fallback**: a provider answering "no credits" or "bad key" is
  skipped for 15 minutes and the next one is tried; server errors, timeouts and
  rate limits fall through to the next one for that call. "Not found" is an
  answer, not a failure (no fallback). When every provider of a platform is out
  of credits, the worker stops the pass and hands the jobs back untouched.
- Every provider returns the same `ScrapedProfile` / `ScrapedVideo`: same video
  ids, canonical links (`tiktok.com/@handle/video/id`, `instagram.com/p/code/`,
  `youtube.com/shorts/id` or `watch?v=id`), durations in seconds. Tests parse the
  same creator from both TikTok providers and check the stored rows are identical.
- Video `format`: `short` (TikTok videos, Instagram reels/videos, YouTube Shorts),
  `long` (YouTube videos), `photo`, `carousel`. `product_url` when the post exposes
  one (TikTok anchors, Instagram product tags); the profile's store/bio link is
  `creators_index.bio_link`.
- Not available from the list endpoints: Instagram saves, YouTube likes/comments on
  long videos (the per-video endpoint would cost 1 call per video), YouTube shares.

## Instagram (RapidAPI "Instagram Scraper Stable API")

Host `instagram-scraper-stable-api.p.rapidapi.com`, key `RAPIDAPI_INSTAGRAM_KEY`
(else `RAPIDAPI_KEY`), read from env only. Plan seen on 2026-10-09: 50,000
requests a month (`X-RateLimit-Requests-Limit`). Code:
`src/lib/scraper/sources-instagram-rapid.ts`.

**One refresh = 3 calls** (profile, latest posts, reels). The posts endpoint has
captions, dates, likes, comments, media type, covers, paid-partnership flag,
product tags, tagged people and co-authors, but **no view count** (`view_count`
null, no `play_count`). The reels endpoint has the play counts (but no caption or
date), so the worker merges them into the video posts by shortcode. Views drive
avg views, reach and "viral", so the third call is worth it; an account with no
video post skips it (2 calls); `SCRAPE_INSTAGRAM_REELS=0` drops it everywhere.

Same rows as ScrapeCreators: the posts and the profile are Instagram's own
objects, read by the same parsers (`sources-instagram.ts`): video id = shortcode,
link `https://www.instagram.com/p/<code>/`, key `ig_` + handle. Tests parse
mia.style from both providers and compare.

| Field | RapidAPI Instagram | vs TikTok |
| --- | --- | --- |
| followers, following, posts count, verified, bio, bio link, category, avatar (HD) | yes | same |
| public e-mail | `email_from_biography`, else an address in the bio → `creators_index.email` (never cleared) | TikTok: address in the bio only |
| private account | `is_private`: a lead is skipped, a stored creator backs off like "not found" | n/a |
| per post: caption, hashtags, date, likes, comments, type (reel/photo/carousel), cover, ad flag, product link | yes | same |
| per post: views | reels only, from the reels call | every video |
| shares, saves | no | yes |
| video length | no (not in the posts answer) | yes |
| total likes, language and country from the platform | no (language/niche are read from captions and bio) | yes |

Errors come back as HTTP 200 with `{ "error" }` or `{ "message" }`:
"…does not exist on Instagram" = not found; "Please try again later", "data not
found. Please try again later", "Received 429" = busy (`rate_limited`, the next
provider is tried); "Endpoint … does not exist" = our bug (`bad_response`);
"exceeded the MONTHLY quota" = out of credits (the provider is skipped for 15
minutes and the worker stops when no Instagram provider is left).

### Discovery (how the base grows past what search gives)

Instagram search returns ~5 accounts per query and most come without a follower
count, so search alone cannot reach 20,000. Discovery is a snowball:

1. **Searches** (`instagram-seed`, 1 call each): 4,182 queries built from the
   niche tree (`instagramSearchQueries` in `discovery-plan.ts`): the French niche
   queries, every sub-niche × France / Paris / Lyon / Marseille / influenceuse /
   blogueuse / créateur, then the English queries, then sub-niches × Belgium,
   Switzerland, Quebec, UK, USA, Germany, Spain, Italy. French first, 700 a week,
   each one searched at most once per 30 days. Hits with a follower count in the
   range are added (light row + first refresh, like TikTok); hits without one are
   queued as **leads**.
2. **Snowball** (no extra call): every Instagram refresh queues up to 15 accounts
   seen next to the creator (co-authors of collab posts first, then @mentions in
   the bio, tagged people, @mentions in captions) as leads. French creators' leads
   go first (priority 4, others 5).
3. **Leads** are `creator_refresh` jobs on keys not in the catalog. The worker
   runs them through a gate: the profile call first (1 call); only accounts with
   5,000 to 2,000,000 followers (`SCRAPE_DISCOVERY_MIN/MAX_FOLLOWERS`), public, and
   not a brand (`detectBrand` on name, bio, link and category) go on to the posts
   and reels calls and are stored. Others stop there: the job is `done` with the
   reason in `last_error`, nothing is written, `notes.skipped` counts them, and the
   same handle is not looked at again for 30 days. Kept leads count as new
   creators (`SCRAPE_WEEKLY_MAX_NEW_CREATORS`).
4. Optional, off by default because they failed in every test on 2026-10-09:
   similar accounts (`SCRAPE_INSTAGRAM_SIMILAR=1`, +1 call per refresh) and
   hashtag posts (`instagram-seed?hashtags=200`, 1 call per hashtag). Both are
   parsed generically and their answers become leads when they work.

Manual backfill (with `Authorization: Bearer $CRON_SECRET`):

```
GET /api/cron/scrape/instagram-seed?searches=2000                 # queue 2,000 searches now
GET /api/cron/scrape/instagram-seed?searches=0&handles=a,b,c     # look at these accounts
GET /api/cron/scrape/instagram-seed?searches=0&refreshStored=5000 # first refresh of stored IG rows never scraped
```

The worker then spends at most the Instagram caps; anything queued beyond them
waits for the next week.

### The math: 20,000 Instagram creators

Per creator kept: 3 calls (first refresh). Per lead left out: 1 call. Per search:
1 call for ~1-2 accounts added and ~3 leads. With 40 % of leads kept (to be
measured: `notes.discovered` vs `notes.skipped`), a new creator costs about
**4.5 calls**: 20,000 creators ≈ 60,000 calls of first refreshes + ~30,000 calls
of leads left out + ~5,000 searches ≈ **95,000 calls**.

On the current plan (50,000 a month; caps 11,000 a week / 45,000 per 30 days,
≈ 10,400 a week usable) about 2,300 new creators a week:

| Re-refresh of the Instagram base while it grows | Weeks to 20,000 |
| --- | --- |
| none (`SCRAPE_INSTAGRAM_REFRESH_INTERVAL_DAYS=56` keeps it close: ~12 weeks) | ~9 |
| every 28 days (default on RapidAPI) | ~21: at 20,000 creators the refreshes alone use ~9,200 calls a week |
| weekly (7 days) | never: the base stalls around 5,000 (5,000 × 3 calls ≈ 15,000 a week) |

So on the 50,000 plan 20,000 creators can be reached, but not kept fresh: at
steady state the plan refreshes ~22,000 creators every 28 days at most and adds
nobody. To have **20,000 creators in ~2 weeks and refresh them weekly**:

- growth: ~95,000 calls in 2 weeks ≈ 48,000 a week;
- weekly refresh: 20,000 × 3 = 60,000 calls a week ≈ **260,000 a month**
  (≈ 175,000 with `SCRAPE_INSTAGRAM_REELS=0`, without views), plus discovery to
  keep growing.

That is a plan of ~300,000 requests a month. After upgrading, raise
`SCRAPE_INSTAGRAM_MAX_CALLS_PER_WEEK` (e.g. 70,000), `SCRAPE_INSTAGRAM_MAX_CALLS_PER_30D`
(plan − 5 %), set `SCRAPE_INSTAGRAM_REFRESH_INTERVAL_DAYS=7`, raise
`SCRAPE_WEEKLY_MAX_CREATORS` by the Instagram base and call `instagram-seed` with
more searches. The worker (150 jobs every 10 minutes) drains ~21,000 jobs a day,
so the pipeline itself is not the limit.

## Live lookup of one creator (search bars)

`/api/creators/lookup?q=<@handle | profile link>&platform=<tiktok|instagram|youtube|auto>`
(`src/lib/creator-live-lookup.ts`, `creator-live-lookup-server.ts`) is the only
user-triggered scraping call. Used by the catalog search (an `@handle` or a link
is looked up at once; a bare word when the catalog finds nobody, else a button)
and the top search bar ("Find @x" opens the creator page).

- Stored and refreshed in the last 3 days: answered from `creators_index`, no call.
- Otherwise one `refreshCreator` (same cost as a refresh: 2-3 calls), without the
  discovery gate (any size, brands stored and flagged); private accounts are
  reported, not stored. `auto` tries the link's platform, else the catalog tab,
  else TikTok then Instagram (a handle already stored on one platform is that one).
- Paid plans only; `CREATOR_LOOKUP_MAX_PER_HOUR` (default 20) live lookups per
  workspace per hour; concurrent lookups of one creator share one refresh; answer
  within 25 s (the refresh may finish after). Each live lookup writes a
  `scrape_runs` row (`trigger = 'lookup:<owner id>'`, `notes.callsByProvider`), so
  Instagram lookups count against the Instagram call caps; they do not count as
  worker refresh jobs or discovered creators.

## Identity and storage keys

A creator is `(platform, lower(handle))`. `creators_index.username` (unique) is
the storage key: the handle for TikTok, `ig_` + handle for Instagram, `yt_` +
handle for YouTube (`src/lib/scraper/identity.ts`). `creator_snapshots`,
`creator_videos`, `scrape_jobs` use the same `(platform, key)`. Older Instagram
rows stored without the prefix are still refreshed in place.

Platform is stored **lowercase only** (`tiktok`, `instagram`, `youtube`) since
migration `20261001_000046_creator_platform_normalize.sql`: triggers lowercase
what old code sends, CHECK constraints refuse the rest.

## Tables

| Table | One row per | Used for |
| --- | --- | --- |
| `creators_index` | creator | current state + precomputed growth and scheduling (`scrape_priority`, `next_scrape_at`, `scrape_failures`, `scrape_status`, `last_scraped_at`) |
| `creator_snapshots` | creator × day | followers, following, total likes, video count, avg views, engagement |
| `creator_videos` | video | caption, hashtags, duration, `media_type`, `format`, product link, stored cover, latest views/likes/comments/shares/saves, `views_gained_7d` |
| `creator_video_snapshots` | video × day | views, likes, comments, shares |
| `scrape_jobs` | job | the queue: `creator_refresh` (a key) or `creator_discover` (a keyword), one live job per target; finished jobs older than 30 days are pruned weekly |
| `scrape_runs` | cron pass | jobs, API calls, `notes.callsByProvider`, `notes.credits`, `notes.refreshJobs` / `discoverJobs` / `discovered` (the weekly caps read these), errors |

All server-only (RLS on, no policies). Functions: `enqueue_weekly_refresh(limit,
horizon, platforms)`, `enqueue_tracked_creators(limit, min_age, platforms)`,
`claim_scrape_jobs(limit, kinds)`, `refresh_creator_rollup(platform, key)`,
`enqueue_due_creators(limit)` (older, kept).

## Code

- `src/lib/scraper/types.ts`: shared shapes, `CreatorSource`, `CallMeter`.
- `src/lib/scraper/identity.ts`: platform and key rules.
- `src/lib/scraper/http.ts`: provider calls, error classes (`not_found`, `no_credits`…).
- `src/lib/scraper/sources.ts` (TikTok + provider choice and fallback),
  `sources-instagram.ts`, `sources-instagram-rapid.ts`, `sources-youtube.ts`:
  parsers are pure and tested (`instagram.test.ts` for the RapidAPI Instagram source,
  gate, caps and backlog).
- `src/lib/scraper/ingest.ts`: `refreshCreator` (covers and avatar stored in
  Supabase Storage once, snapshots, videos, rollup, next date), `discoverKeyword`
  (adds new creators and queues their first refresh), `queueInstagramLeads`,
  `recordCreatorFailure`. `instagram-seed.ts`: the Instagram backlog.
- `src/lib/scraper/worker.ts`: the queue worker; `budget.ts`: weekly caps and Instagram call caps;
  `discovery-plan.ts`: weekly keyword rotation; `schedule.ts`: intervals and back-off.
- Routes: `src/app/api/cron/scrape/route.ts` (worker),
  `scrape/weekly-refresh/route.ts`, `scrape/weekly-discovery/route.ts`,
  `scrape/instagram-seed/route.ts`.

Manual runs (with `Authorization: Bearer $CRON_SECRET`):

```
GET /api/cron/scrape/weekly-discovery?discover=protein bars,matcha&platforms=tiktok,instagram
GET /api/cron/scrape/weekly-refresh
GET /api/cron/scrape?budget=100
```

## Cost

| Action | API calls (= ScrapeCreators credits) |
| --- | --- |
| Refresh one TikTok or Instagram (ScrapeCreators) creator | 2 |
| Refresh one Instagram creator on RapidAPI, or one YouTube creator | 3 |
| Look at one Instagram lead that is left out | 1 |
| Search one keyword (any platform) | 1 |
| Worker pass with an empty queue | 0 |

Calls per week ≈ 2 × (TikTok + Instagram creators) + 3 × YouTube creators
+ 2 × tracked creators (their second weekly refresh) + keyword searches.
A month is 4.35 weeks.

| Base | Calls / week | Calls / month |
| --- | --- | --- |
| Today: 17,800 TikTok creators + 150 searches | 17,800 × 2 + 150 = **35,750** | **≈ 155,500** |
| Default caps fully used (65,000 refreshes, mostly TikTok, + 1,200 searches/pages) | ≈ 131,200 | ≈ 571,000 |
| 100,000 creators at the tiered rhythm (≈40% weekly, 45% every 2 weeks, 15% every 4) | ≈ 133,000 | ≈ 578,000 |
| Target: 50,000 creators (30k TikTok, 12k Instagram, 8k YouTube) + 150 searches | 60,000 + 24,000 + 24,000 + 150 = **108,150** | **≈ 470,300** |

Add 2 calls per week for each creator brands are tracking (e.g. 500 tracked →
+1,000/week). For the target base set `SCRAPE_WEEKLY_MAX_CREATORS=52000` and the
worker to `budget=150`. Covers and avatars are stored once, so they cost no
further calls.

For comparison, the previous schedule (hourly pass of 25 + daily discovery +
daily `seed-niches`) made about 1,240 calls a day (≈ 37,800/month) but reached each
creator only about once a month.

## Watching it

```sql
-- last busy worker passes (idle passes write nothing)
select started_at, trigger, jobs_done, jobs_failed, api_calls,
       notes->'callsByProvider' as by_provider, notes->'credits' as credits,
       creators_new, notes->'errors' as errors
from scrape_runs order by started_at desc limit 20;

-- this week's usage against the caps
select sum((notes->>'refreshJobs')::int) as refreshes, sum((notes->>'discoverJobs')::int) as searches,
       sum((notes->>'discovered')::int) as new_creators, sum(api_calls) as calls
from scrape_runs where started_at >= date_trunc('week', now());

-- queue
select kind, platform, status, count(*) from scrape_jobs group by 1, 2, 3 order by 1, 2, 3;

-- base per platform, and accounts that disappeared
select platform, count(*), count(*) filter (where scrape_status = 'not_found') as not_found
from creators_index group by 1;
```

## Growth needs time

Follower growth appears after 7 days of snapshots (30 for the 30-day figures).
With a weekly rhythm a creator has one snapshot a week (two if a brand tracks it).
The "7-day" growth compares with the latest snapshot at least 7 days old, so it
appears from the second or third week and may span 7 to 13 days depending on the
day each refresh ran (the Monday queue takes about two days to drain). The number
is always a real difference between two stored days, never extrapolated.
Until then "Top scaling" ranks by reach (views vs followers).

## Catalog and video library filters

Migration `20261002_000047_catalog_video_filters.sql` adds per-creator video stats
on `creators_index` (`videos_tracked`, `median_video_views`, `max_video_views`,
`viral_videos`, `last_viral_at`), kept up to date by triggers on `creator_videos`
(one refresh per creator per statement, no scraper change), `creator_videos.product_url`
and `format`, and the server-only view `creator_video_library` (videos + creator
niche, country, language, `is_viral`, `has_product`). Every platform comparison
is case-insensitive, so it works before and after 000046. Until 000047 is applied
the app keeps working: the viral filter matches nobody and the viral sort falls
back to views; everything else works.

**Viral video** (`src/lib/viral.ts` = SQL `is_viral_video`): views ≥ max(100,000,
5 × the creator's median views). The median needs 3 videos with views: tracked
videos, else `avg_views` when 3+ posts were analyzed (then the stored top videos
are judged). Unknown median = not viral; a creator with nothing measured has
`viral_videos = null`, not 0.

| Creator filter | Column |
| --- | --- |
| Followers | `followers` |
| Avg views | `avg_views` (median of the latest posts), only when `posts_analyzed > 0` (seeded rows hold estimates) |
| Engagement | `engagement_rate`, percent: (likes + comments + shares) / views |
| Reach | `views_per_follower` = avg views / followers (1 = 100 %) |
| Avg likes / comments / shares | `avg_likes` / `avg_comments` / `avg_shares` |
| Viral video | `viral_videos > 0`; sort "Biggest video" = `max_video_views` |
| Country | `country_code`, or no country and the country's language (FR, DE, IT, ES, PT, BR; English-speaking countries need a known country) |
| Last post | `last_post_at` |

| Video filter | Column (view `creator_video_library`) |
| --- | --- |
| Views | `views` |
| Niche | creator niche tags, or the video's hashtags |
| Published | `posted_at`: last N days and/or a from–to range (UTC days, inclusive) |
| Format | `media_type` (video / photo = any image post / carousel), `format` (short / long) |
| Length | `duration_seconds`, videos only |
| Product | `has_product` = `has_product_link` or an http(s) `product_url`; the link shows on the card |
| Viral | `is_viral` |

A filter on a value a creator or video does not have excludes it; nothing else
does. With no tracked video matching, the library falls back to the stored top
videos of untracked creators (views, date, caption and viral filters apply);
format, length and product filters then return nothing and say tracking is needed.
`npm run test:db` (`scripts/db-verify/catalog-filters.mts`) runs the app's own
query code against Postgres for every filter and sort, with and without 000046/000047.
