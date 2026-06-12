-- ============================================================
-- AR Business Studio — Payment Gating & Plan Features
-- 1. New users get 'pending' subscription (must pay first)
-- 2. Plan feature columns for enforcement
-- 3. Updated handle_new_user trigger
-- ============================================================

-- 1. Add 'pending' to allowed subscription statuses
alter table public.subscriptions
  drop constraint if exists subscriptions_status_check;

alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status in ('active','past_due','canceled','trialing','incomplete','pending'));

-- 2. Add plan feature columns
alter table public.plans
  add column if not exists has_watermark boolean not null default true;

alter table public.plans
  add column if not exists allowed_media_types text[] not null default '{}';

-- 3. Update seed data with proper feature enforcement
update public.plans set
  has_watermark = true,
  allowed_media_types = '{image/png,image/jpeg,image/webp,model/gltf-binary}'
where slug = 'starter';

update public.plans set
  has_watermark = false,
  allowed_media_types = '{image/png,image/jpeg,image/webp,model/gltf-binary,video/mp4,video/webm}'
where slug = 'pro';

update public.plans set
  has_watermark = false,
  allowed_media_types = '{image/png,image/jpeg,image/webp,model/gltf-binary,video/mp4,video/webm,model/gltf+json,application/pdf}'
where slug = 'agency';

-- 4. Helper: check if subscription is valid (active and within period)
create or replace function public.is_subscription_valid(p_organization_id uuid)
returns boolean
language plpgsql
security definer
stable
as $$
declare
  v_status text;
  v_trial_ends_at timestamptz;
  v_current_period_end timestamptz;
begin
  select status, trial_ends_at, current_period_end
    into v_status, v_trial_ends_at, v_current_period_end
    from public.subscriptions
   where organization_id = p_organization_id;

  if v_status = 'active' then
    -- Active: check if period hasn't expired
    if v_current_period_end is not null and v_current_period_end < now() then
      return false;
    end if;
    return true;
  end if;

  if v_status = 'trialing' then
    -- Trialing: check if trial hasn't expired
    if v_trial_ends_at is not null and v_trial_ends_at < now() then
      return false;
    end if;
    return true;
  end if;

  return false;
end;
$$;

-- 5. Check if user can create projects (subscription valid + limit not reached)
create or replace function public.can_create_project(p_organization_id uuid)
returns boolean
language plpgsql
security definer
stable
as $$
declare
  v_projects_used int;
  v_projects_limit int;
begin
  -- Must have valid subscription
  if not public.is_subscription_valid(p_organization_id) then
    return false;
  end if;

  -- Must be within project limit
  select projects_limit, projects_used
    into v_projects_limit, v_projects_used
    from public.usage_limits
   where organization_id = p_organization_id;

  if v_projects_limit <= 0 then
    return false;
  end if;

  if v_projects_used >= v_projects_limit then
    return false;
  end if;

  return true;
end;
$$;

-- 6. Updated handle_new_user: creates 'pending' subscription, blocks projects until payment
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
  select v_org_id, 0, p.assets_limit_bytes
    from public.plans p
   where p.slug = 'starter'
   limit 1;

  return new;
end;
$$;
