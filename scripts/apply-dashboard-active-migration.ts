/**
 * Applique la migration creators.dashboard_active sur Supabase.
 *
 * Option A — SQL Editor (recommandé) :
 *   Coller supabase/migrations/20260630_000025_creators_dashboard_active.sql
 *
 * Option B — CLI (si SUPABASE_DB_URL est dans .env.local) :
 *   npm run db:dashboard-active
 */
import { config } from "dotenv";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

config({ path: ".env.local" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlFile = path.resolve(__dirname, "../supabase/migrations/20260630_000025_creators_dashboard_active.sql");
const dbUrl = process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim();
const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\./)?.[1];

async function verify(): Promise<boolean> {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const sb = createClient(url, key);
  const { error } = await sb.from("creators").select("dashboard_active").limit(1);
  return !error;
}

async function main() {
  if (await verify()) {
    console.log("✓ La colonne creators.dashboard_active existe déjà.");
    return;
  }

  if (!dbUrl) {
    console.error("✗ Colonne creators.dashboard_active absente.\n");
    if (projectRef) {
      console.log(`Ouvrez l’éditeur SQL : https://supabase.com/dashboard/project/${projectRef}/sql/new`);
    }
    console.log(`Collez puis exécutez :\n  ${sqlFile}\n`);
    process.exit(1);
  }

  console.log("Application de la migration dashboard_active…");
  execSync(`npx supabase db query --file "${sqlFile}" --db-url "${dbUrl}"`, {
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
  });

  if (await verify()) {
    console.log("✓ Migration appliquée.");
  } else {
    console.error("✗ Migration exécutée mais la colonne est toujours absente.");
    process.exit(1);
  }
}

void main();
