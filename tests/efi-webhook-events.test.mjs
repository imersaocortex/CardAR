import test from "node:test"
import assert from "node:assert/strict"
import { parseEfiWebhookEvents } from "../src/lib/payments/efi-events.ts"

test("receives initial, recurring-charge and recurrence notifications without trusting payment status", () => {
  const txid = "3136957d93134f2184b369e8f1c0729d"
  const idRec = "RR1234567820240115abcdefghijk"
  assert.deepEqual(parseEfiWebhookEvents({
    pix: [{ txid, status: "CONCLUIDA" }],
    cobsr: [{ txid, idRec, status: "ATIVA" }],
    recs: [{ idRec, status: "APROVADA" }],
  }), { txids: [txid], recurrenceIds: [idRec], endToEndIds: [] })
})

test("ignores malformed and unrelated webhook entries", () => {
  assert.deepEqual(parseEfiWebhookEvents({ pix: [{ txid: "../../escape" }], cobsr: "invalid", recs: [{ idRec: 123 }] }), { txids: [], recurrenceIds: [], endToEndIds: [] })
  assert.deepEqual(parseEfiWebhookEvents(null), { txids: [], recurrenceIds: [], endToEndIds: [] })
})

test("identifies a paid Pix even when Efí omits txid from the notification", () => {
  const endToEndId = "E12345678202009091221abcdef12345"
  assert.deepEqual(parseEfiWebhookEvents({ pix: [{ endToEndId, valor: "10.00" }] }), { txids: [], recurrenceIds: [], endToEndIds: [endToEndId] })
})
