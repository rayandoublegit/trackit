-- Run in Supabase SQL editor or via supabase db push
alter table public.profiles add column if not exists avatar_url text;

create policy 'Users can update own profile' on public.profiles
  for update using (auth.uid() = id);

grant update on public.profiles to authenticated;

-- Public bucket for avatar images (readable by anyone with URL)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

-- Anyone can read objects in avatars (URLs are embedded in the app)
create policy 'Avatar images are publicly readable'
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Authenticated users can upload/replace files only under their user id prefix
create policy 'Users can upload own avatar file'
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (string_to_array(name, '/'))[1] = auth.uid()::text
  );

create policy 'Users can update own avatar file'
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (string_to_array(name, '/'))[1] = auth.uid()::text
  );

create policy 'Users can delete own avatar file'
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (string_to_array(name, '/'))[1] = auth.uid()::text
  );
