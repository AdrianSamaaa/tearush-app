/** Order persistence, status workflow and payment syncing shared by the routes and the webhook. */
import { db, nowIso, transaction } from './db.js';
import { badRequest, notFound } from './errors.js';
import { methodLabel, paidPaymentOf, retrieveCheckoutSession, expireCheckoutSession } from './paymongo.js';

export const STATUS_LABELS = {
  awaiting_payment: 'Awaiting payment',
  pending: 'Order placed',
  preparing: 'Preparing',
  out_for_delivery: 'On the way',
  ready_for_pickup: 'Ready for pickup',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Which statuses an admin may move an order to from its current status. */
export function nextStatuses(order) {
  switch (order.status) {
    case 'awaiting_payment':
      return ['cancelled'];
    case 'pending':
      return ['preparing', 'cancelled'];
    case 'preparing':
      return [order.fulfillment === 'pickup' ? 'ready_for_pickup' : 'out_for_delivery', 'cancelled'];
    case 'out_for_delivery':
    case 'ready_for_pickup':
      return ['completed'];
    default:
      return [];
  }
}

const insertEvent = db.prepare('INSERT INTO order_events (order_id, status, note, created_at) VALUES (?, ?, ?, ?)');
export const addEvent = (orderId, status, note = '') => insertEvent.run(orderId, status, note, nowIso());

const selectOrder = db.prepare('SELECT * FROM orders WHERE id = ?');
const selectItems = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id');
const selectEvents = db.prepare('SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id');
const selectUser = db.prepare('SELECT id, name, email, phone FROM users WHERE id = ?');

export const getOrderRow = (id) => selectOrder.get(Number(id));

export function toOrderJson(order, { includeCustomer = false } = {}) {
  const items = selectItems.all(order.id).map((row) => {
    const toppings = JSON.parse(row.toppings_json);
    return {
      productId: row.product_id,
      name: row.name,
      image: row.image,
      size: row.size,
      sugar: row.sugar,
      ice: row.ice,
      toppings: toppings.map((t) => t.name),
      toppingIds: toppings.map((t) => t.id),
      options: JSON.parse(row.options_json),
      unitPrice: row.unit_price_cents / 100,
      quantity: row.quantity,
    };
  });
  const json = {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    statusLabel: STATUS_LABELS[order.status] ?? order.status,
    fulfillment: order.fulfillment,
    paymentMethod: order.payment_method,
    paymentMethodLabel:
      order.payment_method === 'cod' && order.fulfillment === 'pickup' ? 'Cash on pickup' : methodLabel(order.payment_method),
    paymentStatus: order.payment_status,
    paidVia: order.paid_via ? methodLabel(order.paid_via) : null,
    paidAt: order.paid_at,
    subtotal: order.subtotal_cents / 100,
    deliveryFee: order.delivery_fee_cents / 100,
    discount: order.discount_cents / 100,
    total: order.total_cents / 100,
    promoCode: order.promo_code,
    contactName: order.contact_name,
    contactPhone: order.contact_phone,
    address: order.address_text,
    notes: order.notes,
    cancelReason: order.cancel_reason,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    canPay: order.status === 'awaiting_payment',
    canCancel: ['awaiting_payment', 'pending'].includes(order.status) && order.payment_status !== 'paid',
    items,
    events: selectEvents.all(order.id).map((e) => ({
      status: e.status,
      label: STATUS_LABELS[e.status] ?? e.status,
      note: e.note,
      createdAt: e.created_at,
    })),
  };
  if (includeCustomer) {
    json.nextStatuses = nextStatuses(order).map((s) => ({ value: s, label: STATUS_LABELS[s] }));
    json.customer = order.user_id ? selectUser.get(order.user_id) ?? null : null;
  }
  return json;
}

/** Inserts an order and its lines from a computed quote. Returns the order row. */
export function insertOrder({ userId, quote, fulfillment, paymentMethod, contact, addressText, notes }) {
  return transaction(() => {
    const now = nowIso();
    const isOnline = paymentMethod !== 'cod';
    const status = isOnline ? 'awaiting_payment' : 'pending';
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO orders (user_id, status, fulfillment, payment_method, payment_status, subtotal_cents,
           delivery_fee_cents, discount_cents, total_cents, promo_code, contact_name, contact_phone, contact_email,
           address_text, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        status,
        fulfillment,
        paymentMethod,
        quote.subtotalCents,
        quote.deliveryFeeCents,
        quote.discountCents,
        quote.totalCents,
        quote.promo?.code ?? null,
        contact.name,
        contact.phone,
        contact.email ?? '',
        addressText,
        notes,
        now,
        now
      );
    const orderId = Number(lastInsertRowid);
    db.prepare('UPDATE orders SET order_number = ? WHERE id = ?').run(`TR-${10000 + orderId}`, orderId);

    const insertItem = db.prepare(
      `INSERT INTO order_items (order_id, product_id, name, image, size, sugar, ice, toppings_json, options_json,
         unit_price_cents, quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const item of quote.items) {
      insertItem.run(
        orderId,
        item.productId,
        item.name,
        item.image,
        item.size,
        item.sugar,
        item.ice,
        JSON.stringify(item.toppingIds.map((id, i) => ({ id, name: item.toppings[i] }))),
        JSON.stringify(item.options),
        item.unitPriceCents,
        item.quantity
      );
    }
    addEvent(orderId, status, isOnline ? `Waiting for ${methodLabel(paymentMethod)} payment` : 'Pay with cash on delivery');
    return getOrderRow(orderId);
  });
}

export function setStatus(order, status, note = '', extra = {}) {
  const columns = { status, updated_at: nowIso(), ...extra };
  const keys = Object.keys(columns);
  db.prepare(`UPDATE orders SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
    ...keys.map((k) => columns[k]),
    order.id
  );
  addEvent(order.id, status, note);
  return getOrderRow(order.id);
}

/** Marks an order as paid (idempotent). `payment` is a PayMongo payment resource. */
export function markPaid(order, payment) {
  if (order.payment_status === 'paid') return order;
  const via = payment?.attributes?.source?.type ?? order.payment_method;
  const paidAt = payment?.attributes?.paid_at ? new Date(payment.attributes.paid_at * 1000).toISOString() : nowIso();
  const status = order.status === 'awaiting_payment' || order.status === 'cancelled' ? 'pending' : order.status;
  console.log(`[orders] ${order.order_number} paid via ${via}`);
  return setStatus(order, status, `Paid via ${methodLabel(via)}`, {
    payment_status: 'paid',
    paymongo_payment_id: payment?.id ?? null,
    paid_via: via,
    paid_at: paidAt,
    cancel_reason: null,
  });
}

/**
 * Asks PayMongo whether an unpaid online order's checkout was completed.
 * Lets payments confirm even when the webhook can't reach this server (e.g. local dev).
 */
export async function syncPayment(order) {
  if (order.payment_status === 'paid' || !order.paymongo_checkout_id) return order;
  if (!['awaiting_payment', 'cancelled'].includes(order.status)) return order;
  try {
    const session = await retrieveCheckoutSession(order.paymongo_checkout_id);
    const payment = paidPaymentOf(session);
    if (payment) return markPaid(getOrderRow(order.id), payment);
  } catch (err) {
    console.warn(`[orders] Could not sync payment for ${order.order_number}: ${err.message}`);
  }
  return getOrderRow(order.id);
}

export async function cancelOrder(order, reason) {
  if (order.status === 'cancelled') return order;
  if (order.paymongo_checkout_id && order.payment_status !== 'paid') {
    // Make sure the customer can't pay for an order we just cancelled.
    const synced = await syncPayment(order);
    if (synced.payment_status === 'paid') {
      throw badRequest('This order was just paid, so it can no longer be cancelled here. Please contact the shop.');
    }
    await expireCheckoutSession(order.paymongo_checkout_id).catch((err) =>
      console.warn(`[orders] Could not expire checkout for ${order.order_number}: ${err.message}`)
    );
  }
  return setStatus(getOrderRow(order.id), 'cancelled', reason, { cancel_reason: reason });
}

export function findOwnOrder(id, user) {
  const order = getOrderRow(id);
  if (!order || (order.user_id !== user.id && user.role !== 'admin')) throw notFound('Order not found.');
  return order;
}
