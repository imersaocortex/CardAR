-- ============================================================
-- AR Business Studio — Stripe Payment Gateway
-- 1. payment_provider + stripe_subscription_id on subscriptions
-- 2. stripe_customers table
-- 3. stripe_checkouts table
-- 4. stripe_payments table
-- 5. stripe settings in system_settings
-- ============================================================

-- 1. Add payment_provider and stripe_subscription_id to subscriptions
alter table public.subscriptions
  add column if not exists payment_provider text not null default 'asaas'
    check (payment_provider in ('asaas', 'stripe'));

alter table public.subscriptions
  add column if not exists stripe_subscription_id text;

-- 2. Stripe customers table
create table if not exists public.stripe_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stripe_customer_id text not null,
  created_at timestamptz not null default now(),
  unique(organization_id)
);

-- 3. Stripe checkouts table
create table if not exists public.stripe_checkouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  plan_id uuid not null references public.plans(id),
  stripe_session_id text,
  checkout_url text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Stripe payments table
create table if not exists public.stripe_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  stripe_payment_intent_id text not null,
  status text not null,
  value numeric not null,
  due_date date not null,
  paid_date timestamptz,
  invoice_url text,
  created_at timestamptz not null default now()
);

-- 5. Add stripe column to system_settings
alter table public.system_settings
  add column if not exists stripe jsonb not null default '{}'::jsonb;
