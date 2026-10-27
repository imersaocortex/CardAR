import { createHmac, timingSafeEqual } from "node:crypto"

export function verifyMercadoPagoSignature(secret: string, signatureHeader: string, requestId: string, paymentId: string) {
  const ts = /(?:^|,)\s*ts=([0-9]+)(?:,|$)/.exec(signatureHeader)?.[1]
  const signature = /(?:^|,)\s*v1=([a-f0-9]{64})(?:,|$)/i.exec(signatureHeader)?.[1]
  if (!secret || !ts || !signature || !requestId || !/^\d+$/.test(paymentId)) return false
  const manifest = `id:${paymentId.toLowerCase()};request-id:${requestId};ts:${ts};`
  const expected = createHmac("sha256", secret).update(manifest).digest("hex")
  return timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected))
}
