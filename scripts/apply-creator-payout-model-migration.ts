/**
 * Applique payout_model / rpm_rate / rpm_per_views sur creators (Trackit).
 *
 * Option A — SQL Editor :
 *   Coller supabase/migrations/20260826_000039_creator_payout_model.sql
 *
 * Option B — CLI (si SUPABASE_DB_URL est dans .env.local) :
 *   npx tsx scripts/apply-creator-payout-model-migration.ts
 */
import { config } from "dotenv";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

config({ path: ".env.local", override: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlFile = path.resolve(__dirname, "../supabase/migrations/20260826_000039_creator_payout_model.sql");
const dbUrl = process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim();
const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\./)?.[1];

const TRACKIT_REF = "tokpuhzjhysqxwjkxfya";
const ZESCALE_REF = "utqlwiksnimfbuylzwzi";

async function verify(): Promise<boolean> {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  if (url.includes(ZESCALE_REF)) {
    throw new Error("Refusing to run against Zescale — restore Trackit credentials.");
  }
  const sb = createClient(url, key);
  const { error } = await sb.from("creators").select("payout_model, rpm_rate, rpm_per_views").limit(1);
  return !error;
}

async function main() {
  if (projectRef && projectRef !== TRACKIT_REF) {
    console.error(`✗ Unexpected project ref ${projectRef} (expected ${TRACKIT_REF}).`);
    process.exit(1);
  }

  if (await verify()) {
    console.log("✓ Migration payout_model déjà appliquée.");
    return;
  }

  if (!dbUrl) {
    console.error("✗ Colonnes payout_model / rpm_rate / rpm_per_views absentes sur creators.\n");
    if (projectRef) {
      console.log(`Ouvrez l’éditeur SQL : https://supabase.com/dashboard/project/${projectRef}/sql/new`);
    }
    console.log(`Collez puis exécutez :\n  ${sqlFile}\n`);
    console.log("--- SQL ---");
    console.log(readFileSync(sqlFile, "utf8"));
    process.exit(1);
  }

  if (dbUrl.includes(ZESCALE_REF)) {
    console.error("✗ Refusing DB URL that looks like Zescale.");
    process.exit(1);
  }

  console.log("Application de la migration creator payout_model…");
  execSync(`npx supabase db query --file "${sqlFile}" --db-url "${dbUrl}"`, {
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
  });

  if (await verify()) {
    console.log("✓ Migration payout_model appliquée.");
  } else {
    console.error("✗ Migration exécutée mais vérif échouée.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
