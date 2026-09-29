-- The public /affiliation form inserts applications from the browser with the
-- public key. RLS was on with no policy, which only worked while production
-- shipped the service_role key to browsers (fixed 2026-09-29). Insert only:
-- nobody can read applications from the browser.
drop policy if exists "Anyone can submit an affiliate application" on public.affiliate_applications;
create policy "Anyone can submit an affiliate application"
  on public.affiliate_applications for insert
  to anon, authenticated
  with check (true);
