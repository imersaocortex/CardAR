-- ============================================================
-- CortexAR — WebAR Module Migration
-- ============================================================

-- 1. Add target_url to project_markers (compiled .mind file)
alter table public.project_markers add column if not exists target_url text;
alter table public.project_markers add constraint project_markers_project_id_key unique (project_id);

-- 2. RLS: Allow anon to read published project markers
create policy "anyone can view published project markers"
  on public.project_markers for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = project_markers.project_id
      and projects.status = 'published'
    )
  );

-- 3. RLS for profiles: allow anyone to read profiles (for display)
create policy "anyone can view profiles"
  on public.profiles for select
  using (true);
