-- Allow authenticated users to delete their own analyses (sidebar "Remove analysis")
create policy "delete_own_analyses" on public.analyses
  for delete using (auth.uid() = user_id);

grant delete on public.analyses to authenticated;
