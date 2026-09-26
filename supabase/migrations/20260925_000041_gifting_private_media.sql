-- Gift data contains signed contracts and shipping addresses. All writes and
-- reads go through the authenticated API, which performs role/workspace checks.
-- RLS alone cannot restrict which columns a creator may update.
revoke all on public.gift_wishlists from anon, authenticated;
revoke all on public.gift_wishlist_creators from anon, authenticated;
revoke all on public.gift_campaigns from anon, authenticated;
revoke all on public.gift_missions from anon, authenticated;
revoke all on public.gift_videos from anon, authenticated;

alter table public.gift_videos
  add column if not exists storage_path text;
alter table public.gift_missions
  add column if not exists revision integer not null default 0;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gift-videos', 'gift-videos', false, 524288000,
  array['video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- One transaction covers the mission transition and its video metadata.
-- Only the server-side service role may invoke this after checking the actor.
create or replace function public.gift_commit_mission_action(
  p_mission_id uuid,
  p_expected_revision integer,
  p_mission jsonb,
  p_video jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.gift_missions
  set status = p_mission->>'status',
      signed_name = p_mission->>'signed_name',
      signed_at = (p_mission->>'signed_at')::timestamptz,
      address = nullif(p_mission->'address', 'null'::jsonb),
      carrier = p_mission->>'carrier',
      tracking_number = p_mission->>'tracking_number',
      shipped_at = (p_mission->>'shipped_at')::timestamptz,
      delivered_at = (p_mission->>'delivered_at')::timestamptz,
      revision = revision + 1
  where id = p_mission_id and revision = p_expected_revision;
  get diagnostics changed = row_count;
  if changed = 0 then return false; end if;

  if p_video is not null then
    insert into public.gift_videos (
      mission_id, name, status, feedback, approved_at, storage_path
    ) values (
      p_mission_id,
      p_video->>'name',
      p_video->>'status',
      coalesce(p_video->>'feedback', ''),
      (p_video->>'approved_at')::timestamptz,
      p_video->>'storage_path'
    )
    on conflict (mission_id) do update set
      name = excluded.name,
      status = excluded.status,
      feedback = excluded.feedback,
      approved_at = excluded.approved_at,
      storage_path = coalesce(excluded.storage_path, public.gift_videos.storage_path);
  end if;
  return true;
end;
$$;

revoke all on function public.gift_commit_mission_action(uuid, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.gift_commit_mission_action(uuid, integer, jsonb, jsonb) to service_role;
