export function amountInCents(value: string | number): number {
  const text = String(value)
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error("Valor monetário inválido")
  const [whole, fraction = ""] = text.split(".")
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  if (!Number.isSafeInteger(cents)) throw new Error("Valor monetário inválido")
  return cents
}

export function advanceBillingPeriod(value: string, cycle: "monthly" | "yearly"): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error("Data inválida")
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + (cycle === "yearly" ? 12 : 1))
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, last))
  return date.toISOString()
}
