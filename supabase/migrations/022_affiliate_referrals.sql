begin;
create table public.affiliate_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  code text not null unique default encode(gen_random_bytes(12), 'hex'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_links(id),
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.affiliate_links enable row level security;
alter table public.affiliate_referrals enable row level security;
create policy affiliate_links_read on public.affiliate_links for select to authenticated using (user_id = auth.uid());
create policy affiliate_referrals_read on public.affiliate_referrals for select to authenticated using (
  exists(select 1 from public.affiliate_links a where a.id = affiliate_id and a.user_id = auth.uid())
);
-- Attribution runs once, during signup, before a user can change their metadata.
-- This records referrals only; it does not award money or subscription rights.
create or replace function public.capture_affiliate_referral()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.affiliate_referrals(affiliate_id, referred_user_id)
    select id, new.id from public.affiliate_links
    where code = new.raw_user_meta_data->>'referral_code' and active and user_id <> new.id
    on conflict(referred_user_id) do nothing;
  return new;
end;
$$;
create trigger capture_affiliate_referral after insert on auth.users
  for each row execute function public.capture_affiliate_referral();
commit;
