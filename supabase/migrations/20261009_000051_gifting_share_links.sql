-- Gifting: public share links and creator applications.
--
-- A gift campaign is created open, with an unguessable share token. The brand
-- sends /gift/<token> (or /fr/gift/<token>); a creator signs up, applies, and a
-- mission is created in "applied" (manual review) or directly "invited"
-- (auto-approve). The brand approves or declines applications; an approved one
-- continues the existing flow (accept, sign, ship, deliver, contents).
--
-- Idempotent, and safe to paste in the Supabase SQL editor: every statement
-- stands on its own (no temp tables, no BEGIN/COMMIT spanning statements);
-- multi-step data changes are wrapped in a single DO block.

-- ── Token generator (no pgcrypto needed: gen_random_uuid is built in) ──
-- 2 random UUIDs → 32 bytes → 43 url-safe base64 characters.
create or replace function public.gift_new_share_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(
    rtrim(
      encode(
        decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex'),
        'base64'
      ),
      '='
    ),
    '+/',
    '-_'
  );
$$;

revoke all on function public.gift_new_share_token() from public, anon, authenticated;
grant execute on function public.gift_new_share_token() to service_role;

-- ── Campaign: share link, spots, review mode, offer, photos, requirements ──
alter table public.gift_campaigns
  add column if not exists share_token text,
  add column if not exists share_enabled boolean not null default true,
  add column if not exists spots integer,
  add column if not exists auto_approve boolean not null default false,
  add column if not exists offer text not null default '',
  add column if not exists product_value_cents integer not null default 0,
  add column if not exists product_images text[] not null default '{}'::text[],
  add column if not exists min_followers integer not null default 0,
  add column if not exists platforms text[] not null default array['tiktok', 'instagram']::text[],
  add column if not exists countries text[] not null default '{}'::text[],
  add column if not exists updated_at timestamptz not null default now();

alter table public.gift_campaigns alter column share_token set default public.gift_new_share_token();

-- ── Mission: where it came from and the application itself ──
alter table public.gift_missions
  add column if not exists source text not null default 'invite',
  add column if not exists application_message text not null default '',
  add column if not exists applied_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists creator_stats jsonb;

create unique index if not exists gift_campaigns_share_token_key
  on public.gift_campaigns (share_token) where share_token is not null;
create index if not exists gift_missions_campaign_status_idx
  on public.gift_missions (campaign_id, status);
create index if not exists gift_missions_creator_applied_idx
  on public.gift_missions (creator_user_id, applied_at) where applied_at is not null;

-- ── Backfill and constraints (one block: each step depends on the previous) ──
do $$
begin
  -- Every existing campaign gets its own token.
  update public.gift_campaigns
     set share_token = public.gift_new_share_token()
   where share_token is null;

  if not exists (select 1 from pg_constraint where conrelid = 'public.gift_campaigns'::regclass and conname = 'gift_campaigns_share_token_format') then
    alter table public.gift_campaigns
      add constraint gift_campaigns_share_token_format
      check (share_token is null or share_token ~ '^[A-Za-z0-9_-]{22,64}$');
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.gift_campaigns'::regclass and conname = 'gift_campaigns_spots_check') then
    alter table public.gift_campaigns
      add constraint gift_campaigns_spots_check check (spots is null or spots between 1 and 500);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.gift_campaigns'::regclass and conname = 'gift_campaigns_share_numbers_check') then
    alter table public.gift_campaigns
      add constraint gift_campaigns_share_numbers_check
      check (min_followers >= 0 and product_value_cents >= 0 and cardinality(product_images) <= 4);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.gift_campaigns'::regclass and conname = 'gift_campaigns_platforms_check') then
    alter table public.gift_campaigns
      add constraint gift_campaigns_platforms_check
      check (cardinality(platforms) >= 1 and platforms <@ array['tiktok', 'instagram']::text[]);
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.gift_missions'::regclass and conname = 'gift_missions_source_check') then
    alter table public.gift_missions
      add constraint gift_missions_source_check check (source in ('invite', 'link'));
  end if;
  -- Known statuses only from now on. NOT VALID: rows written before are not re-checked.
  if not exists (select 1 from pg_constraint where conrelid = 'public.gift_missions'::regclass and conname = 'gift_missions_status_check') then
    alter table public.gift_missions
      add constraint gift_missions_status_check
      check (status in ('applied', 'rejected', 'invited', 'accepted', 'declined', 'signed', 'shipped', 'delivered', 'submitted', 'approved'))
      not valid;
  end if;

  -- One mission per creator account per campaign. Created only when the data
  -- already respects it; the apply function enforces it either way.
  if not exists (select 1 from pg_class where relname = 'gift_missions_campaign_creator_key' and relnamespace = 'public'::regnamespace)
     and not exists (
       select 1 from public.gift_missions
        where creator_user_id is not null
        group by campaign_id, creator_user_id
       having count(*) > 1
     ) then
    create unique index gift_missions_campaign_creator_key
      on public.gift_missions (campaign_id, creator_user_id) where creator_user_id is not null;
  end if;
end $$;

