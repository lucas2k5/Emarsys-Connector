-- Migration: Create orders table
-- Date: 2025-01-XX

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    "order" TEXT NOT NULL,
    item TEXT NOT NULL,
    email TEXT,
    quantity REAL,
    price REAL,
    timestamp TEXT,
    isSync BOOLEAN DEFAULT 0,
    order_status TEXT,
    s_channel_source TEXT,
    s_store_id TEXT,
    s_sales_channel TEXT,
    s_discount TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE("order", item, order_status)
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_orders_order ON orders("order");
CREATE INDEX IF NOT EXISTS idx_orders_item ON orders(item);
CREATE INDEX IF NOT EXISTS idx_orders_isSync ON orders(isSync);
CREATE INDEX IF NOT EXISTS idx_orders_timestamp ON orders(timestamp);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);

