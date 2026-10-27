-- Apply manually after 029. Mercado Pago starts disabled and creates no charges.
begin;

alter table public.billing_provider_settings
  add column if not exists mercado_pago_enabled boolean not null default false;

alter table public.billing_agreements drop constraint if exists billing_agreements_provider_check;
alter table public.billing_agreements add constraint billing_agreements_provider_check
  check (provider in ('paypal', 'efi', 'asaas', 'mercado_pago'));

alter table public.subscriptions drop constraint if exists subscriptions_payment_provider_check;
alter table public.subscriptions add constraint subscriptions_payment_provider_check
  check (payment_provider in ('asaas', 'stripe', 'paypal', 'efi', 'mercado_pago'));

alter table public.billing_invoices drop constraint if exists billing_invoices_provider_check;
alter table public.billing_invoices add constraint billing_invoices_provider_check
  check (provider in ('asaas', 'mercado_pago'));
alter table public.billing_invoices add column if not exists pix_code text;
alter table public.billing_invoices add column if not exists qr_expires_at timestamptz;
alter table public.billing_invoices add column if not exists generation_claimed_at timestamptz;
create unique index if not exists billing_mp_one_open_invoice
  on public.billing_invoices(agreement_id)
  where provider = 'mercado_pago' and status in ('creating', 'pending', 'in_process');

create or replace function public.expire_mercado_pago_subscription(p_subscription uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare s public.subscriptions;
begin
  select * into s from public.subscriptions where id = p_subscription for update;
  if s.id is null or s.payment_provider <> 'mercado_pago' or s.status <> 'active'
     or s.current_period_end is null or s.current_period_end >= now()
     or not exists(select 1 from public.billing_agreements a
       where a.id = s.billing_agreement_id and a.provider = 'mercado_pago') then
    return false;
  end if;
  update public.subscriptions
    set status = case when s.cancel_at_period_end then 'canceled' else 'past_due' end
    where id = s.id;
  perform public.suspend_org_projects(s.organization_id);
  return true;
end; $$;
revoke all on function public.expire_mercado_pago_subscription(uuid) from public, anon, authenticated;
grant execute on function public.expire_mercado_pago_subscription(uuid) to service_role;

-- Preserve the existing affiliate rule for Asaas while including confirmed Mercado Pago payments.
create or replace function public.record_affiliate_commission()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_config public.affiliate_program_settings; v_ref public.affiliate_referrals; v_cents bigint;
begin
  if new.status <> 'paid' or new.provider not in ('asaas', 'mercado_pago') or new.agreement_id is null then return new; end if;
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
