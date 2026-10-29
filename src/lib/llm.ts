import Anthropic from "@anthropic-ai/sdk";

// One door to every LLM call in Trackit.
//
// Provider order: Cheaper Inference (OpenAI-compatible gateway) first; the
// Anthropic API directly only as a fallback, when ANTHROPIC_API_KEY is set and
// the gateway fails (network, 5xx, out of credit, bad key). Models by tier:
//   fast   LLM_MODEL_FAST  (default "claude-haiku-5.5")
//   smart  LLM_MODEL_SMART (default "claude-sonnet-5.5", vision)
// or any gateway model id. Every answer carries usage and, from the gateway,
// the real cost in USD (usage.cost) for caps and accounting.
//
// Exports (stable):
//   chat(messages, opts)          → ChatResult            one completion
//   chatJson<T>(messages, opts)   → ChatResult & { data } JSON mode + parse (data null when not JSON)
//   llmModel(tier) / llmConfigured() / LlmError (kind: credit | auth | rate_limit | server | invalid | network | other)
//   startBatch(requests) / batchStatus(id) / batchResults(id)   gateway batch API ("-batch" models, POST /v4/ai/batch/*)
//   transcribeAudio(file, opts)   → { text, segments, language, costUsd }   /audio/transcriptions
// Secrets come from env only and are never logged.

/** Text, an image URL, or a base64 image ({ type: "image", mediaType, data }). */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "image"; mediaType: string; data: string };
/** Alias kept for callers written against the first version of this module. */
export type LlmPart = ContentPart;
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };
export type ModelTier = "fast" | "smart";

export type ChatOptions = {
  /** "fast" | "smart" | a gateway model id ("claude-haiku-5.5"). Default "fast". */
  model?: ModelTier | string;
  maxTokens?: number;
  /** JSON mode (response_format json_object on the gateway). */
  json?: boolean;
  temperature?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** false: never fall back to the Anthropic API. Default true. */
  allowFallback?: boolean;
};

export type LlmUsage = { inputTokens: number; outputTokens: number; costUsd: number | null };
/** finishReason: "stop" | "length" | "refusal" | "content_filter" | … (Anthropic stop reasons mapped to the same words). */
export type ChatResult = { text: string; model: string; provider: "cheaperinference" | "anthropic"; usage: LlmUsage; finishReason: string | null };
export type LlmResult = ChatResult;

export type LlmErrorKind = "credit" | "auth" | "rate_limit" | "server" | "invalid" | "network" | "other";

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    readonly status: number | null = null,
    readonly provider: "cheaperinference" | "anthropic" = "cheaperinference",
  ) {
    super(message);
    this.name = "LlmError";
  }
  /** The provider as a whole cannot serve (credit, key): worth pausing, not retrying. */
  get providerDown(): boolean {
    return this.kind === "credit" || this.kind === "auth";
  }
}

const DEFAULT_BASE = "https://api.cheaperinference.com/v1";

export function gatewayBaseUrl(): string {
  return (process.env.CHEAPER_INFERENCE_BASE_URL || DEFAULT_BASE).trim().replace(/\/+$/, "");
}
/** Host root of the gateway (the batch API lives at /v4/ai/batch/* on the same host). */
export function gatewayHost(): string {
  return gatewayBaseUrl().replace(/\/v\d+$/, "");
}
const gatewayKey = () => (process.env.CHEAPER_INFERENCE_API_KEY || "").trim();
export const gatewayConfigured = () => Boolean(gatewayKey());
const anthropicConfigured = () => Boolean((process.env.ANTHROPIC_API_KEY || "").trim());
export const llmConfigured = () => gatewayConfigured() || anthropicConfigured();

export function llmModel(tier: ModelTier | string = "fast"): string {
  if (tier === "fast") return (process.env.LLM_MODEL_FAST || "claude-haiku-5.5").trim();
  if (tier === "smart") return (process.env.LLM_MODEL_SMART || "claude-sonnet-5.5").trim();
  return tier;
}

