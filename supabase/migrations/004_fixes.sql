-- ============================================================
-- AR Business Studio — Fixes Migration
-- ============================================================

-- 1. Public read for markers bucket (anon users need to load marker images & .mind files)
create policy "Anyone can read markers"
  on storage.objects for select
  using (bucket_id = 'markers');

-- 2. Allow authenticated users to upload to public-previews (for compiled .mind files)
create policy "Authenticated users can upload to public-previews"
  on storage.objects for insert
  with check (
    bucket_id = 'public-previews'
    and auth.role() = 'authenticated'
  );

-- 3. Fix handle_new_user trigger to gracefully handle missing starter plan
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  v_org_id  uuid;
  v_name    text;
  v_plan_id uuid;
begin
  v_name := coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1));

  insert into public.profiles (id, name, email, avatar_url)
  values (new.id, v_name, new.email, new.raw_user_meta_data ->> 'avatar_url');

  -- Create a personal organization
  insert into public.organizations (name, slug)
  values (v_name || '''s Organization', 'org-' || substr(new.id::text, 1, 8))
  returning id into v_org_id;

  -- Add user as owner
  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, new.id, 'owner');

  -- Assign starter plan (if it exists)
  select id into v_plan_id from public.plans where slug = 'starter' limit 1;

  if v_plan_id is not null then
    insert into public.subscriptions (organization_id, plan_id, status)
    values (v_org_id, v_plan_id, 'active');

    -- Create usage limits from plan
    insert into public.usage_limits (organization_id, projects_limit, assets_limit_bytes)
    select v_org_id, p.projects_limit, p.assets_limit_bytes
      from public.plans p
     where p.id = v_plan_id
     limit 1;
  end if;

  return new;
end;
$$;

-- 4. Ensure increment_project_views function uses security definer (for admin API calls)
create or replace function public.increment_project_views(p_project_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.projects set views = views + 1 where id = p_project_id;
end;
$$;
