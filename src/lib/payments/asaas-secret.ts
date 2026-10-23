import "server-only"
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"

function masterKey() {
  const encoded = process.env.ASAAS_SECRETS_KEY || ""
  const key = Buffer.from(encoded, "base64")
  if (key.length !== 32 || key.toString("base64") !== encoded) throw new Error("ASAAS_SECRETS_KEY deve conter 32 bytes em base64")
  return key
}
export function canStoreAsaasKey() {
  try { masterKey(); return true } catch { return false }
}
export function encryptAsaasKey(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":")
}
export async function configuredAsaasKey() {
  const { data, error } = await createAdminClient().from("billing_provider_settings")
    .select("asaas_api_key_ciphertext").eq("id", 1).single()
  if (error) throw new Error("Configuração da Asaas indisponível")
  if (!data.asaas_api_key_ciphertext) return process.env.ASAAS_API_KEY || ""
  const [version, iv, tag, encrypted] = data.asaas_api_key_ciphertext.split(":")
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Chave Asaas armazenada inválida")
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64"))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8")
}
