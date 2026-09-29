// Real Postgres (PGlite, in-process) with the Supabase pieces the migrations
// expect: roles with Supabase's default grants, auth.users/auth.uid(), storage.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "..", "supabase", "migrations");

// Production created these by hand; no migration versions them. They run first
// (base tables) and right after profiles is created (profile columns).
const BASE = join(HERE, "00_base_tables_not_in_migrations.sql");
const PROFILE_DRIFT = join(HERE, "01_profile_columns_not_in_migrations.sql");

export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$ select coalesce(current_setting('request.jwt.claim.role', true), 'anon') $$;
    create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create or replace function auth.email() returns text language sql stable as $$ select (auth.jwt()->>'email') $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[], owner uuid, created_at timestamptz default now());
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, created_at timestamptz default now());
    create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
    alter table storage.objects enable row level security;
  `);
  return db;
}

/** Migration files in apply order. `_RESUME` files are manual retries of an earlier file. */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql") && !f.includes("_RESUME"))
    .sort();
}

export function readMigration(file: string): string {
  // PGlite ships without pgcrypto; gen_random_uuid() is built into Postgres 13+.
  return readFileSync(join(MIGRATIONS, file), "utf8").replace(/create extension if not exists pgcrypto;?/gi, "");
}

export async function migrate(db: PGlite, skip: (file: string) => boolean = () => false) {
  const failures: { file: string; error: string }[] = [];
  await db.exec(readFileSync(BASE, "utf8"));
  for (const file of migrationFiles()) {
    if (skip(file)) continue;
    try {
      await db.exec(readMigration(file));
    } catch (e) {
      failures.push({ file, error: (e as Error).message });
    }
    if (file.includes("create_profiles_table")) await db.exec(readFileSync(PROFILE_DRIFT, "utf8"));
  }
  return failures;
}
