-- Full workspace delegation.
-- haytam@trackit works inside rayan@trackit's workspace while retaining
-- a distinct authenticated identity/profile.

create table if not exists public.workspace_members (
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now(),
  primary key (owner_id, member_id),
  check (owner_id <> member_id)
);

create index if not exists workspace_members_member_idx
  on public.workspace_members (member_id);

alter table public.workspace_members enable row level security;

drop policy if exists "Workspace owners and members read membership" on public.workspace_members;
create policy "Workspace owners and members read membership"
  on public.workspace_members for select
  using (auth.uid() = owner_id or auth.uid() = member_id);

create or replace function public.has_workspace_access(target_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() = target_owner_id
    or exists (
      select 1
      from public.workspace_members wm
      where wm.owner_id = target_owner_id
        and wm.member_id = auth.uid()
        and wm.role = 'admin'
    );
$$;

revoke all on function public.has_workspace_access(uuid) from public;
grant execute on function public.has_workspace_access(uuid) to authenticated;

-- Link the requested pair when both accounts already exist.
insert into public.workspace_members (owner_id, member_id, role)
select owner_user.id, member_user.id, 'admin'
from auth.users owner_user
cross join auth.users member_user
where lower(owner_user.email) = 'rayan@trackit'
  and lower(member_user.email) = 'haytam@trackit'
on conflict (owner_id, member_id) do update set role = excluded.role;

-- Also link them automatically if either account is created later.
create or replace function public.sync_trackit_workspace_admin_pair()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  owner_user_id uuid;
  member_user_id uuid;
begin
  if lower(coalesce(new.email, '')) not in ('rayan@trackit', 'haytam@trackit') then
    return new;
  end if;

  select id into owner_user_id
  from auth.users
  where lower(email) = 'rayan@trackit'
  limit 1;

  select id into member_user_id
  from auth.users
  where lower(email) = 'haytam@trackit'
  limit 1;

  if owner_user_id is not null and member_user_id is not null then
    insert into public.workspace_members (owner_id, member_id, role)
    values (owner_user_id, member_user_id, 'admin')
    on conflict (owner_id, member_id) do update set role = excluded.role;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_trackit_workspace_admin_pair_trigger on auth.users;
create trigger sync_trackit_workspace_admin_pair_trigger
after insert or update of email on auth.users
for each row execute function public.sync_trackit_workspace_admin_pair();

-- Add a permissive full-access policy to each workspace-owned table that exists.
do $$
declare
  item record;
  policy_name text;
begin
  for item in
    select *
    from (values
      ('profiles', 'id'),
      ('analyses', 'user_id'),
      ('creators', 'user_id'),
      ('campaigns', 'user_id'),
      ('campaign_creators', 'user_id'),
      ('outreach_history', 'user_id'),
      ('payouts', 'user_id'),
      ('sales', 'user_id'),
      ('discovery_saved', 'user_id'),
      ('discovery_folders', 'user_id'),
      ('scripts', 'brand_id'),
      ('affiliate_links', 'brand_id'),
      ('niche_requests', 'user_id'),
      ('creator_lookup_requests', 'user_id'),
      ('user_referral_attributions', 'user_id'),
      ('sales_suppressions', 'user_id'),
      ('campaign_content', 'brand_id'),
      ('creator_links', 'brand_id')
    ) as owned(table_name, owner_column)
  loop
    if to_regclass('public.' || item.table_name) is not null then
      policy_name := 'workspace_admin_full_access_' || item.table_name;
      execute format('drop policy if exists %I on public.%I', policy_name, item.table_name);
      execute format(
        'create policy %I on public.%I for all using (public.has_workspace_access(%I)) with check (public.has_workspace_access(%I))',
        policy_name,
        item.table_name,
        item.owner_column,
        item.owner_column
      );
    end if;
  end loop;
end
$$;

-- Join tables whose owner is reached through a parent row.
do $$
begin
  if to_regclass('public.discovery_folder_items') is not null then
    drop policy if exists workspace_admin_full_access_discovery_folder_items
      on public.discovery_folder_items;
    create policy workspace_admin_full_access_discovery_folder_items
      on public.discovery_folder_items for all
      using (
        exists (
          select 1 from public.discovery_folders f
          where f.id = folder_id
            and public.has_workspace_access(f.user_id)
        )
      )
      with check (
        exists (
          select 1 from public.discovery_folders f
          where f.id = folder_id
            and public.has_workspace_access(f.user_id)
        )
      );
  end if;

  if to_regclass('public.link_clicks') is not null then
    drop policy if exists workspace_admin_read_link_clicks on public.link_clicks;
    create policy workspace_admin_read_link_clicks
      on public.link_clicks for select
      using (
        exists (
          select 1 from public.affiliate_links al
          where al.id = link_id
            and public.has_workspace_access(al.brand_id)
        )
      );
  end if;
end
$$;

-- Allow delegated admins to manage files stored under the owner's UUID path.
drop policy if exists "Workspace admins manage owner files" on storage.objects;
create policy "Workspace admins manage owner files"
  on storage.objects for all
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.member_id = auth.uid()
        and wm.role = 'admin'
        and (
          (storage.foldername(name))[1] = wm.owner_id::text
          or (storage.foldername(name))[2] = wm.owner_id::text
        )
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.member_id = auth.uid()
        and wm.role = 'admin'
        and (
          (storage.foldername(name))[1] = wm.owner_id::text
          or (storage.foldername(name))[2] = wm.owner_id::text
        )
    )
  );
