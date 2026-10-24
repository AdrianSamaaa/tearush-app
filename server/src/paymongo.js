/**
 * Minimal PayMongo client (https://docs.paymongo.com).
 * Uses Checkout Sessions: PayMongo hosts the payment page for GCash, Maya,
 * cards, GrabPay, etc., so card data never touches the app or this server.
 */
import crypto from 'node:crypto';
import { config } from './config.js';
import { ApiError } from './errors.js';

export class PaymongoError extends ApiError {
  constructor(message, upstreamStatus) {
    super(502, message);
    this.upstreamStatus = upstreamStatus;
  }
}

async function request(method, path, attributes) {
  if (!config.paymongo.secretKey) {
    throw new ApiError(503, 'Online payments are not set up on the server yet. Please choose Cash on Delivery.');
  }
  let res;
  try {
    res = await fetch(`${config.paymongo.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.paymongo.secretKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: attributes ? JSON.stringify({ data: { attributes } }) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new PaymongoError(`Could not reach PayMongo (${err.name === 'TimeoutError' ? 'timed out' : err.message}).`);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(json.errors) ? json.errors.map((e) => e.detail).filter(Boolean).join(' ') : '';
    console.error(`[paymongo] ${method} ${path} -> ${res.status}`, detail || json);
    throw new PaymongoError(`PayMongo error: ${detail || res.statusText}`, res.status);
  }
  return json.data;
}

const METHOD_LABELS = {
  gcash: 'GCash',
  paymaya: 'Maya',
  card: 'Credit/Debit Card',
  grab_pay: 'GrabPay',
  qrph: 'QR Ph',
  shopee_pay: 'ShopeePay',
  billease: 'BillEase',
  dob: 'Online Banking',
};
export const methodLabel = (method) => (method === 'cod' ? 'Cash on Delivery' : METHOD_LABELS[method] ?? method);

function describeItem(item) {
  const extras = [item.size, `${item.sugar} sugar`, item.ice, ...item.toppings];
  if (item.options?.milk && item.options.milk !== 'None') extras.push(item.options.milk);
  return extras.join(', ').slice(0, 255);
}

/**
 * Line items shown on the PayMongo page. PayMongo has no discount line, so
 * when a promo applies we send one line for the whole (discounted) total.
 */
function buildLineItems(order, items) {
  if (order.discount_cents > 0) {
    const summary = items.map((i) => `${i.quantity}× ${i.name}`).join(', ');
    return [
      {
        currency: 'PHP',
        amount: order.total_cents,
        quantity: 1,
        name: `TeaRush order ${order.order_number}`,
        description: `${summary} (promo ${order.promo_code} applied)`.slice(0, 255),
      },
    ];
  }
  const lines = items.map((item) => ({
    currency: 'PHP',
    amount: item.unitPriceCents,
    quantity: item.quantity,
    name: item.name,
    description: describeItem(item),
  }));
  if (order.delivery_fee_cents > 0) {
    lines.push({ currency: 'PHP', amount: order.delivery_fee_cents, quantity: 1, name: 'Delivery fee' });
  }
  return lines;
}

export function returnUrl(orderId, result) {
  return `${config.publicUrl}/payments/return?order=${orderId}&result=${result}`;
}

export async function createCheckoutSession(order, items) {
  const session = await request('POST', '/checkout_sessions', {
    line_items: buildLineItems(order, items),
    payment_method_types: [order.payment_method],
    description: `TeaRush order ${order.order_number}`,
    reference_number: order.order_number,
    success_url: returnUrl(order.id, 'success'),
    cancel_url: returnUrl(order.id, 'cancel'),
    send_email_receipt: Boolean(order.contact_email),
    show_description: true,
    show_line_items: true,
    billing: {
      name: order.contact_name,
      ...(order.contact_phone ? { phone: order.contact_phone } : {}),
      ...(order.contact_email ? { email: order.contact_email } : {}),
    },
    metadata: { order_id: String(order.id), order_number: order.order_number },
  });
  return {
    id: session.id,
    checkoutUrl: session.attributes.checkout_url,
    paymentIntentId: session.attributes.payment_intent?.id ?? null,
  };
}

export const retrieveCheckoutSession = (id) => request('GET', `/checkout_sessions/${encodeURIComponent(id)}`);

export const expireCheckoutSession = (id) => request('POST', `/checkout_sessions/${encodeURIComponent(id)}/expire`);

/** Returns the paid payment of a checkout session resource, if any. */
export function paidPaymentOf(session) {
  const payments = session?.attributes?.payments ?? [];
  return payments.find((p) => p?.attributes?.status === 'paid') ?? null;
}

export async function createRefund({ paymentId, amountCents, notes }) {
  return request('POST', '/refunds', {
    amount: amountCents,
    payment_id: paymentId,
    reason: 'requested_by_customer',
    notes: notes?.slice(0, 255),
  });
}

export async function createWebhook(url, events) {
  return request('POST', '/webhooks', { url, events });
}

/**
 * Verifies the `Paymongo-Signature` header: `t=<unix>,te=<test sig>,li=<live sig>`
 * where each signature is HMAC-SHA256(webhookSecret, `${t}.${rawBody}`) in hex.
 */
export function verifyWebhookSignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    String(header)
      .split(',')
      .map((pair) => pair.split('=').map((s) => s.trim()))
      .filter(([k, v]) => k && v)
  );
  if (!parts.t) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  return [parts.te, parts.li].some(
    (sig) => sig && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  );
}
