-- ============================================================
-- CortexAR — Project Analytics & Admin Subscription Control
-- ============================================================

-- 1. Project analytics table for tracking interactions
create table if not exists public.project_analytics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id text,
  event_type text not null default 'view',
  metadata jsonb default '{}',
  ip_address text,
  country text,
  city text,
  region text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Indexes for fast queries
create index if not exists idx_project_analytics_project on public.project_analytics(project_id);
create index if not exists idx_project_analytics_org on public.project_analytics(organization_id);
create index if not exists idx_project_analytics_created on public.project_analytics(created_at desc);
create index if not exists idx_project_analytics_event_type on public.project_analytics(event_type);

-- Enable RLS
alter table public.project_analytics enable row level security;

-- RLS: org members can read their own analytics
drop policy if exists "Org members can read project analytics" on public.project_analytics;
create policy "Org members can read project analytics"
  on public.project_analytics for select
  using (
    exists (
      select 1 from public.organization_members
      where organization_id = project_analytics.organization_id
        and user_id = auth.uid()
    )
  );

-- RLS: anyone can insert (from public experience)
drop policy if exists "Anyone can insert analytics" on public.project_analytics;
create policy "Anyone can insert analytics"
  on public.project_analytics for insert
  with check (true);

-- 2. Subscription status history for admin audit
create table if not exists public.subscription_status_history (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references public.profiles(id),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_sub_status_hist_sub on public.subscription_status_history(subscription_id);
alter table public.subscription_status_history enable row level security;
drop policy if exists "Admin can read subscription history" on public.subscription_status_history;
create policy "Admin can read subscription history"
  on public.subscription_status_history for select
  using (true);
drop policy if exists "Admin can insert subscription history" on public.subscription_status_history;
create policy "Admin can insert subscription history"
  on public.subscription_status_history for insert
  with check (true);

-- 3. Add metadata/jsonb column to subscriptions for admin notes
alter table public.subscriptions
  add column if not exists metadata jsonb default '{}';
