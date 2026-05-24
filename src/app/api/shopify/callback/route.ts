import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");
  const state = searchParams.get("state");
  const storedState = request.cookies.get("shopify_state")?.value;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!code || !shop || !state || state !== storedState) {
    return NextResponse.redirect(`${appUrl}/dashboard?shopify=error`);
  }

  try {
    // Parse user_id from state
    let userId = "";
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64").toString());
      userId = decoded.userId || "";
    } catch {}

    // Exchange code for access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        code,
      }),
    });
    const { access_token } = await tokenRes.json();
    if (!access_token) throw new Error("No access token");

    // Get shop info
    const shopRes = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { "X-Shopify-Access-Token": access_token },
    });
    const { shop: shopData } = await shopRes.json();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Save to shopify_stores
    await supabase.from("shopify_stores").upsert({
      shop_domain: shop,
      access_token,
      shop_name: shopData?.name || shop,
      shop_email: shopData?.email || "",
      currency: shopData?.currency || "USD",
      connected: true,
      user_id: userId || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "shop_domain" });

    // Update profiles so dashboard knows store is connected
    if (userId) {
      await supabase.from("profiles").update({
        shopify_store: shop,
        shopify_access_token: access_token,
      }).eq("id", userId);
    }

    const response = NextResponse.redirect(`${appUrl}/dashboard?shopify=connected&shop=${shop}`);
    response.cookies.delete("shopify_state");
    return response;

  } catch (error) {
    console.error("Shopify callback error:", error);
    return NextResponse.redirect(`${appUrl}/dashboard?shopify=error`);
  }
}
