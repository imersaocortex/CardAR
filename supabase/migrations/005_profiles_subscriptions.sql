-- ============================================================
-- AR Business Studio — Profiles & Subscriptions Enhancement
-- ============================================================

-- 1. Add profile fields for billing/ASAAS
alter table public.profiles
  add column if not exists phone text,
  add column if not exists cpf_cnpj text,
  add column if not exists address text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists address_neighborhood text,
  add column if not exists address_city text,
  add column if not exists address_state text,
  add column if not exists address_zipcode text;

-- 2. Add billing_cycle and trial_days to plans
alter table public.plans
  add column if not exists billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly', 'yearly')),
  add column if not exists trial_days int not null default 0;

-- 3. Add trial_ends_at to subscriptions
alter table public.subscriptions
  add column if not exists trial_ends_at timestamptz;

-- 4. Update handle_new_user trigger to handle trial
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  v_org_id  uuid;
  v_name    text;
  v_plan_id uuid;
  v_trial_days int;
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

-- 5. Update seed plans with billing_cycle
update public.plans set billing_cycle = 'monthly', trial_days = 0 where slug = 'starter';
update public.plans set billing_cycle = 'monthly', trial_days = 7 where slug = 'pro';
update public.plans set billing_cycle = 'yearly', trial_days = 7 where slug = 'agency';

-- 6. Create avatars bucket
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false) on conflict (id) do nothing;

create policy "Users can upload avatars"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
  );

create policy "Users can read avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can update avatars"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.role() = 'authenticated');

-- 7. Create ASAAS checkout table for one-time payments
create table if not exists public.asaas_checkouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  plan_id uuid not null references public.plans(id),
  asaas_checkout_id text,
  checkout_url text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


