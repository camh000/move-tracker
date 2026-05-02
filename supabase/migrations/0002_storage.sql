-- Storage bucket + policies for item photos.
-- Run this AFTER creating the `item-photos` bucket in the Supabase Storage UI
-- (set it to private — these policies do all access control).

-- Allow any authenticated user to read, upload, update, and delete photos.
drop policy if exists "item_photos_select" on storage.objects;
create policy "item_photos_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'item-photos');

drop policy if exists "item_photos_insert" on storage.objects;
create policy "item_photos_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'item-photos');

drop policy if exists "item_photos_update" on storage.objects;
create policy "item_photos_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'item-photos')
  with check (bucket_id = 'item-photos');

drop policy if exists "item_photos_delete" on storage.objects;
create policy "item_photos_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'item-photos');
