-- Read-only verification after migration 029.
select exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'billing_provider_settings' and column_name = 'asaas_pix_key'
) as pix_key_column_exists,
exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'billing_provider_settings' and column_name = 'asaas_api_key_ciphertext'
) as encrypted_api_key_column_exists,
not has_table_privilege('authenticated', 'public.billing_provider_settings', 'SELECT') as clients_cannot_read_key,
not has_table_privilege('authenticated', 'public.billing_provider_settings', 'UPDATE') as clients_cannot_change_key;
