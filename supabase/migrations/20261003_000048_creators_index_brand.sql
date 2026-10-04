-- Brand / company accounts in the creator catalog. Discovery hides them by
-- default (toggle "Exclure les marques"). The scraper sets the flag on every
-- refresh from lib/brand-detect.ts (TikTok Shop seller, Instagram category,
-- legal name, storefront handle + commerce bio). null = not classified yet,
-- shown like a creator.

alter table public.creators_index
  add column if not exists is_brand boolean,
  add column if not exists brand_reason text;

comment on column public.creators_index.is_brand is
  'true = brand/company account, hidden from Discovery by default; null = not classified yet';

create index if not exists creators_index_is_brand_idx
  on public.creators_index (is_brand)
  where is_brand is true;

-- First pass on what is already stored, strong signals only (the weekly
-- refresh then classifies every creator with the full rules).
update public.creators_index
set is_brand = true,
    brand_reason = 'legal_name'
where is_brand is null
  and coalesce(display_name, '') ~* '(®|™|\m(sas|sasu|sarl|eurl|ltd|llc|inc|gmbh|plc|corp)\M\.?\s*$)';

update public.creators_index
set is_brand = true,
    brand_reason = 'shop_handle+commerce_bio'
where is_brand is null
  and regexp_replace(lower(username), '^(ig_|yt_)', '') ~ '(shop|store|boutique|eshop|official|officiel|officielle)$'
  and coalesce(bio, '') ~* '(livraison (offerte|gratuite)|free shipping|worldwide shipping|boutique en ligne|online (store|shop)|e-?shop|service client|customer service|shop now|order now|commandez|🛒|🛍|📦|🚚)';
