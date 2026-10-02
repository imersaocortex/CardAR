-- Read-only check after applying migration 025. Both rows should return ok = true.
select 'scene_objects.face_camera' as check_name,
       exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'scene_objects'
           and column_name = 'face_camera' and data_type = 'boolean'
       ) as ok;

select 'save_studio_scene persists face_camera' as check_name,
       coalesce(pg_get_functiondef('public.save_studio_scene(uuid, uuid, jsonb)'::regprocedure) like '%face_camera = excluded.face_camera%', false) as ok;
