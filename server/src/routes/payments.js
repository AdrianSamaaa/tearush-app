import { config } from '../config.js';
import { db, nowIso } from '../db.js';
import { getOrderRow, markPaid } from '../orders.js';
import { paidPaymentOf, verifyWebhookSignature } from '../paymongo.js';

/**
 * POST /api/webhooks/paymongo — PayMongo calls this when a payment succeeds.
 * Mounted with express.raw() because the signature covers the exact raw body.
 */
export function paymongoWebhook(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!config.paymongo.webhookSecret) {
    console.warn('[webhook] PAYMONGO_WEBHOOK_SECRET is not set — ignoring webhook.');
    return res.status(503).json({ error: 'Webhook secret not configured' });
  }
  if (!verifyWebhookSignature(raw, req.get('paymongo-signature'), config.paymongo.webhookSecret)) {
    console.warn('[webhook] Rejected webhook with an invalid signature.');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(raw).data;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  const type = event?.attributes?.type;
  const eventId = event?.id;
  if (eventId && db.prepare('SELECT 1 FROM webhook_events WHERE id = ?').get(eventId)) {
    return res.json({ received: true, duplicate: true });
  }

  const resource = event?.attributes?.data;
  let order = null;
  if (type === 'checkout_session.payment.paid') {
    order =
      db.prepare('SELECT * FROM orders WHERE paymongo_checkout_id = ?').get(resource?.id) ??
      getOrderRow(resource?.attributes?.metadata?.order_id ?? 0);
    if (order) markPaid(order, paidPaymentOf(resource) ?? resource?.attributes?.payments?.[0]);
  } else if (type === 'payment.paid') {
    const intentId = resource?.attributes?.payment_intent_id;
    order = intentId ? db.prepare('SELECT * FROM orders WHERE paymongo_intent_id = ?').get(intentId) : null;
    if (order) markPaid(order, resource);
  }
  console.log(`[webhook] ${type} ${eventId ?? ''}${order ? ` -> ${order.order_number}` : ' (no matching order)'}`);

  if (eventId) {
    db.prepare('INSERT OR IGNORE INTO webhook_events (id, type, received_at) VALUES (?, ?, ?)').run(eventId, type ?? '', nowIso());
  }
  res.json({ received: true });
}

/**
 * GET /payments/return — PayMongo sends the customer's browser here after paying
 * (or cancelling). The page bounces straight back into the app via its deep link.
 */
export function paymentReturnPage(req, res) {
  const orderId = /^\d+$/.test(String(req.query.order)) ? String(req.query.order) : '';
  const result = req.query.result === 'success' ? 'success' : 'cancel';
  const query = `order=${orderId}&result=${result}`;
  const deepLink = `${config.appScheme}://payment?${query}`;
  const intentLink = `intent://payment?${query}#Intent;scheme=${config.appScheme};package=${config.appPackage};end`;
  const success = result === 'success';

  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TeaRush — ${success ? 'Payment received' : 'Payment cancelled'}</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #FBF3E6;
         font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #3C2415; }
  .card { margin: 24px; padding: 32px 28px; max-width: 360px; text-align: center; background: #FFFDF9;
          border: 1px solid #E7D7BE; border-radius: 20px; box-shadow: 0 6px 16px rgba(60,36,21,.08); }
  .icon { font-size: 48px; }
  h1 { font-size: 1.3rem; margin: 12px 0 6px; }
  p { color: #79654e; font-size: .92rem; line-height: 1.45; margin: 0 0 22px; }
  a { display: block; padding: 14px; border-radius: 999px; background: #5B3A29; color: #fff;
      text-decoration: none; font-weight: 700; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '🧋' : '↩️'}</div>
    <h1>${success ? 'Payment received!' : 'Payment cancelled'}</h1>
    <p>${success ? 'Thank you! Your order is now being sent to the shop.' : 'No charge was made. You can try paying again from your order in the app.'}</p>
    <a id="back" href="${deepLink}">Return to TeaRush</a>
  </div>
  <script>
    var link = /Android/i.test(navigator.userAgent) ? ${JSON.stringify(intentLink)} : ${JSON.stringify(deepLink)};
    document.getElementById('back').href = link;
    setTimeout(function () { window.location.replace(link); }, 300);
  </script>
</body>
</html>`);
}
