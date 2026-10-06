-- Somente leitura; deve retornar duas linhas com ok = true.
select 'collections_table' as item,
  to_regclass('public.experience_collections') is not null as ok;
select 'plan_entitlement' as item,
  exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'plans' and column_name = 'multi_project_enabled') as ok;
-- Após a migração, esta consulta deve retornar zero coleções inválidas.
select count(*) as invalid_collections from public.experience_collections c
where cardinality(c.project_ids) < 2
  or cardinality(c.project_ids) > case when c.tracking_mode = 'marker' then 10 else 20 end
  or (select count(*) from public.projects p
      where p.id = any(c.project_ids) and p.organization_id = c.organization_id
        and p.tracking_mode = c.tracking_mode and p.status = 'published') <> cardinality(c.project_ids);
-- Quantos planos o administrador habilitou para o novo recurso.
select count(*) as enabled_plans from public.plans where multi_project_enabled = true;
