# Worker de pagamentos NILUX TV

Este Worker cria o checkout no Mercado Pago, recebe webhooks de pagamento, salva pedidos no Cloudflare D1 e envia aviso para BotBot ou Telegram.

## 1. Entrar na pasta do Worker

No PowerShell:

```powershell
cd "C:\Users\Neto\Desktop\Projetos\Em uso\iptv\worker"
```

Faça login na Cloudflare:

```powershell
npx wrangler login
```

## 2. Criar o banco D1

```powershell
npx wrangler d1 create nilux_payments
```

O comando vai mostrar um bloco parecido com:

```toml
[[d1_databases]]
binding = "DB"
database_name = "nilux_payments"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copie apenas o `database_id` e substitua em `wrangler.toml`:

```toml
database_id = "SUBSTITUA_PELO_DATABASE_ID"
```

Depois crie as tabelas:

```powershell
npx wrangler d1 execute nilux_payments --remote --file=./schema.sql
```

## 3. Configurar URLs públicas

Edite `wrangler.toml`:

```toml
[vars]
PUBLIC_SITE_URL = "https://seu-site.pages.dev"
WORKER_PUBLIC_URL = "https://nilux-payments.seu-usuario.workers.dev"
ALLOWED_ORIGIN = "https://seu-site.pages.dev"
```

Use a URL real do seu site na Cloudflare Pages e a URL real do Worker depois do deploy.

## 4. Configurar secrets

Rode um comando por vez. O terminal vai pedir o valor secreto.

```powershell
npx wrangler secret put MP_ACCESS_TOKEN
npx wrangler secret put ADMIN_SECRET
```

Recomendado quando o Mercado Pago mostrar a chave de assinatura do webhook:

```powershell
npx wrangler secret put MP_WEBHOOK_SECRET
```

Para BotBot:

```powershell
npx wrangler secret put BOTBOT_APP_KEY
npx wrangler secret put BOTBOT_AUTH_KEY
npx wrangler secret put BOTBOT_NOTIFY_TO
```

`BOTBOT_NOTIFY_TO` é o número/chat que vai receber o aviso administrativo. Para WhatsApp, use país + DDD + número, por exemplo `5511999999999`.

Ou, se preferir Telegram:

```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

`ADMIN_SECRET` é uma senha inventada por você, usada para consultar pedidos em `/orders`.

## 5. Publicar o Worker

```powershell
npx wrangler deploy
```

Anote a URL retornada, por exemplo:

```text
https://nilux-payments.seu-usuario.workers.dev
```

## 6. Configurar a página

Na raiz do projeto, edite `config.js`:

```js
paymentMode: "api",
checkoutApiUrl: "https://nilux-payments.seu-usuario.workers.dev/checkout",
```

## 7. Configurar o webhook no Mercado Pago

No painel do Mercado Pago, configure a URL:

```text
https://nilux-payments.seu-usuario.workers.dev/webhooks/mercadopago
```

Cadastre eventos de pagamento. Se o painel mostrar uma chave/segredo de assinatura do webhook, use esse valor em `MP_WEBHOOK_SECRET`. O Worker funciona sem esse secret, mas validar assinatura é mais seguro em produção.

## 8. Consultar pedidos

Depois de publicado:

```text
https://nilux-payments.seu-usuario.workers.dev/orders?key=SUA_ADMIN_SECRET
```

## Endpoints

- `POST /checkout`: cria a preferência no Mercado Pago.
- `POST /webhooks/mercadopago`: recebe notificações do Mercado Pago.
- `GET /orders?key=ADMIN_SECRET`: lista os últimos pedidos.
- `GET /health`: verificação simples.

O Access Token fica apenas no Worker. Nunca coloque `MP_ACCESS_TOKEN` em `index.html`, `config.js` ou `script.js`.
