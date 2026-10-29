import type { ProviderError } from "@/lib/scraper/http";
import { CallMeter } from "@/lib/scraper/types";
import { LlmError, batchModel, batchResults, batchStatus, chat, gatewayConfigured, llmConfigured, startBatch, type ChatMessage } from "@/lib/llm";
import { ANALYSIS_PROMPT_VERSION, analysisModel, analysisRequest, extractJson, insightColumns, validateAnalysis } from "./analysis";
import { PAUSE_LLM, PAUSE_TRANSCRIPTS, classifyLlmError, dayStart, estimateRequestCost, intelCaps, isPaused, pause, usageCost } from "./budget";
import { performanceBand, performanceRatio } from "./performance";
import { videoKey, type BatchRow, type InsightUpsert, type IntelStore, type JobUpdate } from "./store";
import { SYNTHESIS_MIN_VIDEOS, SYNTHESIS_PROMPT_VERSION, computeCreatorStats, synthesisModel, synthesisRequest, validateSynthesis } from "./synthesis";
import { TranscriptDeferred, defaultTranscriptSources, fetchTranscript, gatewaySpeechToText, unavailable, type SttBudget, type TranscriptSource } from "./transcripts";
import type { IntelJob, IntelLlmRequest, IntelLlmResult, IntelPlatform, Transcript } from "./types";

// The video intelligence pipeline, one function per cron stage. Every stage
// claims work with FOR UPDATE SKIP LOCKED (overlapping passes are safe), is
// idempotent (upserts keyed by video / creator), stops claiming after its
// time budget and hands leftovers back, and respects the daily caps.
//
//   enqueue      new videos → transcript jobs (database only)
//   transcripts  transcript jobs → creator_video_transcripts, then an analyze job
//   submit       analyze / synthesize jobs → LLM (lib/llm.ts): one gateway batch, or concurrent
//                calls stored in the same pass (VIDEO_INTEL_LLM_MODE)
//   collect      ended gateway batches → creator_video_insights / creator_content_insights
//   niche        niche-level pattern table (SQL)

export type StageSummary = {
  stage: string;
  idle: boolean;
  reason?: string;
  claimed: number;
  done: number;
  failed: number;
  deferred: number;
  calls: number;
  credits: number;
  usd: number;
  seconds: number;
  batches?: string[];
  details?: Record<string, unknown>;
  errors: string[];
};

const MAX_ATTEMPTS = 4;
const HOUR = 3_600_000;

function summary(stage: string): StageSummary {
  return { stage, idle: false, claimed: 0, done: 0, failed: 0, deferred: 0, calls: 0, credits: 0, usd: 0, seconds: 0, errors: [] };
}

