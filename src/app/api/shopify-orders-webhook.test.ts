import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { validShopifyHmac } from "@/lib/shopify-webhook";

// /api/shopify/orders: a forged call (no valid Shopify signature, order not
// found with the store's own token) must never create a sale.

const ingest = vi.fn(async () => ({ matched: true, isNew: true, creatorId: "c1" }));
vi.mock("@/lib/shopify-order-ingest", async (orig) => ({
  ...(await orig<typeof import("@/lib/shopify-order-ingest")>()),
  resolveBrandUserIdFromShop: async () => "brand-1",
  resolveShopifyCredentials: async () => ({ shop: "lune.myshopify.com", accessToken: "shpat_test" }),
  ingestShopifyOrder: (...args: unknown[]) => ingest(...(args as [])),
}));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({}) }));

const order = { id: 4242, total_price: "99.00", discount_codes: [{ code: "LUNA10" }] };
const raw = JSON.stringify(order);
const post = (headers: Record<string, string>) =>
  new NextRequest(new URL("/api/shopify/orders", "http://localhost"), {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-shop-domain": "lune.myshopify.com", ...headers },
    body: raw,
  });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SHOPIFY_CLIENT_SECRET = "app-secret";
  vi.unstubAllGlobals();
});

describe("validShopifyHmac", () => {
  it("accepts Shopify's signature and rejects anything else", () => {
    const sig = createHmac("sha256", "app-secret").update(raw, "utf8").digest("base64");
    expect(validShopifyHmac(raw, sig, "app-secret")).toBe(true);
    expect(validShopifyHmac(raw, sig, "other")).toBe(false);
    expect(validShopifyHmac(raw, null, "app-secret")).toBe(false);
    expect(validShopifyHmac(raw, sig, undefined)).toBe(false);
  });
});

describe("/api/shopify/orders", () => {
  it("signed by the app: ingests the payload", async () => {
    const { POST } = await import("./shopify/orders/route");
    const sig = createHmac("sha256", "app-secret").update(raw, "utf8").digest("base64");
    const res = await POST(post({ "x-shopify-hmac-sha256": sig }));
    expect(res.status).toBe(200);
    expect(ingest).toHaveBeenCalledTimes(1);
  });
  it("unsigned and unknown to Shopify: 401, no sale", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
    const { POST } = await import("./shopify/orders/route");
    const res = await POST(post({}));
    expect(res.status).toBe(401);
    expect(ingest).not.toHaveBeenCalled();
  });
  it("unsigned (custom-app store): the order is re-read from Shopify and that copy is ingested", async () => {
    const real = { id: 4242, total_price: "12.00" };
    const fetchMock = vi.fn(async () => Response.json({ order: real }));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("./shopify/orders/route");
    const res = await POST(post({}));
    expect(res.status).toBe(200);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe("https://lune.myshopify.com/admin/api/2024-01/orders/4242.json");
    expect((ingest.mock.calls[0] as unknown[])[1]).toEqual(real);
  });
});
