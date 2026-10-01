-- Apenas leitura. Execute depois das migrações 020 a 024, em ordem.
select 'save_studio_scene' as item, to_regprocedure('public.save_studio_scene(uuid,uuid,jsonb)') is not null as ok
union all select 'billing_agreements', to_regclass('public.billing_agreements') is not null
union all select 'billing_payments', to_regclass('public.billing_payments') is not null
union all select 'affiliate_referrals', to_regclass('public.affiliate_referrals') is not null
union all select 'affiliate_commissions', to_regclass('public.affiliate_commissions') is not null
union all select 'request_affiliate_payout', to_regprocedure('public.request_affiliate_payout(uuid,text)') is not null
union all select 'reverse_billing_payment', to_regprocedure('public.reverse_billing_payment(text,text)') is not null;

-- Compare os totais: o histórico antigo deve permanecer integral e aparecer no novo livro.
select
  (select count(*) from public.asaas_payments) as registros_asaas_originais,
  (select count(*) from public.billing_payments where provider = 'asaas') as registros_asaas_copiados,
  (select count(*) from public.stripe_payments) as registros_stripe_originais,
  (select count(*) from public.billing_payments where provider = 'stripe') as registros_stripe_copiados;

-- Verifique a regra comercial combinada: ativo, 10%, renovações, 30 dias.
select enabled, rate_bps, recurring, hold_days from public.affiliate_program_settings where id = 1;

-- Se aparecer alguma assinatura ativa antiga, não publique a versão que desativa os webhooks antigos.
select payment_provider, status, count(*) as assinaturas
from public.subscriptions
where payment_provider in ('asaas', 'stripe') and status in ('active', 'trialing', 'past_due')
group by payment_provider, status;
