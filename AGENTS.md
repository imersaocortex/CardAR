<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project: AR Business Studio

### Architecture
- Next.js 16.2.7 (Turbopack) app router
- Supabase for auth, DB, storage
- ASAAS for payment gateway
- Shadcn/ui + Tailwind for UI
- Zustand for auth state

### Subscription & Billing Flow

1. **Signup**: `handle_new_user` trigger creates org, subscription (trialing/active), usage_limits
2. **Trial**: Full plan limits for `trial_days` (configurable per plan — starter=0, pro=7, agency=7)
3. **Trial expired**: `createProject` blocks with error "Período de teste expirado. Assine um plano para continuar."
4. **Upgrade**: `/api/billing` POST → creates ASAAS customer (with CPF/CNPJ, phone, address from profile) → creates ASAAS subscription + checkout → returns `checkout_url`
5. **Payment**: User pays on ASAAS checkout → webhook confirms → subscription set to `active`, trial cleared
6. **Renewal**: ASAAS subscription auto-charges → webhook extends `current_period_end`
7. **Cancel**: `/api/billing` POST cancel → subscription → `canceled`, reverted to Starter

### Key Files
- `src/lib/asaas/index.ts` — ASAAS API client (createCustomer, updateCustomer, createSubscription, createCheckout, cancelSubscription)
- `src/app/api/billing/route.ts` — Billing API (GET subscription/payments/checkout, POST upgrade/cancel)
- `src/app/billing/page.tsx` — Billing UI with plans, trial/status banners, usage, payment history, checkout link
- `src/app/api/webhooks/asaas/route.ts` — Webhook handler (PAYMENT → extends period + sets active on RECEIVED/CONFIRMED, OVERDUE → past_due; SUBSCRIPTION → maps status)
- `src/lib/actions/projects.ts` — `createProject` checks sub status (past_due/canceled/trial_expired) + `check_project_limit` RPC
- `src/components/layout/app-shell.tsx` — Subscription status banner (trialing/past_due/canceled/none)

### DB Functions
- `check_project_limit(p_organization_id)` — returns `projects_used < projects_limit` from `usage_limits`
- `handle_new_user()` — trigger: creates profile, org, membership, subscription (with trial), usage_limits

### ASAAS Webhook Events
- `PAYMENT_RECEIVED` / `PAYMENT_CONFIRMED` → subscription `status=active`, extend `current_period_end` by 1 month
- `PAYMENT_OVERDUE` → subscription `status=past_due`
- `SUBSCRIPTION_ACTIVE/CANCELED/EXPIRED` → maps to subscription status

### Build
- `npm run build` — must pass before committing
- No tests yet (no test framework configured)
