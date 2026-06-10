-- ============================================================
-- AR Business Studio — Evolution API & Project Suspension
-- 1. Add suspended status to projects
-- 2. Functions to suspend/unsuspend org projects
-- 3. Evolution settings in system_settings
-- ============================================================

-- 1. Add 'suspended' to project status constraint
alter table public.projects
  drop constraint if exists projects_status_check;

alter table public.projects
  add constraint projects_status_check
  check (status in ('draft','published','paused','archived','suspended'));

-- 2. Function: suspend all active projects for an organization
create or replace function public.suspend_org_projects(p_organization_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.projects
  set status = 'suspended',
      updated_at = now()
  where organization_id = p_organization_id
    and status in ('published', 'draft', 'paused');
end;
$$;

-- 3. Function: unsuspend all projects for an organization (restore to published)
create or replace function public.unsuspend_org_projects(p_organization_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.projects
  set status = 'published',
      updated_at = now()
  where organization_id = p_organization_id
    and status = 'suspended';
end;
$$;

-- 4. Add evolution column to system_settings
alter table public.system_settings
  add column if not exists evolution jsonb not null default '{}'::jsonb;

-- 5. Add highlight column to plans (configurable "Mais Popular" badge)
alter table public.plans
  add column if not exists highlight boolean not null default false;

-- 6. Set pro plan as highlighted by default
update public.plans set highlight = true where slug = 'pro' and highlight = false;
