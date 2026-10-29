-- Apply manually after 031. Does not create/cancel any external charge.
begin;
alter table public.billing_provider_settings
  add column if not exists syncpay_pix_enabled boolean not null default false,
  add column if not exists syncpay_card_enabled boolean not null default false;
-- Asaas is retired for NEW sales only. Its existing agreements keep reconciling.
update public.billing_provider_settings set asaas_enabled = false where id = 1;

alter table public.billing_agreements drop constraint if exists billing_agreements_provider_check;
alter table public.billing_agreements add constraint billing_agreements_provider_check check(provider in ('paypal','efi','asaas','mercado_pago','syncpay'));
alter table public.subscriptions drop constraint if exists subscriptions_payment_provider_check;
alter table public.subscriptions add constraint subscriptions_payment_provider_check check(payment_provider in ('paypal','efi','asaas','stripe','mercado_pago','syncpay'));
alter table public.billing_invoices drop constraint if exists billing_invoices_provider_check;
alter table public.billing_invoices add constraint billing_invoices_provider_check check(provider in ('asaas','mercado_pago','syncpay'));

alter table public.billing_agreements
  add column if not exists syncpay_method text check(syncpay_method in ('pix_automatico','credit_card')),
  add column if not exists syncpay_plan_token uuid,
  add column if not exists syncpay_identity text,
  add column if not exists syncpay_consent_at timestamptz;
alter table public.billing_agreements add constraint syncpay_agreement_fields check(
  provider <> 'syncpay' or (syncpay_method is not null and syncpay_plan_token is not null and syncpay_identity is not null));

create table public.syncpay_plan_links (
  plan_id uuid not null references public.plans(id) on delete cascade,
  method text not null check(method in ('pix_automatico','credit_card')),
  external_token uuid not null unique,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key(plan_id, method)
);
alter table public.syncpay_plan_links enable row level security;
revoke all on public.syncpay_plan_links from anon, authenticated;
grant all on public.syncpay_plan_links to service_role;

-- Durable queue: acknowledge receipt before contacting the provider (5s webhook timeout).
-- Store only routing identifiers, never the raw customer/card payload.
create table public.syncpay_events (
  id text primary key,
  subscription_token uuid not null,
  event text not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text
);
alter table public.syncpay_events enable row level security;
revoke all on public.syncpay_events from anon, authenticated;
grant all on public.syncpay_events to service_role;
create index syncpay_events_pending on public.syncpay_events(created_at) where processed_at is null;

create or replace function public.expire_syncpay_subscription(p_subscription uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare s public.subscriptions;
begin
  select * into s from public.subscriptions where id = p_subscription for update;
  if s.id is null or s.payment_provider <> 'syncpay' or s.status <> 'active'
     or s.current_period_end is null or s.current_period_end >= now()
     or not exists(select 1 from public.billing_agreements a where a.id = s.billing_agreement_id and a.provider = 'syncpay') then return false; end if;
  update public.subscriptions set status = case when s.cancel_at_period_end then 'canceled' else 'past_due' end where id = s.id;
  perform public.suspend_org_projects(s.organization_id);
  return true;
end; $$;
revoke all on function public.expire_syncpay_subscription(uuid) from public, anon, authenticated;
grant execute on function public.expire_syncpay_subscription(uuid) to service_role;

-- All confirmed cycles share the existing 10%/30-day rule and unique payment guard.
create or replace function public.record_affiliate_commission()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_config public.affiliate_program_settings; v_ref public.affiliate_referrals; v_cents bigint;
begin
  if new.status <> 'paid' or new.provider not in ('asaas','mercado_pago','syncpay') or new.agreement_id is null then return new; end if;
  select * into v_config from public.affiliate_program_settings where id = 1;
  if not coalesce(v_config.enabled, false) then return new; end if;
  select r.* into v_ref from public.affiliate_referrals r
    join public.organization_members m on m.user_id = r.referred_user_id and m.role = 'owner'
    where m.organization_id = new.organization_id order by r.created_at limit 1;
  if v_ref.id is null then return new; end if;
  if not v_config.recurring and exists(select 1 from public.affiliate_commissions where referral_id = v_ref.id) then return new; end if;
  v_cents := case when v_config.rate_bps is not null then round(new.value * 100 * v_config.rate_bps / 10000)::bigint else v_config.fixed_cents end;
  if v_cents is null or v_cents <= 0 then return new; end if;
  insert into public.affiliate_commissions(affiliate_id, referral_id, payment_id, amount_cents, release_at)
    values(v_ref.affiliate_id, v_ref.id, new.id, v_cents, coalesce(new.paid_date, now()) + make_interval(days => v_config.hold_days))
    on conflict(payment_id) do nothing;
  return new;
end; $$;
commit;
