-- Read-only. Run after 032 and before enabling either Sync Pay method.
select
  (select not syncpay_pix_enabled and not syncpay_card_enabled and not asaas_enabled from public.billing_provider_settings where id=1) as new_sales_start_disabled,
  (select count(*)=3 from information_schema.columns where table_schema='public' and table_name='billing_agreements' and column_name in ('syncpay_method','syncpay_plan_token','syncpay_identity')) as agreement_fields_ok,
  exists(select 1 from pg_proc where proname='expire_syncpay_subscription' and pronamespace='public'::regnamespace) as expiry_function_exists,
  (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('syncpay_plan_links','syncpay_events')) as rls_enabled,
  not has_table_privilege('authenticated','public.syncpay_events','SELECT') and not has_table_privilege('anon','public.syncpay_events','SELECT') as queue_is_private,
  not has_table_privilege('authenticated','public.syncpay_plan_links','INSERT') and not has_table_privilege('authenticated','public.syncpay_plan_links','UPDATE') as plan_links_server_only,
  not has_function_privilege('authenticated','public.expire_syncpay_subscription(uuid)','EXECUTE') as expiry_server_only,
  position('syncpay' in pg_get_functiondef('public.record_affiliate_commission()'::regprocedure)) > 0 as affiliates_include_syncpay;

-- Informational: do not cancel or migrate these automatically.
select provider, status, count(*) from public.billing_agreements group by provider,status order by provider,status;
