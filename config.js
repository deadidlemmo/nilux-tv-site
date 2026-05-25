window.NILUX_CONFIG = {
  whatsappUrl: "https://wa.me/5500000000000",

  // Use "api" para o Cloudflare Worker criar o checkout automaticamente.
  // Se quiser voltar para links fixos, troque para "links".
  paymentMode: "api",

  // Modo "links": cole aqui os links de pagamento criados no Mercado Pago.
  paymentLinks: {
    mensal: {
      padrao: "",
      adulto: "",
    },
    trimestral: {
      padrao: "",
      adulto: "",
    },
    semestral: {
      padrao: "",
      adulto: "",
    },
    anual: {
      padrao: "",
      adulto: "",
    },
  },

  // Modo "api": URL publica do endpoint que cria a preferencia no Mercado Pago.
  // Exemplo: "https://nilux-payments.seu-usuario.workers.dev/checkout"
  checkoutApiUrl: "https://nilux-payments.niluxtv.workers.dev/checkout",
};
