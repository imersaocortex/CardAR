# Plataforma de realidade aumentada

Aplicação Next.js 16, Supabase e experiências AR por imagem, superfície plana ou direção GPS. Rode `npm install`, configure as variáveis do Supabase e execute `npm run dev`. A validação local é `npm test`, `npx tsc --noEmit --incremental false` e `npm run build`.

## Implantação das novas funções

1. Faça backup do banco e aplique, em ordem, as migrações `020_studio_integrity.sql` até `024_affiliate_commissions.sql`. Execute depois `supabase/verify_020_024.sql`, que só lê dados, e confira se todos os itens retornam `ok = true`, se o histórico copiado tem o mesmo total e se não restam assinaturas antigas ativas. As tabelas ASAAS/Stripe são preservadas para auditoria; `023` copia o histórico para `billing_payments` sem cancelar cobranças externas. O Supabase configurado atualmente é de produção, então não teste pagamentos sandbox nele; use um projeto separado de homologação para isso.
2. Teste criação e edição de projetos, os três modos AR, cadastro por `/r/{codigo}`, painel administrativo e cobrança em sandbox. Superfícies exigem dispositivo/navegador compatível com WebXR hit-test; GPS exige câmera, localização, bússola e HTTPS. O modo GPS posiciona o objeto na direção e distância aproximadas das coordenadas: ele diminui ao se afastar e cresce ao se aproximar. A menos de 3 m, a posição visual fica limitada a 3 m para evitar que a cena entre na câmera; nessa região, a direção do GPS pode ser imprecisa. O raio configurado indica proximidade e não bloqueia a cena.
3. Na implantação atual, deixe `BILLING_V2_ENABLED` ausente/desligado: a plataforma funcionará sem novas cobranças. Quando houver ambiente separado de homologação, configure `APP_URL`, `BILLING_V2_ENABLED=true`, `CRON_SECRET`, as credenciais sandbox e os webhooks nesse ambiente. `BILLING_LIVE_ENABLED` deve permanecer desligado até a conciliação das assinaturas. Nunca publique chaves/certificados no cliente ou no repositório.
4. **Não publique esta versão sobre assinaturas antigas ainda ativas.** Faça inventário das assinaturas ASAAS/Stripe. Para cada organização, confirme fim do período pago, cancele a recorrência no provedor antigo, confira que não há cobrança pendente e só então remova o identificador antigo da assinatura no banco com registro de auditoria. Enquanto houver `asaas_subscription_id` ou `stripe_subscription_id`, o novo checkout é bloqueado. Os endpoints antigos nesta versão retornam 410; publique somente depois de migrar todos os contratos dependentes desses webhooks ou prepare uma implantação intermediária que os preserve até concluir a migração.
5. Depois dos testes reais de aprovação, liquidação, renovação, estorno/cancelamento e entrega dos webhooks, use credenciais de produção, `APP_URL` HTTPS e `BILLING_LIVE_ENABLED=true`. Verifique diariamente os resultados de `/api/billing/renewals`. O `vercel.json` executa a rotina às 08:00 UTC; ela processa até 30 acordos por execução e prioriza os menos recentemente conciliados. Aumente a frequência ou capacidade antes de o volume causar atrasos em renovações.

Para publicar a opção **Sempre voltado para a câmera**, aplique manualmente `supabase/migrations/025_face_camera.sql` após a migração 024 e execute `supabase/verify_025.sql` (somente leitura). Os dois resultados devem ser `ok = true` antes de implantar o player e o editor. A migração ativa a orientação para imagens e vídeos já presentes em projetos GPS ou de superfície; a opção pode ser desligada em cada objeto. Vídeos começam silenciosos e o visitante toca em **Ativar som** para ouvir o áudio, conforme a política dos navegadores móveis.

### Experiências com vários projetos e superfícies

Depois da migração 025, aplique manualmente `supabase/migrations/026_multi_experiences.sql` no SQL Editor do Supabase e execute `supabase/verify_026.sql` (somente leitura). Confirme `ok = true` nas duas primeiras consultas e `invalid_collections = 0`. Só então publique o código correspondente. A migração cria coleções com uma URL, adiciona a permissão `multi_project_enabled` aos planos e deixa todos os planos existentes com o recurso **desligado**. O superadministrador deve habilitá-lo explicitamente nos planos desejados; a opção de retirar a marca d'água continua independente. Coleções aceitam de 2 a 10 projetos de marcador ou de 2 a 20 projetos GPS, sempre publicados, da mesma organização e tecnologia. Quando um projeto é despublicado ou excluído, ele sai automaticamente da coleção; se restar menos de dois, a coleção e sua URL são removidas.

No modo de superfície, WebXR com hit-test detecta chão ou mesa e usa âncoras quando o aparelho as oferece. Navegadores sem WebXR ou sem hit-test recebem um **modo manual** com câmera e orientação: o visitante pode posicionar a cena, mas esse modo não detecta planos nem rastreia o deslocamento físico do celular. Para validar fixação real no ambiente, teste em um dispositivo compatível com WebXR AR; também confira um aparelho sem suporte para verificar a alternativa manual.

### Variáveis de faturamento

| Variável | Uso |
| --- | --- |
| `APP_URL` | Origem pública HTTPS para retorno do PayPal |
| `BILLING_V2_ENABLED` | Libera as opções novas após migrações |
| `BILLING_LIVE_ENABLED` | Permite operações nos provedores de produção |
| `PAYPAL_ENVIRONMENT`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` | API e verificação de webhooks PayPal; `production` seleciona API real |
| `EFI_ENVIRONMENT`, `EFI_CLIENT_ID`, `EFI_CLIENT_SECRET`, `EFI_CERTIFICATE_BASE64`, `EFI_CERTIFICATE_PASSPHRASE`, `EFI_PIX_KEY`, `EFI_WEBHOOK_TOKEN` | API Pix mTLS e rota privada do webhook Efí; `production` seleciona API real |
| `EFI_PIX_MODE` | `automatic` (padrão) ou `manual`; no modo manual o cliente paga cada período via Pix |
| `EFI_ACCOUNT_NUMBER`, `EFI_ACCOUNT_BRANCH` | Conta recebedora para cobrança recorrente no Pix Automático |
| `CRON_SECRET` | Autentica a rotina de reconciliação |

Webhooks: PayPal `POST /api/webhooks/paypal`; Efí `POST /api/webhooks/efi/{EFI_WEBHOOK_TOKEN}` (a rota `/pix` também é aceita). Cadastre os eventos de assinatura e pagamento PayPal e os eventos Pix/cobrança recorrente da Efí nos respectivos painéis. O processamento consulta novamente o provedor antes de conceder acesso. Confirme o formato dos eventos no sandbox de cada conta.

O sistema de indicações registra quem convidou novos usuários. A migração `024` configura comissão de 10% sobre o primeiro pagamento e cada renovação confirmada, espera de 30 dias, solicitação de saque por Pix e revisão manual no painel administrativo. O administrador precisa conferir a transferência Pix fora do sistema antes de registrar o comprovante e marcar o saque como pago.

Devoluções integrais detectadas na conciliação invalidam comissões ainda não pagas e recusam saques pendentes. Caso o repasse ao afiliado já tenha sido feito, o painel administrativo exibe uma pendência de recuperação manual. Concilie estornos parciais e devoluções fora da janela de consulta diretamente com os extratos dos provedores antes de fechar o financeiro.