const backoff = (attempts: number, nowMs: number) => new Date(nowMs + Math.min(48, 0.5 * 2 ** Math.max(0, attempts - 1)) * HOUR).toISOString();
const tomorrow = (nowMs: number) => new Date(dayStart(nowMs).getTime() + 24 * HOUR).toISOString();
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/** Runs tasks with a concurrency limit; stops starting new ones once `stop()` says so. */
async function pool<T>(items: T[], concurrency: number, stop: () => boolean, run: (item: T) => Promise<void>): Promise<T[]> {
  const left: T[] = [];
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      if (stop()) {
        left.push(items[i]);
        continue;
      }
      await run(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
  return left;
}

// ── 1. Enqueue ──────────────────────────────────────────────────────────────
export async function runEnqueue(store: IntelStore, opts: { limit?: number } = {}): Promise<StageSummary> {
  const s = summary("enqueue");
  const started = Date.now();
  const counts = await store.enqueueNewVideos(opts.limit ?? 20_000, ANALYSIS_PROMPT_VERSION);
  s.done = Number(counts.queued ?? 0);
  s.details = counts;
  s.idle = !s.done && !Number(counts.requeued ?? 0);
  s.seconds = Math.round((Date.now() - started) / 1000);
  return s;
}

// ── 2. Transcripts ──────────────────────────────────────────────────────────
export type TranscriptWorkerOptions = {
  budget?: number;
  concurrency?: number;
  timeBudgetMs?: number;
  sources?: TranscriptSource[];
  nowMs?: () => number;
};

export async function runTranscriptWorker(store: IntelStore, opts: TranscriptWorkerOptions = {}): Promise<StageSummary> {
  const s = summary("transcripts");
  const clock = opts.nowMs ?? Date.now;
  const started = clock();
  const finish = () => ({ ...s, seconds: Math.round((clock() - started) / 1000) });
  const caps = intelCaps();
  const usage = await store.dailyUsage(dayStart(started).toISOString());
  let creditsLeft = Math.max(0, caps.transcriptCreditsPerDay - usage.transcriptCredits);
  const paused = new Set<string>();
  const pauseState = await isPaused(store, PAUSE_TRANSCRIPTS, started);
  if (pauseState.paused) paused.add("scrapecreators");
  const wasPaused = Boolean(pauseState.until);
  if ((await isPaused(store, "stt", started)).paused) paused.add("stt:gateway");
  // Speech to text (gateway): off unless VIDEO_INTEL_STT_DAILY_MAX > 0; capped per day and by today's dollars.
  const sttCap = Number(process.env.VIDEO_INTEL_STT_DAILY_MAX ?? 0) || 0;
  const stt: SttBudget = { left: usage.usd >= caps.usdPerDay ? 0 : Math.max(0, sttCap - (usage.sttCalls ?? 0)), calls: 0, usd: 0 };

  const jobs = await store.claimJobs("transcript", opts.budget ?? 400);
  s.claimed = jobs.length;
  if (!jobs.length) return { ...finish(), idle: true, reason: "queue empty" };

  const sources = opts.sources ?? defaultTranscriptSources(sttCap > 0 ? { stt: gatewaySpeechToText(stt) } : {});
  // Paid transcripts only for jobs at or above this priority (1 = tracked creators … 5 = the rest);
  // the others use the free sources and are analysed from their caption otherwise.
  const maxPaidPriority = Number(process.env.VIDEO_INTEL_PAID_TRANSCRIPT_MAX_PRIORITY ?? 9) || 9;
  const freeSources = sources.filter((x) => !x.paid);
  const meter = new CallMeter();
  const videos = new Map((await store.videos(jobs.map((j) => ({ platform: j.platform, videoId: j.target })))).map((v) => [videoKey(v.platform, v.video_id), v]));
  const existing = await store.transcripts(jobs.map((j) => ({ platform: j.platform, videoId: j.target })));
  const updates: JobUpdate[] = [];
  const done: { job: IntelJob; transcript: Transcript; fresh: boolean }[] = [];
  let paidOk = false;

  const timeBudget = opts.timeBudgetMs ?? 240_000;
  const left = await pool(jobs, opts.concurrency ?? 8, () => clock() - started > timeBudget, async (job) => {
    const key = videoKey(job.platform, job.target);
    const video = videos.get(key);
    if (!video) {
      updates.push({ id: job.id, status: "failed", error: "video no longer stored" });
      s.failed += 1;
      return;
    }
    const have = existing.get(key);
    if (have) {
      done.push({ job, transcript: have, fresh: false });
      return;
    }
    const chain = job.priority > maxPaidPriority ? freeSources : sources;
    // Reserve the worst case before the call; give back what was not spent.
    const reserve = Math.max(0, ...chain.filter((x) => x.paid && x.applies(video)).map((x) => x.maxCredits(video)));
    const allowance = creditsLeft;
    creditsLeft -= Math.min(reserve, creditsLeft);
    const before = meter.credits;
    try {
      const t = await fetchTranscript(video, chain, {
        meter,
        paused,
        creditsLeft: allowance,
        onProviderDown: (name: string, e: ProviderError) => {
          s.errors.push(`${name} paused: ${e.message}`.slice(0, 300));
          void pause(store, name.startsWith("stt:") ? "stt" : PAUSE_TRANSCRIPTS, e.message, undefined, clock());
        },
      });
      if (t.source === "scrapecreators") paidOk = true;
      done.push({ job, transcript: t, fresh: true });
    } catch (e) {
      if (e instanceof TranscriptDeferred) {
        updates.push({ id: job.id, status: "queued", runAfter: paused.size ? new Date(clock() + HOUR).toISOString() : tomorrow(clock()), refundAttempt: true });
        s.deferred += 1;
      } else if (job.attempts >= MAX_ATTEMPTS) {
        // Give up on the transcript, not on the video: it is analysed from its caption.
        done.push({ job, transcript: unavailable("none"), fresh: true });
        s.errors.push(`${key}: ${errText(e)}`);
      } else {
        updates.push({ id: job.id, status: "queued", runAfter: backoff(job.attempts, clock()), error: errText(e) });
        s.errors.push(`${key}: ${errText(e)}`);
      }
    } finally {
      creditsLeft += Math.max(0, Math.min(reserve, allowance) - (meter.credits - before));
    }
  });
  for (const job of left) updates.push({ id: job.id, status: "queued", refundAttempt: true });
  s.deferred += left.length;

  const fresh = done.filter((d) => d.fresh);
  if (fresh.length) await store.upsertTranscripts(fresh.map((d) => ({ platform: d.job.platform, videoId: d.job.target, transcript: d.transcript })));
  for (const d of done) updates.push({ id: d.job.id, status: "done", error: null });
  s.done = done.length;
  if (done.length) {
    await store.enqueueJobs(done.map((d) => ({ kind: "analyze" as const, platform: d.job.platform, target: d.job.target, priority: d.job.priority })));
  }
  if (updates.length) await store.updateJobs(updates);
  // A paid transcript came back after a pause: the provider is serving again.
  if (paidOk && wasPaused && !paused.size) await store.setPause(PAUSE_TRANSCRIPTS, null, null);

  s.calls = meter.calls + stt.calls;
  s.credits = meter.credits;
  s.usd = stt.usd;
  await store.recordRun({
    stage: "transcripts",
    started_at: new Date(started).toISOString(),
    items: s.done,
    calls: s.calls,
    credits: s.credits,
    est_usd: stt.usd,
    notes: { failed: s.failed, deferred: s.deferred, byProvider: meter.byProvider, sttCalls: stt.calls, sttUsd: stt.usd, errors: s.errors.slice(0, 10) },
  });
  return finish();
}

// ── 3. LLM transport: gateway batch API, or concurrent calls ────────────────
type BatchInfo = { id: string; status: string; terminal: boolean; counts: { total: number; completed: number; failed: number; pending: number } };

/**
 * What the pipeline needs from an LLM transport (a fake one in tests).
 * mode "batch": the gateway batch API ("-batch" models, results later, polled by collect).
 * mode "sync": requests run at once as concurrent chat calls inside create();
 *              the submitter processes the results in the same pass.
 */
export interface BatchClient {
  readonly mode: "batch" | "sync";
  /** Model id actually used for a request model ("claude-haiku-5.5" → "claude-haiku-5.5-batch" in batch mode). */
  modelFor(model: string): string;
  create(requests: IntelLlmRequest[], opts?: { deadlineMs?: number }): Promise<BatchInfo>;
  retrieve(id: string): Promise<BatchInfo>;
  results(id: string): Promise<AsyncIterable<IntelLlmResult> | IntelLlmResult[]>;
}

const toMessages = (r: IntelLlmRequest): ChatMessage[] => [
  { role: "system", content: r.system },
  { role: "user", content: r.user },
];

/** Gateway batch API (lib/llm.ts startBatch / batchStatus / batchResults). */
export function gatewayBatchClient(): BatchClient {
  const info = (b: { batchId: string; status: string; terminal: boolean; counts: BatchInfo["counts"] }): BatchInfo => ({ id: b.batchId, status: b.status, terminal: b.terminal, counts: b.counts });
  return {
    mode: "batch",
    modelFor: (m) => batchModel(m),
    create: async (requests) => info(await startBatch(requests.map((r) => ({ id: r.id, model: batchModel(r.model), messages: toMessages(r), maxTokens: r.maxTokens, json: true, schema: r.schema })))),
    retrieve: async (id) => info(await batchStatus(id)),
    results: async (id) => (await batchResults(id)).map((r): IntelLlmResult => ({ ...r })),
  };
}

const syncResults = new Map<string, IntelLlmResult[]>();

/** Concurrent chat calls (gateway first, Anthropic direct as fallback): the answers are kept for this process only. */
export function syncLlmClient(opts: { concurrency?: number; call?: typeof chat } = {}): BatchClient {
  const call = opts.call ?? chat;
  const concurrency = opts.concurrency ?? (Math.min(Math.max(Number(process.env.VIDEO_INTEL_SYNC_CONCURRENCY ?? 12) || 12, 1), 32));
  return {
    mode: "sync",
    modelFor: (m) => m.replace(/-batch$/, ""),
    async create(requests, { deadlineMs } = {}) {
      const out: IntelLlmResult[] = [];
      let creditError: unknown = null;
      await pool(requests, concurrency, () => Boolean(creditError) || (deadlineMs != null && Date.now() > deadlineMs), async (r) => {
        try {
          const res = await call(toMessages(r), { model: r.model.replace(/-batch$/, ""), maxTokens: r.maxTokens, json: true, timeoutMs: 60_000 });
          out.push({ id: r.id, ok: true, text: res.text, usage: res.usage, finishReason: res.finishReason, error: null });
        } catch (e) {
          if (e instanceof LlmError && e.providerDown) {
            creditError ??= e;
            return;
          }
          const kind = e instanceof LlmError ? e.kind : "other";
          out.push({ id: r.id, ok: false, text: "", usage: { inputTokens: 0, outputTokens: 0, costUsd: null }, finishReason: null, error: { type: kind === "invalid" ? "invalid_request_error" : kind, message: errText(e) } });
        }
      });
      // Out of credit before anything came back: same handling as a refused batch (pause, hand back).
      if (creditError && !out.length) throw creditError;
      const id = `sync-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      syncResults.set(id, out);
      return { id, status: "completed", terminal: true, counts: { total: requests.length, completed: out.filter((r) => r.ok).length, failed: out.filter((r) => !r.ok).length, pending: 0 } };
    },
    async retrieve(id) {
      const list = syncResults.get(id);
      return { id, status: list ? "completed" : "lost", terminal: true, counts: { total: list?.length ?? 0, completed: list?.length ?? 0, failed: 0, pending: 0 } };
    },
    async results(id) {
      return syncResults.get(id) ?? [];
    },
  };
}

/**
 * The transport for this deployment: VIDEO_INTEL_LLM_MODE=batch | sync. Default: the gateway
 * batch API when CHEAPER_INFERENCE_API_KEY is set (verified end to end on 2026-10-29), else
 * concurrent calls (which fall back to the Anthropic API). Null when no LLM is configured.
 */
export function intelLlmClient(): BatchClient | null {
  if (!llmConfigured()) return null;
  const mode = (process.env.VIDEO_INTEL_LLM_MODE || (gatewayConfigured() ? "batch" : "sync")).trim().toLowerCase();
  return mode === "batch" && gatewayConfigured() ? gatewayBatchClient() : syncLlmClient();
}

// ── 4. Submit ───────────────────────────────────────────────────────────────
export type SubmitOptions = { kind: "analyze" | "synthesize"; nowMs?: () => number; limit?: number; timeBudgetMs?: number };

/** Requests per pass in sync mode (each is a live call; the batch size applies to the batch API). */
const syncBatchSize = () => Math.min(Math.max(Number(process.env.VIDEO_INTEL_SYNC_BATCH ?? 600) || 600, 1), 5_000);

export async function runBatchSubmitter(store: IntelStore, client: BatchClient | null, opts: SubmitOptions): Promise<StageSummary> {
  const s = summary(`submit:${opts.kind}`);
  const clock = opts.nowMs ?? Date.now;
  const started = clock();
  const finish = (patch: Partial<StageSummary> = {}) => ({ ...s, ...patch, seconds: Math.round((clock() - started) / 1000) });
  if (!client) return finish({ idle: true, reason: "no LLM configured (CHEAPER_INFERENCE_API_KEY)" });
  const p = await isPaused(store, PAUSE_LLM, started);
  if (p.paused) return finish({ idle: true, reason: `paused until ${p.until}: ${p.reason ?? ""}` });

  const caps = intelCaps();
  const usage = await store.dailyUsage(dayStart(started).toISOString());
  if (client.mode === "batch" && usage.openBatches >= caps.maxOpenBatches) return finish({ idle: true, reason: `${usage.openBatches} batches still processing (max ${caps.maxOpenBatches})` });
  const usdLeft = caps.usdPerDay - usage.usd;
  if (usdLeft <= 0) return finish({ idle: true, reason: `daily spend cap reached ($${caps.usdPerDay})` });
  const countLeft = opts.kind === "analyze" ? caps.analysesPerDay - usage.analysesSubmitted : caps.synthesesPerDay - usage.synthesesSubmitted;
  const limit = Math.min(client.mode === "sync" ? syncBatchSize() : caps.batchSize, countLeft, opts.limit ?? Infinity);
  if (limit <= 0) return finish({ idle: true, reason: `daily ${opts.kind} cap reached` });

  const jobs = await store.claimJobs(opts.kind, limit);
  s.claimed = jobs.length;
  if (!jobs.length) return finish({ idle: true, reason: "queue empty" });

  const model = client.modelFor(opts.kind === "analyze" ? analysisModel() : synthesisModel());
  const requests: IntelLlmRequest[] = [];
  const costs: number[] = [];
  const updates: JobUpdate[] = [];
  const included: IntelJob[] = [];

  if (opts.kind === "analyze") {
    const keys = jobs.map((j) => ({ platform: j.platform, videoId: j.target }));
    const [videos, transcripts] = await Promise.all([store.videos(keys), store.transcripts(keys)]);
    const byKey = new Map(videos.map((v) => [videoKey(v.platform, v.video_id), v]));
    for (const job of jobs) {
      const v = byKey.get(videoKey(job.platform, job.target));
      if (!v) {
        updates.push({ id: job.id, status: "failed", error: "video no longer stored" });
        s.failed += 1;
        continue;
      }
      const t = transcripts.get(videoKey(job.platform, job.target)) ?? null;
      const req = analysisRequest(job.id, v, t, model);
      requests.push(req);
      costs.push(estimateRequestCost(model, req.system.length + req.user.length, 400));
      included.push(job);
    }
  } else {
    for (const job of jobs) {
      const input = await store.creatorInsightInput(job.platform, job.target);
      const stats = input ? computeCreatorStats(input.rows) : null;
      if (!input || !stats || stats.videos < SYNTHESIS_MIN_VIDEOS) {
        updates.push({ id: job.id, status: "done", error: "not enough analysed videos" });
        s.done += 1;
        continue;
      }
      const req = synthesisRequest(job.id, { username: input.username, platform: input.platform, niche: input.niche }, stats, model);
      requests.push(req);
      costs.push(estimateRequestCost(model, req.system.length + req.user.length, 1_200));
      included.push(job);
    }
  }

  // Trim to the dollars left today (estimates); priority order is kept.
  let total = 0;
  let keep = 0;
  while (keep < requests.length && total + costs[keep] <= usdLeft) total += costs[keep++];
  for (const job of included.slice(keep)) updates.push({ id: job.id, status: "queued", runAfter: tomorrow(clock()), refundAttempt: true });
  s.deferred += included.length - keep;
  const sending = included.slice(0, keep);
  if (!sending.length) {
    if (updates.length) await store.updateJobs(updates);
    return finish({ idle: true, reason: "nothing to send within today's spend cap" });
  }

  let batch: BatchInfo;
  try {
    batch = await client.create(requests.slice(0, keep), { deadlineMs: started + (opts.timeBudgetMs ?? 200_000) });
  } catch (e) {
    const kind = classifyLlmError(e);
    const msg = errText(e);
    s.errors.push(`send (${kind}): ${msg}`);
    // Out of credit or bad key: pause the whole AI side; jobs go back untouched.
    if (kind === "credit" || kind === "auth") await pause(store, PAUSE_LLM, `${kind}: ${msg}`, kind === "auth" ? 360 : undefined, clock());
    const runAfter = kind === "credit" || kind === "auth" ? new Date(clock() + HOUR).toISOString() : new Date(clock() + 10 * 60_000).toISOString();
    for (const job of sending) updates.push({ id: job.id, status: "queued", runAfter, refundAttempt: true, error: `${kind}: ${msg}` });
    await store.updateJobs(updates);
    s.deferred += sending.length;
    return finish({ reason: kind === "credit" ? "LLM provider out of credit: paused" : `requests not sent (${kind})` });
  }
  // A call went through: any earlier pause is over.
  if (p.until) await store.setPause(PAUSE_LLM, null, null);

  const row: BatchRow = {
    id: batch.id,
    kind: opts.kind,
    model,
    status: batch.terminal ? "ended" : "in_progress",
    request_count: sending.length,
    results_processed: 0,
    est_cost_usd: Math.round(total * 10_000) / 10_000,
    submitted_at: new Date(clock()).toISOString(),
  };
  await store.insertBatch(row);
  for (const job of sending) updates.push({ id: job.id, status: "submitted", batchId: batch.id, error: null });
  await store.updateJobs(updates);
  s.done += sending.length;
  s.usd = row.est_cost_usd;
  s.batches = [batch.id];
  // Sync mode: the answers are here already; store them now (requests a deadline cut are handed back).
  if (client.mode === "sync") {
    const collected = summary("collect");
    await processBatchResults(store, client, row, collected, () => false, 500, clock);
    s.usd = collected.usd;
    s.failed += collected.failed;
    s.details = { stored: collected.done, retried: collected.deferred, ...(collected.details ?? {}) };
    s.errors.push(...collected.errors);
  }
  return finish();
}

// ── 5. Collect ──────────────────────────────────────────────────────────────
export type CollectOptions = { timeBudgetMs?: number; nowMs?: () => number; chunk?: number };

const STUCK_AFTER_MS = 26 * HOUR; // gateway batches expire after 24 h; past that, give the work back

export async function runBatchCollector(store: IntelStore, client: BatchClient | null, opts: CollectOptions = {}): Promise<StageSummary> {
  const s = summary("collect");
  const clock = opts.nowMs ?? Date.now;
  const started = clock();
  const finish = (patch: Partial<StageSummary> = {}) => ({ ...s, ...patch, seconds: Math.round((clock() - started) / 1000) });
  if (!client) return finish({ idle: true, reason: "no LLM configured (CHEAPER_INFERENCE_API_KEY)" });
  const open = await store.openBatches();
  if (!open.length) return finish({ idle: true, reason: "no open batch" });
  const timeBudget = opts.timeBudgetMs ?? 240_000;
  const out = () => clock() - started > timeBudget;
  s.batches = [];

  for (const b of open) {
    if (out()) break;
    // A sync pass that died before storing its answers: hand its jobs back.
    if (b.id.startsWith("sync-")) {
      if (clock() - Date.parse(b.submitted_at) > 15 * 60_000) {
        const jobs = await store.submittedJobsOf(b.id);
        if (jobs.length) await store.updateJobs(jobs.map((j) => ({ id: j.id, status: "queued" as const, refundAttempt: true, error: "sync pass lost" })));
        await store.updateBatch(b.id, { status: "failed", last_error: "sync pass lost before storing" });
      }
      continue;
    }
    let info: BatchInfo;
    try {
      info = await client.retrieve(b.id);
    } catch (e) {
      s.errors.push(`${b.id}: ${errText(e)}`);
      if (classifyLlmError(e) === "auth") break;
      continue;
    }
    await store.updateBatch(b.id, {
      status: info.terminal ? "ended" : "in_progress",
      succeeded: info.counts.completed,
      errored: info.counts.failed,
      last_polled_at: new Date(clock()).toISOString(),
      ...(info.terminal && !b.ended_at ? { ended_at: new Date(clock()).toISOString() } : {}),
    });
    if (!info.terminal) {
      if (clock() - Date.parse(b.submitted_at) > STUCK_AFTER_MS) {
        const jobs = await store.submittedJobsOf(b.id);
        await store.updateJobs(jobs.map((j) => ({ id: j.id, status: "queued" as const, refundAttempt: true, error: "batch never ended" })));
        await store.updateBatch(b.id, { status: "failed", last_error: "never ended" });
      }
      continue;
    }
    s.batches.push(b.id);
    const finished = await processBatchResults(store, client, b, s, out, opts.chunk ?? 500, clock);
    if (!finished) break; // out of time: the next pass resumes after results_processed
  }
  return finish();
}

/** Processes one ended batch's results (skipping those already processed). True when the batch is fully processed. */
async function processBatchResults(
  store: IntelStore,
  client: BatchClient,
  b: BatchRow,
  s: StageSummary,
  out: () => boolean,
  chunkSize: number,
  clock: () => number,
): Promise<boolean> {
  let seen = 0;
  let processed = b.results_processed ?? 0;
  let tokensIn = b.input_tokens ?? 0;
  let tokensOut = b.output_tokens ?? 0;
  let cost = Number(b.actual_cost_usd ?? 0);
  let buffer: IntelLlmResult[] = [];

  const flush = async () => {
    if (!buffer.length) return;
    const part = buffer;
    buffer = [];
    const usage = await handleResults(store, b, part, s, clock);
    tokensIn += usage.input;
    tokensOut += usage.output;
    cost += usage.cost;
    processed += part.length;
    await store.updateBatch(b.id, { results_processed: processed, input_tokens: tokensIn, output_tokens: tokensOut, actual_cost_usd: Math.round(cost * 100_000) / 100_000 });
  };

  for await (const r of await client.results(b.id)) {
    seen += 1;
    if (seen <= processed) continue; // done by an earlier pass
    buffer.push(r);
    if (buffer.length >= chunkSize) {
      await flush();
      if (out()) return false;
    }
  }
  await flush();
  // Requests the results never mentioned (a deadline cut, a lost item) go back to the queue.
  const missing = await store.submittedJobsOf(b.id);
  if (missing.length) await store.updateJobs(missing.map((j) => ({ id: j.id, status: "queued" as const, refundAttempt: true, error: "no result" })));
  await store.updateBatch(b.id, { status: "processed", results_processed_at: new Date(clock()).toISOString() });
  s.usd += cost;
  return true;
}

type ChunkUsage = { input: number; output: number; cost: number };

const isRefusal = (r: IntelLlmResult) => r.finishReason === "refusal" || r.finishReason === "content_filter";
const isRequestError = (t: string) => t === "invalid_request_error" || t === "invalid";

async function handleResults(store: IntelStore, b: BatchRow, results: IntelLlmResult[], s: StageSummary, clock: () => number): Promise<ChunkUsage> {
  const usage: ChunkUsage = { input: 0, output: 0, cost: 0 };
  const ids = results.map((r) => Number(r.id.replace(/^j/, ""))).filter((n) => Number.isFinite(n));
  const jobs = new Map((await store.jobsByIds(ids)).map((j) => [j.id, j]));
  const updates: JobUpdate[] = [];
  const retry = (job: IntelJob, error: string) => {
    if (job.attempts >= MAX_ATTEMPTS) {
      updates.push({ id: job.id, status: "failed", error });
      s.failed += 1;
    } else {
      updates.push({ id: job.id, status: "queued", runAfter: backoff(job.attempts, clock()), error });
      s.deferred += 1;
    }
  };

  const ok: { job: IntelJob; result: IntelLlmResult }[] = [];
  for (const r of results) {
    const job = jobs.get(Number(r.id.replace(/^j/, "")));
    // Unknown, or already handled by an earlier pass / reclaimed elsewhere: ignore.
    if (!job || job.status !== "submitted" || job.batch_id !== b.id) continue;
    usage.input += r.usage.inputTokens;
    usage.output += r.usage.outputTokens;
    usage.cost += usageCost(b.model, r.usage);
    if (r.ok) {
      if (isRefusal(r)) {
        updates.push({ id: job.id, status: "failed", error: "refused by the model" });
        s.failed += 1;
      } else ok.push({ job, result: r });
    } else if (r.error && isRequestError(r.error.type)) {
      updates.push({ id: job.id, status: "failed", error: `${r.error.type}: ${r.error.message}`.slice(0, 300) });
      s.failed += 1;
    } else if (r.error && /expired|cancel/.test(r.error.type)) {
      // Never ran, nothing billed: back to the queue with the attempt refunded.
      updates.push({ id: job.id, status: "queued", refundAttempt: true, error: r.error.type });
      s.deferred += 1;
    } else retry(job, `${r.error?.type ?? "error"}: ${r.error?.message ?? ""}`.slice(0, 300));
  }

  if (b.kind === "analyze") {
    const keys = ok.map(({ job }) => ({ platform: job.platform, videoId: job.target }));
    const [videos, transcripts] = keys.length ? await Promise.all([store.videos(keys), store.transcripts(keys)]) : [[], new Map<string, Transcript>()];
    const byKey = new Map(videos.map((v) => [videoKey(v.platform, v.video_id), v]));
    const rows: InsightUpsert[] = [];
    const creators = new Map<string, Set<string>>();
    for (const { job, result } of ok) {
      const key = videoKey(job.platform, job.target);
      const v = byKey.get(key);
      const t = transcripts.get(key) ?? null;
      if (!v) {
        updates.push({ id: job.id, status: "failed", error: "video no longer stored" });
        s.failed += 1;
        continue;
      }
      const analysis = validateAnalysis(extractJson(result.text), { transcript: t, caption: v.caption });
      if (!analysis) {
        retry(job, result.finishReason === "length" || result.finishReason === "max_tokens" ? "answer cut at max tokens" : "answer is not valid JSON");
        continue;
      }
      const nowIso = new Date(clock()).toISOString();
      rows.push({
        platform: job.platform,
        video_id: job.target,
        username: v.username,
        model: b.model,
        prompt_version: ANALYSIS_PROMPT_VERSION,
        analysis,
        ...insightColumns(analysis, t),
        views: v.views ?? 0,
        median_views: v.median_views == null ? null : Math.round(v.median_views),
        performance_ratio: performanceRatio(v.views, v.median_views),
        band: performanceBand(v.views, v.median_views),
        input_tokens: result.usage.inputTokens || null,
        output_tokens: result.usage.outputTokens || null,
        analysed_at: nowIso,
        perf_updated_at: nowIso,
      });
      updates.push({ id: job.id, status: "done", error: null });
      s.done += 1;
      const set = creators.get(job.platform) ?? new Set<string>();
      set.add(v.username);
      creators.set(job.platform, set);
    }
    if (rows.length) await store.upsertInsights(rows);
    // Enough new analysed videos → a (new) creator synthesis is queued.
    for (const [platform, names] of creators) {
      const n = await store.enqueueSynthesis(platform, [...names], SYNTHESIS_MIN_VIDEOS, SYNTHESIS_PROMPT_VERSION);
      s.details = { ...(s.details ?? {}), synthesesQueued: Number(s.details?.synthesesQueued ?? 0) + n };
    }
  } else {
    for (const { job, result } of ok) {
      const input = await store.creatorInsightInput(job.platform, job.target);
      const stats = input ? computeCreatorStats(input.rows) : null;
      if (!input || !stats) {
        updates.push({ id: job.id, status: "failed", error: "creator insights gone" });
        s.failed += 1;
        continue;
      }
      const synthesis = validateSynthesis(extractJson(result.text), stats);
      if (!synthesis && job.attempts < MAX_ATTEMPTS) {
        retry(job, "synthesis is not valid JSON");
        continue;
      }
      await store.upsertCreatorInsight({
        platform: job.platform,
        username: job.target,
        summary_en: synthesis?.summary_en || null,
        summary_fr: synthesis?.summary_fr || null,
        // Patterns always carry the computed numbers; the text only explains them.
        patterns: synthesis?.patterns.length ? synthesis.patterns : stats.top,
        stats: { videos: stats.videos, winners: stats.winners, losers: stats.losers, overallMedianRatio: stats.overallMedianRatio, top: stats.top, best: stats.best, worst: stats.worst },
        videos_analysed: stats.videos,
        model: b.model,
        prompt_version: SYNTHESIS_PROMPT_VERSION,
        updated_at: new Date(clock()).toISOString(),
      });
      updates.push({ id: job.id, status: "done", error: null });
      s.done += 1;
    }
  }
  if (updates.length) await store.updateJobs(updates);
  return usage;
}

// ── 6. Niche patterns ───────────────────────────────────────────────────────
export async function runNicheRefresh(store: IntelStore, platforms: IntelPlatform[] = ["tiktok", "instagram", "youtube"]): Promise<StageSummary> {
  const s = summary("niche");
  const started = Date.now();
  const details: Record<string, number> = {};
  for (const p of platforms) {
    try {
      details[p] = await store.refreshNichePatterns(p);
    } catch (e) {
      s.errors.push(`${p}: ${errText(e)}`);
    }
  }
  s.details = details;
  s.done = Object.values(details).reduce((a, b) => a + b, 0);
  s.seconds = Math.round((Date.now() - started) / 1000);
  return s;
}
