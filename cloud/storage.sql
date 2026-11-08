-- Run once in your own Supabase SQL editor. No service-role key goes in the app.
-- In Authentication, create/confirm one uploader user per organizer. Disable public signup.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('cap-photos','cap-photos',true,10485760,array['image/jpeg'])
on conflict (id) do update set public=true,file_size_limit=10485760,allowed_mime_types=array['image/jpeg'];

drop policy if exists "CAP uploader insert own JPG" on storage.objects;
create policy "CAP uploader insert own JPG" on storage.objects for insert to authenticated
with check (bucket_id='cap-photos' and name ~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]{32}\.jpg$'));
drop policy if exists "CAP uploader read own JPG" on storage.objects;
create policy "CAP uploader read own JPG" on storage.objects for select to authenticated
using (bucket_id='cap-photos' and name ~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]{32}\.jpg$'));
drop policy if exists "CAP uploader update own JPG" on storage.objects;
create policy "CAP uploader update own JPG" on storage.objects for update to authenticated
using (bucket_id='cap-photos' and name ~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]{32}\.jpg$'))
with check (bucket_id='cap-photos' and name ~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]{32}\.jpg$'));
drop policy if exists "CAP uploader delete own JPG" on storage.objects;
create policy "CAP uploader delete own JPG" on storage.objects for delete to authenticated
using (bucket_id='cap-photos' and name ~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]{32}\.jpg$'));
