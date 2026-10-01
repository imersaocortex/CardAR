<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Projeto: CortexAR

### Regras críticas
- O watermark da experiência AR usa sempre `siteName` retornado pela API de identidade visual; nunca fixe "CortexAR" no player.
- Antes de armazenar ou exibir cidade/país dos headers de geolocalização da Vercel, aplique `safeDecode()`.
- O banco Supabase configurado no ambiente local é de **produção**. Não execute testes que criem dados/cobranças ali. Migrações são aplicadas manualmente pelo responsável pelo projeto.

### Arquitetura atual
- Next.js 16.2.7 App Router com Turbopack, React 19, Tailwind e Shadcn/ui.
- A Vercel usa Node 24. O `installCommand` evita compilar o `canvas` nativo que acompanha o MindAR, mas executa `patch-package` explicitamente; os arquivos `dist` do MindAR usados em runtime são browser-only.
- Supabase para autenticação, banco e armazenamento; Zustand para estado de autenticação/editor.
- Modos AR: marcador MindAR, superfície plana via WebXR hit-test e GPS/bússola com objeto na direção das coordenadas.
- Faturamento novo: PayPal Subscriptions e Pix Automático Efí. ASAAS e Stripe estão aposentados no código; suas tabelas antigas ficam para auditoria.
- Programa de afiliados: código de indicação, comissão de 10% no primeiro pagamento e nas renovações, liberação após 30 dias, saque solicitado pelo afiliado e transferência Pix manual pela administração.

### Implantação e pagamentos
- Leia `README.md` antes de publicar. As migrações `supabase/migrations/020_*.sql` até `024_*.sql` devem ser executadas **em ordem**; `supabase/verify_020_024.sql` faz a conferência somente de leitura.
- `BILLING_V2_ENABLED` ausente/desligado significa que novas assinaturas estão indisponíveis. É o estado previsto enquanto as contas PayPal/Efí não estiverem configuradas.
- Para cobranças reais: credenciais, certificado mTLS Efí, webhooks, `APP_URL` HTTPS, `CRON_SECRET`, `BILLING_V2_ENABLED=true` e `BILLING_LIVE_ENABLED=true` são necessários. Valide primeiro em Supabase separado de homologação e sandbox dos provedores.
- Não publique a versão que aposenta webhooks antigos sobre assinaturas ASAAS/Stripe ainda ativas. Confirme pelo SQL de verificação.
- Nunca credite acesso ou comissão com base apenas no corpo de um webhook; reconcilie no provedor e use os RPCs idempotentes de liquidação.
- Nunca exclua o histórico de `billing_payments` ou marque um saque como pago antes de confirmar a transferência e registrar seu comprovante.

### Arquivos principais
- `src/app/api/billing/route.ts`, `src/lib/payments/` e `src/app/api/webhooks/{paypal,efi}/`: contratação, cobrança, conciliação e cancelamento.
- `src/app/api/billing/renewals/route.ts` e `vercel.json`: reconciliação agendada.
- `src/app/experience/[slug]/page.tsx`, `src/components/ar/`: seleção e execução dos modos AR.
- `src/app/api/projects/[id]/tracking/route.ts`: configuração de marcador/superfície/GPS.
- `src/app/api/affiliates/`, `src/app/api/admin/affiliate-payouts/`: indicações, comissões e saques.
- `src/store/index.ts` e `supabase/migrations/020_studio_integrity.sql`: persistência atômica do editor.

### Validação
- `npm test`, `npx tsc --noEmit --incremental false` e `npm run build` devem passar antes de publicar.
- O repositório ainda possui avisos/erros de lint legados fora dos novos fluxos; não os oculte com uma desativação global das regras.
- Teste AR em dispositivos reais. WebXR hit-test não é disponibilizado por todos os navegadores; o player informa incompatibilidade quando necessário.
