<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project: AR Business Studio

### Critical Rules (never forget)
- **Watermark**: AR experience watermark must always use `siteName` from API (system branding config), never hardcode "AR Business Studio"
- **City/Country encoding**: Always `safeDecode()` URL-encoded city/country values from Vercel geo headers before storing/displaying

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

### Admin Subscription Control
- `admin/customers-tab.tsx` — enhanced with detail panel on row click showing:
  - Subscription status with manual override buttons (Ativo/Trial/Vencido/Cancelado)
  - Usage, analytics summary, projects list, payment history
- `PUT /api/admin/subscriptions/[id]` — changes subscription status, logs to `subscription_status_history`, syncs usage_limits
- `GET /api/admin/orgs/[orgId]` — full org detail with projects, analytics, payments
- `subscription_status_history` table — audit trail of all status changes with admin user

### Client Dashboard (Reports & Plan Details)
- `dashboard/page.tsx` — two tabs: Visão Geral and Relatórios
- Plan details widget showing plan name, projects used/limit with progress bar, views, status
- Reports tab with per-project analytics selector
- Analytics summary: views, clicks, unique sessions, countries
- Location breakdown by country and city (horizontal bars)
- Event type breakdown, button click breakdown
- Views timeline (last 30 days bar chart)
- PDF export via `window.print()` (browser native)

### Interaction Tracking (Analytics)
- `project_analytics` table: project_id, session_id, event_type (view/click/button_click), metadata, ip_address, country, city, region, user_agent
- `POST /api/analytics/log` — logs interaction from public experience (no auth required, uses IP geo via Vercel headers + ip-api.com fallback)
- `GET /api/analytics/[projectId]` — returns aggregated analytics (summary, countries, cities, timeline, event/button breakdown)
- `ArPlayer` now accepts `onInteraction` callback prop
- Experience page sends `view` on load, `click` (marker_detected) on detection, `button_click` on button action
- Session-based tracking with generated session IDs

### Migration Required
Run `006_project_analytics_admin.sql` in Supabase SQL Editor for: `project_analytics`, `subscription_status_history` tables + `metadata` column on subscriptions.

### Build
- `npm run build` — must pass before committing
- No tests yet (no test framework configured)
