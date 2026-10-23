-- Read-only checks after applying migration 028.
select count(*) = 1 as ok, bool_and(not asaas_enabled and not efi_enabled and not paypal_enabled) as all_new_payments_off
from public.billing_provider_settings;
select count(*) = 0 as no_open_legacy_agreements
from public.billing_agreements where provider in ('paypal', 'efi') and status <> 'canceled';
select relrowsecurity as invoice_rls_enabled,
  not has_table_privilege('authenticated', 'public.billing_invoices', 'INSERT') as clients_cannot_write_invoices,
  not has_table_privilege('authenticated', 'public.billing_provider_settings', 'UPDATE') as clients_cannot_enable_payments
from pg_class where oid = 'public.billing_invoices'::regclass;
