alter table public.profiles
  add column if not exists last_login_ip text;

comment on column public.profiles.last_login_ip is 'Last IP at sign-in; used to restore session on return visits from the same network';
