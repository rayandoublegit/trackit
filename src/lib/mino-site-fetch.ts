import { lookup } from "node:dns/promises";
import { checkPublicUrl, isPrivateIp } from "@/lib/mino-url-safety";
import { extractSiteInfo, parseShopifyProducts, type SiteInfo } from "@/lib/mino-site-extract";

// Server-side fetch of a brand's page for Mino, with SSRF guards: public
// http(s) only, every resolved address checked, redirects followed by hand
// (each hop checked again, 3 at most), 8 s timeout, 1.5 MB cap.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
export const SITE_MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

export type SiteFetchError = "invalid_url" | "blocked" | "unreachable" | "timeout" | "not_html" | "http_error" | "protected" | "too_large";

export class SiteFetchFailure extends Error {
  constructor(public code: SiteFetchError, message?: string) {
    super(message ?? code);
  }
}

/** Every address the host resolves to must be public (no private IP behind a public name). */
export async function assertPublicHost(hostname: string, resolve: typeof lookup = lookup): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  let addresses: { address: string }[];
  try {
    addresses = await resolve(host, { all: true, verbatim: true });
  } catch {
    throw new SiteFetchFailure("unreachable", `cannot resolve ${host}`);
  }
  if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) {
    throw new SiteFetchFailure("blocked", `${host} resolves to a private address`);
  }
}

async function readCapped(res: Response, max: number): Promise<string> {
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > max * 2) throw new SiteFetchFailure("too_large");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      // Keep what fits: the head of the page holds what we need.
      chunks.push(value.slice(0, Math.max(0, value.byteLength - (size - max))));
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let at = 0;
  for (const c of chunks) {
    buf.set(c, at);
    at += c.byteLength;
  }
  const charset = /charset=([\w-]+)/i.exec(res.headers.get("content-type") || "")?.[1] || "utf-8";
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

/** Fetches a public URL, following up to 3 redirects, each one re-checked. */
export async function safeFetch(
  rawUrl: string,
  opts: { accept?: string; maxBytes?: number; signal?: AbortSignal } = {},
): Promise<{ url: string; body: string; contentType: string }> {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = checkPublicUrl(current, { allowSocial: hop > 0 });
    if (!check.ok) throw new SiteFetchFailure(check.reason === "invalid" ? "invalid_url" : "blocked", check.reason);
    await assertPublicHost(check.url.hostname);
    let res: Response;
    try {
      res = await fetch(check.url, {
        redirect: "manual",
        signal: opts.signal,
        headers: {
          "User-Agent": UA,
          Accept: opts.accept ?? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        },
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError" || (e as Error)?.name === "TimeoutError") throw new SiteFetchFailure("timeout");
      throw new SiteFetchFailure("unreachable");
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new SiteFetchFailure("http_error", `redirect without location`);
      current = new URL(location, check.url).toString();
      continue;
    }
    // 401/403/429: the site turns away automated visits (bot protection).
    if ([401, 403, 429].includes(res.status)) throw new SiteFetchFailure("protected", `HTTP ${res.status}`);
    if (!res.ok) throw new SiteFetchFailure("http_error", `HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") || "";
    const body = await readCapped(res, opts.maxBytes ?? SITE_MAX_BYTES);
    return { url: check.url.toString(), body, contentType };
  }
  throw new SiteFetchFailure("http_error", "too many redirects");
}

/** Reads a brand's site: the page itself, plus /products.json when it is a Shopify store. */
export async function fetchSiteInfo(rawUrl: string): Promise<SiteInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const page = await safeFetch(rawUrl, { signal: controller.signal });
    if (page.contentType && !/html|xml|text\/plain/i.test(page.contentType)) throw new SiteFetchFailure("not_html");
    const info = extractSiteInfo(page.body, page.url);
    if (info.platform === "shopify") {
      try {
        const origin = new URL(page.url).origin;
        const json = await safeFetch(`${origin}/products.json?limit=20`, {
          accept: "application/json",
          maxBytes: 600_000,
          signal: controller.signal,
        });
        const products = parseShopifyProducts(JSON.parse(json.body), info.currencies[0]);
        if (products.length) info.products = products;
      } catch {
        // Some stores close products.json: the page alone is enough.
      }
    }
    return info;
  } catch (e) {
    if (controller.signal.aborted) throw new SiteFetchFailure("timeout");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
