/**
 * Server-side pricing. The app shows the same numbers, but the server always
 * recomputes every price from the database so a modified client can't
 * change what the customer is charged.
 */
import { config } from './config.js';
import { db } from './db.js';
import { badRequest } from './errors.js';

export const SIZE_SURCHARGE_CENTS = { Small: -1000, Medium: 0, Large: 1500 };
export const SUGAR_LEVELS = ['0%', '25%', '50%', '75%', '100%'];
export const ICE_LEVELS = ['No Ice', 'Less Ice', 'Normal Ice', 'Extra Ice'];
export const TOPPINGS = {
  pearls: { name: 'Brown Sugar Pearls', cents: 2000 },
  pudding: { name: 'Egg Pudding', cents: 2000 },
  nata: { name: 'Nata de Coco', cents: 1500 },
  cheese: { name: 'Cheese Foam', cents: 3000 },
  'grass-jelly': { name: 'Grass Jelly', cents: 1500 },
};
export const CUSTOM_DRINK = {
  id: 'custom-drink',
  baseCents: 8900,
  image: 'assets/products/custom-drink.jpg',
  teaBases: ['Black Tea', 'Green Tea', 'Oolong Tea', 'Jasmine Tea'],
  milks: ['Fresh Milk', 'Oat Milk', 'Condensed Milk', 'None'],
};
export const DELIVERY_FEE_CENTS = 4900;

