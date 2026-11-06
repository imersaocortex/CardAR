-- Read-only. Each row should return ok = true.
select 'click_effect column' as check_name, exists (
  select 1 from information_schema.columns where table_schema = 'public' and table_name = 'scene_objects'
  and column_name = 'click_effect' and data_type = 'text' and is_nullable = 'NO' and column_default like '%none%'
) as ok;

select 'allowed effects' as check_name, exists (
  select 1 from pg_constraint where conrelid = 'public.scene_objects'::regclass and conname = 'scene_objects_click_effect_check'
  and pg_get_constraintdef(oid) like '%particles%'
) as ok;

select 'atomic persistence' as check_name, coalesce(
  pg_get_functiondef('public.save_studio_scene(uuid, uuid, jsonb)'::regprocedure) like '%click_effect = excluded.click_effect%', false
) as ok;

select 'authenticated editor only' as check_name,
  has_function_privilege('authenticated', 'public.save_studio_scene(uuid, uuid, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.save_studio_scene(uuid, uuid, jsonb)', 'execute')
  and not (select prosecdef from pg_proc where oid = 'public.save_studio_scene(uuid, uuid, jsonb)'::regprocedure) as ok;
