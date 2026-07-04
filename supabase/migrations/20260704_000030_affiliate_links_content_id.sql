-- C1: per-content tracked links
alter table public.affiliate_links
  add column if not exists content_id uuid references public.creator_content(id) on delete set null;

create index if not exists affiliate_links_content_idx on public.affiliate_links (content_id);
