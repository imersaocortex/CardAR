-- Execute manually in the production SQL Editor. All new payment controls remain off.
begin;

alter table public.billing_provider_settings add column if not exists asaas_enabled boolean not null default false;
update public.billing_provider_settings set asaas_enabled = false, efi_enabled = false, paypal_enabled = false where id = 1;
alter table public.billing_agreements drop constraint if exists billing_agreements_provider_check;
alter table public.billing_agreements add constraint billing_agreements_provider_check check (provider in ('paypal', 'efi', 'asaas'));
alter table public.billing_agreements add column if not exists asaas_customer_id text;
alter table public.billing_agreements add column if not exists asaas_subscription_id text;
alter table public.billing_agreements add column if not exists qr_expires_at timestamptz;
create unique index if not exists billing_asaas_subscription_unique on public.billing_agreements(asaas_subscription_id) where asaas_subscription_id is not null;

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider = 'asaas'),
  external_id text not null,
  agreement_id uuid not null references public.billing_agreements(id),
  organization_id uuid not null references public.organizations(id),
  amount_cents bigint not null check (amount_cents > 0),
  due_date date not null,
  status text not null,
  invoice_url text,
  upcoming_claimed_at timestamptz,
  upcoming_sent_at timestamptz,
  overdue_claimed_at timestamptz,
  overdue_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, external_id)
);
create index if not exists billing_invoices_due on public.billing_invoices(due_date, status);
alter table public.billing_invoices enable row level security;
revoke all on public.billing_invoices from anon, authenticated;
grant select on public.billing_invoices to authenticated;
create policy billing_invoices_read on public.billing_invoices for select to authenticated using (public.is_org_member(organization_id));

-- Preserve draft and paused project states across a billing suspension.
alter table public.projects add column if not exists suspended_from_status text;
create or replace function public.suspend_org_projects(p_organization_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.projects set suspended_from_status = status, status = 'suspended', updated_at = now()
    where organization_id = p_organization_id and status in ('published', 'draft', 'paused');
end; $$;
create or replace function public.unsuspend_org_projects(p_organization_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.projects set status = coalesce(suspended_from_status, 'published'), suspended_from_status = null, updated_at = now()
    where organization_id = p_organization_id and status = 'suspended';
end; $$;

-- Expiration and project blocking happen in one transaction after locking the subscription.
create or replace function public.expire_asaas_subscription(p_subscription uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare s public.subscriptions;
begin
  select * into s from public.subscriptions where id = p_subscription for update;
  if s.id is null or s.payment_provider <> 'asaas' or s.status <> 'active' or s.current_period_end >= now() or
    not exists(select 1 from public.billing_agreements a where a.id = s.billing_agreement_id and a.provider = 'asaas') then return false; end if;
  update public.subscriptions set status = case when s.cancel_at_period_end then 'canceled' else 'past_due' end where id = s.id;
  perform public.suspend_org_projects(s.organization_id);
  return true;
end; $$;
revoke all on function public.expire_asaas_subscription(uuid) from public, anon, authenticated;
grant execute on function public.expire_asaas_subscription(uuid) to service_role;

-- Commissions apply only to new, confirmed Asaas billing agreements, never imported history.
create or replace function public.record_affiliate_commission()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_config public.affiliate_program_settings; v_ref public.affiliate_referrals; v_cents bigint;
begin
  if new.status <> 'paid' or new.provider <> 'asaas' or new.agreement_id is null then return new; end if;
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
