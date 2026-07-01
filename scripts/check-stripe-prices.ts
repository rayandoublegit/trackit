/**
 * Verifies every Stripe price ID from env vars (and resolved checkout slots)
 * against the Stripe account behind STRIPE_SECRET_KEY.
 *
 * Usage: npm run check:stripe
 */
import { config } from "dotenv";
import Stripe from "stripe";
import {
  STRIPE_EXTRA_PRICE_ENV_VAR_NAMES,
  TRACKIT_STRIPE_DEFAULT_PRICE_IDS,
  getStripePriceEnvVarNames,
  getStripeResolvedPriceSlots,
} from "../src/lib/stripe-config";

config({ path: ".env.local" });
config();

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

type Row = {
  source: string;
  priceId: string;
};

type CheckResult = {
  source: string;
  priceId: string;
  ok: boolean;
  amount: string;
  error?: string;
};

function formatAmount(price: Stripe.Price): string {
  if (price.unit_amount == null) return "—";
  const value = (price.unit_amount / 100).toFixed(2);
  const currency = price.currency.toUpperCase();
  const interval = price.recurring?.interval;
  return interval ? `${value} ${currency}/${interval}` : `${value} ${currency}`;
}

function collectRows(): Row[] {
  const rows: Row[] = [];
  const seen = new Set<string>();

  const push = (source: string, priceId: string) => {
    const trimmed = priceId.trim();
    if (!trimmed) return;
    const key = `${source}\0${trimmed}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ source, priceId: trimmed });
  };

  for (const name of getStripePriceEnvVarNames()) {
    const value = process.env[name]?.trim();
    if (value) push(name, value);
  }

  for (const name of STRIPE_EXTRA_PRICE_ENV_VAR_NAMES) {
    const value = process.env[name]?.trim();
    if (value) push(name, value);
  }

  for (const [key, priceId] of Object.entries(TRACKIT_STRIPE_DEFAULT_PRICE_IDS)) {
    push(`TRACKIT_STRIPE_DEFAULT_PRICE_IDS.${key}`, priceId);
  }

  for (const slot of getStripeResolvedPriceSlots()) {
    const resolved = slot.resolve().trim();
    if (resolved) {
      push(`resolve:${slot.label}`, resolved);
    } else {
      rows.push({
        source: `resolve:${slot.label} (${slot.envVarCandidates.join(" | ")})`,
        priceId: "",
      });
    }
  }

  return rows;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    console.error(`${RED}STRIPE_SECRET_KEY is missing — cannot verify prices.${RESET}`);
    process.exit(1);
  }

  const stripe = new Stripe(secretKey);
  const rows = collectRows();
  const priceCache = new Map<string, { ok: boolean; amount: string; error?: string }>();
  const results: CheckResult[] = [];

  for (const row of rows) {
    if (!row.priceId) {
      results.push({
        source: row.source,
        priceId: "(empty)",
        ok: false,
        amount: "—",
        error: "resolved price ID is empty",
      });
      continue;
    }

    if (priceCache.has(row.priceId)) {
      const cached = priceCache.get(row.priceId)!;
      results.push({ source: row.source, priceId: row.priceId, ...cached });
      continue;
    }

    try {
      const price = await stripe.prices.retrieve(row.priceId);
      const entry = { ok: true as const, amount: formatAmount(price) };
      priceCache.set(row.priceId, entry);
      results.push({ source: row.source, priceId: row.priceId, ...entry });
    } catch (e: unknown) {
      const message =
        e instanceof Stripe.errors.StripeError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      const entry = { ok: false as const, amount: "—", error: message };
      priceCache.set(row.priceId, entry);
      results.push({ source: row.source, priceId: row.priceId, ...entry });
    }
  }

  const colSource = Math.min(
    52,
    Math.max(20, ...results.map((r) => r.source.length))
  );
  const colPrice = Math.max(28, ...results.map((r) => r.priceId.length));
  const colStatus = 12;

  console.log("");
  console.log(
    `${pad("VARIABLE / SOURCE", colSource)} | ${pad("PRICE ID", colPrice)} | ${pad("STATUS", colStatus)} | MONTANT`
  );
  console.log(
    `${"-".repeat(colSource)}-+-${"-".repeat(colPrice)}-+-${"-".repeat(colStatus)}-+---------`
  );

  for (const r of results) {
    const status = r.ok
      ? `${GREEN}✅ OK${RESET}      `
      : `${RED}❌ MANQUANT${RESET}`;
    console.log(
      `${pad(r.source, colSource)} | ${pad(r.priceId, colPrice)} | ${status} | ${r.amount}${r.error ? ` ${DIM}(${r.error})${RESET}` : ""}`
    );
  }

  const broken = results.filter((r) => !r.ok);
  console.log("");
  if (broken.length === 0) {
    console.log(`${GREEN}Tous les price IDs sont valides pour ce compte Stripe.${RESET}`);
    return;
  }

  console.error(
    `${RED}${broken.length} price ID(s) invalide(s) ou manquant(s):${RESET}`
  );
  for (const r of broken) {
    console.error(
      `${RED}  • ${r.source} → ${r.priceId}${r.error ? ` (${r.error})` : ""}${RESET}`
    );
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(RED, e, RESET);
  process.exit(1);
});
