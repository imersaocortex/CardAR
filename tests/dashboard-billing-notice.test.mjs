import test from "node:test"
import assert from "node:assert/strict"
import { dashboardBillingNotice } from "../src/lib/payments/dashboard-notice.ts"

const now = Date.parse("2026-10-28T12:00:00Z")

test("dashboard warns when an active subscription has passed its paid period", () => {
  const subscription = { status: "active", current_period_end: "2026-10-28T12:00:00Z" }
  const notice = dashboardBillingNotice(subscription, false, now)
  assert.equal(notice?.kind, "expired")
  assert.match(notice?.title || "", /venceu/)
  assert.equal(notice?.action, "Regularizar assinatura")
  assert.equal(dashboardBillingNotice(subscription, true, now), null)
})

test("dashboard warns before expiration and clears the notice after renewal", () => {
  assert.equal(dashboardBillingNotice({ status: "active", current_period_end: "2026-11-01T12:00:00Z" }, false, now)?.kind, "upcoming")
  assert.equal(dashboardBillingNotice({ status: "active", current_period_end: "2026-12-01T12:00:00Z" }, false, now), null)
})

test("dashboard distinguishes late, canceled and pending subscriptions", () => {
  assert.equal(dashboardBillingNotice({ status: "past_due" }, false, now)?.kind, "expired")
  assert.match(dashboardBillingNotice({ status: "canceled" }, false, now)?.title || "", /cancelada/)
  assert.equal(dashboardBillingNotice({ status: "pending" }, false, now)?.kind, "pending")
  assert.equal(dashboardBillingNotice({ status: "trialing", trial_ends_at: "2026-10-27T12:00:00Z" }, false, now)?.kind, "expired")
})
