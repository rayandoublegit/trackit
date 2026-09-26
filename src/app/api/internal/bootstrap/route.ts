import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SQL = `
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  avatar_url text,
  account_type text default 'brand',
  plan text default 'free',
  business_name text,
  created_at timestamptz default now()
);
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists account_type text default 'brand';
alter table public.profiles add column if not exists plan text default 'free';
alter table public.profiles add column if not exists business_name text;
alter table public.profiles enable row level security;
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
grant select, insert, update on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name, plan, account_type)
  values (new.id, split_part(new.email, '@', 1), coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), 'free', 'brand')
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create table if not exists public.creators_index (
  username text primary key,
  display_name text,
  avatar_url text,
  platform text,
  followers integer default 0,
  engagement_rate numeric default 0,
  engagement_by_follower numeric default 0,
  avg_views integer default 0,
  avg_likes integer default 0,
  avg_comments integer default 0,
  avg_shares integer default 0,
  views_per_follower numeric default 0,
  posts_analyzed integer default 0,
  post_frequency numeric default 0,
  last_post_at timestamptz,
  authenticity_score integer default 40,
  quality_status text default 'ok',
  bio text default '',
  email text,
  niches text[] default '{}',
  primary_niche text,
  language text default 'unknown',
  location text,
  country_code text,
  is_curated boolean default false,
  enrichment_status text default 'enriched',
  video_thumbnails jsonb default '[]',
  top_videos jsonb default '[]',
  value_score integer default 0,
  last_scraped_at timestamptz
);
alter table public.creators_index disable row level security;
grant select on public.creators_index to anon, authenticated;
`;

async function run(url: string, key: string, path: string, body: unknown) {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { path, status: response.status, hint: text.slice(0, 180).replace(/[A-Za-z0-9_\-]{24,}/g, "…") };
}

export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const attempts = [
    await run(url, key, "/pg/query", { query: SQL }),
    await run(url, key, "/pg-meta/default/query", { query: SQL }),
  ];
  const sqlFile = join(process.cwd(), "supabase/migrations/20260923_000040_gifting.sql");
  let gifting = "missing";
  try {
    const giftSql = readFileSync(sqlFile, "utf8");
    const gift = await run(url, key, "/pg/query", { query: giftSql });
    gifting = String(gift.status);
    attempts.push(gift);
  } catch {
    gifting = "unread";
  }
  const ok = attempts.some((attempt) => attempt.status >= 200 && attempt.status < 300);
  return NextResponse.json({ ok, gifting, attempts });
}
