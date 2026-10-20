import "server-only"
import { efiRequest, EfiError } from "./efi"

type WebhookName = "pix" | "rec" | "cobr"
const names: WebhookName[] = ["pix", "rec", "cobr"]

function expectedUrl() {
  const origin = new URL(process.env.APP_URL || "")
  const token = process.env.EFI_WEBHOOK_TOKEN
  if (origin.protocol !== "https:" || !token || !/^[A-Za-z0-9_-]{24,}$/.test(token)) throw new Error("Configure APP_URL HTTPS e EFI_WEBHOOK_TOKEN URL-safe (mínimo 24 caracteres)")
  return `${origin.origin}/api/webhooks/efi/${encodeURIComponent(token)}?ignorar=`
}

function endpoint(name: WebhookName) {
  if (name === "pix") {
    const key = process.env.EFI_PIX_KEY
    if (!key) throw new Error("Configure EFI_PIX_KEY")
    return `/v2/webhook/${encodeURIComponent(key)}`
  }
  return name === "rec" ? "/v2/webhookrec" : "/v2/webhookcobr"
}

async function registeredUrls() {
  const result = {} as Record<WebhookName, string | null>
  for (const name of names) {
    try {
      const remote = await efiRequest<{ webhookUrl: string }>(endpoint(name))
      result[name] = remote.webhookUrl
    } catch (error) {
      if (!(error instanceof EfiError) || error.status !== 404) throw error
      result[name] = null
    }
  }
  return result
}

export async function efiWebhookStatus() {
  const url = expectedUrl()
  const registered = await registeredUrls()
  return Object.fromEntries(names.map((name) => [name, registered[name] === url])) as Record<WebhookName, boolean>
}

export async function registerEfiWebhooks() {
  const url = expectedUrl()
  const registered = await registeredUrls()
  if (names.some((name) => registered[name] && registered[name] !== url)) {
    throw new Error("Já existe um webhook da Efí em outro endereço. Confira o vínculo no painel da Efí antes de alterá-lo.")
  }
  for (const name of names) {
    if (!registered[name]) await efiRequest(endpoint(name), "PUT", { webhookUrl: url }, { "x-skip-mtls-checking": "true" })
  }
  return efiWebhookStatus()
}
