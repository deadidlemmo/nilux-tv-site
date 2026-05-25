# Passo a passo: Mercado Pago + Cloudflare grátis

Este projeto usa:

- Cloudflare Pages para hospedar a página.
- Cloudflare Worker para criar checkout e receber webhook.
- Cloudflare D1 para salvar pedidos.
- BotBot ou Telegram para avisar quando um pagamento for aprovado.

## Resumo das URLs

Depois de publicar, você terá:

```text
Site:
https://seu-site.pages.dev

Worker:
https://nilux-payments.seu-usuario.workers.dev

Checkout API:
https://nilux-payments.seu-usuario.workers.dev/checkout

Webhook Mercado Pago:
https://nilux-payments.seu-usuario.workers.dev/webhooks/mercadopago
```

## Ordem correta

1. Publicar a página no Cloudflare Pages.
2. Criar o banco D1.
3. Colocar o `database_id` em `worker/wrangler.toml`.
4. Criar as tabelas com `worker/schema.sql`.
5. Configurar secrets do Worker.
6. Publicar o Worker.
7. Colocar a URL `/checkout` em `config.js`.
8. Configurar o webhook no Mercado Pago.

## Comandos principais

No PowerShell:

```powershell
cd "C:\Users\Neto\Desktop\Projetos\Em uso\iptv\worker"
npx wrangler login
npx wrangler d1 create nilux_payments
```

Depois de copiar o `database_id` para `worker/wrangler.toml`:

```powershell
npx wrangler d1 execute nilux_payments --remote --file=./schema.sql
```

Secrets:

```powershell
npx wrangler secret put MP_ACCESS_TOKEN
npx wrangler secret put ADMIN_SECRET
npx wrangler secret put BOTBOT_APP_KEY
npx wrangler secret put BOTBOT_AUTH_KEY
npx wrangler secret put BOTBOT_NOTIFY_TO
```

Quando o Mercado Pago mostrar a chave de assinatura do webhook, rode também:

```powershell
npx wrangler secret put MP_WEBHOOK_SECRET
```

Deploy:

```powershell
npx wrangler deploy
```

## Onde pegar cada segredo

`MP_ACCESS_TOKEN`: Mercado Pago Developers, em credenciais de produção.

`MP_WEBHOOK_SECRET`: Mercado Pago Developers, na configuração do webhook/notificações. É recomendado, mas opcional neste Worker para não bloquear o primeiro deploy.

`ADMIN_SECRET`: invente uma senha forte, por exemplo uma frase longa sem espaços.

`BOTBOT_APP_KEY`: chave `appKey` do BotBot.

`BOTBOT_AUTH_KEY`: chave `authKey` do BotBot.

`BOTBOT_NOTIFY_TO`: número/chat que vai receber o aviso. Para WhatsApp, use país + DDD + número, por exemplo `5511999999999`.

## Testes rápidos

Health:

```text
https://nilux-payments.seu-usuario.workers.dev/health
```

Pedidos:

```text
https://nilux-payments.seu-usuario.workers.dev/orders?key=SUA_ADMIN_SECRET
```
