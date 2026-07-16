/** Account-specific presets — scoped to explicit emails/usernames only. */

const MANUAL_SALE_AS_SHOPIFY_ACCOUNTS = new Set([
  "realtheo@gmail.com",
  "realtheo",
  "meykodiakouecom@gmail.com",
]);

export function isManualSaleAsShopifyAccount(identifiers: {
  email?: string | null;
  username?: string | null;
}): boolean {
  const email = identifiers.email?.trim().toLowerCase();
  const username = identifiers.username?.trim().toLowerCase();
  return (
    (email != null && MANUAL_SALE_AS_SHOPIFY_ACCOUNTS.has(email)) ||
    (username != null && MANUAL_SALE_AS_SHOPIFY_ACCOUNTS.has(username))
  );
}

function normalizeShopDomain(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!value) return "preset-shop.myshopify.com";
  if (value.includes(".")) return value;
  return `${value}.myshopify.com`;
}

/** Shopify-shaped ids so manual entries behave like synced orders for this preset. */
export function buildPresetShopifySaleMeta(shopDomain?: string | null): {
  shopify_order_id: string;
  shop_domain: string;
} {
  const shopify_order_id = `${Date.now()}${Math.floor(Math.random() * 9000 + 1000)}`;
  return {
    shopify_order_id,
    shop_domain: normalizeShopDomain(shopDomain || "preset-shop"),
  };
}
