import type { IntelStore } from "./store";

// Caps, prices and pauses. A "day" starts 00:00 UTC; usage is read back from
// anthropic_batches (requests submitted, estimated / actual $) and
// video_intel_runs (transcript credits), so the caps hold across passes.

function envNum(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = Number(raw);
  return raw != null && raw.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
}

export type IntelCaps = {
  /** Video analyses submitted per day (all batches). */
  analysesPerDay: number;
  /** Creator syntheses submitted per day. */
  synthesesPerDay: number;
  /** Paid transcript credits per day (ScrapeCreators). */
  transcriptCreditsPerDay: number;
  /** LLM spend per day, USD (gateway usage.cost; estimates for batches still running). */
  usdPerDay: number;
  /** Gateway batches still processing at once. */
  maxOpenBatches: number;
  /** Requests in one batch (API max 100,000 / 256 MB). */
  batchSize: number;
};

export function intelCaps(): IntelCaps {
  return {
    analysesPerDay: envNum("VIDEO_INTEL_DAILY_MAX_ANALYSES", 200_000),
    synthesesPerDay: envNum("VIDEO_INTEL_DAILY_MAX_SYNTHESES", 20_000),
    transcriptCreditsPerDay: envNum("VIDEO_INTEL_DAILY_MAX_TRANSCRIPT_CREDITS", 20_000),
    usdPerDay: envNum("VIDEO_INTEL_DAILY_MAX_USD", 50),
    maxOpenBatches: envNum("VIDEO_INTEL_MAX_OPEN_BATCHES", 4),
    batchSize: Math.min(Math.max(1, envNum("VIDEO_INTEL_BATCH_SIZE", 5_000)), 100_000),
  };
}

export function dayStart(nowMs = Date.now()): Date {
  const d = new Date(nowMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ── Prices (USD per million tokens) ──────────────────────────────────────
// Only for estimates before a request is sent: every answer from the Cheaper
// Inference gateway carries its real cost (usage.cost), which is what the caps
// count. Gateway list prices seen 2026-10 (a real analysis call: 1,472 tokens
// in + 256 out = $0.00023): Haiku 5.5 ≈ $0.10 in / $0.50 out, Sonnet 5.5 ≈ $2 / $10.
// "-batch" models are assumed at half price until a real batch result says otherwise.
type Price = { input: number; output: number };
const LIST: Record<string, Price> = {
  "claude-haiku-5.5": { input: 0.1, output: 0.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5.5": { input: 2, output: 10 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

export function modelPrice(model: string): { input: number; output: number } {
  const batch = model.endsWith("-batch");
  const p = LIST[model.replace(/-batch$/, "")] ?? LIST["claude-sonnet-5.5"]; // unknown: assume the dearer tier
  return batch ? { input: p.input / 2, output: p.output / 2 } : p;
}

export type Usage = { inputTokens?: number | null; outputTokens?: number | null; costUsd?: number | null };

/** Real cost when the gateway reported it, else the estimate from the price list. */
export function usageCost(model: string, u: Usage): number {
  if (u.costUsd != null && Number.isFinite(u.costUsd)) return u.costUsd;
  const p = modelPrice(model);
  return ((u.inputTokens ?? 0) * p.input + (u.outputTokens ?? 0) * p.output) / 1_000_000;
}

/** Rough tokens of a text (≈ 3.5 characters a token for mixed-language captions and speech). */
export const approxTokens = (chars: number) => Math.ceil(chars / 3.5);

/** Estimated cost of one request before it is sent: prompt chars (system + user) and an expected output. */
export function estimateRequestCost(model: string, promptChars: number, expectedOutputTokens: number): number {
  return usageCost(model, { inputTokens: approxTokens(promptChars), outputTokens: expectedOutputTokens });
}

// ── Pauses ───────────────────────────────────────────────────────────────────
/** Key of the LLM pause (kept as "anthropic" so a pause written before the gateway switch still applies). */
export const PAUSE_ANTHROPIC = "anthropic";
export const PAUSE_LLM = PAUSE_ANTHROPIC;
export const PAUSE_TRANSCRIPTS = "scrapecreators";

export function pauseMinutes(): number {
  return envNum("VIDEO_INTEL_PAUSE_MINUTES", 60);
}

/** True while a pause is in force. An expired pause is simply ignored (the next call that succeeds clears it). */
export async function isPaused(store: IntelStore, key: string, nowMs = Date.now()): Promise<{ paused: boolean; reason: string | null; until: string | null }> {
  const p = await store.pausedUntil(key);
  const paused = Boolean(p.until && Date.parse(p.until) > nowMs);
  return { paused, reason: p.reason, until: p.until };
}

export async function pause(store: IntelStore, key: string, reason: string, minutes = pauseMinutes(), nowMs = Date.now()): Promise<string> {
  const until = new Date(nowMs + minutes * 60_000).toISOString();
  await store.setPause(key, until, reason.slice(0, 300));
  return until;
}

export type LlmFailure = "credit" | "auth" | "rate_limit" | "server" | "invalid" | "other";
/** @deprecated name kept for older imports. */
export type AnthropicFailure = LlmFailure;

/**
 * Sorts an LLM error (lib/llm.ts LlmError, or an Anthropic SDK error).
 * "credit": the provider has no credit (gateway 402 / wallet empty, Anthropic
 * "credit balance is too low") → the pipeline pauses and resumes by itself
 * once a call succeeds again.
 */
export function classifyLlmError(e: unknown): LlmFailure {
  const kind = (e as { kind?: unknown })?.kind;
  if (typeof kind === "string" && (e as Error)?.name === "LlmError") return kind === "network" ? "server" : (kind as LlmFailure);
  const status = typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : null;
  const body = (e as { error?: { error?: { type?: string; message?: string } } })?.error?.error;
  const text = `${body?.type ?? ""} ${body?.message ?? ""} ${e instanceof Error ? e.message : String(e ?? "")}`.toLowerCase();
  if (status === 402 || /billing_error|credit balance|insufficient credit|insufficient (funds|balance)|purchase credits|wallet/.test(text)) return "credit";
  if (status === 401 || status === 403 || /authentication_error|permission_error|invalid x-api-key|invalid api key/.test(text)) return "auth";
  if (status === 429 || /rate_limit/.test(text)) return "rate_limit";
  if ((status != null && status >= 500) || /overloaded|api_error|timeout|econnreset|fetch failed/.test(text)) return "server";
  if (status === 400 || /invalid_request/.test(text)) return "invalid";
  return "other";
}
export const classifyAnthropicError = classifyLlmError;
