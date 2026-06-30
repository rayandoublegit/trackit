import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return NextResponse.json({ error: "Pas de STRIPE_SECRET_KEY" }, { status: 500 });
  }

  const stripe = new Stripe(key);

  // On ne renvoie JAMAIS la cle. Juste son mode + un indice non sensible.
  const mode = key.startsWith("sk_live") ? "live" : key.startsWith("sk_test") ? "test" : "inconnu";
  const keyHint = key.slice(-6); // 6 derniers cars, suffit a distinguer les comptes

  // Les 3 vrais prix Trackit attendus (suffixe FC3qsxzaqx)
  const expected = {
    growth: "price_1Tc60RFC3qsxzaqxCgGq0ksL",
    pro: "price_1Tc62BFC3qsxzaqxxsk8mIyO",
    scale: "price_1Tc64lFC3qsxzaqxTxhKyCpf",
  };

  const results: Record<string, { found: boolean; amount: number | null; currency: string | null }> = {};
  for (const [plan, pid] of Object.entries(expected)) {
    try {
      const price = await stripe.prices.retrieve(pid);
      results[plan] = { found: true, amount: (price.unit_amount ?? 0) / 100, currency: price.currency ?? null };
    } catch {
      results[plan] = { found: false, amount: null, currency: null };
    }
  }

  const allFound = Object.values(results).every((r) => r.found);

  return NextResponse.json({
    ok: true,
    mode,
    keyHint,
    expectedTrackitPrices: results,
    verdict: allFound
      ? "BON COMPTE: les 3 prix Trackit existent sur la cle Vercel"
      : "MAUVAIS COMPTE: les prix Trackit n'existent pas sur la cle Vercel",
  });
}
