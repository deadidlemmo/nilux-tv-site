CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  preference_id TEXT,
  payment_id TEXT,
  status TEXT NOT NULL,
  payment_status TEXT,
  payment_status_detail TEXT,
  plan_id TEXT NOT NULL,
  plan_type TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  customer_name TEXT NOT NULL,
  customer_whatsapp TEXT NOT NULL,
  customer_email TEXT,
  mercado_pago_payer_email TEXT,
  raw_payment TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  notified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_payment_id ON orders(payment_id);

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  topic TEXT,
  resource_id TEXT,
  payload TEXT,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_resource ON webhook_events(resource_id);
