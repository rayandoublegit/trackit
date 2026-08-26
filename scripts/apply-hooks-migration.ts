/**
 * Applique la migration Hooks sur Supabase Trackit.
 * SQL: supabase/migrations/20260825_000034_hooks.sql
 */
import { config } from "dotenv";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

config({ path: ".env.local", override: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlFile = path.resolve(__dirname, "../supabase/migrations/20260825_000034_hooks.sql");
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
  const { error: hooksErr } = await sb.from("hooks").select("id").limit(1);
  if (hooksErr) return false;
  const { error: readsErr } = await sb.from("hook_reads").select("hook_id").limit(1);
  return !readsErr;
}

async function main() {
  if (projectRef && projectRef !== TRACKIT_REF) {
    console.error(`✗ Unexpected project ${projectRef}`);
    process.exit(1);
  }
  if (await verify()) {
    console.log("✓ Migration Hooks déjà appliquée.");
    return;
  }
  if (!dbUrl) {
    console.error("✗ Schema Hooks absent.\n");
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
  execSync(`npx supabase db query --file "${sqlFile}" --db-url "${dbUrl}"`, {
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
  });
  if (await verify()) console.log("✓ Migration Hooks appliquée.");
  else {
    console.error("✗ Schema toujours incomplet");
    process.exit(1);
  }
}

void main();
