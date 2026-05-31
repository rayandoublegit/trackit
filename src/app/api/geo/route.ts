import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// EU country codes that should default to EUR + French/local
const EUR_COUNTRIES = new Set([
  "FR", "BE", "DE", "ES", "IT", "NL", "PT", "AT", "IE", "FI",
  "GR", "LU", "SK", "SI", "EE", "LV", "LT", "CY", "MT",
]);

export async function GET(request: Request) {
  // Vercel injects the visitor country here (no external API needed)
  const country =
    request.headers.get("x-vercel-ip-country") ||
    request.headers.get("x-country") ||
    "US";

  const isEur = EUR_COUNTRIES.has(country.toUpperCase());

  return NextResponse.json({
    country,
    currency: isEur ? "eur" : "usd",
    lang: country.toUpperCase() === "FR" ? "fr" : "en",
  });
}
