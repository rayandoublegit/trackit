-- Cache for the AI content analysis of a creator's video frames.
alter table public.creators_index add column if not exists content_analysis jsonb;
