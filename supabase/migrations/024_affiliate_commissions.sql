begin;
create table public.affiliate_program_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  rate_bps integer check (rate_bps between 0 and 10000),
  fixed_cents bigint check (fixed_cents >= 0),
  recurring boolean not null default false,
  hold_days integer not null default 30 check (hold_days between 0 and 365),
  updated_at timestamptz not null default now(),
  check (not enabled or ((coalesce(rate_bps, 0) > 0 and fixed_cents is null) or (coalesce(fixed_cents, 0) > 0 and rate_bps is null)))
);
insert into public.affiliate_program_settings(id, enabled, rate_bps, recurring, hold_days)
  values (1, true, 1000, true, 30);
create table public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_links(id),
  amount_cents bigint not null check (amount_cents > 0),
  pix_key text not null check (length(pix_key) between 5 and 120),
  status text not null default 'requested' check (status in ('requested', 'paid', 'rejected')),
  transfer_reference text,
  requested_at timestamptz not null default now(),
  paid_at timestamptz,
  reviewed_by uuid references auth.users(id)
);
create table public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_links(id),
  referral_id uuid not null references public.affiliate_referrals(id),
  payment_id uuid not null unique references public.billing_payments(id),
  amount_cents bigint not null check (amount_cents > 0),
  release_at timestamptz not null,
  payout_id uuid references public.affiliate_payouts(id),
  voided_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.affiliate_refund_alerts (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null unique references public.affiliate_commissions(id),
  amount_cents bigint not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index affiliate_commissions_available on public.affiliate_commissions(affiliate_id, release_at) where payout_id is null and voided_at is null;
alter table public.affiliate_program_settings enable row level security;
alter table public.affiliate_payouts enable row level security;
alter table public.affiliate_commissions enable row level security;
alter table public.affiliate_refund_alerts enable row level security;
create policy affiliate_payouts_read on public.affiliate_payouts for select to authenticated using (
  exists(select 1 from public.affiliate_links l where l.id = affiliate_id and l.user_id = auth.uid())
);
create policy affiliate_commissions_read on public.affiliate_commissions for select to authenticated using (
  exists(select 1 from public.affiliate_links l where l.id = affiliate_id and l.user_id = auth.uid())
);

create or replace function public.record_affiliate_commission()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_config public.affiliate_program_settings; v_ref public.affiliate_referrals; v_cents bigint;
begin
  if new.status <> 'paid' or new.provider not in ('paypal', 'efi') then return new; end if;
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
end;
$$;
create trigger record_affiliate_commission after insert on public.billing_payments
  for each row execute function public.record_affiliate_commission();

create or replace function public.reverse_billing_payment(p_provider text, p_external_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_payment public.billing_payments; v_commission public.affiliate_commissions; v_payout public.affiliate_payouts;
begin
  select * into v_payment from public.billing_payments where provider = p_provider and external_id = p_external_id for update;
  if v_payment.id is null or v_payment.status = 'refunded' then return; end if;
  update public.billing_payments set status = 'refunded' where id = v_payment.id;
  select * into v_commission from public.affiliate_commissions where payment_id = v_payment.id for update;
  if v_commission.id is not null then
    if v_commission.payout_id is not null then
      select * into v_payout from public.affiliate_payouts where id = v_commission.payout_id for update;
      if v_payout.status = 'requested' then
        update public.affiliate_payouts set status = 'rejected' where id = v_payout.id;
        update public.affiliate_commissions set payout_id = null where payout_id = v_payout.id;
      elsif v_payout.status = 'paid' then
        insert into public.affiliate_refund_alerts(commission_id, amount_cents) values(v_commission.id, v_commission.amount_cents)
          on conflict(commission_id) do nothing;
      end if;
    end if;
    update public.affiliate_commissions set voided_at = now() where id = v_commission.id;
  end if;
  update public.subscriptions set status = 'past_due'
    where billing_agreement_id = v_payment.agreement_id and status = 'active' and current_period_start <= v_payment.paid_date
      and current_period_start > v_payment.paid_date - interval '1 day';
  if found then perform public.suspend_org_projects(v_payment.organization_id); end if;
end;
$$;
revoke all on function public.reverse_billing_payment(text, text) from public, anon, authenticated;
grant execute on function public.reverse_billing_payment(text, text) to service_role;

create or replace function public.request_affiliate_payout(p_affiliate uuid, p_pix_key text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_total bigint; v_id uuid;
begin
  perform 1 from public.affiliate_links where id = p_affiliate and active for update;
  if not found or length(trim(p_pix_key)) not between 5 and 120 then raise exception 'Invalid payout request'; end if;
  select sum(amount_cents) into v_total from public.affiliate_commissions
    where affiliate_id = p_affiliate and payout_id is null and voided_at is null and release_at <= now();
  if coalesce(v_total, 0) <= 0 then raise exception 'No available commissions'; end if;
  insert into public.affiliate_payouts(affiliate_id, amount_cents, pix_key) values(p_affiliate, v_total, trim(p_pix_key)) returning id into v_id;
  update public.affiliate_commissions set payout_id = v_id
    where affiliate_id = p_affiliate and payout_id is null and voided_at is null and release_at <= now();
  return v_id;
end;
$$;
revoke all on function public.request_affiliate_payout(uuid, text) from public, anon, authenticated;
grant execute on function public.request_affiliate_payout(uuid, text) to service_role;

create or replace function public.review_affiliate_payout(p_payout uuid, p_approve boolean, p_reference text, p_reviewer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_payout public.affiliate_payouts;
begin
  select * into strict v_payout from public.affiliate_payouts where id = p_payout for update;
  if v_payout.status <> 'requested' then raise exception 'Already reviewed'; end if;
  if p_approve and length(trim(coalesce(p_reference, ''))) < 5 then raise exception 'Transfer reference required'; end if;
  if p_approve then
    update public.affiliate_payouts set status = 'paid', transfer_reference = trim(p_reference), paid_at = now(), reviewed_by = p_reviewer where id = p_payout;
  else
    update public.affiliate_payouts set status = 'rejected', reviewed_by = p_reviewer where id = p_payout;
    update public.affiliate_commissions set payout_id = null where payout_id = p_payout;
  end if;
end;
$$;
revoke all on function public.review_affiliate_payout(uuid, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.review_affiliate_payout(uuid, boolean, text, uuid) to service_role;
commit;
