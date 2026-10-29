import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"

// Real PostgreSQL in memory. No env files, Supabase connection or provider requests.
test("migration 032, settlement, affiliate recurrence/hold/payout/reversal and expiry work in isolated PostgreSQL", async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as 'select null::uuid';
      create table organizations(id uuid primary key);
      create table plans(id uuid primary key, projects_limit integer, assets_limit_bytes bigint);
      create table organization_members(organization_id uuid, user_id uuid, role text);
      create table subscriptions(id uuid primary key, organization_id uuid, status text, plan_id uuid, payment_provider text,
        billing_agreement_id uuid, current_period_start timestamptz, current_period_end timestamptz, trial_ends_at timestamptz, cancel_at_period_end boolean default false);
      create table usage_limits(organization_id uuid, projects_limit integer, assets_limit_bytes bigint);
      create table projects(organization_id uuid, suspended boolean default false);
      create function suspend_org_projects(org uuid) returns void language sql as 'update projects set suspended=true where organization_id=org';
      create function unsuspend_org_projects(org uuid) returns void language sql as 'update projects set suspended=false where organization_id=org';
      create table billing_provider_settings(id integer primary key, asaas_enabled boolean, mercado_pago_enabled boolean);
      insert into billing_provider_settings values(1,true,true);
      create table billing_agreements(id uuid primary key, organization_id uuid references organizations(id), plan_id uuid, provider text,
        amount_cents bigint, paid_until timestamptz, status text default 'pending', updated_at timestamptz);
      create table billing_payments(id uuid primary key default gen_random_uuid(), organization_id uuid, agreement_id uuid,
        provider text, external_id text, value numeric(14,2), status text, due_date date, paid_date timestamptz, unique(provider,external_id));
      create table billing_invoices(id uuid primary key, provider text);
      create table billing_charges(txid text, status text, agreement_id uuid);
      create table affiliate_links(id uuid primary key, user_id uuid, active boolean default true);
      create table affiliate_referrals(id uuid primary key, affiliate_id uuid references affiliate_links(id), referred_user_id uuid, created_at timestamptz default now());
    `)
    await db.exec(await readFile(new URL("../supabase/migrations/024_affiliate_commissions.sql", import.meta.url), "utf8"))
    const source = await readFile(new URL("../supabase/migrations/023_paypal_efi_billing.sql", import.meta.url), "utf8")
    await db.exec(source.match(/create or replace function public\.settle_billing_payment[\s\S]*?\$\$;/)[0])
    await db.exec(await readFile(new URL("../supabase/migrations/032_syncpay_subscriptions.sql", import.meta.url), "utf8"))
    const [verification] = await db.exec(await readFile(new URL("../supabase/verify_032.sql", import.meta.url), "utf8"))
    assert.ok(Object.values(verification.rows[0]).every(value => value === true))
    assert.equal((await db.query("select mercado_pago_enabled from billing_provider_settings")).rows[0].mercado_pago_enabled, true)
    const org = "00000000-0000-4000-8000-000000000001"
    const user = "00000000-0000-4000-8000-000000000002"
    const plan = "00000000-0000-4000-8000-000000000003"
    const agreement = "00000000-0000-4000-8000-000000000004"
    const affiliate = "00000000-0000-4000-8000-000000000005"
    await db.exec(`insert into auth.users values('${user}'); insert into organizations values('${org}');
      insert into plans values('${plan}',50,1000000); insert into usage_limits(organization_id) values('${org}');
      insert into projects(organization_id) values('${org}');
      insert into subscriptions(id,organization_id,status) values(gen_random_uuid(),'${org}','past_due');
      insert into organization_members values('${org}','${user}','owner');
      insert into affiliate_links(id) values('${affiliate}');
      insert into affiliate_referrals(id,affiliate_id,referred_user_id) values(gen_random_uuid(),'${affiliate}','${user}');
      insert into billing_agreements(id,organization_id,plan_id,provider,amount_cents,syncpay_method,syncpay_plan_token,syncpay_identity)
        values('${agreement}','${org}','${plan}','syncpay',2990,'pix_automatico',gen_random_uuid(),'identity-hash');`)
    const settle = (external, paid, end, amount = 2990) => db.query(`select settle_billing_payment($1,$2,$3,${paid},${end},null) as ok`, [agreement, external, amount])
    await assert.rejects(settle("wrong-amount", "now()", "now()+interval '30 days'", 299))
    assert.equal((await settle("sync-sub:1", "now()-interval '31 days'", "now()-interval '1 day'")).rows[0].ok, true)
    assert.equal((await settle("sync-sub:1", "now()", "now()+interval '365 days'")).rows[0].ok, false)
    assert.equal((await db.query("select count(*)::int as n from billing_payments")).rows[0].n, 1)
    const commission = (await db.query("select amount_cents::int as cents, release_at=paid_date+interval '30 days' as held from affiliate_commissions join billing_payments on payment_id=billing_payments.id")).rows[0]
    assert.deepEqual(commission, { cents: 299, held: true })
    await db.exec("update subscriptions set status='active'")
    assert.equal((await db.query("select expire_syncpay_subscription(id) as ok from subscriptions")).rows[0].ok, true)
    assert.equal((await db.query("select suspended from projects")).rows[0].suspended, true)
    await settle("sync-sub:2", "now()", "now()+interval '30 days'")
    assert.equal((await db.query("select status from subscriptions")).rows[0].status, "active")
    assert.equal((await db.query("select suspended from projects")).rows[0].suspended, false)
    assert.equal((await db.query("select count(*)::int as n from affiliate_commissions")).rows[0].n, 2)
    const payout = (await db.query("select request_affiliate_payout($1,'pix@example.test') as id", [affiliate])).rows[0].id
    assert.equal((await db.query("select amount_cents::int as cents from affiliate_payouts")).rows[0].cents, 299)
    await assert.rejects(db.query("select request_affiliate_payout($1,'pix@example.test')", [affiliate]))
    await assert.rejects(db.query("select review_affiliate_payout($1,true,'',$2)", [payout,user]))
    await db.query("select review_affiliate_payout($1,true,'LOCAL-TEST-REFERENCE',$2)", [payout,user])
    await db.exec("select reverse_billing_payment('syncpay','sync-sub:2')")
    assert.equal((await db.query("select status from subscriptions")).rows[0].status, "past_due")
    assert.equal((await db.query("select suspended from projects")).rows[0].suspended, true)
    await db.exec("select reverse_billing_payment('syncpay','sync-sub:1'); select reverse_billing_payment('syncpay','sync-sub:1')")
    assert.equal((await db.query("select count(*)::int as n from affiliate_refund_alerts")).rows[0].n, 1)
    assert.equal((await db.query("select count(*)::int as n from affiliate_commissions where voided_at is not null")).rows[0].n, 2)
    await db.exec("set role authenticated")
    await assert.rejects(db.query("select * from syncpay_events"))
    await assert.rejects(db.query("insert into syncpay_plan_links values(gen_random_uuid(),'credit_card',gen_random_uuid(),now(),null)"))
  } finally { await db.close() }
})
