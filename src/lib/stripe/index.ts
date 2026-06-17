import Stripe from "stripe"

let currentSecretKey = process.env.STRIPE_SECRET_KEY
let currentWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET

let stripeInstance: Stripe | null = null

function getStripe(): Stripe {
  if (!stripeInstance && currentSecretKey) {
    stripeInstance = new Stripe(currentSecretKey)
  }
  return stripeInstance!
}

export function configureStripe(secretKey: string, webhookSecret?: string) {
  currentSecretKey = secretKey
  if (webhookSecret) currentWebhookSecret = webhookSecret
  stripeInstance = null
}

export async function createCustomer(email: string, name: string): Promise<Stripe.Customer> {
  const stripe = getStripe()
  const customer = await stripe.customers.create({
    email,
    name,
  })
  return customer
}

export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe()
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${successUrl}?checkout_success=true`,
    cancel_url: cancelUrl,
    subscription_data: {
      metadata: {},
    },
  })
  return session
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  const stripe = getStripe()
  await stripe.subscriptions.cancel(subscriptionId)
}

export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  const stripe = getStripe()
  return stripe.subscriptions.retrieve(subscriptionId)
}

export async function getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe()
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription", "line_items"],
  })
}

export function constructWebhookEvent(payload: string, signature: string): Stripe.Event {
  const stripe = getStripe()
  if (!currentWebhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET não configurada")
  }
  return stripe.webhooks.constructEvent(payload, signature, currentWebhookSecret)
}

export function getNextDueDate(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().split("T")[0]
}

export function getTodayDate(): string {
  return new Date().toISOString().split("T")[0]
}

export async function ensureStripeKey(admin: any) {
  if (process.env.STRIPE_SECRET_KEY) return

  const { data: settings } = await admin
    .from("system_settings")
    .select("stripe")
    .eq("id", 1)
    .maybeSingle()

  const config = settings?.stripe as Record<string, any> | undefined
  const env = config?.environment || "debug"
  const secretKey = config?.[`${env}_secret_key`] as string | undefined
  const webhookSecret = config?.[`${env}_webhook_secret`] as string | undefined

  if (secretKey) {
    process.env.STRIPE_SECRET_KEY = secretKey
    configureStripe(secretKey, webhookSecret)
  }
}

export async function loadWebhookSecret(admin: any) {
  if (process.env.STRIPE_WEBHOOK_SECRET) return

  const { data: settings } = await admin
    .from("system_settings")
    .select("stripe")
    .eq("id", 1)
    .maybeSingle()

  const config = settings?.stripe as Record<string, any> | undefined
  const env = config?.environment || "debug"
  const secret = config?.[`${env}_webhook_secret`] as string | undefined

  if (secret) {
    process.env.STRIPE_WEBHOOK_SECRET = secret
    currentWebhookSecret = secret
  }
}

export async function listInvoices(customerId: string): Promise<any[]> {
  const stripe = getStripe()
  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit: 10,
  })
  return invoices.data
}
