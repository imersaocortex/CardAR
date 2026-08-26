-- ============================================================
-- CortexAR — Save phone from signup form
-- ============================================================

-- Update handle_new_user to save phone from user_metadata
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  v_org_id  uuid;
  v_name    text;
  v_phone   text;
  v_plan_id uuid;
  v_trial_days int;
begin
  v_name := coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1));
  v_phone := nullif(new.raw_user_meta_data ->> 'phone', '');

  insert into public.profiles (id, name, email, phone, avatar_url)
  values (new.id, v_name, new.email, v_phone, new.raw_user_meta_data ->> 'avatar_url');

  -- Create a personal organization
  insert into public.organizations (name, slug)
  values (v_name, 'org-' || substr(new.id::text, 1, 8))
  returning id into v_org_id;

  -- Add user as owner
  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, new.id, 'owner');

  -- Assign starter plan (if it exists)
  select id, trial_days into v_plan_id, v_trial_days
    from public.plans where slug = 'starter' limit 1;

  if v_plan_id is not null then
    if v_trial_days > 0 then
      insert into public.subscriptions (organization_id, plan_id, status, trial_ends_at)
      values (v_org_id, v_plan_id, 'trialing', now() + (v_trial_days || ' days')::interval);
    else
      insert into public.subscriptions (organization_id, plan_id, status)
      values (v_org_id, v_plan_id, 'active');
    end if;

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
