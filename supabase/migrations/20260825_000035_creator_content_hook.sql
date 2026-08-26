-- Link creator uploads to brand hooks (filter Contenu by hook).

alter table public.creator_content
  add column if not exists hook_id uuid references public.hooks(id) on delete set null;

create index if not exists creator_content_hook_id_idx
  on public.creator_content (brand_id, hook_id)
  where hook_id is not null;

comment on column public.creator_content.hook_id is
  'Optional hook chosen by the creator at upload; brands filter Contenu by this.';
