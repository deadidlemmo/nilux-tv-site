# Página de primeira compra IPTV

Página estática de uma tela para venda de planos IPTV com seleção de plano, resumo do pedido e botões de pagamento.

## Como configurar os pagamentos

O projeto já está preparado para o fluxo semi-automático:

1. A página chama o Cloudflare Worker.
2. O Worker cria o checkout no Mercado Pago.
3. O Mercado Pago chama o webhook do Worker quando o pagamento muda.
4. O Worker salva o pedido no D1.
5. O Worker avisa BotBot ou Telegram.

No arquivo `config.js`, preencha a URL do Worker:

```js
paymentMode: "api",
checkoutApiUrl: "https://nilux-payments.seu-usuario.workers.dev/checkout",
```

Para usar links fixos em vez do Worker, troque `paymentMode` para `"links"` e preencha `paymentLinks`:

```js
mensal: {
  padrao: "https://seu-link-do-mercado-pago.com/mensal-padrao",
  adulto: "https://seu-link-do-mercado-pago.com/mensal-adulto",
},
```

Cada plano pode ter dois links: `padrao` e `adulto`.

Nunca coloque o Access Token do Mercado Pago no frontend. Ele deve ficar somente no Worker.

## Backend

A pasta `worker/` contém:

- `src/index.mjs`: Worker com checkout, webhook, listagem de pedidos e notificações.
- `schema.sql`: tabelas do Cloudflare D1.
- `wrangler.toml`: configuração do Worker.
- `.dev.vars.example`: exemplo de secrets locais.

Veja `worker/README.md` para publicar o Worker.

## Como publicar de graça

### Cloudflare Pages

1. Suba estes arquivos para um repositório no GitHub.
2. Acesse Cloudflare Pages e conecte o repositório.
3. Em configurações de build, use:
   - Framework preset: `None`
   - Build command: vazio
   - Output directory: `/`
4. Publique e depois conecte seu domínio em `Custom domains`.

### Netlify

1. Arraste a pasta do projeto para o painel do Netlify Drop, ou conecte pelo Git.
2. Como não há build, o diretório publicado é a própria raiz do projeto.

## Arquivos

- `index.html`: conteúdo da página.
- `styles.css`: visual e responsividade.
- `config.js`: WhatsApp, links de pagamento e modo de integração.
- `script.js`: seleção de plano e fluxo de checkout.
- `obrigado.html`, `pagamento-pendente.html`, `pagamento-falhou.html`: páginas de retorno do Mercado Pago.
- `worker/`: backend Cloudflare Worker para Mercado Pago, D1 e notificações.
- `img/nilux-tv-logo.png`: logo usado no topo e na área principal.
