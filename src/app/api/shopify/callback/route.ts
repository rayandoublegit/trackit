import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");
  const state = searchParams.get("state");
  const storedState = request.cookies.get("shopify_state")?.value;

  if (!code || !shop || !state || state !== storedState) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard?shopify=error`);
  }

  try {
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        code
      })
    });

    const { access_token } = await tokenResponse.json();

    const shopResponse = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { "X-Shopify-Access-Token": access_token }
    });
    const { shop: shopData } = await shopResponse.json();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const authHeader = request.headers.get("cookie") || "";
    const sessionMatch = authHeader.match(/sb-[^=]+=([^;]+)/);

    await supabase.from("shopify_stores").upsert({
      shop_domain: shop,
      access_token,
      shop_name: shopData.name,
      shop_email: shopData.email,
      currency: shopData.currency,
      connected: true,
      updated_at: new Date().toISOString()
    }, { onConflict: "shop_domain" });

    const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard?shopify=connected&shop=${shop}`;
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete("shopify_state");
    return response;

  } catch (error) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard?shopify=error`);
  }
}
