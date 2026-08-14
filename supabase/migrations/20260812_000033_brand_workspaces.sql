-- Brand workspaces — FLAT migration (no DO blocks, SQL Editor safe).
-- Tables/columns verified against the live Trackit schema. Safe to re-run.

-- 1) Table
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspaces_owner_id_idx on public.workspaces (owner_id);

alter table public.profiles
  add column if not exists active_workspace_id uuid references public.workspaces(id) on delete set null;

-- 2) One default workspace per non-creator profile (id = profile id)
insert into public.workspaces (id, owner_id, name, avatar_url)
select
  p.id,
  p.id,
  coalesce(nullif(trim(p.business_name), ''), nullif(trim(p.full_name), ''), 'Workspace'),
  p.avatar_url
from public.profiles p
where coalesce(p.account_type, 'brand') is distinct from 'creator'
on conflict (id) do nothing;

-- 3) Workspaces for every remaining row owner (creators / orphans) so backfill never FK-fails
insert into public.workspaces (id, owner_id, name, avatar_url)
select distinct o.owner, o.owner,
  coalesce(nullif(trim(p.business_name), ''), nullif(trim(p.full_name), ''), 'Workspace'),
  p.avatar_url
from (
  select user_id as owner from public.campaigns where user_id is not null
  union select user_id from public.creators where user_id is not null
  union select user_id from public.sales where user_id is not null
  union select user_id from public.campaign_creators where user_id is not null
  union select user_id from public.outreach_history where user_id is not null
  union select user_id from public.payouts where user_id is not null
  union select user_id from public.discovery_saved where user_id is not null
  union select user_id from public.discovery_folders where user_id is not null
  union select user_id from public.shopify_stores where user_id is not null
  union select user_id from public.sales_suppressions where user_id is not null
  union select brand_id from public.affiliate_links where brand_id is not null
  union select brand_id from public.scripts where brand_id is not null
  union select brand_id from public.campaign_content where brand_id is not null
  union select brand_id from public.creator_links where brand_id is not null
  union select brand_id from public.creator_content where brand_id is not null
) o
left join public.profiles p on p.id = o.owner
where exists (select 1 from auth.users u where u.id = o.owner)
  and not exists (select 1 from public.workspaces w where w.id = o.owner)
on conflict (id) do nothing;

update public.profiles p
set active_workspace_id = p.id
where p.active_workspace_id is null
  and exists (select 1 from public.workspaces w where w.id = p.id);

-- 4) workspace_id columns + backfill + index (user_id tables)
alter table public.campaigns add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
update public.campaigns t set workspace_id = t.user_id where t.workspace_id is null and t.user_id is not null and exists (select 1 from public.workspaces w where w.id = t.user_id);
create index if not exists campaigns_workspace_id_idx on public.campaigns (workspace_id);

alter table public.creators add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
update public.creators t set workspace_id = t.user_id where t.workspace_id is null and t.user_id is not null and exists (select 1 from public.workspaces w where w.id = t.user_id);
create index if not exists creators_workspace_id_idx on public.creators (workspace_id);

alter table public.sales add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
update public.sales t set workspace_id = t.user_id where t.workspace_id is null and t.user_id is not null and exists (select 1 from public.workspaces w where w.id = t.user_id);
create index if not exists sales_workspace_id_idx on public.sales (workspace_id);

alter table public.campaign_creators add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
update public.campaign_creators t set workspace_id = t.user_id where t.workspace_id is null and t.user_id is not null and exists (select 1 from public.workspaces w where w.id = t.user_id);
create index if not exists campaign_creators_workspace_id_idx on public.campaign_creators (workspace_id);

alter table public.outreach_history add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
update public.outreach_history t set workspace_id = t.user_id where t.workspace_id is null and t.user_id is not null and exists (select 1 from public.workspaces w where w.id = t.user_id);
create index if not exists outreach_history_workspace_id_idx on public.outreach_history (workspace_id);

alter table public.payouts add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
update public.payouts t set workspace_id = t.user_id where t.workspace_id is null and t.user_id is not null and exists (select 1 from public.workspaces w where w.id = t.user_id);
create index if not exists payouts_workspace_id_idx on public.payouts (workspace_id);

