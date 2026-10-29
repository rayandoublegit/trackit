import { createHmac, timingSafeEqual } from "node:crypto";

/** Shopify signs webhooks of the OAuth app with its client secret (base64 HMAC-SHA256 of the raw body). */
export function validShopifyHmac(rawBody: string, header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody, "utf8").digest("base64"));
  const given = Buffer.from(header.trim());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** A real Shopify admin host (never send the app secret or a token anywhere else). */
export function isMyshopifyDomain(shop: string | null | undefined): shop is string {
  return typeof shop === "string" && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);
}

/** OAuth redirect check: hex HMAC-SHA256 of the sorted query (without `hmac`) with the app secret. */
export function validShopifyQueryHmac(params: URLSearchParams, secret: string | undefined): boolean {
  const given = params.get("hmac");
  if (!secret || !given) return false;
  const message = Array.from(params.entries())
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const expected = Buffer.from(createHmac("sha256", secret).update(message, "utf8").digest("hex"));
  const got = Buffer.from(given);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
