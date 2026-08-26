/**
 * Applique la migration RPM campaigns sur Supabase Trackit.
 *
 * Option A — SQL Editor (recommandé) :
 *   Coller supabase/migrations/20260817_000033_rpm_campaigns.sql
 *
 * Option B — CLI (si SUPABASE_DB_URL est dans .env.local) :
 *   npx tsx scripts/apply-rpm-migration.ts
 */
import { config } from "dotenv";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

config({ path: ".env.local", override: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlFile = path.resolve(__dirname, "../supabase/migrations/20260817_000033_rpm_campaigns.sql");
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
  const { error: colErr } = await sb.from("campaigns").select("rpm_rate").limit(1);
  if (colErr) return false;
  const { error: tableErr } = await sb.from("rpm_accruals").select("id").limit(1);
  if (tableErr) return false;
  const { error: linkErr } = await sb
    .from("campaign_content")
    .select("views_baseline, views_last_settled, rpm_accrued")
    .limit(1);
  return !linkErr;
}

async function main() {
  if (projectRef && projectRef !== TRACKIT_REF) {
    console.error(`✗ Unexpected project ref ${projectRef} (expected ${TRACKIT_REF}).`);
    process.exit(1);
  }

  if (await verify()) {
    console.log("✓ Migration RPM déjà appliquée.");
    return;
  }

  if (!dbUrl) {
    console.error("✗ Schema RPM absent (rpm_rate / rpm_accruals / views_baseline).\n");
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

  console.log("Application de la migration RPM…");
  execSync(`npx supabase db query --file "${sqlFile}" --db-url "${dbUrl}"`, {
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
  });

  if (await verify()) {
    console.log("✓ Migration RPM appliquée.");
  } else {
    console.error("✗ Migration exécutée mais le schema RPM est toujours incomplet.");
    process.exit(1);
  }
}

void main();
