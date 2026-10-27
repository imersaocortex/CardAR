-- Read-only verification after applying migration 030.
select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='billing_provider_settings' and column_name='mercado_pago_enabled') as provider_switch_exists,
  (select not mercado_pago_enabled from public.billing_provider_settings where id=1) as starts_disabled,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='billing_invoices' and column_name='pix_code') as invoice_pix_code_exists,
  exists(select 1 from pg_proc where proname='expire_mercado_pago_subscription' and pronamespace='public'::regnamespace) as expiry_function_exists,
  exists(select 1 from pg_indexes where schemaname='public' and indexname='billing_mp_one_open_invoice') as one_open_invoice_index_exists;
