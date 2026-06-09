-- Make asset storage buckets publicly accessible
-- getPublicUrl() generates URLs with /storage/v1/object/public/ which
-- ONLY works when bucket.public = true. For public=false buckets, this
-- endpoint returns 400/404 even with SELECT policies in place.
-- Required so the studio viewport (Three.js useGLTF/TextureLoader) and
-- public AR experience can load files without Supabase auth cookies.

update storage.buckets set public = true where id = 'models-3d';
update storage.buckets set public = true where id = 'videos';
update storage.buckets set public = true where id = 'markers';

-- Allow public read for models-3d (backup policy)
drop policy if exists "public read models-3d" on storage.objects;
create policy "public read models-3d"
  on storage.objects for select
  using (bucket_id = 'models-3d');

-- Allow public read for videos
drop policy if exists "public read videos" on storage.objects;
create policy "public read videos"
  on storage.objects for select
  using (bucket_id = 'videos');

-- Allow public read for markers (images + marker files)
drop policy if exists "public read markers" on storage.objects;
create policy "public read markers"
  on storage.objects for select
  using (bucket_id = 'markers');

-- Drop the old authenticated-only policies (now redundant)
drop policy if exists "Users can read own org models-3d" on storage.objects;
drop policy if exists "Users can read own org videos" on storage.objects;
drop policy if exists "Users can read own org markers" on storage.objects;
