-- Raise creator-content storage limit so 1–2+ minute videos can upload.
-- Bucket default is often ~50MB; set to 1 GB.
insert into storage.buckets (id, name, public, file_size_limit)
values ('creator-content', 'creator-content', true, 1073741824)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;
