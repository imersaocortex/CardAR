-- Provider switches are server-managed and start disabled, including existing installs.
begin;

create table if not exists public.billing_provider_settings (
  id integer primary key default 1 check (id = 1),
  efi_enabled boolean not null default false,
  paypal_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.billing_provider_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.billing_provider_settings enable row level security;
revoke all on public.billing_provider_settings from anon, authenticated;

commit;
