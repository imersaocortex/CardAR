-- Make asset storage buckets publicly readable
-- Needed for:
--   - AR experience (public page loads 3D models, videos, images directly from storage URLs)
--   - Studio viewport (Three.js useGLTF/TextureLoader fetches without auth cookies)

-- Allow public read for models-3d
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

-- Drop the old authenticated-only policies (now redundant since public policies cover all)
drop policy if exists "Users can read own org models-3d" on storage.objects;
drop policy if exists "Users can read own org videos" on storage.objects;
drop policy if exists "Users can read own org markers" on storage.objects;
