-- Signed-in users may update their own profile row from the browser (policy
-- "Users can update own profile" + grant update to authenticated), which is
-- needed for names, business name, avatar, language, etc. But nothing stopped
-- them from also writing their own plan, subscription or staff role:
--   supabase.from('profiles').update({ plan: 'scale', role: 'admin' }).eq('id', me)
-- would unlock every paid feature and, through profiles.role, the /admin console.
--
-- This trigger keeps the billing and staff columns unchanged when the write
-- comes from the browser roles (anon / authenticated). Server code (service
-- role: Whop / Stripe webhooks, admin console), the SQL editor (postgres) and
-- the auth signup trigger are not affected.
--
-- Columns that don't exist in a given database are simply skipped (jsonb), so
-- the migration works whatever columns production added by hand.
-- Idempotent; each statement can run on its own (Supabase SQL editor).

create or replace function public.profiles_protect_billing_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  protected text[] := array[
    'plan', 'role', 'subscription_active', 'subscription_status',
    'stripe_customer_id', 'stripe_subscription_id',
    'stripe_connect_account_id', 'stripe_connect_status'
  ];
  n jsonb;
  o jsonb;
  k text;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  n := to_jsonb(new);
  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    foreach k in array protected loop
      if o ? k then
        n := jsonb_set(n, array[k], o -> k);
      end if;
    end loop;
  else
    -- INSERT from the browser (profile upsert before the signup trigger ran):
    -- start on the free plan, no staff role, no subscription.
    foreach k in array protected loop
      if n ? k then
        n := jsonb_set(
          n,
          array[k],
          case k
            when 'plan' then to_jsonb('free'::text)
            when 'role' then to_jsonb('user'::text)
            when 'subscription_active' then to_jsonb(false)
            else 'null'::jsonb
          end
        );
      end if;
    end loop;
  end if;
  new := jsonb_populate_record(new, n);
  return new;
end;
$$;

drop trigger if exists profiles_protect_billing_columns on public.profiles;

create trigger profiles_protect_billing_columns
  before insert or update on public.profiles
  for each row execute function public.profiles_protect_billing_columns();
