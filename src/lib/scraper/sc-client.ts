import { providerGet } from "./http";
import type { CallMeter } from "./types";

// Small shared helpers for the parsers and the ScrapeCreators client.
// Every ScrapeCreators endpoint used by the scraper costs 1 credit per call
// (docs.scrapecreators.com: credits_charged = 1; HTTP 402 = out of credits,
// 404 = account not found).

export const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
export const http = (v: unknown): string => {
  if (typeof v === "string" && v.startsWith("http")) return v;
  if (Array.isArray(v)) return http(v.find((x) => typeof x === "string" && x.startsWith("http")) ?? v[0]);
  if (v && typeof v === "object") return http((v as any).url_list ?? (v as any).url);
  return "";
};

/** First web link found inside a provider object (TikTok anchors, Instagram product tags), else null. */
export function firstUrlIn(value: unknown, depth = 0): string | null {
  if (depth > 8 || value == null) return null;
  if (typeof value === "string") {
    const s = value.trim();
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith("{") || s.startsWith("[")) {
      try {
        return firstUrlIn(JSON.parse(s), depth + 1);
      } catch {
        return null;
      }
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = firstUrlIn(v, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const k of ["url", "product_url", "external_url", "link", "schema", "extra", "product", "product_info", "products", "in", "items"]) {
      const found = firstUrlIn(o[k], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** First e-mail address written in a text (a bio), lowercase, else null. */
export function emailIn(text: unknown): string | null {
  const m = str(text).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : null;
}

/** "1.2M subscribers" → 1200000, "9,221 videos" → 9221, "" → null. */
export function compactNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const text = str(v).trim().toLowerCase().replace(/,/g, "");
  const m = text.match(/(\d+(?:\.\d+)?)\s*([kmb])?/);
  if (!m) return null;
  const mult = m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : m[2] === "b" ? 1e9 : 1;
  return Math.round(Number(m[1]) * mult);
}

/** ISO string or unix seconds/ms → ISO, else null. */
export function isoDate(v: unknown): string | null {
  if (typeof v === "string" && v.trim() && !/^\d+$/.test(v.trim())) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  const n = num(v);
  if (n <= 0) return null;
  return new Date(n > 1e12 ? n : n * 1000).toISOString();
}

const SC_BASE = "https://api.scrapecreators.com";

export function scrapeCreatorsGet(path: string, params: Record<string, string>, provider: string, meter?: CallMeter): Promise<any> {
  const url = new URL(`${SC_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== "") url.searchParams.set(k, v);
  return providerGet({ provider, url: url.toString(), headers: { "x-api-key": process.env.SCRAPECREATORS_API_KEY ?? "" }, meter });
}
