-- Make avatars bucket public so getPublicUrl URLs are accessible by <img> tags
update storage.buckets
set public = true
where id = 'avatars';

-- Ensure RLS still applies (read policy already allows bucket_id = 'avatars')
