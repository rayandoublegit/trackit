// What every Claude / OpenAI caller does when the provider fails: one honest
// message for the user, one log line per kind, and one email to the team when
// the owner has to act (credit balance, revoked key). Pure helpers + a
// best-effort side effect; never throws.

import { after } from "next/server";

export type AiFailureKind = "billing" | "auth" | "rate_limit" | "overloaded" | "network" | "request" | "unknown";

export type AiFailure = { kind: AiFailureKind; status: number | null; detail: string };

/** Error code returned by API routes when the AI provider can't answer. */
export const AI_UNAVAILABLE = "ai_unavailable";

function errorStatus(e: unknown): number | null {
  if (e && typeof e === "object" && "status" in e) {
    const s = (e as { status?: unknown }).status;
    if (typeof s === "number") return s;
  }
  return null;
}

function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Sorts a provider error (Anthropic SDK, OpenAI HTTP status, fetch failure) into a kind. */
export function classifyAiError(e: unknown): AiFailure {
  const status = errorStatus(e);
  const detail = errorText(e).slice(0, 300);
  // src/lib/llm.ts already sorted it (LlmError.kind).
  const llmKind = e instanceof Error && e.name === "LlmError" ? (e as Error & { kind?: string }).kind : undefined;
  const fromLlm: Record<string, AiFailureKind> = {
    credit: "billing",
    auth: "auth",
    rate_limit: "rate_limit",
    server: "overloaded",
    network: "network",
    invalid: "request",
  };
  if (llmKind && fromLlm[llmKind]) return { kind: fromLlm[llmKind], status, detail };
  const text = detail.toLowerCase();
  const name = e instanceof Error ? e.name : "";
  let kind: AiFailureKind = "unknown";
  if (/credit balance|billing|insufficient_quota|exceeded your current quota|payment/.test(text) || status === 402) kind = "billing";
  else if (status === 401 || status === 403 || /invalid x-api-key|authentication_error|permission_error/.test(text)) kind = "auth";
  else if (status === 429 || /rate_limit/.test(text)) kind = "rate_limit";
  else if (status === 529 || (status !== null && status >= 500) || /overloaded/.test(text)) kind = "overloaded";
  else if (/APIConnection|Timeout|AbortError|FetchError/i.test(name) || /fetch failed|timed out|timeout|ECONNRESET|ENOTFOUND|socket hang up/i.test(text))
    kind = "network";
  else if (status !== null && status >= 400) kind = "request";
  return { kind, status, detail };
}

/** True when the provider itself is down or refusing us (not a bad request from our side). */
export function isAiOutage(e: unknown): boolean {
  const { kind } = classifyAiError(e);
  return kind !== "request" && kind !== "unknown";
}

/** The sentence the user sees. Brands get « vous », creators « tu ». */
export function aiUnavailableMessage(lang: "en" | "fr", audience: "brand" | "creator" = "brand"): string {
  if (lang === "fr") {
    return audience === "creator"
      ? "Mino est momentanément indisponible. Réessaie dans quelques minutes."
      : "Mino est momentanément indisponible. Réessayez dans quelques minutes : la recherche de créateurs et le reste de Trackit fonctionnent normalement.";
  }
  return audience === "creator"
    ? "Mino is temporarily unavailable. Try again in a few minutes."
    : "Mino is temporarily unavailable. Try again in a few minutes: creator search and the rest of Trackit keep working.";
}

const LOG_EVERY_MS = 10 * 60 * 1000;
const ALERT_EVERY_MS = 6 * 60 * 60 * 1000;
const lastLogged = new Map<string, number>();
let lastAlertAt = Number.NEGATIVE_INFINITY;

/** Test hook: forget what was already logged / alerted. */
export function resetAiFailureReports() {
  lastLogged.clear();
  lastAlertAt = Number.NEGATIVE_INFINITY;
}

/** Kinds that need the owner (top up credits, replace the key): the team gets an email. */
export function needsOwnerAction(kind: AiFailureKind): boolean {
  return kind === "billing" || kind === "auth";
}

async function alertTeam(source: string, failure: AiFailure) {
  const key = process.env.RESEND_API_KEY;
  const to = (process.env.OPS_ALERT_EMAIL ?? "rayan.vincentsully@gmail.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!key || !to.length) return;
  const { Resend } = await import("resend");
  const what =
    failure.kind === "billing"
      ? "The AI provider refused the request for billing reasons (credit balance too low). Top up the Cheaper Inference account (or Anthropic, if the fallback is the one failing)."
      : "The AI provider rejected the API key. Check CHEAPER_INFERENCE_API_KEY (and ANTHROPIC_API_KEY if set) in Vercel.";
  await new Resend(key).emails.send({
    from: process.env.OPS_ALERT_FROM ?? "Trackit <onboarding@resend.dev>",
    to,
    subject: `Trackit: Mino is down (${failure.kind})`,
    text: `${what}\n\nFirst seen in: ${source}\nStatus: ${failure.status ?? "n/a"}\nDetail: ${failure.detail}\n\nUsers see "Mino is temporarily unavailable" until this is fixed. This email is sent at most every 6 hours per server instance.`,
  });
}

/**
 * Logs a provider failure (once per source and kind every 10 minutes) and,
 * when the owner must act, emails the team (at most every 6 hours per instance).
 * Returns the classification so callers can pick their fallback.
 */
export function reportAiFailure(source: string, e: unknown, now = Date.now()): AiFailure {
  const failure = classifyAiError(e);
  const logKey = `${source}:${failure.kind}`;
  if (now - (lastLogged.get(logKey) ?? Number.NEGATIVE_INFINITY) >= LOG_EVERY_MS) {
    lastLogged.set(logKey, now);
    console.error(`[ai-provider] ${source} failed (${failure.kind}, status ${failure.status ?? "n/a"}): ${failure.detail}`);
  }
  if (needsOwnerAction(failure.kind) && now - lastAlertAt >= ALERT_EVERY_MS) {
    lastAlertAt = now;
    const send = () => alertTeam(source, failure).catch(() => {});
    try {
      // Keeps the serverless function alive until the email is sent.
      after(send);
    } catch {
      void send(); // outside a request (tests, scripts)
    }
  }
  return failure;
}
