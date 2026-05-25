const PLANS = {
  mensal: { label: "1 mês", amount: 25 },
  trimestral: { label: "3 meses", amount: 70 },
  semestral: { label: "6 meses", amount: 130 },
  anual: { label: "12 meses", amount: 220 },
};

const PLAN_TYPES = {
  padrao: "Padrão",
  adulto: "Adulto incluso",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "nilux-payments" }, 200, request, env);
      }

      if (request.method === "POST" && url.pathname === "/checkout") {
        return createCheckout(request, env);
      }

      if (url.pathname === "/webhooks/mercadopago") {
        return handleMercadoPagoWebhook(request, env);
      }

      if (request.method === "GET" && url.pathname === "/orders") {
        return listOrders(request, env);
      }

      return json({ error: "Rota não encontrada." }, 404, request, env);
    } catch (error) {
      console.error(error);
      return json({ error: "Erro interno no servidor." }, 500, request, env);
    }
  },
};

async function createCheckout(request, env) {
  requireEnv(env, ["DB", "MP_ACCESS_TOKEN"]);

  const payload = await request.json().catch(() => null);
  const planId = sanitize(payload?.planId);
  const planType = sanitize(payload?.planType);
  const customer = normalizeCustomer(payload?.customer);
  const plan = PLANS[planId];
  const typeLabel = PLAN_TYPES[planType];

  if (!plan || !typeLabel) {
    return json({ error: "Plano inválido." }, 400, request, env);
  }

  if (!customer.name || !customer.whatsapp) {
    return json({ error: "Informe nome e WhatsApp." }, 400, request, env);
  }

  const now = new Date().toISOString();
  const orderId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO orders (
      order_id, status, plan_id, plan_type, amount, currency,
      customer_name, customer_whatsapp, customer_email, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      orderId,
      "checkout_created",
      planId,
      planType,
      plan.amount,
      "BRL",
      customer.name,
      customer.whatsapp,
      customer.email,
      now,
      now
    )
    .run();

  const workerUrl = env.WORKER_PUBLIC_URL || new URL(request.url).origin;
  const siteUrl = env.PUBLIC_SITE_URL || request.headers.get("Origin") || workerUrl;
  const preferencePayload = {
    external_reference: orderId,
    notification_url: `${workerUrl}/webhooks/mercadopago`,
    items: [
      {
        id: `${planId}-${planType}`,
        title: `NILUX TV - ${plan.label} - ${typeLabel}`,
        quantity: 1,
        currency_id: "BRL",
        unit_price: plan.amount,
      },
    ],
    payer: buildPayer(customer),
    back_urls: {
      success: `${siteUrl}/obrigado.html?pedido=${orderId}`,
      pending: `${siteUrl}/pagamento-pendente.html?pedido=${orderId}`,
      failure: `${siteUrl}/pagamento-falhou.html?pedido=${orderId}`,
    },
    auto_return: "approved",
    metadata: {
      order_id: orderId,
      plan_id: planId,
      plan_type: planType,
      customer_whatsapp: customer.whatsapp,
    },
  };

  const preferenceResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(preferencePayload),
  });

  const preferenceText = await preferenceResponse.text();
  const preference = parseJson(preferenceText);

  if (!preferenceResponse.ok) {
    await env.DB.prepare(
      "UPDATE orders SET status = ?, error_message = ?, updated_at = ? WHERE order_id = ?"
    )
      .bind("preference_failed", preferenceText.slice(0, 1000), new Date().toISOString(), orderId)
      .run();

    return json({ error: "Mercado Pago não criou o checkout." }, 502, request, env);
  }

  await env.DB.prepare(
    "UPDATE orders SET preference_id = ?, status = ?, updated_at = ? WHERE order_id = ?"
  )
    .bind(preference.id || "", "waiting_payment", new Date().toISOString(), orderId)
    .run();

  return json(
    {
      orderId,
      preferenceId: preference.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
    },
    200,
    request,
    env
  );
}

