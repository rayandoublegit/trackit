-- Stored rentabilité score for sorting the discovery feed by value.
alter table public.creators_index add column if not exists value_score integer;
create index if not exists creators_index_value_idx on public.creators_index (value_score desc);
