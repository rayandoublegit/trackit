import { describe, expect, it } from "vitest";
import { buildPresetShopifySaleMeta, isManualSaleAsShopifyAccount } from "./account-presets";

describe("account presets", () => {
  it("matches preset accounts by email or username only", () => {
    expect(isManualSaleAsShopifyAccount({ email: "realtheo@gmail.com" })).toBe(true);
    expect(isManualSaleAsShopifyAccount({ username: "realtheo" })).toBe(true);
    expect(isManualSaleAsShopifyAccount({ email: "meykodiakouecom@gmail.com" })).toBe(true);
    expect(isManualSaleAsShopifyAccount({ email: "MeyKodiakouEcom@gmail.com" })).toBe(true);
    expect(isManualSaleAsShopifyAccount({ email: "other@gmail.com", username: "other" })).toBe(false);
  });

  it("builds shopify-shaped sale metadata", () => {
    const meta = buildPresetShopifySaleMeta("my-brand");
    expect(meta.shop_domain).toBe("my-brand.myshopify.com");
    expect(meta.shopify_order_id).toMatch(/^\d+$/);
    expect(meta.shopify_order_id.startsWith("manual_")).toBe(false);
  });
});