async function handleMercadoPagoWebhook(request, env) {
  requireEnv(env, ["DB", "MP_ACCESS_TOKEN"]);

  const url = new URL(request.url);
  const rawBody = request.method === "POST" ? await request.text() : "";
  const body = parseJson(rawBody) || {};
  const paymentId = getPaymentId(url, body);
  const topic = url.searchParams.get("topic") || url.searchParams.get("type") || body.topic || body.type;

  if (env.MP_WEBHOOK_SECRET) {
    const isValidSignature = await verifyMercadoPagoSignature(request, url, env.MP_WEBHOOK_SECRET);
    if (!isValidSignature) {
      return json({ error: "Assinatura inválida." }, 401, request, env);
    }
  }

  if (!paymentId || (topic && topic !== "payment")) {
    return json({ ok: true, ignored: true }, 200, request, env);
  }

  await env.DB.prepare(
    "INSERT INTO webhook_events (event_id, provider, topic, resource_id, payload, received_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(crypto.randomUUID(), "mercadopago", topic || "payment", paymentId, rawBody, new Date().toISOString())
    .run();

  const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
    },
  });

  if (!paymentResponse.ok) {
    return json({ error: "Não foi possível consultar o pagamento." }, 502, request, env);
  }

  const payment = await paymentResponse.json();
  const orderId = payment.external_reference || payment.metadata?.order_id;

  if (!orderId) {
    return json({ ok: true, ignored: true, reason: "Sem external_reference." }, 200, request, env);
  }

  const order = await env.DB.prepare("SELECT * FROM orders WHERE order_id = ?").bind(orderId).first();

  if (!order) {
    return json({ ok: true, ignored: true, reason: "Pedido não encontrado." }, 200, request, env);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE orders SET
      payment_id = ?,
      status = ?,
      payment_status = ?,
      payment_status_detail = ?,
      mercado_pago_payer_email = ?,
      raw_payment = ?,
      updated_at = ?
    WHERE order_id = ?`
  )
    .bind(
      String(payment.id || paymentId),
      payment.status || "unknown",
      payment.status || "",
      payment.status_detail || "",
      payment.payer?.email || "",
      JSON.stringify(payment).slice(0, 20000),
      now,
      orderId
    )
    .run();

  if (payment.status === "approved" && !order.notified_at) {
    const sentCount = await notifyApprovedPayment(env, { ...order, payment_id: payment.id });

    if (sentCount > 0) {
      await env.DB.prepare("UPDATE orders SET notified_at = ? WHERE order_id = ?")
        .bind(new Date().toISOString(), orderId)
        .run();
    }
  }

  return json({ ok: true }, 200, request, env);
}

async function listOrders(request, env) {
  requireEnv(env, ["DB", "ADMIN_SECRET"]);

  const url = new URL(request.url);
  if (url.searchParams.get("key") !== env.ADMIN_SECRET) {
    return json({ error: "Não autorizado." }, 401, request, env);
  }

  const result = await env.DB.prepare(
    `SELECT
      order_id, status, plan_id, plan_type, amount, currency,
      customer_name, customer_whatsapp, customer_email, payment_id,
      payment_status, payment_status_detail, created_at, updated_at, notified_at
    FROM orders
    ORDER BY created_at DESC
    LIMIT 100`
  ).all();

  return json({ orders: result.results || [] }, 200, request, env);
}

async function notifyApprovedPayment(env, order) {
  const message = [
    "✅ Pagamento aprovado",
    `Pedido: ${order.order_id}`,
    `Plano: ${PLANS[order.plan_id]?.label || order.plan_id}`,
    `Tipo: ${PLAN_TYPES[order.plan_type] || order.plan_type}`,
    `Valor: R$ ${Number(order.amount).toFixed(2).replace(".", ",")}`,
    `Cliente: ${order.customer_name}`,
    `WhatsApp: ${order.customer_whatsapp}`,
    order.customer_email ? `E-mail: ${order.customer_email}` : "",
    "",
    "Ação: criar o acesso manualmente no painel IPTV.",
  ]
    .filter(Boolean)
    .join("\n");

  let sentCount = 0;

  if (env.BOTBOT_APP_KEY && env.BOTBOT_AUTH_KEY && env.BOTBOT_NOTIFY_TO) {
    const baseUrl = env.BOTBOT_API_BASE_URL || "https://botbot.chat";
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v2/sendText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        appKey: env.BOTBOT_APP_KEY,
        authKey: env.BOTBOT_AUTH_KEY,
      },
      body: JSON.stringify({
        to: env.BOTBOT_NOTIFY_TO,
        typingDelay: 1,
        message,
        contact: {
          name: order.customer_name,
          email: order.customer_email || undefined,
          note: `Pedido ${order.order_id}`,
          amount: Number(order.amount),
          currency: "BRL",
          plan: `${PLANS[order.plan_id]?.label || order.plan_id} - ${PLAN_TYPES[order.plan_type] || order.plan_type}`,
        },
      }),
    });
    if (response.ok) sentCount += 1;
  }

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: message,
      }),
    });
    if (response.ok) sentCount += 1;
  }

  return sentCount;
}

async function verifyMercadoPagoSignature(request, url, secret) {
  const signatureHeader = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const dataId = url.searchParams.get("data.id") || url.searchParams.get("id") || "";
  const signatureParts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key?.trim(), value?.trim()];
    })
  );

  if (!signatureParts.ts || !signatureParts.v1 || !requestId || !dataId) {
    return false;
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${signatureParts.ts};`;
  const signature = await hmacSha256Hex(secret, manifest);

  return timingSafeEqual(signature, signatureParts.v1);
}

async function hmacSha256Hex(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

function getPaymentId(url, body) {
  return (
    url.searchParams.get("data.id") ||
    url.searchParams.get("id") ||
    body?.data?.id ||
    body?.id ||
    ""
  ).toString();
}

function buildPayer(customer) {
  const payer = { name: customer.name };

  if (customer.email) {
    payer.email = customer.email;
  }

  return payer;
}

function normalizeCustomer(customer = {}) {
  return {
    name: sanitize(customer.name, 120),
    whatsapp: sanitize(customer.whatsapp, 40),
    email: sanitize(customer.email, 160),
  };
}

function sanitize(value, maxLength = 80) {
  return String(value || "").trim().slice(0, maxLength);
}

function parseJson(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function requireEnv(env, keys) {
  const missing = keys.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(`Variáveis ausentes: ${missing.join(", ")}`);
  }
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(request, env),
    },
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = env.ALLOWED_ORIGIN || "*";
  const accessControlOrigin = allowedOrigin === "*" ? "*" : origin === allowedOrigin ? origin : allowedOrigin;

  return {
    "Access-Control-Allow-Origin": accessControlOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
