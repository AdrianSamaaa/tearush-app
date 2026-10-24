import { Router } from 'express';
import { config, paymentsEnabled } from '../config.js';
import { db, nowIso, seedProducts, transaction } from '../db.js';
import { optionalAuth, requireAuth, requireAdmin } from '../auth.js';
import { badRequest, conflict, notFound, optionalString, requireString } from '../errors.js';
import { activePromos, CUSTOM_DRINK, DELIVERY_FEE_CENTS, ICE_LEVELS, SIZE_SURCHARGE_CENTS, SUGAR_LEVELS, TOPPINGS } from '../pricing.js';
import { methodLabel } from '../paymongo.js';

export const catalogRouter = Router();

export const CATEGORIES = ['Signature', 'Milk Tea Classics', 'Fruit Tea', 'Cheese Foam'];

function toProductJson(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price_cents / 100,
    description: row.description,
    image: row.image,
    popular: Boolean(row.popular),
    rating: row.rating ?? undefined,
    available: Boolean(row.available),
  };
}

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function readProduct(body) {
  const price = Number(body.price);
  if (!Number.isFinite(price) || price <= 0 || price > 10000) throw badRequest('Price must be between ₱1 and ₱10,000.');
  let rating = null;
  if (body.rating !== undefined && body.rating !== null && body.rating !== '') {
    rating = Number(body.rating);
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) throw badRequest('Rating must be between 0 and 5.');
  }
  const category = body.category;
  if (!CATEGORIES.includes(category)) throw badRequest(`Category must be one of: ${CATEGORIES.join(', ')}.`);
  return {
    name: requireString(body.name, 'Product name', { max: 80 }),
    category,
    price_cents: Math.round(price * 100),
    description: optionalString(body.description, 'Description', 500),
    image: optionalString(body.image, 'Image', 1000),
    popular: body.popular ? 1 : 0,
    rating,
    available: body.available === false ? 0 : 1,
  };
}

/** App configuration the client needs at start-up (which payment methods are live, fees, options). */
catalogRouter.get('/config', (_req, res) => {
  res.json({
    paymentsEnabled: paymentsEnabled(),
    paymentMethods: paymentsEnabled()
      ? config.paymongo.methods.map((m) => ({ value: m, label: methodLabel(m) }))
      : [],
    deliveryFee: DELIVERY_FEE_CENTS / 100,
    currency: 'PHP',
    categories: CATEGORIES,
    sizes: Object.entries(SIZE_SURCHARGE_CENTS).map(([name, cents]) => ({ name, surcharge: cents / 100 })),
    sugarLevels: SUGAR_LEVELS,
    iceLevels: ICE_LEVELS,
    toppings: Object.entries(TOPPINGS).map(([id, t]) => ({ id, name: t.name, price: t.cents / 100 })),
    customDrink: {
      basePrice: CUSTOM_DRINK.baseCents / 100,
      teaBases: CUSTOM_DRINK.teaBases,
      milks: CUSTOM_DRINK.milks,
    },
  });
});

catalogRouter.get('/promos', (_req, res) => {
  res.json({ promos: activePromos() });
});

catalogRouter.get('/products', optionalAuth, (req, res) => {
  const includeHidden = req.user?.role === 'admin' && req.query.all === '1';
  const rows = db
    .prepare(`SELECT * FROM products ${includeHidden ? '' : 'WHERE available = 1'} ORDER BY sort_order, name`)
    .all();
  res.json({ products: rows.map(toProductJson) });
});

catalogRouter.get('/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) throw notFound('Product not found.');
  res.json({ product: toProductJson(row) });
});

catalogRouter.post('/products', requireAuth, requireAdmin, (req, res) => {
  const data = readProduct(req.body);
  let id = slugify(typeof req.body.id === 'string' && req.body.id.trim() ? req.body.id : data.name) || `product-${Date.now()}`;
  if (id === CUSTOM_DRINK.id) id = `${id}-${Date.now()}`;
  if (db.prepare('SELECT 1 FROM products WHERE id = ?').get(id)) {
    if (req.body.id) throw conflict('A product with this id already exists.');
    id = `${id}-${Date.now()}`;
  }
  const sortOrder = (db.prepare('SELECT MAX(sort_order) AS m FROM products').get().m ?? 0) + 1;
  db.prepare(
    `INSERT INTO products (id, name, category, price_cents, description, image, popular, rating, available, sort_order, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.name, data.category, data.price_cents, data.description, data.image || `assets/products/${id}.jpg`,
    data.popular, data.rating, data.available, sortOrder, nowIso());
  res.status(201).json({ product: toProductJson(db.prepare('SELECT * FROM products WHERE id = ?').get(id)) });
});

catalogRouter.put('/products/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) throw notFound('Product not found.');
  const data = readProduct(req.body);
  db.prepare(
    `UPDATE products SET name = ?, category = ?, price_cents = ?, description = ?, image = ?, popular = ?, rating = ?,
       available = ?, updated_at = ? WHERE id = ?`
  ).run(data.name, data.category, data.price_cents, data.description, data.image, data.popular, data.rating,
    data.available, nowIso(), existing.id);
  res.json({ product: toProductJson(db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id)) });
});

catalogRouter.delete('/products/:id', requireAuth, requireAdmin, (req, res) => {
  const { changes } = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (!changes) throw notFound('Product not found.');
  res.json({ ok: true });
});

/** Restores the original 30-product catalog. Past orders keep their own copy of names and prices. */
catalogRouter.post('/products/reset', requireAuth, requireAdmin, (_req, res) => {
  transaction(() => {
    db.exec('DELETE FROM products');
    seedProducts();
  });
  const rows = db.prepare('SELECT * FROM products ORDER BY sort_order').all();
  res.json({ products: rows.map(toProductJson) });
});