const MAX_LINES = 30;
const MAX_QUANTITY = 50;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const peso = (cents) =>
  `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');
const getPromo = db.prepare('SELECT * FROM promos WHERE code = ?');
const countCompletedOrders = db.prepare(
  `SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status NOT IN ('cancelled', 'awaiting_payment')`
);

function pick(value, allowed, label) {
  if (!allowed.includes(value)) throw badRequest(`${label}: please choose one of ${allowed.join(', ')}.`);
  return value;
}

/** Validates cart lines and prices them from the database. */
export function priceItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw badRequest('Your cart is empty.');
  if (rawItems.length > MAX_LINES) throw badRequest(`An order can have at most ${MAX_LINES} lines.`);

  return rawItems.map((raw, index) => {
    const label = `Item ${index + 1}`;
    const quantity = Number(raw?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw badRequest(`${label}: quantity must be between 1 and ${MAX_QUANTITY}.`);
    }
    const size = pick(raw.size, Object.keys(SIZE_SURCHARGE_CENTS), `${label} size`);
    const sugar = pick(raw.sugar, SUGAR_LEVELS, `${label} sugar level`);
    const ice = pick(raw.ice, ICE_LEVELS, `${label} ice level`);

    const toppingIds = [...new Set(Array.isArray(raw.toppingIds) ? raw.toppingIds : [])];
    for (const id of toppingIds) {
      if (!Object.hasOwn(TOPPINGS, id)) throw badRequest(`${label}: unknown add-on "${id}".`);
    }
    const toppingsCents = toppingIds.reduce((sum, id) => sum + TOPPINGS[id].cents, 0);

    let productId, name, image, baseCents;
    let options = {};
    if (raw.productId === CUSTOM_DRINK.id) {
      const teaBase = pick(raw.options?.teaBase, CUSTOM_DRINK.teaBases, `${label} tea base`);
      const milk = pick(raw.options?.milk, CUSTOM_DRINK.milks, `${label} milk`);
      productId = CUSTOM_DRINK.id;
      name = `Custom ${teaBase}`;
      image = CUSTOM_DRINK.image;
      baseCents = CUSTOM_DRINK.baseCents;
      options = { teaBase, milk };
    } else {
      const product = getProduct.get(String(raw.productId ?? ''));
      if (!product) throw badRequest(`${label}: this drink is no longer on the menu.`);
      if (!product.available) throw badRequest(`${product.name} is currently unavailable.`);
      productId = product.id;
      name = product.name;
      image = product.image;
      baseCents = product.price_cents;
    }

    return {
      productId,
      name,
      image,
      size,
      sugar,
      ice,
      toppingIds,
      toppings: toppingIds.map((id) => TOPPINGS[id].name),
      options,
      unitPriceCents: Math.max(0, baseCents + SIZE_SURCHARGE_CENTS[size] + toppingsCents),
      quantity,
    };
  });
}

const manilaDate = (date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

const manilaWeekday = (date) =>
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, weekday: 'short' }).format(date)
  );

/** Returns the discount (centavos) a promo gives, or throws a friendly error explaining why it doesn't apply. */
function evaluatePromo(promo, { items, subtotalCents, deliveryFeeCents, fulfillment, userId, now }) {
  if (!promo || !promo.active) throw badRequest('That promo code is not valid.');
  const code = promo.code;
  if (promo.valid_until && manilaDate(now) > promo.valid_until) throw badRequest(`${code} has expired.`);
  if (promo.weekday !== null && manilaWeekday(now) !== promo.weekday) {
    throw badRequest(`${code} is only valid on ${WEEKDAYS[promo.weekday]}s.`);
  }
  if (subtotalCents < promo.min_subtotal_cents) {
    throw badRequest(`${code} needs a minimum order of ${peso(promo.min_subtotal_cents)} (add ${peso(promo.min_subtotal_cents - subtotalCents)} more).`);
  }
  if (promo.first_order_only && userId && countCompletedOrders.get(userId).n > 0) {
    throw badRequest(`${code} is only valid on your first order.`);
  }

  switch (promo.kind) {
    case 'percent':
      return Math.round((subtotalCents * promo.percent) / 100);
    case 'free_delivery':
      if (fulfillment !== 'delivery') throw badRequest(`${code} only applies to delivery orders.`);
      return deliveryFeeCents;
    case 'bogo': {
      // Every second matching cup is free (the cheaper one of each pair).
      const unitPrices = items
        .filter((item) => item.productId === promo.product_id)
        .flatMap((item) => Array(item.quantity).fill(item.unitPriceCents))
        .sort((a, b) => b - a);
      const free = unitPrices.filter((_, i) => i % 2 === 1).reduce((sum, cents) => sum + cents, 0);
      if (!free) {
        const product = getProduct.get(promo.product_id);
        throw badRequest(`Add 2 × ${product?.name ?? 'eligible drink'} to your cart to use ${code}.`);
      }
      return free;
    }
    default:
      throw badRequest('That promo code is not valid.');
  }
}

/**
 * Prices a cart. With `strictPromo` an inapplicable promo code throws;
 * otherwise the reason is returned as `promoError` so the app can show it.
 */
export function computeQuote({ items: rawItems, fulfillment, promoCode, userId, strictPromo = false }) {
  if (!['delivery', 'pickup'].includes(fulfillment)) throw badRequest('Choose delivery or pickup.');

  const items = priceItems(rawItems);
  const subtotalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const deliveryFeeCents = fulfillment === 'delivery' ? DELIVERY_FEE_CENTS : 0;

  let discountCents = 0;
  let promo = null;
  let promoError = null;
  const code = typeof promoCode === 'string' ? promoCode.trim() : '';
  if (code) {
    const row = getPromo.get(code);
    try {
      discountCents = evaluatePromo(row, { items, subtotalCents, deliveryFeeCents, fulfillment, userId, now: new Date() });
      promo = { code: row.code, title: row.title };
    } catch (err) {
      if (strictPromo) throw err;
      promoError = err.message;
    }
  }
  discountCents = Math.min(discountCents, subtotalCents + deliveryFeeCents);

  return {
    items,
    subtotalCents,
    deliveryFeeCents,
    discountCents,
    totalCents: subtotalCents + deliveryFeeCents - discountCents,
    promo,
    promoError,
  };
}

/** Public list of promos that are active and not yet expired. */
export function activePromos() {
  const today = manilaDate(new Date());
  return db
    .prepare('SELECT * FROM promos WHERE active = 1 AND (valid_until IS NULL OR valid_until >= ?) ORDER BY sort_order')
    .all(today)
    .map((p) => {
      const until = p.valid_until
        ? new Date(`${p.valid_until}T00:00:00+08:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: config.timezone })
        : null;
      const expiry =
        p.weekday !== null
          ? `Every ${WEEKDAYS[p.weekday]}${until ? ` · until ${until}` : ''}`
          : until
            ? `Valid until ${until}`
            : 'No expiry';
      return {
        code: p.code,
        title: p.title,
        description: p.description,
        expiry,
        accent: p.accent,
        validUntil: p.valid_until,
      };
    });
}
