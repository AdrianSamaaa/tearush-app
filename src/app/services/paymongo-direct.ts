import { Capacitor, CapacitorHttp } from '@capacitor/core';

/**
 * Calls the PayMongo API straight from the Android app (on-device mode only).
 * Uses Capacitor's native HTTP because PayMongo blocks browser (CORS) requests.
 * Same requests as server/src/paymongo.js.
 */
const API = 'https://api.paymongo.com/v1';

export class PaymongoDirectError extends Error {}

export interface CheckoutLine {
  name: string;
  amount: number; // centavos
  quantity: number;
  description?: string;
}

async function request<T = any>(secretKey: string, method: string, path: string, attributes?: object): Promise<T> {
  if (!Capacitor.isNativePlatform()) {
    throw new PaymongoDirectError(
      'Online payments without the TeaRush server only work in the Android app (browsers block direct PayMongo calls).'
    );
  }
  let res;
  try {
    res = await CapacitorHttp.request({
      url: `${API}${path}`,
      method,
      headers: {
        Authorization: `Basic ${btoa(`${secretKey}:`)}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      data: attributes ? { data: { attributes } } : undefined,
      connectTimeout: 20_000,
      readTimeout: 20_000,
    });
  } catch {
    throw new PaymongoDirectError("Couldn't reach PayMongo. Check your internet connection and try again.");
  }
  const body = typeof res.data === 'string' ? safeJson(res.data) : res.data;
  if (res.status >= 400) {
    const detail = Array.isArray(body?.errors) ? body.errors.map((e: { detail?: string }) => e.detail).filter(Boolean).join(' ') : '';
    if (res.status === 401) throw new PaymongoDirectError('PayMongo rejected the secret key. Check it in Shop Settings.');
    throw new PaymongoDirectError(`PayMongo error: ${detail || `HTTP ${res.status}`}`);
  }
  return body.data as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export interface CheckoutSessionInput {
  lines: CheckoutLine[];
  method: string;
  description: string;
  reference: string;
  orderId: number;
  billing: { name: string; email?: string; phone?: string };
}

export async function createCheckoutSession(secretKey: string, input: CheckoutSessionInput) {
  const attributes = {
    line_items: input.lines.map((l) => ({ currency: 'PHP', ...l })),
    payment_method_types: [input.method],
    description: input.description,
    reference_number: input.reference,
    send_email_receipt: Boolean(input.billing.email),
    show_description: true,
    show_line_items: true,
    billing: {
      name: input.billing.name,
      ...(input.billing.email ? { email: input.billing.email } : {}),
      ...(input.billing.phone ? { phone: input.billing.phone } : {}),
    },
    metadata: { order_id: String(input.orderId), order_number: input.reference },
  };
  // Send the customer back into the app after paying. If PayMongo won't accept an app link,
  // create the session without it — the app re-checks the payment when the browser closes.
  const withReturn = {
    ...attributes,
    success_url: `tearush://payment?order=${input.orderId}&result=success`,
    cancel_url: `tearush://payment?order=${input.orderId}&result=cancel`,
  };
  let session: any;
  try {
    session = await request(secretKey, 'POST', '/checkout_sessions', withReturn);
  } catch (err) {
    if (err instanceof PaymongoDirectError && /url/i.test(err.message)) {
      session = await request(secretKey, 'POST', '/checkout_sessions', attributes);
    } else {
      throw err;
    }
  }
  return {
    id: session.id as string,
    checkoutUrl: session.attributes.checkout_url as string,
    paymentIntentId: (session.attributes.payment_intent?.id ?? null) as string | null,
  };
}

export const retrieveCheckoutSession = (secretKey: string, id: string) =>
  request(secretKey, 'GET', `/checkout_sessions/${encodeURIComponent(id)}`);

export const expireCheckoutSession = (secretKey: string, id: string) =>
  request(secretKey, 'POST', `/checkout_sessions/${encodeURIComponent(id)}/expire`);

export const createRefund = (secretKey: string, paymentId: string, amount: number, notes: string) =>
  request<{ id: string }>(secretKey, 'POST', '/refunds', {
    amount,
    payment_id: paymentId,
    reason: 'requested_by_customer',
    notes: notes.slice(0, 255),
  });

/** The paid payment inside a checkout session, if any. */
export function paidPaymentOf(session: any): any | null {
  const payments: any[] = session?.attributes?.payments ?? [];
  return payments.find((p) => p?.attributes?.status === 'paid') ?? null;
}
