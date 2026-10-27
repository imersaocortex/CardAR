-- Preserve current GPS and surface access for existing plans. New plans choose their permissions explicitly.
begin;

alter table public.plans add column if not exists gps_enabled boolean not null default true;
alter table public.plans add column if not exists surface_enabled boolean not null default true;

create or replace function public.enforce_project_tracking_plan()
returns trigger language plpgsql security definer set search_path = public as $$
declare allowed boolean;
begin
  if new.tracking_mode not in ('gps', 'surface') then return new; end if;
  if tg_op = 'UPDATE' and new.tracking_mode is not distinct from old.tracking_mode
    and new.organization_id is not distinct from old.organization_id then return new; end if;
  select case when new.tracking_mode = 'gps' then p.gps_enabled else p.surface_enabled end
    into allowed from public.subscriptions s join public.plans p on p.id = s.plan_id
    where s.organization_id = new.organization_id;
  if not coalesce(allowed, false) then
    raise exception 'A tecnologia % não está disponível no plano desta organização', new.tracking_mode;
  end if;
  return new;
end; $$;
drop trigger if exists project_tracking_plan_guard on public.projects;
create trigger project_tracking_plan_guard before insert or update of tracking_mode, organization_id
  on public.projects for each row execute function public.enforce_project_tracking_plan();

commit;
