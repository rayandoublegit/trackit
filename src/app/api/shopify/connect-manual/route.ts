import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Manual Shopify connection via a custom app token (no public OAuth app needed).
// The brand creates a custom app in their Shopify admin, copies the Admin API
// access token, and pastes it here with their .myshopify.com domain.
// We verify the token works (shop.json) then store it on the profile, exactly
// like the OAuth callback does.
export async function POST(request: Request) {
  const body = await request.json();
  const userId = String(body.userId || "").trim();
  let shop = String(body.shop || "").trim().toLowerCase();
  const accessToken = String(body.accessToken || "").trim();

  if (!userId) return NextResponse.json({ ok: false, error: "No userId" }, { status: 400 });
  if (!shop) return NextResponse.json({ ok: false, error: "Domaine manquant" }, { status: 400 });
  if (!accessToken) return NextResponse.json({ ok: false, error: "Token manquant" }, { status: 400 });

  // Normalize the domain: strip protocol, trailing slash, and force .myshopify.com host.
  shop = shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!shop.endsWith(".myshopify.com")) {
    return NextResponse.json(
      { ok: false, error: "Le domaine doit finir par .myshopify.com" },
      { status: 400 },
    );
  }

  // Verify the token by calling the Shopify Admin API.
  type ShopInfo = { name?: string; email?: string; currency?: string };
  let shopData: ShopInfo | null = null;
  try {
    const shopRes = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (!shopRes.ok) {
      return NextResponse.json(
        { ok: false, error: "Token ou domaine invalide (Shopify a refusé l'accès)" },
        { status: 400 },
      );
    }
    const json = (await shopRes.json()) as { shop?: ShopInfo };
    shopData = json.shop ?? null;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Impossible de joindre Shopify avec ces identifiants" },
      { status: 400 },
    );
  }

  // Store on the shopify_stores table (mirror the OAuth callback).
  await supabaseAdmin.from("shopify_stores").upsert(
    {
      shop_domain: shop,
      access_token: accessToken,
      shop_name: shopData?.name || shop,
      shop_email: shopData?.email || "",
      currency: shopData?.currency || "EUR",
      connected: true,
      user_id: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "shop_domain" },
  );

  // Update the profile so the dashboard knows the store is connected.
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ shopify_store: shop, shopify_access_token: accessToken })
    .eq("id", userId);
  if (profileError) {
    return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, shop, shopName: shopData?.name || shop });
}