/** Gateway id → Anthropic API id ("claude-haiku-5.5" → "claude-haiku-5-5"); "-batch" suffix dropped. */
export function anthropicModelId(model: string): string {
  return model.replace(/-batch$/, "").replace(/^(claude-[a-z]+-\d+)\.(\d+)$/, "$1-$2");
}

export function classifyStatus(status: number | null, text: string): LlmErrorKind {
  const t = text.toLowerCase();
  if (status === 402 || /credit|insufficient (funds|balance)|billing|wallet|top up|payment required|quota/.test(t)) return "credit";
  if (status === 401 || status === 403 || /invalid api key|authentication|permission/.test(t)) return "auth";
  if (status === 429 || /rate.?limit|too many requests/.test(t)) return "rate_limit";
  if ((status != null && status >= 500) || /overloaded|timeout|temporarily/.test(t)) return "server";
  if (status != null && status >= 400) return "invalid";
  return "other";
}

async function gatewayFetch(path: string, body: unknown, opts: { timeoutMs?: number; signal?: AbortSignal; base?: string } = {}): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${opts.base ?? gatewayBaseUrl()}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${gatewayKey()}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: opts.signal ?? AbortSignal.timeout(opts.timeoutMs ?? 120_000),
    });
  } catch (e) {
    throw new LlmError("network", e instanceof Error ? e.message : String(e));
  }
  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok || json?.error) {
    const msg = String(json?.error?.message ?? json?.message ?? text.slice(0, 200) ?? res.statusText);
    throw new LlmError(classifyStatus(res.status, msg), `cheaperinference: HTTP ${res.status} ${msg}`.slice(0, 400), res.status);
  }
  if (json == null) throw new LlmError("server", `cheaperinference: HTTP ${res.status} answer is not JSON`, res.status);
  return json;
}

const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

const imageUrl = (p: ContentPart): string => (p.type === "image_url" ? p.image_url.url : p.type === "image" ? (p.data.startsWith("data:") || /^https?:/.test(p.data) ? p.data : `data:${p.mediaType};base64,${p.data}`) : "");

/** Messages in the OpenAI shape the gateway takes (base64 images as data URLs). */
export function toOpenAiMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: imageUrl(p) } })),
  }));
}

async function gatewayChat(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
  const model = llmModel(opts.model ?? "fast");
  const body: Record<string, unknown> = { model, messages: toOpenAiMessages(messages), max_tokens: opts.maxTokens ?? 1024 };
  if (opts.json) body.response_format = { type: "json_object" };
  if (opts.temperature != null) body.temperature = opts.temperature;
  const j = await gatewayFetch("/chat/completions", body, opts);
  const choice = j?.choices?.[0];
  const content = choice?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((p: any) => p?.text ?? "").join("") : "";
  return {
    text,
    model: String(j?.model ?? model),
    provider: "cheaperinference",
    usage: { inputTokens: Number(j?.usage?.prompt_tokens ?? 0), outputTokens: Number(j?.usage?.completion_tokens ?? 0), costUsd: num(j?.usage?.cost) },
    finishReason: choice?.finish_reason ?? null,
  };
}

