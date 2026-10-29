# Video intelligence

Goal (owner): transcribe every tracked video of every creator, work out why each
video works or doesn't, and do it in a way that holds at 100,000+ creators.

What brands get: on each creator page a block "Pourquoi ses vidéos marchent /
Why their videos work" (a short evidence-based explanation, 3-5 measured
patterns with their lift, the best and weakest videos with their hook and
format, transcripts on demand), hook / format badges on every analysed video,
and video-library filters by hook type, format, CTA, topic and product, sorted
by real performance. Growth and above; Free sees a blurred block and the
upgrade modal.

Code: `src/lib/video-intel/*`, cron `src/app/api/cron/video-intel`, API
`src/app/api/creator-insights` (+ `/api/videos`), UI
`src/app/dashboard/CreatorContentInsights.tsx`, migration
`supabase/migrations/20261029_000053_video_intel.sql`. Every LLM call goes
through `src/lib/llm.ts` (Cheaper Inference gateway first, the Anthropic API
directly only as a fallback).

## Pipeline

```
scraper ingest ──► creator_videos (+ subtitle_url, subtitle_lang, audio_kind)
                         │  enqueue (watermark walk, DB only, every 10 min)
                         ▼
               video_intel_jobs kind=transcript ── transcripts (every 2 min)
                         │     metadata → embedded VTT (free) → ScrapeCreators (paid) → [STT, off]
                         ▼
               creator_video_transcripts ──► video_intel_jobs kind=analyze
                         │  submit (every 10 min): ≤ 5,000 requests → 1 gateway batch (claude-haiku-5.5-batch)
                         ▼                     (or concurrent calls stored in the same pass: VIDEO_INTEL_LLM_MODE=sync)
               anthropic_batches ── collect (every 5 min): poll, read JSON-lines results, validate, upsert
                         ▼
               creator_video_insights (+ performance ratio / band computed in code & SQL)
                         │  ≥ 6 analysed videos, or +25 % since the last one → kind=synthesize
                         ▼
               creator_content_insights (stats in code + 1 batched LLM call for the text)
               video_intel_niche_patterns (SQL, daily)
```

### 1. Transcripts (cheapest first, `transcripts.ts`, one `TranscriptSource` interface)

| Order | Source | Cost | Notes |
| --- | --- | --- | --- |
| 1 | `metadata` | free, no call | not a video → nothing to do; `audio_kind = none` (Instagram `has_audio: false`) → `no_speech` |
| 2 | `embedded-vtt` | free | the WEBVTT caption track already in the payload the scraper fetched, captured at ingest (`creator_videos.subtitle_url`). Parsed by `vtt.ts` (timestamps kept). Signed URLs expire: a 403/404 falls through to the next source |
| 3 | `scrapecreators` | 1 credit per transcript returned, 0 when none | TikTok `GET /v1/tiktok/video/transcript?url=&use_ai_as_fallback=true` (native captions, AI ≤ 120 s at 1 credit); YouTube `GET /v1/youtube/video/transcript?url=` (caption track, `null` at no charge); Instagram `GET /v2/instagram/media/transcript?url=` (AI, only ≤ 120 s: longer needs `allow_long_transcription`, 10 credits per started minute, not used) |
| 4 | `stt:gateway` | ≈ $0.006 / minute (whisper-1) | speech to text on the gateway (`/audio/transcriptions`, `VIDEO_INTEL_STT_MODEL`, default `whisper-1` for timed segments; others: `gpt-4o-mini-transcribe`, `gpt-4o-transcribe`, `elevenlabs-scribe-v2`, `gemini-3.5-transcribe`) from the short-lived media URL the scrape captured (`creator_videos.media_url`: TikTok `play_addr`, Instagram `video_versions`). **Off by default** (`VIDEO_INTEL_STT_DAILY_MAX = 0`), videos ≤ `VIDEO_INTEL_STT_MAX_SECONDS` (180). Verified on a real Instagram reel: 2.6 MB file, 12 timed segments. The answer carries no cost: estimated at $0.006 / min. Behind the `SpeechToTextProvider` interface, so another provider plugs in the same way |

