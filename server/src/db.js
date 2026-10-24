import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { SEED_PRODUCTS, SEED_PROMOS } from './seed-data.js';

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(config.dataDir, 'tearush.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone         TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    avatar        TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    phone      TEXT NOT NULL DEFAULT '',
    subject    TEXT NOT NULL DEFAULT '',
    message    TEXT NOT NULL,
    is_read    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS addresses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    recipient   TEXT NOT NULL,
    phone       TEXT NOT NULL,
    line1       TEXT NOT NULL,
    barangay    TEXT NOT NULL DEFAULT '',
    city        TEXT NOT NULL,
    province    TEXT NOT NULL DEFAULT '',
    postal_code TEXT NOT NULL DEFAULT '',
    notes       TEXT NOT NULL DEFAULT '',
    is_default  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image       TEXT NOT NULL DEFAULT '',
    popular     INTEGER NOT NULL DEFAULT 0,
    rating      REAL,
    available   INTEGER NOT NULL DEFAULT 1,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS promos (
    code               TEXT PRIMARY KEY COLLATE NOCASE,
    title              TEXT NOT NULL,
    description        TEXT NOT NULL,
    kind               TEXT NOT NULL CHECK (kind IN ('percent', 'free_delivery', 'bogo')),
    percent            INTEGER,
    min_subtotal_cents INTEGER NOT NULL DEFAULT 0,
    product_id         TEXT,
    first_order_only   INTEGER NOT NULL DEFAULT 0,
    weekday            INTEGER,
    valid_until        TEXT,
    accent             TEXT NOT NULL DEFAULT 'brown',
    active             INTEGER NOT NULL DEFAULT 1,
    sort_order         INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS orders (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number          TEXT UNIQUE,
    user_id               INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status                TEXT NOT NULL,
    fulfillment           TEXT NOT NULL CHECK (fulfillment IN ('delivery', 'pickup')),
    payment_method        TEXT NOT NULL,
    payment_status        TEXT NOT NULL DEFAULT 'unpaid',
    subtotal_cents        INTEGER NOT NULL,
    delivery_fee_cents    INTEGER NOT NULL,
    discount_cents        INTEGER NOT NULL DEFAULT 0,
    total_cents           INTEGER NOT NULL,
    promo_code            TEXT,
    contact_name          TEXT NOT NULL,
    contact_phone         TEXT NOT NULL,
    contact_email         TEXT NOT NULL DEFAULT '',
    address_text          TEXT NOT NULL DEFAULT '',
    notes                 TEXT NOT NULL DEFAULT '',
    paymongo_checkout_id  TEXT,
    paymongo_checkout_url TEXT,
    paymongo_intent_id    TEXT,
    paymongo_payment_id   TEXT,
    paymongo_refund_id    TEXT,
    paid_via              TEXT,
    paid_at               TEXT,
    cancel_reason         TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_checkout ON orders(paymongo_checkout_id);

  CREATE TABLE IF NOT EXISTS order_items (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id       TEXT NOT NULL,
    name             TEXT NOT NULL,
    image            TEXT NOT NULL DEFAULT '',
    size             TEXT NOT NULL,
    sugar            TEXT NOT NULL,
    ice              TEXT NOT NULL,
    toppings_json    TEXT NOT NULL DEFAULT '[]',
    options_json     TEXT NOT NULL DEFAULT '{}',
    unit_price_cents INTEGER NOT NULL,
    quantity         INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status     TEXT NOT NULL,
    note       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS webhook_events (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    received_at TEXT NOT NULL
  );
`);

// Add columns introduced after the first release to existing databases.
function addColumn(table, column, definition) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
addColumn('users', 'avatar', `TEXT NOT NULL DEFAULT ''`);
// Accounts that existed before email verification count as verified; new sign-ups insert 0.
addColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 1');
addColumn('users', 'verify_code_hash', 'TEXT');
addColumn('users', 'verify_expires_at', 'TEXT');
addColumn('users', 'verify_sent_at', 'TEXT');
addColumn('users', 'verify_attempts', 'INTEGER NOT NULL DEFAULT 0');
addColumn('addresses', 'region', `TEXT NOT NULL DEFAULT ''`);
addColumn('addresses', 'latitude', 'REAL');
addColumn('addresses', 'longitude', 'REAL');

export const nowIso = () => new Date().toISOString();

/** Run `fn` inside a transaction; rolls back if it throws. */
export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function seedProducts() {
  const insert = db.prepare(`
    INSERT INTO products (id, name, category, price_cents, description, image, popular, rating, available, sort_order, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const now = nowIso();
  SEED_PRODUCTS.forEach((p, index) => {
    insert.run(
      p.id,
      p.name,
      p.category,
      Math.round(p.price * 100),
      p.description,
      `assets/products/${p.id}.jpg`,
      p.popular ? 1 : 0,
      p.rating ?? null,
      index,
      now
    );
  });
}

function seedPromos() {
  const insert = db.prepare(`
    INSERT INTO promos (code, title, description, kind, percent, min_subtotal_cents, product_id,
                        first_order_only, weekday, valid_until, accent, active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  SEED_PROMOS.forEach((p, index) => {
    insert.run(
      p.code,
      p.title,
      p.description,
      p.kind,
      p.percent ?? null,
      Math.round((p.minSubtotal ?? 0) * 100),
      p.productId ?? null,
      p.firstOrderOnly ? 1 : 0,
      p.weekday ?? null,
      p.validUntil ?? null,
      p.accent,
      index
    );
  });
}

export function seedIfEmpty() {
  if (db.prepare('SELECT COUNT(*) AS n FROM products').get().n === 0) {
    transaction(seedProducts);
    console.log(`[db] Seeded ${SEED_PRODUCTS.length} products`);
  }
  if (db.prepare('SELECT COUNT(*) AS n FROM promos').get().n === 0) {
    transaction(seedPromos);
    console.log(`[db] Seeded ${SEED_PROMOS.length} promos`);
  }
}
