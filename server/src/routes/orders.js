import { Router } from 'express';
import { config, paymentsEnabled } from '../config.js';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { ApiError, badRequest, notFound, optionalPhone, optionalString, requireString } from '../errors.js';
import { computeQuote } from '../pricing.js';
import { createCheckoutSession, retrieveCheckoutSession } from '../paymongo.js';
import { cancelOrder, findOwnOrder, getOrderRow, insertOrder, setStatus, syncPayment, toOrderJson } from '../orders.js';
import { formatAddress, getOwnAddress } from './addresses.js';

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

const MIN_ONLINE_PAYMENT_CENTS = 2000; // PayMongo's minimum charge is ₱20

function quoteJson(quote) {
  return {
    items: quote.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      size: item.size,
      quantity: item.quantity,
      unitPrice: item.unitPriceCents / 100,
      lineTotal: (item.unitPriceCents * item.quantity) / 100,
    })),
    subtotal: quote.subtotalCents / 100,
    deliveryFee: quote.deliveryFeeCents / 100,
    discount: quote.discountCents / 100,
    total: quote.totalCents / 100,
    promo: quote.promo,
    promoError: quote.promoError,
  };
}

async function startCheckout(order) {
  const session = await createCheckoutSession(order, orderItemsForCheckout(order.id));
  db.prepare(
    'UPDATE orders SET paymongo_checkout_id = ?, paymongo_checkout_url = ?, paymongo_intent_id = ?, updated_at = ? WHERE id = ?'
  ).run(session.id, session.checkoutUrl, session.paymentIntentId, new Date().toISOString(), order.id);
  return session.checkoutUrl;
}

function orderItemsForCheckout(orderId) {
  return db
    .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id')
    .all(orderId)
    .map((row) => ({
      name: row.name,
      size: row.size,
      sugar: row.sugar,
      ice: row.ice,
      toppings: JSON.parse(row.toppings_json).map((t) => t.name),
      options: JSON.parse(row.options_json),
      unitPriceCents: row.unit_price_cents,
      quantity: row.quantity,
    }));
}

/** Prices the cart (with promo) without creating an order — used by the checkout screen. */
ordersRouter.post('/quote', (req, res) => {
  const quote = computeQuote({
    items: req.body.items,
    fulfillment: req.body.fulfillment || 'delivery',
    promoCode: req.body.promoCode,
    userId: req.user.id,
  });
  res.json({ quote: quoteJson(quote) });
});

ordersRouter.post('/', async (req, res) => {
  if (!req.user.email_verified) {
    throw new ApiError(403, 'Please verify your email address before placing an order.');
  }
  const fulfillment = req.body.fulfillment;
  const paymentMethod = String(req.body.paymentMethod || '');
  const isOnline = paymentMethod !== 'cod';
  if (isOnline) {
    if (!paymentsEnabled()) throw badRequest('Online payments are not available right now. Please choose Cash on Delivery.');
    if (!config.paymongo.methods.includes(paymentMethod)) throw badRequest('Please choose a valid payment method.');
  }

  const quote = computeQuote({
    items: req.body.items,
    fulfillment,
    promoCode: req.body.promoCode,
    userId: req.user.id,
    strictPromo: true,
  });
  if (isOnline && quote.totalCents < MIN_ONLINE_PAYMENT_CENTS) {
    throw badRequest('Online payments need a total of at least ₱20. Please choose cash instead.');
  }

  let contact;
  let addressText = '';
  if (fulfillment === 'delivery') {
    const address = getOwnAddress(req.body.addressId, req.user.id);
    if (!address) throw badRequest('Please choose a delivery address.');
    contact = { name: address.recipient, phone: address.phone };
    addressText = formatAddress(address) + (address.notes ? ` (${address.notes})` : '');
  } else {
    contact = {
      name: requireString(req.body.contactName ?? req.user.name, 'Contact name', { max: 80 }),
      phone: optionalPhone(req.body.contactPhone || req.user.phone, 'Contact number'),
    };
  }
  contact.email = req.user.email;

  let order = insertOrder({
    userId: req.user.id,
    quote,
    fulfillment,
    paymentMethod,
    contact,
    addressText,
    notes: optionalString(req.body.notes, 'Notes', 300),
  });

  let checkoutUrl = null;
  if (isOnline) {
    try {
      checkoutUrl = await startCheckout(order);
    } catch (err) {
      setStatus(order, 'cancelled', 'Payment could not be started', { cancel_reason: 'Payment could not be started' });
      throw err;
    }
    order = getOrderRow(order.id);
  }
  res.status(201).json({ order: toOrderJson(order), checkoutUrl });
});

ordersRouter.get('/', async (req, res) => {
  const rows = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id);
  // Refresh a few recent unpaid online orders so the list reflects payments made a moment ago.
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const toSync = rows
    .filter((o) => o.status === 'awaiting_payment' && o.paymongo_checkout_id && Date.parse(o.created_at) > dayAgo)
    .slice(0, 3);
  const synced = new Map((await Promise.all(toSync.map(syncPayment))).map((o) => [o.id, o]));
  res.json({ orders: rows.map((o) => toOrderJson(synced.get(o.id) ?? o)) });
});

ordersRouter.get('/:id', async (req, res) => {
  const order = await syncPayment(findOwnOrder(req.params.id, req.user));
  res.json({ order: toOrderJson(order) });
});

/** Returns a PayMongo checkout link for an unpaid order (reusing the open one when possible). */
ordersRouter.post('/:id/pay', async (req, res) => {
  let order = await syncPayment(findOwnOrder(req.params.id, req.user));
  if (order.payment_status === 'paid') return res.json({ order: toOrderJson(order), checkoutUrl: null });
  if (order.status !== 'awaiting_payment') throw badRequest('This order can no longer be paid online.');

  let checkoutUrl = null;
  if (order.paymongo_checkout_id) {
    const session = await retrieveCheckoutSession(order.paymongo_checkout_id).catch(() => null);
    if (session?.attributes?.status === 'active') checkoutUrl = session.attributes.checkout_url;
  }
  if (!checkoutUrl) checkoutUrl = await startCheckout(order);
  order = getOrderRow(order.id);
  res.json({ order: toOrderJson(order), checkoutUrl });
});

ordersRouter.post('/:id/cancel', async (req, res) => {
  const order = findOwnOrder(req.params.id, req.user);
  if (order.user_id !== req.user.id) throw notFound('Order not found.');
  if (!toOrderJson(order).canCancel) {
    throw badRequest('This order is already being prepared, so it can no longer be cancelled. Please contact the shop.');
  }
  const cancelled = await cancelOrder(order, 'Cancelled by customer');
  res.json({ order: toOrderJson(cancelled) });
});
