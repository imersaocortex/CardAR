select
  exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'plans' and column_name = 'gps_enabled') as gps_column_ok,
  exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'plans' and column_name = 'surface_enabled') as surface_column_ok,
  not exists(select 1 from public.plans where gps_enabled is null or surface_enabled is null) as existing_plans_preserved,
  exists(select 1 from pg_trigger where tgname = 'project_tracking_plan_guard' and not tgisinternal) as creation_guard_ok;
