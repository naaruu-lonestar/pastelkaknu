/**
 * Skema dan seed awal yang dipakai bootstrap runtime (src/lib/bootstrap.ts).
 *
 * Isinya sengaja sama dengan migrations/0001_init.sql dan seeds/0001_products.sql
 * yang dipakai `npm run db:push`. Kalau skema berubah, ubah kedua tempat.
 * Semua perintah idempoten (IF NOT EXISTS / ON CONFLICT DO NOTHING), jadi aman
 * dijalankan pada database yang sudah berisi data.
 */
export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS products (
     id          TEXT PRIMARY KEY,
     name        TEXT NOT NULL,
     price       INTEGER NOT NULL CHECK (price >= 0),
     description TEXT NOT NULL DEFAULT '',
     image_url   TEXT,
     is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
     sort_order  INTEGER NOT NULL DEFAULT 0,
     created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_products_active ON products (is_active, sort_order)`,
  `CREATE TABLE IF NOT EXISTS orders (
     id                TEXT PRIMARY KEY,
     order_number      TEXT NOT NULL UNIQUE,
     idempotency_key   TEXT UNIQUE,
     customer_name     TEXT NOT NULL,
     customer_phone    TEXT NOT NULL,
     purpose           TEXT NOT NULL,
     order_type        TEXT NOT NULL,
     delivery_date     TEXT NOT NULL,
     delivery_time     TEXT NOT NULL,
     delivery_location TEXT NOT NULL,
     notes             TEXT NOT NULL DEFAULT '',
     total_quantity    INTEGER NOT NULL CHECK (total_quantity > 0),
     total_price       INTEGER NOT NULL CHECK (total_price >= 0),
     status            TEXT NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED')),
     created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders (delivery_date)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders (customer_phone)`,
  `CREATE TABLE IF NOT EXISTS order_items (
     id                    TEXT PRIMARY KEY,
     order_id              TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
     product_id            TEXT NOT NULL,
     product_name_snapshot TEXT NOT NULL,
     unit_price_snapshot   INTEGER NOT NULL CHECK (unit_price_snapshot >= 0),
     quantity              INTEGER NOT NULL CHECK (quantity > 0),
     subtotal              INTEGER NOT NULL CHECK (subtotal >= 0)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id)`,
  `CREATE TABLE IF NOT EXISTS admin_users (
     id            TEXT PRIMARY KEY,
     name          TEXT NOT NULL,
     email         TEXT NOT NULL UNIQUE,
     password_hash TEXT NOT NULL,
     role          TEXT NOT NULL DEFAULT 'OWNER' CHECK (role IN ('OWNER', 'STAFF')),
     is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
     created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users (lower(email))`,
  `CREATE TABLE IF NOT EXISTS admin_sessions (
     id            TEXT PRIMARY KEY,
     admin_user_id TEXT NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
     token_hash    TEXT NOT NULL UNIQUE,
     user_agent    TEXT NOT NULL DEFAULT '',
     expires_at    TEXT NOT NULL,
     created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions (admin_user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions (expires_at)`,
  `CREATE TABLE IF NOT EXISTS order_status_history (
     id              TEXT PRIMARY KEY,
     order_id        TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
     previous_status TEXT,
     new_status      TEXT NOT NULL,
     changed_by      TEXT NOT NULL,
     note            TEXT NOT NULL DEFAULT '',
     created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history (order_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS production_settings (
     id             TEXT PRIMARY KEY,
     daily_capacity INTEGER NOT NULL DEFAULT 300 CHECK (daily_capacity > 0),
     updated_by     TEXT,
     updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
     limit_key    TEXT PRIMARY KEY,
     hit_count    INTEGER NOT NULL DEFAULT 0,
     window_start INTEGER NOT NULL
   )`,
];

export const SEED_STATEMENTS: readonly string[] = [
  `INSERT INTO products (id, name, price, description, image_url, is_active, sort_order)
   VALUES
     ('pastel-1000', 'Pastel Rp1.000', 1000, 'Pilihan ekonomis untuk camilan sehari-hari.', NULL, 1, 10),
     ('pastel-2000', 'Pastel Rp2.000', 2000, 'Pilihan lainnya untuk menemani berbagai acara.', NULL, 1, 20)
   ON CONFLICT (id) DO NOTHING`,
  `INSERT INTO production_settings (id, daily_capacity)
   VALUES ('default', 300)
   ON CONFLICT (id) DO NOTHING`,
];
