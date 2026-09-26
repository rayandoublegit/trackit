-- Gifting, creator wishlists, frozen contracts, manual shipments and ad rights.
-- Affiliate, RPM and payout tables are left untouched.

create table if not exists public.gift_wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.gift_wishlist_creators (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.gift_wishlists(id) on delete cascade,
  handle text not null,
  platform text not null check (platform in ('tiktok', 'instagram')),
  created_at timestamptz not null default now(),
  unique (wishlist_id, platform, handle)
);

create table if not exists public.gift_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  name text not null,
  product text not null,
  brief text not null,
  status text not null default 'active' check (status in ('draft', 'active', 'completed')),
  video_count integer not null default 1 check (video_count between 1 and 20),
  deadline date not null,
  fixed_fee_cents integer not null default 0 check (fixed_fee_cents >= 0),
  currency text not null default 'EUR',
  allow_ads boolean not null default false,
  rights_days integer not null default 0 check (rights_days >= 0),
  territories text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.gift_missions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.gift_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  creator_handle text not null,
  creator_platform text not null check (creator_platform in ('tiktok', 'instagram')),
  creator_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'invited',
  contract_text text not null,
  signed_name text,
  signed_at timestamptz,
  address jsonb,
  carrier text,
  tracking_number text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, creator_platform, creator_handle)
);

create table if not exists public.gift_videos (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null unique references public.gift_missions(id) on delete cascade,
  name text not null,
  status text not null default 'pending' check (status in ('pending', 'changes_requested', 'approved')),
  feedback text not null default '',
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists gift_missions_creator_user_idx on public.gift_missions (creator_user_id);
create index if not exists gift_missions_handle_idx on public.gift_missions (creator_handle);
create index if not exists gift_campaigns_workspace_idx on public.gift_campaigns (workspace_id);

alter table public.gift_wishlists enable row level security;
alter table public.gift_wishlist_creators enable row level security;
alter table public.gift_campaigns enable row level security;
alter table public.gift_missions enable row level security;
alter table public.gift_videos enable row level security;

create policy "Brands manage their gift wishlists"
  on public.gift_wishlists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Brands manage wishlist creators"
  on public.gift_wishlist_creators for all
  using (exists (
    select 1 from public.gift_wishlists w
    where w.id = wishlist_id and w.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.gift_wishlists w
    where w.id = wishlist_id and w.user_id = auth.uid()
  ));

create policy "Brands manage gift campaigns"
  on public.gift_campaigns for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Brand and invited creator read gift missions"
  on public.gift_missions for select
  using (auth.uid() = user_id or auth.uid() = creator_user_id);

create policy "Brands write gift missions"
  on public.gift_missions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Creators update their claimed gift missions"
  on public.gift_missions for update
  using (auth.uid() = creator_user_id)
  with check (auth.uid() = creator_user_id);

create policy "Brand and creator read gift videos"
  on public.gift_videos for select
  using (exists (
    select 1 from public.gift_missions m
    where m.id = mission_id and (m.user_id = auth.uid() or m.creator_user_id = auth.uid())
  ));

create policy "Brand and creator write gift videos"
  on public.gift_videos for all
  using (exists (
    select 1 from public.gift_missions m
    where m.id = mission_id and (m.user_id = auth.uid() or m.creator_user_id = auth.uid())
  ))
  with check (exists (
    select 1 from public.gift_missions m
    where m.id = mission_id and (m.user_id = auth.uid() or m.creator_user_id = auth.uid())
  ));