- Credits are counted on the scraper's `CallMeter` (from `credits_charged`) and
  logged per pass in `video_intel_runs` (`stage = transcripts`).
- No speech / music only → stored as `no_speech` (or `unavailable`), never retried.
  The video is still analysed from its caption, hashtags and sound.
- Provider out of credit (HTTP 402) or bad key → the source is paused
  (`video_intel_state` `pause:scrapecreators`, 60 min), jobs needing it go back
  untouched; free sources keep working. The pause clears itself on the next
  successful paid transcript.
- Transient errors retry with backoff (30 min, 1 h, 2 h…); after 4 attempts the
  video gets `unavailable` and moves on to analysis (no retry storm).

**Caption fields verified** (`captions.ts`, tests in `parsing.test.ts`):
- Instagram (RapidAPI instagram-scraper-stable-api, real calls on 2026-10-29):
  no caption track in posts or reels. Present and used: `has_audio`,
  `clips_metadata.audio_type` (`original_sounds` / `licensed_music`).
- TikTok: read from `video.cla_info.caption_infos[]` (app / ScrapeCreators
  aweme: `url`, `url_list`, `language_code`, `caption_format: "webvtt"`,
  `is_auto_generated`), `video.subtitleInfos[]` (web shape: `Url`,
  `LanguageCodeName`, `Format`, `Source` ASR/MT) and flat `subtitles[]`;
  spoken language from `cla_info.original_language_info`; machine
  translations skipped. **Not verified on a live TikTok answer** (no TikTok
  key locally): check one `/v3/tiktok/profile/videos` answer in production
  and adjust `captionTracksOf` if the keys differ. Until then TikTok simply
  falls through to the paid endpoint.
- YouTube: the list endpoints carry no caption track; the paid endpoint is used.
- ScrapeCreators transcript shapes come from their public tutorials
  (docs.scrapecreators.com was unreachable from here): TikTok `transcript`
  (WEBVTT string) + `transcript_with_timestamp` ([{start, end, text}] seconds);
  YouTube `transcript` ([{text, startMs, startTimeText}]) + `transcript_only_text`
  + `language` ("English"); Instagram `transcripts` ([{id, shortcode, text,
  transcript_with_timestamp}]). Optional `cache_max_age` (e.g. `7d`) returns a
  cached answer for 0 credits: `VIDEO_INTEL_SC_CACHE_MAX_AGE`.

### 2. Per-video analysis (`analysis.ts`)

- Model `claude-haiku-5.5` (`LLM_MODEL_FAST`, or `VIDEO_INTEL_ANALYSIS_MODEL`), one
  request per video, id `j<job id>`, shared instructions as the system message
  (identical bytes for every request), JSON mode (plus the JSON schema on the
  batch API), then validated and clamped anyway (`validateAnalysis`): hook,
  hook_type (16 values), format (16), topic, key message, beats, CTA (present +
  10 types), product mention + promotion type (6), tone (9), language, positive /
  negative craft signals. Unknown values → `other` / `none`; lengths capped;
  signals quoting view numbers dropped. The model never sees view counts.
- Transport (`intelLlmClient`, `VIDEO_INTEL_LLM_MODE`):
  - `batch` (default with a gateway key): the gateway batch API, "-batch" models
    only (`claude-haiku-5.5-batch`). Contract checked live on 2026-10-29 (it is not
    in the public docs): `POST /v4/ai/batch/start` `{ requests: [{ type: "text", id,
    modelId, options: { prompt: [{ role, content }], maxOutputTokens, responseFormat } }] }`
    → `{ batchId, status, requestCounts }`; `POST /v4/ai/batch/status { batchId }`;
    `POST /v4/ai/batch/results { batchId }` → JSON lines `{ id, status: "succeeded",
    result: { content: [{ type: "text", text }], finishReason: { unified }, usage:
    { inputTokens: { total }, outputTokens: { total } } } }`. The 1-request test
    batch took ~20-40 min to end. Results carry no cost: priced from tokens.
  - `sync`: concurrent `chat()` calls (`VIDEO_INTEL_SYNC_CONCURRENCY`, 12) inside the
    submit pass (`VIDEO_INTEL_SYNC_BATCH`, 600 per pass), stored at once; falls back
    to the Anthropic API when the gateway fails and `ANTHROPIC_API_KEY` is set.