async function anthropicChat(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
  const client = new Anthropic({ maxRetries: 1, timeout: opts.timeoutMs ?? 120_000 });
  const model = anthropicModelId(llmModel(opts.model ?? "fast"));
  const system = messages.filter((m) => m.role === "system").map((m) => (typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "")).join("\n"))).join("\n\n");
  const rest: Anthropic.MessageParam[] = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content:
        typeof m.content === "string"
          ? m.content
          : m.content.map((p): Anthropic.ContentBlockParam =>
              p.type === "text"
                ? { type: "text", text: p.text }
                : p.type === "image" && !/^(data:|https?:)/.test(p.data)
                  ? { type: "image", source: { type: "base64", media_type: p.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: p.data } }
                  : { type: "image", source: { type: "url", url: imageUrl(p) } },
            ),
    }));
  try {
    const r = await client.messages.create({
      model,
      max_tokens: Math.max(opts.maxTokens ?? 1024, 1024),
      ...(system ? { system: opts.json ? `${system}\n\nAnswer with one JSON object only.` : system } : opts.json ? { system: "Answer with one JSON object only." } : {}),
      messages: rest,
    });
    const text = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const finish = r.stop_reason === "end_turn" ? "stop" : r.stop_reason === "max_tokens" ? "length" : r.stop_reason;
    return { text, model, provider: "anthropic", usage: { inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens, costUsd: null }, finishReason: finish };
  } catch (e) {
    const status = typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : null;
    const msg = e instanceof Error ? e.message : String(e);
    throw new LlmError(classifyStatus(status, msg), `anthropic: ${msg}`.slice(0, 400), status, "anthropic");
  }
}

/** One chat completion: gateway first, Anthropic direct as a fallback when it fails and a key is set. */
export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
  if (!gatewayConfigured()) {
    if (anthropicConfigured() && opts.allowFallback !== false) return anthropicChat(messages, opts);
    throw new LlmError("auth", "No LLM provider configured (CHEAPER_INFERENCE_API_KEY)");
  }
  try {
    return await gatewayChat(messages, opts);
  } catch (e) {
    const err = e instanceof LlmError ? e : new LlmError("other", String(e));
    // A bad request is ours: the fallback would fail the same way.
    if (err.kind === "invalid" || opts.allowFallback === false || !anthropicConfigured()) throw err;
    return anthropicChat(messages, opts);
  }
}

/** The first JSON value in a text (tolerates code fences and prose around it), else null. */
export function parseJsonLoose(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function chatJson<T = unknown>(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult & { data: T | null }> {
  const r = await chat(messages, { ...opts, json: true });
  return { ...r, data: parseJsonLoose(r.text) as T | null };
}

// ── Batch API (gateway; "-batch" models are served only here) ───────────────
// Contract checked against the live API (2026-10-29), it follows the Vercel AI
// SDK call options:
//   POST /v4/ai/batch/start   { requests: [{ type: "text", id, modelId, options: { prompt: [{ role, content }], maxOutputTokens, responseFormat? } }] }
//                             → { batchId, status: "pending", rawStatus, requestCounts: { total, pending, completed, failed }, createdAt, expiresAt }
//   POST /v4/ai/batch/status  { batchId } → same shape without batchId
//   POST /v4/ai/batch/results { batchId } → JSON lines once terminal ("The batch is not yet terminal." before), one per request:
//       { type: "text", id, status: "succeeded", result: { content: [{ type: "text", text }], finishReason: { unified: "stop", raw },
//         usage: { inputTokens: { total, cacheRead }, outputTokens: { total } }, response: { modelId } } }
//     No cost in the result: callers price it from the token counts (batch rate).

export type BatchChatRequest = { id: string; model?: string; messages: ChatMessage[]; maxTokens?: number; json?: boolean; schema?: Record<string, unknown> };
export type BatchCounts = { total: number; pending: number; completed: number; failed: number };
export type BatchInfo = { batchId: string; status: string; terminal: boolean; counts: BatchCounts; createdAt: string | null; expiresAt: string | null };
export type BatchItemResult = { id: string; ok: boolean; text: string; usage: LlmUsage; finishReason: string | null; error: { type: string; message: string } | null };

/** "-batch" model for a tier or id ("claude-haiku-5.5" → "claude-haiku-5.5-batch"). */
export function batchModel(tier: ModelTier | string = "fast"): string {
  const m = llmModel(tier);
  return m.endsWith("-batch") ? m : `${m}-batch`;
}

/** Chat messages → AI SDK prompt (system as a string, user / assistant as text parts). */
export function toBatchPrompt(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === "system") return { role: "system", content: typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "")).join("\n") };
    const parts =
      typeof m.content === "string"
        ? [{ type: "text", text: m.content }]
        : m.content.map((p) => (p.type === "text" ? { type: "text", text: p.text } : { type: "file", mediaType: p.type === "image" ? p.mediaType : "image/*", data: imageUrl(p) }));
    return { role: m.role, content: parts };
  });
}

