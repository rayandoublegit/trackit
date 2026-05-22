import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get("shop");
  if (!shop) return NextResponse.json({ error: "Missing shop" }, { status: 400 });

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/shopify/callback`;
  const scopes = "read_orders,read_customers,write_script_tags,read_products";
  const state = Buffer.from(Math.random().toString()).toString("base64");

  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;

  const response = NextResponse.redirect(installUrl);
  response.cookies.set("shopify_state", state, { httpOnly: true, maxAge: 600 });
  return response;
}