- Computed in code, never by the model: speaking pace (words / second from
  transcript timing), `performance_ratio = views / creator median views`
  (`creators_index.median_video_views`) and band:
  `viral` (≥ max(100K, 5× median), same rule as `is_viral_video`), `over`
  (≥ 1.5×), `normal` (≥ 0.67×), `under` (≥ 0.33×), `flop`. The same rules live
  in SQL (`video_performance_ratio` / `video_performance_band`); a statement
  trigger on `creator_videos` keeps ratio and band current when a scrape
  changes views (no LLM re-run needed).
- Results: valid → upserted in chunks of 500; invalid JSON or server-side errors
  → retried with backoff (max 4 attempts); a request error or a refusal → failed;
  `expired` / `canceled` → back to the queue, attempt refunded; requests with no
  result → back to the queue. A batch is processed resumably: `results_processed`
  is stored after every chunk, the next pass skips what was done.
- `ANALYSIS_PROMPT_VERSION` bump → older insights are re-queued at priority 8
  (after everything new) by the enqueue.

### 3. Per-creator synthesis (`synthesis.ts`)

- `computeCreatorStats` (code): for each feature (hook type, format, CTA,
  product, tone, pace bucket, length bucket) with ≥ 2 videos: median ratio,
  lift vs the creator's overall median ratio, share of winners (over / viral)
  and losers (under / flop). Strongest patterns = biggest |log lift| × √n.
  Best / worst 3 videos by ratio.
- One call (`claude-sonnet-5.5` = `LLM_MODEL_SMART`, batch: `claude-sonnet-5.5-batch`;
  `VIDEO_INTEL_SYNTHESIS_MODEL`) writes `summary_en`, `summary_fr` and 3-5
  patterns, each citing one stat id.
  Patterns with an unknown id are dropped; any sentence quoting a number that is
  not in the stats is dropped; the numbers shown in the UI always come from the
  stats. If the text fails validation 4 times, the stats-only patterns are stored.
- Queued when a creator has ≥ 6 analysed videos with a band and no synthesis, or
  +3 and +25 % analysed videos since the last one, or the prompt version changed,
  or 30 days passed with new videos (`enqueue_creator_synthesis`).
- Niche level: `refresh_video_intel_niche_patterns(platform)` (daily cron)
  writes, per platform × niche (and `all`), the lift of every hook type / format /
  CTA / product presence (groups of ≥ 30 videos from ≥ 5 creators).

### 4. Queue and scale

**Why `video_intel_jobs` and not new kinds in `scrape_jobs`:** millions of
per-video rows would sit next to ~100k scrape jobs and slow the scraper's claim
and weekly enqueue; this queue keeps one row per (kind, platform, target) for
ever (reset to `queued` when due again, so no growth and natural dedup) and has
a `submitted` state tied to a batch; a stuck AI backlog can never delay creator
refreshes.

- Claim: `claim_video_intel_jobs(kind, n)` — `FOR UPDATE SKIP LOCKED`, ordered by
  priority then `run_after`; jobs left `running` 20 min are taken back.
  `release_video_intel_jobs(ids)` hands jobs back with the attempt refunded.
- Enqueue: `enqueue_video_intel(limit, prompt_version)` walks `creator_videos` by
  `(first_seen_at, platform, video_id)` from a stored watermark (index
  `creator_videos_first_seen_key_idx`): each call only looks at videos it has not
  seen, so its cost does not grow with the base. Rows first seen < 5 min ago wait
  (scrapes still committing are not skipped). Photos / carousels are skipped.
