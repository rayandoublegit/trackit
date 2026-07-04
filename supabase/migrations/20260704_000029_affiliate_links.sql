-- Short affiliate links (/l/{slug}) with click tracking.
create table if not exists public.affiliate_links (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  brand_id uuid not null references public.profiles(id) on delete cascade,
  creator_username text not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  destination_url text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint affiliate_links_slug_unique unique (slug)
);

create index if not exists affiliate_links_brand_idx on public.affiliate_links (brand_id);
create index if not exists affiliate_links_campaign_idx on public.affiliate_links (campaign_id);
create index if not exists affiliate_links_brand_creator_idx on public.affiliate_links (brand_id, creator_username);

create table if not exists public.link_clicks (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.affiliate_links(id) on delete cascade,
  ref_code text,
  country text,
  device text,
  referrer_domain text,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists link_clicks_link_created_idx on public.link_clicks (link_id, created_at desc);

alter table public.affiliate_links enable row level security;
alter table public.link_clicks enable row level security;

drop policy if exists "Brands read own affiliate links" on public.affiliate_links;
create policy "Brands read own affiliate links"
  on public.affiliate_links for select
  using (auth.uid() = brand_id);

drop policy if exists "Brands insert own affiliate links" on public.affiliate_links;
create policy "Brands insert own affiliate links"
  on public.affiliate_links for insert
  with check (auth.uid() = brand_id);

drop policy if exists "Brands read clicks on own links" on public.link_clicks;
create policy "Brands read clicks on own links"
  on public.link_clicks for select
  using (
    exists (
      select 1 from public.affiliate_links al
      where al.id = link_clicks.link_id and al.brand_id = auth.uid()
    )
  );
