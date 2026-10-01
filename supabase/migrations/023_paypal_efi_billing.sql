-- New providers are additive. Historical gateway tables are retained for audit.
begin;
alter table public.plans add column if not exists paypal_plan_id text;
alter table public.subscriptions drop constraint if exists subscriptions_payment_provider_check;
alter table public.subscriptions add constraint subscriptions_payment_provider_check check (payment_provider in ('asaas', 'stripe', 'paypal', 'efi'));
alter table public.subscriptions add column if not exists billing_agreement_id uuid;
alter table public.subscriptions add column if not exists cancel_at_period_end boolean not null default false;

create table public.billing_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  plan_id uuid not null references public.plans(id),
  created_by uuid not null references auth.users(id),
  provider text not null check (provider in ('paypal', 'efi')),
  pix_mode text check (pix_mode in ('manual', 'automatic')),
  status text not null default 'pending' check (status in ('pending', 'active', 'canceled')),
  amount_cents bigint not null check (amount_cents > 0),
  billing_cycle text not null check (billing_cycle in ('monthly', 'yearly')),
  external_id text,
  checkout_url text,
  pix_code text,
  setup_stage text not null default 'new',
  setup_loc bigint,
  paid_until timestamptz,
  last_reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, external_id)
);
create unique index billing_one_open_agreement on public.billing_agreements(organization_id) where status <> 'canceled';
create table public.billing_charges (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.billing_agreements(id),
  organization_id uuid not null references public.organizations(id),
  txid text not null unique,
  kind text not null check (kind in ('immediate', 'recurring')),
  due_date date not null,
  period_end timestamptz not null,
  expires_at timestamptz,
  pix_code text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'canceled')),
  created_at timestamptz not null default now()
);
create unique index billing_one_charge_per_period on public.billing_charges(agreement_id, due_date) where status in ('pending', 'paid');
create table public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  agreement_id uuid references public.billing_agreements(id),
  provider text not null,
  external_id text not null,
  value numeric(14,2) not null,
  status text not null,
  due_date date,
  paid_date timestamptz,
  created_at timestamptz not null default now(),
  unique(provider, external_id)
);
alter table public.billing_agreements enable row level security;
alter table public.billing_charges enable row level security;
alter table public.billing_payments enable row level security;
create policy billing_agreements_read on public.billing_agreements for select to authenticated using (public.is_org_member(organization_id));
create policy billing_charges_read on public.billing_charges for select to authenticated using (public.is_org_member(organization_id));
create policy billing_payments_read on public.billing_payments for select to authenticated using (public.is_org_member(organization_id));

-- Copy history without modifying the original records.
insert into public.billing_payments(organization_id, provider, external_id, value, status, due_date, paid_date, created_at)
select organization_id, 'asaas', id::text, value, status, due_date::date, paid_date::timestamptz, created_at from public.asaas_payments
on conflict(provider, external_id) do nothing;
insert into public.billing_payments(organization_id, provider, external_id, value, status, due_date, paid_date, created_at)
select organization_id, 'stripe', id::text, value, status, due_date::date, paid_date::timestamptz, created_at from public.stripe_payments
on conflict(provider, external_id) do nothing;

create or replace function public.settle_billing_payment(p_agreement uuid, p_external_id text, p_amount_cents bigint, p_paid_at timestamptz, p_period_end timestamptz, p_txid text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare a public.billing_agreements; v_payment uuid; v_until timestamptz;
begin
  select * into strict a from public.billing_agreements where id = p_agreement for update;
  if p_amount_cents <> a.amount_cents or p_paid_at > now() + interval '10 minutes' or p_period_end <= p_paid_at then
    raise exception 'Invalid payment';
  end if;
  insert into public.billing_payments(organization_id, agreement_id, provider, external_id, value, status, due_date, paid_date)
    values(a.organization_id, a.id, a.provider, p_external_id, p_amount_cents::numeric/100, 'paid', p_paid_at::date, p_paid_at)
    on conflict(provider, external_id) do nothing returning id into v_payment;
  if v_payment is null then return false; end if;
  v_until := greatest(a.paid_until, p_period_end);
  update public.billing_agreements set paid_until = v_until, status = case when status = 'canceled' then status else 'active' end, updated_at = now() where id = a.id;
  -- Do not let a late event from a replaced agreement overwrite the new plan.
  if not exists(select 1 from public.billing_agreements where organization_id = a.organization_id and id <> a.id and status <> 'canceled') then
    update public.subscriptions set plan_id = a.plan_id, status = case when v_until > now() then 'active' else 'past_due' end,
      payment_provider = a.provider, billing_agreement_id = a.id,
      trial_ends_at = null, current_period_start = p_paid_at, current_period_end = v_until,
      cancel_at_period_end = (a.status = 'canceled') where organization_id = a.organization_id;
    if not found then raise exception 'Subscription missing'; end if;
    update public.usage_limits u set projects_limit = p.projects_limit, assets_limit_bytes = p.assets_limit_bytes
      from public.plans p where p.id = a.plan_id and u.organization_id = a.organization_id;
    if v_until > now() then perform public.unsuspend_org_projects(a.organization_id); end if;
  end if;
  if p_txid is not null then update public.billing_charges set status = 'paid' where txid = p_txid and agreement_id = a.id; end if;
  return true;
end;
$$;
revoke all on function public.settle_billing_payment(uuid, text, bigint, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.settle_billing_payment(uuid, text, bigint, timestamptz, timestamptz, text) to service_role;

-- Clients may read subscription state; financial changes come only from server-side services.
drop policy if exists "Owner and admin can manage subscriptions" on public.subscriptions;
drop policy if exists "Owner and admin can update subscriptions" on public.subscriptions;
commit;
