-- Fix organization names: remove "'s Organization" suffix
-- The handle_new_user trigger was creating org names like "João's Organization"
-- Now it will use just the user's name (e.g., "João")

-- 1. Fix existing organizations
update public.organizations
set name = regexp_replace(name, ''''s Organization$', '')
where name like '%''s Organization';

-- 2. Update handle_new_user function to not append "'s Organization"
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  v_org_id  uuid;
  v_name    text;
begin
  v_name := coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1));

  insert into public.profiles (id, name, email, avatar_url)
  values (new.id, v_name, new.email, new.raw_user_meta_data ->> 'avatar_url');

  -- Create a personal organization
  insert into public.organizations (name, slug)
  values (v_name, 'org-' || substr(new.id::text, 1, 8))
  returning id into v_org_id;

  -- Add user as owner
  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, new.id, 'owner');

  -- Assign starter plan with 'pending' status (must pay before creating projects)
  insert into public.subscriptions (organization_id, plan_id, status)
  values (v_org_id, (select id from public.plans where slug = 'starter' limit 1), 'pending');

  -- Create usage limits with 0 projects (blocked until payment confirmed)
  insert into public.usage_limits (organization_id, projects_limit, assets_limit_bytes)
  select v_org_id, p.projects_limit, p.assets_limit_bytes
    from public.plans p
   where p.slug = 'starter'
   limit 1;

  return new;
end;
$$;
