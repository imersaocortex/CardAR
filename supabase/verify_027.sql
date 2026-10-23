-- Read-only verification after applying migration 027 in the SQL Editor.
select
  count(*) = 1 as ok,
  bool_and(not efi_enabled and not paypal_enabled) as both_providers_initially_disabled
from public.billing_provider_settings;

select
  relrowsecurity as rls_enabled,
  not has_table_privilege('authenticated', 'public.billing_provider_settings', 'SELECT') as no_client_read,
  not has_table_privilege('authenticated', 'public.billing_provider_settings', 'UPDATE') as no_client_update
from pg_class
where oid = 'public.billing_provider_settings'::regclass;
