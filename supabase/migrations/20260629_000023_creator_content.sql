-- Creator-uploaded content visible to brands in Manage creators.
create table if not exists public.creator_content (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.profiles(id) on delete cascade,
  creator_row_id uuid not null references public.creators(id) on delete cascade,
  creator_user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  notes text,
  file_url text not null,
  file_name text not null,
  file_type text,
  file_size bigint,
  created_at timestamptz not null default now()
);

create index if not exists creator_content_brand_creator_idx
  on public.creator_content (brand_id, creator_row_id);

create index if not exists creator_content_creator_user_idx
  on public.creator_content (creator_user_id, created_at desc);

alter table public.creator_content enable row level security;

-- Brands read content for their workspace via service role APIs; creators read own uploads.
create policy "Creators can read own content rows"
  on public.creator_content for select
  using (auth.uid() = creator_user_id);

create policy "Creators can insert own content rows"
  on public.creator_content for insert
  with check (auth.uid() = creator_user_id);

create policy "Creators can delete own content rows"
  on public.creator_content for delete
  using (auth.uid() = creator_user_id);

insert into storage.buckets (id, name, public)
values ('creator-content', 'creator-content', true)
on conflict (id) do update set public = excluded.public;

create policy "Creator content files are publicly readable"
  on storage.objects for select
  using (bucket_id = 'creator-content');

create policy "Creators can upload creator content"
  on storage.objects for insert
  with check (
    bucket_id = 'creator-content'
    and (string_to_array(name, '/'))[1] = auth.uid()::text
  );

create policy "Creators can update own creator content files"
  on storage.objects for update
  using (
    bucket_id = 'creator-content'
    and (string_to_array(name, '/'))[1] = auth.uid()::text
  );

create policy "Creators can delete own creator content files"
  on storage.objects for delete
  using (
    bucket_id = 'creator-content'
    and (string_to_array(name, '/'))[1] = auth.uid()::text
  );
