import type { CallMeter } from "./types";

// One HTTP call to a scraping provider. Every call is counted on the meter
// (it costs money even when it fails) and failures are classified so the
// fallback knows what to do:
//   not_found              the account does not exist → no fallback, back off
//   no_credits/unauthorized the provider cannot serve us → try the next one,
//                          and skip this provider for the rest of the run
//   rate_limited/server/network/bad_response → try the next one

export type ProviderErrorKind =
  | "not_found"
  | "no_credits"
  | "unauthorized"
  | "rate_limited"
  | "server"
  | "network"
  | "bad_response";

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly kind: ProviderErrorKind,
    message: string,
    readonly status: number | null = null,
  ) {
    super(`${provider}: ${message}`);
    this.name = "ProviderError";
  }

  /** The provider as a whole is unusable (credits, key) — not just this request. */
  get providerDown(): boolean {
    return this.kind === "no_credits" || this.kind === "unauthorized";
  }
}

const NOT_FOUND_TEXT = /not[\s_-]?(found|exist)|does(n't| not) exist|no such user|user.*(unavailable|deleted)|couldn'?t find|could not find/i;
const CREDIT_TEXT = /credit|quota|payment required|insufficient|exceeded the (monthly|daily)/i;

export function classifyHttpFailure(status: number, text: string): ProviderErrorKind {
  if (status === 404) return "not_found";
  if (status === 402) return "no_credits";
  if (status === 401) return "unauthorized";
  if (status === 403) return CREDIT_TEXT.test(text) ? "no_credits" : "unauthorized";
  if (status === 429) return CREDIT_TEXT.test(text) ? "no_credits" : "rate_limited";
  if (status >= 500) return "server";
  if (NOT_FOUND_TEXT.test(text)) return "not_found";
  return "bad_response";
}

export function looksNotFound(text: string): boolean {
  return NOT_FOUND_TEXT.test(text);
}

export type ProviderRequest = {
  provider: string;
  url: string;
  headers: Record<string, string>;
  meter?: CallMeter;
  timeoutMs?: number;
};

/** "Please try again later", "Received 429 Too Many Requests": the provider is busy, not the account gone. */
const TRANSIENT_TEXT = /try again later|too many requests|\b429\b|rate.?limit|temporarily/i;
/** "Endpoint '/x.php' does not exist": our mistake, never "account not found". */
const ENDPOINT_TEXT = /endpoint\b.*(does not exist|not found)/i;

/**
 * Error carried in a 200 answer ({ error } or { message }), as the RapidAPI
 * Instagram scraper does. Transient text wins over "not found" ("data not
 * found. Please try again later." is a busy upstream, not a missing account).
 */
export function classifyBodyError(text: string): ProviderErrorKind {
  if (CREDIT_TEXT.test(text) && !/won'?t be charged|wont be charged/i.test(text)) return "no_credits";
  if (TRANSIENT_TEXT.test(text)) return "rate_limited";
  if (ENDPOINT_TEXT.test(text)) return "bad_response";
  if (NOT_FOUND_TEXT.test(text)) return "not_found";
  return "bad_response";
}

/** GET JSON from a provider, or throw a ProviderError. */
export function providerGet(req: ProviderRequest): Promise<any> {
  return providerFetch(req, { method: "GET" });
}

/** POST a form (application/x-www-form-urlencoded) to a provider, same error rules as providerGet. */
export function providerPostForm(req: ProviderRequest & { form: Record<string, string> }): Promise<any> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(req.form)) if (v !== "") body.set(k, v);
  return providerFetch(req, { method: "POST", body: body.toString(), contentType: "application/x-www-form-urlencoded" });
}

async function providerFetch(req: ProviderRequest, init: { method: "GET" | "POST"; body?: string; contentType?: string }): Promise<any> {
  let res: Response;
  try {
    res = await fetch(req.url, {
      method: init.method,
      headers: { Accept: "application/json", ...(init.contentType ? { "Content-Type": init.contentType } : {}), ...req.headers },
      ...(init.body != null ? { body: init.body } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(req.timeoutMs ?? 30_000),
    });
  } catch (e) {
    req.meter?.record(req.provider, 0);
    throw new ProviderError(req.provider, "network", e instanceof Error ? e.message : String(e));
  }
  const text = await res.text().catch(() => "");
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const charged = Number(body?.credits_charged);
  req.meter?.record(req.provider, Number.isFinite(charged) ? charged : 1);

  const detail = String(body?.error ?? body?.message ?? body?.msg ?? body?.detail ?? text.slice(0, 200) ?? res.statusText);
  if (!res.ok) {
    // Statuses with a fixed meaning first; any other 4xx is read from its text.
    const fixed = [401, 402, 403, 404, 429].includes(res.status) || res.status >= 500;
    const kind = fixed ? classifyHttpFailure(res.status, detail) : classifyBodyError(detail);
    throw new ProviderError(req.provider, kind, `HTTP ${res.status} ${detail}`.slice(0, 300), res.status);
  }
  if (body == null || typeof body !== "object") {
    throw new ProviderError(req.provider, "bad_response", "response is not JSON", res.status);
  }
  if (body.success === false) {
    throw new ProviderError(req.provider, looksNotFound(detail) ? "not_found" : CREDIT_TEXT.test(detail) ? "no_credits" : "bad_response", detail.slice(0, 300), res.status);
  }
  return body;
}
