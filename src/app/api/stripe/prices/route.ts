import { NextResponse } from "next/server";
import { getStripePriceMatrix, isStripeCheckoutConfigured } from "@/lib/stripe-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const prices = getStripePriceMatrix();
  return NextResponse.json({
    ok: true,
    configured: isStripeCheckoutConfigured(),
    prices,
  });
}