const TERMINAL = new Set(["completed", "failed", "cancelled", "canceled", "expired", "ended", "done", "succeeded"]);

function batchInfo(j: any, id?: string): BatchInfo {
  const c = j?.requestCounts ?? {};
  const status = String(j?.status ?? "pending").toLowerCase();
  return {
    batchId: String(j?.batchId ?? id ?? ""),
    status,
    terminal: TERMINAL.has(status) || TERMINAL.has(String(j?.rawStatus ?? "").toLowerCase()),
    counts: { total: Number(c.total ?? 0), pending: Number(c.pending ?? 0), completed: Number(c.completed ?? 0), failed: Number(c.failed ?? 0) },
    createdAt: j?.createdAt ?? null,
    expiresAt: j?.expiresAt ?? null,
  };
}

export async function startBatch(requests: BatchChatRequest[]): Promise<BatchInfo> {
  if (!gatewayConfigured()) throw new LlmError("auth", "CHEAPER_INFERENCE_API_KEY not set");
  const body = {
    requests: requests.map((r) => ({
      type: "text",
      id: r.id,
      modelId: r.model ?? batchModel("fast"),
      options: {
        prompt: toBatchPrompt(r.messages),
        maxOutputTokens: r.maxTokens ?? 1024,
        ...(r.json || r.schema ? { responseFormat: { type: "json", ...(r.schema ? { schema: r.schema } : {}) } } : {}),
      },
    })),
  };
  return batchInfo(await gatewayFetch("/v4/ai/batch/start", body, { base: gatewayHost(), timeoutMs: 120_000 }));
}

export async function batchStatus(batchId: string): Promise<BatchInfo> {
  return batchInfo(await gatewayFetch("/v4/ai/batch/status", { batchId }, { base: gatewayHost(), timeoutMs: 60_000 }), batchId);
}

/** One raw result → BatchItemResult. Tolerant: the AI SDK result shape (text, usage, finishReason) or an OpenAI-like one. */
export function parseBatchItem(r: any): BatchItemResult {
  const res = r?.result ?? r?.response ?? r?.output ?? r;
  const error = r?.error ?? res?.error ?? null;
  const content = res?.content;
  const text =
    typeof res?.text === "string"
      ? res.text
      : Array.isArray(content)
        ? content.map((p: any) => (p?.type === "text" || typeof p?.text === "string" ? (p.text ?? "") : "")).join("")
        : typeof res?.choices?.[0]?.message?.content === "string"
          ? res.choices[0].message.content
          : "";
  const u = res?.usage ?? r?.usage ?? {};
  const tokens = (v: any) => (v && typeof v === "object" ? Number(v.total ?? 0) : Number(v ?? 0)) || 0;
  const cost = num(u.cost ?? r?.billing?.cost ?? res?.billing?.cost ?? r?.providerMetadata?.gateway?.cost ?? res?.providerMetadata?.gateway?.cost);
  const status = String(r?.status ?? (error ? "failed" : "completed")).toLowerCase();
  const ok = !error && !["failed", "errored", "error", "expired", "cancelled", "canceled"].includes(status);
  return {
    id: String(r?.id ?? r?.custom_id ?? r?.requestId ?? ""),
    ok,
    text,
    usage: {
      inputTokens: tokens(u.inputTokens ?? u.prompt_tokens ?? u.input_tokens),
      outputTokens: tokens(u.outputTokens ?? u.completion_tokens ?? u.output_tokens),
      costUsd: cost,
    },
    finishReason: finishOf(res?.finishReason ?? res?.finish_reason ?? res?.choices?.[0]?.finish_reason),
    error: ok ? null : { type: String(error?.type ?? error?.code ?? status), message: String(error?.message ?? error ?? status).slice(0, 300) },
  };
}