- Priority (same notion as `SCRAPE_TRACKED_INTERVAL_DAYS` in the scraper):
  1 creators brands work with (saved, lists, their creators, gifting wishlist /
  missions), 2 over-performing videos (≥ 1.5× median, viral included),
  3 posted in the last 30 days, 5 the rest, 8 re-analysis after a prompt change.
- Indexes: queue pick (partial on `queued`), batch id, insights by creator,
  ratio, hook type + ratio, format + ratio, CTA, product (partial), topic (GIN
  full text), prompt version. No partitioning: 100k creators × 60 videos = 6M
  rows per table, well within one Postgres table with these indexes; hash
  partitioning by `video_id` becomes worth it past ~50M rows.
- Every stage is idempotent (upserts keyed by video / creator), time-boxed
  (~240 s of a 300 s function) and hands leftovers back.

### 5. Caps and pauses (env)

| Env | Default | What |
| --- | --- | --- |
| `VIDEO_INTEL_ENABLED` | on | `0` stops every stage |
| `VIDEO_INTEL_DAILY_MAX_ANALYSES` | 200,000 | video analyses submitted per UTC day |
| `VIDEO_INTEL_DAILY_MAX_SYNTHESES` | 20,000 | creator syntheses submitted per day |
| `VIDEO_INTEL_DAILY_MAX_USD` | 50 | LLM spend per day: gateway `usage.cost` for calls, token-priced estimates for batch results, speech to text |
| `VIDEO_INTEL_MAX_OPEN_BATCHES` | 4 | batches still processing at once |
| `VIDEO_INTEL_BATCH_SIZE` | 5,000 | requests per batch (API max 100,000 / 256 MB) |
| `VIDEO_INTEL_DAILY_MAX_TRANSCRIPT_CREDITS` | 20,000 | ScrapeCreators transcript credits per day |
| `VIDEO_INTEL_PAID_TRANSCRIPT_MAX_PRIORITY` | 9 (all) | paid transcripts only for jobs at or above this priority (3 = tracked, over-performing, recent) |
| `VIDEO_INTEL_PAID_TRANSCRIPTS` | on | `0`: free sources only |
| `VIDEO_INTEL_TIKTOK_AI_FALLBACK` | on | ScrapeCreators AI transcription when a TikTok video ≤ 120 s has no captions |
| `VIDEO_INTEL_SC_CACHE_MAX_AGE` | — | e.g. `7d`: accept ScrapeCreators cached transcripts at 0 credits |
| `VIDEO_INTEL_TRANSCRIPT_BATCH`, `VIDEO_INTEL_TRANSCRIPT_CONCURRENCY` | 400, 8 | transcript jobs per pass (max 1,000), parallel calls (max 16) |
| `VIDEO_INTEL_LLM_MODE` | `batch` with a gateway key, else `sync` | transport of analyses and syntheses |
| `VIDEO_INTEL_SYNC_CONCURRENCY`, `VIDEO_INTEL_SYNC_BATCH` | 12, 600 | sync mode: parallel calls, requests per pass |
| `VIDEO_INTEL_ANALYSIS_MODEL`, `VIDEO_INTEL_SYNTHESIS_MODEL` | `LLM_MODEL_FAST` (`claude-haiku-5.5`), `LLM_MODEL_SMART` (`claude-sonnet-5.5`) | models ("-batch" added in batch mode) |
| `VIDEO_INTEL_STT_DAILY_MAX` | 0 (off) | speech-to-text calls per day (gateway) |
| `VIDEO_INTEL_STT_MODEL`, `VIDEO_INTEL_STT_MAX_SECONDS` | `whisper-1`, 180 | speech-to-text model, longest video sent |
| `VIDEO_INTEL_PAUSE_MINUTES` | 60 | pause after an out-of-credit answer |
| `CHEAPER_INFERENCE_API_KEY`, `CHEAPER_INFERENCE_BASE_URL` | —, `https://api.cheaperinference.com/v1` | the LLM gateway (lib/llm.ts) |
| `LLM_MODEL_FAST`, `LLM_MODEL_SMART` | `claude-haiku-5.5`, `claude-sonnet-5.5` | model tiers for every LLM caller |
| `ANTHROPIC_API_KEY` | — | optional fallback for `chat()` only |
| `SCRAPECREATORS_API_KEY`, `CRON_SECRET` | | existing |

