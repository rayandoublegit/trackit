-- Communities (Telegram-style groups for brand ↔ creator dashboards)

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  avatar_url text,
  members_can_post boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists communities_brand_created_idx
  on public.communities (brand_id, created_at desc);

create table if not exists public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  can_post boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create index if not exists community_members_user_idx
  on public.community_members (user_id, joined_at desc);

create table if not exists public.community_messages (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text,
  image_url text,
  reply_to_id uuid references public.community_messages(id) on delete set null,
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint community_messages_has_content check (
    (body is not null and length(trim(body)) > 0) or image_url is not null
  )
);

create index if not exists community_messages_community_created_idx
  on public.community_messages (community_id, created_at desc);

alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.community_messages enable row level security;

-- Service role used by APIs; keep basic owner policies for authenticated clients.
drop policy if exists "Brand owners manage communities" on public.communities;
create policy "Brand owners manage communities"
  on public.communities for all
  using (auth.uid() = brand_id)
  with check (auth.uid() = brand_id);

drop policy if exists "Members read communities" on public.communities;
create policy "Members read communities"
  on public.communities for select
  using (
    exists (
      select 1 from public.community_members m
      where m.community_id = communities.id and m.user_id = auth.uid()
    )
  );

drop policy if exists "Members read membership" on public.community_members;
create policy "Members read membership"
  on public.community_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.communities c
      where c.id = community_members.community_id and c.brand_id = auth.uid()
    )
  );

drop policy if exists "Brand manage membership" on public.community_members;
create policy "Brand manage membership"
  on public.community_members for all
  using (
    exists (
      select 1 from public.communities c
      where c.id = community_members.community_id and c.brand_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.communities c
      where c.id = community_members.community_id and c.brand_id = auth.uid()
    )
  );

drop policy if exists "Members read messages" on public.community_messages;
create policy "Members read messages"
  on public.community_messages for select
  using (
    exists (
      select 1 from public.community_members m
      where m.community_id = community_messages.community_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "Members insert messages" on public.community_messages;
create policy "Members insert messages"
  on public.community_messages for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.community_members m
      where m.community_id = community_messages.community_id
        and m.user_id = auth.uid()
        and m.can_post = true
    )
  );

grant select, insert, update, delete on public.communities to authenticated;
grant select, insert, update, delete on public.community_members to authenticated;
grant select, insert, update, delete on public.community_messages to authenticated;

insert into storage.buckets (id, name, public)
values ('community-media', 'community-media', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Community media public read" on storage.objects;
create policy "Community media public read"
  on storage.objects for select
  using (bucket_id = 'community-media');

drop policy if exists "Community media authenticated upload" on storage.objects;
create policy "Community media authenticated upload"
  on storage.objects for insert
  with check (
    bucket_id = 'community-media'
    and auth.role() = 'authenticated'
  );

drop policy if exists "Community media authenticated update" on storage.objects;
create policy "Community media authenticated update"
  on storage.objects for update
  using (
    bucket_id = 'community-media'
    and auth.role() = 'authenticated'
  );

drop policy if exists "Community media authenticated delete" on storage.objects;
create policy "Community media authenticated delete"
  on storage.objects for delete
  using (
    bucket_id = 'community-media'
    and auth.role() = 'authenticated'
  );
