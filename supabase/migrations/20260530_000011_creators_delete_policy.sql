-- Allow authenticated users to delete their own creators (client-side fallback).
alter table public.creators enable row level security;

drop policy if exists "Users can delete own creators" on public.creators;
create policy "Users can delete own creators"
  on public.creators
  for delete
  using (auth.uid() = user_id);