**LLM provider out of credit** (gateway wallet empty → HTTP 402 / "insufficient
balance"; Anthropic "credit balance is too low" on the fallback): the submitter
pauses (`video_intel_state` `pause:anthropic` — the key name predates the gateway —
60 min, 6 h for a bad key), hands every claimed job back untouched (attempt
refunded) and every pass until the pause ends is a no-op. Once credit is back,
the first pass after the pause sends and clears the pause. Transcripts keep
running meanwhile, so the analysis backlog is ready. Speech to text has its own
pause (`pause:stt`); while it is paused, videos go on with caption-only analysis.

## Crons (vercel.json)

| Path | Schedule | What |
| --- | --- | --- |
| `/api/cron/video-intel?stage=enqueue` | every 10 min | new videos → transcript jobs (DB only; `?limit=20000`) |
| `/api/cron/video-intel?stage=transcripts` | every 2 min (odd minutes) | transcript worker (`?budget=400`) |
| `/api/cron/video-intel?stage=submit` | every 10 min (:04) | one analysis batch, then one synthesis batch (≤ 1,000; sync mode: ≤ 150) |
| `/api/cron/video-intel?stage=collect` | every 5 min (:02) | poll open batches, process ended ones |
| `/api/cron/video-intel?stage=niche` | daily 03:30 UTC | niche pattern table |

All check `Authorization: Bearer $CRON_SECRET`, `maxDuration` 300.

## Cost and throughput

Measured on the gateway (2026-10-29): a realistic analysis call to
`claude-haiku-5.5` (1,472 tokens in, 256 out, JSON mode) cost **$0.00023**
(`usage.cost`). Gateway list prices used for estimates: Haiku 5.5 ≈ $0.10 / $0.50
per M tokens in / out, Sonnet 5.5 ≈ $2 / $10. The batch models' price is not
published and their results carry no cost: the pipeline prices them at half the
list price (the usual batch discount) until the owner confirms the real rate in
the gateway dashboard. ScrapeCreators ≈ $0.002 per credit at the entry price
($10 for 5,000; cheaper on larger plans). whisper-1 ≈ $0.006 per minute.

**Per video analysis**: ≈ 1,500 tokens in, ≈ 250-400 out.
Sync call (measured): **≈ $0.23 per 1,000 videos**. Batch (assumed half):
**≈ $0.12 per 1,000 videos**.

**Per transcript**: 0 for caption tracks, no-speech and "no transcript"
answers; 1 credit (≈ $0.002) when ScrapeCreators returns one. **≈ $2 per 1,000
videos that need a paid transcript.** Speech to text (off by default): ≈ $3 per
1,000 videos of 30 s. Transcripts are the biggest line: the free caption path and
`VIDEO_INTEL_PAID_TRANSCRIPT_MAX_PRIORITY` are the levers.

**Per creator synthesis** (`claude-sonnet-5.5`): ≈ 2,000 tokens in, ≈ 1,000 out
→ ≈ $0.014 sync, ≈ $0.007 batch (assumed); with
`VIDEO_INTEL_SYNTHESIS_MODEL=claude-haiku-5.5` ≈ $0.0007.

**Covering 100,000 creators × 40 videos (4M videos), one-off backlog:**

| Line | Volume | Cost |
| --- | --- | --- |
| Analyses (Haiku 5.5) | 4,000,000 requests | ≈ $480 batch (assumed) / ≈ $920 sync (measured rate) |
| Paid transcripts, if half the videos need one | 2,000,000 credits | ≈ $4,000 at entry price (less on volume plans; ≈ $1,200 if paid transcripts are kept to priorities 1-3) |
| Syntheses (Sonnet 5.5) | 100,000 | ≈ $700 batch / ≈ $1,400 sync (≈ $70 on Haiku) |

**Steady state** (≈ 3 new videos per creator per week = 300,000 videos/week):
analyses ≈ $36-70/week, paid transcripts ≤ $300/week (half paid), syntheses
(refresh after +25 % new videos, ≈ 30,000/week) ≈ $210-420/week on Sonnet.

**Throughput with the defaults:** enqueue 20,000 videos / 10 min (2.9M/day);
transcripts up to 400 / 2 min ≈ 288,000/day (400 jobs ÷ 8 parallel × ~3 s ≈ 150 s
a pass), paid ones capped at 20,000 credits/day ($40); analyses capped at
200,000/day in batches of 5,000 (4 open at most; a batch ends in under an hour
to 24 h). In sync mode: ≈ 600 analyses per 10-minute pass ≈ 86,000/day. The 4M
backlog takes ≈ 20 days at the default analysis cap; raise
`VIDEO_INTEL_DAILY_MAX_ANALYSES` / `_USD` / `_TRANSCRIPT_CREDITS`,
`VIDEO_INTEL_BATCH_SIZE` and `VIDEO_INTEL_MAX_OPEN_BATCHES` to go faster.

## Apply / operate

1. Apply `supabase/migrations/20261029_000053_video_intel.sql` (SQL editor or
   CLI; idempotent). The scraper keeps working before it is applied (the new
   `creator_videos` columns are optional writes).
2. Deploy (crons in `vercel.json`) with `CHEAPER_INFERENCE_API_KEY` set. If the
   gateway wallet is empty, transcripts run and analyses wait (paused); top up
   and they start on the next pass.
3. Watch: `anthropic_batches` (gateway batch ids and `sync-…` passes: status,
   `actual_cost_usd`, tokens),
   `video_intel_runs` (transcript credits per pass), `video_intel_state` (pauses,
   enqueue watermark), `video_intel_jobs` grouped by kind / status.
4. First production check: look at one TikTok video payload for `cla_info` /
   `subtitleInfos` to confirm the free caption path.

## Tests

- `npx vitest run src/lib/video-intel src/app/api/creator-insights`: VTT parsing,
  caption extraction (TikTok app / web / RapidAPI shapes, Instagram real keys),
  analysis request building and validation / clamping, bands, synthesis stats
  and number checks, transcript chain (free first, expired URL, no audio,
  out-of-credit pause, Instagram > 120 s), transcript worker (priority, credit
  cap, backoff), batch submit (priority order, open-batch cap, dollar cap,
  out-of-credit pause and resume), collect (valid / invalid / expired / errored,
  resumable chunks), synthesis end to end, API paywall.
- `npx tsx scripts/db-verify/video-intel.mts` (part of `npm run test:db`): the
  migration statement by statement and re-run, RLS / grants, bands, watermark
  enqueue and priorities, claim / release / stale reclaim, performance trigger,
  synthesis enqueue, prompt-version requeue, niche patterns, library view.

## Limits / next steps

- TikTok caption keys not confirmed on a live payload (see above).
- The gateway batch API is undocumented publicly; its contract was read from the
  live API. If it changes, set `VIDEO_INTEL_LLM_MODE=sync` (verified path).
- Batch prices are assumed at half the list price (no cost in batch results);
  check the gateway dashboard and adjust `modelPrice` in `budget.ts`.
- Speech to text needs the media URL from a recent scrape (signed, expires within
  hours to days): it works on fresh videos (the priority order favours them).
- The synthesis stats are recomputed when results are collected; if new videos
  were analysed in between, sentences quoting changed numbers are dropped.
- Mino does not use insights yet. Simplest next step: when a search names a
  format or hook ("creators whose product reviews over-perform"), read
  `creator_video_insights` (content_format = review, band in over / viral)
  grouped by username and pass the usernames to the catalog query.
- `refresh_video_intel_niche_patterns` reads every insight of a platform; at
  tens of millions of rows run it from `pg_cron` or per niche.
