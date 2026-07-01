/**
 * Applique la migration creator_content sur Supabase.
 *
 * Option A — SQL Editor (recommandé) :
 *   1. https://supabase.com/dashboard → SQL → New query
 *   2. Coller supabase/migrations/20260629_000023_creator_content.sql
 *   3. Run
 *
 * Option B — CLI (si SUPABASE_DB_URL est dans .env.local) :
 *   npm run db:creator-content
 */
import { config } from "dotenv";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

config({ path: ".env.local" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlFile = path.resolve(__dirname, "../supabase/migrations/20260629_000023_creator_content.sql");
const dbUrl = process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim();
const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\./)?.[1];

async function verify(): Promise<boolean> {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const sb = createClient(url, key);
  const { error } = await sb.from("creator_content").select("id").limit(1);
  return !error;
}

async function main() {
  if (await verify()) {
    console.log("✓ La table public.creator_content existe déjà.");
    return;
  }

  if (!dbUrl) {
    console.error("✗ Table public.creator_content absente.\n");
    if (projectRef) {
      console.log(`Ouvrez l’éditeur SQL : https://supabase.com/dashboard/project/${projectRef}/sql/new`);
    }
    console.log(`Collez puis exécutez le fichier :\n  ${sqlFile}\n`);
    console.log(
      "Astuce : ajoutez SUPABASE_DB_URL (Settings → Database → Connection string) dans .env.local, puis relancez npm run db:creator-content",
    );
    process.exit(1);
  }

  console.log("Application de la migration creator_content…");
  execSync(`npx supabase db query --file "${sqlFile}" --db-url "${dbUrl}"`, {
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
  });

  if (await verify()) {
    console.log("✓ Migration appliquée — creator_content prête.");
  } else {
    console.error("✗ Migration exécutée mais la table est toujours introuvable. Réessayez dans le SQL Editor.");
    process.exit(1);
  }
}

void main();
