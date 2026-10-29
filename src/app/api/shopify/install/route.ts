import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthedUserId } from "@/lib/api-auth";
import { canUseShopify, normalizePlan } from "@/lib/plan-limits";
import { isMyshopifyDomain } from "@/lib/shopify-webhook";

export async function GET(request: NextRequest) {
  const shop = (request.nextUrl.searchParams.get("shop") || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!isMyshopifyDomain(shop)) return NextResponse.json({ error: "The domain must end with .myshopify.com" }, { status: 400 });
  // The store is linked to the signed-in workspace, never to a user id from the URL.
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const admin = createClient(url, key);
      const { data: profile } = await admin.from("profiles").select("plan").eq("id", userId).maybeSingle();
      if (!canUseShopify(normalizePlan(profile?.plan))) {
        return NextResponse.json(
          {
            error: "Shopify requires Pro or Scale.",
            errorFr: "Shopify nécessite le plan Pro ou Scale.",
            code: "plan_gate",
          },
          { status: 402 },
        );
      }
    }
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/shopify/callback`;
  const scopes = "read_orders,read_customers,write_script_tags,read_products";
  const state = Buffer.from(JSON.stringify({ nonce: randomUUID(), userId: userId || "" })).toString("base64");

  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

  const response = NextResponse.redirect(installUrl);
  response.cookies.set("shopify_state", state, { httpOnly: true, maxAge: 600, sameSite: "lax" });
  return response;
}
