-- LOCAL TEST ONLY: base tables that production created by hand and no migration versions.
create table if not exists public.creators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  handle text not null,
  full_name text,
  email text,
  avatar_url text,
  platform text,
  commission_rate numeric,
  discount_code text,
  status text default 'active',
  linked_user_id uuid references auth.users(id) on delete set null,
  needs_review boolean default false,
  created_at timestamptz not null default now(),
  constraint creators_user_id_handle_key unique (user_id, handle)
);
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text,
  status text default 'active',
  platform text,
  description text,
  commission_rate numeric,
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);
create table if not exists public.creators_index (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  platform text,
  followers bigint,
  engagement_rate numeric,
  niches text[] default '{}',
  display_name text,
  avatar_url text,
  bio text,
  avg_views bigint,
  created_at timestamptz not null default now()
);
create table if not exists public.scripts (id uuid primary key default gen_random_uuid(), brand_id uuid, created_at timestamptz default now());
create table if not exists public.shopify_stores (id uuid primary key default gen_random_uuid(), user_id uuid, created_at timestamptz default now());
