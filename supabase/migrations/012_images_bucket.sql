-- Create images bucket for uploaded image assets
insert into storage.buckets (id, name, public) values ('images', 'images', false) on conflict (id) do nothing;

-- Allow authenticated users to upload images
drop policy if exists "authenticated insert images" on storage.objects;
create policy "authenticated insert images"
  on storage.objects for insert
  with check (
    bucket_id = 'images'
    and auth.role() = 'authenticated'
  );

-- Allow public read for images (needed for AR experience to display them)
drop policy if exists "public read images" on storage.objects;
create policy "public read images"
  on storage.objects for select
  using (bucket_id = 'images');

-- Allow users to update/delete their own uploads
drop policy if exists "authenticated update images" on storage.objects;
create policy "authenticated update images"
  on storage.objects for update
  using (bucket_id = 'images' and auth.role() = 'authenticated');

drop policy if exists "authenticated delete images" on storage.objects;
create policy "authenticated delete images"
  on storage.objects for delete
  using (bucket_id = 'images' and auth.role() = 'authenticated');