function finishOf(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "object") return String((v as { unified?: unknown; raw?: unknown }).unified ?? (v as { raw?: unknown }).raw ?? "") || null;
  return String(v);
}

/** Results body → items: JSON lines (what the gateway sends), or a JSON array / { results: [] }. */
export function parseBatchResultsBody(text: string): BatchItemResult[] {
  const body = text.trim();
  if (!body) return [];
  if (body.startsWith("[")) {
    try {
      return (JSON.parse(body) as unknown[]).map(parseBatchItem);
    } catch {
      /* fall through to lines */
    }
  }
  const out: BatchItemResult[] = [];
  for (const line of body.split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    try {
      const j = JSON.parse(l);
      const list = Array.isArray(j?.results) ? j.results : Array.isArray(j?.data) ? j.data : null;
      if (list) out.push(...list.map(parseBatchItem));
      else out.push(parseBatchItem(j));
    } catch {
      /* a broken line is skipped: its request is requeued as "no result" */
    }
  }
  return out;
}

export async function batchResults(batchId: string): Promise<BatchItemResult[]> {
  let res: Response;
  try {
    res = await fetch(`${gatewayHost()}/v4/ai/batch/results`, {
      method: "POST",
      headers: { Authorization: `Bearer ${gatewayKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ batchId }),
      cache: "no-store",
      signal: AbortSignal.timeout(280_000),
    });
  } catch (e) {
    throw new LlmError("network", e instanceof Error ? e.message : String(e));
  }
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    let msg = text.slice(0, 200);
    try {
      msg = String(JSON.parse(text)?.error?.message ?? msg);
    } catch {
      /* not JSON */
    }
    throw new LlmError(classifyStatus(res.status, msg), `cheaperinference batch results: HTTP ${res.status} ${msg}`.slice(0, 400), res.status);
  }
  return parseBatchResultsBody(text);
}

// ── Speech to text (gateway /audio/transcriptions) ──────────────────────────
export type TranscribeOptions = { model?: string; language?: string; timeoutMs?: number; fileName?: string };
export type TranscribeResult = { text: string; segments: { start: number; end: number; text: string }[]; language: string | null; costUsd: number | null };

/** whisper-1 returns timed segments (verbose_json); other models return text only. */
export async function transcribeAudio(file: Blob, opts: TranscribeOptions = {}): Promise<TranscribeResult> {
  if (!gatewayConfigured()) throw new LlmError("auth", "CHEAPER_INFERENCE_API_KEY not set");
  const model = opts.model || "whisper-1";
  const form = new FormData();
  form.set("file", file, opts.fileName ?? "audio.mp4");
  form.set("model", model);
  form.set("response_format", model === "whisper-1" ? "verbose_json" : "json");
  if (opts.language) form.set("language", opts.language);
  let res: Response;
  try {
    res = await fetch(`${gatewayBaseUrl()}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${gatewayKey()}` },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
    });
  } catch (e) {
    throw new LlmError("network", e instanceof Error ? e.message : String(e));
  }
  const text = await res.text().catch(() => "");
  let j: any = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    j = null;
  }
  if (!res.ok || j?.error) {
    const msg = String(j?.error?.message ?? text.slice(0, 200));
    throw new LlmError(classifyStatus(res.status, msg), `cheaperinference transcription: HTTP ${res.status} ${msg}`.slice(0, 400), res.status);
  }
  const segments = Array.isArray(j?.segments)
    ? j.segments.map((s: any) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text ?? "").trim() })).filter((s: { text: string }) => s.text)
    : [];
  return { text: String(j?.text ?? "").trim(), segments, language: j?.language ?? null, costUsd: num(j?.usage?.cost ?? j?.cost) };
}
