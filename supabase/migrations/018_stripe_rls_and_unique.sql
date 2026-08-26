-- ============================================================
-- CortexAR — Stripe RLS Policies & Unique Constraint
-- 1. Unique constraint on stripe_payments.stripe_payment_intent_id
-- 2. RLS policies for stripe_customers, stripe_checkouts, stripe_payments
-- ============================================================

-- 1. Unique constraint to prevent duplicate stripe payments
alter table public.stripe_payments
  add constraint stripe_payments_stripe_payment_intent_id_key
  unique (stripe_payment_intent_id);

-- 2. RLS for stripe_customers
alter table public.stripe_customers enable row level security;

create policy "Members can read stripe customers"
  on public.stripe_customers for select
  using (public.is_org_member(organization_id));

create policy "Members can insert stripe customers"
  on public.stripe_customers for insert
  with check (public.is_org_member(organization_id));

-- 3. RLS for stripe_checkouts
alter table public.stripe_checkouts enable row level security;

create policy "Members can read stripe checkouts"
  on public.stripe_checkouts for select
  using (public.is_org_member(organization_id));

-- 4. RLS for stripe_payments
alter table public.stripe_payments enable row level security;

create policy "Members can read stripe payments"
  on public.stripe_payments for select
  using (public.is_org_member(organization_id));