-- ── Apply through the link: one transaction, campaign row locked ──
-- Checks open/link/deadline, duplicates, the per-hour rate limit and the spots,
-- then inserts the mission. Returns {"ok": bool, "code": text, "mission_id", "status"}.
-- p_auto_approve is the caller's verdict (campaign auto-approve AND requirements
-- met with known stats); it is ANDed with the campaign setting here.
create or replace function public.gift_apply_to_campaign(
  p_campaign_id uuid,
  p_creator_user_id uuid,
  p_handle text,
  p_platform text,
  p_contract text,
  p_message text,
  p_stats jsonb,
  p_auto_approve boolean,
  p_max_per_hour integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.gift_campaigns%rowtype;
  existing record;
  taken integer;
  recent integer;
  v_status text;
  v_id uuid;
begin
  select * into c from public.gift_campaigns where id = p_campaign_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if c.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'closed');
  end if;
  if not c.share_enabled then
    return jsonb_build_object('ok', false, 'code', 'disabled');
  end if;
  if c.deadline < current_date then
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;
  if c.user_id = p_creator_user_id then
    return jsonb_build_object('ok', false, 'code', 'own_campaign');
  end if;
  if not (p_platform = any (c.platforms)) then
    return jsonb_build_object('ok', false, 'code', 'platform');
  end if;

  select id, status into existing
    from public.gift_missions
   where campaign_id = c.id and creator_user_id = p_creator_user_id
   limit 1;
  if found then
    return jsonb_build_object('ok', false, 'code', 'already', 'mission_id', existing.id, 'status', existing.status);
  end if;
  if exists (
    select 1 from public.gift_missions
     where campaign_id = c.id and creator_platform = p_platform and creator_handle = p_handle
  ) then
    return jsonb_build_object('ok', false, 'code', 'handle_taken');
  end if;

  select count(*) into recent
    from public.gift_missions
   where creator_user_id = p_creator_user_id
     and applied_at > now() - interval '1 hour';
  if recent >= greatest(coalesce(p_max_per_hour, 1), 1) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  select count(*) into taken
    from public.gift_missions
   where campaign_id = c.id and status not in ('applied', 'rejected', 'declined');
  if c.spots is not null and taken >= c.spots then
    return jsonb_build_object('ok', false, 'code', 'full');
  end if;

  v_status := case when c.auto_approve and coalesce(p_auto_approve, false) then 'invited' else 'applied' end;
  insert into public.gift_missions (
    campaign_id, user_id, workspace_id, creator_handle, creator_platform, creator_user_id,
    status, contract_text, source, application_message, applied_at, reviewed_at, creator_stats
  ) values (
    c.id, c.user_id, c.workspace_id, p_handle, p_platform, p_creator_user_id,
    v_status, p_contract, 'link', left(coalesce(p_message, ''), 500), now(),
    case when v_status = 'invited' then now() else null end,
    p_stats
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'code', 'ok', 'mission_id', v_id, 'status', v_status);
end;
$$;

revoke all on function public.gift_apply_to_campaign(uuid, uuid, text, text, text, text, jsonb, boolean, integer) from public, anon, authenticated;
grant execute on function public.gift_apply_to_campaign(uuid, uuid, text, text, text, text, jsonb, boolean, integer) to service_role;

-- ── Brand review of an application: revision lock + spots under the campaign lock ──
-- p_status is the next status computed by applyGiftAction: 'invited' (approve)
-- or 'rejected' (decline). Returns 'ok', 'stale', 'not_applied', 'full' or 'not_found'.
create or replace function public.gift_review_application(
  p_mission_id uuid,
  p_expected_revision integer,
  p_status text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  c public.gift_campaigns%rowtype;
  taken integer;
begin
  if p_status not in ('invited', 'rejected') then
    return 'not_applied';
  end if;
  select id, campaign_id into m from public.gift_missions where id = p_mission_id;
  if not found then
    return 'not_found';
  end if;
  -- Campaign first, then mission: the same lock order as gift_apply_to_campaign.
  select * into c from public.gift_campaigns where id = m.campaign_id for update;
  select id, status, revision into m from public.gift_missions where id = p_mission_id for update;
  if m.revision <> p_expected_revision then
    return 'stale';
  end if;
  if m.status <> 'applied' then
    return 'not_applied';
  end if;
  if p_status = 'invited' and c.spots is not null then
    select count(*) into taken
      from public.gift_missions
     where campaign_id = c.id and status not in ('applied', 'rejected', 'declined');
    if taken >= c.spots then
      return 'full';
    end if;
  end if;
  update public.gift_missions
     set status = p_status,
         reviewed_at = now(),
         revision = revision + 1
   where id = p_mission_id;
  return 'ok';
end;
$$;

revoke all on function public.gift_review_application(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.gift_review_application(uuid, integer, text) to service_role;

-- ── Public bucket for product photos (shown on the public gift page) ──
-- Written by the server only (service role); read through public URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gift-products', 'gift-products', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Browsers still never touch gift tables directly (server API only).
revoke all on public.gift_campaigns from anon, authenticated;
revoke all on public.gift_missions from anon, authenticated;