alter table public.discovery_saved add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
update public.discovery_saved t set workspace_id = t.user_id where t.workspace_id is null and t.user_id is not null and exists (select 1 from public.workspaces w where w.id = t.user_id);
create index if not exists discovery_saved_workspace_id_idx on public.discovery_saved (workspace_id);

alter table public.discovery_folders add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
update public.discovery_folders t set workspace_id = t.user_id where t.workspace_id is null and t.user_id is not null and exists (select 1 from public.workspaces w where w.id = t.user_id);
create index if not exists discovery_folders_workspace_id_idx on public.discovery_folders (workspace_id);

alter table public.shopify_stores add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
update public.shopify_stores t set workspace_id = t.user_id where t.workspace_id is null and t.user_id is not null and exists (select 1 from public.workspaces w where w.id = t.user_id);
create index if not exists shopify_stores_workspace_id_idx on public.shopify_stores (workspace_id);

alter table public.sales_suppressions add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
update public.sales_suppressions t set workspace_id = t.user_id where t.workspace_id is null and t.user_id is not null and exists (select 1 from public.workspaces w where w.id = t.user_id);
create index if not exists sales_suppressions_workspace_id_idx on public.sales_suppressions (workspace_id);

-- 5) workspace_id columns + backfill + index (brand_id tables)
alter table public.affiliate_links add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
update public.affiliate_links t set workspace_id = t.brand_id where t.workspace_id is null and t.brand_id is not null and exists (select 1 from public.workspaces w where w.id = t.brand_id);
create index if not exists affiliate_links_workspace_id_idx on public.affiliate_links (workspace_id);

alter table public.scripts add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
update public.scripts t set workspace_id = t.brand_id where t.workspace_id is null and t.brand_id is not null and exists (select 1 from public.workspaces w where w.id = t.brand_id);
create index if not exists scripts_workspace_id_idx on public.scripts (workspace_id);

alter table public.campaign_content add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
update public.campaign_content t set workspace_id = t.brand_id where t.workspace_id is null and t.brand_id is not null and exists (select 1 from public.workspaces w where w.id = t.brand_id);
create index if not exists campaign_content_workspace_id_idx on public.campaign_content (workspace_id);

alter table public.creator_links add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
update public.creator_links t set workspace_id = t.brand_id where t.workspace_id is null and t.brand_id is not null and exists (select 1 from public.workspaces w where w.id = t.brand_id);
create index if not exists creator_links_workspace_id_idx on public.creator_links (workspace_id);

alter table public.creator_content add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
update public.creator_content t set workspace_id = t.brand_id where t.workspace_id is null and t.brand_id is not null and exists (select 1 from public.workspaces w where w.id = t.brand_id);
create index if not exists creator_content_workspace_id_idx on public.creator_content (workspace_id);

-- 6) RLS
alter table public.workspaces enable row level security;

drop policy if exists workspaces_select_own on public.workspaces;
create policy workspaces_select_own on public.workspaces
  for select using (
    owner_id = auth.uid()
    or public.has_workspace_access(owner_id)
  );

drop policy if exists workspaces_insert_own on public.workspaces;
create policy workspaces_insert_own on public.workspaces
  for insert with check (owner_id = auth.uid());

drop policy if exists workspaces_update_own on public.workspaces;
create policy workspaces_update_own on public.workspaces
  for update using (
    owner_id = auth.uid()
    or public.has_workspace_access(owner_id)
  );

drop policy if exists workspaces_delete_own on public.workspaces;
create policy workspaces_delete_own on public.workspaces
  for delete using (owner_id = auth.uid() and id <> owner_id);

-- 7) Unicity per workspace (default constraint names; ignore if named differently)
-- NOTE: the indexes must NOT be partial — PostgREST upserts (ON CONFLICT) cannot
-- infer partial unique indexes and fail with "no unique or exclusion constraint".
alter table public.creators drop constraint if exists creators_user_id_handle_key;
drop index if exists public.creators_user_id_handle_key;
drop index if exists public.creators_workspace_id_handle_uidx;
create unique index if not exists creators_workspace_id_handle_uidx
  on public.creators (workspace_id, handle);

alter table public.discovery_saved drop constraint if exists discovery_saved_user_id_creator_username_key;
drop index if exists public.discovery_saved_workspace_username_uidx;
create unique index if not exists discovery_saved_workspace_username_uidx
  on public.discovery_saved (workspace_id, creator_username);
