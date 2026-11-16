-- Read-only. All columns must report true. No plan is enabled by the migration.
select
  exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'plans' and column_name = 'sliders_enabled'
    and is_nullable = 'NO' and column_default = 'false') as plan_switch,
  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.sliders')), false)
    and not has_table_privilege('anon', 'public.sliders', 'SELECT')
    and not has_table_privilege('authenticated', 'public.sliders', 'SELECT,INSERT,UPDATE,DELETE')
    and has_table_privilege('service_role', 'public.sliders', 'SELECT') as slider_table_private,
  exists (select 1 from pg_constraint where conrelid = 'public.scene_objects'::regclass
    and confrelid = to_regclass('public.sliders') and contype = 'f' and condeferrable and condeferred)
    and exists (select 1 from pg_trigger where tgrelid = 'public.scene_objects'::regclass
    and tgname = 'validate_scene_slider' and tgenabled <> 'D') as protected_scene_binding,
  position('slider_id = excluded.slider_id' in pg_get_functiondef('public.save_studio_scene(uuid,uuid,jsonb)'::regprocedure)) > 0 as atomic_scene_save;
