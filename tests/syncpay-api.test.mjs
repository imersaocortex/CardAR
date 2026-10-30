import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"

test("Sync Pay sends the enrollment attempt key without retrying an uncertain financial response", async () => {
  const calls = []
  const fakeFetch = async (url, request) => {
    calls.push({ url, request })
    if (url.endsWith("/auth-token")) return { ok: true, json: async () => ({ access_token: "test-only-token", expires_in: 3600 }) }
    throw new Error("uncertain response")
  }
  const { outputText } = ts.transpileModule(readFileSync(new URL("../src/lib/payments/syncpay-api.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const module = { exports: {} }
  const isolatedProcess = { env: { SYNC_PAY_CLIENT_ID: "test-only-id", SYNC_PAY_CLIENT_SECRET: "test-only-secret" } }
  new Function("require", "module", "exports", "fetch", "process", outputText)(() => ({}), module, module.exports, fakeFetch, isolatedProcess)
  await assert.rejects(module.exports.syncPayRequest("/subscription-plans/test/enroll", "POST", { billing_method: "credit_card" }, { idempotencyKey: "agreement-test-id" }), /uncertain response/)
  assert.equal(calls.length, 2)
  assert.equal(calls[1].request.headers["Idempotency-Key"], "agreement-test-id")
  assert.equal(calls[1].request.headers.Authorization, "Bearer test-only-token")
  assert.equal(JSON.parse(calls[1].request.body).billing_method, "credit_card")
})
