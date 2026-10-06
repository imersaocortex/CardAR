-- Coleções de projetos publicados com uma única tecnologia AR.
alter table public.plans
  add column if not exists multi_project_enabled boolean not null default false;

create table if not exists public.experience_collections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9-]{8,64}$'),
  tracking_mode text not null check (tracking_mode in ('marker', 'gps')),
  project_ids uuid[] not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_project_count check (cardinality(project_ids) between 2 and 20)
);

create or replace function public.validate_experience_collection()
returns trigger language plpgsql set search_path = public as $$
declare
  matched integer;
  distinct_count integer;
begin
  select count(distinct project_id) into distinct_count from unnest(new.project_ids) as project_id;
  if distinct_count <> cardinality(new.project_ids) then
    raise exception 'Projetos duplicados na coleção';
  end if;
  if new.tracking_mode = 'marker' and cardinality(new.project_ids) > 10 then
    raise exception 'Uma coleção aceita até 10 marcadores';
  end if;
  perform 1 from public.projects p
    where p.id = any(new.project_ids)
      and p.organization_id = new.organization_id
      and p.tracking_mode = new.tracking_mode
      and p.status = 'published'
      and (new.tracking_mode <> 'gps' or (p.latitude is not null and p.longitude is not null))
      and (new.tracking_mode <> 'marker' or exists (
        select 1 from public.project_markers m where m.project_id = p.id and m.image_url is not null
      ))
    order by p.id for share;
  get diagnostics matched = row_count;
  if matched <> cardinality(new.project_ids) then
    raise exception 'Escolha somente projetos publicados da mesma organização e tecnologia';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_experience_collection_trigger on public.experience_collections;
create trigger validate_experience_collection_trigger
  before insert or update on public.experience_collections
  for each row execute function public.validate_experience_collection();

create or replace function public.remove_project_from_experience_collections()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.experience_collections
      where old.id = any(project_ids) and cardinality(array_remove(project_ids, old.id)) < 2;
    update public.experience_collections
      set project_ids = array_remove(project_ids, old.id)
      where old.id = any(project_ids);
    return old;
  end if;
  if old.status = 'published' and
      (new.status <> 'published' or new.tracking_mode <> old.tracking_mode or new.organization_id <> old.organization_id) then
    delete from public.experience_collections
      where old.id = any(project_ids) and cardinality(array_remove(project_ids, old.id)) < 2;
    update public.experience_collections
      set project_ids = array_remove(project_ids, old.id)
      where old.id = any(project_ids);
  end if;
  return new;
end;
$$;

drop trigger if exists project_experience_collections_trigger on public.projects;
create trigger project_experience_collections_trigger
  after update of status, tracking_mode, organization_id or delete on public.projects
  for each row execute function public.remove_project_from_experience_collections();

alter table public.experience_collections enable row level security;
drop policy if exists "Members can read own collections" on public.experience_collections;
create policy "Members can read own collections" on public.experience_collections
  for select to authenticated using (exists (
    select 1 from public.organization_members m
    where m.organization_id = experience_collections.organization_id and m.user_id = auth.uid()
  ));
-- All mutations run through authenticated server routes with service role and plan checks.
revoke insert, update, delete on public.experience_collections from anon, authenticated;
grant select on public.experience_collections to authenticated;
