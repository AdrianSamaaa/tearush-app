/**
 * Registers this server's webhook endpoint with PayMongo and prints the
 * webhook secret to put in PAYMONGO_WEBHOOK_SECRET.
 *
 *   npm run webhook:register                      # uses PUBLIC_URL from .env
 *   npm run webhook:register -- https://my.host   # or pass the public URL
 */
import { config } from '../src/config.js';
import { createWebhook } from '../src/paymongo.js';

const base = (process.argv[2] || config.publicUrl).replace(/\/+$/, '');
if (!/^https:\/\//.test(base)) {
  console.error(`PayMongo needs a public HTTPS URL, got "${base}". Deploy the server first (or use a tunnel such as ngrok).`);
  process.exit(1);
}

const url = `${base}/api/webhooks/paymongo`;
try {
  const webhook = await createWebhook(url, ['checkout_session.payment.paid', 'payment.paid']);
  console.log(`Webhook created: ${webhook.id} -> ${url}`);
  console.log('\nAdd this to the server environment:\n');
  console.log(`PAYMONGO_WEBHOOK_SECRET=${webhook.attributes.secret_key}\n`);
} catch (err) {
  console.error(`Could not create the webhook: ${err.message}`);
  process.exit(1);
}
