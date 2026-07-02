-- Lie les uploads créateur aux campagnes où le créateur est membre.
create table if not exists public.campaign_content (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.profiles(id) on delete cascade,
  campaign_id uuid not null,
  creator_row_id uuid not null references public.creators(id) on delete cascade,
  content_id uuid not null references public.creator_content(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, content_id)
);

create index if not exists campaign_content_campaign_idx
  on public.campaign_content (campaign_id, created_at desc);

create index if not exists campaign_content_brand_idx
  on public.campaign_content (brand_id, created_at desc);

alter table public.campaign_content enable row level security;

-- Uploads de contenu par la marque (dashboard marque → Ajouter du contenu).
drop policy if exists "Brands can upload creator content files" on storage.objects;
create policy "Brands can upload creator content files"
  on storage.objects for insert
  with check (
    bucket_id = 'creator-content'
    and (string_to_array(name, '/'))[1] = 'brand-upload'
    and (string_to_array(name, '/'))[2] = auth.uid()::text
  );

drop policy if exists "Brands can delete brand-upload content files" on storage.objects;
create policy "Brands can delete brand-upload content files"
  on storage.objects for delete
  using (
    bucket_id = 'creator-content'
    and (string_to_array(name, '/'))[1] = 'brand-upload'
    and (string_to_array(name, '/'))[2] = auth.uid()::text
  );
