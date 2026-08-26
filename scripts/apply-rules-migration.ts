/**
 * Applique la migration Règles sur Supabase Trackit.
 * SQL: supabase/migrations/20260825_000037_brand_rules.sql
 */
import { config } from "dotenv";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

config({ path: ".env.local", override: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlFile = path.resolve(__dirname, "../supabase/migrations/20260825_000037_brand_rules.sql");
const dbUrl = process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim();
const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\./)?.[1];
const TRACKIT_REF = "tokpuhzjhysqxwjkxfya";
const ZESCALE_REF = "utqlwiksnimfbuylzwzi";

async function verify(): Promise<boolean> {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  if (url.includes(ZESCALE_REF)) throw new Error("Refusing Zescale");
  const sb = createClient(url, key);
  const { error } = await sb.from("brand_rules").select("brand_id").limit(1);
  return !error;
}

async function main() {
  if (projectRef && projectRef !== TRACKIT_REF) {
    console.error(`✗ Unexpected project ${projectRef}`);
    process.exit(1);
  }
  if (await verify()) {
    console.log("✓ Migration Règles déjà appliquée.");
    return;
  }
  if (!dbUrl) {
    console.error("✗ Schema Règles absent.\n");
    if (projectRef) {
      console.log(`SQL Editor: https://supabase.com/dashboard/project/${projectRef}/sql/new`);
    }
    console.log(`Fichier:\n  ${sqlFile}\n`);
    console.log("--- SQL ---\n");
    console.log(readFileSync(sqlFile, "utf8"));
    process.exit(1);
  }
  if (dbUrl.includes(ZESCALE_REF)) {
    console.error("✗ Refusing Zescale DB URL");
    process.exit(1);
  }
  const sql = readFileSync(sqlFile, "utf8");
  execSync(`psql "${dbUrl}" -v ON_ERROR_STOP=1 -c ${JSON.stringify(sql)}`, { stdio: "inherit" });
  if (!(await verify())) {
    console.error("✗ Table brand_rules toujours absente après apply");
    process.exit(1);
  }
  console.log("✓ Migration Règles appliquée.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
