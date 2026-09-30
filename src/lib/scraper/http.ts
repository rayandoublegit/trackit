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

/** GET JSON from a provider, or throw a ProviderError. */
export async function providerGet(req: ProviderRequest): Promise<any> {
  let res: Response;
  try {
    res = await fetch(req.url, {
      headers: { Accept: "application/json", ...req.headers },
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
    throw new ProviderError(req.provider, classifyHttpFailure(res.status, detail), `HTTP ${res.status} ${detail}`.slice(0, 300), res.status);
  }
  if (body == null || typeof body !== "object") {
    throw new ProviderError(req.provider, "bad_response", "response is not JSON", res.status);
  }
  if (body.success === false) {
    throw new ProviderError(req.provider, looksNotFound(detail) ? "not_found" : CREDIT_TEXT.test(detail) ? "no_credits" : "bad_response", detail.slice(0, 300), res.status);
  }
  return body;
}
