-- Precision + auto-evolution columns for creators_index.
alter table creators_index
  add column if not exists avg_likes bigint,
  add column if not exists avg_comments bigint,
  add column if not exists avg_shares bigint,
  add column if not exists views_per_follower numeric,
  add column if not exists engagement_by_follower numeric,
  add column if not exists posts_analyzed integer,
  add column if not exists last_post_at timestamptz,
  add column if not exists post_frequency numeric,
  add column if not exists authenticity_score integer,
  add column if not exists quality_status text,
  add column if not exists email text,
  add column if not exists primary_niche text,
  add column if not exists country_code text,
  add column if not exists enriched_at timestamptz,
  add column if not exists enrichment_status text default 'pending';

create index if not exists creators_index_platform_idx on creators_index (platform);
create index if not exists creators_index_niches_idx on creators_index using gin (niches);
create index if not exists creators_index_engagement_idx on creators_index (engagement_rate desc);
create index if not exists creators_index_followers_idx on creators_index (followers desc);
create index if not exists creators_index_authenticity_idx on creators_index (authenticity_score desc);
create index if not exists creators_index_last_post_idx on creators_index (last_post_at desc);
create index if not exists creators_index_enrichment_idx on creators_index (enrichment_status, enriched_at);
