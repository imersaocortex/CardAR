import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import ts from "typescript"
import * as rules from "../src/lib/payments/syncpay-rules.ts"
const require = createRequire(import.meta.url)
function load(path, mocks) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const loaded = { exports: {} }
  new Function("require", "module", "exports", outputText)(name => name in mocks ? mocks[name] : require(name), loaded, loaded.exports)
  return loaded.exports
}
class ApiError extends Error { constructor(status) { super(`HTTP ${status}`); this.status = status } }
function harness(enrollmentError) {
  const token = "00000000-0000-4000-8000-000000000003"
  const subToken = "00000000-0000-4000-8000-000000000004"
  const profile = { id: "user", name: "Test Buyer", email: "buyer@example.test", cpf_cnpj: "12345678900", phone: "81999999999" }
  const plan = { token, amount: "29.90", billing_method: "credit_card", periodicity_days: 30, status: "active" }
  const tables = { plans: [{ id: "plan", price: "29.90", billing_cycle: "monthly", active: true }], subscriptions: [{ organization_id: "org", status: "past_due" }],
    profiles: [profile], syncpay_plan_links: [{ plan_id: "plan", method: "credit_card", external_token: token }], billing_agreements: [], billing_invoices: [] }
  const calls = []; const rpcs = []
  const remote = { token: subToken, status: "pending_first_payment", subscriber_email: profile.email, subscriber_document: profile.cpf_cnpj, started_at: null, plan, charges: null }
  const admin = {
    from(table) {
      const filters = []; let action; let values
      const matches = row => filters.every(([field, value, negative]) => negative ? row[field] !== value : row[field] === value)
      const resolve = () => {
        if (action === "insert") { const row = { id: "agreement", ...values }; tables[table].push(row); return { data: row, error: null } }
        if (action === "upsert") { tables[table].push(values); return { data: values, error: null } }
        if (action === "update") tables[table].filter(matches).forEach(row => Object.assign(row, values))
        return { data: tables[table].find(matches) || null, error: null }
      }
      const builder = { select() { return this }, eq(field,value) { filters.push([field,value,false]); return this }, neq(field,value) { filters.push([field,value,true]); return this },
        insert(value) { action="insert"; values=value; return this }, update(value) { action="update"; values=value; return this },
        upsert(value) { action="upsert"; values=value; return this }, single: async () => resolve(), maybeSingle: async () => resolve(), then: (yes,no) => Promise.resolve(resolve()).then(yes,no) }
      return builder
    },
    async rpc(name, args) { rpcs.push({ name, args }); return { data: true, error: null } },
  }
  const api = async (path, method="GET", body) => {
    calls.push({ path, method, body })
    if (path.endsWith("/enroll")) {
      if (enrollmentError) throw enrollmentError
      return { subscription_token: subToken, billing_method: "credit_card", payment: { status: "approved" } }
    }
    if (path.startsWith("/subscriptions/")) return { data: remote }
    return { data: plan }
  }
  const service = load("src/lib/payments/syncpay.ts", {
    "server-only": {}, "@/lib/supabase/admin": { createAdminClient: () => admin },
    "./money": { amountInCents: value => Math.round(Number(value)*100) }, "./settings": { billingAvailability: async () => ({ syncpay: { card_configured: true, pix_configured: true } }) },
    "./syncpay-rules": rules, "./syncpay-api": { syncPayRequest: api, SyncPayApiError: ApiError },
  })
  const start = () => service.startSyncPayAgreement("org","user","plan","credit_card","card_token.test-sealed-token")
  return { start, service, calls, rpcs, tables, remote }
}
test("a timeout after enrollment is never retried and leaves an administratively recoverable attempt", async () => {
  const h = harness(new Error("network timeout"))
  await assert.rejects(h.start(), /timeout/)
  await assert.rejects(h.start(), /conferência administrativa/)
  assert.equal(h.calls.filter(call => call.method === "POST").length, 1)
  assert.equal(h.tables.billing_agreements.length, 1)
  assert.equal(h.tables.billing_agreements[0].setup_stage, "enrolling")
  assert.equal(h.rpcs.length, 0)
})
test("an explicit 422 rejection closes only the local failed attempt without granting access", async () => {
  const h = harness(new ApiError(422))
  await assert.rejects(h.start(), /422/)
  assert.equal(h.tables.billing_agreements[0].status, "canceled")
  assert.equal(h.tables.billing_agreements[0].setup_stage, "rejected")
  assert.equal(h.rpcs.length, 0)
})
test("card approved does not grant access until the authenticated subscription reports a paid cycle", async () => {
  const h = harness()
  const agreement = await h.start()
  assert.equal(h.rpcs.length, 0)
  assert.ok(agreement.external_id)
  assert.ok(h.tables.billing_agreements[0].syncpay_consent_at)
  h.remote.started_at = new Date(Date.now()-3600000).toISOString()
  h.remote.charges = [{ cycle_number: 1, amount: "29.90", status: "paid", due_date: new Date().toISOString().slice(0,10), paid_at: h.remote.started_at }]
  await h.service.reconcileSyncPayAgreement(agreement)
  assert.equal(h.rpcs[0].name, "settle_billing_payment")
  assert.equal(h.rpcs[0].args.p_external_id, `${agreement.external_id}:1`)
  assert.equal(h.rpcs[0].args.p_amount_cents, 2990)
  h.remote.subscriber_document = "99999999999"
  await assert.rejects(h.service.reconcileSyncPayAgreement(agreement), /divergente/)
  assert.equal(h.rpcs.length, 1)
})
