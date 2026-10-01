import "server-only"
import { request } from "node:https"

export class EfiError extends Error {
  constructor(public status: number) { super(`Efí não concluiu a operação (${status})`) }
}

function config() {
  const client = process.env.EFI_CLIENT_ID, secret = process.env.EFI_CLIENT_SECRET, certificate = process.env.EFI_CERTIFICATE_BASE64
  if (!client || !secret || !certificate) throw new Error("Efí não configurada")
  const production = process.env.EFI_ENVIRONMENT === "production"
  if (production && process.env.BILLING_LIVE_ENABLED !== "true") throw new Error("Cobranças reais ainda não foram habilitadas")
  return { base: production ? "https://pix.api.efipay.com.br" : "https://pix-h.api.efipay.com.br", client, secret, certificate }
}

async function transport<T>(path: string, method: string, body: unknown, authorization: string): Promise<T> {
  const { base, certificate } = config()
  const payload = body === undefined ? undefined : JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = request(new URL(path, base), {
      method, pfx: Buffer.from(certificate, "base64"), passphrase: process.env.EFI_CERTIFICATE_PASSPHRASE || "",
      rejectUnauthorized: true,
      headers: { Authorization: authorization, "Content-Type": "application/json", ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}) },
    }, (res) => {
      let raw = ""
      res.setEncoding("utf8")
      res.on("data", (chunk: string) => { raw += chunk; if (raw.length > 2_000_000) req.destroy(new Error("Resposta Efí excedeu o limite")) })
      res.on("error", reject)
      res.on("end", () => {
        if (!res.statusCode || res.statusCode >= 300) { reject(new EfiError(res.statusCode ?? 500)); return }
        try { resolve((raw ? JSON.parse(raw) : undefined) as T) } catch { reject(new Error("Resposta Efí inválida")) }
      })
    })
    req.setTimeout(20000, () => req.destroy(new Error("Tempo de resposta Efí esgotado")))
    req.on("error", reject)
    req.end(payload)
  })
}

export async function efiRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const { client, secret } = config()
  const token = await transport<{ access_token: string }>("/oauth/token", "POST", { grant_type: "client_credentials" }, `Basic ${Buffer.from(`${client}:${secret}`).toString("base64")}`)
  return transport<T>(path, method, body, `Bearer ${token.access_token}`)
}

export interface PixCharge {
  txid: string; status: string; pixCopiaECola?: string; valor: { original: string }; chave?: string
  calendario?: { criacao?: string; expiracao?: number; dataDeVencimento?: string }
  pix?: { endToEndId: string; valor: string; horario: string; devolucoes?: { status: string; valor: string }[] }[]
  tentativas?: { endToEndId?: string; status: string; dataLiquidacao?: string }[]
}
export interface PixRecurrence { idRec: string; status: string; vinculo?: { contrato: string }; dadosQR?: { pixCopiaECola: string } }
